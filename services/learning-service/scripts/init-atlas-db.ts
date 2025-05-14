/**
 * Initialize MongoDB Atlas database with sample data
 * This script should be run before running tests to ensure test data exists
 */
import { MongoClient } from "mongodb";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

// MongoDB connection URI from environment variables
const MONGODB_URI = process.env.MONGO_URI || "mongodb+srv://yap-backend:sipwid-cemnYj-doqto2@cy0.uvp0w.mongodb.net/?retryWrites=true&w=majority&appName=CY0";
const DB_NAME = process.env.MONGO_DB_NAME || "yap_test"; // Use test database

async function initializeAtlasDb() {
  console.log(`Initializing MongoDB Atlas database '${DB_NAME}' with sample data...`);
  
  // Create MongoDB client
  const client = new MongoClient(MONGODB_URI, {
    retryWrites: true,
    w: "majority"
  });
  
  try {
    // Connect to MongoDB Atlas
    await client.connect();
    console.log("Connected to MongoDB Atlas database:", DB_NAME);
    
    const db = client.db(DB_NAME);
    
    // Read sample lessons data
    const sampleLessonsPath = path.join(__dirname, "../sample-lessons.json");
    const sampleLessons = JSON.parse(fs.readFileSync(sampleLessonsPath, "utf-8"));
    
    // Create collections if they don't exist
    console.log("Creating collections...");
    
    // Check if collections exist, and create them if they don't
    const collections = await db.listCollections().toArray();
    const collectionNames = collections.map(c => c.name);
    
    if (!collectionNames.includes("lessons")) {
      await db.createCollection("lessons");
      console.log("Created 'lessons' collection");
    }
    
    if (!collectionNames.includes("user_progress")) {
      await db.createCollection("user_progress");
      console.log("Created 'user_progress' collection");
    }
    
    if (!collectionNames.includes("lesson_completions")) {
      await db.createCollection("lesson_completions");
      console.log("Created 'lesson_completions' collection");
    }
    
    // Create indexes
    console.log("Creating indexes...");
    await db.collection("lessons").createIndex({ lesson_id: 1 }, { unique: true });
    await db.collection("lessons").createIndex({ language: 1, level: 1 });
    await db.collection("user_progress").createIndex({ userId: 1 }, { unique: true });
    await db.collection("lesson_completions").createIndex({ userId: 1, timestamp: -1 });
    await db.collection("lesson_completions").createIndex({ userId: 1, date: 1 });
    
    // Insert sample lessons data
    console.log("Inserting sample lessons data...");
    
    // Clear existing lessons if any
    await db.collection("lessons").deleteMany({});
    
    // Insert sample lessons
    const result = await db.collection("lessons").insertMany(sampleLessons);
    console.log(`Inserted ${result.insertedCount} sample lessons.`);
    
    console.log("Database initialization completed successfully!");
  } catch (error) {
    console.error("Error initializing database:", error);
    throw error;
  } finally {
    await client.close();
    console.log("MongoDB connection closed");
  }
}

// Run the initialization function
initializeAtlasDb()
  .then(() => {
    console.log("Database initialization completed.");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Database initialization failed:", error);
    process.exit(1);
  });
