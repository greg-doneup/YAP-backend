import express from 'express';
import jwt from 'jsonwebtoken';

// Define types using the express namespace
type Request = express.Request;
type Response = express.Response;
type NextFunction = express.NextFunction;

export function requireAuth(secret: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const hdr = req.headers.authorization;
    if (!hdr?.startsWith('Bearer ')) return res.sendStatus(401);

    try {
      const token = hdr.substring(7);
      (req as any).user = jwt.verify(token, secret);
      next();
    } catch {
      res.sendStatus(401);
    }
  };
}