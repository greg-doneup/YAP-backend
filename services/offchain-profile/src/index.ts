import express from "express";
import dotenv from "dotenv";
import profile from "./routes/profile";
import points from "./routes/points";
import health from "./routes/health";
import jwt from "jsonwebtoken";

// Local implementation of auth middleware
interface JwtPayload {
  userId: string;
  [key: string]: any;
}

function requireAuth(secret: string) {
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Unauthorized - Missing or invalid token format' });
      }
      
      const token = authHeader.split(' ')[1];
      const decoded = jwt.verify(token, secret) as JwtPayload;
      
      // Add user info to request object
      (req as any).user = decoded;
      next();
    } catch (error) {
      console.error('Auth error:', error);
      return res.status(401).json({ error: 'Unauthorized - Invalid token' });
    }
  };
}

dotenv.config();
const app = express();
const PORT = process.env.PORT || 8080;
const SECRET = process.env.APP_JWT_SECRET!;

app.use(express.json());
app.use("/profile", requireAuth(SECRET), profile);
app.use("/points",  requireAuth(SECRET), points);
app.use("/healthz", health);

app.listen(PORT, () => console.log("offchain-profile on :" + PORT));
