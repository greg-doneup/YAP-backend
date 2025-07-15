import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { config } from 'dotenv';
import winston from 'winston';
import { readFileSync } from 'fs';
import { join } from 'path';
import rateLimit from 'express-rate-limit';
import { createPrometheusMetrics } from './utils/metrics';
import aiRoutes from './routes/ai-integration-routes';

// Load environment variables
config();

// Load secrets from mounted files
const loadSecret = (secretName: string): string => {
  try {
    const secretPath = join('/run/secrets', secretName);
    return readFileSync(secretPath, 'utf8').trim();
  } catch (error) {
    console.warn(`Could not load secret ${secretName}, falling back to environment variable`);
    return process.env[secretName] || '';
  }
};

// Configure Winston logger
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    }),
    new winston.transports.File({
      filename: 'logs/ai-service.log',
      level: 'info'
    }),
    new winston.transports.File({
      filename: 'logs/ai-service-error.log',
      level: 'error'
    })
  ]
});

// Create Express app
const app = express();
export { app }; // Export for testing

// Initialize Prometheus metrics
const metrics = createPrometheusMetrics();

// Basic configuration
const PORT = process.env.PORT || 8080;
const NODE_ENV = process.env.NODE_ENV || 'development';

// Load secrets
const secrets = {
  openaiApiKey: loadSecret('OPENAI_API_KEY'),
  anthropicApiKey: loadSecret('ANTHROPIC_API_KEY'),
  mongodbUri: loadSecret('MONGODB_URI'),
  jwtSecret: loadSecret('APP_JWT_SECRET'),
  redisUrl: loadSecret('REDIS_URL')
};

// Validate required secrets
if (!secrets.openaiApiKey) {
  logger.error('OPENAI_API_KEY is required');
  process.exit(1);
}

if (!secrets.jwtSecret) {
  logger.error('APP_JWT_SECRET is required');
  process.exit(1);
}

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "https://api.openai.com", "https://api.anthropic.com"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false,
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.AI_RATE_LIMIT_WINDOW || '3600000'), // 1 hour
  max: parseInt(process.env.AI_RATE_LIMIT_REQUESTS || '100'),
  message: {
    error: 'Too many requests from this IP, please try again later.',
    retryAfter: 3600
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logger.warn(`Rate limit exceeded for IP: ${req.ip}`);
    res.status(429).json({
      error: 'Too many requests from this IP, please try again later.',
      retryAfter: 3600
    });
  }
});

app.use(limiter);

// CORS configuration
const corsOptions = {
  origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
    const allowedOrigins = process.env.CORS_ORIGINS?.split(',') || [
      'https://delta-sandbox-7k3m.goyap.ai',
      'http://localhost:8100',
      'http://localhost:3000',
      'http://localhost:4200'
    ];

    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Origin', 'X-Requested-With', 'Content-Type', 'Accept', 'Authorization'],
  maxAge: 86400 // 24 hours
};

app.use(cors(corsOptions));

// Body parsing middleware
app.use(express.json({ 
  limit: process.env.MAX_REQUEST_SIZE || '10mb',
  type: 'application/json'
}));

app.use(express.urlencoded({ 
  extended: true, 
  limit: process.env.MAX_REQUEST_SIZE || '10mb'
}));

// Request logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.info('HTTP Request', {
      method: req.method,
      url: req.url,
      status: res.statusCode,
      duration: `${duration}ms`,
      userAgent: req.get('User-Agent'),
      ip: req.ip
    });
    
    // Update Prometheus metrics
    metrics.httpRequestDuration.observe(
      { method: req.method, route: req.route?.path || req.path, status: res.statusCode },
      duration / 1000
    );
    
    metrics.httpRequestsTotal.inc({
      method: req.method,
      route: req.route?.path || req.path,
      status: res.statusCode
    });
  });
  
  next();
});

// Store secrets in app locals for access in routes
app.locals.secrets = secrets;
app.locals.logger = logger;
app.locals.metrics = metrics;

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'yap-ai-service',
    version: process.env.AI_SERVICE_VERSION || '1.0.0',
    timestamp: new Date().toISOString(),
    environment: NODE_ENV,
    features: [
      'openai-integration',
      'anthropic-integration',
      'token-management',
      'conversation-history',
      'rate-limiting',
      'metrics'
    ],
    dependencies: {
      openai: !!secrets.openaiApiKey,
      anthropic: !!secrets.anthropicApiKey,
      mongodb: !!secrets.mongodbUri,
      redis: !!secrets.redisUrl
    }
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    service: 'YAP AI Service',
    version: process.env.AI_SERVICE_VERSION || '1.0.0',
    status: 'running',
    endpoints: {
      health: '/health',
      api: '/api/ai',
      metrics: '/metrics'
    }
  });
});

// Metrics endpoint for Prometheus
app.get('/metrics', async (req, res) => {
  try {
    res.set('Content-Type', metrics.register.contentType);
    res.end(await metrics.register.metrics());
  } catch (error) {
    logger.error('Error generating metrics', error);
    res.status(500).end();
  }
});

// Mount AI routes
app.use('/api/ai', aiRoutes);

// 404 handler
app.use((req, res) => {
  logger.warn(`404 - Route not found: ${req.method} ${req.path}`);
  res.status(404).json({
    error: 'Route not found',
    method: req.method,
    path: req.path
  });
});

// Global error handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error('Unhandled error', {
    error: err.message,
    stack: err.stack,
    method: req.method,
    url: req.url,
    ip: req.ip
  });
  
  // Update error metrics
  metrics.errorCount.inc({
    type: err.name || 'UnknownError',
    route: req.route?.path || req.path
  });
  
  res.status(err.statusCode || 500).json({
    error: NODE_ENV === 'development' ? err.message : 'Internal Server Error',
    ...(NODE_ENV === 'development' && { stack: err.stack })
  });
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  process.exit(0);
});

// Start server
const server = app.listen(PORT, () => {
  logger.info(`AI Service running on port ${PORT}`, {
    environment: NODE_ENV,
    port: PORT,
    features: [
      'openai-integration',
      'anthropic-integration',
      'token-management',
      'conversation-history'
    ]
  });
});

// Handle server errors
server.on('error', (error: Error) => {
  logger.error('Server error', error);
  process.exit(1);
});

export default app;
