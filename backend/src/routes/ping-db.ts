import { Router } from 'express';
import connectDB from '../../db';
import User from '../../db/models/User';

const router = Router();

router.get('/ping-db', async (req, res) => {
  try {
    await connectDB();
    const user = await User.findOne();
    if (user) {
      res.json({ message: `Database connected\nSample user found: ${user.clerkId}`, user });
    } else {
      res.json({ message: 'No users found' });
    }
  } catch (err) {
    res.status(500).json({ message: 'Error connecting to DB or fetching user', error: err });
  }
});

export default router;
