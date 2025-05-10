import mongoose, { Schema, Document, Model } from 'mongoose';

// Define Profile interface
export interface Profile {
  userId?: string;
  walletAddress: string;  // PK
  ethWalletAddress?: string;
  xp: number;
  streak: number;
  createdAt: string;
  updatedAt: string;
}

// Define Profile document interface
export interface ProfileDocument extends Profile, Document {}

// Define Profile schema
const ProfileSchema: Schema = new Schema({
  userId: { type: String },
  walletAddress: { type: String, required: true, unique: true, index: true },
  ethWalletAddress: { type: String },
  xp: { type: Number, default: 0, index: true }, // Index for leaderboard queries
  streak: { type: Number, default: 0 },
  createdAt: { type: String, default: () => new Date().toISOString() },
  updatedAt: { type: String, default: () => new Date().toISOString() }
}, { 
  collection: 'profiles' 
});

// Setup a pre-save middleware to update timestamps
ProfileSchema.pre('save', function(next) {
  this.updatedAt = new Date().toISOString();
  next();
});

// Create and export the model
export const ProfileModel: Model<ProfileDocument> = 
  mongoose.models.Profile || mongoose.model<ProfileDocument>('Profile', ProfileSchema);

// Database connection
const LOCAL_MONGO_URI = 'mongodb://localhost:27017/yap-dev';
const MONGO_URI = process.env.MONGO_URI || LOCAL_MONGO_URI;
const MONGO_DB_NAME = process.env.MONGO_DB_NAME || 'yap';

// Connection options - removed deprecated options
const options = {
  dbName: MONGO_DB_NAME
} as mongoose.ConnectOptions;

let isConnected = false;
let fallbackToMemory = false;

// In-memory storage for local development fallback
const inMemoryDB = new Map<string, Profile>();

/**
 * Connect to MongoDB
 */
export async function connectToDatabase(): Promise<void> {
  if (isConnected) return;
  
  try {
    console.log(`Connecting to MongoDB at ${MONGO_URI}`);
    await mongoose.connect(MONGO_URI, options);
    isConnected = true;
    console.log('MongoDB connected successfully');
  } catch (error) {
    console.error('Failed to connect to MongoDB:', error);
    fallbackToMemory = true;
    console.warn('Using in-memory fallback for development');
  }
}

/**
 * MongoDB wrapper to provide consistent API
 */
export const mongo = {
  // Get profile by wallet address
  async getProfile(walletAddress: string): Promise<Profile | null> {
    if (fallbackToMemory) {
      return inMemoryDB.get(walletAddress) || null;
    }
    
    return ProfileModel.findOne({ walletAddress }).lean();
  },
  
  // Create or replace profile
  async putProfile(profile: Profile): Promise<void> {
    if (fallbackToMemory) {
      inMemoryDB.set(profile.walletAddress, profile);
      return;
    }
    
    await ProfileModel.findOneAndUpdate(
      { walletAddress: profile.walletAddress },
      profile,
      { upsert: true, new: true }
    );
  },
  
  // Update profile
  async updateProfile(walletAddress: string, update: Partial<Profile>): Promise<Profile | null> {
    if (fallbackToMemory) {
      const profile = inMemoryDB.get(walletAddress);
      if (!profile) return null;
      
      const updatedProfile = { 
        ...profile, 
        ...update,
        updatedAt: new Date().toISOString()
      };
      inMemoryDB.set(walletAddress, updatedProfile);
      return updatedProfile;
    }
    
    return ProfileModel.findOneAndUpdate(
      { walletAddress },
      { ...update, updatedAt: new Date().toISOString() },
      { new: true }
    ).lean();
  },
  
  // Add XP points to a profile
  async addXP(walletAddress: string, points: number): Promise<Profile | null> {
    if (fallbackToMemory) {
      const profile = inMemoryDB.get(walletAddress);
      if (!profile) return null;
      
      profile.xp = (profile.xp || 0) + points;
      profile.updatedAt = new Date().toISOString();
      inMemoryDB.set(walletAddress, profile);
      return profile;
    }
    
    return ProfileModel.findOneAndUpdate(
      { walletAddress },
      { $inc: { xp: points }, updatedAt: new Date().toISOString() },
      { new: true }
    ).lean();
  },
  
  // Delete profile
  async deleteProfile(walletAddress: string): Promise<void> {
    if (fallbackToMemory) {
      inMemoryDB.delete(walletAddress);
      return;
    }
    
    await ProfileModel.deleteOne({ walletAddress });
  },
  
  // Get leaderboard by XP
  async getLeaderboard(limit: number = 10): Promise<Profile[]> {
    if (fallbackToMemory) {
      return Array.from(inMemoryDB.values())
        .sort((a, b) => (b.xp || 0) - (a.xp || 0))
        .slice(0, limit);
    }
    
    return ProfileModel.find({})
      .sort({ xp: -1 })
      .limit(limit)
      .lean();
  }
};