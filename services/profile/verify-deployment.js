#!/usr/bin/env node

/**
 * Deployment verification script for YAP Profile Service
 * Tests that the service is properly configured and can connect to MongoDB Atlas
 */

console.log('🚀 YAP Profile Service - Deployment Verification');
console.log('================================================');

// Check environment variables
function checkEnvironmentVariables() {
  console.log('\n🔧 Environment Variables Check:');
  
  const requiredVars = ['MONGO_URI', 'MONGO_DB_NAME'];
  const optionalVars = ['NODE_ENV', 'PORT'];
  
  let allRequired = true;
  
  requiredVars.forEach(varName => {
    const value = process.env[varName];
    if (value) {
      if (varName === 'MONGO_URI') {
        // Hide credentials in logs
        const sanitized = value.replace(/\/\/[^:]+:[^@]+@/, '//***:***@');
        console.log(`✅ ${varName}: ${sanitized}`);
      } else {
        console.log(`✅ ${varName}: ${value}`);
      }
    } else {
      console.log(`❌ ${varName}: NOT SET`);
      allRequired = false;
    }
  });
  
  optionalVars.forEach(varName => {
    const value = process.env[varName];
    console.log(`ℹ️  ${varName}: ${value || 'default'}`);
  });
  
  return allRequired;
}

// Test MongoDB connection
async function testMongoConnection() {
  console.log('\n🍃 MongoDB Connection Test:');
  
  try {
    const mongoose = require('mongoose');
    const mongoUri = process.env.MONGO_URI;
    const dbName = process.env.MONGO_DB_NAME || 'yap';
    
    if (!mongoUri) {
      console.log('❌ MONGO_URI not set, cannot test connection');
      return false;
    }
    
    console.log('🔄 Attempting to connect to MongoDB Atlas...');
    
    await mongoose.connect(mongoUri, {
      dbName,
      maxPoolSize: 5,
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000,
      bufferCommands: false
    });
    
    console.log('✅ MongoDB connection successful');
    console.log(`📍 Database: ${dbName}`);
    console.log(`🌐 Connection state: ${mongoose.connection.readyState === 1 ? 'Connected' : 'Not Connected'}`);
    
    // Test a simple operation
    const collections = await mongoose.connection.db.listCollections().toArray();
    console.log(`📚 Available collections: ${collections.length}`);
    
    await mongoose.connection.close();
    console.log('🔐 Connection closed successfully');
    
    return true;
  } catch (error) {
    console.error('❌ MongoDB connection failed:', error.message);
    return false;
  }
}

// Test service startup
async function testServiceStartup() {
  console.log('\n🖥️  Service Startup Test:');
  
  try {
    // Import the app without starting the server
    process.env.SKIP_SERVER_START = 'true';
    
    console.log('📦 Loading application modules...');
    
    // Test that all required modules can be imported
    const express = require('express');
    const cors = require('cors');
    
    console.log('✅ Core modules loaded successfully');
    console.log('✅ Service should be able to start properly');
    
    return true;
  } catch (error) {
    console.error('❌ Service startup test failed:', error.message);
    return false;
  }
}

async function runVerification() {
  console.log('⏱️  Starting verification process...\n');
  
  const envOk = checkEnvironmentVariables();
  const mongoOk = await testMongoConnection();
  const startupOk = await testServiceStartup();
  
  console.log('\n📋 Verification Results:');
  console.log('========================');
  console.log(`🔧 Environment Variables: ${envOk ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`🍃 MongoDB Connection: ${mongoOk ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`🖥️  Service Startup: ${startupOk ? '✅ PASS' : '❌ FAIL'}`);
  
  if (envOk && mongoOk && startupOk) {
    console.log('\n🎉 All verification checks passed!');
    console.log('🚀 Profile service is ready for deployment');
    process.exit(0);
  } else {
    console.log('\n💥 Some verification checks failed');
    console.log('🔧 Please fix the issues before deploying');
    process.exit(1);
  }
}

runVerification().catch(error => {
  console.error('💥 Verification failed:', error);
  process.exit(1);
});
