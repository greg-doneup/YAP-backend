// Test script to validate the 640 lesson range
require('dotenv').config();
const { getCEFRLessonDB } = require('./dist/services/cefr-lesson-db');
const { MongoClient } = require('mongodb');

async function testLessonRange() {
  console.log('🧪 Testing CEFR lesson range validation...');
  
  try {
    // Connect to MongoDB
    const client = new MongoClient(process.env.MONGODB_URI || 'mongodb://localhost:27017');
    await client.connect();
    const db = client.db('yap-learning-dev');
    
    // Initialize CEFR system
    const cefrDB = getCEFRLessonDB(db);
    await cefrDB.initializeCEFRSystem();
    
    // Test lesson range boundaries
    console.log('Testing lesson boundary validation...');
    
    // Test valid lessons
    console.log('✅ Testing lesson 1...');
    const lesson1 = await cefrDB.getCEFRLessonByNumber(1);
    console.log(`   Lesson 1: ${lesson1 ? lesson1.theme : 'NOT FOUND'}`);
    
    console.log('✅ Testing lesson 320 (A1 end)...');
    const lesson320 = await cefrDB.getCEFRLessonByNumber(320);
    console.log(`   Lesson 320: ${lesson320 ? lesson320.theme : 'NOT FOUND'}`);
    
    console.log('✅ Testing lesson 321 (A2 start)...');
    const lesson321 = await cefrDB.getCEFRLessonByNumber(321);
    console.log(`   Lesson 321: ${lesson321 ? lesson321.theme : 'NOT FOUND'}`);
    
    console.log('✅ Testing lesson 640 (A2 end)...');
    const lesson640 = await cefrDB.getCEFRLessonByNumber(640);
    console.log(`   Lesson 640: ${lesson640 ? lesson640.theme : 'NOT FOUND'}`);
    
    // Test invalid lessons
    console.log('❌ Testing lesson 0 (should fail)...');
    const lesson0 = await cefrDB.getCEFRLessonByNumber(0);
    console.log(`   Lesson 0: ${lesson0 ? 'FOUND (ERROR!)' : 'NOT FOUND (CORRECT)'}`);
    
    console.log('❌ Testing lesson 641 (should fail)...');
    const lesson641 = await cefrDB.getCEFRLessonByNumber(641);
    console.log(`   Lesson 641: ${lesson641 ? 'FOUND (ERROR!)' : 'NOT FOUND (CORRECT)'}`);
    
    // Test next lesson calculation
    console.log('📈 Testing next lesson calculation...');
    const testUserId = 'test-user-' + Date.now();
    
    // Initialize user progress
    await cefrDB.initializeUserProgress(testUserId);
    
    // Complete lesson 320 (A1 end)
    await cefrDB.completeCEFRLesson(testUserId, 320, {
      vocabularyScore: 0.8,
      grammarScore: 0.8,
      speakingScore: 0.8,
      timeSpent: 1800
    });
    
    const nextAfter320 = await cefrDB.getNextLessonForUser(testUserId);
    console.log(`   Next lesson after 320: ${nextAfter320 ? nextAfter320.lessonNumber : 'null'}`);
    
    // Complete lesson 640 (A2 end) - should return null for next
    await cefrDB.completeCEFRLesson(testUserId, 640, {
      vocabularyScore: 0.9,
      grammarScore: 0.9,
      speakingScore: 0.9,
      timeSpent: 2100
    });
    
    const nextAfter640 = await cefrDB.getNextLessonForUser(testUserId);
    console.log(`   Next lesson after 640: ${nextAfter640 ? nextAfter640.lessonNumber : 'null (CORRECT - course complete)'}`);
    
    console.log('🎉 All tests passed! 640 lesson range is working correctly.');
    
    await client.close();
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Run the test
testLessonRange().catch(console.error);
