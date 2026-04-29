import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { initializeDatabase } from './db.js';
import authRoutes from './routes/authRoutes.js';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const app = express();
const PORT = process.env.PORT || 3001;
initializeDatabase();
app.use(cors());
app.use(express.json({ limit: '10mb' }));
const clientDist = join(__dirname, '..', 'client', 'dist');
app.use(express.static(clientDist));
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
    next();
});
app.use('/api/auth', authRoutes);
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});
app.use((err, req, res, next) => {
    console.error(`[ERROR] ${err.message}`);
    res.status(500).json({ error: 'Internal server error' });
});
app.use((req, res) => {
    if (req.path.startsWith('/api')) {
        res.status(404).json({ error: 'Not found' });
    }
    else {
        res.sendFile(join(clientDist, 'index.html'));
    }
});
app.listen(PORT, () => {
    console.log(`[Server] Running on http://localhost:${PORT}`);
});
export default app;
//# sourceMappingURL=index.js.map