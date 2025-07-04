import { ContentController } from '../controllers/content-controller';
import { ContentTokenMiddleware } from '../middleware/content-token';

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

export class ContentRoutes {
  private controller: ContentController;
  private tokenMiddleware: ContentTokenMiddleware;

  constructor(controller: ContentController, tokenMiddleware: ContentTokenMiddleware) {
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
        // Content management routes
        case method === 'POST' && path === '/content':
          await this.handleWithMiddleware(req, res,
            [this.tokenMiddleware.validateContentPublishing.bind(this.tokenMiddleware),
             this.tokenMiddleware.processTokenSpending.bind(this.tokenMiddleware)],
            this.controller.createContent.bind(this.controller));
          break;

        case method === 'GET' && path?.startsWith('/content/') && !path?.includes('/access'):
          const contentId = path?.split('/')[2];
          if (contentId) {
            req.params = { contentId };
            await this.controller.getContent(req, res);
          } else {
            res.status(400).json({ error: 'Content ID required' });
          }
          break;

        case method === 'POST' && path?.startsWith('/content/') && path?.endsWith('/access'):
          const accessContentId = path?.split('/')[2];
          if (accessContentId) {
            req.params = { contentId: accessContentId };
            await this.handleWithMiddleware(req, res,
              [this.tokenMiddleware.validatePremiumContentAccess.bind(this.tokenMiddleware),
               this.tokenMiddleware.processTokenSpending.bind(this.tokenMiddleware)],
              this.controller.accessContent.bind(this.controller));
          } else {
            res.status(400).json({ error: 'Content ID required' });
          }
          break;

        case method === 'PUT' && path?.startsWith('/content/'):
          const updateContentId = path?.split('/')[2];
          if (updateContentId) {
            req.params = { contentId: updateContentId };
            await this.controller.updateContent(req, res);
          } else {
            res.status(400).json({ error: 'Content ID required' });
          }
          break;

        case method === 'GET' && path === '/content/search':
          await this.controller.searchContent(req, res);
          break;

        // Creation tools routes
        case method === 'GET' && path === '/tools':
          await this.controller.getCreationTools(req, res);
          break;

        case method === 'POST' && path?.startsWith('/tools/'):
          const toolId = path?.split('/')[2];
          if (toolId) {
            req.params = { toolId };
            await this.handleWithMiddleware(req, res,
              [this.tokenMiddleware.validateContentCreation.bind(this.tokenMiddleware),
               this.tokenMiddleware.processTokenSpending.bind(this.tokenMiddleware)],
              this.controller.useCreationTool.bind(this.controller));
          } else {
            res.status(400).json({ error: 'Tool ID required' });
          }
          break;

        // Marketplace routes
        case method === 'POST' && path === '/marketplace/transaction':
          await this.handleWithMiddleware(req, res,
            [this.tokenMiddleware.validateMarketplaceTransaction.bind(this.tokenMiddleware),
             this.tokenMiddleware.processTokenSpending.bind(this.tokenMiddleware)],
            this.controller.createMarketplaceTransaction.bind(this.controller));
          break;

        case method === 'GET' && path === '/marketplace/transactions':
          await this.controller.getUserTransactions(req, res);
          break;

        // User content routes
        case method === 'GET' && path === '/user/created':
          await this.controller.getUserCreatedContent(req, res);
          break;

        case method === 'GET' && path === '/user/accessed':
          await this.controller.getUserAccessedContent(req, res);
          break;

        // Analytics routes
        case method === 'GET' && path === '/stats':
          await this.controller.getContentStats(req, res);
          break;

        // Utility routes
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
      { method: 'POST', path: '/content', description: 'Create/publish content', tokenCost: '25-60' },
      { method: 'GET', path: '/content/{id}', description: 'Get content details', tokenCost: '0' },
      { method: 'POST', path: '/content/{id}/access', description: 'Access premium content', tokenCost: '20-75' },
      { method: 'PUT', path: '/content/{id}', description: 'Update content (owner only)', tokenCost: '0' },
      { method: 'GET', path: '/content/search', description: 'Search content catalog', tokenCost: '0' },
      { method: 'GET', path: '/tools', description: 'Get available creation tools', tokenCost: '0' },
      { method: 'POST', path: '/tools/{id}', description: 'Use creation tool', tokenCost: '50-125' },
      { method: 'POST', path: '/marketplace/transaction', description: 'Create marketplace transaction', tokenCost: '3-10% fee' },
      { method: 'GET', path: '/marketplace/transactions', description: 'Get user transactions', tokenCost: '0' },
      { method: 'GET', path: '/user/created', description: 'Get user created content', tokenCost: '0' },
      { method: 'GET', path: '/user/accessed', description: 'Get user accessed content', tokenCost: '0' },
      { method: 'GET', path: '/stats', description: 'Get content analytics', tokenCost: '0' },
      { method: 'GET', path: '/health', description: 'Service health check', tokenCost: '0' },
      { method: 'GET', path: '/token-status', description: 'Token status and features', tokenCost: '0' }
    ];
  }
}
