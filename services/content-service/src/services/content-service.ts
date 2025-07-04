interface Content {
  id: string;
  title: string;
  description: string;
  type: string;
  creatorId: string;
  visibility: string;
  tokenCost: number;
  tags: string[];
  difficulty: string;
  language: string;
  duration: number;
  createdAt: string;
  updatedAt: string;
  isActive: boolean;
  views: number;
  rating: number;
  downloadUrl?: string;
  thumbnailUrl?: string;
}

interface CreationTool {
  id: string;
  name: string;
  type: string;
  features: string[];
  tokenCost: number;
  usageLimit: number;
  description: string;
}

interface MarketplaceTransaction {
  id: string;
  type: string;
  buyerId: string;
  sellerId: string;
  contentId: string;
  amount: number;
  tokenFee: number;
  status: string;
  createdAt: string;
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
  zrange(key: string, start: number, stop: number): Promise<string[]>;
  zrevrange(key: string, start: number, stop: number): Promise<string[]>;
  incr(key: string): Promise<number>;
  incrby(key: string, amount: number): Promise<number>;
}

export class ContentService {
  private redisClient: RedisClient;

  constructor(redisClient: RedisClient) {
    this.redisClient = redisClient;
  }

  // Content Management
  async createContent(contentData: Partial<Content>): Promise<{ success: boolean; content?: Content }> {
    try {
      const contentId = `content_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      const content: Content = {
        id: contentId,
        title: contentData.title || '',
        description: contentData.description || '',
        type: contentData.type || 'lesson',
        creatorId: contentData.creatorId || '',
        visibility: contentData.visibility || 'public',
        tokenCost: contentData.tokenCost || 0,
        tags: contentData.tags || [],
        difficulty: contentData.difficulty || 'beginner',
        language: contentData.language || 'english',
        duration: contentData.duration || 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        isActive: true,
        views: 0,
        rating: 0,
        downloadUrl: contentData.downloadUrl,
        thumbnailUrl: contentData.thumbnailUrl
      };

      // Save content data
      await this.redisClient.hset(`content:${contentId}`, 'data', JSON.stringify(content));
      
      // Add to creator's content
      await this.redisClient.sadd(`user:${content.creatorId}:created_content`, contentId);
      
      // Add to content catalog
      await this.redisClient.zadd('content:catalog', Date.now(), contentId);
      
      // Add to type-specific catalog
      await this.redisClient.zadd(`content:type:${content.type}`, Date.now(), contentId);

      return { success: true, content };
    } catch (error) {
      console.error('Error creating content:', error);
      return { success: false };
    }
  }

  async getContent(contentId: string): Promise<Content | null> {
    try {
      const contentData = await this.redisClient.hget(`content:${contentId}`, 'data');
      if (!contentData) {
        return null;
      }

      return JSON.parse(contentData);
    } catch (error) {
      console.error('Error getting content:', error);
      return null;
    }
  }

  async updateContent(contentId: string, updates: Partial<Content>): Promise<{ success: boolean; content?: Content }> {
    try {
      const existingContent = await this.getContent(contentId);
      if (!existingContent) {
        return { success: false };
      }

      const updatedContent = {
        ...existingContent,
        ...updates,
        updatedAt: new Date().toISOString()
      };

      await this.redisClient.hset(`content:${contentId}`, 'data', JSON.stringify(updatedContent));
      
      return { success: true, content: updatedContent };
    } catch (error) {
      console.error('Error updating content:', error);
      return { success: false };
    }
  }

  async searchContent(filters: {
    type?: string;
    difficulty?: string;
    language?: string;
    maxCost?: number;
    tags?: string[];
  }): Promise<Content[]> {
    try {
      const catalogKey = filters.type ? `content:type:${filters.type}` : 'content:catalog';
      const contentIds = await this.redisClient.zrevrange(catalogKey, 0, 49); // Get 50 most recent
      
      const contents: Content[] = [];

      for (const contentId of contentIds) {
        const content = await this.getContent(contentId);
        if (!content || !content.isActive) continue;

        // Apply filters
        if (filters.difficulty && content.difficulty !== filters.difficulty) continue;
        if (filters.language && content.language !== filters.language) continue;
        if (filters.maxCost && content.tokenCost > filters.maxCost) continue;
        if (filters.tags && !filters.tags.some(tag => content.tags.includes(tag))) continue;

        contents.push(content);
      }

      return contents;
    } catch (error) {
      console.error('Error searching content:', error);
      return [];
    }
  }

  async accessContent(userId: string, contentId: string): Promise<{ success: boolean; content?: Content }> {
    try {
      const content = await this.getContent(contentId);
      if (!content) {
        return { success: false };
      }

      // Increment view count
      content.views++;
      await this.updateContent(contentId, { views: content.views });

      // Add to user's accessed content
      await this.redisClient.sadd(`user:${userId}:accessed_content`, contentId);

      return { success: true, content };
    } catch (error) {
      console.error('Error accessing content:', error);
      return { success: false };
    }
  }

  // Creation Tools Management
  async getCreationTools(): Promise<CreationTool[]> {
    try {
      // In a real implementation, this would come from a database
      // For now, return predefined tools
      return [
        {
          id: 'video_editor',
          name: 'Advanced Video Editor',
          type: 'video_editor',
          features: ['multi_track', 'effects', 'transitions', 'export_hd'],
          tokenCost: 100,
          usageLimit: 60, // 60 minutes
          description: 'Professional video editing with advanced features'
        },
        {
          id: 'quiz_builder',
          name: 'Interactive Quiz Builder',
          type: 'quiz_builder',
          features: ['multiple_choice', 'drag_drop', 'audio_questions', 'analytics'],
          tokenCost: 50,
          usageLimit: 10, // 10 quizzes
          description: 'Create engaging interactive quizzes'
        },
        {
          id: 'lesson_creator',
          name: 'Comprehensive Lesson Creator',
          type: 'lesson_creator',
          features: ['templates', 'multimedia', 'assessments', 'collaboration'],
          tokenCost: 125,
          usageLimit: 5, // 5 lessons
          description: 'Build complete lessons with multimedia content'
        }
      ];
    } catch (error) {
      console.error('Error getting creation tools:', error);
      return [];
    }
  }

  async useCreationTool(userId: string, toolId: string): Promise<{ success: boolean; tool?: CreationTool }> {
    try {
      const tools = await this.getCreationTools();
      const tool = tools.find(t => t.id === toolId);
      
      if (!tool) {
        return { success: false };
      }

      // Track tool usage
      await this.redisClient.sadd(`user:${userId}:used_tools`, toolId);
      await this.redisClient.incr(`user:${userId}:tool_usage:${toolId}`);

      return { success: true, tool };
    } catch (error) {
      console.error('Error using creation tool:', error);
      return { success: false };
    }
  }

  // Marketplace Management
  async createMarketplaceTransaction(transactionData: Partial<MarketplaceTransaction>): Promise<{ success: boolean; transaction?: MarketplaceTransaction }> {
    try {
      const transactionId = `transaction_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      const transaction: MarketplaceTransaction = {
        id: transactionId,
        type: transactionData.type || 'content_purchase',
        buyerId: transactionData.buyerId || '',
        sellerId: transactionData.sellerId || '',
        contentId: transactionData.contentId || '',
        amount: transactionData.amount || 0,
        tokenFee: transactionData.tokenFee || 0,
        status: 'pending',
        createdAt: new Date().toISOString()
      };

      // Save transaction
      await this.redisClient.hset(`transaction:${transactionId}`, 'data', JSON.stringify(transaction));
      
      // Add to user's transactions
      await this.redisClient.sadd(`user:${transaction.buyerId}:transactions`, transactionId);
      await this.redisClient.sadd(`user:${transaction.sellerId}:transactions`, transactionId);

      return { success: true, transaction };
    } catch (error) {
      console.error('Error creating marketplace transaction:', error);
      return { success: false };
    }
  }

  async getUserTransactions(userId: string): Promise<MarketplaceTransaction[]> {
    try {
      const transactionIds = await this.redisClient.smembers(`user:${userId}:transactions`);
      const transactions: MarketplaceTransaction[] = [];

      for (const transactionId of transactionIds) {
        const transactionData = await this.redisClient.hget(`transaction:${transactionId}`, 'data');
        if (transactionData) {
          transactions.push(JSON.parse(transactionData));
        }
      }

      return transactions.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    } catch (error) {
      console.error('Error getting user transactions:', error);
      return [];
    }
  }

  // User Content Management
  async getUserCreatedContent(userId: string): Promise<Content[]> {
    try {
      const contentIds = await this.redisClient.smembers(`user:${userId}:created_content`);
      const contents: Content[] = [];

      for (const contentId of contentIds) {
        const content = await this.getContent(contentId);
        if (content) {
          contents.push(content);
        }
      }

      return contents.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    } catch (error) {
      console.error('Error getting user created content:', error);
      return [];
    }
  }

  async getUserAccessedContent(userId: string): Promise<Content[]> {
    try {
      const contentIds = await this.redisClient.smembers(`user:${userId}:accessed_content`);
      const contents: Content[] = [];

      for (const contentId of contentIds) {
        const content = await this.getContent(contentId);
        if (content) {
          contents.push(content);
        }
      }

      return contents;
    } catch (error) {
      console.error('Error getting user accessed content:', error);
      return [];
    }
  }

  // Analytics and Stats
  async getContentStats(userId: string): Promise<any> {
    try {
      const createdContent = await this.getUserCreatedContent(userId);
      const accessedContent = await this.getUserAccessedContent(userId);
      const transactions = await this.getUserTransactions(userId);

      return {
        created: {
          total: createdContent.length,
          totalViews: createdContent.reduce((sum, content) => sum + content.views, 0),
          avgRating: createdContent.reduce((sum, content) => sum + content.rating, 0) / createdContent.length || 0
        },
        accessed: {
          total: accessedContent.length,
          premiumContent: accessedContent.filter(c => c.tokenCost > 0).length
        },
        marketplace: {
          totalTransactions: transactions.length,
          totalSpent: transactions.filter(t => t.buyerId === userId).reduce((sum, t) => sum + t.amount + t.tokenFee, 0),
          totalEarned: transactions.filter(t => t.sellerId === userId).reduce((sum, t) => sum + t.amount, 0)
        }
      };
    } catch (error) {
      console.error('Error getting content stats:', error);
      return { created: {}, accessed: {}, marketplace: {} };
    }
  }
}
