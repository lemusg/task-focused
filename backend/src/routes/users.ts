import { Router } from 'express';
import connectDB from '../../db';
import User from '../../db/models/User';

const router = Router();

router.post('/users/upsert', async (req, res) => {
  try {
    await connectDB();
    const userId = String(req.body.userId ?? '').trim().toLowerCase();

    if (!userId) {
      res.status(400).json({ message: 'userId is required.' });
      return;
    }

    const user = await User.findOneAndUpdate(
      { userId },
      {
        $setOnInsert: {
          userId,
          role: 'member',
          organization: null,
        },
      },
      { returnDocument: 'after', upsert: true }
    );

    res.json({
      message: 'User synced.',
      user: {
        userId: user.userId,
        role: user.role,
        organization: user.organization,
      },
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to sync user.', error });
  }
});

export default router;
