import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import quizRoutes from "./routes/quiz";
import dailyRoutes from "./routes/daily";
import progressRoutes from "./routes/progress";
import lessonRoutes from "./routes/lessons";
import dynamicLessonRoutes from "./routes/dynamic-lessons";
import dailyAllowancesRoutes from "./routes/daily-allowances";
import tokensRoutes from "./routes/tokens";
import healthRoutes from "./routes/health";
import { closeConnection } from "./clients/mongodb";
import { learningSecurityMiddleware } from "./middleware/security";

// Load environment variables
dotenv.config();

// Export the app instance for testing
export const app = express();
const PORT = process.env.PORT || 8080;

// Apply security middleware
app.use(learningSecurityMiddleware.learningSecurityHeaders());
app.use(learningSecurityMiddleware.learningRateLimit());
app.use(learningSecurityMiddleware.validateLearningData());
app.use(learningSecurityMiddleware.auditLearningOperations());

// Standard middleware
app.use(express.json({ limit: '10mb' }));
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['https://perci.goyap.ai', 'http://localhost:3000'],
  credentials: true,
  optionsSuccessStatus: 200
}));

// Routes - mount all API routes under /api prefix
const apiRouter = express.Router();

// Mount all routes on the API router (these will be accessible under /api)
apiRouter.use("/quiz", learningSecurityMiddleware.enforceLearningOwnership(), quizRoutes);
apiRouter.use("/daily", learningSecurityMiddleware.enforceLearningOwnership(), dailyRoutes);
apiRouter.use("/progress", learningSecurityMiddleware.enforceLearningOwnership(), progressRoutes);
apiRouter.use("/lessons", learningSecurityMiddleware.enforceLearningOwnership(), lessonRoutes);
apiRouter.use("/dynamic-lessons", learningSecurityMiddleware.enforceLearningOwnership(), dynamicLessonRoutes);
apiRouter.use("/daily-allowances", learningSecurityMiddleware.enforceLearningOwnership(), dailyAllowancesRoutes);
apiRouter.use("/allowances", learningSecurityMiddleware.enforceLearningOwnership(), dailyAllowancesRoutes);
apiRouter.use("/tokens", learningSecurityMiddleware.enforceLearningOwnership(), tokensRoutes);

// Mount API router under /api
app.use("/api", apiRouter);

// Health check route (not under /api prefix)
app.use("/health", healthRoutes);

// Security metrics endpoint
app.get("/security/metrics", async (_req, res) => {
  try {
    const metrics = await learningSecurityMiddleware.getSecurityMetrics();
    res.json(metrics);
  } catch (error) {
    console.error('Failed to get security metrics:', error);
    res.status(500).json({ error: 'Failed to retrieve security metrics' });
  }
});

// Health check endpoint for Kubernetes
app.get("/healthz", (_req, res) => {
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

// Only start the server if this file is run directly
if (require.main === module) {
  const server = app.listen(PORT, () => {
    console.log(`Learning service running on port ${PORT}`);
  });
  
  // Graceful shutdown
  const gracefulShutdown = async () => {
    console.log('Gracefully shutting down...');
    server.close(async () => {
      console.log('HTTP server closed');
      
      // Close MongoDB connections
      await closeConnection();
      
      process.exit(0);
    });
    
    // Force close after timeout
    setTimeout(() => {
      console.error('Could not close connections in time, forcefully shutting down');
      process.exit(1);
    }, 10000);
  };
  
  process.on('SIGTERM', gracefulShutdown);
  process.on('SIGINT', gracefulShutdown);
}
