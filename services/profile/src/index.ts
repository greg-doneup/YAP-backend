import express from 'express';
import morgan from 'morgan';
import cors from 'cors';
import { requireAuth, getUserIdFromRequest, getWalletAddressesFromRequest } from './shared/auth/authMiddleware';
import { profileValidator } from './validators';
import { profileController } from './controllers';
import { connectToDatabase } from './mon/mongo';

const app = express();
const PORT = process.env.PORT || 8080;
const APP_JWT_SECRET = process.env.APP_JWT_SECRET!;

// Initialize MongoDB connection
connectToDatabase()
  .then(() => console.log('MongoDB connection initialized'))
  .catch(err => console.error('MongoDB connection failed:', err));

app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

// Apply authentication middleware to all profile routes
app.use('/profile', 
    requireAuth(APP_JWT_SECRET),
    profileValidator,
    profileController
);

// Health check endpoint
app.get('/healthz', (_, res) => {
  res.json({ status: 'ok', service: 'profile' });
});

// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Error:', err);
  const statusCode = err.statusCode || 500;
  res.status(statusCode).json({
    error: err.message || 'Internal Server Error'
  });
});

app.listen(PORT, () => {
  console.log(`Profile service running on port ${PORT}`);
});

export default app;
