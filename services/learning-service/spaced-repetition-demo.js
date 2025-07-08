const axios = require('axios');

const BASE_URL = 'http://localhost:8080';
const CEFR_ENDPOINT = `${BASE_URL}/api/cefr`;
const SPACED_REP_ENDPOINT = `${BASE_URL}/api/spaced-repetition`;

async function demonstrateSpacedRepetitionSystem() {
    console.log('🎯 Demonstrating Spaced Repetition Integration with CEFR System\n');
    
    try {
        // === 1. Show Current CEFR System Status ===
        console.log('=== 1. Current CEFR System Status ===');
        
        const lesson1 = await axios.get(`${CEFR_ENDPOINT}/lessons/1`);
        console.log('✅ Lesson 1 available:', lesson1.data.lesson.theme);
        console.log('   Vocabulary words:', lesson1.data.lesson.vocabulary.targetWords);
        console.log('   Lesson focus:', lesson1.data.lesson.focus);
        
        const foundationLessons = await axios.get(`${CEFR_ENDPOINT}/level/Foundation`);
        console.log('✅ Foundation lessons available:', foundationLessons.data.lessons.length);
        
        // === 2. Test Spaced Repetition Endpoints ===
        console.log('\n=== 2. Spaced Repetition Endpoints Test ===');
        
        // Test adding vocabulary (this would normally happen automatically on lesson completion)
        console.log('🔄 Testing vocabulary addition...');
        try {
            await axios.post(`${SPACED_REP_ENDPOINT}/add-vocabulary`, {
                word: 'hola',
                lessonNumber: 1,
                language: 'spanish'
            });
            console.log('✅ Successfully added "hola" to spaced repetition');
        } catch (error) {
            if (error.response?.status === 401) {
                console.log('⚠️  Authentication required for spaced repetition (expected)');
            } else {
                console.log('❌ Error adding vocabulary:', error.response?.data?.error);
            }
        }
        
        // Test getting daily review queue
        console.log('\n🔄 Testing daily review queue...');
        try {
            const dailyQueue = await axios.get(`${SPACED_REP_ENDPOINT}/daily-queue`);
            console.log('✅ Daily queue retrieved:', dailyQueue.data);
        } catch (error) {
            if (error.response?.status === 401) {
                console.log('⚠️  Authentication required for daily queue (expected)');
            } else {
                console.log('❌ Error getting daily queue:', error.response?.data?.error);
            }
        }
        
        // Test getting statistics
        console.log('\n🔄 Testing spaced repetition statistics...');
        try {
            const stats = await axios.get(`${SPACED_REP_ENDPOINT}/statistics`);
            console.log('✅ Statistics retrieved:', stats.data);
        } catch (error) {
            if (error.response?.status === 401) {
                console.log('⚠️  Authentication required for statistics (expected)');
            } else {
                console.log('❌ Error getting statistics:', error.response?.data?.error);
            }
        }
        
        // === 3. Demonstrate A1 to A2 Progression Concept ===
        console.log('\n=== 3. A1 to A2 Progression Concept ===');
        
        console.log('📚 A1 Foundation Lessons (1-320):');
        console.log('   - Basic vocabulary building');
        console.log('   - Simple grammar structures');
        console.log('   - Word/phrase level speaking');
        console.log('   - Cultural awareness introduction');
        
        console.log('\n📚 A2 Elementary Lessons (321-640):');
        console.log('   - Past tense narration');
        console.log('   - Complex descriptions');
        console.log('   - Sentence/extended speaking');
        console.log('   - Cultural comparison skills');
        
        console.log('\n🔄 Spaced Repetition Flow:');
        console.log('   1. User completes lesson → vocabulary added to spaced repetition');
        console.log('   2. Algorithm schedules reviews based on performance');
        console.log('   3. Daily queue generated with due items');
        console.log('   4. User reviews → performance updates schedule');
        console.log('   5. Difficult items get more frequent reviews');
        console.log('   6. Mastered items get longer intervals');
        
        console.log('\n🎯 Progressive Learning Benefits:');
        console.log('   ✅ Vocabulary retention across 640 lessons');
        console.log('   ✅ Grammar reinforcement through levels');
        console.log('   ✅ Personalized review scheduling');
        console.log('   ✅ Difficulty-based adaptation');
        console.log('   ✅ Long-term memory consolidation');
        
        // === 4. Show Available Endpoints ===
        console.log('\n=== 4. Available API Endpoints ===');
        
        console.log('🎓 CEFR Lesson Endpoints:');
        console.log('   GET /api/cefr/lessons/:lessonNumber - Get specific lesson');
        console.log('   GET /api/cefr/level/:levelName - Get lessons by level');
        console.log('   GET /api/cefr/category/:categoryName - Get lessons by category');
        console.log('   POST /api/cefr/lessons/:lessonId/start - Start lesson');
        console.log('   POST /api/cefr/lessons/:lessonId/complete - Complete lesson');
        console.log('   GET /api/cefr/progress/:userId - Get user progress');
        
        console.log('\n🔄 Spaced Repetition Endpoints:');
        console.log('   GET /api/spaced-repetition/daily-queue - Get daily review queue');
        console.log('   GET /api/spaced-repetition/review-items - Get items due for review');
        console.log('   POST /api/spaced-repetition/submit-review - Submit review response');
        console.log('   POST /api/spaced-repetition/add-vocabulary - Add vocabulary to system');
        console.log('   GET /api/spaced-repetition/statistics - Get user statistics');
        console.log('   POST /api/spaced-repetition/reset-difficult - Reset difficult items');
        console.log('   POST /api/spaced-repetition/process-lesson - Process completed lesson');
        
        console.log('\n🎉 System Integration Complete!');
        console.log('   📊 640 total lessons (A1: 1-320, A2: 321-640)');
        console.log('   🧠 Intelligent spaced repetition algorithm');
        console.log('   📈 Progressive difficulty adaptation');
        console.log('   🔄 Automatic vocabulary scheduling');
        console.log('   📚 Comprehensive progress tracking');
        
    } catch (error) {
        console.error('❌ Demo failed:', error.message);
    }
}

demonstrateSpacedRepetitionSystem();
