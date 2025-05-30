import express from "express";
import dotenv from "dotenv";
import { randomUUID } from "crypto";
import { corsMw } from "./middleware/cors";
import { limiter } from "./middleware/rateLimit";
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

// Test hot-reload functionality - this is a test comment
app.use((req, _res, next) => {
  req.headers["x-request-id"] ||= randomUUID();
  next();
});

app.use(corsMw);
app.use(limiter); // Rate limiting middleware
// Middleware to parse JSON bodies
app.use(express.json());

app.use("/auth",    authProxy);          // /auth/*
app.use("/learning", learningProxy);     // /learning/*
app.use("/profile",  profileProxy);      // /profile/*
app.use("/reward",   rewardProxy);       // /reward/*

app.use("/dashboard", dashboard);
app.use("/healthz",   health);

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
