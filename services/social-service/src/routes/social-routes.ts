/**
 * Social Service Routes
 * Handles leaderboard staking, challenge pools, and referral rewards
 */

import { SocialController } from '../controllers/social-controller';
import { SocialTokenMiddleware } from '../middleware/social-token';

interface RouteHandler {
    (req: any, res: any): Promise<any>;
}

export class SocialRoutes {
    private controller: SocialController;
    private tokenMiddleware: SocialTokenMiddleware;

    constructor() {
        this.controller = new SocialController();
        this.tokenMiddleware = new SocialTokenMiddleware();
    }

    /**
     * Initialize all social service routes
     */
    public initializeRoutes(): Array<{
        method: string;
        path: string;
        middleware?: any[];
        handler: RouteHandler;
    }> {
        return [
            // Leaderboard routes
            {
                method: 'GET',
                path: '/leaderboard',
                handler: this.controller.getLeaderboard.bind(this.controller)
            },
            {
                method: 'GET',
                path: '/leaderboards/current',
                handler: this.controller.getCurrentLeaderboards.bind(this.controller)
            },
            {
                method: 'POST',
                path: '/leaderboard/join',
                middleware: [this.tokenMiddleware.validateLeaderboardStaking],
                handler: this.controller.joinLeaderboard.bind(this.controller)
            },
            {
                method: 'GET',
                path: '/leaderboard/:leaderboardId/staking',
                handler: this.controller.getStakingInfo.bind(this.controller)
            },

            // Referral routes
            {
                method: 'POST',
                path: '/referral/process',
                handler: this.controller.processReferral.bind(this.controller)
            },

            // Social stats routes
            {
                method: 'GET',
                path: '/stats',
                handler: this.controller.getSocialStats.bind(this.controller)
            }
        ];
    }

    /**
     * Health check endpoint
     */
    public async healthCheck(req: any, res: any) {
        try {
            return res.status(200).json({
                service: 'social-service',
                status: 'healthy',
                timestamp: new Date().toISOString(),
                features: [
                    'leaderboard_staking',
                    'challenge_pools',
                    'referral_rewards'
                ]
            });
        } catch (error) {
            return res.status(500).json({
                service: 'social-service',
                status: 'unhealthy',
                error: 'Health check failed'
            });
        }
    }

    /**
     * Token integration status endpoint
     */
    public async tokenStatus(req: any, res: any) {
        try {
            return res.status(200).json({
                tokenIntegration: 'active',
                features: {
                    leaderboardStaking: {
                        enabled: true,
                        minStake: 10,
                        maxStake: 1000,
                        poolRewards: 'active'
                    },
                    challengePools: {
                        enabled: true,
                        entryFees: 'variable',
                        prizeDistribution: 'automatic'
                    },
                    referralRewards: {
                        enabled: true,
                        signupReward: 100,
                        lessonReward: 50,
                        examReward: 150
                    }
                }
            });
        } catch (error) {
            return res.status(500).json({
                error: 'Token status check failed'
            });
        }
    }
}

// Export route configuration for Express app
export const socialRoutes = new SocialRoutes().initializeRoutes();
export const socialHealthCheck = new SocialRoutes().healthCheck;
export const socialTokenStatus = new SocialRoutes().tokenStatus;
