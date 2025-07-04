/**
 * Social Service Application
 * Token-integrated social features including leaderboards, challenges, and referrals
 */

import { socialRoutes, socialHealthCheck, socialTokenStatus } from './routes/social-routes';

interface MockApp {
    routes: any[];
    middleware: any[];
}

interface MockRequest {
    method: string;
    path: string;
    user?: { id: string };
    body?: any;
    query?: any;
    params?: any;
}

interface MockResponse {
    status: (code: number) => MockResponse;
    json: (data: any) => MockResponse;
}

/**
 * Mock Express-like application for Social Service
 */
class SocialServiceApp {
    private routes: any[] = [];
    private middleware: any[] = [];

    constructor() {
        this.initializeRoutes();
        this.setupErrorHandling();
    }

    private initializeRoutes() {
        // Add all social routes
        this.routes = [
            ...socialRoutes,
            {
                method: 'GET',
                path: '/health',
                handler: socialHealthCheck
            },
            {
                method: 'GET',
                path: '/token-status',
                handler: socialTokenStatus
            }
        ];

        console.log('[SOCIAL-SERVICE] Initialized routes:');
        this.routes.forEach(route => {
            console.log(`  ${route.method} ${route.path}`);
        });
    }

    private setupErrorHandling() {
        // Global error handler
        this.middleware.push(async (req: MockRequest, res: MockResponse, error: Error) => {
            console.error('[SOCIAL-SERVICE] Error:', error);
            return res.status(500).json({
                error: 'Internal server error',
                service: 'social-service'
            });
        });
    }

    /**
     * Process a request through the social service
     */
    public async processRequest(req: MockRequest): Promise<any> {
        try {
            const route = this.routes.find(r => 
                r.method.toLowerCase() === req.method.toLowerCase() && 
                this.matchPath(r.path, req.path)
            );

            if (!route) {
                return {
                    status: 404,
                    data: { error: 'Route not found' }
                };
            }

            // Mock response object
            let responseData: any = {};
            let statusCode = 200;

            const mockRes: MockResponse = {
                status: (code: number) => {
                    statusCode = code;
                    return mockRes;
                },
                json: (data: any) => {
                    responseData = data;
                    return mockRes;
                }
            };

            // Execute route handler
            await route.handler(req, mockRes);

            return {
                status: statusCode,
                data: responseData
            };

        } catch (error) {
            console.error('[SOCIAL-SERVICE] Request processing error:', error);
            return {
                status: 500,
                data: { error: 'Internal server error' }
            };
        }
    }

    private matchPath(routePath: string, requestPath: string): boolean {
        // Simple path matching - convert :param to match any segment
        const routePattern = routePath.replace(/:([^/]+)/g, '([^/]+)');
        const regex = new RegExp(`^${routePattern}$`);
        return regex.test(requestPath);
    }

    /**
     * Get service information
     */
    public getServiceInfo() {
        return {
            name: 'social-service',
            version: '1.0.0',
            features: [
                'leaderboard_staking',
                'challenge_pools', 
                'referral_rewards',
                'social_stats'
            ],
            tokenIntegration: true,
            routeCount: this.routes.length
        };
    }
}

// Export the service app
export const socialServiceApp = new SocialServiceApp();

// Example usage and testing
if (require.main === module) {
    console.log('[SOCIAL-SERVICE] Starting Social Service...');
    console.log('[SOCIAL-SERVICE] Service Info:', socialServiceApp.getServiceInfo());

    // Test some routes
    async function testRoutes() {
        console.log('\n[SOCIAL-SERVICE] Testing routes...');

        // Test health check
        const healthResponse = await socialServiceApp.processRequest({
            method: 'GET',
            path: '/health'
        });
        console.log('Health Check:', healthResponse);

        // Test token status
        const tokenResponse = await socialServiceApp.processRequest({
            method: 'GET',
            path: '/token-status'
        });
        console.log('Token Status:', tokenResponse);

        // Test leaderboard
        const leaderboardResponse = await socialServiceApp.processRequest({
            method: 'GET',
            path: '/leaderboard',
            query: { category: 'global' }
        });
        console.log('Leaderboard:', leaderboardResponse);
    }

    testRoutes().catch(console.error);
}
