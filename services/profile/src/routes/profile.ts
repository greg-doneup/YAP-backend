import express from 'express';
import { connectToDatabase, getItem, putItem, updateItem } from '../mon/mongo';
import { Profile } from '../types';
import { getUserIdFromRequest } from '../shared/auth/authMiddleware';
import { ProfileModel } from '../mon/mongo';

const router = express.Router();

// Initialize MongoDB connection
connectToDatabase().catch(err => {
  console.error('Failed to connect to MongoDB:', err);
});

/** GET /profile/:userId */
router.get('/:userId', async (req, res, next) => {
  try {
    // Verify user ID ownership or admin access
    const userIdFromToken = getUserIdFromRequest(req);
    const requestedUserId = req.params.userId;
    
    // Only allow users to access their own profile unless they have admin role
    const isOwnProfile = userIdFromToken === requestedUserId;
    const isAdmin = (req as any).user?.roles?.includes('admin');
    
    if (!isOwnProfile && !isAdmin) {
      return res.status(403).json({ 
        error: 'forbidden',
        message: 'You can only access your own profile' 
      });
    }
    
    const { Item } = await getItem(requestedUserId);
    if (!Item) return res.status(404).json({
      error: 'not_found',
      message: 'Profile not found'
    });
    res.json(Item);
  } catch (err) { next(err); }
});

/** POST /profile */
router.post('/', async (req, res, next) => {
  try {
    console.log('Processing profile creation request:');
    console.log('Headers:', JSON.stringify(req.headers, null, 2));
    console.log('Body:', JSON.stringify(req.body, null, 2));
    
    // Get userId from either token or body
    const userId = getUserIdFromRequest(req);
    console.log('Final userId resolved:', userId);
    
    if (!userId) {
      return res.status(400).json({ 
        error: 'missing_user_id',
        message: 'No user ID found in the token or request body' 
      });
    }
    
    if (!req.body.email) {
      return res.status(400).json({
        error: 'missing_email',
        message: 'Email is required'
      });
    }

    if (!req.body.name) {
      return res.status(400).json({
        error: 'missing_name',
        message: 'Name is required'
      });
    }

    if (!req.body.language_to_learn) {
      return res.status(400).json({
        error: 'missing_language',
        message: 'Initial language to learn is required'
      });
    }
    
    const now = new Date().toISOString();
    const profile: Profile = {
      userId,
      email: req.body.email,
      name: req.body.name,
      initial_language_to_learn: req.body.language_to_learn,
      createdAt: now,
      updatedAt: now,
    };
    
    // Try to get the profile first to definitively check if it exists
    const { Item: existingProfile } = await getItem(userId);
    console.log(`Profile existence check for ${userId}:`, !!existingProfile);
    
    if (existingProfile) {
      console.log(`Profile already exists for ${userId}, returning 200 instead of 409`);
      // Return the existing profile with a 200 instead of error 409
      // This helps with retries and edge cases
      return res.status(200).json(existingProfile);
    }
    
    // Create the profile
    try {
      console.log(`Creating new profile for ${userId}`);
      await putItem(profile);
      console.log(`Profile created successfully for ${userId}`);
      return res.status(201).json(profile);
    } catch (err: any) {
      console.error(`Error creating profile for ${userId}:`, err);
      
      // One more check to see if the profile was actually created despite the error
      const { Item: doubleCheckProfile } = await getItem(userId);
      if (doubleCheckProfile) {
        console.log(`Despite error, profile exists for ${userId}, returning 200`);
        return res.status(200).json(doubleCheckProfile);
      }
      
      // Handle duplicate key error from MongoDB
      if (err.code === 11000) {
        console.log(`Duplicate key error for ${userId}, returning 409`);
        return res.status(409).json({ 
          error: 'profile_exists',
          message: 'Profile already exists for this user' 
        });
      }
      throw err;
    }
  } catch (err) { 
    console.error('Unhandled error in profile creation:', err);
    next(err); 
  }
});

/** PATCH /profile/:userId */
router.patch('/:userId', async (req, res, next) => {
  try {
    // Verify ownership or admin access
    const userIdFromToken = getUserIdFromRequest(req);
    const requestedUserId = req.params.userId;
    
    // Only allow users to update their own profile unless they have admin role
    const isOwnProfile = userIdFromToken === requestedUserId;
    const isAdmin = (req as any).user?.roles?.includes('admin');
    
    if (!isOwnProfile && !isAdmin) {
      return res.status(403).json({ 
        error: 'forbidden',
        message: 'You can only update your own profile' 
      });
    }
    
    const now = new Date().toISOString();
    const updates: Record<string, any> = { updatedAt: now };
    
    // Allow updating email, name, and language preference
    if (req.body.email !== undefined) updates.email = req.body.email;
    if (req.body.name !== undefined) updates.name = req.body.name;
    if (req.body.initial_language_to_learn !== undefined) 
      updates.initial_language_to_learn = req.body.initial_language_to_learn;

    // Format for MongoDB update
    const result = await updateItem({
      Key: { userId: requestedUserId },
      UpdateExpression: `SET ${Object.keys(updates).map((k, i) => `#k${i} = :v${i}`).join(', ')}`,
      ExpressionAttributeNames: Object.keys(updates).reduce((acc, k, i) => ({ ...acc, [`#k${i}`]: k }), {}),
      ExpressionAttributeValues: Object.values(updates).reduce((acc, v, i) => ({ ...acc, [`:v${i}`]: v }), {})
    });
    
    if (!result.Attributes) {
      return res.status(404).json({
        error: 'not_found',
        message: 'Profile not found'
      });
    }
    
    res.sendStatus(204);
  } catch (err) { next(err); }
});

/** GET /profile/email/:email */
router.get('/email/:email', async (req, res, next) => {
  try {
    const email = req.params.email;
    const found = await ProfileModel.findOne({ email }).lean();
    if (!found) {
      return res.status(404).json({ error: 'not_found', message: 'Profile not found' });
    }
    return res.json(found);
  } catch (err) {
    next(err);
  }
});

export default router;
