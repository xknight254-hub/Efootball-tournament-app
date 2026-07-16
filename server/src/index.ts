import dotenv from 'dotenv';
dotenv.config({ path: join(import.meta.dirname, '..', '..', '.env') });
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createServer } from 'http';
import rateLimit from 'express-rate-limit';
import { initializeDatabase } from './db.js';
import authRoutes from './routes/authRoutes.js';
import tournamentRoutes from './routes/tournamentRoutes.js';
import matchRoutes from './routes/matchRoutes.js';
import adminRoutes from './routes/adminRoutes.js';
import whatsappAdminRoutes from './routes/whatsappAdminRoutes.js';
import redeemCodeRoutes from './routes/redeemCodeRoutes.js';
import imageRoutes from './routes/imageRoutes.js';
import { initializeSocket, getIO } from './socket/index.js';
import { startWhatsAppChannel } from './channels/whatsapp/bot.js';
import wagerRoutes from './routes/wagerRoutes.js';
import paynectaWebhookRoutes from './routes/paynectaWebhookRoutes.js';
import deepLinkRoutes from './routes/deepLinkRoutes.js';
import notificationRoutes from './routes/notificationRoutes.js';
import rankingsRoutes from './routes/rankingsRoutes.js';
import subscriptionRoutes from './routes/subscriptionRoutes.js';
import organizerRoutes from './routes/organizerRoutes.js';
import agentRoutes from './routes/agentRoutes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ─── Environment Validation ───
const missingEnvs = ['JWT_SECRET'].filter(e => !process.env[e]);
if (missingEnvs.length > 0) {
  console.warn(`[WARN] Missing env vars (using defaults): ${missingEnvs.join(', ')}`);
}
const PORT = parseInt(process.env.PORT || '3001', 10);
if (isNaN(PORT) || PORT < 1 || PORT > 65535) {
  console.error('[FATAL] Invalid PORT');
  process.exit(1);
}

const app = express();

// Trust proxy — required when behind nginx for accurate rate limiting + IP detection
app.set('trust proxy', 1);

initializeDatabase();

// ─── Rate Limiters ───
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  message: { error: 'Too many requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many authentication attempts, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(globalLimiter);
app.use(cors({
  origin: [
    process.env.CLIENT_URL || 'http://localhost:5173',
    'https://xtournament.duckdns.org',
    'http://xtournament.duckdns.org',
    'http://178.105.198.217',
    'http://178.105.198.217:3001',
    'http://178.105.198.217:3002',
    'http://178.105.198.217:5173',
  ],
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));

// Note: client/dist SPA is served by vite preview on port 3001, not here

// Request logging
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// ─── Routes ───
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/tournaments', tournamentRoutes);
app.use('/api/matches', matchRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/admin/whatsapp', whatsappAdminRoutes);
app.use('/api/images', imageRoutes);
app.use('/api/wagers', wagerRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/rankings', rankingsRoutes);
app.use('/api/redeem-codes', redeemCodeRoutes);

app.use('/api/subscriptions', subscriptionRoutes);
app.use('/api/organizer', organizerRoutes);

// ─── AI Agent API (scoped tokens + admin auth) ───
app.use('/api', agentRoutes);

// ─── Paynecta webhooks (no auth — called by Paynecta servers) ───
app.use('/api/paynecta', paynectaWebhookRoutes);

// ─── Deep links (must be BEFORE SPA fallback) ───
app.use('/t', deepLinkRoutes);

// Serve static files from client/public (for uploaded images)
app.use(express.static(join(__dirname, '..', 'client', 'public')));

// Serve uploaded verification screenshots
app.use('/screenshots', express.static(join(process.cwd(), 'server', 'client', 'public', 'screenshots')));

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ─── Global Error Handler ───
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error(`[ERROR] ${req.method} ${req.path}:`, err.message?.slice(0, 200));
  if (err.message?.includes('SQLITE')) {
    return res.status(500).json({ error: 'Database error' });
  }
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ error: 'File too large' });
  }
  if (err.message?.includes('Only image files')) {
    return res.status(400).json({ error: err.message });
  }
  res.status(500).json({ error: 'Internal server error' });
});

// ─── SPA Fallback (disabled — frontend served by vite preview) ───
app.use((req, res) => {
  if (req.path.startsWith('/api')) {
    res.status(404).json({ error: 'Not found' });
  } else if (req.path.startsWith('/tournament-images/') || req.path.startsWith('/avatars/')) {
    res.status(404).json({ error: 'File not found' });
  } else {
    // Frontend is served by vite preview on port 3001
    res.status(404).json({ error: 'Not found' });
  }
});

const server = createServer(app);
initializeSocket(server);

// WhatsApp channel — auto-starts on boot.
// The admin console can stop/start it on-demand from the WhatsApp tab.
startWhatsAppChannel(getIO()).catch((e) =>
  console.error('[WhatsApp] failed to start:', e.message)
);

// Patch import-time env vars that config.ts captured too early.
// dotenv.config() runs after static ES module imports, so any
// process.env reads at module scope (like omnirouteKey in config.ts)
// come back empty. Apply the real values here.
import { whatsappConfig as wConfig } from './channels/whatsapp/config.js';
if (process.env.OMNIROUTE_API_KEY && !wConfig.omnirouteKey) {
  (wConfig as any).omnirouteKey = process.env.OMNIROUTE_API_KEY;
}

// ─── AI Agent Engine ───────────────────────────────────────
(async () => {
  try {
    const { initEngine, startEngine } = await import('./channels/whatsapp/agents/automationEngine.js');

    // Build agent list (dynamic import — only loads agents that are available)
    const agents: any[] = [];

    async function tryLoad(name: string, path: string) {
      try {
        const mod = await import(path);
        const keys = Object.keys(mod);
        const clsName = keys.find(k => k.toLowerCase().includes(name.toLowerCase()));
        let exported = clsName ? mod[clsName] : mod.default;

        // Fallback to default export if named export not found
        if (!exported && mod.default) {
          exported = mod.default;
        }

        if (exported) {
          const token = process.env[`${name.toUpperCase()}_AGENT_TOKEN`] || 'agent-default-token';
          // Support both class constructors and plain object exports
          if (typeof exported === 'function') {
            const instance = new exported({ token });
            if (instance && typeof instance.evaluate === 'function') {
              agents.push(instance);
            }
          } else if (typeof exported === 'object' && exported !== null && typeof exported.evaluate === 'function') {
            agents.push(exported);
          }
          console.log(`[Engine] loaded agent: ${name}`);
        } else {
          console.warn(`[Engine] agent ${name}: no matching export found`);
        }
      } catch (e: any) {
        console.warn(`[Engine] agent ${name} not available: ${e.message}`);
      }
    }

    // Try to load each agent — failures don't crash the engine
    await tryLoad('TournamentOps', './channels/whatsapp/agents/tournamentOps.js');
    await tryLoad('Finance', './channels/whatsapp/agents/finance.js');
    await tryLoad('Notification', './channels/whatsapp/agents/notification.js');
    await tryLoad('Marketing', './channels/whatsapp/agents/marketing.js');
    await tryLoad('Moderator', './channels/whatsapp/agents/moderator.js');
    await tryLoad('Analytics', './channels/whatsapp/agents/analytics.js');
    await tryLoad('Coach', './channels/whatsapp/agents/coach.js');
    await tryLoad('Conversation', './channels/whatsapp/agents/conversation.js');
    await tryLoad('Support', './channels/whatsapp/agents/support.js');

    if (agents.length > 0) {
      initEngine({ enabled: true, adminToken: process.env.AGENT_ADMIN_TOKEN || '' }, agents);
      startEngine();
    } else {
      console.log('[Engine] no agents loaded — skipping');
    }
  } catch (e: any) {
    console.warn('[Engine] could not initialize:', e.message);
  }
})();

server.listen(PORT, () => {
  console.log(`[Server] Running on http://localhost:${PORT}`);
});

export default app;
