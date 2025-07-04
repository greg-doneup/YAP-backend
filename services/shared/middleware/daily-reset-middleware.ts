/**
 * Daily Reset Middleware for YAP Token System
 * 
 * Handles automatic daily allowance resets at 00:00 UTC according to the
 * YAP Token Cost Matrix. Ensures users get their free daily allowances
 * for features like daily lessons, AI chat, etc.
 * 
 * Features:
 * - Automatic daily reset at 00:00 UTC
 * - Weekly reset for weekly features (Monday 00:00 UTC)
 * - Background task scheduling
 * - User-specific reset handling
 * - Graceful error handling and retry logic
 * - Reset history tracking and audit logs
 */

import { FeatureId, getDailyAllowanceFeatures, getWeeklyAllowanceFeatures, TOKEN_ECONOMICS } from '../config/yap-token-matrix';
import { getCurrentConfig } from '../config/beta-mainnet-config';

// Generic request/response types for middleware
export interface AuthenticatedRequest {
  user?: {
    id: string;
    [key: string]: any;
  };
  [key: string]: any;
}

export interface MiddlewareResponse {
  [key: string]: any;
}

export type NextFunction = (error?: any) => void;

export interface UserAllowanceRecord {
  userId: string;
  featureId: FeatureId;
  allowanceUsed: number;
  allowanceLimit: number;
  lastResetDate: Date;
  resetPeriod: 'daily' | 'weekly';
  nextResetTime: Date;
}

export interface ResetEvent {
  timestamp: Date;
  resetType: 'daily' | 'weekly';
  featuresReset: FeatureId[];
  usersAffected: number;
  duration: number; // milliseconds
  errors?: string[];
}

/**
 * Daily Reset Service
 * Manages allowance resets and scheduling
 */
export class DailyResetService {
  private static instance: DailyResetService;
  private resetHistory: ResetEvent[] = [];
  private isResetInProgress: boolean = false;

  private constructor() {}

  static getInstance(): DailyResetService {
    if (!DailyResetService.instance) {
      DailyResetService.instance = new DailyResetService();
    }
    return DailyResetService.instance;
  }

  /**
   * Initialize the reset service with scheduling
   */
  async initialize(): Promise<void> {
    // Schedule daily resets
    this.scheduleDailyResets();
    
    // Schedule weekly resets
    this.scheduleWeeklyResets();
    
    // Check for missed resets on startup
    await this.checkAndHandleMissedResets();
    
    console.log('Daily Reset Service initialized');
  }

  /**
   * Check if a user needs allowance reset for a specific feature
   */
  async checkUserNeedsReset(userId: string, featureId: FeatureId): Promise<boolean> {
    const allowanceRecord = await this.getUserAllowanceRecord(userId, featureId);
    if (!allowanceRecord) {
      return false; // No record means no reset needed
    }

    const now = new Date();
    return now >= allowanceRecord.nextResetTime;
  }

  /**
   * Reset allowances for a specific user and feature
   */
  async resetUserFeatureAllowance(userId: string, featureId: FeatureId): Promise<void> {
    const allowanceRecord = await this.getUserAllowanceRecord(userId, featureId);
    if (!allowanceRecord) {
      return; // No record to reset
    }

    // Reset the allowance
    allowanceRecord.allowanceUsed = 0;
    allowanceRecord.lastResetDate = new Date();
    allowanceRecord.nextResetTime = this.calculateNextResetTime(allowanceRecord.resetPeriod);

    // Save the updated record
    await this.saveUserAllowanceRecord(allowanceRecord);

    console.log(`Reset allowance for user ${userId}, feature ${featureId}`);
  }

  /**
   * Reset all allowances for a specific user
   */
  async resetUserAllowances(userId: string): Promise<void> {
    const dailyFeatures = getDailyAllowanceFeatures();
    const weeklyFeatures = getWeeklyAllowanceFeatures();
    
    const now = new Date();
    const isDaily = this.isDailyResetTime(now);
    const isWeekly = this.isWeeklyResetTime(now);

    // Reset daily features if it's daily reset time
    if (isDaily) {
      for (const featureId of dailyFeatures) {
        await this.resetUserFeatureAllowance(userId, featureId as FeatureId);
      }
    }

    // Reset weekly features if it's weekly reset time
    if (isWeekly) {
      for (const featureId of weeklyFeatures) {
        await this.resetUserFeatureAllowance(userId, featureId as FeatureId);
      }
    }
  }

  /**
   * Perform global daily reset for all users
   */
  async performDailyReset(): Promise<ResetEvent> {
    if (this.isResetInProgress) {
      throw new Error('Reset already in progress');
    }

    this.isResetInProgress = true;
    const startTime = Date.now();
    const resetEvent: ResetEvent = {
      timestamp: new Date(),
      resetType: 'daily',
      featuresReset: [],
      usersAffected: 0,
      duration: 0,
      errors: []
    };

    try {
      const dailyFeatures = getDailyAllowanceFeatures();
      resetEvent.featuresReset = dailyFeatures as FeatureId[];

      // Get all users who need daily reset
      const users = await this.getUsersNeedingDailyReset();
      
      let successCount = 0;
      for (const userId of users) {
        try {
          for (const featureId of dailyFeatures) {
            await this.resetUserFeatureAllowance(userId, featureId as FeatureId);
          }
          successCount++;
        } catch (error) {
          const errorMsg = `Failed to reset user ${userId}: ${error instanceof Error ? error.message : 'Unknown error'}`;
          resetEvent.errors!.push(errorMsg);
          console.error(errorMsg);
        }
      }

      resetEvent.usersAffected = successCount;
      resetEvent.duration = Date.now() - startTime;

      console.log(`Daily reset completed: ${successCount} users affected, ${resetEvent.duration}ms`);
      
    } catch (error) {
      resetEvent.errors!.push(`Global daily reset failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      console.error('Daily reset failed:', error);
    } finally {
      this.isResetInProgress = false;
      this.resetHistory.push(resetEvent);
      
      // Keep only last 30 reset events
      if (this.resetHistory.length > 30) {
        this.resetHistory.splice(0, this.resetHistory.length - 30);
      }
    }

    return resetEvent;
  }

  /**
   * Perform global weekly reset for all users
   */
  async performWeeklyReset(): Promise<ResetEvent> {
    if (this.isResetInProgress) {
      throw new Error('Reset already in progress');
    }

    this.isResetInProgress = true;
    const startTime = Date.now();
    const resetEvent: ResetEvent = {
      timestamp: new Date(),
      resetType: 'weekly',
      featuresReset: [],
      usersAffected: 0,
      duration: 0,
      errors: []
    };

    try {
      const weeklyFeatures = getWeeklyAllowanceFeatures();
      resetEvent.featuresReset = weeklyFeatures as FeatureId[];

      // Get all users who need weekly reset
      const users = await this.getUsersNeedingWeeklyReset();
      
      let successCount = 0;
      for (const userId of users) {
        try {
          for (const featureId of weeklyFeatures) {
            await this.resetUserFeatureAllowance(userId, featureId as FeatureId);
          }
          successCount++;
        } catch (error) {
          const errorMsg = `Failed to reset user ${userId}: ${error instanceof Error ? error.message : 'Unknown error'}`;
          resetEvent.errors!.push(errorMsg);
          console.error(errorMsg);
        }
      }

      resetEvent.usersAffected = successCount;
      resetEvent.duration = Date.now() - startTime;

      console.log(`Weekly reset completed: ${successCount} users affected, ${resetEvent.duration}ms`);
      
    } catch (error) {
      resetEvent.errors!.push(`Global weekly reset failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      console.error('Weekly reset failed:', error);
    } finally {
      this.isResetInProgress = false;
      this.resetHistory.push(resetEvent);
      
      // Keep only last 30 reset events
      if (this.resetHistory.length > 30) {
        this.resetHistory.splice(0, this.resetHistory.length - 30);
      }
    }

    return resetEvent;
  }

  /**
   * Schedule daily resets
   */
  private scheduleDailyResets(): void {
    const resetHour = TOKEN_ECONOMICS.DAILY_RESET_UTC_HOUR;
    const resetMinute = TOKEN_ECONOMICS.DAILY_RESET_UTC_MINUTE;

    // Calculate milliseconds until next reset
    const now = new Date();
    const nextReset = new Date();
    nextReset.setUTCHours(resetHour, resetMinute, 0, 0);
    
    // If we've passed today's reset time, schedule for tomorrow
    if (now >= nextReset) {
      nextReset.setUTCDate(nextReset.getUTCDate() + 1);
    }

    const msUntilReset = nextReset.getTime() - now.getTime();

    setTimeout(() => {
      this.performDailyReset().catch(console.error);
      
      // Schedule subsequent daily resets every 24 hours
      setInterval(() => {
        this.performDailyReset().catch(console.error);
      }, 24 * 60 * 60 * 1000);
      
    }, msUntilReset);

    console.log(`Daily reset scheduled for ${nextReset.toISOString()}`);
  }

  /**
   * Schedule weekly resets (Mondays at 00:00 UTC)
   */
  private scheduleWeeklyResets(): void {
    const resetHour = TOKEN_ECONOMICS.DAILY_RESET_UTC_HOUR;
    const resetMinute = TOKEN_ECONOMICS.DAILY_RESET_UTC_MINUTE;

    // Calculate milliseconds until next Monday reset
    const now = new Date();
    const nextReset = new Date();
    
    // Set to next Monday
    const daysUntilMonday = (1 + 7 - now.getUTCDay()) % 7 || 7;
    nextReset.setUTCDate(now.getUTCDate() + daysUntilMonday);
    nextReset.setUTCHours(resetHour, resetMinute, 0, 0);

    const msUntilReset = nextReset.getTime() - now.getTime();

    setTimeout(() => {
      this.performWeeklyReset().catch(console.error);
      
      // Schedule subsequent weekly resets every 7 days
      setInterval(() => {
        this.performWeeklyReset().catch(console.error);
      }, 7 * 24 * 60 * 60 * 1000);
      
    }, msUntilReset);

    console.log(`Weekly reset scheduled for ${nextReset.toISOString()}`);
  }

  /**
   * Check and handle any missed resets on startup
   */
  private async checkAndHandleMissedResets(): Promise<void> {
    const now = new Date();
    
    // Check if we missed a daily reset
    if (this.isDailyResetTime(now) || this.wasDailyResetMissed(now)) {
      console.log('Detected missed daily reset, performing now...');
      await this.performDailyReset();
    }

    // Check if we missed a weekly reset
    if (this.isWeeklyResetTime(now) || this.wasWeeklyResetMissed(now)) {
      console.log('Detected missed weekly reset, performing now...');
      await this.performWeeklyReset();
    }
  }

  /**
   * Check if current time is daily reset time
   */
  private isDailyResetTime(date: Date): boolean {
    const resetHour = TOKEN_ECONOMICS.DAILY_RESET_UTC_HOUR;
    const resetMinute = TOKEN_ECONOMICS.DAILY_RESET_UTC_MINUTE;
    
    return date.getUTCHours() === resetHour && 
           date.getUTCMinutes() === resetMinute;
  }

  /**
   * Check if current time is weekly reset time (Monday 00:00 UTC)
   */
  private isWeeklyResetTime(date: Date): boolean {
    return date.getUTCDay() === 1 && this.isDailyResetTime(date);
  }

  /**
   * Check if a daily reset was missed
   */
  private wasDailyResetMissed(now: Date): boolean {
    // Implementation would check last reset timestamp from database
    // For now, return false (assume no missed resets)
    return false;
  }

  /**
   * Check if a weekly reset was missed
   */
  private wasWeeklyResetMissed(now: Date): boolean {
    // Implementation would check last weekly reset timestamp from database
    // For now, return false (assume no missed resets)
    return false;
  }

  /**
   * Calculate next reset time based on period
   */
  private calculateNextResetTime(period: 'daily' | 'weekly'): Date {
    const now = new Date();
    const resetHour = TOKEN_ECONOMICS.DAILY_RESET_UTC_HOUR;
    const resetMinute = TOKEN_ECONOMICS.DAILY_RESET_UTC_MINUTE;

    const nextReset = new Date();
    nextReset.setUTCHours(resetHour, resetMinute, 0, 0);

    if (period === 'daily') {
      // If we've passed today's reset, set for tomorrow
      if (now >= nextReset) {
        nextReset.setUTCDate(nextReset.getUTCDate() + 1);
      }
    } else if (period === 'weekly') {
      // Set for next Monday
      const daysUntilMonday = (1 + 7 - now.getUTCDay()) % 7 || 7;
      nextReset.setUTCDate(now.getUTCDate() + daysUntilMonday);
    }

    return nextReset;
  }

  /**
   * Get reset history
   */
  getResetHistory(): ResetEvent[] {
    return [...this.resetHistory];
  }

  /**
   * Get users needing daily reset (placeholder - would query database)
   */
  private async getUsersNeedingDailyReset(): Promise<string[]> {
    // In real implementation, this would query the database for users
    // who have allowance records that need daily reset
    return [];
  }

  /**
   * Get users needing weekly reset (placeholder - would query database)
   */
  private async getUsersNeedingWeeklyReset(): Promise<string[]> {
    // In real implementation, this would query the database for users
    // who have allowance records that need weekly reset
    return [];
  }

  /**
   * Get user allowance record (placeholder - would query database)
   */
  private async getUserAllowanceRecord(userId: string, featureId: FeatureId): Promise<UserAllowanceRecord | null> {
    // In real implementation, this would query the database
    return null;
  }

  /**
   * Save user allowance record (placeholder - would save to database)
   */
  private async saveUserAllowanceRecord(record: UserAllowanceRecord): Promise<void> {
    // In real implementation, this would save to the database
  }
}

/**
 * Express middleware to check and handle allowance resets
 */
export function dailyResetMiddleware() {
  return async (req: AuthenticatedRequest, res: MiddlewareResponse, next: NextFunction) => {
    try {
      const resetService = DailyResetService.getInstance();
      const userId = req.user?.id; // Assuming user ID is available from auth middleware
      
      if (userId) {
        // Check if user needs any resets
        const dailyFeatures = getDailyAllowanceFeatures();
        const weeklyFeatures = getWeeklyAllowanceFeatures();
        
        // Check daily features
        for (const featureId of dailyFeatures) {
          const needsReset = await resetService.checkUserNeedsReset(userId, featureId as FeatureId);
          if (needsReset) {
            await resetService.resetUserFeatureAllowance(userId, featureId as FeatureId);
          }
        }
        
        // Check weekly features
        for (const featureId of weeklyFeatures) {
          const needsReset = await resetService.checkUserNeedsReset(userId, featureId as FeatureId);
          if (needsReset) {
            await resetService.resetUserFeatureAllowance(userId, featureId as FeatureId);
          }
        }
      }
      
      next();
    } catch (error) {
      console.error('Daily reset middleware error:', error);
      // Don't block the request, just log the error
      next();
    }
  };
}

/**
 * Utility functions
 */
export class ResetUtils {
  /**
   * Get time until next daily reset
   */
  static getTimeUntilNextDailyReset(): number {
    const now = new Date();
    const resetHour = TOKEN_ECONOMICS.DAILY_RESET_UTC_HOUR;
    const resetMinute = TOKEN_ECONOMICS.DAILY_RESET_UTC_MINUTE;
    
    const nextReset = new Date();
    nextReset.setUTCHours(resetHour, resetMinute, 0, 0);
    
    // If we've passed today's reset, set for tomorrow
    if (now >= nextReset) {
      nextReset.setUTCDate(nextReset.getUTCDate() + 1);
    }
    
    return nextReset.getTime() - now.getTime();
  }

  /**
   * Get time until next weekly reset
   */
  static getTimeUntilNextWeeklyReset(): number {
    const now = new Date();
    const resetHour = TOKEN_ECONOMICS.DAILY_RESET_UTC_HOUR;
    const resetMinute = TOKEN_ECONOMICS.DAILY_RESET_UTC_MINUTE;
    
    const nextReset = new Date();
    
    // Set to next Monday
    const daysUntilMonday = (1 + 7 - now.getUTCDay()) % 7 || 7;
    nextReset.setUTCDate(now.getUTCDate() + daysUntilMonday);
    nextReset.setUTCHours(resetHour, resetMinute, 0, 0);
    
    return nextReset.getTime() - now.getTime();
  }

  /**
   * Format time until reset as human readable
   */
  static formatTimeUntilReset(milliseconds: number): string {
    const hours = Math.floor(milliseconds / (1000 * 60 * 60));
    const minutes = Math.floor((milliseconds % (1000 * 60 * 60)) / (1000 * 60));
    
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    } else {
      return `${minutes}m`;
    }
  }
}

export default {
  DailyResetService,
  dailyResetMiddleware,
  ResetUtils,
};
