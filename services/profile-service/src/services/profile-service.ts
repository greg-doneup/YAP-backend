interface UserProfile {
  id: string;
  username: string;
  email: string;
  tokens: number;
  streak: {
    current: number;
    longest: number;
    lastActivity: string;
    freezeCount: number;
  };
  achievements: Achievement[];
  customization: {
    avatar: string;
    badge: string;
    theme: string;
    title: string;
  };
  stats: {
    totalLessons: number;
    totalTokensEarned: number;
    totalTokensSpent: number;
    level: number;
    xp: number;
  };
}

interface Achievement {
  id: string;
  name: string;
  description: string;
  unlocked: boolean;
  unlockedAt?: string;
  tokenReward: number;
}

interface RedisClient {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  hget(key: string, field: string): Promise<string | null>;
  hset(key: string, field: string, value: string): Promise<void>;
  hgetall(key: string): Promise<Record<string, string>>;
  incr(key: string): Promise<number>;
  incrby(key: string, amount: number): Promise<number>;
  decrby(key: string, amount: number): Promise<number>;
  zadd(key: string, score: number, member: string): Promise<number>;
  zrange(key: string, start: number, stop: number): Promise<string[]>;
  zrevrange(key: string, start: number, stop: number): Promise<string[]>;
}

export class ProfileService {
  private redisClient: RedisClient;

  constructor(redisClient: RedisClient) {
    this.redisClient = redisClient;
  }

  // Get complete user profile
  async getUserProfile(userId: string): Promise<UserProfile | null> {
    try {
      const profileData = await this.redisClient.hgetall(`user:${userId}:profile`);
      if (!profileData || Object.keys(profileData).length === 0) {
        return null;
      }

      const streak = await this.getStreakData(userId);
      const achievements = await this.getUserAchievements(userId);
      const stats = await this.getUserStats(userId);
      const customization = await this.getCustomizationData(userId);

      return {
        id: userId,
        username: profileData.username || '',
        email: profileData.email || '',
        tokens: parseInt(profileData.tokens || '0'),
        streak,
        achievements,
        customization,
        stats
      };
    } catch (error) {
      console.error('Error getting user profile:', error);
      return null;
    }
  }

  // Get user token balance and transaction history
  async getTokenBalance(userId: string): Promise<{ balance: number; history: any[] }> {
    try {
      const balance = await this.redisClient.get(`user:${userId}:tokens`);
      const historyData = await this.redisClient.zrevrange(`user:${userId}:token_history`, 0, 19);
      
      const history = historyData.map(entry => JSON.parse(entry));

      return {
        balance: parseInt(balance || '0'),
        history
      };
    } catch (error) {
      console.error('Error getting token balance:', error);
      return { balance: 0, history: [] };
    }
  }

  // Manage user streak
  async updateStreak(userId: string, action: string): Promise<{ success: boolean; streak: any }> {
    try {
      const today = new Date().toISOString().split('T')[0];
      const streakKey = `user:${userId}:streak`;
      
      const currentStreak = await this.getStreakData(userId);
      let updatedStreak = { ...currentStreak };

      switch (action) {
        case 'continue':
          updatedStreak = await this.continueStreak(userId, currentStreak, today);
          break;
        case 'freeze':
          updatedStreak = await this.freezeStreak(userId, currentStreak);
          break;
        case 'repair':
          updatedStreak = await this.repairStreak(userId, currentStreak);
          break;
        case 'boost':
          updatedStreak = await this.boostStreak(userId, currentStreak);
          break;
      }

      // Save updated streak
      await this.redisClient.hset(streakKey, 'current', updatedStreak.current.toString());
      await this.redisClient.hset(streakKey, 'longest', updatedStreak.longest.toString());
      await this.redisClient.hset(streakKey, 'lastActivity', updatedStreak.lastActivity);
      await this.redisClient.hset(streakKey, 'freezeCount', updatedStreak.freezeCount.toString());

      return { success: true, streak: updatedStreak };
    } catch (error) {
      console.error('Error updating streak:', error);
      return { success: false, streak: null };
    }
  }

  // Unlock achievement
  async unlockAchievement(userId: string, achievementId: string): Promise<{ success: boolean; achievement?: Achievement }> {
    try {
      const achievementData = await this.redisClient.hgetall(`achievement:${achievementId}`);
      if (!achievementData) {
        return { success: false };
      }

      const achievement: Achievement = {
        id: achievementId,
        name: achievementData.name,
        description: achievementData.description,
        unlocked: true,
        unlockedAt: new Date().toISOString(),
        tokenReward: parseInt(achievementData.tokenReward || '0')
      };

      // Save user achievement
      await this.redisClient.hset(`user:${userId}:achievements`, achievementId, JSON.stringify(achievement));
      
      // Award tokens
      if (achievement.tokenReward > 0) {
        await this.redisClient.incrby(`user:${userId}:tokens`, achievement.tokenReward);
        await this.logTokenTransaction(userId, {
          amount: achievement.tokenReward,
          type: 'achievement_reward',
          metadata: { achievementId, achievementName: achievement.name }
        });
      }

      return { success: true, achievement };
    } catch (error) {
      console.error('Error unlocking achievement:', error);
      return { success: false };
    }
  }

  // Update profile customization
  async updateCustomization(userId: string, type: string, value: string): Promise<{ success: boolean }> {
    try {
      await this.redisClient.hset(`user:${userId}:customization`, type, value);
      return { success: true };
    } catch (error) {
      console.error('Error updating customization:', error);
      return { success: false };
    }
  }

  // Update user stats
  async updateStats(userId: string, statType: string, value: number): Promise<{ success: boolean }> {
    try {
      const statsKey = `user:${userId}:stats`;
      
      if (statType === 'totalLessons' || statType === 'totalTokensEarned' || statType === 'totalTokensSpent') {
        await this.redisClient.incrby(statsKey + ':' + statType, value);
      } else if (statType === 'xp') {
        const newXp = await this.redisClient.incrby(statsKey + ':xp', value);
        const newLevel = Math.floor(newXp / 1000) + 1; // 1000 XP per level
        await this.redisClient.hset(statsKey, 'level', newLevel.toString());
      }

      return { success: true };
    } catch (error) {
      console.error('Error updating stats:', error);
      return { success: false };
    }
  }

  // Helper methods
  private async getStreakData(userId: string): Promise<any> {
    const streakData = await this.redisClient.hgetall(`user:${userId}:streak`);
    return {
      current: parseInt(streakData.current || '0'),
      longest: parseInt(streakData.longest || '0'),
      lastActivity: streakData.lastActivity || '',
      freezeCount: parseInt(streakData.freezeCount || '0')
    };
  }

  private async getUserAchievements(userId: string): Promise<Achievement[]> {
    const achievementData = await this.redisClient.hgetall(`user:${userId}:achievements`);
    return Object.values(achievementData).map(data => JSON.parse(data));
  }

  private async getUserStats(userId: string): Promise<any> {
    const stats = await this.redisClient.hgetall(`user:${userId}:stats`);
    return {
      totalLessons: parseInt(stats.totalLessons || '0'),
      totalTokensEarned: parseInt(stats.totalTokensEarned || '0'),
      totalTokensSpent: parseInt(stats.totalTokensSpent || '0'),
      level: parseInt(stats.level || '1'),
      xp: parseInt(stats.xp || '0')
    };
  }

  private async getCustomizationData(userId: string): Promise<any> {
    const customization = await this.redisClient.hgetall(`user:${userId}:customization`);
    return {
      avatar: customization.avatar || 'default',
      badge: customization.badge || 'none',
      theme: customization.theme || 'default',
      title: customization.title || 'Learner'
    };
  }

  private async continueStreak(userId: string, currentStreak: any, today: string): Promise<any> {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];

    if (currentStreak.lastActivity === yesterdayStr) {
      // Continue streak
      const newCurrent = currentStreak.current + 1;
      return {
        ...currentStreak,
        current: newCurrent,
        longest: Math.max(newCurrent, currentStreak.longest),
        lastActivity: today
      };
    } else if (currentStreak.lastActivity === today) {
      // Already completed today
      return currentStreak;
    } else {
      // Streak broken, start new
      return {
        ...currentStreak,
        current: 1,
        lastActivity: today
      };
    }
  }

  private async freezeStreak(userId: string, currentStreak: any): Promise<any> {
    return {
      ...currentStreak,
      freezeCount: currentStreak.freezeCount + 1
    };
  }

  private async repairStreak(userId: string, currentStreak: any): Promise<any> {
    const today = new Date().toISOString().split('T')[0];
    return {
      ...currentStreak,
      current: currentStreak.current + 1,
      lastActivity: today
    };
  }

  private async boostStreak(userId: string, currentStreak: any): Promise<any> {
    const boostedCurrent = currentStreak.current + 2; // Double progress
    return {
      ...currentStreak,
      current: boostedCurrent,
      longest: Math.max(boostedCurrent, currentStreak.longest)
    };
  }

  private async logTokenTransaction(userId: string, transaction: any): Promise<void> {
    const logEntry = JSON.stringify({
      ...transaction,
      timestamp: new Date().toISOString(),
      userId
    });
    
    const score = Date.now();
    await this.redisClient.zadd(`user:${userId}:token_history`, score, logEntry);
  }
}
