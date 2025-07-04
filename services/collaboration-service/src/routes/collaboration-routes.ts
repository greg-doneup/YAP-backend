import { CollaborationController } from '../controllers/collaboration-controller';
import { CollaborationTokenMiddleware } from '../middleware/collaboration-token';

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

export class CollaborationRoutes {
  private controller: CollaborationController;
  private tokenMiddleware: CollaborationTokenMiddleware;

  constructor(controller: CollaborationController, tokenMiddleware: CollaborationTokenMiddleware) {
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
        // Group routes
        case method === 'POST' && path === '/groups':
          await this.handleWithMiddleware(req, res,
            [this.tokenMiddleware.validateGroupCreation.bind(this.tokenMiddleware),
             this.tokenMiddleware.processTokenSpending.bind(this.tokenMiddleware)],
            this.controller.createGroup.bind(this.controller));
          break;

        case method === 'POST' && path?.startsWith('/groups/') && path?.endsWith('/join'):
          const groupId = path?.split('/')[2];
          if (!groupId) {
            res.status(400).json({ error: 'Group ID required' });
            break;
          }
          req.params = { groupId };
          await this.controller.joinGroup(req, res);
          break;

        case method === 'GET' && path === '/groups':
          await this.controller.findGroups(req, res);
          break;

        case method === 'GET' && path === '/user/groups':
          await this.controller.getUserGroups(req, res);
          break;

        // Session routes
        case method === 'POST' && path === '/sessions':
          await this.handleWithMiddleware(req, res,
            [this.tokenMiddleware.validateSessionHosting.bind(this.tokenMiddleware),
             this.tokenMiddleware.processTokenSpending.bind(this.tokenMiddleware)],
            this.controller.createSession.bind(this.controller));
          break;

        case method === 'POST' && path?.startsWith('/sessions/') && path?.endsWith('/join'):
          const sessionId = path?.split('/')[2];
          if (!sessionId) {
            res.status(400).json({ error: 'Session ID required' });
            break;
          }
          req.params = { sessionId };
          await this.controller.joinSession(req, res);
          break;

        case method === 'GET' && path === '/sessions':
          await this.controller.findSessions(req, res);
          break;

        case method === 'GET' && path === '/user/sessions':
          await this.controller.getUserSessions(req, res);
          break;

        // Mentorship routes
        case method === 'POST' && path?.startsWith('/mentorship/'):
          const mentorId = path?.split('/')[2];
          if (!mentorId) {
            res.status(400).json({ error: 'Mentor ID required' });
            break;
          }
          req.params = { mentorId };
          await this.handleWithMiddleware(req, res,
            [this.tokenMiddleware.validateMentorshipAccess.bind(this.tokenMiddleware),
             this.tokenMiddleware.processTokenSpending.bind(this.tokenMiddleware)],
            this.controller.requestMentorship.bind(this.controller));
          break;

        case method === 'GET' && path === '/user/mentorships':
          await this.controller.getMentorshipSessions(req, res);
          break;

        // Stats and utility routes
        case method === 'GET' && path === '/stats':
          await this.controller.getCollaborationStats(req, res);
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

  getAvailableRoutes(): Array<{ method: string; path: string; description: string; tokenCost?: number }> {
    return [
      { method: 'POST', path: '/groups', description: 'Create study group', tokenCost: 25 },
      { method: 'POST', path: '/groups/{id}/join', description: 'Join study group', tokenCost: 0 },
      { method: 'GET', path: '/groups', description: 'Find available groups', tokenCost: 0 },
      { method: 'GET', path: '/user/groups', description: 'Get user groups', tokenCost: 0 },
      { method: 'POST', path: '/sessions', description: 'Create study session', tokenCost: 30 },
      { method: 'POST', path: '/sessions/{id}/join', description: 'Join study session', tokenCost: 0 },
      { method: 'GET', path: '/sessions', description: 'Find upcoming sessions', tokenCost: 0 },
      { method: 'GET', path: '/user/sessions', description: 'Get user sessions', tokenCost: 0 },
      { method: 'POST', path: '/mentorship/{mentorId}', description: 'Request mentorship', tokenCost: 100 },
      { method: 'GET', path: '/user/mentorships', description: 'Get mentorship sessions', tokenCost: 0 },
      { method: 'GET', path: '/stats', description: 'Get collaboration statistics', tokenCost: 0 },
      { method: 'GET', path: '/health', description: 'Service health check', tokenCost: 0 },
      { method: 'GET', path: '/token-status', description: 'Token status and features', tokenCost: 0 }
    ];
  }
}
