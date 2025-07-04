interface StudyGroup {
  id: string;
  name: string;
  description: string;
  type: string;
  isPrivate: boolean;
  ownerId: string;
  members: string[];
  maxMembers: number;
  language: string;
  level: string;
  createdAt: string;
  isActive: boolean;
}

interface StudySession {
  id: string;
  title: string;
  description: string;
  type: string;
  hostId: string;
  groupId?: string;
  participants: string[];
  maxParticipants: number;
  startTime: string;
  duration: number;
  status: string;
  features: string[];
}

interface MentorshipSession {
  id: string;
  mentorId: string;
  studentId: string;
  type: string;
  duration: number;
  scheduledTime: string;
  status: string;
  subject: string;
  notes?: string;
}

interface RedisClient {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  hget(key: string, field: string): Promise<string | null>;
  hset(key: string, field: string, value: string): Promise<void>;
  hgetall(key: string): Promise<Record<string, string>>;
  sadd(key: string, member: string): Promise<number>;
  srem(key: string, member: string): Promise<number>;
  smembers(key: string): Promise<string[]>;
  zadd(key: string, score: number, member: string): Promise<number>;
  zrange(key: string, start: number, stop: number): Promise<string[]>;
  zrevrange(key: string, start: number, stop: number): Promise<string[]>;
  incr(key: string): Promise<number>;
}

export class CollaborationService {
  private redisClient: RedisClient;

  constructor(redisClient: RedisClient) {
    this.redisClient = redisClient;
  }

  // Study Group Management
  async createStudyGroup(groupData: Partial<StudyGroup>): Promise<{ success: boolean; group?: StudyGroup }> {
    try {
      const groupId = `group_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      const group: StudyGroup = {
        id: groupId,
        name: groupData.name || '',
        description: groupData.description || '',
        type: groupData.type || 'study',
        isPrivate: groupData.isPrivate || false,
        ownerId: groupData.ownerId || '',
        members: [groupData.ownerId || ''],
        maxMembers: groupData.maxMembers || 10,
        language: groupData.language || 'english',
        level: groupData.level || 'beginner',
        createdAt: new Date().toISOString(),
        isActive: true
      };

      // Save group data
      await this.redisClient.hset(`group:${groupId}`, 'data', JSON.stringify(group));
      
      // Add to user's groups
      await this.redisClient.sadd(`user:${group.ownerId}:groups`, groupId);
      
      // Add to global groups list
      await this.redisClient.zadd('groups:active', Date.now(), groupId);

      return { success: true, group };
    } catch (error) {
      console.error('Error creating study group:', error);
      return { success: false };
    }
  }

  async joinStudyGroup(userId: string, groupId: string): Promise<{ success: boolean; message?: string }> {
    try {
      const groupData = await this.redisClient.hget(`group:${groupId}`, 'data');
      if (!groupData) {
        return { success: false, message: 'Group not found' };
      }

      const group: StudyGroup = JSON.parse(groupData);
      
      if (group.members.includes(userId)) {
        return { success: false, message: 'Already a member' };
      }

      if (group.members.length >= group.maxMembers) {
        return { success: false, message: 'Group is full' };
      }

      // Add user to group
      group.members.push(userId);
      await this.redisClient.hset(`group:${groupId}`, 'data', JSON.stringify(group));
      
      // Add group to user's groups
      await this.redisClient.sadd(`user:${userId}:groups`, groupId);

      return { success: true, message: 'Successfully joined group' };
    } catch (error) {
      console.error('Error joining study group:', error);
      return { success: false, message: 'Failed to join group' };
    }
  }

  async getUserGroups(userId: string): Promise<StudyGroup[]> {
    try {
      const groupIds = await this.redisClient.smembers(`user:${userId}:groups`);
      const groups: StudyGroup[] = [];

      for (const groupId of groupIds) {
        const groupData = await this.redisClient.hget(`group:${groupId}`, 'data');
        if (groupData) {
          groups.push(JSON.parse(groupData));
        }
      }

      return groups;
    } catch (error) {
      console.error('Error getting user groups:', error);
      return [];
    }
  }

  // Study Session Management
  async createStudySession(sessionData: Partial<StudySession>): Promise<{ success: boolean; session?: StudySession }> {
    try {
      const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      const session: StudySession = {
        id: sessionId,
        title: sessionData.title || '',
        description: sessionData.description || '',
        type: sessionData.type || 'group_study',
        hostId: sessionData.hostId || '',
        groupId: sessionData.groupId,
        participants: [sessionData.hostId || ''],
        maxParticipants: sessionData.maxParticipants || 10,
        startTime: sessionData.startTime || new Date().toISOString(),
        duration: sessionData.duration || 60,
        status: 'scheduled',
        features: sessionData.features || []
      };

      // Save session data
      await this.redisClient.hset(`session:${sessionId}`, 'data', JSON.stringify(session));
      
      // Add to host's sessions
      await this.redisClient.sadd(`user:${session.hostId}:sessions`, sessionId);
      
      // Add to scheduled sessions
      const startTimestamp = new Date(session.startTime).getTime();
      await this.redisClient.zadd('sessions:scheduled', startTimestamp, sessionId);

      return { success: true, session };
    } catch (error) {
      console.error('Error creating study session:', error);
      return { success: false };
    }
  }

  async joinStudySession(userId: string, sessionId: string): Promise<{ success: boolean; message?: string }> {
    try {
      const sessionData = await this.redisClient.hget(`session:${sessionId}`, 'data');
      if (!sessionData) {
        return { success: false, message: 'Session not found' };
      }

      const session: StudySession = JSON.parse(sessionData);
      
      if (session.participants.includes(userId)) {
        return { success: false, message: 'Already joined session' };
      }

      if (session.participants.length >= session.maxParticipants) {
        return { success: false, message: 'Session is full' };
      }

      if (session.status !== 'scheduled') {
        return { success: false, message: 'Cannot join session in current status' };
      }

      // Add user to session
      session.participants.push(userId);
      await this.redisClient.hset(`session:${sessionId}`, 'data', JSON.stringify(session));
      
      // Add session to user's sessions
      await this.redisClient.sadd(`user:${userId}:sessions`, sessionId);

      return { success: true, message: 'Successfully joined session' };
    } catch (error) {
      console.error('Error joining study session:', error);
      return { success: false, message: 'Failed to join session' };
    }
  }

  async getUserSessions(userId: string): Promise<StudySession[]> {
    try {
      const sessionIds = await this.redisClient.smembers(`user:${userId}:sessions`);
      const sessions: StudySession[] = [];

      for (const sessionId of sessionIds) {
        const sessionData = await this.redisClient.hget(`session:${sessionId}`, 'data');
        if (sessionData) {
          sessions.push(JSON.parse(sessionData));
        }
      }

      return sessions;
    } catch (error) {
      console.error('Error getting user sessions:', error);
      return [];
    }
  }

  // Mentorship Management
  async requestMentorship(studentId: string, mentorId: string, sessionData: Partial<MentorshipSession>): Promise<{ success: boolean; session?: MentorshipSession }> {
    try {
      const sessionId = `mentorship_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      const session: MentorshipSession = {
        id: sessionId,
        mentorId,
        studentId,
        type: sessionData.type || 'basic',
        duration: sessionData.duration || 60,
        scheduledTime: sessionData.scheduledTime || '',
        status: 'requested',
        subject: sessionData.subject || '',
        notes: sessionData.notes
      };

      // Save mentorship session
      await this.redisClient.hset(`mentorship:${sessionId}`, 'data', JSON.stringify(session));
      
      // Add to student's mentorship sessions
      await this.redisClient.sadd(`user:${studentId}:mentorships`, sessionId);
      
      // Add to mentor's pending requests
      await this.redisClient.sadd(`user:${mentorId}:mentor_requests`, sessionId);

      return { success: true, session };
    } catch (error) {
      console.error('Error requesting mentorship:', error);
      return { success: false };
    }
  }

  async getMentorshipSessions(userId: string): Promise<MentorshipSession[]> {
    try {
      const sessionIds = await this.redisClient.smembers(`user:${userId}:mentorships`);
      const sessions: MentorshipSession[] = [];

      for (const sessionId of sessionIds) {
        const sessionData = await this.redisClient.hget(`mentorship:${sessionId}`, 'data');
        if (sessionData) {
          sessions.push(JSON.parse(sessionData));
        }
      }

      return sessions;
    } catch (error) {
      console.error('Error getting mentorship sessions:', error);
      return [];
    }
  }

  // Discovery and Search
  async findAvailableGroups(filters: { language?: string; level?: string; type?: string }): Promise<StudyGroup[]> {
    try {
      const groupIds = await this.redisClient.zrevrange('groups:active', 0, 49); // Get 50 most recent
      const groups: StudyGroup[] = [];

      for (const groupId of groupIds) {
        const groupData = await this.redisClient.hget(`group:${groupId}`, 'data');
        if (groupData) {
          const group: StudyGroup = JSON.parse(groupData);
          
          // Apply filters
          if (filters.language && group.language !== filters.language) continue;
          if (filters.level && group.level !== filters.level) continue;
          if (filters.type && group.type !== filters.type) continue;
          if (!group.isActive || group.members.length >= group.maxMembers) continue;
          
          groups.push(group);
        }
      }

      return groups;
    } catch (error) {
      console.error('Error finding available groups:', error);
      return [];
    }
  }

  async findUpcomingSessions(filters: { type?: string; maxParticipants?: number }): Promise<StudySession[]> {
    try {
      const now = Date.now();
      const sessionIds = await this.redisClient.zrange('sessions:scheduled', 0, -1); // Get all scheduled sessions
      const sessions: StudySession[] = [];

      for (const sessionId of sessionIds) {
        const sessionData = await this.redisClient.hget(`session:${sessionId}`, 'data');
        if (sessionData) {
          const session: StudySession = JSON.parse(sessionData);
          
          // Apply filters
          if (filters.type && session.type !== filters.type) continue;
          if (filters.maxParticipants && session.participants.length >= filters.maxParticipants) continue;
          if (session.status !== 'scheduled') continue;
          
          sessions.push(session);
        }
      }

      return sessions.slice(0, 20); // Return top 20 upcoming sessions
    } catch (error) {
      console.error('Error finding upcoming sessions:', error);
      return [];
    }
  }

  // Statistics and Analytics
  async getCollaborationStats(userId: string): Promise<any> {
    try {
      const groups = await this.getUserGroups(userId);
      const sessions = await this.getUserSessions(userId);
      const mentorships = await this.getMentorshipSessions(userId);

      return {
        groups: {
          total: groups.length,
          owned: groups.filter(g => g.ownerId === userId).length,
          active: groups.filter(g => g.isActive).length
        },
        sessions: {
          total: sessions.length,
          hosted: sessions.filter(s => s.hostId === userId).length,
          upcoming: sessions.filter(s => new Date(s.startTime) > new Date()).length
        },
        mentorships: {
          total: mentorships.length,
          asStudent: mentorships.filter(m => m.studentId === userId).length,
          asMentor: mentorships.filter(m => m.mentorId === userId).length
        }
      };
    } catch (error) {
      console.error('Error getting collaboration stats:', error);
      return { groups: {}, sessions: {}, mentorships: {} };
    }
  }
}
