import express from "express";
import dotenv from "dotenv";
import complete from "./routes/complete";
import health from "./routes/health";
import ethereum from "./routes/ethereum";
import { rewardSecurityMiddleware } from "./middleware/security";

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 8080;

// Store security middleware in app locals for access in routes
app.locals.rewardSecurity = rewardSecurityMiddleware;

// Apply security middleware (order is important)
app.use(rewardSecurityMiddleware.rewardSecurityHeaders());
app.use(rewardSecurityMiddleware.rewardRateLimit());
app.use(rewardSecurityMiddleware.validateRewardData());
app.use(rewardSecurityMiddleware.auditRewardOperations());

// Standard middleware
app.use(express.json({ limit: '1mb' }));

// Apply transaction monitoring and ownership enforcement to financial routes
app.use("/reward/complete", 
  rewardSecurityMiddleware.monitorTransactions(),
  rewardSecurityMiddleware.enforceRewardOwnership(),
  complete
);

app.use("/ethereum", 
  rewardSecurityMiddleware.monitorTransactions(),
  rewardSecurityMiddleware.enforceRewardOwnership(),
  ethereum
);

// Health endpoint (no additional security needed)
app.use("/healthz", health);

// Security metrics endpoint
app.get("/security/metrics", async (_req, res) => {
  try {
    const metrics = await rewardSecurityMiddleware.getSecurityMetrics();
    res.json(metrics);
  } catch (error) {
    console.error('Failed to get security metrics:', error);
    res.status(500).json({ error: 'Failed to retrieve security metrics' });
  }
});

// Health check endpoint for Kubernetes
app.get("/health", (_req, res) => {
  res.send("ok");
});

// Global error handler
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ 
    error: "An unexpected error occurred",
    message: process.env.NODE_ENV === "production" ? undefined : err.message
  });
});

app.listen(PORT, () => {
  console.log(`🔒 Reward service with enhanced security running on port ${PORT}`);
  console.log(`🚀 Financial operations monitoring enabled`);
  console.log(`🛡️ Transaction rate limiting and fraud detection active`);
});
