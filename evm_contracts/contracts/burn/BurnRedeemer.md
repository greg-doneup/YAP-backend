# BurnRedeemer Technical Documentation

## Overview

The `BurnRedeemer` contract allows users to burn YAP tokens in exchange for NFT badges representing achievements. It implements ERC-721 for the badge NFTs and supports ERC-20 Permit for gasless approvals. The contract also tracks total burned amounts per user for prestige level tracking.

## Inheritance

- **ERC721Enumerable**: Extends ERC721 with enumeration capabilities
- **AccessControl**: Provides role-based access control
- **ReentrancyGuard**: Prevents reentrancy attacks

## Roles

- **ADMIN_ROLE**: Has access to administrative functions like treasury management
- **BADGE_MANAGER_ROLE**: Can create and update badge types
- **DEFAULT_ADMIN_ROLE**: Can manage roles (should be assigned to a multisig)

## State Variables

| Variable | Type | Description |
|----------|------|-------------|
| yapToken | YAPToken | Reference to the YAP token contract |
| treasury | address | Address to receive a share of burned tokens |
| treasuryShare | uint256 | Percentage of tokens sent to treasury (in basis points, 1000 = 10%) |
| badgeTypes | mapping | Maps badge type IDs to their configurations |
| badgeTypeCount | uint256 | Total number of badge types created |
| totalBurned | mapping | Maps users to their total burned amount |
| tokenToBadgeType | mapping | Maps token IDs to badge types |
| _tokenIdCounter | uint256 | Counter for token IDs |

### BadgeType Struct

| Field | Type | Description |
|-------|------|-------------|
| name | string | Badge name |
| description | string | Badge description |
| burnAmount | uint256 | Amount of YAP tokens to burn for this badge |
| active | bool | Whether the badge is currently available |
| maxSupply | uint256 | Maximum number of badges that can be minted (0 for unlimited) |
| minted | uint256 | Number of badges already minted |
| baseURI | string | Base URI for badge metadata |

## Events

| Event | Parameters | Description |
|-------|------------|-------------|
| BadgeCreated | uint256 indexed badgeTypeId, string name, uint256 burnAmount, uint256 maxSupply | Emitted when a badge type is created |
| BadgeRedeemed | address indexed user, uint256 indexed badgeTypeId, uint256 tokenId, uint256 burnAmount | Emitted when a badge is redeemed |
| TreasuryShareUpdated | uint256 oldShare, uint256 newShare | Emitted when treasury share is updated |
| TreasuryUpdated | address oldTreasury, address newTreasury | Emitted when treasury address is updated |

## Functions

### Constructor

```solidity
constructor(address _yapToken, address _treasury) ERC721("YAP Achievements", "YAPACH")
```

Initializes the contract with the YAP token address and treasury address.

**Parameters:**
- `_yapToken`: Address of the YAP token contract
- `_treasury`: Treasury address to receive a share of burned tokens

### Badge Management

#### createBadgeType

```solidity
function createBadgeType(
    string calldata name,
    string calldata description,
    uint256 burnAmount,
    uint256 maxSupply,
    string calldata baseURI
) external onlyRole(BADGE_MANAGER_ROLE) returns (uint256 badgeTypeId)
```

Creates a new badge type.

**Parameters:**
- `name`: Badge name
- `description`: Badge description
- `burnAmount`: Amount of YAP tokens to burn for this badge
- `maxSupply`: Maximum number of badges that can be minted (0 for unlimited)
- `baseURI`: Base URI for badge metadata

**Requirements:**
- Caller must have the BADGE_MANAGER_ROLE
- burnAmount must be greater than 0

**Returns:**
- `badgeTypeId`: The ID of the newly created badge type

#### updateBadgeType

```solidity
function updateBadgeType(
    uint256 badgeTypeId,
    bool active,
    uint256 burnAmount,
    uint256 maxSupply,
    string calldata baseURI
) external onlyRole(BADGE_MANAGER_ROLE)
```

Updates a badge type's configuration.

**Parameters:**
- `badgeTypeId`: The ID of the badge type to update
- `active`: Whether the badge should be active
- `burnAmount`: New burn amount (if 0, keeps current)
- `maxSupply`: New max supply (if 0, keeps current)
- `baseURI`: New base URI (if empty, keeps current)

**Requirements:**
- Caller must have the BADGE_MANAGER_ROLE
- Badge type must exist
- New max supply can't be less than already minted amount

### Redemption Functions

#### redeemBadge

```solidity
function redeemBadge(uint256 badgeTypeId) external nonReentrant returns (uint256 tokenId)
```

Burns YAP tokens for a badge using normal approval flow.

**Parameters:**
- `badgeTypeId`: The badge type to redeem

**Requirements:**
- Badge type must be active
- Badge must not be sold out
- User must have approved token transfer

**Returns:**
- `tokenId`: The ID of the newly minted badge NFT

**Effects:**
- Transfers YAP tokens from user to this contract
- Sends share to treasury if configured
- Burns remaining tokens
- Mints badge NFT to user
- Updates user's total burned amount

#### redeemBadgeWithPermit

```solidity
function redeemBadgeWithPermit(
    uint256 badgeTypeId,
    uint256 deadline,
    uint8 v,
    bytes32 r,
    bytes32 s
) external nonReentrant returns (uint256 tokenId)
```

Burns YAP tokens for a badge using ERC20Permit for gasless approvals.

**Parameters:**
- `badgeTypeId`: The badge type to redeem
- `deadline`: The deadline for the permit to be valid
- `v`, `r`, `s`: Components of the EIP-712 signature

**Requirements:**
- Badge type must be active
- Badge must not be sold out
- Permit signature must be valid

**Returns:**
- `tokenId`: The ID of the newly minted badge NFT

**Effects:**
- Same as `redeemBadge` but uses permit for approval

### Token Management

#### tokenURI

```solidity
function tokenURI(uint256 tokenId) public view override returns (string memory)
```

Gets badge type URI for metadata.

**Parameters:**
- `tokenId`: The token ID

**Requirements:**
- Token must exist

**Returns:**
- The URI for the badge metadata

### User Queries

#### getUserBadges

```solidity
function getUserBadges(address user) external view returns (uint256[] memory tokenIds, uint256[] memory badgeTypeIds)
```

Gets all badges owned by a user.

**Parameters:**
- `user`: The user address

**Returns:**
- `tokenIds`: Array of token IDs owned by user
- `badgeTypeIds`: Array of badge type IDs corresponding to token IDs

#### checkBurnTier

```solidity
function checkBurnTier(address user, uint256 requiredAmount) external view returns (bool qualified)
```

Checks if a user has reached a specific burn tier.

**Parameters:**
- `user`: The user address
- `requiredAmount`: The amount required for the tier

**Returns:**
- `qualified`: Whether the user has qualified for the tier

### Administrative Functions

#### setTreasuryShare

```solidity
function setTreasuryShare(uint256 newShare) external onlyRole(ADMIN_ROLE)
```

Updates the treasury share percentage (in basis points, 10000 = 100%).

**Parameters:**
- `newShare`: New treasury share

**Requirements:**
- Caller must have the ADMIN_ROLE
- Treasury share cannot exceed 50% (5000 basis points)

#### setTreasury

```solidity
function setTreasury(address newTreasury) external onlyRole(ADMIN_ROLE)
```

Updates the treasury address.

**Parameters:**
- `newTreasury`: New treasury address

**Requirements:**
- Caller must have the ADMIN_ROLE
- Treasury address cannot be zero address

#### recoverERC20

```solidity
function recoverERC20(address token, address to, uint256 amount) external onlyRole(DEFAULT_ADMIN_ROLE)
```

Emergency function to recover tokens accidentally sent to this contract.

**Parameters:**
- `token`: The token to recover
- `to`: The address to send the tokens to
- `amount`: The amount to recover

**Requirements:**
- Caller must have the DEFAULT_ADMIN_ROLE
- Token cannot be YAP token

## NFT Badge System

The contract implements a flexible badge system with the following features:

1. **Badge Types**: Administrators can create different badge types with varying costs, limits, and metadata
2. **Limited Editions**: Badges can have limited supply or be unlimited
3. **Burn Tracking**: User's total burned tokens are tracked for prestige levels
4. **Treasury Share**: A configurable percentage of tokens can go to a treasury instead of being burned
5. **Badge Metadata**: Each badge type has its own metadata URI

## Security Considerations

1. **Role Management**: 
   - BADGE_MANAGER_ROLE should only be granted to trusted administrators
   - DEFAULT_ADMIN_ROLE should be transferred to a multisig wallet

2. **Reentrancy Protection**: All redemption functions use ReentrancyGuard to prevent reentrancy attacks

3. **Treasury Configuration**: The treasury share should be carefully managed:
   - Cannot exceed 50% to ensure meaningful token burning occurs
   - Treasury address should be a secure wallet, ideally a multisig

4. **Badge Supply**: If badges are intended to be rare, proper max supply limits should be set at creation

## Integration with Frontend

The BurnRedeemer contract is designed to work with frontend applications for displaying badges and redeeming:

1. Frontend should:
   - Display available badge types from `badgeTypes` mapping
   - Show user's existing badges from `getUserBadges`
   - Enable redemption with normal approval or permit
   - Display user's prestige level based on total burned tokens

2. NFT Metadata should follow standard format:
   - JSON with name, description, image, etc.
   - Hosted on IPFS or similar decentralized storage

## Usage Examples

### Creating badge types

```javascript
// Get contract instance
const burnRedeemer = await ethers.getContractAt(
  "BurnRedeemer", 
  burnRedeemerAddress,
  adminSigner
);

// Create a basic badge
await burnRedeemer.createBadgeType(
  "Daily Champion",
  "Completed 30 days of learning",
  ethers.utils.parseEther("10"), // 10 YAP to burn
  1000, // Max 1000 badges
  "ipfs://QmBadgeMetadata1/" // Metadata URI
);

// Create a rare badge
await burnRedeemer.createBadgeType(
  "Grammar Master",
  "Achieved perfect scores for 10 consecutive days",
  ethers.utils.parseEther("50"), // 50 YAP to burn
  100, // Only 100 available
  "ipfs://QmBadgeMetadata2/"
);
```

### Redeeming a badge with permit

```javascript
// On frontend - generate permit signature
async function redeemBadgeWithPermit(badgeTypeId) {
  const burnAmount = await getBadgeBurnAmount(badgeTypeId);
  const deadline = Math.floor(Date.now() / 1000) + 3600; // 1 hour
  
  // Get permit signature
  const { v, r, s } = await getERC20PermitSignature(
    yapToken,
    signer,
    burnRedeemerAddress,
    burnAmount,
    deadline
  );
  
  // Execute redemption with permit
  const tx = await burnRedeemer.redeemBadgeWithPermit(
    badgeTypeId,
    deadline,
    v, r, s
  );
  
  await tx.wait();
  return tx;
}
```

### Querying user badges and tier status

```javascript
// Get all user badges
async function getUserBadges(userAddress) {
  const { tokenIds, badgeTypeIds } = await burnRedeemer.getUserBadges(userAddress);
  
  // Fetch badge details
  const badges = [];
  for (let i = 0; i < tokenIds.length; i++) {
    const badge = await burnRedeemer.badgeTypes(badgeTypeIds[i]);
    badges.push({
      tokenId: tokenIds[i],
      badgeType: badgeTypeIds[i],
      name: badge.name,
      description: badge.description,
      metadataUri: badge.baseURI
    });
  }
  
  return badges;
}

// Check user prestige tier
async function checkUserPrestigeTier(userAddress) {
  const totalBurned = await burnRedeemer.totalBurned(userAddress);
  
  // Check against predefined tiers
  const isBronzeTier = await burnRedeemer.checkBurnTier(
    userAddress, 
    ethers.utils.parseEther("100")
  );
  
  const isSilverTier = await burnRedeemer.checkBurnTier(
    userAddress,
    ethers.utils.parseEther("500")
  );
  
  const isGoldTier = await burnRedeemer.checkBurnTier(
    userAddress,
    ethers.utils.parseEther("1000")
  );
  
  return {
    totalBurned,
    isBronzeTier,
    isSilverTier,
    isGoldTier
  };
}
```