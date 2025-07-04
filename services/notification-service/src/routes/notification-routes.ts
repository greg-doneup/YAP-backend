import { NotificationController } from '../controllers/notification-controller';
import { NotificationTokenMiddleware } from '../middleware/notification-token';

interface Request {
  user?: { id: string; tokens: number };
  body?: any;
  params?: any;
  query?: any;
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

export class NotificationRoutes {
  private controller: NotificationController;
  private tokenMiddleware: NotificationTokenMiddleware;

  constructor(controller: NotificationController, tokenMiddleware: NotificationTokenMiddleware) {
    this.controller = controller;
    this.tokenMiddleware = tokenMiddleware;
  }

  async handleRequest(req: Request, res: Response): Promise<void> {
    try {
      const { method, url } = req;
      const path = url?.split('?')[0];
      
      // Mock user for testing
      if (!req.user) {
        req.user = { id: 'test-user-123', tokens: 1000 };
      }

      // Route to appropriate handler
      switch (true) {
        case method === 'POST' && path === '/notifications/send':
          if (req.body?.channel && req.body.channel !== 'in_app') {
            await this.handleWithMiddleware(req, res,
              [this.tokenMiddleware.validatePremiumNotifications.bind(this.tokenMiddleware),
               this.tokenMiddleware.processTokenSpending.bind(this.tokenMiddleware)],
              this.controller.sendNotification.bind(this.controller));
          } else {
            await this.controller.sendNotification(req, res);
          }
          break;

        case method === 'POST' && path === '/notifications/campaigns':
          await this.handleWithMiddleware(req, res,
            [this.tokenMiddleware.validateCustomCampaigns.bind(this.tokenMiddleware),
             this.tokenMiddleware.processTokenSpending.bind(this.tokenMiddleware)],
            this.controller.createCampaign.bind(this.controller));
          break;

        case method === 'GET' && path === '/notifications':
          await this.controller.getUserNotifications(req, res);
          break;

        case method === 'GET' && path === '/notifications/preferences':
          await this.controller.getPreferences(req, res);
          break;

        case method === 'PUT' && path === '/notifications/preferences':
          await this.controller.updatePreferences(req, res);
          break;

        case method === 'GET' && path === '/notifications/analytics':
          await this.handleWithMiddleware(req, res,
            [this.tokenMiddleware.validateAnalyticsFeatures.bind(this.tokenMiddleware),
             this.tokenMiddleware.processTokenSpending.bind(this.tokenMiddleware)],
            this.controller.getAnalytics.bind(this.controller));
          break;

        case method === 'GET' && path === '/health':
          await this.controller.healthCheck(req, res);
          break;

        case method === 'GET' && path === '/token-status':
          await this.controller.getTokenStatus(req, res);
          break;

        default:
          res.status(404).json({ error: 'Endpoint not found' });
      }
    } catch (error) {
      console.error('Route handling error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

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

  getAvailableRoutes(): Array<{ method: string; path: string; description: string; tokenCost?: string }> {
    return [
      { method: 'POST', path: '/notifications/send', description: 'Send notification', tokenCost: '0-15' },
      { method: 'POST', path: '/notifications/campaigns', description: 'Create notification campaign', tokenCost: '50-500' },
      { method: 'GET', path: '/notifications', description: 'Get user notifications', tokenCost: '0' },
      { method: 'GET', path: '/notifications/preferences', description: 'Get notification preferences', tokenCost: '0' },
      { method: 'PUT', path: '/notifications/preferences', description: 'Update notification preferences', tokenCost: '0' },
      { method: 'GET', path: '/notifications/analytics', description: 'Get notification analytics', tokenCost: '20-80' },
      { method: 'GET', path: '/health', description: 'Service health check', tokenCost: '0' },
      { method: 'GET', path: '/token-status', description: 'Token status and features', tokenCost: '0' }
    ];
  }
}
