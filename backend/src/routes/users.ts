import { Router } from 'express';
import connectDB from '../../db';
import User from '../../db/models/User';
import { getAuthenticatedUserId, requireGoogleAuth } from '../middleware/requireGoogleAuth';

const router = Router();
router.use(requireGoogleAuth);

router.post('/users/upsert', async (req, res) => {
  try {
    await connectDB();
    const userId = getAuthenticatedUserId(req);

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
