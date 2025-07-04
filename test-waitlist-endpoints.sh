#!/bin/bash

# Test script for waitlist endpoints in backend
# Run this to verify the missing endpoints are now implemented

echo "🧪 Testing Waitlist Endpoints Implementation"
echo "============================================="

# Test 1: Simple waitlist signup
echo "1️⃣ Testing simple waitlist signup..."
curl -X POST http://localhost:8080/api/waitlist/simple \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test User",
    "email": "test-waitlist@example.com",
    "language_to_learn": "spanish",
    "acceptTerms": true
  }' | jq .

echo ""

# Test 2: Secure wallet waitlist signup
echo "2️⃣ Testing secure wallet waitlist signup..."
curl -X POST http://localhost:8080/api/waitlist/secure-wallet \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Secure User",
    "email": "test-secure@example.com",
    "username": "testuser",
    "language_to_learn": "spanish",
    "passphrase": "securepassword123",
    "acceptTerms": true
  }' | jq .

echo ""

# Test 3: Verify profile service health
echo "3️⃣ Testing profile service health..."
curl -X GET http://localhost:8080/healthz | jq .

echo ""

# Test 4: Verify gateway routing
echo "4️⃣ Testing gateway routing to waitlist..."
curl -X GET http://localhost:8080/api/waitlist/health || echo "Expected 404 - health endpoint not implemented"

echo ""
echo "✅ Waitlist endpoint tests completed!"
echo "📝 Check the responses above to verify the endpoints are working correctly."
