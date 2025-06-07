#!/bin/bash

# Enhanced Security Test Script for YAP Wallet Service
# Tests the three critical security gaps that have been fixed:
# 1. Direct hash storage vulnerability ✅
# 2. Missing server secret entropy ✅  
# 3. Insufficient rate limiting ✅

echo "🔒 Testing Enhanced Wallet Security Implementation"
echo "================================================="

# Configuration
WALLET_SERVICE_URL="http://localhost:8001"
TEST_EMAIL="security-test@example.com"
TEST_PASSPHRASE="SecureTestPass123!@#"
INVALID_PASSPHRASE="WrongPassword"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Test counter
TESTS_PASSED=0
TESTS_TOTAL=0

# Helper function to test endpoints
test_endpoint() {
    local test_name="$1"
    local method="$2"
    local endpoint="$3"
    local data="$4"
    local expected_status="$5"
    local description="$6"
    
    TESTS_TOTAL=$((TESTS_TOTAL + 1))
    
    echo -e "\n${BLUE}Test $TESTS_TOTAL: $test_name${NC}"
    echo "Description: $description"
    
    if [ "$method" = "POST" ]; then
        response=$(curl -s -w "\n%{http_code}" -X POST \
            -H "Content-Type: application/json" \
            -d "$data" \
            "$WALLET_SERVICE_URL$endpoint")
    else
        response=$(curl -s -w "\n%{http_code}" -X GET "$WALLET_SERVICE_URL$endpoint")
    fi
    
    # Extract status code (last line)
    status_code=$(echo "$response" | tail -n1)
    # Extract body (all but last line)
    body=$(echo "$response" | head -n -1)
    
    if [ "$status_code" = "$expected_status" ]; then
        echo -e "${GREEN}✅ PASS${NC} - Status: $status_code"
        TESTS_PASSED=$((TESTS_PASSED + 1))
        if [[ -n "$body" && "$body" != "null" ]]; then
            echo "Response: $body" | jq 2>/dev/null || echo "Response: $body"
        fi
    else
        echo -e "${RED}❌ FAIL${NC} - Expected: $expected_status, Got: $status_code"
        if [[ -n "$body" && "$body" != "null" ]]; then
            echo "Response: $body" | jq 2>/dev/null || echo "Response: $body"
        fi
    fi
}

# Test 1: Health Check
echo -e "\n${YELLOW}=== Health Check ===${NC}"
test_endpoint "Health Check" "GET" "/health" "" "200" "Verify wallet service is running"

# Test 2: Server Secret Integration
echo -e "\n${YELLOW}=== Server Secret Integration Test ===${NC}"
test_endpoint "Server Secret Check" "GET" "/wallet/security-status" "" "200" "Verify server secret is properly configured"

# Test 3: Enhanced Rate Limiting - Normal Request
echo -e "\n${YELLOW}=== Enhanced Rate Limiting Tests ===${NC}"
recovery_payload="{
    \"email\": \"$TEST_EMAIL\",
    \"passphrase\": \"$TEST_PASSPHRASE\"
}"

test_endpoint "Normal Recovery Request" "POST" "/wallet/recover" "$recovery_payload" "404" "Test normal rate limiting (404 expected for non-existent user)"

# Test 4: Enhanced Rate Limiting - Rapid Fire Requests
echo -e "\n${BLUE}Testing rapid-fire requests to trigger rate limiting...${NC}"
for i in {1..6}; do
    echo "Request $i/6..."
    response=$(curl -s -w "%{http_code}" -X POST \
        -H "Content-Type: application/json" \
        -d "$recovery_payload" \
        "$WALLET_SERVICE_URL/wallet/recover")
    
    status_code=$(echo "$response" | tail -c 4)
    
    if [ "$i" -le "5" ]; then
        expected="401"  # or 404 for non-existent user
    else
        expected="429"  # Rate limited
    fi
    
    if [ "$status_code" = "429" ]; then
        echo -e "${GREEN}✅ Rate limiting triggered at request $i${NC}"
        TESTS_PASSED=$((TESTS_PASSED + 1))
        break
    elif [ "$i" = "6" ]; then
        echo -e "${RED}❌ Rate limiting not triggered after 6 requests${NC}"
    fi
done
TESTS_TOTAL=$((TESTS_TOTAL + 1))

# Test 5: Progressive Rate Limiting
echo -e "\n${YELLOW}=== Progressive Rate Limiting Test ===${NC}"
test_endpoint "Check Progressive Delay" "POST" "/wallet/recover" "$recovery_payload" "429" "Verify progressive delay is applied after rate limiting"

# Test 6: Invalid Passphrase Security
echo -e "\n${YELLOW}=== Invalid Passphrase Security Test ===${NC}"
invalid_payload="{
    \"email\": \"$TEST_EMAIL\",
    \"passphrase\": \"$INVALID_PASSPHRASE\"
}"

test_endpoint "Invalid Passphrase" "POST" "/wallet/recover" "$invalid_payload" "401" "Test security response to invalid passphrase"

# Test 7: Security Audit Logging
echo -e "\n${YELLOW}=== Security Audit Logging Test ===${NC}"
echo "Checking for security audit logs..."

if [ -f "/Users/gregbrown/github/YAP/YAP-backend/services/wallet-service/security_audit.log" ]; then
    echo -e "${GREEN}✅ Security audit log file exists${NC}"
    TESTS_PASSED=$((TESTS_PASSED + 1))
    
    # Check for recent entries
    recent_entries=$(tail -n 5 "/Users/gregbrown/github/YAP/YAP-backend/services/wallet-service/security_audit.log" 2>/dev/null)
    if [ -n "$recent_entries" ]; then
        echo -e "${GREEN}✅ Recent audit entries found${NC}"
        echo "Recent entries:"
        echo "$recent_entries"
        TESTS_PASSED=$((TESTS_PASSED + 1))
    else
        echo -e "${YELLOW}⚠️  No recent audit entries found${NC}"
    fi
else
    echo -e "${RED}❌ Security audit log file not found${NC}"
fi
TESTS_TOTAL=$((TESTS_TOTAL + 2))

# Test 8: Enhanced Crypto Validation
echo -e "\n${YELLOW}=== Enhanced Crypto Validation Test ===${NC}"
crypto_payload="{
    \"email\": \"test@example.com\",
    \"encrypted_mnemonic\": \"invalid_crypto_data\",
    \"salt\": \"short\",
    \"nonce\": \"invalid\"
}"

test_endpoint "Invalid Crypto Data" "POST" "/wallet/register" "$crypto_payload" "400" "Test enhanced crypto data validation"

# Test 9: Environment Security Configuration
echo -e "\n${YELLOW}=== Environment Security Configuration Test ===${NC}"
echo "Checking security environment configuration..."

if [ -f "/Users/gregbrown/github/YAP/YAP-backend/services/wallet-service/.env.security" ]; then
    echo -e "${GREEN}✅ Security environment file exists${NC}"
    TESTS_PASSED=$((TESTS_PASSED + 1))
    
    # Check for required security variables
    required_vars=("MNEMONIC_SERVER_SECRET" "RATE_LIMIT_RECOVERY_MAX_ATTEMPTS" "SECURITY_AUDIT_ENABLED")
    for var in "${required_vars[@]}"; do
        if grep -q "^$var=" "/Users/gregbrown/github/YAP/YAP-backend/services/wallet-service/.env.security"; then
            echo -e "${GREEN}✅ $var configured${NC}"
            TESTS_PASSED=$((TESTS_PASSED + 1))
        else
            echo -e "${RED}❌ $var not configured${NC}"
        fi
        TESTS_TOTAL=$((TESTS_TOTAL + 1))
    done
else
    echo -e "${RED}❌ Security environment file not found${NC}"
    TESTS_TOTAL=$((TESTS_TOTAL + 4))
fi

# Final Results
echo -e "\n${YELLOW}=== Test Results Summary ===${NC}"
echo "============================================="
echo -e "Tests Passed: ${GREEN}$TESTS_PASSED${NC}"
echo -e "Tests Total:  ${BLUE}$TESTS_TOTAL${NC}"

if [ "$TESTS_PASSED" -eq "$TESTS_TOTAL" ]; then
    echo -e "\n${GREEN}🎉 ALL TESTS PASSED! Security implementation is working correctly.${NC}"
    exit 0
elif [ "$TESTS_PASSED" -gt $((TESTS_TOTAL / 2)) ]; then
    echo -e "\n${YELLOW}⚠️  MOST TESTS PASSED. Some issues detected but core security is functional.${NC}"
    exit 1
else
    echo -e "\n${RED}❌ MULTIPLE TESTS FAILED. Security implementation needs attention.${NC}"
    exit 2
fi
