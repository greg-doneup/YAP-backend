/**
 * Text Chat Handler Service
 * 
 * Manages text chat processing, conversation storage, and message handling:
 * - Message processing and response generation
 * - Conversation management and history
 * - Integration with AI models and providers
 * - Message validation and sanitization
 */

interface ChatMessage {
  id: string;
  userId: string;
  conversationId: string;
  message: string;
  response: string;
  modelUsed: string;
  tokensSpent: number;
  createdAt: Date;
  metadata?: {
    processingTime: number;
    wordCount: number;
    language: string;
    context?: string;
  };
}

interface ProcessMessageRequest {
  userId: string;
  message: string;
  conversationId?: string;
  modelType: string;
  language: string;
  context?: string;
  tokenCost: number;
  unlimitedActive: boolean;
}

interface ProcessMessageResponse {
  aiResponse: string;
  conversationId: string;
  messageId: string;
  modelUsed: string;
  processingTime: number;
  wordCount: number;
}

interface ConversationHistoryRequest {
  userId: string;
  conversationId?: string;
  limit: number;
  offset: number;
}

interface ConversationHistoryResponse {
  conversations: Array<{
    id: string;
    messages: ChatMessage[];
    totalMessages: number;
    createdAt: Date;
    updatedAt: Date;
  }>;
  totalMessages: number;
  hasMore: boolean;
}

export class TextChatHandler {
  private conversations: Map<string, ChatMessage[]> = new Map();

  constructor() {
    // Initialize conversation storage
    // In a real implementation, this would connect to a database
  }

  /**
   * Process a chat message and generate AI response
   */
  public async processMessage(request: ProcessMessageRequest): Promise<ProcessMessageResponse> {
    const startTime = Date.now();
    
    try {
      console.log(`[TEXT-CHAT] Processing message for user ${request.userId}`);

      // Generate or use existing conversation ID
      const conversationId = request.conversationId || this.generateConversationId();

      // Validate and sanitize message
      const sanitizedMessage = this.sanitizeMessage(request.message);
      
      if (!sanitizedMessage.trim()) {
        throw new Error('Message cannot be empty');
      }

      // Get conversation context
      const context = await this.getConversationContext(conversationId, request.userId);

      // Generate AI response (mock implementation)
      const aiResponse = await this.generateAIResponse({
        message: sanitizedMessage,
        context,
        modelType: request.modelType,
        language: request.language,
        additionalContext: request.context
      });

      const processingTime = Date.now() - startTime;
      const wordCount = aiResponse.split(' ').length;
      const messageId = this.generateMessageId();

      // Store the conversation
      const chatMessage: ChatMessage = {
        id: messageId,
        userId: request.userId,
        conversationId,
        message: sanitizedMessage,
        response: aiResponse,
        modelUsed: request.modelType,
        tokensSpent: request.tokenCost,
        createdAt: new Date(),
        metadata: {
          processingTime,
          wordCount,
          language: request.language,
          context: request.context
        }
      };

      await this.storeMessage(chatMessage);

      return {
        aiResponse,
        conversationId,
        messageId,
        modelUsed: request.modelType,
        processingTime,
        wordCount
      };

    } catch (error) {
      console.error('[TEXT-CHAT] Error processing message:', error);
      throw new Error(`Failed to process message: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get conversation history for a user
   */
  public async getConversationHistory(request: ConversationHistoryRequest): Promise<ConversationHistoryResponse> {
    try {
      console.log(`[TEXT-CHAT] Getting conversation history for user ${request.userId}`);

      // In a real implementation, this would query a database
      // For now, using in-memory storage
      
      if (request.conversationId) {
        // Get specific conversation
        const messages = this.conversations.get(request.conversationId) || [];
        const userMessages = messages.filter(msg => msg.userId === request.userId);
        
        const paginatedMessages = userMessages
          .slice(request.offset, request.offset + request.limit);

        return {
          conversations: [{
            id: request.conversationId,
            messages: paginatedMessages,
            totalMessages: userMessages.length,
            createdAt: userMessages[0]?.createdAt || new Date(),
            updatedAt: userMessages[userMessages.length - 1]?.createdAt || new Date()
          }],
          totalMessages: userMessages.length,
          hasMore: request.offset + request.limit < userMessages.length
        };
      } else {
        // Get all conversations for user
        const userConversations = new Map<string, ChatMessage[]>();
        
        // Group messages by conversation
        this.conversations.forEach((messages, conversationId) => {
          const userMessages = messages.filter(msg => msg.userId === request.userId);
          if (userMessages.length > 0) {
            userConversations.set(conversationId, userMessages);
          }
        });

        const conversationList = Array.from(userConversations.entries()).map(([id, messages]) => ({
          id,
          messages: messages.slice(request.offset, request.offset + request.limit),
          totalMessages: messages.length,
          createdAt: messages[0]?.createdAt || new Date(),
          updatedAt: messages[messages.length - 1]?.createdAt || new Date()
        }));

        const totalMessages = Array.from(userConversations.values()).reduce((sum, messages) => sum + messages.length, 0);

        return {
          conversations: conversationList,
          totalMessages,
          hasMore: false // Simplified for mock implementation
        };
      }

    } catch (error) {
      console.error('[TEXT-CHAT] Error getting conversation history:', error);
      throw new Error(`Failed to get conversation history: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Delete a conversation
   */
  public async deleteConversation(userId: string, conversationId: string): Promise<boolean> {
    try {
      console.log(`[TEXT-CHAT] Deleting conversation ${conversationId} for user ${userId}`);

      const messages = this.conversations.get(conversationId);
      if (!messages) {
        return false;
      }

      // Verify user owns this conversation
      const userMessages = messages.filter(msg => msg.userId === userId);
      if (userMessages.length === 0) {
        return false;
      }

      // In a real implementation, this would soft-delete from database
      // For now, remove from memory
      this.conversations.delete(conversationId);

      return true;

    } catch (error) {
      console.error('[TEXT-CHAT] Error deleting conversation:', error);
      return false;
    }
  }

  /**
   * Generate AI response (mock implementation)
   */
  private async generateAIResponse(request: {
    message: string;
    context: string[];
    modelType: string;
    language: string;
    additionalContext?: string;
  }): Promise<string> {
    try {
      // Mock AI response generation
      // In a real implementation, this would call OpenAI, Claude, or other AI services
      
      const responses = [
        `Thank you for your message: "${request.message}". I understand you're learning ${request.language}. How can I help you practice today?`,
        `That's a great question! Let me help you with that. Based on your message, I can see you're working on ${request.language} language skills.`,
        `I appreciate you sharing that with me. Your ${request.language} is improving! Let's continue practicing together.`,
        `Excellent! I can help you with that. In ${request.language}, we would approach this topic by focusing on...`,
        `Thank you for the context. Based on what you've shared, I'd suggest we work on improving your ${request.language} skills in this area.`
      ];

      // Simple response selection based on message content
      const responseIndex = request.message.length % responses.length;
      let baseResponse = responses[responseIndex];

      // Add context if available
      if (request.context.length > 0) {
        baseResponse += ` Building on our previous conversation, I remember we discussed ${request.context[request.context.length - 1]}.`;
      }

      // Add model-specific enhancement
      if (request.modelType === 'gpt-4') {
        baseResponse += ' [Enhanced with GPT-4 for more detailed analysis]';
      } else if (request.modelType === 'claude') {
        baseResponse += ' [Processed with Claude for nuanced understanding]';
      }

      // Simulate processing delay
      await new Promise(resolve => setTimeout(resolve, 100 + Math.random() * 500));

      return baseResponse;

    } catch (error) {
      console.error('[TEXT-CHAT] Error generating AI response:', error);
      return `I apologize, but I encountered an error processing your message. Please try again. (Error: ${error instanceof Error ? error.message : 'Unknown error'})`;
    }
  }

  /**
   * Get conversation context for continuity
   */
  private async getConversationContext(conversationId: string, userId: string): Promise<string[]> {
    try {
      const messages = this.conversations.get(conversationId) || [];
      const userMessages = messages
        .filter(msg => msg.userId === userId)
        .slice(-5) // Get last 5 messages for context
        .map(msg => `User: ${msg.message}\nAI: ${msg.response}`);

      return userMessages;

    } catch (error) {
      console.error('[TEXT-CHAT] Error getting conversation context:', error);
      return [];
    }
  }

  /**
   * Store message in conversation history
   */
  private async storeMessage(message: ChatMessage): Promise<void> {
    try {
      const existing = this.conversations.get(message.conversationId) || [];
      existing.push(message);
      this.conversations.set(message.conversationId, existing);

      // In a real implementation, this would save to database
      console.log(`[TEXT-CHAT] Stored message ${message.id} in conversation ${message.conversationId}`);

    } catch (error) {
      console.error('[TEXT-CHAT] Error storing message:', error);
      throw error;
    }
  }

  /**
   * Sanitize user message
   */
  private sanitizeMessage(message: string): string {
    // Basic sanitization - remove excessive whitespace, limit length
    const sanitized = message
      .trim()
      .replace(/\s+/g, ' ') // Replace multiple spaces with single space
      .slice(0, 2000); // Limit to 2000 characters

    return sanitized;
  }

  /**
   * Generate unique conversation ID
   */
  private generateConversationId(): string {
    return `conv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Generate unique message ID
   */
  private generateMessageId(): string {
    return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

export default TextChatHandler;
