import { Router } from 'express';
import connectDB from '../../db';
import User from '../../db/models/User';

const router = Router();

router.get('/ping-db', async (req, res) => {
  try {
    await connectDB();
    const user = await User.findOne();
    if (user) {
      const userDoc = user.toObject() as {
        userId?: string;
        email?: string;
        _id?: unknown;
      };
      const sampleUserIdentifier =
        userDoc.userId ??
        userDoc.email ??
        (userDoc._id ? String(userDoc._id) : 'unknown-user');

      res.json({
        message: `Database connected\nSample user found: ${sampleUserIdentifier}`,
        user,
      });
    } else {
      res.json({ message: 'No users found' });
    }
  } catch (err) {
    res.status(500).json({ message: 'Error connecting to DB or fetching user', error: err });
  }
});

export default router;
