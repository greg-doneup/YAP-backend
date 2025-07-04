import { ProfileController } from '../controllers/profile-controller';
import { ProfileTokenMiddleware } from '../middleware/profile-token';

interface Request {
  user?: {
    id: string;
    tokens: number;
  };
  body?: any;
  params?: any;
  method?: string;
  url?: string;
}

interface Response {
  status(code: number): { json(data: any): void };
  json(data: any): void;
}

interface NextFunction {
  (): void;
}

export class ProfileRoutes {
  private controller: ProfileController;
  private tokenMiddleware: ProfileTokenMiddleware;

  constructor(controller: ProfileController, tokenMiddleware: ProfileTokenMiddleware) {
    this.controller = controller;
    this.tokenMiddleware = tokenMiddleware;
  }

  // Route handler - simulates Express routing
  async handleRequest(req: Request, res: Response): Promise<void> {
    try {
      const { method, url } = req;
      const path = url?.split('?')[0]; // Remove query params
      
      // Mock user for testing (in real app, this comes from auth middleware)
      if (!req.user) {
        req.user = {
          id: 'test-user-123',
          tokens: 1000
        };
      }

      // Route to appropriate handler
      if (method === 'GET' && path === '/profile') {
        await this.handleWithMiddleware(
          req, res,
          [this.tokenMiddleware.validateBalanceAccess.bind(this.tokenMiddleware)],
          this.controller.getProfile.bind(this.controller)
        );
      } else if (method === 'GET' && path === '/profile/balance') {
        await this.handleWithMiddleware(
          req, res,
          [this.tokenMiddleware.validateBalanceAccess.bind(this.tokenMiddleware)],
          this.controller.getTokenBalance.bind(this.controller)
        );
      } else if (method === 'POST' && path === '/profile/streak') {
        await this.handleWithMiddleware(
          req, res,
          [
            this.tokenMiddleware.validateStreakManagement.bind(this.tokenMiddleware),
            this.tokenMiddleware.processTokenSpending.bind(this.tokenMiddleware)
          ],
          this.controller.manageStreak.bind(this.controller)
        );
      } else if (method === 'POST' && path?.startsWith('/profile/achievements/')) {
        const achievementId = path.split('/').pop();
        req.params = { achievementId };
        await this.handleWithMiddleware(
          req, res,
          [
            this.tokenMiddleware.validateAchievementUnlock.bind(this.tokenMiddleware),
            this.tokenMiddleware.processTokenSpending.bind(this.tokenMiddleware)
          ],
          this.controller.unlockAchievement.bind(this.controller)
        );
      } else if (method === 'PUT' && path === '/profile/customization') {
        await this.handleWithMiddleware(
          req, res,
          [
            this.tokenMiddleware.validateProfileCustomization.bind(this.tokenMiddleware),
            this.tokenMiddleware.processTokenSpending.bind(this.tokenMiddleware)
          ],
          this.controller.updateCustomization.bind(this.controller)
        );
      } else if (method === 'PUT' && path === '/profile/stats') {
        await this.controller.updateStats(req, res);
      } else if (method === 'GET' && path === '/profile/achievements') {
        await this.controller.getAchievements(req, res);
      } else if (method === 'GET' && path === '/profile/stats') {
        await this.controller.getStats(req, res);
      } else if (method === 'GET' && path === '/health') {
        await this.controller.healthCheck(req, res);
      } else if (method === 'GET' && path === '/token-status') {
        await this.controller.getTokenStatus(req, res);
      } else {
        res.status(404).json({ error: 'Endpoint not found' });
      }
    } catch (error) {
      console.error('Route handling error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // Helper method to run middleware chain
  private async handleWithMiddleware(
    req: Request,
    res: Response,
    middlewares: Array<(req: Request, res: Response, next: NextFunction) => Promise<void>>,
    handler: (req: Request, res: Response) => Promise<void>
  ): Promise<void> {
    let middlewareIndex = 0;
    let middlewareError = false;

    const next: NextFunction = async () => {
      if (middlewareError) return;
      
      if (middlewareIndex < middlewares.length) {
        const middleware = middlewares[middlewareIndex++];
        try {
          await middleware(req, res, next);
        } catch (error) {
          middlewareError = true;
          console.error('Middleware error:', error);
          res.status(500).json({ error: 'Middleware processing failed' });
        }
      } else {
        // All middleware passed, run the handler
        try {
          await handler(req, res);
        } catch (error) {
          console.error('Handler error:', error);
          res.status(500).json({ error: 'Request processing failed' });
        }
      }
    };

    await next();
  }

  // Get available routes for documentation
  getAvailableRoutes(): Array<{ method: string; path: string; description: string; tokenCost?: number }> {
    return [
      {
        method: 'GET',
        path: '/profile',
        description: 'Get complete user profile including tokens, streak, achievements',
        tokenCost: 0
      },
      {
        method: 'GET',
        path: '/profile/balance',
        description: 'Get user token balance and transaction history',
        tokenCost: 0
      },
      {
        method: 'POST',
        path: '/profile/streak',
        description: 'Manage user streak (continue, freeze, repair, boost)',
        tokenCost: 10
      },
      {
        method: 'POST',
        path: '/profile/achievements/{id}',
        description: 'Unlock specific achievement',
        tokenCost: 0
      },
      {
        method: 'PUT',
        path: '/profile/customization',
        description: 'Update profile customization (avatar, badge, theme, title)',
        tokenCost: 30
      },
      {
        method: 'PUT',
        path: '/profile/stats',
        description: 'Update user statistics',
        tokenCost: 0
      },
      {
        method: 'GET',
        path: '/profile/achievements',
        description: 'Get user achievements',
        tokenCost: 0
      },
      {
        method: 'GET',
        path: '/profile/stats',
        description: 'Get user statistics and streak info',
        tokenCost: 0
      },
      {
        method: 'GET',
        path: '/health',
        description: 'Service health check',
        tokenCost: 0
      },
      {
        method: 'GET',
        path: '/token-status',
        description: 'Get current token status and recent transactions',
        tokenCost: 0
      }
    ];
  }
}
