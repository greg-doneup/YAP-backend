import { MongoClient, ObjectId } from "mongodb";
import { Lesson, UserProgress, LessonCompletion } from "../types/lesson";

const MONGODB_URI = process.env.MONGO_URI || "mongodb://localhost:27017";
const DB_NAME = process.env.MONGO_DB_NAME || "yap";

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
      await client.connect();
      db = client.db(DB_NAME);
      console.log("Connected to MongoDB database:", DB_NAME);
      
      // Ping the database to verify connection
      await db.command({ ping: 1 });
      console.log("MongoDB connection verified");
    } catch (error: any) {
      console.error("Failed to connect to MongoDB:", error);
      throw new Error(`MongoDB connection failed: ${error.message}`);
    }
  }
  return db;
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

// Close the MongoDB connection (for graceful shutdown)
export async function closeConnection() {
  await client.close();
  console.log("MongoDB connection closed");
}
