import { ContentService } from '../services/content-service';
import { ContentTokenMiddleware } from '../middleware/content-token';

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

export class ContentController {
  private contentService: ContentService;
  private tokenMiddleware: ContentTokenMiddleware;

  constructor(contentService: ContentService, tokenMiddleware: ContentTokenMiddleware) {
    this.contentService = contentService;
    this.tokenMiddleware = tokenMiddleware;
  }

  // Content Management Endpoints
  async createContent(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ error: 'User not authenticated' });
        return;
      }

      const contentData = {
        ...req.body,
        creatorId: userId
      };

      const result = await this.contentService.createContent(contentData);
      
      if (!result.success) {
        res.status(500).json({ error: 'Failed to create content' });
        return;
      }

      res.json({
        success: true,
        content: result.content,
        message: 'Content created successfully'
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to create content' });
    }
  }

  async getContent(req: Request, res: Response): Promise<void> {
    try {
      const { contentId } = req.params || {};

      if (!contentId) {
        res.status(400).json({ error: 'Content ID required' });
        return;
      }

      const content = await this.contentService.getContent(contentId);
      
      if (!content) {
        res.status(404).json({ error: 'Content not found' });
        return;
      }

      res.json({
        success: true,
        content
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to get content' });
    }
  }

  async accessContent(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      const { contentId } = req.params || {};

      if (!userId) {
        res.status(401).json({ error: 'User not authenticated' });
        return;
      }

      if (!contentId) {
        res.status(400).json({ error: 'Content ID required' });
        return;
      }

      const result = await this.contentService.accessContent(userId, contentId);
      
      if (!result.success) {
        res.status(404).json({ error: 'Content not found or inaccessible' });
        return;
      }

      res.json({
        success: true,
        content: result.content,
        message: 'Content accessed successfully'
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to access content' });
    }
  }

  async searchContent(req: Request, res: Response): Promise<void> {
    try {
      const { type, difficulty, language, maxCost, tags } = req.query || {};
      
      const filters = {
        type,
        difficulty,
        language,
        maxCost: maxCost ? parseInt(maxCost) : undefined,
        tags: tags ? tags.split(',') : undefined
      };

      const contents = await this.contentService.searchContent(filters);
      
      res.json({
        success: true,
        contents,
        count: contents.length
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to search content' });
    }
  }

  async updateContent(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      const { contentId } = req.params || {};

      if (!userId) {
        res.status(401).json({ error: 'User not authenticated' });
        return;
      }

      if (!contentId) {
        res.status(400).json({ error: 'Content ID required' });
        return;
      }

      // Check if user owns the content
      const existingContent = await this.contentService.getContent(contentId);
      if (!existingContent || existingContent.creatorId !== userId) {
        res.status(403).json({ error: 'Not authorized to update this content' });
        return;
      }

      const result = await this.contentService.updateContent(contentId, req.body);
      
      if (!result.success) {
        res.status(500).json({ error: 'Failed to update content' });
        return;
      }

      res.json({
        success: true,
        content: result.content,
        message: 'Content updated successfully'
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to update content' });
    }
  }

  // Creation Tools Endpoints
  async getCreationTools(req: Request, res: Response): Promise<void> {
    try {
      const tools = await this.contentService.getCreationTools();
      
      res.json({
        success: true,
        tools
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to get creation tools' });
    }
  }

  async useCreationTool(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      const { toolId } = req.params || {};

      if (!userId) {
        res.status(401).json({ error: 'User not authenticated' });
        return;
      }

      if (!toolId) {
        res.status(400).json({ error: 'Tool ID required' });
        return;
      }

      const result = await this.contentService.useCreationTool(userId, toolId);
      
      if (!result.success) {
        res.status(404).json({ error: 'Creation tool not found' });
        return;
      }

      res.json({
        success: true,
        tool: result.tool,
        message: 'Creation tool accessed successfully'
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to use creation tool' });
    }
  }

  // Marketplace Endpoints
  async createMarketplaceTransaction(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ error: 'User not authenticated' });
        return;
      }

      const transactionData = {
        ...req.body,
        buyerId: userId
      };

      const result = await this.contentService.createMarketplaceTransaction(transactionData);
      
      if (!result.success) {
        res.status(500).json({ error: 'Failed to create marketplace transaction' });
        return;
      }

      res.json({
        success: true,
        transaction: result.transaction,
        message: 'Marketplace transaction created successfully'
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to create marketplace transaction' });
    }
  }

  async getUserTransactions(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ error: 'User not authenticated' });
        return;
      }

      const transactions = await this.contentService.getUserTransactions(userId);
      
      res.json({
        success: true,
        transactions
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to get user transactions' });
    }
  }

  // User Content Endpoints
  async getUserCreatedContent(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ error: 'User not authenticated' });
        return;
      }

      const contents = await this.contentService.getUserCreatedContent(userId);
      
      res.json({
        success: true,
        contents
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to get user created content' });
    }
  }

  async getUserAccessedContent(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ error: 'User not authenticated' });
        return;
      }

      const contents = await this.contentService.getUserAccessedContent(userId);
      
      res.json({
        success: true,
        contents
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to get user accessed content' });
    }
  }

  // Analytics Endpoints
  async getContentStats(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ error: 'User not authenticated' });
        return;
      }

      const stats = await this.contentService.getContentStats(userId);
      
      res.json({
        success: true,
        stats
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to get content stats' });
    }
  }

  // Health check endpoint
  async healthCheck(req: Request, res: Response): Promise<void> {
    res.json({
      service: 'content-service',
      status: 'healthy',
      timestamp: new Date().toISOString(),
      features: [
        'premium_content_access',
        'content_creation_tools',
        'content_marketplace',
        'content_publishing',
        'content_analytics',
        'creation_tool_access'
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

      const stats = await this.contentService.getContentStats(userId);
      
      res.json({
        success: true,
        userId,
        content_activity: stats,
        available_features: [
          { feature: 'Basic Content Access', cost: 0 },
          { feature: 'Premium Lesson Access', cost: 50 },
          { feature: 'Video Editor (1 hour)', cost: 100 },
          { feature: 'Quiz Builder (10 quizzes)', cost: 50 },
          { feature: 'Content Publishing', cost: 25 },
          { feature: 'Marketplace Transaction Fee', cost: '5% of amount' }
        ]
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to get token status' });
    }
  }
}
