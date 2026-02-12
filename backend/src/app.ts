import express from 'express';
import cors from "cors";

import pingRouter from './routes/ping';

const app = express();
const PORT = process.env.PORT || 8000;

app.use(cors());
app.use(express.json());

// Routes
app.use('/api', pingRouter);

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});