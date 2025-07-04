/**
 * Leaderboard Service
 * 
 * Manages leaderboard functionality with token staking:
 * - Weekly leaderboard competitions with token staking
 * - Prize pool management and distribution
 * - User ranking and scoring systems
 * - Staking reward calculations
 */

interface LeaderboardEntry {
  userId: string;
  userName: string;
  score: number;
  rank: number;
  staked: boolean;
  stakeAmount: number;
  progress: {
    lessonsCompleted: number;
    examsPass: number;
    streakDays: number;
  };
}

interface LeaderboardCompetition {
  id: string;
  name: string;
  competitionWeek: string;
  startDate: Date;
  endDate: Date;
  category: 'overall' | 'lessons' | 'pronunciation' | 'streaks';
  prizePool: {
    totalTokens: number;
    distribution: { [rank: string]: number };
  };
  participants: LeaderboardEntry[];
  stakingEnabled: boolean;
  minStake: number;
  maxStake: number;
}

interface StakingPool {
  leaderboardId: string;
  competitionWeek: string;
  totalStaked: number;
  participantCount: number;
  prizeDistribution: { [rank: string]: string };
  stakeholders: Array<{
    userId: string;
    stakeAmount: number;
    stakingTime: Date;
  }>;
}

export class LeaderboardService {
  private leaderboards: Map<string, LeaderboardCompetition> = new Map();
  private stakingPools: Map<string, StakingPool> = new Map();

  constructor() {
    this.initializeDefaultLeaderboards();
  }

  /**
   * Get current week's leaderboards
   */
  public async getCurrentLeaderboards(): Promise<LeaderboardCompetition[]> {
    try {
      const currentWeek = this.getCurrentCompetitionWeek();
      const activeLeaderboards = Array.from(this.leaderboards.values())
        .filter(lb => lb.competitionWeek === currentWeek);

      // Update scores and rankings
      for (const leaderboard of activeLeaderboards) {
        await this.updateLeaderboardScores(leaderboard);
      }

      return activeLeaderboards;

    } catch (error) {
      console.error('[LEADERBOARD] Error getting current leaderboards:', error);
      return [];
    }
  }

  /**
   * Get specific leaderboard with current rankings
   */
  public async getLeaderboard(leaderboardId: string): Promise<LeaderboardCompetition | null> {
    try {
      const leaderboard = this.leaderboards.get(leaderboardId);
      if (!leaderboard) {
        return null;
      }

      await this.updateLeaderboardScores(leaderboard);
      return leaderboard;

    } catch (error) {
      console.error('[LEADERBOARD] Error getting leaderboard:', error);
      return null;
    }
  }

  /**
   * Join leaderboard competition with optional staking
   */
  public async joinLeaderboard(
    userId: string, 
    leaderboardId: string, 
    stakeAmount?: number
  ): Promise<{
    success: boolean;
    rank?: number;
    staked?: boolean;
    poolInfo?: any;
    error?: string;
  }> {
    try {
      const leaderboard = this.leaderboards.get(leaderboardId);
      if (!leaderboard) {
        return { success: false, error: 'Leaderboard not found' };
      }

      // Check if user already participated
      const existingEntry = leaderboard.participants.find(p => p.userId === userId);
      if (existingEntry) {
        return { 
          success: false, 
          error: 'Already participating in this leaderboard',
          rank: existingEntry.rank,
          staked: existingEntry.staked
        };
      }

      // Create user entry
      const userEntry: LeaderboardEntry = {
        userId,
        userName: `User_${userId.slice(-6)}`, // Mock username
        score: 0,
        rank: leaderboard.participants.length + 1,
        staked: !!stakeAmount,
        stakeAmount: stakeAmount || 0,
        progress: {
          lessonsCompleted: 0,
          examsPass: 0,
          streakDays: 0
        }
      };

      leaderboard.participants.push(userEntry);

      // Handle staking if provided
      let poolInfo = null;
      if (stakeAmount && stakeAmount > 0) {
        poolInfo = await this.addToStakingPool(leaderboardId, userId, stakeAmount);
      }

      // Update rankings
      await this.updateLeaderboardScores(leaderboard);

      return {
        success: true,
        rank: userEntry.rank,
        staked: userEntry.staked,
        poolInfo
      };

    } catch (error) {
      console.error('[LEADERBOARD] Error joining leaderboard:', error);
      return { success: false, error: 'Failed to join leaderboard' };
    }
  }

  /**
   * Update user score on leaderboard
   */
  public async updateUserScore(
    userId: string, 
    leaderboardId: string, 
    scoreIncrease: number,
    activityType: 'lesson' | 'exam' | 'streak'
  ): Promise<void> {
    try {
      const leaderboard = this.leaderboards.get(leaderboardId);
      if (!leaderboard) {
        return;
      }

      const userEntry = leaderboard.participants.find(p => p.userId === userId);
      if (!userEntry) {
        return;
      }

      // Update score and progress
      userEntry.score += scoreIncrease;
      
      switch (activityType) {
        case 'lesson':
          userEntry.progress.lessonsCompleted++;
          break;
        case 'exam':
          userEntry.progress.examsPass++;
          break;
        case 'streak':
          userEntry.progress.streakDays++;
          break;
      }

      // Update rankings
      await this.updateLeaderboardScores(leaderboard);

      console.log(`[LEADERBOARD] Updated score for user ${userId}: +${scoreIncrease} (${activityType})`);

    } catch (error) {
      console.error('[LEADERBOARD] Error updating user score:', error);
    }
  }

  /**
   * Get user's position on leaderboards
   */
  public async getUserLeaderboardStatus(userId: string): Promise<{
    participatingIn: Array<{
      leaderboardId: string;
      name: string;
      rank: number;
      score: number;
      staked: boolean;
      stakeAmount: number;
    }>;
    totalStaked: number;
    potentialWinnings: number;
  }> {
    try {
      const participatingIn = [];
      let totalStaked = 0;
      let potentialWinnings = 0;

      for (const leaderboard of this.leaderboards.values()) {
        const userEntry = leaderboard.participants.find(p => p.userId === userId);
        if (userEntry) {
          participatingIn.push({
            leaderboardId: leaderboard.id,
            name: leaderboard.name,
            rank: userEntry.rank,
            score: userEntry.score,
            staked: userEntry.staked,
            stakeAmount: userEntry.stakeAmount
          });

          totalStaked += userEntry.stakeAmount;

          // Calculate potential winnings if in top 3
          if (userEntry.rank <= 3) {
            const pool = this.stakingPools.get(`${leaderboard.id}_${leaderboard.competitionWeek}`);
            if (pool) {
              potentialWinnings += this.calculatePotentialWinnings(userEntry.rank, pool);
            }
          }
        }
      }

      return {
        participatingIn,
        totalStaked,
        potentialWinnings
      };

    } catch (error) {
      console.error('[LEADERBOARD] Error getting user status:', error);
      return {
        participatingIn: [],
        totalStaked: 0,
        potentialWinnings: 0
      };
    }
  }

  /**
   * Distribute weekly rewards
   */
  public async distributeWeeklyRewards(leaderboardId: string): Promise<{
    distributed: Array<{ userId: string; rank: number; reward: number }>;
    totalDistributed: number;
  }> {
    try {
      const leaderboard = this.leaderboards.get(leaderboardId);
      if (!leaderboard) {
        return { distributed: [], totalDistributed: 0 };
      }

      const pool = this.stakingPools.get(`${leaderboardId}_${leaderboard.competitionWeek}`);
      if (!pool) {
        return { distributed: [], totalDistributed: 0 };
      }

      // Sort participants by rank
      const rankedParticipants = leaderboard.participants
        .filter(p => p.staked)
        .sort((a, b) => a.rank - b.rank)
        .slice(0, 3); // Top 3 winners

      const distributed = [];
      let totalDistributed = 0;

      for (const participant of rankedParticipants) {
        const reward = this.calculateReward(participant.rank, pool);
        if (reward > 0) {
          distributed.push({
            userId: participant.userId,
            rank: participant.rank,
            reward
          });
          totalDistributed += reward;

          console.log(`[LEADERBOARD] Reward distributed: ${reward} tokens to user ${participant.userId} (rank ${participant.rank})`);
        }
      }

      return { distributed, totalDistributed };

    } catch (error) {
      console.error('[LEADERBOARD] Error distributing rewards:', error);
      return { distributed: [], totalDistributed: 0 };
    }
  }

  /**
   * Get staking pool information
   */
  public getStakingPool(leaderboardId: string, competitionWeek: string): StakingPool | null {
    return this.stakingPools.get(`${leaderboardId}_${competitionWeek}`) || null;
  }

  /**
   * Initialize default leaderboards
   */
  private initializeDefaultLeaderboards(): void {
    const currentWeek = this.getCurrentCompetitionWeek();
    const weekStart = this.getWeekStart();
    const weekEnd = this.getWeekEnd();

    const defaultLeaderboards: LeaderboardCompetition[] = [
      {
        id: 'overall_weekly',
        name: 'Overall Weekly Champions',
        competitionWeek: currentWeek,
        startDate: weekStart,
        endDate: weekEnd,
        category: 'overall',
        prizePool: { totalTokens: 0, distribution: { '1': 50, '2': 30, '3': 20 } },
        participants: [],
        stakingEnabled: true,
        minStake: 1,
        maxStake: 50
      },
      {
        id: 'lessons_weekly',
        name: 'Lesson Masters',
        competitionWeek: currentWeek,
        startDate: weekStart,
        endDate: weekEnd,
        category: 'lessons',
        prizePool: { totalTokens: 0, distribution: { '1': 50, '2': 30, '3': 20 } },
        participants: [],
        stakingEnabled: true,
        minStake: 1,
        maxStake: 30
      },
      {
        id: 'pronunciation_weekly',
        name: 'Pronunciation Pros',
        competitionWeek: currentWeek,
        startDate: weekStart,
        endDate: weekEnd,
        category: 'pronunciation',
        prizePool: { totalTokens: 0, distribution: { '1': 50, '2': 30, '3': 20 } },
        participants: [],
        stakingEnabled: true,
        minStake: 1,
        maxStake: 25
      }
    ];

    defaultLeaderboards.forEach(lb => {
      this.leaderboards.set(lb.id, lb);
      this.stakingPools.set(`${lb.id}_${lb.competitionWeek}`, {
        leaderboardId: lb.id,
        competitionWeek: lb.competitionWeek,
        totalStaked: 0,
        participantCount: 0,
        prizeDistribution: { '1': '50%', '2': '30%', '3': '20%' },
        stakeholders: []
      });
    });
  }

  /**
   * Update leaderboard scores and rankings
   */
  private async updateLeaderboardScores(leaderboard: LeaderboardCompetition): Promise<void> {
    try {
      // Sort participants by score (descending)
      leaderboard.participants.sort((a, b) => b.score - a.score);

      // Update rankings
      leaderboard.participants.forEach((participant, index) => {
        participant.rank = index + 1;
      });

      // Update prize pool total
      const pool = this.stakingPools.get(`${leaderboard.id}_${leaderboard.competitionWeek}`);
      if (pool) {
        leaderboard.prizePool.totalTokens = pool.totalStaked;
      }

    } catch (error) {
      console.error('[LEADERBOARD] Error updating scores:', error);
    }
  }

  /**
   * Add user to staking pool
   */
  private async addToStakingPool(
    leaderboardId: string, 
    userId: string, 
    stakeAmount: number
  ): Promise<any> {
    try {
      const currentWeek = this.getCurrentCompetitionWeek();
      const poolKey = `${leaderboardId}_${currentWeek}`;
      const pool = this.stakingPools.get(poolKey);

      if (pool) {
        pool.totalStaked += stakeAmount;
        pool.participantCount++;
        pool.stakeholders.push({
          userId,
          stakeAmount,
          stakingTime: new Date()
        });

        return {
          totalStaked: pool.totalStaked,
          participantCount: pool.participantCount,
          userStake: stakeAmount
        };
      }

      return null;

    } catch (error) {
      console.error('[LEADERBOARD] Error adding to staking pool:', error);
      return null;
    }
  }

  /**
   * Calculate potential winnings
   */
  private calculatePotentialWinnings(rank: number, pool: StakingPool): number {
    const percentages = { 1: 0.5, 2: 0.3, 3: 0.2 };
    const percentage = percentages[rank as keyof typeof percentages] || 0;
    return Math.floor(pool.totalStaked * percentage);
  }

  /**
   * Calculate actual reward
   */
  private calculateReward(rank: number, pool: StakingPool): number {
    return this.calculatePotentialWinnings(rank, pool);
  }

  /**
   * Get current competition week
   */
  private getCurrentCompetitionWeek(): string {
    const now = new Date();
    const year = now.getFullYear();
    const weekNumber = this.getWeekNumber(now);
    return `${year}-W${weekNumber.toString().padStart(2, '0')}`;
  }

  /**
   * Get week number
   */
  private getWeekNumber(date: Date): number {
    const firstDayOfYear = new Date(date.getFullYear(), 0, 1);
    const pastDaysOfYear = (date.getTime() - firstDayOfYear.getTime()) / 86400000;
    return Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
  }

  /**
   * Get week start date
   */
  private getWeekStart(): Date {
    const now = new Date();
    const day = now.getDay();
    const diff = now.getDate() - day + (day === 0 ? -6 : 1); // adjust when day is sunday
    return new Date(now.setDate(diff));
  }

  /**
   * Get week end date
   */
  private getWeekEnd(): Date {
    const start = this.getWeekStart();
    return new Date(start.getTime() + 6 * 24 * 60 * 60 * 1000);
  }
}

export default LeaderboardService;
