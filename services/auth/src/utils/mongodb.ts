import { MongoClient, Db } from "mongodb";

const MONGODB_URI = process.env.MONGO_URI || "mongodb://localhost:27017";
const DB_NAME = process.env.MONGO_DB_NAME || "yap";

// Log the connection details (with sensitive info masked)
const maskedUri = MONGODB_URI.replace(/\/\/([^:]+):([^@]+)@/, '//***:***@');
console.log(`Auth Service MongoDB connecting to: ${maskedUri}`);
console.log(`Auth Service MongoDB database: ${DB_NAME}`);

// Create MongoDB client with connection options
const client = new MongoClient(MONGODB_URI, {
  retryWrites: true,
  w: "majority"
});

let db: Db | null = null;

/**
 * Connect to MongoDB database
 * @returns The database instance
 */
async function connect(): Promise<Db> {
  if (!db) {
    try {
      console.log("Auth service attempting to connect to MongoDB...");
      await client.connect();
      db = client.db(DB_NAME);
      console.log("Auth service connected to MongoDB database:", DB_NAME);
      
      // Ping the database to verify connection
      await db.command({ ping: 1 });
      console.log("Auth service MongoDB connection verified successfully");
    } catch (error: any) {
      console.error("Auth service failed to connect to MongoDB:", error);
      console.error("Auth service MongoDB environment variables:", {
        uri: maskedUri,
        dbName: DB_NAME,
        uriExists: !!process.env.MONGO_URI,
        dbNameExists: !!process.env.MONGO_DB_NAME
      });
      throw new Error(`Auth service MongoDB connection failed: ${error.message}`);
    }
  }
  return db;
}

/**
 * Get the MongoDB database instance
 * @returns The database instance
 */
export async function getDatabase(): Promise<Db> {
  return await connect();
}

/**
 * Save a refresh token for a user
 * @param userId The user ID
 * @param refreshToken The refresh token to save
 */
export async function saveRefreshToken(userId: string, refreshToken: string): Promise<void> {
  try {
    const db = await getDatabase();
    await db.collection('refresh_tokens').insertOne({
      userId,
      refreshToken,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
    });
  } catch (error) {
    console.error('Failed to save refresh token to MongoDB:', error);
    throw error;
  }
}

/**
 * Validate if a refresh token exists for a user
 * @param userId The user ID
 * @param refreshToken The refresh token to validate
 * @returns True if the token is valid, false otherwise
 */
export async function validateRefreshToken(userId: string, refreshToken: string): Promise<boolean> {
  try {
    const db = await getDatabase();
    const token = await db.collection('refresh_tokens').findOne({
      userId,
      refreshToken,
      expiresAt: { $gt: new Date() }
    });
    return !!token;
  } catch (error) {
    console.error('Failed to validate refresh token in MongoDB:', error);
    return false;
  }
}

/**
 * Delete all refresh tokens for a user (logout)
 * @param userId The user ID
 */
export async function deleteRefreshToken(userId: string): Promise<void> {
  try {
    const db = await getDatabase();
    await db.collection('refresh_tokens').deleteMany({ userId });
  } catch (error) {
    console.error('Failed to delete refresh tokens from MongoDB:', error);
    throw error;
  }
}

/**
 * Delete a specific refresh token for a user
 * @param userId The user ID
 * @param refreshToken The specific refresh token to delete
 * @returns True if token was found and deleted, false otherwise
 */
export async function deleteSpecificRefreshToken(userId: string, refreshToken: string): Promise<boolean> {
  try {
    const db = await getDatabase();
    const result = await db.collection('refresh_tokens').deleteOne({
      userId,
      refreshToken
    });
    return result.deletedCount > 0;
  } catch (error) {
    console.error('Failed to delete specific refresh token from MongoDB:', error);
    return false;
  }
}

/**
 * Log security events to MongoDB
 * @param eventType The type of security event
 * @param clientIp The client IP address
 * @param details Additional event details
 */
export async function logSecurityEvent(eventType: string, clientIp: string, details: any): Promise<void> {
  try {
    const db = await getDatabase();
    await db.collection('security_audit').insertOne({
      eventType,
      clientIp,
      details,
      service: 'auth-service',
      timestamp: new Date()
    });
  } catch (error) {
    console.error('Failed to log security event to MongoDB:', error);
    // Don't throw error for logging failures - just log and continue
  }
}

/**
 * Close the MongoDB connection (for graceful shutdown)
 */
export async function closeConnection(): Promise<void> {
  try {
    await client.close();
    console.log("Auth service MongoDB connection closed");
  } catch (error) {
    console.error("Failed to close Auth service MongoDB connection:", error);
  }
}