import mongoose, { Schema, Document, Model } from 'mongoose';

// Define Profile interface
export interface Profile {
  userId?: string;
  walletAddress: string;
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
const localDB = new Map<string, Profile>();

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

// MongoDB helper functions maintaining the same API as before
export async function getItem(userId: string): Promise<{ Item: Profile | undefined }> {
  if (fallbackToMemory) {
    console.log(`[LOCAL] Getting item for user: ${userId}`);
    return { Item: localDB.get(userId) };
  }
  
  const profile = await ProfileModel.findOne({ userId }).lean();
  return { Item: profile as Profile | undefined };
}

export async function putItem(item: Profile): Promise<{}> {
  if (fallbackToMemory) {
    console.log(`[LOCAL] Putting item for user: ${item.userId}`);
    localDB.set(item.userId as string, item);
    return {};
  }
  
  await ProfileModel.findOneAndUpdate(
    { userId: item.userId },
    item,
    { upsert: true }
  );
  return {};
}

export async function updateItem(params: any): Promise<{ Attributes: Profile | null }> {
  const userId = params.Key?.userId;
  
  if (fallbackToMemory) {
    console.log(`[LOCAL] Updating item with key: ${JSON.stringify(params.Key)}`);
    const item = localDB.get(userId) || {} as Record<string, any>;
    
    // Basic implementation for SET expressions
    if (params.UpdateExpression?.includes('SET')) {
      const attrMap = params.ExpressionAttributeNames || {};
      const valueMap = params.ExpressionAttributeValues || {};
      
      const setParts = params.UpdateExpression.replace('SET ', '').split(',');
      setParts.forEach((part: string) => {
        const [path, value] = part.trim().split('=');
        const resolvedPath = path.trim().replace(/#(\w+)/g, (_, name) => attrMap[`#${name}`]);
        const resolvedValue = value.trim().replace(/:(\w+)/g, (_, name) => valueMap[`:${name}`]);
        
        if (resolvedPath && resolvedValue) {
          (item as Record<string, any>)[resolvedPath.trim()] = resolvedValue.trim();
        }
      });
    }
    
    const updatedItem = { ...item, updatedAt: new Date().toISOString() } as Profile;
    localDB.set(userId, updatedItem);
    return { Attributes: updatedItem };
  }
  
  // Build update object from UpdateExpression
  const updateObj: Record<string, any> = {};
  
  if (params.UpdateExpression?.includes('SET')) {
    const attrMap = params.ExpressionAttributeNames || {};
    const valueMap = params.ExpressionAttributeValues || {};
    
    const setParts = params.UpdateExpression.replace('SET ', '').split(',');
    setParts.forEach((part: string) => {
      const [path, value] = part.trim().split('=');
      const resolvedPath = path.trim().replace(/#(\w+)/g, (_, name) => attrMap[`#${name}`]);
      const resolvedValue = value.trim().replace(/:(\w+)/g, (_, name) => valueMap[`:${name}`]);
      
      if (resolvedPath && resolvedValue) {
        updateObj[resolvedPath.trim()] = resolvedValue.trim();
      }
    });
  }
  
  updateObj.updatedAt = new Date().toISOString();
  
  const updatedProfile = await ProfileModel.findOneAndUpdate(
    { userId },
    updateObj,
    { new: true }
  ).lean();
  
  return { Attributes: updatedProfile as Profile | null };
}

export async function deleteItem(userId: string): Promise<{}> {
  if (fallbackToMemory) {
    console.log(`[LOCAL] Deleting item for user: ${userId}`);
    localDB.delete(userId);
    return {};
  }
  
  await ProfileModel.deleteOne({ userId });
  return {};
}