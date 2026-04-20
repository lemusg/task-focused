import 'dotenv/config';
import express from 'express';
import cors from 'cors';

import pingRouter from './routes/ping';
import pingDbRouter from './routes/ping-db';
import organizationRouter from './routes/organizations';
import usersRouter from './routes/users';
import chatRouter from './routes/chat';

const app = express();
const PORT = process.env.PORT || 8000;

// Global middleware used by every route group.
app.use(cors());
app.use(express.json());

// Register API route groups under the shared /api prefix.
app.use('/api', pingRouter);
app.use('/api', pingDbRouter);
app.use('/api', organizationRouter);
app.use('/api', usersRouter);
app.use('/api', chatRouter);

// Start the HTTP server after middleware and routes are in place.
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
