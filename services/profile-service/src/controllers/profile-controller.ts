import { ProfileService } from '../services/profile-service';
import { ProfileTokenMiddleware } from '../middleware/profile-token';

interface Request {
  user?: {
    id: string;
    tokens: number;
  };
  body?: any;
  params?: any;
}

interface Response {
  status(code: number): { json(data: any): void };
  json(data: any): void;
}

export class ProfileController {
  private profileService: ProfileService;
  private tokenMiddleware: ProfileTokenMiddleware;

  constructor(profileService: ProfileService, tokenMiddleware: ProfileTokenMiddleware) {
    this.profileService = profileService;
    this.tokenMiddleware = tokenMiddleware;
  }

  // Get user profile
  async getProfile(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ error: 'User not authenticated' });
        return;
      }

      const profile = await this.profileService.getUserProfile(userId);
      if (!profile) {
        res.status(404).json({ error: 'Profile not found' });
        return;
      }

      res.json({
        success: true,
        profile
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to get profile' });
    }
  }

  // Get token balance and history
  async getTokenBalance(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ error: 'User not authenticated' });
        return;
      }

      const tokenData = await this.profileService.getTokenBalance(userId);
      
      res.json({
        success: true,
        balance: tokenData.balance,
        history: tokenData.history
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to get token balance' });
    }
  }

  // Manage streak
  async manageStreak(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      const { action } = req.body || {};

      if (!userId) {
        res.status(401).json({ error: 'User not authenticated' });
        return;
      }

      if (!action || !['continue', 'freeze', 'repair', 'boost'].includes(action)) {
        res.status(400).json({ error: 'Invalid streak action' });
        return;
      }

      const result = await this.profileService.updateStreak(userId, action);
      
      if (!result.success) {
        res.status(500).json({ error: 'Failed to update streak' });
        return;
      }

      res.json({
        success: true,
        streak: result.streak,
        message: `Streak ${action} successful`
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to manage streak' });
    }
  }

  // Unlock achievement
  async unlockAchievement(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      const { achievementId } = req.params || {};

      if (!userId) {
        res.status(401).json({ error: 'User not authenticated' });
        return;
      }

      if (!achievementId) {
        res.status(400).json({ error: 'Achievement ID required' });
        return;
      }

      const result = await this.profileService.unlockAchievement(userId, achievementId);
      
      if (!result.success) {
        res.status(404).json({ error: 'Achievement not found or already unlocked' });
        return;
      }

      res.json({
        success: true,
        achievement: result.achievement,
        message: 'Achievement unlocked successfully'
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to unlock achievement' });
    }
  }

  // Update profile customization
  async updateCustomization(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      const { customizationType, value } = req.body || {};

      if (!userId) {
        res.status(401).json({ error: 'User not authenticated' });
        return;
      }

      if (!customizationType || !value) {
        res.status(400).json({ error: 'Customization type and value required' });
        return;
      }

      const validTypes = ['avatar', 'badge', 'theme', 'title'];
      if (!validTypes.includes(customizationType)) {
        res.status(400).json({ error: 'Invalid customization type' });
        return;
      }

      const result = await this.profileService.updateCustomization(userId, customizationType, value);
      
      if (!result.success) {
        res.status(500).json({ error: 'Failed to update customization' });
        return;
      }

      res.json({
        success: true,
        message: 'Customization updated successfully'
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to update customization' });
    }
  }

  // Update user stats
  async updateStats(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      const { statType, value } = req.body || {};

      if (!userId) {
        res.status(401).json({ error: 'User not authenticated' });
        return;
      }

      if (!statType || value === undefined) {
        res.status(400).json({ error: 'Stat type and value required' });
        return;
      }

      const validStats = ['totalLessons', 'totalTokensEarned', 'totalTokensSpent', 'xp'];
      if (!validStats.includes(statType)) {
        res.status(400).json({ error: 'Invalid stat type' });
        return;
      }

      const result = await this.profileService.updateStats(userId, statType, value);
      
      if (!result.success) {
        res.status(500).json({ error: 'Failed to update stats' });
        return;
      }

      res.json({
        success: true,
        message: 'Stats updated successfully'
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to update stats' });
    }
  }

  // Get user achievements
  async getAchievements(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ error: 'User not authenticated' });
        return;
      }

      const profile = await this.profileService.getUserProfile(userId);
      if (!profile) {
        res.status(404).json({ error: 'Profile not found' });
        return;
      }

      res.json({
        success: true,
        achievements: profile.achievements
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to get achievements' });
    }
  }

  // Get user stats
  async getStats(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ error: 'User not authenticated' });
        return;
      }

      const profile = await this.profileService.getUserProfile(userId);
      if (!profile) {
        res.status(404).json({ error: 'Profile not found' });
        return;
      }

      res.json({
        success: true,
        stats: profile.stats,
        streak: profile.streak
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to get stats' });
    }
  }

  // Health check endpoint
  async healthCheck(req: Request, res: Response): Promise<void> {
    res.json({
      service: 'profile-service',
      status: 'healthy',
      timestamp: new Date().toISOString(),
      features: [
        'user_profiles',
        'token_balance',
        'streak_management',
        'achievements',
        'customization',
        'stats_tracking'
      ]
    });
  }

  // Token status endpoint
  async getTokenStatus(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ error: 'User not authenticated' });
        return;
      }

      const tokenData = await this.profileService.getTokenBalance(userId);
      
      res.json({
        success: true,
        userId,
        balance: tokenData.balance,
        recentTransactions: tokenData.history.slice(0, 5)
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to get token status' });
    }
  }
}
