# Waitlist Conversion - Live Cluster Test Plan

## Overview
This document outlines the testing strategy for validating waitlist user conversion functionality in the live Kubernetes cluster environment.

## Prerequisites
- Kubernetes cluster running with all YAP backend services
- MongoDB connected via `mongodb-secrets.yaml`
- Frontend connected to backend services
- Mock server reference implementation available for comparison

## Test Scenarios

### 1. Waitlist User Conversion Test
**Objective**: Verify that existing waitlist users can convert to full accounts without re-entering name/language.

**Pre-conditions**:
- Create a waitlist user in MongoDB with:
  ```json
  {
    "email": "waitlist-test@example.com",
    "name": "Test Waitlist User",
    "initial_language_to_learn": "spanish",
    "isWaitlistUser": true,
    "wlw": false,
    "waitlist_signup_at": "2024-12-01T10:00:00.000Z"
  }
  ```

**Test Steps**:
1. POST to `/auth/wallet/signup` with:
   ```json
   {
     "email": "waitlist-test@example.com",
     "passphrase_hash": "...",
     "encrypted_mnemonic": "...",
     "salt": "...",
     "nonce": "...",
     "sei_address": "...",
     "sei_public_key": "...",
     "eth_address": "...",
     "eth_public_key": "..."
   }
   ```

**Expected Results**:
- Status: 200/201
- Response includes:
  - `isWaitlistConversion: true`
  - `starting_points: 100` (bonus points)
  - Valid JWT tokens
  - User profile updated with `wlw: true`, `converted: true`

### 2. New User Registration Test
**Objective**: Verify new users still require name/language fields.

**Test Steps**:
1. POST to `/auth/wallet/signup` with:
   ```json
   {
     "name": "New Test User",
     "email": "newuser-test@example.com", 
     "language_to_learn": "french",
     "passphrase_hash": "...",
     "encrypted_mnemonic": "...",
     "salt": "...",
     "nonce": "...",
     "sei_address": "...",
     "sei_public_key": "...",
     "eth_address": "...",
     "eth_public_key": "..."
   }
   ```

**Expected Results**:
- Status: 200/201
- Response includes:
  - `isWaitlistConversion: false` or undefined
  - `starting_points: 0` or undefined
  - Valid JWT tokens
  - New profile created

### 3. Validation Error Tests
**Objective**: Verify proper validation for different scenarios.

**Test Cases**:

#### A. Waitlist user missing wallet data:
```bash
curl -X POST /auth/wallet/signup -d '{"email": "waitlist-test@example.com"}'
# Expected: 400 - Missing wallet fields
```

#### B. New user missing name:
```bash
curl -X POST /auth/wallet/signup -d '{"email": "newuser@example.com", "passphrase_hash": "..."}'  
# Expected: 400 - Name required
```

#### C. New user missing language:
```bash
curl -X POST /auth/wallet/signup -d '{"email": "newuser@example.com", "name": "Test", "passphrase_hash": "..."}'
# Expected: 400 - Language required  
```

## Service Integration Tests

### Auth Service → Profile Service Communication
**Test**: Verify auth service can query profile service for existing users.

```bash
# Should work in cluster
curl -X GET /profile/email/waitlist-test@example.com
```

### Profile Service Wallet Update
**Test**: Verify profile service can update profiles with wallet data.

```bash
# Should work in cluster  
curl -X PUT /profile/{userId}/wallet -H "Authorization: Bearer {token}" -d '{
  "passphrase_hash": "...",
  "encrypted_mnemonic": "...",
  "sei_wallet": {"address": "...", "public_key": "..."},
  "eth_wallet": {"address": "...", "public_key": "..."}
}'
```

## Success Criteria

### ✅ All Tests Pass When:
1. **Waitlist Conversion**: 
   - Existing waitlist users convert successfully
   - Bonus points awarded (100 points)
   - Profile updated with wallet data
   - No need to re-enter name/language

2. **New User Registration**:
   - New users register normally
   - Name/language validation enforced
   - No bonus points awarded
   - Fresh profile created

3. **Service Communication**:
   - Auth service successfully queries Profile service
   - Profile service successfully updates profiles
   - All database operations complete correctly

4. **Frontend Integration**:
   - Frontend receives correct flags and data
   - UI displays appropriate waitlist conversion messaging
   - Token-based authentication works end-to-end

## Comparison with Mock Server

The live cluster results should match the validated mock server behavior:

**Mock Server Results** (✅ Validated):
```json
{
  "isWaitlistConversion": true,
  "starting_points": 100,
  "userId": "waitlist-user-1",
  "walletAddress": "sei1testaddress...",
  "ethWalletAddress": "0x1234567890...",
  "name": "Waitlist User",
  "language_to_learn": "spanish"
}
```

## Rollback Plan

If any issues are discovered:
1. The changes are isolated to specific endpoints
2. Database schema additions are backwards-compatible
3. Frontend can fallback to standard registration flow
4. No breaking changes to existing functionality

## Monitoring and Logging

Monitor these log patterns during testing:
- `🔄 Converting waitlist user to full account`
- `✅ Waitlist conversion completed`
- `Profile service lookup: GET /profile/email/{email}`
- `Profile wallet update: PUT /profile/{userId}/wallet`

## Test Environment Commands

```bash
# Check cluster status
kubectl get pods -n yap

# View auth service logs
kubectl logs -f deployment/yap-auth-service -n yap

# View profile service logs  
kubectl logs -f deployment/yap-profile-service -n yap

# Port forward for testing
kubectl port-forward service/yap-auth-service 3001:3000 -n yap
kubectl port-forward service/yap-profile-service 3002:3000 -n yap
```

---

**Note**: This implementation matches the tested mock server behavior and maintains full backwards compatibility with existing registration flows.
