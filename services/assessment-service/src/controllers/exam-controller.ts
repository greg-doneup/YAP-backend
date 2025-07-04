/**
 * Assessment Controller
 * 
 * Handles assessment endpoints with token integration:
 * - Unit exam management with staking mechanics
 * - Skip-ahead exam purchases and attempts
 * - Exam result processing and reward distribution
 * - Unit progression tracking
 */

import { Request, Response } from 'express';
import { AssessmentTokenMiddleware } from '../middleware/assessment-token';

interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    address?: string;
  };
  tokenValidation?: {
    canProcess: boolean;
    requiresTokens: boolean;
    tokenCost: number;
    allowanceRemaining: number;
    reason: string;
    stakingData?: {
      staked: boolean;
      stakedAmount: number;
    };
  };
}

interface StartExamRequest {
  unitId: string;
  examType: 'regular' | 'skip_ahead';
  stakeTokens?: boolean;
  language: string;
}

interface SubmitExamRequest {
  examId: string;
  answers: Array<{
    questionId: string;
    answer: string | number | boolean;
    timeSpent: number;
  }>;
  timeSpent: number;
}

export class AssessmentController {
  private tokenMiddleware: AssessmentTokenMiddleware;
  private examSessions: Map<string, any> = new Map();

  constructor() {
    this.tokenMiddleware = new AssessmentTokenMiddleware();
  }

  /**
   * Start a unit exam
   */
  public startExam = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id;
      const validation = req.tokenValidation;
      const { unitId, examType, stakeTokens, language } = req.body as StartExamRequest;

      if (!userId) {
        res.status(401).json({ error: 'User not authenticated' });
        return;
      }

      console.log(`[ASSESSMENT] Starting ${examType} exam for user ${userId}, unit: ${unitId}`);

      // Generate exam questions (mock implementation)
      const examQuestions = await this.generateExamQuestions(unitId, examType, language);
      const examId = this.generateExamId();

      // Store exam session
      const examSession = {
        examId,
        userId,
        unitId,
        examType,
        staked: validation?.stakingData?.staked || false,
        stakedAmount: validation?.stakingData?.stakedAmount || 0,
        questions: examQuestions,
        startTime: new Date(),
        status: 'in_progress',
        attemptsUsed: examType === 'skip_ahead' ? await this.getAttemptCount(userId, examId) : 0
      };

      this.examSessions.set(examId, examSession);

      res.json({
        success: true,
        examId,
        questions: examQuestions.map(q => ({
          id: q.id,
          question: q.question,
          type: q.type,
          options: q.options,
          points: q.points
        })),
        timeLimit: examType === 'skip_ahead' ? 45 : 30, // minutes
        tokensSpent: validation?.tokenCost || 0,
        staked: validation?.stakingData?.staked || false,
        stakedAmount: validation?.stakingData?.stakedAmount || 0,
        attemptsUsed: examSession.attemptsUsed,
        attemptsRemaining: examType === 'skip_ahead' ? Math.max(0, 2 - examSession.attemptsUsed) : Infinity
      });

    } catch (error) {
      console.error('[ASSESSMENT] Error starting exam:', error);
      res.status(500).json({ 
        error: 'Failed to start exam',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  };

  /**
   * Submit exam answers and get results
   */
  public submitExam = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id;
      const { examId, answers, timeSpent } = req.body as SubmitExamRequest;

      if (!userId) {
        res.status(401).json({ error: 'User not authenticated' });
        return;
      }

      const examSession = this.examSessions.get(examId);
      if (!examSession || examSession.userId !== userId) {
        res.status(404).json({ error: 'Exam session not found' });
        return;
      }

      if (examSession.status !== 'in_progress') {
        res.status(400).json({ error: 'Exam already completed' });
        return;
      }

      console.log(`[ASSESSMENT] Submitting exam ${examId} for user ${userId}`);

      // Grade the exam
      const gradingResult = await this.gradeExam(examSession, answers);
      
      // Update exam session
      examSession.status = 'completed';
      examSession.completedAt = new Date();
      examSession.score = gradingResult.score;
      examSession.passed = gradingResult.passed;
      examSession.answers = answers;
      examSession.timeSpent = timeSpent;

      // Calculate and process rewards
      const examResult = {
        score: gradingResult.score,
        passed: gradingResult.passed,
        examId,
        unitId: examSession.unitId,
        examType: examSession.examType,
        wasStaked: examSession.staked,
        rewardsEarned: 0
      };

      // Process rewards (this would be handled by middleware in real implementation)
      const rewardsCalculated = await this.calculateRewards(examResult);
      if (rewardsCalculated.tokenReward > 0) {
        await this.distributeRewards(userId, rewardsCalculated, examResult);
      }

      // Handle staking outcomes
      let stakingOutcome = null;
      if (examSession.staked) {
        stakingOutcome = await this.processStakingOutcome(examSession, gradingResult);
      }

      res.json({
        success: true,
        examId,
        score: gradingResult.score,
        passed: gradingResult.passed,
        totalQuestions: examSession.questions.length,
        correctAnswers: gradingResult.correctAnswers,
        timeSpent,
        rewards: {
          tokensEarned: rewardsCalculated.tokenReward,
          bonusMultiplier: rewardsCalculated.bonusMultiplier,
          rewardType: rewardsCalculated.rewardType
        },
        staking: stakingOutcome,
        feedback: gradingResult.feedback,
        unitUnlocked: examSession.examType === 'skip_ahead' && gradingResult.passed,
        nextSteps: this.getNextSteps(examSession, gradingResult)
      });

    } catch (error) {
      console.error('[ASSESSMENT] Error submitting exam:', error);
      res.status(500).json({ 
        error: 'Failed to submit exam',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  };

  /**
   * Get exam history for a user
   */
  public getExamHistory = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id;
      const { unitId, examType, limit = 10, offset = 0 } = req.query;

      if (!userId) {
        res.status(401).json({ error: 'User not authenticated' });
        return;
      }

      // Filter exam sessions for this user
      const userExams = Array.from(this.examSessions.values())
        .filter(session => {
          let matches = session.userId === userId && session.status === 'completed';
          if (unitId) matches = matches && session.unitId === unitId;
          if (examType) matches = matches && session.examType === examType;
          return matches;
        })
        .sort((a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime())
        .slice(parseInt(offset as string), parseInt(offset as string) + parseInt(limit as string));

      const history = userExams.map(session => ({
        examId: session.examId,
        unitId: session.unitId,
        examType: session.examType,
        score: session.score,
        passed: session.passed,
        staked: session.staked,
        tokensEarned: session.tokensEarned || 0,
        completedAt: session.completedAt,
        timeSpent: session.timeSpent
      }));

      res.json({
        success: true,
        history,
        totalCount: history.length,
        hasMore: false // Simplified for mock implementation
      });

    } catch (error) {
      console.error('[ASSESSMENT] Error getting exam history:', error);
      res.status(500).json({ 
        error: 'Failed to get exam history',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  };

  /**
   * Get unit progression status
   */
  public getUnitProgression = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id;
      const { unitId } = req.params;

      if (!userId) {
        res.status(401).json({ error: 'User not authenticated' });
        return;
      }

      if (!unitId) {
        res.status(400).json({ error: 'Unit ID is required' });
        return;
      }

      // Get unit progression data (mock implementation)
      const progression = await this.calculateUnitProgression(userId, unitId);

      res.json({
        success: true,
        unitId,
        progression
      });

    } catch (error) {
      console.error('[ASSESSMENT] Error getting unit progression:', error);
      res.status(500).json({ 
        error: 'Failed to get unit progression',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  };

  /**
   * Get exam status including attempt counts
   */
  public getExamStatus = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      await this.tokenMiddleware.getExamStatus(req, res);
    } catch (error) {
      console.error('[ASSESSMENT] Error getting exam status:', error);
      res.status(500).json({ 
        error: 'Failed to get exam status',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  };

  /**
   * Generate exam questions (mock implementation)
   */
  private async generateExamQuestions(unitId: string, examType: string, language: string): Promise<any[]> {
    // Mock question generation
    const questionCount = examType === 'skip_ahead' ? 20 : 15;
    const questions = [];

    for (let i = 1; i <= questionCount; i++) {
      questions.push({
        id: `q_${i}`,
        question: `${examType === 'skip_ahead' ? 'Advanced' : 'Standard'} question ${i} for unit ${unitId} in ${language}`,
        type: i % 3 === 0 ? 'essay' : (i % 2 === 0 ? 'multiple_choice' : 'true_false'),
        options: i % 3 !== 0 ? ['Option A', 'Option B', 'Option C', 'Option D'] : undefined,
        correctAnswer: i % 3 !== 0 ? (i % 4) : undefined,
        points: examType === 'skip_ahead' ? 5 : 3,
        difficulty: examType === 'skip_ahead' ? 'hard' : 'medium'
      });
    }

    return questions;
  }

  /**
   * Grade exam answers
   */
  private async gradeExam(examSession: any, answers: any[]): Promise<{
    score: number;
    passed: boolean;
    correctAnswers: number;
    feedback: string[];
  }> {
    let correctAnswers = 0;
    const feedback = [];
    const totalQuestions = examSession.questions.length;

    // Mock grading logic
    for (const answer of answers) {
      const question = examSession.questions.find((q: any) => q.id === answer.questionId);
      if (question && question.type !== 'essay') {
        // Simple mock grading for non-essay questions
        const isCorrect = Math.random() > 0.3; // 70% chance of correct answer
        if (isCorrect) {
          correctAnswers++;
        }
        feedback.push(`Question ${answer.questionId}: ${isCorrect ? 'Correct' : 'Incorrect'}`);
      } else {
        // Mock essay grading
        correctAnswers += Math.random() > 0.4 ? 1 : 0.7; // Partial credit possible
      }
    }

    const score = Math.round((correctAnswers / totalQuestions) * 100);
    const passingScore = examSession.examType === 'skip_ahead' ? 80 : 70;
    const passed = score >= passingScore;

    return {
      score,
      passed,
      correctAnswers: Math.floor(correctAnswers),
      feedback
    };
  }

  /**
   * Calculate exam rewards
   */
  private async calculateRewards(examResult: any): Promise<{
    tokenReward: number;
    bonusMultiplier: number;
    rewardType: string;
  }> {
    if (examResult.examType === 'skip_ahead' && examResult.passed) {
      return {
        tokenReward: 3,
        bonusMultiplier: 1.0,
        rewardType: 'skip_ahead_pass'
      };
    } else if (examResult.examType === 'regular' && examResult.score >= 95) {
      return {
        tokenReward: 1,
        bonusMultiplier: examResult.wasStaked ? 1.5 : 1.0,
        rewardType: examResult.wasStaked ? 'exam_staked_pass' : 'exam_pass'
      };
    }

    return {
      tokenReward: 0,
      bonusMultiplier: 1.0,
      rewardType: 'no_reward'
    };
  }

  /**
   * Distribute rewards to user
   */
  private async distributeRewards(userId: string, rewards: any, examResult: any): Promise<void> {
    console.log(`[ASSESSMENT] Distributing ${rewards.tokenReward} tokens to user ${userId} for exam ${examResult.examId}`);
    // In real implementation, this would call the shared rewards service
  }

  /**
   * Process staking outcome
   */
  private async processStakingOutcome(examSession: any, gradingResult: any): Promise<any> {
    if (gradingResult.passed) {
      return {
        outcome: 'won',
        tokensReturned: examSession.stakedAmount,
        bonusTokens: Math.floor(examSession.stakedAmount * 0.5), // 1.5x multiplier
        message: 'Staking successful! Tokens returned with bonus.'
      };
    } else {
      return {
        outcome: 'lost',
        tokensLost: examSession.stakedAmount,
        message: 'Staking unsuccessful. Staked tokens forfeited.'
      };
    }
  }

  /**
   * Get next steps based on exam results
   */
  private getNextSteps(examSession: any, gradingResult: any): string[] {
    const steps = [];

    if (gradingResult.passed) {
      if (examSession.examType === 'skip_ahead') {
        steps.push('Unit unlocked! You can now access the next unit.');
        steps.push('Continue to the next unit to maintain your progress.');
      } else {
        steps.push('Congratulations! You have completed this unit.');
        steps.push('Consider taking the skip-ahead exam for the next unit.');
      }
    } else {
      steps.push('Review the areas where you had difficulty.');
      steps.push('Practice more lessons in this unit before retaking the exam.');
      if (examSession.examType === 'skip_ahead' && examSession.attemptsUsed < 2) {
        steps.push('You have one more attempt remaining for this skip-ahead exam.');
      }
    }

    return steps;
  }

  /**
   * Calculate unit progression
   */
  private async calculateUnitProgression(userId: string, unitId: string): Promise<any> {
    // Mock progression calculation
    return {
      lessonsCompleted: 8,
      totalLessons: 10,
      practiceScore: 85,
      examsPassed: 1,
      examsAvailable: 2,
      unitsUnlocked: 3,
      nextMilestone: 'Complete 2 more lessons to unlock final exam'
    };
  }

  /**
   * Get attempt count for skip-ahead exams
   */
  private async getAttemptCount(userId: string, examId: string): Promise<number> {
    // Mock attempt counting
    return Math.floor(Math.random() * 2); // 0 or 1
  }

  /**
   * Generate unique exam ID
   */
  private generateExamId(): string {
    return `exam_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

export default AssessmentController;
