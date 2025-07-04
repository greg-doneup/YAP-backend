import { ScenarioConfig } from '../types/chat-session';

export const RESTAURANT_SCENARIO: ScenarioConfig = {
  id: 'restaurant',
  name: 'At the Restaurant',
  description: 'Practice ordering food and drinks at a restaurant',
  cefrLevels: ['A1', 'A2', 'B1'],
  vocabulary: [
    { word: 'menu', meaning: 'list of food items', example: 'Can I see the menu?', difficulty: 'A1', category: 'restaurant' },
    { word: 'order', meaning: 'to request food', example: 'I would like to order pizza', difficulty: 'A1', category: 'restaurant' },
    { word: 'bill', meaning: 'payment request', example: 'Can I have the bill?', difficulty: 'A2', category: 'restaurant' },
    { word: 'reservation', meaning: 'booking a table', example: 'I have a reservation', difficulty: 'B1', category: 'restaurant' }
  ],
  objectives: [
    'Order food and drinks',
    'Ask about ingredients',
    'Request the bill',
    'Make polite conversation with staff'
  ],
  prompts: {
    A1: 'You are a friendly waiter at a simple restaurant. Help the customer order basic food items. Use simple present tense and common vocabulary.',
    A2: 'You are a waiter at a casual restaurant. Help the customer with their order, explain simple dishes, and handle basic requests.',
    B1: 'You are a server at a nice restaurant. Engage in detailed conversation about the menu, make recommendations, and handle complex requests.'
  }
};

export const TRAVEL_SCENARIO: ScenarioConfig = {
  id: 'travel',
  name: 'Travel and Tourism',
  description: 'Practice conversations related to travel, hotels, and tourism',
  cefrLevels: ['A2', 'B1', 'B2'],
  vocabulary: [
    { word: 'passport', meaning: 'travel document', example: 'Where is my passport?', difficulty: 'A2', category: 'travel' },
    { word: 'luggage', meaning: 'travel bags', example: 'My luggage is heavy', difficulty: 'A2', category: 'travel' },
    { word: 'itinerary', meaning: 'travel plan', example: 'What\'s in our itinerary?', difficulty: 'B1', category: 'travel' },
    { word: 'accommodation', meaning: 'place to stay', example: 'We need accommodation', difficulty: 'B1', category: 'travel' }
  ],
  objectives: [
    'Book hotel rooms',
    'Ask for directions',
    'Discuss travel plans',
    'Handle travel problems'
  ],
  prompts: {
    A2: 'You are a hotel receptionist. Help the guest check in, answer basic questions about the hotel and local area.',
    B1: 'You are a travel agent. Help the customer plan their trip, make recommendations, and handle booking details.',
    B2: 'You are a local tour guide. Provide detailed information about attractions, history, and culture while engaging in natural conversation.'
  }
};

export const SHOPPING_SCENARIO: ScenarioConfig = {
  id: 'shopping',
  name: 'Shopping and Commerce',
  description: 'Practice buying items, asking about prices, and handling transactions',
  cefrLevels: ['A1', 'A2', 'B1'],
  vocabulary: [
    { word: 'price', meaning: 'cost of item', example: 'What is the price?', difficulty: 'A1', category: 'shopping' },
    { word: 'discount', meaning: 'reduced price', example: 'Is there a discount?', difficulty: 'A2', category: 'shopping' },
    { word: 'receipt', meaning: 'proof of purchase', example: 'Can I have a receipt?', difficulty: 'A2', category: 'shopping' },
    { word: 'exchange', meaning: 'return and replace', example: 'Can I exchange this?', difficulty: 'B1', category: 'shopping' }
  ],
  objectives: [
    'Ask about prices',
    'Compare products',
    'Handle returns/exchanges',
    'Negotiate prices (where appropriate)'
  ],
  prompts: {
    A1: 'You are a shop assistant in a clothing store. Help the customer find basic items and answer simple questions about sizes and colors.',
    A2: 'You are working at a department store. Help customers with various purchases, explain store policies, and handle basic complaints.',
    B1: 'You are a sales person at an electronics store. Provide detailed product information, compare features, and handle complex customer needs.'
  }
};

export const JOB_INTERVIEW_SCENARIO: ScenarioConfig = {
  id: 'job_interview',
  name: 'Job Interview',
  description: 'Practice professional conversations and job interview skills',
  cefrLevels: ['B1', 'B2'],
  vocabulary: [
    { word: 'experience', meaning: 'past work history', example: 'I have five years of experience', difficulty: 'B1', category: 'work' },
    { word: 'qualification', meaning: 'skills and education', example: 'What are your qualifications?', difficulty: 'B1', category: 'work' },
    { word: 'responsibility', meaning: 'job duties', example: 'What are the main responsibilities?', difficulty: 'B1', category: 'work' },
    { word: 'opportunity', meaning: 'chance for growth', example: 'This is a great opportunity', difficulty: 'B2', category: 'work' }
  ],
  objectives: [
    'Describe work experience',
    'Explain qualifications',
    'Ask about job responsibilities',
    'Discuss career goals'
  ],
  prompts: {
    B1: 'You are conducting a job interview for a basic position. Ask about experience, skills, and availability. Keep questions straightforward.',
    B2: 'You are interviewing for a professional role. Engage in detailed discussion about qualifications, experience, and complex job requirements.'
  }
};

export const CONVERSATION_SCENARIOS = {
  restaurant: RESTAURANT_SCENARIO,
  travel: TRAVEL_SCENARIO,
  shopping: SHOPPING_SCENARIO,
  job_interview: JOB_INTERVIEW_SCENARIO
};
