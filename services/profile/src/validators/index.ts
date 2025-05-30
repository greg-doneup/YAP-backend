import express from 'express';
import { Profile } from '../types';

// Define types using the express namespace
type Request = express.Request;
type Response = express.Response;
type NextFunction = express.NextFunction;

// Simple validator middleware for profile creation/update
export const profileValidator = (req: Request, res: Response, next: NextFunction) => {
  // For new profile creation
  if (req.method === 'POST') {
    return next();
  }
  
  // For profile update (PATCH)
  if (req.method === 'PATCH') {
    const { streak, xp } = req.body;
    
    // If streak is provided, ensure it's a number
    if (streak !== undefined && (typeof streak !== 'number' || isNaN(streak))) {
      return res.status(400).json({ 
        error: 'invalid_streak',
        message: 'Streak must be a valid number' 
      });
    }
    
    // If xp is provided, ensure it's a number
    if (xp !== undefined && (typeof xp !== 'number' || isNaN(xp))) {
      return res.status(400).json({ 
        error: 'invalid_xp',
        message: 'XP must be a valid number' 
      });
    }
    
    return next();
  }
  
  // For other methods, just pass through
  next();
};