# YapToken Technical Documentation

## Overview

`YapToken` is an ERC-20 compliant token with additional security features and role-based access control. It implements the ERC20Permit extension to enable gasless approvals, which is especially useful for mobile-based applications. The token also includes a transfer-lock system that interacts with the VestingBucket contract to enforce vesting schedules.

## Inheritance

- **ERC20Permit**: Extends ERC20 with permit functionality (EIP-2612)
- **AccessControl**: Provides role-based access control
- **Pausable**: Allows pausing all token transfers in emergency situations

## Roles

- **MINTER_ROLE**: Allowed to mint new tokens
- **BURNER_ROLE**: Allowed to burn tokens
- **PAUSER_ROLE**: Can pause and unpause all token transfers
- **DEFAULT_ADMIN_ROLE**: Can manage all other roles

## State Variables

| Variable | Type | Description |
|----------|------|-------------|
| vestingBucket | address | Address of the VestingBucket contract |

## Events

| Event | Parameters | Description |
|-------|------------|-------------|
| VestingBucketSet | address indexed vestingBucket | Emitted when the vesting bucket address is set |

## Functions

### Constructor

```solidity
constructor() ERC20("Yap Token", "YAP") ERC20Permit("Yap Token")
```

Initializes the token with the name "Yap Token" and symbol "YAP", and grants all roles to the deployer.

### Administrative Functions

#### setVestingBucket

```solidity
function setVestingBucket(address _vestingBucket) external onlyRole(DEFAULT_ADMIN_ROLE)
```

Sets the VestingBucket contract address for transfer lock checking.

**Parameters:**
- `_vestingBucket`: Address of the VestingBucket contract

**Requirements:**
- Caller must have the DEFAULT_ADMIN_ROLE
- The vesting bucket address cannot be the zero address

### Token Operations

#### mint

```solidity
function mint(address to, uint256 amount) public onlyRole(MINTER_ROLE)
```

Creates `amount` tokens and assigns them to `to`, increasing the total supply.

**Parameters:**
- `to`: Address to receive the minted tokens
- `amount`: Amount of tokens to mint

**Requirements:**
- Caller must have the MINTER_ROLE

#### burn

```solidity
function burn(address from, uint256 amount) public onlyRole(BURNER_ROLE)
```

Destroys `amount` tokens from `from`, reducing the total supply.

**Parameters:**
- `from`: Address to burn tokens from
- `amount`: Amount of tokens to burn

**Requirements:**
- Caller must have the BURNER_ROLE

### Circuit Breaker

#### pause

```solidity
function pause() external onlyRole(PAUSER_ROLE)
```

Pauses all token transfers.

**Requirements:**
- Caller must have the PAUSER_ROLE

#### unpause

```solidity
function unpause() external onlyRole(PAUSER_ROLE)
```

Unpauses all token transfers.

**Requirements:**
- Caller must have the PAUSER_ROLE

### Internal Functions

#### _beforeTokenTransfer

```solidity
function _beforeTokenTransfer(address from, address to, uint256 amount) internal override whenNotPaused
```

Hook that is called before any transfer of tokens, including mint and burn. This function enforces vesting bucket transfer locks when applicable.

**Parameters:**
- `from`: Address sending the tokens
- `to`: Address receiving the tokens
- `amount`: Amount of tokens being transferred

**Behavior:**
1. Skips vesting check for minting and burning operations
2. Skips if VestingBucket not set yet
3. Otherwise, calls `beforeTransfer` on the VestingBucket contract to determine if the transfer is allowed
4. Reverts if the transfer is not allowed by the VestingBucket

## Integration with VestingBucket

The token integrates with the VestingBucket contract through the `_beforeTokenTransfer` hook:

1. When a user attempts to transfer tokens, the YapToken contract calls the `beforeTransfer` function on the VestingBucket contract.
2. The VestingBucket checks if the sender has enough unlocked (vested) tokens or if the recipient is a whitelisted destination.
3. The transfer only proceeds if allowed by the VestingBucket.

This mechanism enforces the vesting schedule while allowing some flexibility for whitelisted operations (like burning for NFTs) even with locked tokens.

## Security Considerations

1. **Role Management**: After deployment, roles should be properly assigned:
   - MINTER_ROLE should be granted only to the DailyCompletion contract
   - BURNER_ROLE should be granted only to the BurnRedeemer contract
   - DEFAULT_ADMIN_ROLE should be transferred to a multisig wallet
   - The deployer should renounce all roles

2. **Circular Dependencies**: The YapToken and VestingBucket have a circular dependency that is carefully managed:
   - YapToken is deployed first
   - VestingBucket is deployed with YapToken address
   - YapToken.setVestingBucket is called with VestingBucket address
   - The _beforeTokenTransfer hook has safeguards for when VestingBucket is not yet set

3. **Pausing**: The pause function should only be used in emergency situations and be controlled by a trusted multisig.

## Usage Examples

### Setting up the token with vesting

```javascript
// Deploy YapToken
const YapToken = await ethers.getContractFactory("YapToken");
const yapToken = await YapToken.deploy();

// Deploy VestingBucket
const VestingBucket = await ethers.getContractFactory("VestingBucket");
const vestingBucket = await VestingBucket.deploy(yapToken.address);

// Set VestingBucket in YapToken
await yapToken.setVestingBucket(vestingBucket.address);

// Grant roles
const MINTER_ROLE = await yapToken.MINTER_ROLE();
await yapToken.grantRole(MINTER_ROLE, dailyCompletionAddress);

const BURNER_ROLE = await yapToken.BURNER_ROLE();
await yapToken.grantRole(BURNER_ROLE, burnRedeemerAddress);
```

### Using gasless approvals with ERC20Permit

```javascript
// Generate permit signature (on client)
const deadline = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
const value = ethers.utils.parseEther("10");
const nonce = await yapToken.nonces(userAddress);
const name = await yapToken.name();
const chainId = await signer.getChainId();

const domain = {
  name,
  version: '1',
  chainId,
  verifyingContract: yapToken.address
};

const types = {
  Permit: [
    { name: 'owner', type: 'address' },
    { name: 'spender', type: 'address' },
    { name: 'value', type: 'uint256' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' }
  ]
};

const message = {
  owner: userAddress,
  spender: spenderAddress,
  value,
  nonce,
  deadline
};

const signature = await signer._signTypedData(domain, types, message);
const { v, r, s } = ethers.utils.splitSignature(signature);

// Use the signature (on backend or another contract)
await yapToken.permit(userAddress, spenderAddress, value, deadline, v, r, s);
```