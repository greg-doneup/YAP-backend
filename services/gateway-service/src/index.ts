import express from "express";
import dotenv from "dotenv";
import { randomUUID } from "crypto";
import { corsMw } from "./middleware/cors";
import { limiter } from "./middleware/rateLimit";
import { gatewaySecurityMiddleware } from "./middleware/security";
import authProxy from "./proxy/auth";
import learningProxy from "./proxy/learning";
import profileProxy from "./proxy/profile";
import rewardProxy from "./proxy/reward";
import dashboard from "./routes/dashboard";
import health from "./routes/health";
import { registry, gatewayRequests } from "./metrics";

dotenv.config();
const app = express();
const PORT = process.env.PORT || 8080;

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

// CORS and rate limiting
app.use(corsMw);
app.use(limiter); // Additional rate limiting middleware

// Middleware to parse JSON bodies with size limit
app.use(express.json({ limit: '1mb' }));

app.use("/auth",    authProxy);          // /auth/*
app.use("/learning", learningProxy);     // /learning/*
app.use("/profile",  profileProxy);      // /profile/*
app.use("/reward",   rewardProxy);       // /reward/*

app.use("/dashboard", dashboard);
app.use("/healthz",   health);

// Security monitoring endpoint
app.get('/gateway/security/metrics', async (req, res) => {
  try {
    // Basic IP-based authentication for security metrics
    const clientIp = gatewaySecurityMiddleware['getClientIp'](req);
    const allowedIPs = (process.env.ADMIN_IPS || '127.0.0.1,::1').split(',');
    
    if (!allowedIPs.includes(clientIp)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
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
    version: '2.0.0',
    timestamp: new Date().toISOString(),
    security_features: [
      'enhanced_rate_limiting',
      'ddos_protection',
      'request_validation',
      'security_headers',
      'request_monitoring',
      'ip_blocking'
    ]
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
