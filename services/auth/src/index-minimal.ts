import express from 'express';

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 8080;

app.use(express.json());

app.get('/healthz', (req, res) => {
  res.json({ 
    status: 'ok', 
    service: 'auth-service-minimal',
    timestamp: new Date().toISOString()
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Auth service minimal running on port ${PORT}`);
});
