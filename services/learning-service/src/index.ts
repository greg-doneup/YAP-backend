import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import quizRoutes from "./routes/quiz";
import dailyRoutes from "./routes/daily";
import progressRoutes from "./routes/progress";
import lessonRoutes from "./routes/lessons";
import healthRoutes from "./routes/health";
import { closeConnection } from "./clients/mongodb";

// Load environment variables
dotenv.config();

// Export the app instance for testing
export const app = express();
const PORT = process.env.PORT || 8080;

// Middleware
app.use(express.json());
app.use(cors());

// Routes
app.use("/quiz", quizRoutes);
app.use("/daily", dailyRoutes);
app.use("/progress", progressRoutes);
app.use("/lessons", lessonRoutes);
app.use("/health", healthRoutes);

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
