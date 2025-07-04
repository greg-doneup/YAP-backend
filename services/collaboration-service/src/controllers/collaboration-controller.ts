import { CollaborationService } from '../services/collaboration-service';
import { CollaborationTokenMiddleware } from '../middleware/collaboration-token';

interface Request {
  user?: {
    id: string;
    tokens: number;
  };
  body?: any;
  params?: any;
  query?: any;
}

interface Response {
  status(code: number): { json(data: any): void };
  json(data: any): void;
}

export class CollaborationController {
  private collaborationService: CollaborationService;
  private tokenMiddleware: CollaborationTokenMiddleware;

  constructor(collaborationService: CollaborationService, tokenMiddleware: CollaborationTokenMiddleware) {
    this.collaborationService = collaborationService;
    this.tokenMiddleware = tokenMiddleware;
  }

  // Study Group Endpoints
  async createGroup(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ error: 'User not authenticated' });
        return;
      }

      const groupData = {
        ...req.body,
        ownerId: userId
      };

      const result = await this.collaborationService.createStudyGroup(groupData);
      
      if (!result.success) {
        res.status(500).json({ error: 'Failed to create group' });
        return;
      }

      res.json({
        success: true,
        group: result.group,
        message: 'Study group created successfully'
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to create group' });
    }
  }

  async joinGroup(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      const { groupId } = req.params || {};

      if (!userId) {
        res.status(401).json({ error: 'User not authenticated' });
        return;
      }

      if (!groupId) {
        res.status(400).json({ error: 'Group ID required' });
        return;
      }

      const result = await this.collaborationService.joinStudyGroup(userId, groupId);
      
      if (!result.success) {
        res.status(400).json({ error: result.message || 'Failed to join group' });
        return;
      }

      res.json({
        success: true,
        message: result.message
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to join group' });
    }
  }

  async getUserGroups(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ error: 'User not authenticated' });
        return;
      }

      const groups = await this.collaborationService.getUserGroups(userId);
      
      res.json({
        success: true,
        groups
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to get user groups' });
    }
  }

  async findGroups(req: Request, res: Response): Promise<void> {
    try {
      const { language, level, type } = req.query || {};
      
      const groups = await this.collaborationService.findAvailableGroups({
        language,
        level,
        type
      });
      
      res.json({
        success: true,
        groups
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to find groups' });
    }
  }

  // Study Session Endpoints
  async createSession(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ error: 'User not authenticated' });
        return;
      }

      const sessionData = {
        ...req.body,
        hostId: userId
      };

      const result = await this.collaborationService.createStudySession(sessionData);
      
      if (!result.success) {
        res.status(500).json({ error: 'Failed to create session' });
        return;
      }

      res.json({
        success: true,
        session: result.session,
        message: 'Study session created successfully'
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to create session' });
    }
  }

  async joinSession(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      const { sessionId } = req.params || {};

      if (!userId) {
        res.status(401).json({ error: 'User not authenticated' });
        return;
      }

      if (!sessionId) {
        res.status(400).json({ error: 'Session ID required' });
        return;
      }

      const result = await this.collaborationService.joinStudySession(userId, sessionId);
      
      if (!result.success) {
        res.status(400).json({ error: result.message || 'Failed to join session' });
        return;
      }

      res.json({
        success: true,
        message: result.message
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to join session' });
    }
  }

  async getUserSessions(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ error: 'User not authenticated' });
        return;
      }

      const sessions = await this.collaborationService.getUserSessions(userId);
      
      res.json({
        success: true,
        sessions
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to get user sessions' });
    }
  }

  async findSessions(req: Request, res: Response): Promise<void> {
    try {
      const { type, maxParticipants } = req.query || {};
      
      const sessions = await this.collaborationService.findUpcomingSessions({
        type,
        maxParticipants: maxParticipants ? parseInt(maxParticipants) : undefined
      });
      
      res.json({
        success: true,
        sessions
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to find sessions' });
    }
  }

  // Mentorship Endpoints
  async requestMentorship(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      const { mentorId } = req.params || {};

      if (!userId) {
        res.status(401).json({ error: 'User not authenticated' });
        return;
      }

      if (!mentorId) {
        res.status(400).json({ error: 'Mentor ID required' });
        return;
      }

      const result = await this.collaborationService.requestMentorship(userId, mentorId, req.body);
      
      if (!result.success) {
        res.status(500).json({ error: 'Failed to request mentorship' });
        return;
      }

      res.json({
        success: true,
        session: result.session,
        message: 'Mentorship request sent successfully'
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to request mentorship' });
    }
  }

  async getMentorshipSessions(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ error: 'User not authenticated' });
        return;
      }

      const sessions = await this.collaborationService.getMentorshipSessions(userId);
      
      res.json({
        success: true,
        sessions
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to get mentorship sessions' });
    }
  }

  // Analytics and Stats
  async getCollaborationStats(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ error: 'User not authenticated' });
        return;
      }

      const stats = await this.collaborationService.getCollaborationStats(userId);
      
      res.json({
        success: true,
        stats
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to get collaboration stats' });
    }
  }

  // Health check endpoint
  async healthCheck(req: Request, res: Response): Promise<void> {
    res.json({
      service: 'collaboration-service',
      status: 'healthy',
      timestamp: new Date().toISOString(),
      features: [
        'study_groups',
        'study_sessions',
        'mentorship',
        'group_discovery',
        'session_hosting',
        'collaboration_stats'
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

      const stats = await this.collaborationService.getCollaborationStats(userId);
      
      res.json({
        success: true,
        userId,
        collaboration_activity: stats,
        available_features: [
          { feature: 'Basic Group Participation', cost: 0 },
          { feature: 'Private Group Creation', cost: 35 },
          { feature: 'Session Hosting (1 hour)', cost: 30 },
          { feature: 'Premium Features', cost: 15 },
          { feature: 'Basic Mentorship (1 hour)', cost: 100 }
        ]
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to get token status' });
    }
  }
}
