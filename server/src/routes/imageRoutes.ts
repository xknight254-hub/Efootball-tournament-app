import { Router, Response } from 'express';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { existsSync, mkdirSync, readdirSync, statSync, unlinkSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import db from '../db.js';
import type { AuthRequest } from '../middleware/auth.js';
import { authenticateToken, requireAdmin } from '../middleware/auth.js';
import sharp from 'sharp';

const router = Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const clientPublic = join(__dirname, '..', '..', 'client', 'public');
const tournamentImagesDir = join(clientPublic, 'tournament-images');
const avatarsDir = join(clientPublic, 'avatars');

[tournamentImagesDir, avatarsDir].forEach(d => {
  if (!existsSync(d)) mkdirSync(d, { recursive: true });
});

const imgFilter = (_req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  if (/\.(jpg|jpeg|png|webp|gif)$/i.test(file.originalname)) cb(null, true);
  else cb(new Error('Only image files allowed'));
};

const uploadTournamentImg = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, tournamentImagesDir),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      const base = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 50);
      cb(null, `${base}_${Date.now()}${ext}`);
    },
  }),
  fileFilter: imgFilter,
  limits: { fileSize: 5 * 1024 * 1024 },
});

const imageUploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Too many uploads, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const avatarUploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: { error: 'Too many avatar changes, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const uploadAvatar = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, avatarsDir),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, `avatar_${(req as AuthRequest).user!.id}_${Date.now()}${ext}`);
    },
  }),
  fileFilter: imgFilter,
  limits: { fileSize: 3 * 1024 * 1024 },
});

// GET /api/images/tournament-images — list all available images
router.get('/tournament-images', (_req: AuthRequest, res: Response) => {
  try {
    const all = readdirSync(tournamentImagesDir);
    const images = all
      .filter(f => /\.(jpg|jpeg|png|webp|gif)$/i.test(f))
      .filter(f => {
        try { return statSync(join(tournamentImagesDir, f)).size > 1000; } catch { return false; }
      })
      .map(filename => ({ filename, url: `/tournament-images/${filename}` }));
    res.json({ images });
  } catch (err) {
    console.error('[Images] List error:', err);
    res.status(500).json({ error: 'Failed to list images' });
  }
});

// POST /api/images/upload — upload new tournament image
router.post('/upload', authenticateToken, imageUploadLimiter, uploadTournamentImg.single('image'), async (req: AuthRequest, res: Response) => {
  if (!req.file) return res.status(400).json({ error: 'No image' });
  // Resize/crop to 1280x720 (16:9) for consistent covers
  const outPath = req.file.path.replace(/(\.[^.]+)$/, '_processed$1');
  try {
    await sharp(req.file.path)
      .resize(1280, 720, { fit: 'cover', position: 'center' })
      .jpeg({ quality: 85 })
      .toFile(outPath);
    // Replace original with processed
    unlinkSync(req.file.path);
    const finalName = path.basename(outPath);
    res.json({ url: `/tournament-images/${finalName}` });
  } catch (err) {
    // Fallback to original if sharp fails
    res.json({ url: `/tournament-images/${req.file.filename}` });
  }
});

// DELETE /api/images/delete/:filename — delete a tournament image (admin only)
router.delete('/delete/:filename', authenticateToken, requireAdmin, (req: AuthRequest, res: Response) => {
  const { filename } = req.params;
  if (!filename) return res.status(400).json({ error: 'Filename required' });

  // Sanitize filename to prevent path traversal
  const safeName = path.basename(filename);
  const filePath = join(tournamentImagesDir, safeName);

  if (!existsSync(filePath)) {
    return res.status(404).json({ error: 'Image not found' });
  }

  try {
    unlinkSync(filePath);
    res.json({ message: 'Image deleted' });
  } catch (err) {
    console.error('[Images] Delete error:', err);
    res.status(500).json({ error: 'Failed to delete image' });
  }
});

// POST /api/images/avatar — upload user avatar
router.post('/avatar', authenticateToken, avatarUploadLimiter, uploadAvatar.single('avatar'), async (req: AuthRequest, res: Response) => {
  if (!req.user || !req.file) return res.status(400).json({ error: 'No file' });
  // Resize/crop to 256x256 for consistent avatars
  const outPath = req.file.path.replace(/(\.[^.]+)$/, '_processed$1');
  try {
    await sharp(req.file.path)
      .resize(256, 256, { fit: 'cover', position: 'center' })
      .jpeg({ quality: 90 })
      .toFile(outPath);
    unlinkSync(req.file.path);
    const url = `/avatars/${path.basename(outPath)}`;
  } catch {
    var url = `/avatars/${req.file.filename}`;
  }
  try {
    const old = db.prepare('SELECT avatar_url FROM users WHERE id = ?').get(req.user.id) as any;
    if (old?.avatar_url) {
      const oldPath = join(clientPublic, old.avatar_url.replace(/^\//, ''));
      if (existsSync(oldPath)) { try { unlinkSync(oldPath); } catch { /* */ } }
    }
  } catch { /* */ }
  db.prepare('UPDATE users SET avatar_url = ? WHERE id = ?').run(url, req.user.id);
  res.json({ url });
});

export default router;
