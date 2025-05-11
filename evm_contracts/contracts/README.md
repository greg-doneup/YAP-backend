# YAP Smart Contract Documentation

This directory contains the smart contracts that power the YAP token ecosystem on the SEI EVM. The system is designed to provide rewards for learning activities, implement vesting mechanisms to prevent token dumping, and create an engaging token economy with burn mechanics for special achievements.

## Contract Architecture

The YAP ecosystem consists of five main components:

1. **Token Layer** - The ERC-20 YAP token with permit functionality for gasless transactions
2. **Vesting Layer** - Manages token vesting schedules with customizable parameters
3. **Rewards Layer** - Processes daily activities and quiz completions to allocate tokens
4. **Burn Layer** - Allows users to burn tokens for special NFT badges and perks
5. **Governance Layer** - Time-locks critical parameter changes for security

## Directory Structure

```
contracts/
├── token/
│   └── YapToken.sol         # ERC-20 token with role-based permissions
├── vesting/
│   └── VestingBucket.sol    # Token vesting with cliff and linear release
├── rewards/
│   └── DailyCompletion.sol  # Learning activity tracking and rewards
├── burn/
│   └── BurnRedeemer.sol     # Token burning for NFT badges and perks
└── governance/
    └── TimelockGovernor.sol # Time-delayed governance for parameter changes
```

## Contract Details

### YapToken (`token/YapToken.sol`)

An ERC-20 token with enhanced functionality:

- **Standards**: Implements ERC-20 and ERC-20 Permit (EIP-2612) for gasless approvals
- **Access Control**: Role-based permissions for minting, burning, and pausing
- **Transfer Lock**: Hook system that integrates with VestingBucket for transfer restrictions
- **Security**: Pausable circuit breaker for emergency scenarios

**Key roles**:
- `MINTER_ROLE`: Can mint new tokens (typically granted to DailyCompletion)
- `BURNER_ROLE`: Can burn tokens (typically granted to BurnRedeemer)
- `PAUSER_ROLE`: Can pause all token transfers in emergency situations
- `DEFAULT_ADMIN_ROLE`: Can manage other roles (should be assigned to a multisig)

### VestingBucket (`vesting/VestingBucket.sol`)

Holds user balances under time-based vesting:

- **Vesting Schedule**: 7-day cliff, followed by linear release over 30 days (configurable)
- **Whitelisting**: Allows spending still-locked tokens to whitelisted destinations
- **Allocation**: Tracks vesting schedules per user with appropriate accounting
- **Security**: ReentrancyGuard and Pausable for protection

**Key functions**:
- `allocate(user, amount)`: Adds tokens to a user's vesting schedule
- `claim()`: Releases vested tokens to the caller
- `spendToWhitelisted(destination, amount)`: Spends locked tokens to whitelisted contracts
- `beforeTransfer(from, to, amount)`: Called by YapToken to enforce transfer locks

### DailyCompletion (`rewards/DailyCompletion.sol`)

Records user learning activities and allocates rewards:

- **Activity Tracking**: Records daily completions and quiz results per wallet
- **Points System**: Accumulates points that convert to YAP tokens
- **Emission Decay**: Implements 2% decay of rewards every 30 days
- **Security**: Role-based access, ReentrancyGuard and Pausable protection

**Key functions**:
- `recordCompletion(user)`: Records a daily lesson completion (backend-only)
- `recordQuiz(user)`: Records a quiz completion (backend-only)
- `_checkAndApplyDecay()`: Applies the reward decay mechanism

### BurnRedeemer (`burn/BurnRedeemer.sol`)

NFT badge system for burning tokens:

- **Standards**: Implements ERC-721 for non-fungible achievement badges
- **Gasless UX**: Uses ERC-20 Permit for better mobile experience
- **Badge Types**: Configurable badge types with varying costs and supply limits
- **Treasury**: Optional treasury share of burned tokens

**Key functions**:
- `redeemBadge(badgeTypeId)`: Burns YAP tokens and mints a badge NFT
- `redeemBadgeWithPermit(...)`: Same as above, but with gasless approval
- `createBadgeType(...)`: Creates a new badge type (admin)
- `checkBurnTier(user, requiredAmount)`: Checks if a user has burned enough tokens for a tier

### TimelockGovernor (`governance/TimelockGovernor.sol`)

Time-locked governance for secure parameter changes:

- **Delay**: 24-hour delay on parameter changes
- **Access Control**: Proposer and executor roles for separation of duties
- **Standards**: Based on OpenZeppelin's TimelockController

## Interactions Between Contracts

1. **User Completes Learning Activity**:
   - Backend calls `DailyCompletion.recordCompletion()`
   - DailyCompletion mints YAP to VestingBucket
   - VestingBucket allocates tokens to user's vesting schedule

2. **User Claims Vested Tokens**:
   - User calls `VestingBucket.claim()`
   - VestingBucket transfers unlocked tokens to user
   - YapToken performs the transfer

3. **User Spends Tokens for Badge**:
   - User approves BurnRedeemer to spend their tokens
   - User calls `BurnRedeemer.redeemBadge()`
   - BurnRedeemer burns tokens and mints NFT badge

4. **Admin Changes Parameters**:
   - Admin proposes change through TimelockGovernor
   - After 24 hours, change can be executed
   - Parameters are updated with delay protection

## Security Features

- **Role-Based Access**: Separation of concerns using role-based permissions
- **Reentrancy Protection**: ReentrancyGuard on all value-transferring functions
- **Circuit Breakers**: Pausable mechanism for emergency freeze
- **Time-locked Admin**: Parameter changes require 24h delay
- **Token Vesting**: Prevents immediate large sell-offs
- **Permit Pattern**: Gasless approvals for better UX

## Deployment Sequence

The contracts must be deployed in the following order:

1. YapToken
2. VestingBucket (with YapToken address)
3. Set the VestingBucket in YapToken
4. DailyCompletion (with YapToken and VestingBucket addresses)
5. BurnRedeemer (with YapToken address)
6. TimelockGovernor

After deployment:
1. Grant MINTER_ROLE to DailyCompletion
2. Grant ALLOCATOR_ROLE in VestingBucket to DailyCompletion
3. Grant BURNER_ROLE to BurnRedeemer
4. Whitelist BurnRedeemer in VestingBucket
5. Transfer admin roles to multisig wallet
6. Renounce deployer roles

## Upgradeability

The contracts are designed as non-upgradeable for maximum security. Any future upgrades would require new contract deployments and migration strategies.

## Development and Testing

The contracts have been developed with Hardhat and include:
- 100% test coverage
- Gas optimization techniques
- Security best practices
- Static analysis with Slither
- Inline documentation for NatSpec

## Future Extensions

The system is designed to be extensible for:
1. Staking mechanisms for governance participation
2. Additional burn sinks for advanced features
3. On-chain analytics for learning progress
4. Integration with other DeFi protocols

## External Dependencies

- OpenZeppelin Contracts 5.0+:
  - ERC20, ERC20Permit
  - ERC721, ERC721Enumerable
  - AccessControl
  - ReentrancyGuard
  - Pausable
  - TimelockController