import dotenv from 'dotenv';
dotenv.config({ path: join(import.meta.dirname, '..', '..', '.env') });
import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createServer } from 'http';
import rateLimit from 'express-rate-limit';
import { initializeDatabase } from './db.js';
import authRoutes from './routes/authRoutes.js';
import tournamentRoutes from './routes/tournamentRoutes.js';
import matchRoutes from './routes/matchRoutes.js';
import adminRoutes from './routes/adminRoutes.js';
import imageRoutes from './routes/imageRoutes.js';
import { initializeSocket } from './socket/index.js';
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
initializeDatabase();
// ─── Rate Limiters ───
const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
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
app.use(cors());
app.use(express.json({ limit: '10mb' }));
const clientDist = join(__dirname, '..', 'client', 'dist');
app.use(express.static(clientDist));
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
app.use('/api/images', imageRoutes);
// Serve static files from client/public (for uploaded images)
app.use(express.static(join(__dirname, '..', 'client', 'public')));
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});
// ─── Global Error Handler ───
app.use((err, req, res, next) => {
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
// ─── SPA Fallback ───
app.use((req, res) => {
    if (req.path.startsWith('/api')) {
        res.status(404).json({ error: 'Not found' });
    }
    else {
        res.sendFile(join(clientDist, 'index.html'));
    }
});
const server = createServer(app);
initializeSocket(server);
server.listen(PORT, () => {
    console.log(`[Server] Running on http://localhost:${PORT}`);
});
export default app;
//# sourceMappingURL=index.js.map