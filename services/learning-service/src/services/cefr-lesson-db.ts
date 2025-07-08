import { MongoClient, Db, Collection, ObjectId } from 'mongodb';
import { 
  CEFRLesson, 
  CEFRLessonCategory, 
  UserCEFRProgress,
  A1_LESSON_TEMPLATES,
  A1_LESSON_CATEGORIES 
} from '../models/cefr-lesson';
import { A2_LESSON_TEMPLATES, A2_LESSON_CATEGORIES } from '../models/a2-lesson-data';
import { getSpacedRepetitionEngine } from './spaced-repetition';

/**
 * CEFR Lesson Database Service
 * Handles all database operations for CEFR-structured lessons
 */
export class CEFRLessonDB {
  private db: Db;
  private lessonsCollection: Collection<CEFRLesson>;
  private categoriesCollection: Collection<CEFRLessonCategory>;
  private progressCollection: Collection<UserCEFRProgress>;

  constructor(db: Db) {
    this.db = db;
    this.lessonsCollection = db.collection<CEFRLesson>('cefr_lessons');
    this.categoriesCollection = db.collection<CEFRLessonCategory>('cefr_lesson_categories');
    this.progressCollection = db.collection<UserCEFRProgress>('user_cefr_progress');
  }

  /**
   * Initialize CEFR lesson system with templates
   * Populates database with the 640 Spanish A1-A2 lessons
   */
  async initializeCEFRSystem(): Promise<void> {
    try {
      // Check if system is already initialized
      const existingLessons = await this.lessonsCollection.countDocuments();
      if (existingLessons > 0) {
        console.log(`CEFR system already initialized with ${existingLessons} lessons`);
        return;
      }

      console.log('Initializing CEFR lesson system...');

      // Create indexes for optimal performance
      await this.createIndexes();

      // Insert lesson categories
      const categoriesWithDefaults = [
        ...A1_LESSON_CATEGORIES.map(category => ({
          ...category,
          createdAt: new Date(),
          updatedAt: new Date()
        })),
        ...A2_LESSON_CATEGORIES.map(category => ({
          ...category,
          createdAt: new Date(),
          updatedAt: new Date()
        }))
      ] as CEFRLessonCategory[];

      await this.categoriesCollection.insertMany(categoriesWithDefaults);
      console.log(`Inserted ${categoriesWithDefaults.length} lesson categories`);

      // Insert lesson templates
      const lessonsWithDefaults = [
        ...A1_LESSON_TEMPLATES.map(lesson => ({
          ...lesson,
          id: `lesson_${lesson.lessonNumber}`,
          sections: this.generateLessonSections(lesson as CEFRLesson),
          assessment: this.generateAssessmentCriteria(lesson as CEFRLesson),
          createdAt: new Date(),
          updatedAt: new Date(),
          version: 1
        })),
        ...A2_LESSON_TEMPLATES.map(lesson => ({
          ...lesson,
          id: `lesson_${lesson.lessonNumber}`,
          sections: this.generateLessonSections(lesson as CEFRLesson),
          assessment: this.generateAssessmentCriteria(lesson as CEFRLesson),
          createdAt: new Date(),
          updatedAt: new Date(),
          version: 1
        }))
      ] as CEFRLesson[];

      await this.lessonsCollection.insertMany(lessonsWithDefaults);
      console.log(`Inserted ${lessonsWithDefaults.length} CEFR lessons`);

      console.log('✅ CEFR lesson system initialized successfully');
    } catch (error) {
      console.error('❌ Failed to initialize CEFR lesson system:', error);
      throw error;
    }
  }

  /**
   * Create database indexes for optimal query performance
   */
  private async createIndexes(): Promise<void> {
    // Lesson indexes
    await this.lessonsCollection.createIndex({ lessonNumber: 1 }, { unique: true });
    await this.lessonsCollection.createIndex({ level: 1, lessonNumber: 1 });
    await this.lessonsCollection.createIndex({ theme: 1 });
    await this.lessonsCollection.createIndex({ 'prerequisites': 1 });

    // Category indexes
    await this.categoriesCollection.createIndex({ categoryName: 1 }, { unique: true });
    await this.categoriesCollection.createIndex({ level: 1 });
    await this.categoriesCollection.createIndex({ 'lessonRange.start': 1, 'lessonRange.end': 1 });

    // Progress indexes
    await this.progressCollection.createIndex({ userId: 1, language: 1 }, { unique: true });
    await this.progressCollection.createIndex({ userId: 1, currentLesson: 1 });
    await this.progressCollection.createIndex({ lastAccessed: 1 });

    console.log('✅ Database indexes created');
  }

  /**
   * Generate lesson sections based on lesson template
   */
  private generateLessonSections(lesson: CEFRLesson): CEFRLesson['sections'] {
    const sections: CEFRLesson['sections'] = [
      {
        type: 'vocabulary',
        title: `Vocabulary: ${lesson.theme}`,
        content: `Learn ${lesson.vocabulary.targetWords.length} new words related to ${lesson.focus}`,
        estimatedTime: Math.ceil(lesson.estimatedDuration * 0.4),
        required: true
      },
      {
        type: 'grammar',
        title: `Grammar: ${lesson.grammar.concepts[0] || 'Review'}`,
        content: `Practice ${lesson.grammar.concepts.join(', ')}`,
        estimatedTime: Math.ceil(lesson.estimatedDuration * 0.3),
        required: true
      },
      {
        type: 'speaking',
        title: `Speaking Practice`,
        content: `Practice ${lesson.speaking.outputLevel} level speaking: ${lesson.speaking.complexity}`,
        estimatedTime: Math.ceil(lesson.estimatedDuration * 0.2),
        required: true
      }
    ];

    // Add cultural section if applicable
    if (lesson.culturalFocus && lesson.culturalElements) {
      sections.push({
        type: 'cultural',
        title: `Cultural Focus`,
        content: `Explore: ${lesson.culturalElements.topics.join(', ')}`,
        estimatedTime: Math.ceil(lesson.estimatedDuration * 0.1),
        required: true
      });
    }

    // Add review section for lessons after #10
    if (lesson.lessonNumber > 10) {
      sections.unshift({
        type: 'review',
        title: 'Quick Review',
        content: 'Review previous vocabulary and concepts',
        estimatedTime: 5,
        required: false
      });
    }

    return sections;
  }

  /**
   * Generate assessment criteria based on lesson level and type
   */
  private generateAssessmentCriteria(lesson: CEFRLesson): CEFRLesson['assessment'] {
    const baseVocabMastery = 0.7; // 70% minimum
    const baseGrammarAccuracy = 0.6; // 60% minimum
    const baseSpeakingScore = 60; // 60/100 minimum

    // Adjust criteria based on lesson number (progressive difficulty)
    const progressionFactor = Math.min(lesson.lessonNumber / 640, 1);
    
    return {
      vocabularyMastery: Math.min(baseVocabMastery + (progressionFactor * 0.2), 0.9),
      grammarAccuracy: Math.min(baseGrammarAccuracy + (progressionFactor * 0.3), 0.9),
      speakingScore: Math.min(baseSpeakingScore + (progressionFactor * 30), 90),
      culturalEngagement: lesson.culturalFocus
    };
  }

  // ===================
  // LESSON RETRIEVAL
  // ===================

  /**
   * Get a specific CEFR lesson by number (1-640)
   */
  async getCEFRLessonByNumber(lessonNumber: number): Promise<CEFRLesson | null> {
    return await this.lessonsCollection.findOne({ lessonNumber });
  }

  /**
   * Get lessons by category name
   */
  async getLessonsByCategory(categoryName: string): Promise<CEFRLesson[]> {
    return await this.lessonsCollection
      .find({ theme: categoryName })
      .sort({ lessonNumber: 1 })
      .toArray();
  }

  /**
   * Get lessons by level
   */
  async getLessonsByLevel(level: string): Promise<CEFRLesson[]> {
    return await this.lessonsCollection
      .find({ level: level as any })
      .sort({ lessonNumber: 1 })
      .toArray();
  }

  /**
   * Get lessons within a range
   */
  async getLessonsInRange(startLesson: number, endLesson: number): Promise<CEFRLesson[]> {
    return await this.lessonsCollection
      .find({ 
        lessonNumber: { 
          $gte: startLesson, 
          $lte: endLesson 
        } 
      })
      .sort({ lessonNumber: 1 })
      .toArray();
  }

  /**
   * Get next lesson for a user based on their progress
   */
  async getNextLessonForUser(userId: string): Promise<CEFRLesson | null> {
    const progress = await this.getUserProgress(userId);
    if (!progress) {
      // Return lesson 1 for new users
      return await this.getCEFRLessonByNumber(1);
    }

    const nextLessonNumber = progress.currentLesson + 1;
    if (nextLessonNumber > 640) {
      return null; // Course completed
    }

    return await this.getCEFRLessonByNumber(nextLessonNumber);
  }

  // ===================
  // CATEGORY MANAGEMENT
  // ===================

  /**
   * Get all lesson categories
   */
  async getAllCategories(): Promise<CEFRLessonCategory[]> {
    return await this.categoriesCollection
      .find({})
      .sort({ 'lessonRange.start': 1 })
      .toArray();
  }

  /**
   * Get category by name
   */
  async getCategoryByName(categoryName: string): Promise<CEFRLessonCategory | null> {
    return await this.categoriesCollection.findOne({ categoryName });
  }

  /**
   * Get categories by level
   */
  async getCategoriesByLevel(level: string): Promise<CEFRLessonCategory[]> {
    return await this.categoriesCollection
      .find({ level: level as any })
      .sort({ 'lessonRange.start': 1 })
      .toArray();
  }

  // ===================
  // USER PROGRESS
  // ===================

  /**
   * Get user's CEFR progress
   */
  async getUserProgress(userId: string, language: string = 'spanish'): Promise<UserCEFRProgress | null> {
    return await this.progressCollection.findOne({ userId, language });
  }

  /**
   * Initialize progress for a new user
   */
  async initializeUserProgress(userId: string, language: string = 'spanish'): Promise<UserCEFRProgress> {
    const existingProgress = await this.getUserProgress(userId, language);
    if (existingProgress) {
      return existingProgress;
    }

    const newProgress: UserCEFRProgress = {
      userId,
      language,
      currentLesson: 1,
      lessonsCompleted: [],
      lessonsUnlocked: [1], // Start with lesson 1 unlocked
      currentLevel: 'Foundation',
      levelsCompleted: [],
      levelProgress: {
        'Foundation': { lessonsCompleted: 0, totalLessons: 80, completionPercentage: 0, averageScore: 0 },
        'Elementary': { lessonsCompleted: 0, totalLessons: 80, completionPercentage: 0, averageScore: 0 },
        'Pre-Intermediate': { lessonsCompleted: 0, totalLessons: 80, completionPercentage: 0, averageScore: 0 },
        'Advanced': { lessonsCompleted: 0, totalLessons: 80, completionPercentage: 0, averageScore: 0 }
      },
      categoryProgress: {},
      skillLevels: {
        vocabulary: { wordsLearned: 0, wordsReviewed: 0, wordsMastered: 0, averageRetention: 0 },
        grammar: { conceptsLearned: [], conceptsMastered: [], averageAccuracy: 0 },
        speaking: { currentLevel: 'words', assessmentHistory: [], averageScore: 0 },
        cultural: { topicsExplored: [], comparisonsCompleted: 0, reflectionsSubmitted: 0 }
      },
      timeSpent: {
        total: 0,
        byLevel: {},
        byCategory: {},
        lastSession: new Date(),
        averageSessionLength: 0
      },
      preferences: {
        dailyGoal: 1,
        preferredSessionLength: 30,
        culturalInterests: [],
        skipAheadTokensUsed: 0
      },
      createdAt: new Date(),
      updatedAt: new Date(),
      lastAccessed: new Date()
    };

    const result = await this.progressCollection.insertOne(newProgress);
    return { ...newProgress, _id: result.insertedId };
  }

  /**
   * Complete a lesson and update user progress
   */
  async completeLessonForUser(
    userId: string, 
    lessonNumber: number, 
    scores: {
      vocabularyScore: number;
      grammarScore: number;
      speakingScore: number;
      timeSpent: number;
      culturalEngagement?: boolean;
    },
    language: string = 'spanish'
  ): Promise<UserCEFRProgress> {
    const lesson = await this.getCEFRLessonByNumber(lessonNumber);
    if (!lesson) {
      throw new Error(`Lesson ${lessonNumber} not found`);
    }

    let progress = await this.getUserProgress(userId, language);
    if (!progress) {
      progress = await this.initializeUserProgress(userId, language);
    }

    // Check if lesson is passed
    const passed = this.checkLessonPassed(lesson, scores);
    
    if (passed) {
      // Add to completed lessons
      if (!progress.lessonsCompleted.includes(lessonNumber)) {
        progress.lessonsCompleted.push(lessonNumber);
      }

      // Update current lesson if this was the next lesson
      if (lessonNumber >= progress.currentLesson) {
        progress.currentLesson = lessonNumber + 1;
        
        // Unlock next few lessons (up to 3 ahead)
        for (let i = 1; i <= 3; i++) {
          const nextLesson = lessonNumber + i;
          if (nextLesson <= 640 && !progress.lessonsUnlocked.includes(nextLesson)) { // Updated for A1+A2
            progress.lessonsUnlocked.push(nextLesson);
          }
        }
      }

      // === SPACED REPETITION INTEGRATION ===
      try {
        const spacedRepetitionEngine = getSpacedRepetitionEngine();
        
        // Add vocabulary to spaced repetition system
        const vocabularyPromises = lesson.vocabulary.targetWords.map(word => 
          spacedRepetitionEngine.addVocabularyItem(userId, word, lessonNumber, language)
        );
        
        await Promise.all(vocabularyPromises);
        console.log(`✅ Added ${lesson.vocabulary.targetWords.length} vocabulary items to spaced repetition for lesson ${lessonNumber}`);
      } catch (error) {
        console.error('❌ Error adding vocabulary to spaced repetition:', error);
        // Don't fail lesson completion if spaced repetition fails
      }

      // Update level progress
      this.updateLevelProgress(progress, lesson, scores);

      // Update category progress
      this.updateCategoryProgress(progress, lesson, scores);

      // Update skill levels
      this.updateSkillLevels(progress, lesson, scores);
    }

    // Update time tracking
    progress.timeSpent.total += scores.timeSpent;
    progress.timeSpent.byLevel[lesson.level] = (progress.timeSpent.byLevel[lesson.level] || 0) + scores.timeSpent;
    progress.timeSpent.byCategory[lesson.theme] = (progress.timeSpent.byCategory[lesson.theme] || 0) + scores.timeSpent;
    progress.timeSpent.lastSession = new Date();
    
    // Update timestamps
    progress.updatedAt = new Date();
    progress.lastAccessed = new Date();

    // Save progress
    await this.progressCollection.replaceOne(
      { userId, language },
      progress
    );

    return progress;
  }

  /**
   * Check if lesson is passed based on assessment criteria
   */
  private checkLessonPassed(lesson: CEFRLesson, scores: any): boolean {
    const vocabularyPassed = scores.vocabularyScore >= (lesson.assessment.vocabularyMastery * 100);
    const grammarPassed = scores.grammarScore >= (lesson.assessment.grammarAccuracy * 100);
    const speakingPassed = scores.speakingScore >= lesson.assessment.speakingScore;
    const culturalPassed = !lesson.assessment.culturalEngagement || scores.culturalEngagement;

    return vocabularyPassed && grammarPassed && speakingPassed && culturalPassed;
  }

  /**
   * Update level progress statistics
   */
  private updateLevelProgress(progress: UserCEFRProgress, lesson: CEFRLesson, scores: any): void {
    const levelProgress = progress.levelProgress[lesson.level];
    if (levelProgress) {
      levelProgress.lessonsCompleted++;
      
      // Calculate new average score
      const totalScore = (scores.vocabularyScore + scores.grammarScore + scores.speakingScore) / 3;
      levelProgress.averageScore = (levelProgress.averageScore * (levelProgress.lessonsCompleted - 1) + totalScore) / levelProgress.lessonsCompleted;
      
      // Update completion percentage
      levelProgress.completionPercentage = (levelProgress.lessonsCompleted / levelProgress.totalLessons) * 100;
      
      // Check if level is completed
      if (levelProgress.completionPercentage >= 100 && !progress.levelsCompleted.includes(lesson.level)) {
        progress.levelsCompleted.push(lesson.level);
        
        // Advance to next level
        const levelOrder = ['Foundation', 'Elementary', 'Pre-Intermediate', 'Advanced'];
        const currentIndex = levelOrder.indexOf(lesson.level);
        if (currentIndex >= 0 && currentIndex < levelOrder.length - 1) {
          progress.currentLevel = levelOrder[currentIndex + 1] as any;
        }
      }
    }
  }

  /**
   * Update category progress
   */
  private updateCategoryProgress(progress: UserCEFRProgress, lesson: CEFRLesson, scores: any): void {
    if (!progress.categoryProgress[lesson.theme]) {
      progress.categoryProgress[lesson.theme] = {
        started: true,
        completed: false,
        lessonsCompleted: [],
        averageScore: 0,
        timeSpent: 0,
        lastAccessed: new Date()
      };
    }

    const categoryProgress = progress.categoryProgress[lesson.theme];
    
    if (!categoryProgress.lessonsCompleted.includes(lesson.lessonNumber)) {
      categoryProgress.lessonsCompleted.push(lesson.lessonNumber);
    }
    
    // Update average score
    const totalScore = (scores.vocabularyScore + scores.grammarScore + scores.speakingScore) / 3;
    const completedCount = categoryProgress.lessonsCompleted.length;
    categoryProgress.averageScore = (categoryProgress.averageScore * (completedCount - 1) + totalScore) / completedCount;
    
    categoryProgress.timeSpent += scores.timeSpent;
    categoryProgress.lastAccessed = new Date();
  }

  /**
   * Update skill level tracking
   */
  private updateSkillLevels(progress: UserCEFRProgress, lesson: CEFRLesson, scores: any): void {
    // Update vocabulary skills
    progress.skillLevels.vocabulary.wordsLearned += lesson.vocabulary.targetWords.length;
    if (scores.vocabularyScore >= 80) {
      progress.skillLevels.vocabulary.wordsMastered += Math.floor(lesson.vocabulary.targetWords.length * 0.8);
    }

    // Update grammar skills
    lesson.grammar.newConcepts.forEach(concept => {
      if (!progress.skillLevels.grammar.conceptsLearned.includes(concept)) {
        progress.skillLevels.grammar.conceptsLearned.push(concept);
      }
      if (scores.grammarScore >= 80 && !progress.skillLevels.grammar.conceptsMastered.includes(concept)) {
        progress.skillLevels.grammar.conceptsMastered.push(concept);
      }
    });

    // Update speaking skills
    progress.skillLevels.speaking.assessmentHistory.push({
      lessonNumber: lesson.lessonNumber,
      score: scores.speakingScore,
      level: lesson.speaking.outputLevel,
      date: new Date()
    });

    // Update speaking level if consistently performing well
    const recentAssessments = progress.skillLevels.speaking.assessmentHistory.slice(-5);
    const averageRecentScore = recentAssessments.reduce((sum, a) => sum + a.score, 0) / recentAssessments.length;
    
    if (averageRecentScore >= 80) {
      const speakingLevels = ['words', 'phrases', 'sentences', 'extended'];
      const currentIndex = speakingLevels.indexOf(progress.skillLevels.speaking.currentLevel);
      if (currentIndex < speakingLevels.length - 1) {
        progress.skillLevels.speaking.currentLevel = speakingLevels[currentIndex + 1] as any;
      }
    }

    // Update cultural skills
    if (lesson.culturalFocus && lesson.culturalElements) {
      lesson.culturalElements.topics.forEach(topic => {
        if (!progress.skillLevels.cultural.topicsExplored.includes(topic)) {
          progress.skillLevels.cultural.topicsExplored.push(topic);
        }
      });
      
      if (scores.culturalEngagement) {
        progress.skillLevels.cultural.comparisonsCompleted++;
      }
    }
  }

  /**
   * Validate lesson prerequisites for user
   */
  async validateLessonPrerequisites(userId: string, lessonNumber: number, language: string = 'spanish'): Promise<{
    canAccess: boolean;
    missingPrerequisites: number[];
    reason?: string;
  }> {
    const lesson = await this.getCEFRLessonByNumber(lessonNumber);
    if (!lesson) {
      return { canAccess: false, missingPrerequisites: [], reason: 'Lesson not found' };
    }

    const progress = await this.getUserProgress(userId, language);
    if (!progress) {
      return { 
        canAccess: lessonNumber === 1, 
        missingPrerequisites: [], 
        reason: lessonNumber === 1 ? undefined : 'Must start with lesson 1' 
      };
    }

    // Check if lesson is unlocked
    if (!progress.lessonsUnlocked.includes(lessonNumber)) {
      return { 
        canAccess: false, 
        missingPrerequisites: [], 
        reason: 'Lesson not yet unlocked' 
      };
    }

    // Check prerequisites
    const missingPrerequisites: number[] = [];
    for (const prereqId of lesson.prerequisites) {
      const prereqNumber = parseInt(prereqId);
      if (!progress.lessonsCompleted.includes(prereqNumber)) {
        missingPrerequisites.push(prereqNumber);
      }
    }

    return {
      canAccess: missingPrerequisites.length === 0,
      missingPrerequisites,
      reason: missingPrerequisites.length > 0 ? 'Missing prerequisite lessons' : undefined
    };
  }
}

// Export a singleton instance
let cefrLessonDB: CEFRLessonDB | null = null;

export function initializeCEFRLessonDB(db: Db): CEFRLessonDB {
  if (!cefrLessonDB) {
    cefrLessonDB = new CEFRLessonDB(db);
  }
  return cefrLessonDB;
}

export function getCEFRLessonDB(): CEFRLessonDB {
  if (!cefrLessonDB) {
    throw new Error('CEFR Lesson DB not initialized. Call initializeCEFRLessonDB first.');
  }
  return cefrLessonDB;
}
