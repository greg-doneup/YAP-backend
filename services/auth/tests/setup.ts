// Test setup file
import dotenv from 'dotenv';

// Load environment variables from .env.test if it exists, otherwise use defaults
dotenv.config({ path: '.env.test' });

// Set up test environment variables if not already present
process.env.APP_JWT_SECRET = process.env.APP_JWT_SECRET || 'test-jwt-secret';
process.env.DYNAMIC_ENV_ID = process.env.DYNAMIC_ENV_ID || 'test-env-id';
process.env.DYNAMIC_API_KEY = process.env.DYNAMIC_API_KEY || 'test-api-key';
process.env.DYNAMIC_BASE = process.env.DYNAMIC_BASE || 'https://api.test-dynamic.xyz/api/v0';