import express from 'express';

// Create Express app
const app = express();
const PORT = process.env.PORT || 8080;

// Basic middleware
app.use(express.json());

// Simple health check endpoint
app.get('/healthz', (req, res) => {
  res.json({ 
    status: 'ok', 
    service: 'auth-service-test',
    version: '3.0.0',
    timestamp: new Date().toISOString()
  });
});

// Simple waitlist endpoint without MongoDB
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

// Start server
app.listen(PORT, () => {
  console.log(`Auth test service running on port ${PORT}`);
});
