import express from 'express';
import dotenv from 'dotenv';
import authRouter from './routes/auth';
import healthRouter from './routes/health';

dotenv.config();

const PORT = process.env.PORT || 8080;
const app  = express();

app.use(express.json());
app.use('/auth',   authRouter);
app.use('/healthz', healthRouter);

// global error handler
app.use((err: any, _req: any, res: any, _next: any) => {
  console.error(err);
  res.status(500).json({ message: 'internal error' });
});

const server = app.listen(PORT, () => 
  console.log(`Auth-service running on :${PORT}`),
);

process.on('SIGTERM', () => server.close());
