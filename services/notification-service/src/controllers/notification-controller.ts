import { NotificationService } from '../services/notification-service';
import { NotificationTokenMiddleware } from '../middleware/notification-token';

interface Request {
  user?: { id: string; tokens: number };
  body?: any;
  params?: any;
  query?: any;
}

interface Response {
  status(code: number): { json(data: any): void };
  json(data: any): void;
}

export class NotificationController {
  private notificationService: NotificationService;
  private tokenMiddleware: NotificationTokenMiddleware;

  constructor(notificationService: NotificationService, tokenMiddleware: NotificationTokenMiddleware) {
    this.notificationService = notificationService;
    this.tokenMiddleware = tokenMiddleware;
  }

  // Send notification
  async sendNotification(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ error: 'User not authenticated' });
        return;
      }

      const notificationData = { ...req.body, userId };
      const result = await this.notificationService.sendNotification(notificationData);
      
      if (!result.success) {
        res.status(500).json({ error: 'Failed to send notification' });
        return;
      }

      res.json({ success: true, notification: result.notification });
    } catch (error) {
      res.status(500).json({ error: 'Failed to send notification' });
    }
  }

  // Create campaign
  async createCampaign(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ error: 'User not authenticated' });
        return;
      }

      const campaignData = { ...req.body, creatorId: userId };
      const result = await this.notificationService.createCampaign(campaignData);
      
      if (!result.success) {
        res.status(500).json({ error: 'Failed to create campaign' });
        return;
      }

      res.json({ success: true, campaign: result.campaign });
    } catch (error) {
      res.status(500).json({ error: 'Failed to create campaign' });
    }
  }

  // Get user notifications
  async getUserNotifications(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ error: 'User not authenticated' });
        return;
      }

      const notifications = await this.notificationService.getUserNotifications(userId);
      res.json({ success: true, notifications });
    } catch (error) {
      res.status(500).json({ error: 'Failed to get notifications' });
    }
  }

  // Get preferences
  async getPreferences(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ error: 'User not authenticated' });
        return;
      }

      const preferences = await this.notificationService.getNotificationPreferences(userId);
      res.json({ success: true, preferences });
    } catch (error) {
      res.status(500).json({ error: 'Failed to get preferences' });
    }
  }

  // Update preferences
  async updatePreferences(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ error: 'User not authenticated' });
        return;
      }

      const result = await this.notificationService.updateNotificationPreferences(userId, req.body);
      if (!result.success) {
        res.status(500).json({ error: 'Failed to update preferences' });
        return;
      }

      res.json({ success: true, message: 'Preferences updated' });
    } catch (error) {
      res.status(500).json({ error: 'Failed to update preferences' });
    }
  }

  // Get analytics
  async getAnalytics(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ error: 'User not authenticated' });
        return;
      }

      const analytics = await this.notificationService.getNotificationAnalytics(userId);
      res.json({ success: true, analytics });
    } catch (error) {
      res.status(500).json({ error: 'Failed to get analytics' });
    }
  }

  // Health check
  async healthCheck(req: Request, res: Response): Promise<void> {
    res.json({
      service: 'notification-service',
      status: 'healthy',
      timestamp: new Date().toISOString(),
      features: ['push_notifications', 'email_campaigns', 'in_app_alerts', 'notification_scheduling', 'analytics']
    });
  }

  // Token status
  async getTokenStatus(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ error: 'User not authenticated' });
        return;
      }

      const analytics = await this.notificationService.getNotificationAnalytics(userId);
      
      res.json({
        success: true,
        userId,
        notification_activity: analytics,
        available_features: [
          { feature: 'Basic In-App Notifications', cost: 0 },
          { feature: 'Push Notifications', cost: 5 },
          { feature: 'Email Notifications', cost: 3 },
          { feature: 'SMS Notifications', cost: 15 },
          { feature: 'Custom Campaigns (per 100 targets)', cost: 50 },
          { feature: 'Advanced Analytics', cost: 40 }
        ]
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to get token status' });
    }
  }
}
