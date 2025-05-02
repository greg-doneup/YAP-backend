import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import quizRoutes from "./routes/quiz";
import dailyRoutes from "./routes/daily";

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
  app.listen(PORT, () => {
    console.log(`Learning service running on port ${PORT}`);
  });
}
