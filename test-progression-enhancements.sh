#!/bin/bash
# test-progression-enhancements.sh - Test the new progression validation features

set -euo pipefail

# Configuration
API_BASE=http://localhost:8080/api
TEST_USER_ID="test-user-progression-123"

echo "🧪 Testing YAP Progression Enhancements"
echo "=" * 50

# Test 1: Get progression status
echo "📊 Test 1: Get Progression Status"
curl -s -X GET "${API_BASE}/levels/status" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer mock-token-${TEST_USER_ID}" \
  | jq '.' || echo "❌ Progression status endpoint failed"

echo ""

# Test 2: Get available levels
echo "🎯 Test 2: Get Available Levels"
curl -s -X GET "${API_BASE}/levels/available" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer mock-token-${TEST_USER_ID}" \
  | jq '.levels[] | {level: .level, unlocked: .unlocked, tokenCost: .tokenCost}' || echo "❌ Available levels endpoint failed"

echo ""

# Test 3: Get level requirements
echo "📋 Test 3: Get Level Requirements (B1.1)"
curl -s -X GET "${API_BASE}/levels/B1.1/requirements" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer mock-token-${TEST_USER_ID}" \
  | jq '.' || echo "❌ Level requirements endpoint failed"

echo ""

# Test 4: Validate level access
echo "🔐 Test 4: Validate Multiple Level Access"
curl -s -X POST "${API_BASE}/levels/validate-access" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer mock-token-${TEST_USER_ID}" \
  -d '{"levels": ["A1.1", "A1.2", "A2.1", "B1.1"]}' \
  | jq '.validations[] | {level: .level, canAccess: .canAccess, tokenCost: .tokenCost}' || echo "❌ Level validation endpoint failed"

echo ""

# Test 5: Try to unlock a level (should fail without sufficient tokens)
echo "💰 Test 5: Attempt Level Unlock (Should Fail - Insufficient Tokens)"
curl -s -X POST "${API_BASE}/levels/A2.1/unlock?skipAhead=true" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer mock-token-${TEST_USER_ID}" \
  -d '{"skipAhead": true}' \
  | jq '.' || echo "❌ Level unlock endpoint failed"

echo ""

# Test 6: Test lesson access with progression validation
echo "📚 Test 6: Test Lesson Access (A1.1)"
curl -s -X GET "${API_BASE}/lessons/a1-1-greetings" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer mock-token-${TEST_USER_ID}" \
  | jq '.progressionInfo' || echo "❌ Lesson access endpoint failed"

echo ""

# Test 7: Test daily lessons with progression
echo "📅 Test 7: Test Daily Lessons"
curl -s -X GET "${API_BASE}/daily?userId=${TEST_USER_ID}" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer mock-token-${TEST_USER_ID}" \
  | jq '.progressionInfo' || echo "❌ Daily lessons endpoint failed"

echo ""

# Test 8: Test lessons by level with validation
echo "🎓 Test 8: Test Lessons by Level (A1.1)"
curl -s -X GET "${API_BASE}/lessons?language=spanish&level=A1.1" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer mock-token-${TEST_USER_ID}" \
  | jq '.progressionInfo' || echo "❌ Lessons by level endpoint failed"

echo ""
echo "✅ Progression Enhancement Tests Completed"
echo ""
echo "📋 Expected Results:"
echo "   - Progression status should show current level and advancement requirements"
echo "   - Available levels should show unlock status and token costs"
echo "   - Level requirements should detail prerequisites and skip-ahead options"
echo "   - Level validation should show access permissions for multiple levels"
echo "   - Level unlock should fail due to insufficient tokens (unless tokens are available)"
echo "   - Lesson and daily endpoints should include progression validation info"
echo ""
echo "🔧 Note: These tests assume the learning service is running on localhost:8080"
echo "   If endpoints return 404/500, the service may not be running or middleware not integrated"
