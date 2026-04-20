import { Router } from 'express';

const router = Router();

// Simple health endpoint for backend availability checks.
router.get('/ping', (req, res) => {
  res.json({ message: 'Backend connected' });
});

export default router;
