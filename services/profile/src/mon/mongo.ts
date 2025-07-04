import mongoose, { Schema, Document, Model } from 'mongoose';

// Define Profile interface
export interface Profile {
  userId: string;
  email: string;
  name: string;
  initial_language_to_learn: string;
  createdAt: string;
  updatedAt: string;
  // Waitlist fields
  isWaitlistUser?: boolean;
  waitlist_signup_at?: string;
  wlw?: boolean; // wallet_linked_to_wallet (has wallet)
  converted?: boolean; // waitlist user converted to full account
  
  // Non-custodial wallet data (user-encrypted)
  passphrase_hash?: string;
  encrypted_mnemonic?: string;
  salt?: string;
  nonce?: string;
  
  // Wallet addresses and metadata
  seiWalletAddress?: string;
  evmWalletAddress?: string;
  wallet_created_at?: string;
  secured_at?: string;
  
  // Wallet objects
  sei_wallet?: {
    address: string;
    public_key: string;
  };
  eth_wallet?: {
    address: string;
    public_key: string;
  };
  
  // Enhanced encrypted wallet container
  encrypted_wallet_data?: {
    encrypted_mnemonic: string;
    salt: string;
    nonce: string;
    sei_address: string;
    eth_address: string;
  };
  
  // SECURE PASSPHRASE ARCHITECTURE FIELDS (NEW)
  encryptedStretchedKey?: number[];    // AES-GCM encrypted PBKDF2 output
  encryptionSalt?: number[];           // Salt for deriving encryption key
  stretchedKeyNonce?: number[];        // AES-GCM nonce for encrypted stretched key
  mnemonic_salt?: string;             // Salt for mnemonic encryption
  mnemonic_nonce?: string;            // Nonce for mnemonic encryption
  
  // Legacy custodial wallet data (deprecated, for migration only)
  encryptedPrivateKey?: string;
  walletAddress?: string;
  keyCreatedAt?: string;
  keyLastAccessed?: string;
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
  updatedAt: { type: String, default: () => new Date().toISOString() },
  // Waitlist fields
  isWaitlistUser: { type: Boolean, default: false },
  waitlist_signup_at: { type: String },
  wlw: { type: Boolean, default: false }, // wallet_linked_to_wallet (has wallet)
  converted: { type: Boolean, default: false }, // waitlist user converted to full account
  // Optional wallet fields (non-custodial, user-encrypted)
  passphrase_hash: { type: String, select: false }, // Never select by default for security
  encrypted_mnemonic: { type: String, select: false },
  salt: { type: String, select: false },
  nonce: { type: String, select: false },
  
  // SECURE PASSPHRASE ARCHITECTURE FIELDS (NEW)
  encryptedStretchedKey: { type: [Number], select: false }, // AES-GCM encrypted PBKDF2 output
  encryptionSalt: { type: [Number], select: false },        // Salt for deriving encryption key
  stretchedKeyNonce: { type: [Number], select: false },     // AES-GCM nonce for encrypted stretched key
  mnemonic_salt: { type: String, select: false },          // Salt for mnemonic encryption  
  mnemonic_nonce: { type: String, select: false },         // Nonce for mnemonic encryption
  
  encrypted_wallet_data: {
    encrypted_mnemonic: { type: String },
    salt: { type: String },
    nonce: { type: String },
    sei_address: { type: String },
    eth_address: { type: String }
  },
  sei_wallet: {
    address: { type: String },
    public_key: { type: String }
  },
  eth_wallet: {
    address: { type: String },
    public_key: { type: String }
  },
  
  // Top-level wallet addresses for compatibility
  seiWalletAddress: { type: String, index: true },
  evmWalletAddress: { type: String, index: true },
  
  // Wallet metadata timestamps
  secured_at: { type: String },
  wallet_created_at: { type: String },
  
  // Legacy custodial wallet fields (deprecated, for migration only)
  encryptedPrivateKey: { type: String, select: false },
  walletAddress: { type: String, index: true },
  keyCreatedAt: { type: String },
  keyLastAccessed: { type: String }
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

// Connection options - with proper timeout settings for production
const options = {
  dbName: MONGO_DB_NAME,
  serverSelectionTimeoutMS: 5000, // Timeout after 5s instead of 30s
  socketTimeoutMS: 45000, // Close socket after 45s of inactivity
  maxPoolSize: 10, // Maintain up to 10 socket connections
  minPoolSize: 1, // Maintain at least 1 socket connection
  maxIdleTimeMS: 30000, // Close connections after 30s of inactivity
  bufferMaxEntries: 0, // Disable mongoose buffering
  bufferCommands: false, // Disable mongoose buffering for immediate errors
  heartbeatFrequencyMS: 10000, // Check connection every 10s
  retryWrites: true,
  retryReads: true
} as mongoose.ConnectOptions;

let isConnected = false;
let fallbackToMemory = false;

// In-memory storage for local development fallback
const localDB = new Map<string, Profile>();

/**
 * Connect to MongoDB with improved error handling
 */
export async function connectToDatabase(): Promise<void> {
  if (isConnected) return;
  
  try {
    console.log(`Connecting to MongoDB at ${MONGO_URI.replace(/\/\/[^:]+:[^@]+@/, '//***:***@')}`);
    console.log('MongoDB options:', JSON.stringify(options, null, 2));
    
    await mongoose.connect(MONGO_URI, options);
    isConnected = true;
    console.log('✅ MongoDB connected successfully');
    
    // Set up connection event handlers
    mongoose.connection.on('disconnected', () => {
      console.warn('❌ MongoDB disconnected');
      isConnected = false;
    });
    
    mongoose.connection.on('error', (error) => {
      console.error('❌ MongoDB connection error:', error);
      isConnected = false;
    });
    
    mongoose.connection.on('reconnected', () => {
      console.log('✅ MongoDB reconnected');
      isConnected = true;
    });
    
    // Verify connection with timeout
    try {
      const testDoc = await Promise.race([
        ProfileModel.findOne().limit(1).lean(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Connection test timeout')), 5000))
      ]);
      console.log('✅ MongoDB connection verification:', testDoc ? 'Found existing data' : 'Database ready');
    } catch (testError) {
      console.error('❌ MongoDB connection verification failed:', testError);
      throw testError;
    }
  } catch (error) {
    console.error('❌ Failed to connect to MongoDB:', error);
    isConnected = false;
    fallbackToMemory = true;
    console.warn('⚠️ Using in-memory fallback for development');
    throw error; // Re-throw to let caller handle the error
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
    // Ensure we're connected before attempting to save
    if (!mongoose.connection.readyState) {
      console.log(`[PUT-ITEM] Database not connected, attempting to reconnect...`);
      await connectToDatabase();
    }
    
    console.log(`Putting profile for user: ${item.userId}`, JSON.stringify(item, null, 2));
    
    // First check if the profile actually exists
    const existingProfile = await ProfileModel.findOne({ userId: item.userId }).maxTimeMS(5000);
    console.log(`Checking if profile exists for ${item.userId}:`, !!existingProfile);
    
    if (existingProfile) {
      // Update existing profile
      console.log(`Profile exists, updating for user: ${item.userId}`);
      const result = await ProfileModel.findOneAndUpdate(
        { userId: item.userId },
        item,
        { new: true, maxTimeMS: 5000 }
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
    const verifyProfile = await ProfileModel.findOne({ userId: item.userId }).maxTimeMS(5000);
    console.log(`Verified profile exists for ${item.userId}:`, !!verifyProfile);
    
    return {};
  } catch (error: any) {
    console.error(`Error putting profile for ${item.userId}:`, error);
    
    // Check if this is a connection issue
    if (error.name === 'MongooseServerSelectionError' || error.name === 'MongoTimeoutError' || error.code === 'ECONNREFUSED') {
      console.error(`Database connection issue for user ${item.userId}:`, error.message);
      // Try to reconnect and retry once
      try {
        console.log(`Attempting to reconnect and retry profile creation for ${item.userId}...`);
        await connectToDatabase();
        const newProfile = new ProfileModel(item);
        await newProfile.save();
        console.log(`✅ Retry successful: Created profile for user: ${item.userId}`);
        return {};
      } catch (retryError) {
        console.error(`❌ Retry failed for user ${item.userId}:`, retryError);
        throw retryError;
      }
    }
    
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