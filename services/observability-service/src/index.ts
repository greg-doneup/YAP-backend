import express from "express";
import dotenv from "dotenv";
import ingest from "./routes/ingest";
import billing from "./routes/billing";
import health from "./routes/health";
import { registry, requests } from "./metrics";
import { ObservabilitySecurityMiddleware } from "./middleware/security";

dotenv.config();
const app = express();
const PORT = process.env.PORT || 8080;

// Initialize security middleware
const securityMiddleware = new ObservabilitySecurityMiddleware();

app.use(express.json());

// Apply security middleware in correct order
app.use(securityMiddleware.observabilitySecurityHeaders());
app.use(securityMiddleware.observabilityRateLimit());
app.use(securityMiddleware.validateObservabilityData());
app.use(securityMiddleware.auditObservabilityOperations());

/* Prometheus scrape endpoint */
app.get("/metrics", securityMiddleware.protectMetricsEndpoint(), async (_req, res) => {
  res.set("Content-Type", registry.contentType);
  res.end(await registry.metrics());
});

/* Security metrics endpoint */
app.get("/security/metrics", async (_req, res) => {
  try {
    const metrics = await securityMiddleware.getSecurityMetrics();
    res.json(metrics);
  } catch (error) {
    console.error('Error fetching security metrics:', error);
    res.status(500).json({ error: 'Failed to fetch security metrics' });
  }
});

app.use("/usage/event", ingest);
app.use("/billing",      billing);
app.use("/healthz",      health);

/* Request counter middleware */
app.use((req, res, next) => {
  res.on("finish", () =>
    requests.inc({ route: req.path, code: res.statusCode }),
  );
  next();
});

app.listen(PORT, () => console.log("observability-service on :" + PORT));
