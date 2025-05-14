// Re-export all database functions directly from the MongoDB client
// This allows us to easily swap implementations in the future if needed
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
} from './mongodb';
