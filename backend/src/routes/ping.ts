import { Router } from 'express';

const router = Router();

router.get('/ping', (req, res) => {
  res.json({ message: 'Backend connected' });
});

export default router;
