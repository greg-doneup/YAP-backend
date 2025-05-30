// MongoDB connection test script
const mongoose = require('mongoose');

const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://yap-backend:sipwid-cemnYj-doqto2@cy0.uvp0w.mongodb.net/?retryWrites=true&w=majority&appName=CY0';
const MONGO_DB_NAME = process.env.MONGO_DB_NAME || 'yap';

console.log(`Connecting to MongoDB at ${MONGO_URI} with database ${MONGO_DB_NAME}`);

// Connection options
const options = {
  dbName: MONGO_DB_NAME
};

async function main() {
  try {
    await mongoose.connect(MONGO_URI, options);
    console.log('MongoDB connected successfully');
    
    // Define a simple schema for testing
    const ProfileSchema = new mongoose.Schema({
      userId: { type: String, required: true, unique: true, index: true },
      email: { type: String, required: true },
      name: { type: String, required: true },
      createdAt: { type: String, default: () => new Date().toISOString() }
    }, { collection: 'profiles' });
    
    const ProfileModel = mongoose.model('Profile', ProfileSchema);
    
    // Test finding profiles
    console.log('Attempting to find all profiles...');
    const profiles = await ProfileModel.find().limit(5);
    console.log(`Found ${profiles.length} profiles`);
    
    if (profiles.length > 0) {
      console.log('Sample profile:');
      console.log(JSON.stringify(profiles[0], null, 2));
    }
    
    // Test finding a specific profile
    const testId = '3426a584358aa9eb3d18ff92b1fdac5ec5878d99a0f6897105185f3635765911';
    console.log(`Attempting to find profile with ID ${testId}`);
    const profile = await ProfileModel.findOne({ userId: testId });
    if (profile) {
      console.log('Profile found:');
      console.log(JSON.stringify(profile, null, 2));
    } else {
      console.log('Profile not found');
    }
    
    // Test creating a new profile
    const testProfile = new ProfileModel({
      userId: `test-${Date.now()}`,
      email: `test-${Date.now()}@example.com`,
      name: `Test User ${Date.now()}`
    });
    
    console.log('Attempting to create a test profile...');
    await testProfile.save();
    console.log('Test profile created successfully');
    
  } catch (error) {
    console.error('MongoDB connection or operation error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('MongoDB disconnected');
  }
}

main();
