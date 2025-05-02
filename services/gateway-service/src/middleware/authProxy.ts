import express from "express";
import jwt from "jsonwebtoken";

// Define interface for decoded JWT payload
interface JwtPayload {
  userId: string;
  walletAddress?: string;
  [key: string]: any;
}

// Extend Express Request type to include user property
declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

// Get secret from environment variable with validation
const SECRET = process.env.APP_JWT_SECRET;
if (!SECRET) {
  console.error("APP_JWT_SECRET environment variable is not set");
  process.exit(1); // Exit if the secret is missing
}

export function ensureJwt(
  req: express.Request, 
  res: express.Response, 
  next: express.NextFunction
) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Authorization header missing or invalid" });
  }

  try {
    const token = authHeader.substring(7);
    // Use type assertion after verification to ensure proper type
    const decoded = jwt.verify(token, SECRET as jwt.Secret) as unknown as JwtPayload;
    req.user = decoded;
    next();
  } catch (error) {
    console.error("JWT verification failed:", error);
    return res.status(401).json({ error: "Invalid or expired authentication token" });
  }
}
