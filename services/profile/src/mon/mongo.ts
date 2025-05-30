import mongoose, { Schema, Document, Model } from 'mongoose';

// Define Profile interface
export interface Profile {
  userId: string;
  email: string;
  name: string;
  initial_language_to_learn: string;
  createdAt: string;
  updatedAt: string;
}

// Define Profile document interface
export interface ProfileDocument extends Profile, Document {}

// Define Profile schema
const ProfileSchema: Schema = new Schema({
  userId: { type: String, required: true, unique: true, index: true },
  email:    { type: String, required: true, unique: true, index: true },
  name: { type: String, required: true },
  initial_language_to_learn: { type: String, required: true },
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
    
    // Verify connection by creating a test document
    try {
      const testDoc = await ProfileModel.findOne().limit(1);
      console.log('MongoDB connection verification - found document:', testDoc ? 'YES' : 'NO');
    } catch (testError) {
      console.error('MongoDB connection verification failed:', testError);
    }
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
  
  try {
    console.log(`Putting profile for user: ${item.userId}`, JSON.stringify(item, null, 2));
    
    // First check if the profile actually exists
    const existingProfile = await ProfileModel.findOne({ userId: item.userId });
    console.log(`Checking if profile exists for ${item.userId}:`, !!existingProfile);
    
    if (existingProfile) {
      // Update existing profile
      console.log(`Profile exists, updating for user: ${item.userId}`);
      const result = await ProfileModel.findOneAndUpdate(
        { userId: item.userId },
        item,
        { new: true }
      );
      console.log(`Updated profile for user: ${item.userId}, success:`, !!result);
    } else {
      // Create new profile
      console.log(`No profile found, creating new profile for user: ${item.userId}`);
      const newProfile = new ProfileModel(item);
      await newProfile.save();
      console.log(`Created new profile for user: ${item.userId}`);
    }
    
    // Verify the profile was saved
    const verifyProfile = await ProfileModel.findOne({ userId: item.userId });
    console.log(`Verified profile exists for ${item.userId}:`, !!verifyProfile);
    
    return {};
  } catch (error) {
    console.error(`Error putting profile for ${item.userId}:`, error);
    throw error;
  }
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