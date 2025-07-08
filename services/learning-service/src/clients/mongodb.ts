import { MongoClient, ObjectId } from "mongodb";
import { Lesson, UserProgress, LessonCompletion } from "../types/lesson";

const MONGODB_URI = process.env.MONGO_URI || "mongodb://localhost:27017";
const DB_NAME = process.env.MONGO_DB_NAME || "yap";

// Log the connection details (with sensitive info masked)
const maskedUri = MONGODB_URI.replace(/\/\/([^:]+):([^@]+)@/, '//***:***@');
console.log(`MongoDB connecting to: ${maskedUri}`);
console.log(`MongoDB database: ${DB_NAME}`);

// Create MongoDB client with atlas connection options
const client = new MongoClient(MONGODB_URI, {
  // Additional options for MongoDB Atlas connection if needed
  // These options help with stability for production deployments
  retryWrites: true,
  w: "majority"
});
let db: any;

async function connect() {
  if (!db) {
    try {
      console.log("Attempting to connect to MongoDB...");
      await client.connect();
      db = client.db(DB_NAME);
      console.log("Connected to MongoDB database:", DB_NAME);
      
      // Ping the database to verify connection
      await db.command({ ping: 1 });
      console.log("MongoDB connection verified successfully");
    } catch (error: any) {
      console.error("Failed to connect to MongoDB:", error);
      console.error("MongoDB environment variables:", {
        uri: maskedUri,
        dbName: DB_NAME,
        uriExists: !!process.env.MONGO_URI,
        dbNameExists: !!process.env.MONGO_DB_NAME
      });
      throw new Error(`MongoDB connection failed: ${error.message}`);
    }
  }
  return db;
}

// Export the database instance for use by other services
export async function getDb() {
  return await connect();
}

// Lessons collection operations
export async function getLessonById(lessonId: string): Promise<Lesson | null> {
  const db = await connect();
  return await db.collection("lessons").findOne({ lesson_id: lessonId });
}

export async function getLessonByObjectId(id: string): Promise<Lesson | null> {
  const db = await connect();
  return await db.collection("lessons").findOne({ _id: new ObjectId(id) });
}

export async function getLessonsByLanguageAndLevel(language: string, level: string): Promise<Lesson[]> {
  const db = await connect();
  return await db.collection("lessons")
    .find({ language, level })
    .toArray();
}

// User progress operations
export async function getUserProgress(userId: string): Promise<UserProgress | null> {
  const db = await connect();
  return await db.collection("user_progress").findOne({ userId });
}

export async function createUserProgress(progress: UserProgress): Promise<string> {
  const db = await connect();
  const result = await db.collection("user_progress").insertOne(progress);
  return result.insertedId;
}

export async function updateUserProgress(userId: string, updates: Partial<UserProgress>): Promise<boolean> {
  const db = await connect();
  const result = await db.collection("user_progress").updateOne(
    { userId },
    { $set: updates }
  );
  return result.matchedCount > 0;
}

// Lesson completion operations
export async function getLessonCompletions(userId: string, limit: number = 10): Promise<LessonCompletion[]> {
  const db = await connect();
  return await db.collection("lesson_completions")
    .find({ userId })
    .sort({ timestamp: -1 })
    .limit(limit)
    .toArray();
}

export async function createLessonCompletion(completion: LessonCompletion): Promise<string> {
  const db = await connect();
  const result = await db.collection("lesson_completions").insertOne(completion);
  return result.insertedId;
}

export async function getCompletionsByDate(userId: string, date: string): Promise<LessonCompletion[]> {
  const db = await connect();
  return await db.collection("lesson_completions")
    .find({ userId, date })
    .sort({ timestamp: -1 })
    .toArray();
}

// Detailed pronunciation attempts
export async function getDetailedPronunciationAttempts(userId: string, limit: number = 10): Promise<LessonCompletion[]> {
  const db = await connect();
  return await db.collection("lesson_completions")
    .find({ 
      userId, 
      wordDetails: { $exists: true, $ne: null } 
    })
    .sort({ timestamp: -1 })
    .limit(limit)
    .toArray();
}

export async function getDetailedPronunciationByWord(userId: string, wordId: string): Promise<LessonCompletion[]> {
  const db = await connect();
  return await db.collection("lesson_completions")
    .find({ 
      userId, 
      wordId,
      wordDetails: { $exists: true, $ne: null } 
    })
    .sort({ timestamp: -1 })
    .toArray();
}

export async function getPronunciationProgress(userId: string, fromDate: string, toDate: string): Promise<any> {
  const db = await connect();
  const pipeline = [
    { 
      $match: { 
        userId,
        date: { $gte: fromDate, $lte: toDate },
        pronunciationScore: { $exists: true }
      } 
    },
    { 
      $group: {
        _id: "$date",
        averageScore: { $avg: "$pronunciationScore" },
        attempts: { $sum: 1 }
      } 
    },
    { $sort: { _id: 1 } }
  ];
  
  return await db.collection("lesson_completions").aggregate(pipeline).toArray();
}

export async function storeTTSAudio(wordId: string, language: string, audioData: Buffer): Promise<string> {
  const db = await connect();
  const audioCollection = db.collection('tts_audio');
  
  // Check if we already have this word/language combination
  const existing = await audioCollection.findOne({ wordId, language });
  if (existing) {
    return existing._id.toString();
  }
  
  // Store new TTS audio
  const result = await audioCollection.insertOne({
    wordId,
    language,
    audioData: audioData.toString('base64'),
    createdAt: new Date()
  });
  
  return result.insertedId.toString();
}

export async function getTTSAudio(wordId: string, language: string): Promise<Buffer | null> {
  const db = await connect();
  const audioCollection = db.collection('tts_audio');
  
  const record = await audioCollection.findOne({ wordId, language });
  if (!record) return null;
  
  return Buffer.from(record.audioData, 'base64');
}

// Close the MongoDB connection (for graceful shutdown)
export async function closeConnection() {
  await client.close();
  console.log("MongoDB connection closed");
}
