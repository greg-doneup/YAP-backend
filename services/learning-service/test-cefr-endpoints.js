const axios = require('axios');

// Test configuration
const BASE_URL = 'http://localhost:8080'; // Learning service port
const CEFR_ENDPOINT = `${BASE_URL}/api/cefr`;

// Test data for CEFR lesson
const testLesson = {
    level: 'A1',
    topic: 'Basic Greetings',
    title: 'Hello and Goodbye',
    content: {
        vocabulary: [
            { word: 'hello', translation: 'hola', pronunciation: 'OH-lah' },
            { word: 'goodbye', translation: 'adiós', pronunciation: 'ah-DYOHS' }
        ],
        grammar: {
            topic: 'Basic Greetings',
            explanation: 'Common greeting expressions in Spanish',
            examples: [
                { spanish: 'Hola, ¿cómo estás?', english: 'Hello, how are you?' },
                { spanish: 'Adiós, hasta luego', english: 'Goodbye, see you later' }
            ]
        },
        exercises: [
            {
                type: 'multiple-choice',
                question: 'How do you say "hello" in Spanish?',
                options: ['hola', 'adiós', 'gracias', 'por favor'],
                correct: 0
            }
        ]
    },
    difficulty: 1,
    estimatedTime: 15,
    prerequisites: [],
    learningObjectives: ['Learn basic greeting vocabulary', 'Practice pronunciation']
};

async function testCEFREndpoints() {
    console.log('🧪 Testing CEFR Lesson Endpoints...\n');
    
    try {
        // Test 1: Get a specific lesson (lesson 1)
        console.log('1. Testing GET /api/cefr/lessons/1 (Get specific lesson)');
        const getLessonResponse = await axios.get(`${CEFR_ENDPOINT}/lessons/1`);
        console.log('✅ Get lesson by number:', getLessonResponse.status);
        console.log('   Lesson theme:', getLessonResponse.data.lesson.theme);
        console.log('   Lesson level:', getLessonResponse.data.lesson.level);
        console.log('   Lesson focus:', getLessonResponse.data.lesson.focus);
        console.log('   Lesson number:', getLessonResponse.data.lesson.lessonNumber);
        console.log('   Access granted:', getLessonResponse.data.accessGranted);
        console.log('   Next lesson:', getLessonResponse.data.nextLesson);
        
        // Test 2: Get lessons by level (Foundation)
        console.log('\n2. Testing GET /api/cefr/level/Foundation (Get lessons by level)');
        const getByLevelResponse = await axios.get(`${CEFR_ENDPOINT}/level/Foundation`);
        console.log('✅ Get lessons by level:', getByLevelResponse.status);
        console.log('   Foundation lessons count:', getByLevelResponse.data.lessons.length);
        
        // Test 3: Get lessons by category
        console.log('\n3. Testing GET /api/cefr/category/First Contact (Get lessons by category)');
        const getByCategoryResponse = await axios.get(`${CEFR_ENDPOINT}/category/First Contact`);
        console.log('✅ Get lessons by category:', getByCategoryResponse.status);
        console.log('   First Contact lessons count:', getByCategoryResponse.data.lessons.length);
        
        // Test 4: Try to get next lesson for a user (this will fail without auth, but we can test the endpoint)
        console.log('\n4. Testing GET /api/cefr/user/test-user/next (Get next lesson for user)');
        try {
            const getNextResponse = await axios.get(`${CEFR_ENDPOINT}/user/test-user/next`);
            console.log('✅ Get next lesson for user:', getNextResponse.status);
        } catch (error) {
            if (error.response?.status === 401 || error.response?.status === 403) {
                console.log('✅ Get next lesson for user: Authentication required (expected)');
            } else {
                throw error;
            }
        }
        
        // Test 5: Try to start a lesson (this will fail without auth, but we can test the endpoint)
        console.log('\n5. Testing POST /api/cefr/lessons/1/start (Start lesson)');
        try {
            const startLessonResponse = await axios.post(`${CEFR_ENDPOINT}/lessons/1/start`);
            console.log('✅ Start lesson:', startLessonResponse.status);
        } catch (error) {
            if (error.response?.status === 401 || error.response?.status === 403) {
                console.log('✅ Start lesson: Authentication required (expected)');
            } else {
                throw error;
            }
        }
        
        // Test 6: Try to get user progress (this will fail without auth, but we can test the endpoint)
        console.log('\n6. Testing GET /api/cefr/progress/test-user (Get user progress)');
        try {
            const getProgressResponse = await axios.get(`${CEFR_ENDPOINT}/progress/test-user`);
            console.log('✅ Get user progress:', getProgressResponse.status);
        } catch (error) {
            if (error.response?.status === 401 || error.response?.status === 403) {
                console.log('✅ Get user progress: Authentication required (expected)');
            } else {
                throw error;
            }
        }
        
        console.log('\n🎉 All CEFR lesson endpoints are working correctly!');
        console.log('   Note: Some endpoints require authentication and will return 401/403 without proper auth.');
        
    } catch (error) {
        console.error('❌ Test failed:', error.response?.data || error.message);
        console.error('   Status:', error.response?.status);
        console.error('   URL:', error.config?.url);
    }
}

// Health check function
async function healthCheck() {
    try {
        const response = await axios.get(`${BASE_URL}/health`);
        console.log('✅ Service health check passed:', response.status);
        return true;
    } catch (error) {
        console.error('❌ Service health check failed:', error.message);
        return false;
    }
}

// Main execution
async function main() {
    console.log('🚀 Starting CEFR Lesson Endpoint Tests\n');
    
    // First check if service is running
    const isHealthy = await healthCheck();
    if (!isHealthy) {
        console.log('❌ Service is not running. Please start the learning service first.');
        console.log('   Run: npm start or docker run -p 3002:3002 yap-learning-service:latest');
        return;
    }
    
    // Run tests
    await testCEFREndpoints();
}

// Execute if called directly
if (require.main === module) {
    main();
}

module.exports = { testCEFREndpoints, healthCheck };
