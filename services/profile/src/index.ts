import express from 'express';
import profileRouter from './routes/profile';

import { requireAuth } from './middleware/requireAuth';   // Updated to use local middleware
const APP_JWT_SECRET = process.env.APP_JWT_SECRET!;


const PORT = process.env.PORT || 8080;
const app = express();
app.use(express.json());

app.use('/profile',
    requireAuth(APP_JWT_SECRET),   // 🔒 all /profile/* routes now guarded
    profileRouter,
  );
app.get('/healthz', (_req, res) => res.send('ok'));

const server = app.listen(PORT, () =>
  console.log(`Profile service listening on ${PORT}`)
);
process.on('SIGTERM', () => server.close());
