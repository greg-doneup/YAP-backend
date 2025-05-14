import { MongoClient } from "mongodb";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

// MongoDB connection URI - use the Atlas connection string from k8s secrets
const MONGODB_URI = process.env.MONGO_URI || "mongodb://localhost:27017";
const DB_NAME = process.env.MONGO_DB_NAME || "yap";

async function initializeDatabase() {
  console.log("Initializing MongoDB with sample data...");
  
  // Create MongoDB client
  const client = new MongoClient(MONGODB_URI);
  
  try {
    // Connect to MongoDB
    await client.connect();
    console.log("Connected to MongoDB database:", DB_NAME);
    
    const db = client.db(DB_NAME);
    
    // Read sample lessons data
    const sampleLessonsPath = path.join(__dirname, "../sample-lessons.json");
    const sampleLessons = JSON.parse(fs.readFileSync(sampleLessonsPath, "utf-8"));
    
    // Create collections if they don't exist
    console.log("Creating collections...");
    await db.createCollection("lessons");
    await db.createCollection("user_progress");
    await db.createCollection("lesson_completions");
    
    // Check if lessons collection already has data
    const lessonsCount = await db.collection("lessons").countDocuments();
    
    if (lessonsCount === 0) {
      console.log("Inserting sample lessons data...");
      await db.collection("lessons").insertMany(sampleLessons);
      console.log(`Inserted ${sampleLessons.length} sample lessons.`);
    } else {
      console.log(`Lessons collection already has ${lessonsCount} documents. Skipping sample data insertion.`);
    }
    
    // Create indexes for better performance
    console.log("Creating indexes...");
    await db.collection("lessons").createIndex({ lesson_id: 1 }, { unique: true });
    await db.collection("lessons").createIndex({ language: 1, level: 1 });
    await db.collection("user_progress").createIndex({ userId: 1 }, { unique: true });
    await db.collection("lesson_completions").createIndex({ userId: 1, timestamp: -1 });
    await db.collection("lesson_completions").createIndex({ userId: 1, date: 1 });
    
    console.log("Database initialization complete!");
  } catch (error) {
    console.error("Error initializing database:", error);
  } finally {
    await client.close();
    console.log("MongoDB connection closed");
  }
}

// Run the initialization
initializeDatabase().catch(console.error);
