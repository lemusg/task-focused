import { Router } from 'express';
import connectDB from '../../db';
import User from '../../db/models/User';

const router = Router();

// Basic database smoke test used during local setup.
router.get('/ping-db', async (req, res) => {
  try {
    await connectDB();

    // Grab one user document to prove read access works too.
    const user = await User.findOne();
    if (user) {
      const userDoc = user.toObject() as {
        userId?: string;
        email?: string;
        _id?: unknown;
      };

      // Prefer a readable identifier in the debug response.
      const sampleUserIdentifier =
        userDoc.userId ??
        userDoc.email ??
        (userDoc._id ? String(userDoc._id) : 'unknown-user');

      res.json({
        message: `Database connected
Sample user found: ${sampleUserIdentifier}`,
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
