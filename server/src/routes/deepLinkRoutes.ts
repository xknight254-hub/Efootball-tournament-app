import { Router } from 'express';
import { deepLinkEntry } from '../controllers/deepLinkController.js';

const router = Router();

// Deep link entry: /t/friday-night-cup-a1b2c3d4
// Must be BEFORE the SPA fallback in index.ts
router.get('/:slugToken', deepLinkEntry);

export default router;
