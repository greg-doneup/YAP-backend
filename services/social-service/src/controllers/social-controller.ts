/**
 * Social Service Controller
 * Handles leaderboard staking, challenge pools, and referral rewards
 */

interface SocialRequest {
    user?: {
        id: string;
        address?: string;
    };
    body?: any;
    query?: any;
    params?: any;
}

interface SocialResponse {
    status: (code: number) => SocialResponse;
    json: (data: any) => SocialResponse;
}

import { LeaderboardService } from '../services/leaderboard-service';
import { SocialTokenMiddleware } from '../middleware/social-token';
import { PricingCalculator } from '../../../shared/services/pricing-calculator';

export class SocialController {
    private leaderboardService: LeaderboardService;
    private socialTokenMiddleware: SocialTokenMiddleware;

    constructor() {
        this.leaderboardService = new LeaderboardService();
        this.socialTokenMiddleware = new SocialTokenMiddleware();
    }

    /**
     * Get leaderboard with optional premium features
     * Cost: 50 tokens for premium leaderboard view
     */
    async getLeaderboard(req: SocialRequest, res: SocialResponse) {
        try {
            const { category = 'global', premium = false } = req.query || {};
            const userId = req.user?.id;

            if (premium === 'true') {
                // This would check tokens in production
                console.log(`[SOCIAL] Premium leaderboard access for user ${userId}`);
            }

            const leaderboard = await this.leaderboardService.getLeaderboard(category);

            return res.status(200).json({
                success: true,
                data: leaderboard,
                tokenCost: premium === 'true' ? 50 : 0
            });

        } catch (error) {
            console.error('Error fetching leaderboard:', error);
            return res.status(500).json({ error: 'Failed to fetch leaderboard' });
        }
    }

    /**
     * Join leaderboard competition with staking
     * Cost: Variable based on stake amount
     */
    async joinLeaderboard(req: SocialRequest, res: SocialResponse) {
        try {
            const { leaderboardId, stakeAmount = 0 } = req.body || {};
            const userId = req.user?.id;

            if (!leaderboardId) {
                return res.status(400).json({
                    error: 'Leaderboard ID is required'
                });
            }

            const result = await this.leaderboardService.joinLeaderboard(
                userId!,
                leaderboardId,
                stakeAmount
            );

            return res.status(200).json({
                success: true,
                data: result
            });

        } catch (error) {
            console.error('Error joining leaderboard:', error);
            return res.status(500).json({ error: 'Failed to join leaderboard' });
        }
    }

    /**
     * Get current active leaderboards
     */
    async getCurrentLeaderboards(req: SocialRequest, res: SocialResponse) {
        try {
            const leaderboards = await this.leaderboardService.getCurrentLeaderboards();

            return res.status(200).json({
                success: true,
                data: leaderboards
            });

        } catch (error) {
            console.error('Error fetching current leaderboards:', error);
            return res.status(500).json({ error: 'Failed to fetch leaderboards' });
        }
    }

    /**
     * Get user's staking pool information
     */
    async getStakingInfo(req: SocialRequest, res: SocialResponse) {
        try {
            const userId = req.user?.id;
            const { leaderboardId } = req.params || {};

            if (!leaderboardId) {
                return res.status(400).json({
                    error: 'Leaderboard ID is required'
                });
            }

            const stakingInfo = await this.leaderboardService.getStakingPool(
                leaderboardId,
                userId!
            );

            return res.status(200).json({
                success: true,
                data: stakingInfo
            });

        } catch (error) {
            console.error('Error fetching staking info:', error);
            return res.status(500).json({ error: 'Failed to fetch staking info' });
        }
    }

    /**
     * Process referral reward
     * Reward: 100 tokens for successful referral
     */
    async processReferral(req: SocialRequest, res: SocialResponse) {
        try {
            const { referredUserId, referralCode } = req.body || {};
            const referrerId = req.user?.id;

            if (!referredUserId || !referralCode) {
                return res.status(400).json({
                    error: 'Referred user ID and referral code are required'
                });
            }

            // Mock referral processing - would integrate with token system
            const referralResult = {
                success: true,
                tokensAwarded: 100,
                referralId: `REF_${Date.now()}`
            };

            return res.status(200).json({
                success: true,
                data: referralResult
            });

        } catch (error) {
            console.error('Error processing referral:', error);
            return res.status(500).json({ error: 'Failed to process referral' });
        }
    }

    /**
     * Get user's social statistics
     */
    async getSocialStats(req: SocialRequest, res: SocialResponse) {
        try {
            const userId = req.user?.id;

            // Mock social stats - would integrate with actual user data
            const stats = {
                leaderboardRank: Math.floor(Math.random() * 100) + 1,
                totalStaked: Math.floor(Math.random() * 1000),
                referralsCount: Math.floor(Math.random() * 10),
                tokensEarned: Math.floor(Math.random() * 500),
                activeCompetitions: Math.floor(Math.random() * 3)
            };

            return res.status(200).json({
                success: true,
                data: stats
            });

        } catch (error) {
            console.error('Error fetching social stats:', error);
            return res.status(500).json({ error: 'Failed to fetch social stats' });
        }
    }
}
