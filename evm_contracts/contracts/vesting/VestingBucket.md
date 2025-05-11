# VestingBucket Technical Documentation

## Overview

The `VestingBucket` contract manages token vesting schedules for users with a cliff and linear release period. It holds YAP tokens and enforces vesting rules while allowing locked tokens to be spent on whitelisted destinations (such as burning for NFTs) even before they're fully vested.

## Inheritance

- **AccessControl**: Provides role-based access control
- **ReentrancyGuard**: Prevents reentrancy attacks
- **Pausable**: Allows pausing contract functions in emergency situations

## Roles

- **ALLOCATOR_ROLE**: Allowed to allocate tokens to users' vesting schedules (typically granted to DailyCompletion)
- **PAUSER_ROLE**: Can pause and unpause contract functions
- **DEFAULT_ADMIN_ROLE**: Can manage roles and change vesting parameters

## State Variables

| Variable | Type | Description |
|----------|------|-------------|
| token | YapToken | Reference to the YAP token contract |
| cliffDuration | uint256 | Duration of the cliff period (default: 7 days) |
| vestingDuration | uint256 | Duration of the vesting period after cliff (default: 30 days) |
| whitelistedDestinations | mapping(address => bool) | Addresses that can receive locked tokens |
| vestingSchedules | mapping(address => VestingSchedule) | User vesting schedules |

### VestingSchedule Struct

| Field | Type | Description |
|-------|------|-------------|
| totalAmount | uint256 | Total tokens allocated to user |
| released | uint256 | Amount already released/spent |
| startTimestamp | uint256 | Timestamp when vesting begins |
| lastAllocation | uint256 | Last allocation timestamp for cliff reset |

## Events

| Event | Parameters | Description |
|-------|------------|-------------|
| TokensAllocated | address indexed user, uint256 amount, uint256 timestamp | Emitted when tokens are allocated to a user |
| TokensReleased | address indexed user, uint256 amount, uint256 timestamp | Emitted when tokens are released to a user |
| TokensSpentToWhitelist | address indexed user, address indexed destination, uint256 amount | Emitted when locked tokens are spent to a whitelisted destination |
| DestinationWhitelisted | address indexed destination, bool status | Emitted when a destination's whitelist status changes |
| VestingParametersUpdated | uint256 cliffDuration, uint256 vestingDuration | Emitted when vesting parameters are updated |

## Functions

### Constructor

```solidity
constructor(address _token)
```

Initializes the contract with the YAP token address and sets up roles.

**Parameters:**
- `_token`: Address of the YAP token contract

### Vesting Operations

#### allocate

```solidity
function allocate(address user, uint256 amount) external onlyRole(ALLOCATOR_ROLE) whenNotPaused returns (bool success)
```

Allocates tokens to a user's vesting schedule. This function is typically called by the DailyCompletion contract.

**Parameters:**
- `user`: The address to allocate tokens to
- `amount`: The amount of tokens to allocate

**Requirements:**
- Caller must have the ALLOCATOR_ROLE
- Contract must not be paused
- User must not be zero address
- Amount must be greater than zero

**Returns:**
- `success`: Whether the allocation was successful

#### claim

```solidity
function claim() external nonReentrant whenNotPaused returns (uint256 amount)
```

Releases vested tokens to the caller.

**Requirements:**
- Contract must not be paused
- User must have releasable tokens

**Returns:**
- `amount`: The amount released

#### spendToWhitelisted

```solidity
function spendToWhitelisted(address destination, uint256 amount) external nonReentrant whenNotPaused returns (bool success)
```

Allows a user to spend locked tokens to a whitelisted destination (like BurnRedeemer).

**Parameters:**
- `destination`: The whitelisted contract to spend tokens to
- `amount`: The amount of tokens to spend

**Requirements:**
- Contract must not be paused
- Destination must be whitelisted
- User must have enough balance (locked or unlocked)
- Amount must be greater than zero

**Returns:**
- `success`: Whether the spend was successful

### Integration with YapToken

#### beforeTransfer

```solidity
function beforeTransfer(address from, address to, uint256 amount) external view returns (bool allowed)
```

Called by the YapToken contract before any token transfer to enforce vesting rules.

**Parameters:**
- `from`: The sender address
- `to`: The recipient address
- `amount`: The transfer amount

**Requirements:**
- Caller must be the token contract

**Returns:**
- `allowed`: Whether the transfer is allowed (true if destination is whitelisted or if amount <= unlocked tokens)

### View Functions

#### releasableAmount

```solidity
function releasableAmount(address user) public view returns (uint256 amount)
```

Calculates amount that has vested and is ready to be released for a user.

**Parameters:**
- `user`: The user to check releasable amount for

**Returns:**
- `amount`: The amount that can be released

#### vestedAmount

```solidity
function vestedAmount(address user) public view returns (uint256 amount)
```

Calculates how many tokens have vested so far for a user.

**Parameters:**
- `user`: The user to check vested amount for

**Returns:**
- `amount`: The total vested amount

#### lockedAmount

```solidity
function lockedAmount(address user) external view returns (uint256 amount)
```

Calculates locked amount (not yet vested) for a user.

**Parameters:**
- `user`: The user to check locked amount for

**Returns:**
- `amount`: The amount still locked

#### nextRelease

```solidity
function nextRelease(address user) external view returns (uint256 timestamp, uint256 amount)
```

Gets next release timestamp and amount for a user.

**Parameters:**
- `user`: The user address

**Returns:**
- `timestamp`: The next release timestamp (or 0 if fully vested)
- `amount`: The amount that will be released at that timestamp

### Administrative Functions

#### setVestingParameters

```solidity
function setVestingParameters(uint256 _cliffDuration, uint256 _vestingDuration) external onlyRole(DEFAULT_ADMIN_ROLE)
```

Updates the vesting parameters (only affects new allocations).

**Parameters:**
- `_cliffDuration`: New cliff duration in seconds
- `_vestingDuration`: New vesting duration in seconds

**Requirements:**
- Caller must have the DEFAULT_ADMIN_ROLE
- Vesting duration must be greater than 0

#### setWhitelistedDestination

```solidity
function setWhitelistedDestination(address destination, bool whitelisted) external onlyRole(DEFAULT_ADMIN_ROLE)
```

Adds or removes a destination to the whitelist.

**Parameters:**
- `destination`: The destination address
- `whitelisted`: Whether the destination should be whitelisted

**Requirements:**
- Caller must have the DEFAULT_ADMIN_ROLE
- Destination must not be zero address

#### batchSetWhitelistedDestinations

```solidity
function batchSetWhitelistedDestinations(address[] calldata destinations, bool whitelisted) external onlyRole(DEFAULT_ADMIN_ROLE)
```

Batch whitelist destinations.

**Parameters:**
- `destinations`: Array of destination addresses
- `whitelisted`: Whether the destinations should be whitelisted

**Requirements:**
- Caller must have the DEFAULT_ADMIN_ROLE
- Destinations must not be zero addresses

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

## Vesting Logic

The vesting schedule follows these rules:

1. **Cliff Period**: No tokens are vested during the cliff period (default: 7 days)
2. **Linear Vesting**: After the cliff period, tokens vest linearly over the vesting duration (default: 30 days)
3. **Cliff Reset**: If no allocation occurs for more than 7 days, the cliff period restarts
4. **Whitelisted Spending**: Locked tokens can be spent to whitelisted destinations, even during the cliff or vesting period

## Security Considerations

1. **Role Management**: 
   - ALLOCATOR_ROLE should only be granted to the DailyCompletion contract
   - DEFAULT_ADMIN_ROLE should be transferred to a multisig wallet

2. **Reentrancy Protection**: All functions that transfer tokens use ReentrancyGuard to prevent reentrancy attacks

3. **Authorization Check**: The `beforeTransfer` function requires that the caller is the token contract to prevent unauthorized bypass of vesting rules

4. **Whitelist Management**: Be careful when whitelisting destinations, as it allows users to spend locked tokens to those addresses

## Usage Examples

### Setting up the vesting parameters

```javascript
// Get contract instance
const vestingBucket = await ethers.getContractAt("VestingBucket", vestingBucketAddress);

// Set vesting parameters (14 day cliff, 60 day vesting)
await vestingBucket.setVestingParameters(
  14 * 24 * 60 * 60, // 14 days in seconds
  60 * 24 * 60 * 60  // 60 days in seconds
);

// Add BurnRedeemer to whitelist
await vestingBucket.setWhitelistedDestination(burnRedeemerAddress, true);
```

### Checking vesting status from frontend

```javascript
// Get all vesting information for a user
async function getUserVestingInfo(userAddress) {
  const vestingBucket = await ethers.getContractAt("VestingBucket", vestingBucketAddress);
  
  // Get vesting schedule data
  const schedule = await vestingBucket.vestingSchedules(userAddress);
  
  // Get amounts
  const locked = await vestingBucket.lockedAmount(userAddress);
  const releasable = await vestingBucket.releasableAmount(userAddress);
  const nextReleaseInfo = await vestingBucket.nextRelease(userAddress);
  
  return {
    totalAllocated: schedule.totalAmount,
    alreadyReleased: schedule.released,
    startTimestamp: schedule.startTimestamp,
    locked: locked,
    releasable: releasable,
    nextReleaseTimestamp: nextReleaseInfo[0],
    nextReleaseAmount: nextReleaseInfo[1]
  };
}