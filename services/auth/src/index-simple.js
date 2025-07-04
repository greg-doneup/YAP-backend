const express = require('express');

// Create Express app
const app = express();
const PORT = process.env.PORT || 8080;

// Basic middleware
app.use(express.json());

// CORS middleware
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Health check endpoint
app.get('/healthz', (req, res) => {
  res.json({ 
    status: 'ok', 
    service: 'auth-service-simple',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

// Simple waitlist endpoint
app.post('/auth/waitlist/simple', (req, res) => {
  console.log('Waitlist signup request:', req.body);
  res.status(201).json({
    success: true,
    message: 'Successfully joined the waitlist!',
    data: {
      name: req.body.name,
      email: req.body.email,
      language_to_learn: req.body.language_to_learn
    }
  });
});

// Simple wallet signup endpoint 
app.post('/auth/wallet/signup', (req, res) => {
  console.log('Wallet signup request:', req.body);
  res.status(201).json({
    success: true,
    message: 'Wallet signup successful!',
    data: {
      name: req.body.name,
      email: req.body.email,
      language_to_learn: req.body.language_to_learn
    }
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ message: 'Internal Server Error' });
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Auth simple service running on port ${PORT}`);
  console.log('Available endpoints:');
  console.log('  GET /healthz');
  console.log('  POST /auth/waitlist/simple');
  console.log('  POST /auth/wallet/signup');
});
