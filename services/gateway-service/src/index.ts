import express from "express";
import dotenv from "dotenv";
import axios from "axios";
import { randomUUID } from "crypto";
import { corsMw } from "./middleware/cors";
import { gatewaySecurityMiddleware } from "./middleware/security";
import dashboard from "./routes/dashboard";
import health from "./routes/health";
import { registry, gatewayRequests } from "./metrics";

dotenv.config();
const app = express();
const PORT = process.env.PORT || 8080;

// Trust proxy headers from NGINX ingress
app.set('trust proxy', true);

// Store security middleware instance for access in routes
app.locals.gatewaySecurity = gatewaySecurityMiddleware;

// Request ID generation
app.use((req, _res, next) => {
  req.headers["x-request-id"] ||= randomUUID();
  next();
});

// Apply security middleware in order
app.use(gatewaySecurityMiddleware.gatewaySecurityHeaders());
app.use(gatewaySecurityMiddleware.ddosProtection());
app.use(gatewaySecurityMiddleware.validateGatewayRequest());
app.use(gatewaySecurityMiddleware.gatewayRateLimit());
app.use(gatewaySecurityMiddleware.requestMonitoring());

// CORS
app.use(corsMw);
// Note: Rate limiting is handled by gatewaySecurityMiddleware.gatewayRateLimit() above

// Middleware to parse JSON bodies with size limit
app.use(express.json({ limit: '1mb' }));

// Direct routing to services (no proxies needed in Kubernetes)
// Waitlist endpoint - forward directly to auth service
app.use("/api/waitlist", async (req, res, next) => {
  try {
    const authServiceUrl = `http://auth-service/auth/waitlist${req.path}`;
    console.log(`📡 [DIRECT-ROUTE] ${req.method} ${req.originalUrl} -> ${authServiceUrl}`);
    
    const response = await axios({
      method: req.method.toLowerCase() as any,
      url: authServiceUrl,
      data: req.body,
      headers: {
        'content-type': 'application/json',
        'x-forwarded-for': req.ip,
        'user-agent': req.get('user-agent') || 'gateway-service'
      },
      timeout: 15000
    });

    res.status(response.status).json(response.data);
  } catch (error: any) {
    console.error(`🚨 [DIRECT-ROUTE] Error forwarding to auth service:`, error.message);
    if (error.response) {
      res.status(error.response.status).json(error.response.data);
    } else {
      res.status(504).json({ 
        error: 'Service unavailable', 
        message: 'Auth service is not responding' 
      });
    }
  }
});

// Auth service routes - forward directly
app.use("/auth", async (req, res, next) => {
  try {
    const authServiceUrl = `http://auth-service${req.path}`;
    console.log(`📡 [DIRECT-ROUTE] ${req.method} ${req.originalUrl} -> ${authServiceUrl}`);
    
    const response = await axios({
      method: req.method.toLowerCase() as any,
      url: authServiceUrl,
      data: req.body,
      headers: {
        'content-type': 'application/json',
        'x-forwarded-for': req.ip,
        'user-agent': req.get('user-agent') || 'gateway-service'
      },
      timeout: 15000
    });

    res.status(response.status).json(response.data);
  } catch (error: any) {
    console.error(`🚨 [DIRECT-ROUTE] Error forwarding to auth service:`, error.message);
    if (error.response) {
      res.status(error.response.status).json(error.response.data);
    } else {
      res.status(504).json({ 
        error: 'Service unavailable', 
        message: 'Auth service is not responding' 
      });
    }
  }
});

// API Auth service routes - forward directly (for frontend compatibility)
app.use("/api/auth", async (req, res, next) => {
  try {
    const authServiceUrl = `http://auth-service/auth${req.path}`;
    console.log(`📡 [DIRECT-ROUTE] ${req.method} ${req.originalUrl} -> ${authServiceUrl}`);
    
    const response = await axios({
      method: req.method.toLowerCase() as any,
      url: authServiceUrl,
      data: req.body,
      headers: {
        'content-type': 'application/json',
        'x-forwarded-for': req.ip,
        'user-agent': req.get('user-agent') || 'gateway-service'
      },
      timeout: 15000
    });

    res.status(response.status).json(response.data);
  } catch (error: any) {
    console.error(`🚨 [DIRECT-ROUTE] Error forwarding to auth service:`, error.message);
    if (error.response) {
      res.status(error.response.status).json(error.response.data);
    } else {
      res.status(504).json({ 
        error: 'Service unavailable', 
        message: 'Auth service is not responding' 
      });
    }
  }
});

// Learning service routes - forward directly
app.use("/learning", async (req, res, next) => {
  try {
    const learningServiceUrl = `http://learning-service${req.path}`;
    console.log(`📡 [DIRECT-ROUTE] ${req.method} ${req.originalUrl} -> ${learningServiceUrl}`);
    
    const response = await axios({
      method: req.method.toLowerCase() as any,
      url: learningServiceUrl,
      data: req.body,
      headers: {
        'content-type': 'application/json',
        'x-forwarded-for': req.ip,
        'user-agent': req.get('user-agent') || 'gateway-service'
      },
      timeout: 15000
    });

    res.status(response.status).json(response.data);
  } catch (error: any) {
    console.error(`🚨 [DIRECT-ROUTE] Error forwarding to learning service:`, error.message);
    if (error.response) {
      res.status(error.response.status).json(error.response.data);
    } else {
      res.status(504).json({ 
        error: 'Service unavailable', 
        message: 'Learning service is not responding' 
      });
    }
  }
});

// Profile service routes - forward directly
app.use("/profile", async (req, res, next) => {
  try {
    const profileServiceUrl = `http://profile-service${req.path}`;
    console.log(`📡 [DIRECT-ROUTE] ${req.method} ${req.originalUrl} -> ${profileServiceUrl}`);
    
    const response = await axios({
      method: req.method.toLowerCase() as any,
      url: profileServiceUrl,
      data: req.body,
      headers: {
        'content-type': 'application/json',
        'x-forwarded-for': req.ip,
        'user-agent': req.get('user-agent') || 'gateway-service'
      },
      timeout: 15000
    });

    res.status(response.status).json(response.data);
  } catch (error: any) {
    console.error(`🚨 [DIRECT-ROUTE] Error forwarding to profile service:`, error.message);
    if (error.response) {
      res.status(error.response.status).json(error.response.data);
    } else {
      res.status(504).json({ 
        error: 'Service unavailable', 
        message: 'Profile service is not responding' 
      });
    }
  }
});

// Daily allowances route - forward to learning service
app.use("/daily-allowances", async (req, res, next) => {
  try {
    const learningServiceUrl = `http://learning-service/daily-allowances${req.path}`;
    console.log(`📡 [DIRECT-ROUTE] ${req.method} ${req.originalUrl} -> ${learningServiceUrl}`);
    
    const response = await axios({
      method: req.method.toLowerCase() as any,
      url: learningServiceUrl,
      data: req.body,
      headers: {
        'content-type': 'application/json',
        'x-forwarded-for': req.ip,
        'user-agent': req.get('user-agent') || 'gateway-service',
        'authorization': req.headers.authorization || ''
      },
      timeout: 15000
    });

    res.status(response.status).json(response.data);
  } catch (error: any) {
    console.error(`🚨 [DIRECT-ROUTE] Error forwarding to learning service for daily allowances:`, error.message);
    if (error.response) {
      res.status(error.response.status).json(error.response.data);
    } else {
      res.status(504).json({ 
        error: 'Service unavailable', 
        message: 'Learning service is not responding' 
      });
    }
  }
});

// Reward service routes - forward directly
app.use("/reward", async (req, res, next) => {
  try {
    const rewardServiceUrl = `http://reward-service${req.path}`;
    console.log(`📡 [DIRECT-ROUTE] ${req.method} ${req.originalUrl} -> ${rewardServiceUrl}`);
    
    const response = await axios({
      method: req.method.toLowerCase() as any,
      url: rewardServiceUrl,
      data: req.body,
      headers: {
        'content-type': 'application/json',
        'x-forwarded-for': req.ip,
        'user-agent': req.get('user-agent') || 'gateway-service'
      },
      timeout: 15000
    });

    res.status(response.status).json(response.data);
  } catch (error: any) {
    console.error(`🚨 [DIRECT-ROUTE] Error forwarding to reward service:`, error.message);
    if (error.response) {
      res.status(error.response.status).json(error.response.data);
    } else {
      res.status(504).json({ 
        error: 'Service unavailable', 
        message: 'Reward service is not responding' 
      });
    }
  }
});

// AI Chat service routes - forward directly  
app.use("/api/chat", async (req, res, next) => {
  try {
    const chatServiceUrl = `http://ai-chat-service${req.path}`;
    console.log(`📡 [DIRECT-ROUTE] ${req.method} ${req.originalUrl} -> ${chatServiceUrl}`);
    
    const response = await axios({
      method: req.method.toLowerCase() as any,
      url: chatServiceUrl,
      data: req.body,
      headers: {
        'content-type': 'application/json',
        'x-forwarded-for': req.ip,
        'user-agent': req.get('user-agent') || 'gateway-service',
        'authorization': req.headers.authorization || ''
      },
      timeout: 30000 // Longer timeout for AI responses
    });

    res.status(response.status).json(response.data);
  } catch (error: any) {
    console.error(`🚨 [DIRECT-ROUTE] Error forwarding to AI chat service:`, error.message);
    if (error.response) {
      res.status(error.response.status).json(error.response.data);
    } else {
      res.status(504).json({ 
        error: 'Service unavailable', 
        message: 'AI Chat service is not responding' 
      });
    }
  }
});

app.use("/dashboard", dashboard);
app.use("/healthz",   health);

// Security monitoring endpoint (no authentication required)
app.get('/gateway/security/metrics', async (req, res) => {
  try {
    const metrics = await gatewaySecurityMiddleware.getSecurityMetrics();
    res.json(metrics);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get security metrics' });
  }
});

// Enhanced health check endpoint
app.get('/healthz', (_, res) => {
  res.json({ 
    status: 'ok', 
    service: 'gateway',
    version: '3.0.0',
    timestamp: new Date().toISOString(),
    architecture: 'direct_service_communication',
    routing_features: [
      'direct_axios_calls',
      'kubernetes_service_discovery',
      'no_proxy_overhead',
      'simplified_error_handling'
    ],
    security_features: [
      'rate_limiting',
      'ddos_protection',
      'request_validation',
      'security_headers',
      'request_monitoring'
    ],
    note: 'Simplified architecture for self-contained Kubernetes cluster - no authentication required'
  });
});

app.get("/metrics", async (_req, res) => {
    res.set("Content-Type", registry.contentType);
    res.end(await registry.metrics());
  });
  
  // count every finished request
  app.use((req, res, next) => {
    res.on("finish", () =>
      gatewayRequests.inc({ route: req.path, code: res.statusCode })
    );
    next();
  });

// ── global error handler ─────────────────────────────
app.use((err: any, _req: any, res: any, _next: any) => {
  console.error(err);
  res.status(500).json({ message: "internal error" });
});

app.listen(PORT, () => console.log("gateway-service on :" + PORT));

// Export app for testing
export { app };
