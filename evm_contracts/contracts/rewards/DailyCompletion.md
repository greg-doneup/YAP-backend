# DailyCompletion Technical Documentation

## Overview

The `DailyCompletion` contract records user learning activities such as daily lessons and quiz completions, calculates rewards based on configurable parameters, and distributes YAP tokens through the VestingBucket. It also implements a halving-style decay mechanism to gradually reduce rewards over time.

## Inheritance

- **AccessControl**: Provides role-based access control
- **ReentrancyGuard**: Prevents reentrancy attacks 
- **Pausable**: Allows pausing contract functions in emergency situations

## Roles

- **BACKEND_ROLE**: Allows recording completions and quizzes (granted to the backend service)
- **PAUSER_ROLE**: Can pause and unpause contract functions
- **DEFAULT_ADMIN_ROLE**: Can manage roles and change reward parameters

## State Variables

| Variable | Type | Description |
|----------|------|-------------|
| token | YapToken | Reference to the YAP token contract |
| vestingBucket | VestingBucket | Reference to the VestingBucket contract |
| dailyReward | uint256 | Reward amount for daily completion (default: 0.25 YAP) |
| quizReward | uint256 | Reward amount per quiz (default: 1 YAP) |
| pointsPerYap | uint256 | Quiz points needed for 1 YAP token (default: 4) |
| lastDecayTimestamp | uint256 | Timestamp of last reward decay |
| decayPeriod | uint256 | Time between reward decays (default: 30 days) |
| decayRate | uint256 | Percentage decay rate in basis points (default: 200 = 2%) |
| lastDay | mapping | Maps user to their last completion day |
| lastQuizDay | mapping | Maps user to their last quiz completion day |
| userStats | mapping | Maps user to their statistics |

### UserStats Struct

| Field | Type | Description |
|-------|------|-------------|
| pointTotal | uint256 | Total points earned from daily completions |
| quizPoints | uint256 | Current quiz points balance |
| totalYapAllocated | uint256 | Total YAP allocated through vesting |

## Events

| Event | Parameters | Description |
|-------|------------|-------------|
| DailyCompleted | address indexed user, uint256 day, uint256 reward | Emitted when a daily completion is recorded |
| QuizCompleted | address indexed user, uint256 day, uint256 reward | Emitted when a quiz completion is recorded |
| PointsConverted | address indexed user, uint256 points, uint256 yapAmount | Emitted when quiz points are converted to YAP |
| RewardDecayed | uint256 oldReward, uint256 newReward, uint256 timestamp | Emitted when reward decay is applied |

## Functions

### Constructor

```solidity
constructor(address _token, address _vestingBucket)
```

Initializes the contract with the YAP token and VestingBucket addresses and sets up roles.

**Parameters:**
- `_token`: Address of the YAP token contract
- `_vestingBucket`: Address of the VestingBucket contract

### Core Functions

#### recordCompletion

```solidity
function recordCompletion(address user) external onlyRole(BACKEND_ROLE) whenNotPaused nonReentrant returns (bool success)
```

Records a daily lesson completion for a user and allocates rewards.

**Parameters:**
- `user`: The user's wallet address

**Requirements:**
- Caller must have the BACKEND_ROLE
- Contract must not be paused
- User must not have already claimed today

**Returns:**
- `success`: Whether the operation was successful

**Effects:**
- Updates last completion day for user
- Increments user's point total
- Checks and applies reward decay if needed
- Allocates YAP tokens to user's vesting schedule

#### recordQuiz

```solidity
function recordQuiz(address user) external onlyRole(BACKEND_ROLE) whenNotPaused nonReentrant returns (bool success)
```

Records a quiz completion for a user, accumulates quiz points, and allocates rewards when thresholds are reached.

**Parameters:**
- `user`: The user's wallet address

**Requirements:**
- Caller must have the BACKEND_ROLE
- Contract must not be paused
- User must not have already completed a quiz today

**Returns:**
- `success`: Whether the operation was successful

**Effects:**
- Updates last quiz completion day for user
- Increments user's quiz points
- Converts points to YAP tokens when threshold is reached
- Allocates YAP tokens to user's vesting schedule

### Internal Functions

#### _allocateReward

```solidity
function _allocateReward(address user, uint256 amount) internal
```

Allocates tokens to the vesting bucket for a user.

**Parameters:**
- `user`: The user's wallet address
- `amount`: The amount of tokens to allocate

**Effects:**
- Mints YAP tokens to the VestingBucket contract
- Registers the allocation with the VestingBucket
- Updates user's totalYapAllocated stat

#### _checkAndApplyDecay

```solidity
function _checkAndApplyDecay() internal
```

Checks if rewards need to be decayed and applies decay if needed.

**Effects:**
- Calculates periods elapsed since last decay
- Updates lastDecayTimestamp if decay is applied
- Reduces dailyReward by decayRate for each period elapsed

### Administrative Functions

#### checkDecay

```solidity
function checkDecay() external
```

Force decay check and update (can be called by anyone).

#### setDailyReward

```solidity
function setDailyReward(uint256 amount) external onlyRole(DEFAULT_ADMIN_ROLE)
```

Sets the daily reward amount (subject to timelock governance).

**Parameters:**
- `amount`: New daily reward amount

**Requirements:**
- Caller must have the DEFAULT_ADMIN_ROLE

#### setQuizReward

```solidity
function setQuizReward(uint256 amount) external onlyRole(DEFAULT_ADMIN_ROLE)
```

Sets the quiz reward amount (subject to timelock governance).

**Parameters:**
- `amount`: New quiz reward amount

**Requirements:**
- Caller must have the DEFAULT_ADMIN_ROLE

#### setPointsPerYap

```solidity
function setPointsPerYap(uint256 points) external onlyRole(DEFAULT_ADMIN_ROLE)
```

Sets the number of points required per YAP (subject to timelock governance).

**Parameters:**
- `points`: New points per YAP

**Requirements:**
- Caller must have the DEFAULT_ADMIN_ROLE
- Points must be greater than 0

#### setDecayParams

```solidity
function setDecayParams(uint256 period, uint256 rate) external onlyRole(DEFAULT_ADMIN_ROLE)
```

Sets the decay parameters (subject to timelock governance).

**Parameters:**
- `period`: New decay period in seconds
- `rate`: New decay rate (divide by 10000)

**Requirements:**
- Caller must have the DEFAULT_ADMIN_ROLE
- Period must be greater than 0
- Rate cannot exceed 50% (5000 basis points)

### Circuit Breaker

#### pause

```solidity
function pause() external onlyRole(PAUSER_ROLE)
```

Pauses contract functions.

**Requirements:**
- Caller must have the PAUSER_ROLE

#### unpause

```solidity
function unpause() external onlyRole(PAUSER_ROLE)
```

Unpauses contract functions.

**Requirements:**
- Caller must have the PAUSER_ROLE

### View Functions

#### hasDailyCompletion

```solidity
function hasDailyCompletion(address user) external view returns (bool completed)
```

Checks if a user has completed their daily activity today.

**Parameters:**
- `user`: The user's wallet address

**Returns:**
- `completed`: Whether user has completed daily activity today

#### hasQuizCompletion

```solidity
function hasQuizCompletion(address user) external view returns (bool completed)
```

Checks if a user has completed their quiz today.

**Parameters:**
- `user`: The user's wallet address

**Returns:**
- `completed`: Whether user has completed quiz today

#### getUserStats

```solidity
function getUserStats(address user) external view returns (uint256 pointTotal, uint256 quizPoints, uint256 yapAllocated)
```

Gets user statistics.

**Parameters:**
- `user`: The user's wallet address

**Returns:**
- `pointTotal`: Total points earned
- `quizPoints`: Current quiz points
- `yapAllocated`: Total YAP tokens allocated to user

#### getNextDecayTimestamp

```solidity
function getNextDecayTimestamp() external view returns (uint256 timestamp)
```

Calculates when the next decay will occur.

**Returns:**
- `timestamp`: Next decay timestamp

## Reward Decay Mechanism

The contract implements a halving-style decay mechanism to gradually reduce rewards over time:

1. Every 30 days (configurable), the daily reward amount decays by 2% (configurable)
2. The decay is applied automatically when recording completions
3. The decay can be manually triggered by calling `checkDecay()`
4. Each decay period is tracked independently, so if multiple periods elapse, multiple decays will be applied

The decay formula is: `reward = reward * (1 - decayRate/10000)^periods`

## Security Considerations

1. **Role Management**:
   - BACKEND_ROLE should only be granted to trusted backend services
   - DEFAULT_ADMIN_ROLE should be transferred to a timelock contract or multisig wallet

2. **Reentrancy Protection**: All external functions use ReentrancyGuard to prevent reentrancy attacks

3. **Date-Based Logic**: The contract uses block.timestamp for date calculations, which is safe for daily granularity

4. **Decay Mechanism**: The decay calculation is carefully implemented to prevent underflows and overflows

## Integration with Backend Services

The DailyCompletion contract is designed to be called by backend services that verify user learning activities:

1. Backend verifies user completed a lesson:
   - Validates device ID, user identity, audio/text input
   - Calls `recordCompletion(userAddress)`

2. Backend verifies user completed a quiz correctly:
   - Validates quiz answers
   - Calls `recordQuiz(userAddress)`

3. Backend can check user status:
   - Calls view functions to check completion status and stats

## Usage Examples

### Recording a daily completion from backend

```javascript
// Get contract instance with backend signer
const dailyCompletion = await ethers.getContractAt(
  "DailyCompletion", 
  dailyCompletionAddress,
  backendSigner
);

// Record completion for a user
await dailyCompletion.recordCompletion(userAddress);
```

### Recording a quiz completion

```javascript
// Record quiz completion
await dailyCompletion.recordQuiz(userAddress);
```

### Checking user completion status

```javascript
// Check if user has completed daily activity today
const hasCompletedToday = await dailyCompletion.hasDailyCompletion(userAddress);

// Check if user has completed quiz today
const hasCompletedQuizToday = await dailyCompletion.hasQuizCompletion(userAddress);

// Get user stats
const userStats = await dailyCompletion.getUserStats(userAddress);
console.log(`User has ${userStats.pointTotal} total points, ${userStats.quizPoints} quiz points, and ${userStats.yapAllocated} YAP allocated`);
```

### Setting parameters through timelock

```javascript
// The timelock governor should be the DEFAULT_ADMIN_ROLE to change parameters
const timelockGovernor = await ethers.getContractAt(
  "TimelockGovernor", 
  timelockGovernorAddress,
  adminSigner
);

// Encode the function call
const calldata = dailyCompletion.interface.encodeFunctionData(
  "setDailyReward", 
  [ethers.utils.parseEther("0.5")] // Update to 0.5 YAP
);

// Schedule the operation with 24-hour delay
await timelockGovernor.schedule(
  dailyCompletionAddress,
  0, // Value (ETH)
  calldata,
  ethers.constants.HashZero, // Predecessor (none)
  ethers.utils.formatBytes32String(""), // Salt
  86400 // 24 hours delay
);

// After 24 hours, execute the operation
await timelockGovernor.execute(
  dailyCompletionAddress,
  0,
  calldata,
  ethers.constants.HashZero,
  ethers.utils.formatBytes32String("")
);
```