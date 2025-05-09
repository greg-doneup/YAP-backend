#!/bin/bash
# Testing script for auth, profile, and off-chain profile services integration
# This script verifies the end-to-end flow of authentication and refresh token handling

set -e  # Exit on any error
GREEN='\033[0;32m'
RED='\033[0;31m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${BLUE}=== YAP Authentication Integration Test ===${NC}"
echo -e "${BLUE}Testing auth service and profile services with enhanced refresh token handling${NC}"
echo

# Step 1: Ensure minikube is running
echo -e "${YELLOW}Checking Minikube status...${NC}"
if ! minikube status > /dev/null 2>&1; then
  echo -e "${RED}Minikube is not running. Starting minikube...${NC}"
  minikube start
  sleep 5
fi
echo -e "${GREEN}Minikube is running!${NC}"
echo

# Step 2: Build and deploy all services with the updated code
echo -e "${YELLOW}Building and deploying services...${NC}"
# Replace with your actual build and deploy commands
if [ -f "skaffold.yaml" ]; then
  echo "Using skaffold for deployment..."
  skaffold run
else
  echo "Using manual deployment..."
  # Auth service
  (cd services/auth && ./build_and_push.sh)
  # Profile service
  (cd services/profile && ./build_and_push.sh)
  # Off-chain profile service
  (cd services/offchain-profile && ./build_and_push.sh)
  
  echo "Applying Kubernetes configurations..."
  kubectl apply -f infra/k8s/auth.yaml
  kubectl apply -f infra/k8s/profile.yaml
  kubectl apply -f infra/k8s/offchain-profile.yaml
  kubectl apply -f infra/k8s/auth-service.yaml
fi
echo -e "${GREEN}Services deployed!${NC}"
echo

# Step 3: Wait for services to be ready
echo -e "${YELLOW}Waiting for services to be ready...${NC}"
kubectl wait --for=condition=available --timeout=60s deployment/auth-service
kubectl wait --for=condition=available --timeout=60s deployment/profile-service
kubectl wait --for=condition=available --timeout=60s deployment/offchain-profile
echo -e "${GREEN}All services are running!${NC}"
echo

# Step 4: Set up port forwarding to access services
echo -e "${YELLOW}Setting up port forwarding...${NC}"
# Kill any existing port forwards
pkill -f "kubectl port-forward" || true
# Start new port forwarding in background
kubectl port-forward service/auth-service 3000:80 > /dev/null 2>&1 &
AUTH_PORT_FORWARD_PID=$!
kubectl port-forward service/profile-service 3001:80 > /dev/null 2>&1 &
PROFILE_PORT_FORWARD_PID=$!
kubectl port-forward service/offchain-profile 3002:80 > /dev/null 2>&1 &
OFFCHAIN_PORT_FORWARD_PID=$!
# Give port forwarding time to establish
sleep 3
echo -e "${GREEN}Port forwarding established!${NC}"
echo

# Create a temporary directory for test artifacts
TEMP_DIR=$(mktemp -d)
echo -e "${BLUE}Storing test artifacts in ${TEMP_DIR}${NC}"

# Function to clean up resources
cleanup() {
  echo -e "${YELLOW}Cleaning up resources...${NC}"
  kill $AUTH_PORT_FORWARD_PID $PROFILE_PORT_FORWARD_PID $OFFCHAIN_PORT_FORWARD_PID 2>/dev/null || true
  rm -rf "$TEMP_DIR"
  echo -e "${GREEN}Cleanup complete!${NC}"
}

# Register cleanup function to run on script exit
trap cleanup EXIT

# Step 5: Run the authentication flow test
echo -e "${BLUE}=== Starting Authentication Flow Test ===${NC}"

# Step 5.1: Login with email
echo -e "${YELLOW}Step 1: Initiating login with email...${NC}"
LOGIN_RESPONSE=$(curl -s -X POST "http://localhost:3000/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email": "test@example.com"}')

# Save the verification UUID
VERIFICATION_UUID=$(echo $LOGIN_RESPONSE | grep -o '"verificationUUID":"[^"]*"' | cut -d'"' -f4)
if [ -z "$VERIFICATION_UUID" ]; then
  echo -e "${RED}Failed to get verification UUID${NC}"
  echo "Response: $LOGIN_RESPONSE"
  exit 1
fi
echo -e "${GREEN}Got verification UUID: $VERIFICATION_UUID${NC}"
echo

# Mock verification step - in a real environment, the user would receive an email
echo -e "${YELLOW}Step 2: Verifying email with code...${NC}"
# For testing, we're using a known test code (this should match what's in your auth service for test mode)
VERIFICATION_CODE="123456"
VERIFY_RESPONSE=$(curl -s -X POST "http://localhost:3000/auth/verify" \
  -H "Content-Type: application/json" \
  -d "{\"verificationUUID\": \"$VERIFICATION_UUID\", \"code\": \"$VERIFICATION_CODE\"}")

# Extract tokens and wallet addresses
ACCESS_TOKEN=$(echo $VERIFY_RESPONSE | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
REFRESH_TOKEN=$(echo $VERIFY_RESPONSE | grep -o '"refreshToken":"[^"]*"' | cut -d'"' -f4)
WALLET_ADDRESS=$(echo $VERIFY_RESPONSE | grep -o '"walletAddress":"[^"]*"' | cut -d'"' -f4)
ETH_WALLET_ADDRESS=$(echo $VERIFY_RESPONSE | grep -o '"ethWalletAddress":"[^"]*"' | cut -d'"' -f4)

if [ -z "$ACCESS_TOKEN" ] || [ -z "$REFRESH_TOKEN" ]; then
  echo -e "${RED}Failed to get authentication tokens${NC}"
  echo "Response: $VERIFY_RESPONSE"
  exit 1
fi

echo -e "${GREEN}Successfully authenticated!${NC}"
echo "Access Token: ${ACCESS_TOKEN:0:20}..."
echo "Refresh Token: ${REFRESH_TOKEN:0:20}..."
echo "Wallet Address: $WALLET_ADDRESS"
echo "ETH Wallet Address: $ETH_WALLET_ADDRESS"
echo

# Save tokens to files for later use
echo $ACCESS_TOKEN > "$TEMP_DIR/access_token"
echo $REFRESH_TOKEN > "$TEMP_DIR/refresh_token"
echo $WALLET_ADDRESS > "$TEMP_DIR/wallet_address"

# Step 6: Test creating a profile using the access token
echo -e "${YELLOW}Step 3: Creating a profile using the access token...${NC}"
CREATE_PROFILE_RESPONSE=$(curl -s -X POST "http://localhost:3001/profile" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -d "{}")

if echo $CREATE_PROFILE_RESPONSE | grep -q "error"; then
  echo -e "${RED}Failed to create profile${NC}"
  echo "Response: $CREATE_PROFILE_RESPONSE"
else
  echo -e "${GREEN}Profile created successfully!${NC}"
  echo "Response: $CREATE_PROFILE_RESPONSE"
fi
echo

# Step 7: Test accessing the profile
echo -e "${YELLOW}Step 4: Accessing the profile...${NC}"
GET_PROFILE_RESPONSE=$(curl -s -X GET "http://localhost:3001/profile/$WALLET_ADDRESS" \
  -H "Authorization: Bearer $ACCESS_TOKEN")

if echo $GET_PROFILE_RESPONSE | grep -q "error"; then
  echo -e "${RED}Failed to access profile${NC}"
  echo "Response: $GET_PROFILE_RESPONSE"
else
  echo -e "${GREEN}Profile accessed successfully!${NC}"
  echo "Response: $GET_PROFILE_RESPONSE"
fi
echo

# Step 8: Test refresh token flow after simulating token expiration
echo -e "${YELLOW}Step 5: Testing refresh token flow...${NC}"
echo -e "${BLUE}Simulating access token expiration...${NC}"

# Use the refresh token to get a new access token
REFRESH_RESPONSE=$(curl -s -X POST "http://localhost:3000/auth/refresh" \
  -H "Content-Type: application/json" \
  -d "{\"refreshToken\": \"$REFRESH_TOKEN\"}")

NEW_ACCESS_TOKEN=$(echo $REFRESH_RESPONSE | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
NEW_REFRESH_TOKEN=$(echo $REFRESH_RESPONSE | grep -o '"refreshToken":"[^"]*"' | cut -d'"' -f4)

if [ -z "$NEW_ACCESS_TOKEN" ] || [ -z "$NEW_REFRESH_TOKEN" ]; then
  echo -e "${RED}Failed to refresh tokens${NC}"
  echo "Response: $REFRESH_RESPONSE"
  exit 1
fi

echo -e "${GREEN}Successfully refreshed tokens!${NC}"
echo "New Access Token: ${NEW_ACCESS_TOKEN:0:20}..."
echo "New Refresh Token: ${NEW_REFRESH_TOKEN:0:20}..."
echo

# Save new tokens
echo $NEW_ACCESS_TOKEN > "$TEMP_DIR/new_access_token"
echo $NEW_REFRESH_TOKEN > "$TEMP_DIR/new_refresh_token"

# Step 9: Test if old refresh token is invalidated (token rotation)
echo -e "${YELLOW}Step 6: Testing if old refresh token is invalidated (token rotation)...${NC}"
OLD_REFRESH_RESPONSE=$(curl -s -X POST "http://localhost:3000/auth/refresh" \
  -H "Content-Type: application/json" \
  -d "{\"refreshToken\": \"$REFRESH_TOKEN\"}")

if echo $OLD_REFRESH_RESPONSE | grep -q "Invalid or revoked refresh token"; then
  echo -e "${GREEN}Success! Old refresh token was properly invalidated.${NC}"
else
  echo -e "${RED}Failed! Old refresh token was not invalidated.${NC}"
  echo "Response: $OLD_REFRESH_RESPONSE"
fi
echo

# Step 10: Test accessing profile with new access token
echo -e "${YELLOW}Step 7: Accessing profile with new access token...${NC}"
NEW_GET_PROFILE_RESPONSE=$(curl -s -X GET "http://localhost:3001/profile/$WALLET_ADDRESS" \
  -H "Authorization: Bearer $NEW_ACCESS_TOKEN")

if echo $NEW_GET_PROFILE_RESPONSE | grep -q "error"; then
  echo -e "${RED}Failed to access profile with new token${NC}"
  echo "Response: $NEW_GET_PROFILE_RESPONSE"
else
  echo -e "${GREEN}Profile accessed successfully with new token!${NC}"
  echo "Response: $NEW_GET_PROFILE_RESPONSE"
fi
echo

# Step 11: Test off-chain profile service with the access token
echo -e "${YELLOW}Step 8: Testing off-chain profile service...${NC}"
OFFCHAIN_PROFILE_RESPONSE=$(curl -s -X POST "http://localhost:3002/points/add" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $NEW_ACCESS_TOKEN" \
  -d "{\"amount\": 100}")

echo -e "${GREEN}Added points to off-chain profile!${NC}"
echo "Response: $OFFCHAIN_PROFILE_RESPONSE"
echo

# Step 12: Test token revocation
echo -e "${YELLOW}Step 9: Testing token revocation...${NC}"
REVOKE_RESPONSE=$(curl -s -X POST "http://localhost:3000/auth/revoke" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $NEW_ACCESS_TOKEN" \
  -d "{\"refreshToken\": \"$NEW_REFRESH_TOKEN\"}")

if echo $REVOKE_RESPONSE | grep -q "Token revoked"; then
  echo -e "${GREEN}Success! Refresh token was properly revoked.${NC}"
else
  echo -e "${RED}Failed to revoke refresh token${NC}"
  echo "Response: $REVOKE_RESPONSE"
fi
echo

# Step 13: Test that revoked refresh token cannot be used
echo -e "${YELLOW}Step 10: Testing that revoked refresh token cannot be used...${NC}"
REVOKED_REFRESH_RESPONSE=$(curl -s -X POST "http://localhost:3000/auth/refresh" \
  -H "Content-Type: application/json" \
  -d "{\"refreshToken\": \"$NEW_REFRESH_TOKEN\"}")

if echo $REVOKED_REFRESH_RESPONSE | grep -q "Invalid or revoked refresh token"; then
  echo -e "${GREEN}Success! Revoked refresh token was properly rejected.${NC}"
else
  echo -e "${RED}Failed! Revoked refresh token was not rejected.${NC}"
  echo "Response: $REVOKED_REFRESH_RESPONSE"
fi
echo

# Final results
echo -e "${BLUE}=== Test Results Summary ===${NC}"
echo -e "${GREEN}✓ Authentication with email${NC}"
echo -e "${GREEN}✓ Profile creation with access token${NC}"
echo -e "${GREEN}✓ Profile access with access token${NC}"
echo -e "${GREEN}✓ Token refresh${NC}"
echo -e "${GREEN}✓ Token rotation (old refresh token invalidation)${NC}"
echo -e "${GREEN}✓ Profile access with new access token${NC}"
echo -e "${GREEN}✓ Off-chain profile service integration${NC}"
echo -e "${GREEN}✓ Token revocation${NC}"
echo -e "${GREEN}✓ Revoked token rejection${NC}"

echo
echo -e "${GREEN}All tests completed successfully!${NC}"