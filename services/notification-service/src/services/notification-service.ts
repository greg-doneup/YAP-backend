interface Notification {
  id: string;
  userId: string;
  type: string;
  title: string;
  message: string;
  channel: string;
  priority: string;
  status: string;
  scheduledAt?: string;
  sentAt?: string;
  createdAt: string;
  metadata: any;
}

interface NotificationCampaign {
  id: string;
  name: string;
  type: string;
  creatorId: string;
  targetCount: number;
  channels: string[];
  status: string;
  createdAt: string;
  scheduledAt?: string;
  completedAt?: string;
}

interface RedisClient {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  hget(key: string, field: string): Promise<string | null>;
  hset(key: string, field: string, value: string): Promise<void>;
  hgetall(key: string): Promise<Record<string, string>>;
  sadd(key: string, member: string): Promise<number>;
  smembers(key: string): Promise<string[]>;
  zadd(key: string, score: number, member: string): Promise<number>;
  zrevrange(key: string, start: number, stop: number): Promise<string[]>;
  incr(key: string): Promise<number>;
}

export class NotificationService {
  private redisClient: RedisClient;

  constructor(redisClient: RedisClient) {
    this.redisClient = redisClient;
  }

  // Send basic notification
  async sendNotification(notificationData: Partial<Notification>): Promise<{ success: boolean; notification?: Notification }> {
    try {
      const notificationId = `notification_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      const notification: Notification = {
        id: notificationId,
        userId: notificationData.userId || '',
        type: notificationData.type || 'info',
        title: notificationData.title || '',
        message: notificationData.message || '',
        channel: notificationData.channel || 'in_app',
        priority: notificationData.priority || 'normal',
        status: 'sent',
        sentAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        metadata: notificationData.metadata || {}
      };

      // Save notification
      await this.redisClient.hset(`notification:${notificationId}`, 'data', JSON.stringify(notification));
      
      // Add to user's notifications
      await this.redisClient.sadd(`user:${notification.userId}:notifications`, notificationId);
      
      // Track by type and channel
      await this.redisClient.incr(`stats:notifications:${notification.type}`);
      await this.redisClient.incr(`stats:notifications:channel:${notification.channel}`);

      return { success: true, notification };
    } catch (error) {
      console.error('Error sending notification:', error);
      return { success: false };
    }
  }

  // Create notification campaign
  async createCampaign(campaignData: Partial<NotificationCampaign>): Promise<{ success: boolean; campaign?: NotificationCampaign }> {
    try {
      const campaignId = `campaign_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      const campaign: NotificationCampaign = {
        id: campaignId,
        name: campaignData.name || '',
        type: campaignData.type || 'broadcast',
        creatorId: campaignData.creatorId || '',
        targetCount: campaignData.targetCount || 0,
        channels: campaignData.channels || ['in_app'],
        status: 'created',
        createdAt: new Date().toISOString(),
        scheduledAt: campaignData.scheduledAt
      };

      // Save campaign
      await this.redisClient.hset(`campaign:${campaignId}`, 'data', JSON.stringify(campaign));
      
      // Add to creator's campaigns
      await this.redisClient.sadd(`user:${campaign.creatorId}:campaigns`, campaignId);

      return { success: true, campaign };
    } catch (error) {
      console.error('Error creating campaign:', error);
      return { success: false };
    }
  }

  // Get user notifications
  async getUserNotifications(userId: string): Promise<Notification[]> {
    try {
      const notificationIds = await this.redisClient.smembers(`user:${userId}:notifications`);
      const notifications: Notification[] = [];

      for (const notificationId of notificationIds) {
        const notificationData = await this.redisClient.hget(`notification:${notificationId}`, 'data');
        if (notificationData) {
          notifications.push(JSON.parse(notificationData));
        }
      }

      return notifications.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    } catch (error) {
      console.error('Error getting user notifications:', error);
      return [];
    }
  }

  // Get notification preferences
  async getNotificationPreferences(userId: string): Promise<any> {
    try {
      const preferences = await this.redisClient.hgetall(`user:${userId}:notification_preferences`);
      return {
        push_enabled: preferences.push_enabled === 'true',
        email_enabled: preferences.email_enabled === 'true',
        sms_enabled: preferences.sms_enabled === 'true',
        in_app_enabled: preferences.in_app_enabled !== 'false', // Default true
        frequency: preferences.frequency || 'normal',
        quiet_hours: {
          enabled: preferences.quiet_hours_enabled === 'true',
          start: preferences.quiet_hours_start || '22:00',
          end: preferences.quiet_hours_end || '08:00'
        }
      };
    } catch (error) {
      console.error('Error getting notification preferences:', error);
      return { push_enabled: false, email_enabled: false, sms_enabled: false, in_app_enabled: true };
    }
  }

  // Update notification preferences
  async updateNotificationPreferences(userId: string, preferences: any): Promise<{ success: boolean }> {
    try {
      const updates = {
        push_enabled: preferences.push_enabled?.toString() || 'false',
        email_enabled: preferences.email_enabled?.toString() || 'false',
        sms_enabled: preferences.sms_enabled?.toString() || 'false',
        in_app_enabled: preferences.in_app_enabled?.toString() || 'true',
        frequency: preferences.frequency || 'normal',
        quiet_hours_enabled: preferences.quiet_hours?.enabled?.toString() || 'false',
        quiet_hours_start: preferences.quiet_hours?.start || '22:00',
        quiet_hours_end: preferences.quiet_hours?.end || '08:00'
      };

      for (const [key, value] of Object.entries(updates)) {
        await this.redisClient.hset(`user:${userId}:notification_preferences`, key, value);
      }

      return { success: true };
    } catch (error) {
      console.error('Error updating notification preferences:', error);
      return { success: false };
    }
  }

  // Get notification analytics
  async getNotificationAnalytics(userId: string): Promise<any> {
    try {
      const notifications = await this.getUserNotifications(userId);
      const today = new Date();
      const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
      
      const recentNotifications = notifications.filter(n => 
        new Date(n.createdAt) >= weekAgo
      );

      const byChannel = recentNotifications.reduce((acc, n) => {
        acc[n.channel] = (acc[n.channel] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      const byType = recentNotifications.reduce((acc, n) => {
        acc[n.type] = (acc[n.type] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      return {
        total_notifications: notifications.length,
        recent_notifications: recentNotifications.length,
        by_channel: byChannel,
        by_type: byType,
        avg_per_day: recentNotifications.length / 7
      };
    } catch (error) {
      console.error('Error getting notification analytics:', error);
      return { total_notifications: 0, recent_notifications: 0 };
    }
  }
}
