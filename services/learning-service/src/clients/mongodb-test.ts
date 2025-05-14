// This file is now deprecated. We're using the real MongoDB Atlas connection instead of an in-memory version.

// Import types from the correct location
import { Lesson, UserProgress, LessonCompletion } from "../types/lesson";

// Re-export functions from the main mongodb client
import { 
  getLessonById,
  getLessonByObjectId,
  getLessonsByLanguageAndLevel,
  getUserProgress,
  createUserProgress,
  updateUserProgress,
  getLessonCompletions,
  createLessonCompletion,
  getCompletionsByDate,
  closeConnection
} from './mongodb';

// Export these functions to maintain interface compatibility
export {
  getLessonById,
  getLessonByObjectId,
  getLessonsByLanguageAndLevel,
  getUserProgress,
  createUserProgress,
  updateUserProgress,
  getLessonCompletions,
  createLessonCompletion,
  getCompletionsByDate,
  closeConnection
};

// Initialize function that just logs a warning and forwards to real MongoDB
export async function initTestDb() {
  console.warn("WARNING: In-memory MongoDB test implementation is deprecated. Using real MongoDB Atlas connection instead.");
  return { uri: process.env.MONGO_URI || "mongodb://localhost:27017", db: null };
}

// Stop function that does nothing but maintains interface compatibility
export async function stopTestDb() {
  console.warn("WARNING: In-memory MongoDB test implementation is deprecated. Using real MongoDB Atlas connection instead.");
  // We don't need to do anything here as we're using the real MongoDB connection
}
