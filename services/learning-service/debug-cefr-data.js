const axios = require('axios');

const BASE_URL = 'http://localhost:8080';
const CEFR_ENDPOINT = `${BASE_URL}/api/cefr`;

async function debugCEFRData() {
    console.log('🔍 Debugging CEFR Lesson Data...\n');
    
    try {
        // Get lesson 1 and see the full response
        console.log('=== Lesson 1 Full Response ===');
        const response = await axios.get(`${CEFR_ENDPOINT}/lessons/1`);
        console.log('Status:', response.status);
        console.log('Data structure:');
        console.log(JSON.stringify(response.data, null, 2));
        
        // Check what properties are actually available
        console.log('\n=== Available Properties ===');
        console.log('Keys in response.data:', Object.keys(response.data));
        console.log('Has title property:', 'title' in response.data);
        console.log('Has level property:', 'level' in response.data);
        console.log('Has theme property:', 'theme' in response.data);
        console.log('Has focus property:', 'focus' in response.data);
        
    } catch (error) {
        console.error('❌ Debug failed:', error.response?.data || error.message);
    }
}

debugCEFRData();
