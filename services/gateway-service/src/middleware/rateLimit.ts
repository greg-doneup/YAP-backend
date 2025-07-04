import rateLimit from "express-rate-limit";

export const limiter = rateLimit({
  windowMs: 60_000,           // 1 minute
  max: 100,                   // 100 req / IP / window
  standardHeaders: true,
  legacyHeaders: false,
  // Skip rate limiting errors to prevent crashes
  skipFailedRequests: true,
  skipSuccessfulRequests: false
});
