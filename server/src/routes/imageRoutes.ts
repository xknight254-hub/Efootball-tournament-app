import { Router, Response } from 'express';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { existsSync, mkdirSync, readdirSync, statSync, unlinkSync, copyFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import sharp from 'sharp';
import db from '../db.js';
import type { AuthRequest } from '../middleware/auth.js';
import { authenticateToken, requireAdmin } from '../middleware/auth.js';

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
router.post('/upload', authenticateToken, imageUploadLimiter, uploadTournamentImg.single('image'), (req: AuthRequest, res: Response) => {
  if (!req.file) return res.status(400).json({ error: 'No image' });
  res.json({ url: `/tournament-images/${req.file.filename}` });
});

// POST /api/images/crop — crop an existing tournament image with sharp
// Body: { filename: string, focusX: number, focusY: number, zoom: number }
// Returns: { url: string } — path to the cropped image
router.post('/crop', authenticateToken, imageUploadLimiter, async (req: AuthRequest, res: Response) => {
  const { filename, focusX = 50, focusY = 30, zoom = 1.0 } = req.body;

  if (!filename || typeof filename !== 'string') {
    return res.status(400).json({ error: 'Filename required' });
  }

  // Sanitize filename to prevent path traversal
  const safeName = path.basename(filename);
  const srcPath = join(tournamentImagesDir, safeName);

  if (!existsSync(srcPath)) {
    return res.status(404).json({ error: 'Original image not found' });
  }

  try {
    // Get original dimensions
    const metadata = await sharp(srcPath).metadata();
    const origWidth = metadata.width || 1200;
    const origHeight = metadata.height || 800;

    // Target aspect ratio for tournament cards (16:9)
    const TARGET_RATIO = 16 / 9;

    // Calculate the crop dimensions based on zoom
    // Higher zoom = smaller crop area = more magnification
    const cropWidth = origWidth / zoom;
    const cropHeight = cropWidth / TARGET_RATIO;

    // Calculate crop offset based on focal point
    // focusX/focusY are percentages (0-100) representing subject location
    const focusXPx = (focusX / 100) * origWidth;
    const focusYPx = (focusY / 100) * origHeight;

    // Position crop window so focal point is in upper-third of card
    // (subject biased toward top with headroom)
    let left = focusXPx - cropWidth / 2;
    let top = focusYPx - (cropHeight / 2) - (cropHeight * 0.15); // shift up 15% for headroom

    // Clamp to image bounds
    left = Math.max(0, Math.min(left, origWidth - cropWidth));
    top = Math.max(0, Math.min(top, origHeight - cropHeight));

    // If crop exceeds image dimensions, reduce crop size
    const finalCropWidth = Math.min(cropWidth, origWidth);
    const finalCropHeight = Math.min(cropHeight, origHeight);

    // Generate output filename
    const ext = path.extname(safeName);
    const base = path.basename(safeName, ext);
    const outputFilename = `${base}_crop_${Date.now()}${ext}`;
    const outputPath = join(tournamentImagesDir, outputFilename);

    // Perform crop with sharp
    await sharp(srcPath)
      .extract({
        left: Math.round(left),
        top: Math.round(top),
        width: Math.round(finalCropWidth),
        height: Math.round(finalCropHeight),
      })
      .resize(1280, 720, { fit: 'cover', position: 'center' })
      .jpeg({ quality: 85 })
      .toFile(outputPath);

    res.json({ url: `/tournament-images/${outputFilename}` });
  } catch (err: any) {
    console.error('[Images] Crop error:', err.message);
    res.status(500).json({ error: 'Failed to crop image' });
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
router.post('/avatar', authenticateToken, avatarUploadLimiter, uploadAvatar.single('avatar'), (req: AuthRequest, res: Response) => {
  if (!req.user || !req.file) return res.status(400).json({ error: 'No file' });
  const url = `/avatars/${req.file.filename}`;
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
