const axios = require('axios');

const BASE_URL = 'http://localhost:8080';
const CEFR_ENDPOINT = `${BASE_URL}/api/cefr`;

async function comprehensiveCEFRTest() {
    console.log('🎯 Comprehensive CEFR System Validation\n');
    
    const results = {
        passed: 0,
        failed: 0,
        tests: []
    };
    
    function recordTest(name, passed, details = '') {
        results.tests.push({ name, passed, details });
        if (passed) results.passed++;
        else results.failed++;
        console.log(`${passed ? '✅' : '❌'} ${name}${details ? ': ' + details : ''}`);
    }
    
    try {
        // 1. Test lesson retrieval
        console.log('=== Lesson Retrieval Tests ===');
        
        const lesson1Response = await axios.get(`${CEFR_ENDPOINT}/lessons/1`);
        recordTest('Get lesson 1', lesson1Response.status === 200, 
            `Theme: ${lesson1Response.data.lesson.theme}, Level: ${lesson1Response.data.lesson.level}`);
        
        const lesson2Response = await axios.get(`${CEFR_ENDPOINT}/lessons/2`);
        recordTest('Get lesson 2', lesson2Response.status === 200, 
            `Theme: ${lesson2Response.data.lesson.theme}`);
        
        // Test invalid lesson number
        try {
            await axios.get(`${CEFR_ENDPOINT}/lessons/999`);
            recordTest('Invalid lesson number (999)', false, 'Should return 400');
        } catch (error) {
            recordTest('Invalid lesson number (999)', error.response?.status === 400, 
                'Correctly returns 400 (out of range)');
        }
        
        // 2. Test level-based retrieval
        console.log('\n=== Level-Based Retrieval Tests ===');
        
        const foundationLessons = await axios.get(`${CEFR_ENDPOINT}/level/Foundation`);
        recordTest('Get Foundation level lessons', foundationLessons.status === 200, 
            `Found ${foundationLessons.data.lessons.length} lessons`);
        
        // Test invalid level
        try {
            await axios.get(`${CEFR_ENDPOINT}/level/InvalidLevel`);
            recordTest('Invalid level name', false, 'Should return 400');
        } catch (error) {
            recordTest('Invalid level name', error.response?.status === 400, 
                'Correctly returns 400');
        }
        
        // 3. Test category-based retrieval
        console.log('\n=== Category-Based Retrieval Tests ===');
        
        const firstContactLessons = await axios.get(`${CEFR_ENDPOINT}/category/First Contact`);
        recordTest('Get First Contact category lessons', firstContactLessons.status === 200, 
            `Found ${firstContactLessons.data.lessons.length} lessons`);
        
        // 4. Test lesson content validation
        console.log('\n=== Lesson Content Validation ===');
        
        const lesson = lesson1Response.data.lesson;
        recordTest('Lesson has vocabulary', lesson.vocabulary && lesson.vocabulary.targetWords.length > 0, 
            `${lesson.vocabulary.targetWords.length} target words`);
        
        recordTest('Lesson has grammar concepts', lesson.grammar && lesson.grammar.concepts.length > 0, 
            `${lesson.grammar.concepts.length} concepts`);
        
        recordTest('Lesson has speaking practice', lesson.speaking && lesson.speaking.outputLevel, 
            `Output level: ${lesson.speaking.outputLevel}`);
        
        recordTest('Lesson has sections', lesson.sections && lesson.sections.length > 0, 
            `${lesson.sections.length} sections`);
        
        recordTest('Lesson has assessment criteria', lesson.assessment && lesson.assessment.vocabularyMastery > 0, 
            `Vocab mastery: ${lesson.assessment.vocabularyMastery}`);
        
        // 5. Test lesson progression
        console.log('\n=== Lesson Progression Tests ===');
        
        recordTest('Lesson 1 has next lesson', lesson1Response.data.nextLesson === 2, 
            `Next lesson: ${lesson1Response.data.nextLesson}`);
        
        recordTest('Lesson 1 has no previous lesson', lesson1Response.data.previousLesson === null, 
            'First lesson correctly has no previous');
        
        recordTest('Lesson 2 has previous lesson', lesson2Response.data.previousLesson === 1, 
            `Previous lesson: ${lesson2Response.data.previousLesson}`);
        
        // 6. Test authentication-required endpoints
        console.log('\n=== Authentication Tests ===');
        
        try {
            await axios.get(`${CEFR_ENDPOINT}/user/test-user/next`);
            recordTest('User next lesson endpoint', false, 'Should require auth');
        } catch (error) {
            recordTest('User next lesson endpoint', error.response?.status === 401 || error.response?.status === 403, 
                'Correctly requires authentication');
        }
        
        try {
            await axios.post(`${CEFR_ENDPOINT}/lessons/1/start`);
            recordTest('Start lesson endpoint', false, 'Should require auth');
        } catch (error) {
            recordTest('Start lesson endpoint', error.response?.status === 401 || error.response?.status === 403, 
                'Correctly requires authentication');
        }
        
        try {
            await axios.get(`${CEFR_ENDPOINT}/progress/test-user`);
            recordTest('User progress endpoint', false, 'Should require auth');
        } catch (error) {
            recordTest('User progress endpoint', error.response?.status === 401 || error.response?.status === 403, 
                'Correctly requires authentication');
        }
        
        // 7. Test data integrity
        console.log('\n=== Data Integrity Tests ===');
        
        recordTest('Lesson numbering is sequential', lesson1Response.data.lesson.lessonNumber === 1, 
            'Lesson 1 has correct number');
        
        recordTest('Lesson has required metadata', lesson.createdAt && lesson.updatedAt && lesson.version, 
            `Version: ${lesson.version}`);
        
        recordTest('Lesson has unique ID', lesson.id && lesson._id, 
            `ID: ${lesson.id}`);
        
        // Summary
        console.log('\n' + '='.repeat(50));
        console.log(`📊 Test Results: ${results.passed} passed, ${results.failed} failed`);
        console.log(`🎯 Success Rate: ${(results.passed / (results.passed + results.failed) * 100).toFixed(1)}%`);
        
        if (results.failed === 0) {
            console.log('🎉 All tests passed! CEFR system is fully functional.');
        } else {
            console.log('⚠️  Some tests failed. Review the issues above.');
        }
        
        return results;
        
    } catch (error) {
        console.error('❌ Test suite failed:', error.message);
        return results;
    }
}

comprehensiveCEFRTest();
