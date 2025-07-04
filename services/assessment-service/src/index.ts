import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 8080;

// Middleware
app.use(helmet());
app.use(cors());
app.use(morgan('combined'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    service: 'assessment-service',
    timestamp: new Date().toISOString()
  });
});

// Basic routes
app.get('/', (req, res) => {
  res.json({
    message: 'Assessment Service API',
    version: '1.0.0',
    status: 'active'
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`Assessment Service running on port ${PORT}`);
});

export default app;
