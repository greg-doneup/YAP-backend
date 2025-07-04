#!/usr/bin/env node

/**
 * Integration Test for Advanced AI Chat Features
 * Tests audio processing, difficulty adaptation, and lesson integration
 */

const axios = require('axios');
const fs = require('fs');

const BASE_URL = process.env.AI_CHAT_SERVICE_URL || 'http://localhost:3003';
const TEST_USER_ID = 'test-user-123';

async function testAdvancedFeatures() {
  console.log('🚀 Testing Advanced AI Chat Features...\n');

  try {
    // Test 1: Start a chat session
    console.log('1. Starting chat session...');
    const sessionResponse = await axios.post(`${BASE_URL}/api/chat/start-session`, {
      userId: TEST_USER_ID,
      language: 'spanish',
      cefrLevel: 'B1',
      conversationMode: 'guided',
      scenario: 'daily_routine'
    }, {
      headers: { 'x-user-id': TEST_USER_ID }
    });

    const sessionId = sessionResponse.data.session.sessionId;
    console.log(`✅ Session started: ${sessionId}\n`);

    // Test 2: Send a regular text message
    console.log('2. Sending text message...');
    const textResponse = await axios.post(`${BASE_URL}/api/chat/message`, {
      userId: TEST_USER_ID,
      sessionId: sessionId,
      userMessage: 'Hola, ¿cómo estás hoy?',
      language: 'spanish',
      cefrLevel: 'B1',
      conversationMode: 'guided'
    }, {
      headers: { 'x-user-id': TEST_USER_ID }
    });

    console.log('✅ Text message processed:');
    console.log(`   AI Response: ${textResponse.data.aiMessage}`);
    console.log(`   Difficulty: ${textResponse.data.context.difficulty}`);
    console.log(`   Vocabulary: ${textResponse.data.vocabularyHighlights?.length || 0} items\n`);

    // Test 3: Send a message with mock audio data
    console.log('3. Sending voice message...');
    const mockAudioData = Buffer.from('mock audio data for testing').toString('base64');
    
    const voiceResponse = await axios.post(`${BASE_URL}/api/chat/voice-message`, {
      userId: TEST_USER_ID,
      sessionId: sessionId,
      audioData: mockAudioData,
      language: 'spanish',
      cefrLevel: 'B1',
      conversationMode: 'guided'
    }, {
      headers: { 'x-user-id': TEST_USER_ID }
    });

    console.log('✅ Voice message processed:');
    console.log(`   AI Response: ${voiceResponse.data.aiMessage}`);
    console.log(`   Context updated: ${voiceResponse.data.context.messagesExchanged} messages\n`);

    // Test 4: Send multiple messages to trigger difficulty adaptation
    console.log('4. Testing difficulty adaptation...');
    for (let i = 0; i < 3; i++) {
      const adaptationResponse = await axios.post(`${BASE_URL}/api/chat/message`, {
        userId: TEST_USER_ID,
        sessionId: sessionId,
        userMessage: `Esta es mi respuesta número ${i + 1}. Me gusta practicar español todos los días.`,
        language: 'spanish',
        cefrLevel: 'B1',
        conversationMode: 'guided'
      }, {
        headers: { 'x-user-id': TEST_USER_ID }
      });

      console.log(`   Message ${i + 1}: Difficulty = ${adaptationResponse.data.context.difficulty}`);
    }
    console.log('✅ Difficulty adaptation tested\n');

    // Test 5: Get session details
    console.log('5. Retrieving session details...');
    const sessionDetails = await axios.get(`${BASE_URL}/api/chat/session/${sessionId}`, {
      headers: { 'x-user-id': TEST_USER_ID }
    });

    console.log('✅ Session retrieved:');
    console.log(`   Messages: ${sessionDetails.data.session.messages.length}`);
    console.log(`   Current topic: ${sessionDetails.data.session.context.currentTopic}`);
    console.log(`   Final difficulty: ${sessionDetails.data.session.context.difficulty}\n`);

    console.log('🎉 All advanced features tested successfully!');

  } catch (error) {
    console.error('❌ Test failed:', error.response?.data || error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

// Health check first
async function healthCheck() {
  try {
    const response = await axios.get(`${BASE_URL}/health`);
    console.log(`✅ Service health: ${response.data.status}\n`);
  } catch (error) {
    console.error('❌ Health check failed:', error.message);
    console.log('⚠️  Continuing with tests anyway...\n');
  }
}

async function main() {
  await healthCheck();
  await testAdvancedFeatures();
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { testAdvancedFeatures };
