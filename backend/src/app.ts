import express from 'express';
import cors from "cors";

import pingRouter from './routes/ping';
import pingDbRouter from './routes/ping-db';
import organizationRouter from './routes/organizations';
import usersRouter from './routes/users';

const app = express();
const PORT = process.env.PORT || 8000;

app.use(cors());
app.use(express.json());

// Routes
app.use('/api', pingRouter);
app.use('/api', pingDbRouter);
app.use('/api', organizationRouter);
app.use('/api', usersRouter);

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});