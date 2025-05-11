// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";
import "../token/YapToken.sol";

/**
 * @title BurnRedeemer
 * @dev Receives YAP tokens and burns them in exchange for NFTs or other perks
 * Uses ERC20Permit for gasless approvals
 */
contract BurnRedeemer is ERC721Enumerable, AccessControl, ReentrancyGuard {
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes32 public constant BADGE_MANAGER_ROLE = keccak256("BADGE_MANAGER_ROLE");
    
    YapToken public yapToken;
    address public treasury;
    uint256 public treasuryShare = 1000; // 10% (basis points - 10000 = 100%)
    
    // Badge types and their costs
    struct BadgeType {
        string name;
        string description;
        uint256 burnAmount;
        bool active;
        uint256 maxSupply;
        uint256 minted;
        string baseURI;
    }
    
    // Map badge type IDs to their configurations
    mapping(uint256 => BadgeType) public badgeTypes;
    uint256 public badgeTypeCount;
    
    // Map users to their total burned amount
    mapping(address => uint256) public totalBurned;
    
    // Map token IDs to badge types
    mapping(uint256 => uint256) public tokenToBadgeType;
    
    // Counter for token IDs
    uint256 private _tokenIdCounter;
    
    // Events
    event BadgeCreated(uint256 indexed badgeTypeId, string name, uint256 burnAmount, uint256 maxSupply);
    event BadgeRedeemed(address indexed user, uint256 indexed badgeTypeId, uint256 tokenId, uint256 burnAmount);
    event TreasuryShareUpdated(uint256 oldShare, uint256 newShare);
    event TreasuryUpdated(address oldTreasury, address newTreasury);
    
    /**
     * @dev Constructor that sets up the contract with the YAP token
     * @param _yapToken The address of the YAP token contract
     * @param _treasury The treasury address to receive a share of burned tokens
     */
    constructor(address _yapToken, address _treasury) 
        ERC721("Yap Achievements", "YAPACH") 
    {
        require(_yapToken != address(0), "BurnRedeemer: token cannot be zero address");
        require(_treasury != address(0), "BurnRedeemer: treasury cannot be zero address");
        
        yapToken = YapToken(_yapToken);
        treasury = _treasury;
        
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(ADMIN_ROLE, msg.sender);
        _grantRole(BADGE_MANAGER_ROLE, msg.sender);
    }
    
    /**
     * @dev Create a new badge type
     * @param name Badge name
     * @param description Badge description
     * @param burnAmount Amount of YAP tokens to burn for this badge
     * @param maxSupply Maximum number of badges that can be minted (0 for unlimited)
     * @param baseURI Base URI for badge metadata
     * @return badgeTypeId The ID of the newly created badge type
     */
    function createBadgeType(
        string calldata name,
        string calldata description,
        uint256 burnAmount,
        uint256 maxSupply,
        string calldata baseURI
    ) external onlyRole(BADGE_MANAGER_ROLE) returns (uint256 badgeTypeId) {
        require(burnAmount > 0, "BurnRedeemer: burn amount must be greater than 0");
        
        uint256 newBadgeTypeId = badgeTypeCount;
        badgeTypeCount++;
        
        badgeTypes[newBadgeTypeId] = BadgeType({
            name: name,
            description: description,
            burnAmount: burnAmount,
            active: true,
            maxSupply: maxSupply,
            minted: 0,
            baseURI: baseURI
        });
        
        emit BadgeCreated(newBadgeTypeId, name, burnAmount, maxSupply);
        return newBadgeTypeId;
    }
    
    /**
     * @dev Redeem YAP tokens for a badge using normal approval flow
     * @param badgeTypeId The badge type to redeem
     * @return tokenId The ID of the newly minted badge NFT
     */
    function redeemBadge(uint256 badgeTypeId) 
        external 
        nonReentrant 
        returns (uint256 tokenId) 
    {
        return _redeemBadge(badgeTypeId, msg.sender);
    }
    
    /**
     * @dev Redeem YAP tokens for a badge using ERC20Permit for gasless approvals
     * @param badgeTypeId The badge type to redeem
     * @param deadline The deadline for the permit to be valid
     * @param v The v component of the signature
     * @param r The r component of the signature
     * @param s The s component of the signature
     * @return tokenId The ID of the newly minted badge NFT
     */
    function redeemBadgeWithPermit(
        uint256 badgeTypeId,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external nonReentrant returns (uint256 tokenId) {
        BadgeType storage badge = badgeTypes[badgeTypeId];
        require(badge.active, "BurnRedeemer: badge type not active");
        
        // Execute permit to approve tokens
        IERC20Permit(address(yapToken)).permit(
            msg.sender,
            address(this),
            badge.burnAmount,
            deadline,
            v,
            r,
            s
        );
        
        return _redeemBadge(badgeTypeId, msg.sender);
    }
    
    /**
     * @dev Internal function to handle badge redemption
     * @param badgeTypeId The badge type to redeem
     * @param user The user redeeming the badge
     * @return tokenId The ID of the newly minted badge NFT
     */
    function _redeemBadge(uint256 badgeTypeId, address user) internal returns (uint256 tokenId) {
        BadgeType storage badge = badgeTypes[badgeTypeId];
        require(badge.active, "BurnRedeemer: badge type not active");
        require(badge.maxSupply == 0 || badge.minted < badge.maxSupply, "BurnRedeemer: badge sold out");
        
        uint256 burnAmount = badge.burnAmount;
        
        // Calculate treasury amount and burn amount
        uint256 treasuryAmount = burnAmount * treasuryShare / 10000;
        uint256 actualBurnAmount = burnAmount - treasuryAmount;
        
        // Transfer tokens from user to this contract
        require(
            yapToken.transferFrom(user, address(this), burnAmount),
            "BurnRedeemer: transferFrom failed"
        );
        
        // Handle treasury share
        if (treasuryAmount > 0 && treasury != address(0)) {
            require(
                yapToken.transfer(treasury, treasuryAmount),
                "BurnRedeemer: treasury transfer failed"
            );
        }
        
        // Burn the tokens
        yapToken.burn(address(this), actualBurnAmount);
        
        // Increment user's total burned amount
        totalBurned[user] += burnAmount;
        
        // Mint the badge NFT
        uint256 newTokenId = _tokenIdCounter;
        _tokenIdCounter++;
        
        _safeMint(user, newTokenId);
        tokenToBadgeType[newTokenId] = badgeTypeId;
        badge.minted++;
        
        emit BadgeRedeemed(user, badgeTypeId, newTokenId, burnAmount);
        return newTokenId;
    }
    
    /**
     * @dev Get badge type URI for metadata
     * @param tokenId The token ID
     * @return The URI for the badge metadata
     */
    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        require(_exists(tokenId), "BurnRedeemer: URI query for nonexistent token");
        
        uint256 badgeTypeId = tokenToBadgeType[tokenId];
        return badgeTypes[badgeTypeId].baseURI;
    }
    
    /**
     * @dev Get all badges owned by a user
     * @param user The user address
     * @return badges Array of badge details
     */
    function getUserBadges(address user) external view returns (
        uint256[] memory tokenIds,
        uint256[] memory badgeTypeIds
    ) {
        uint256 balance = balanceOf(user);
        tokenIds = new uint256[](balance);
        badgeTypeIds = new uint256[](balance);
        
        for (uint256 i = 0; i < balance; i++) {
            uint256 tokenId = tokenOfOwnerByIndex(user, i);
            tokenIds[i] = tokenId;
            badgeTypeIds[i] = tokenToBadgeType[tokenId];
        }
        
        return (tokenIds, badgeTypeIds);
    }
    
    /**
     * @dev Check if a user has reached a specific burn tier
     * @param user The user address
     * @param requiredAmount The amount required for the tier
     * @return qualified Whether the user has qualified for the tier
     */
    function checkBurnTier(address user, uint256 requiredAmount) external view returns (bool qualified) {
        return totalBurned[user] >= requiredAmount;
    }
    
    // ========== ADMIN FUNCTIONS ==========
    
    /**
     * @dev Update a badge type's configuration
     * @param badgeTypeId The ID of the badge type to update
     * @param active Whether the badge should be active
     * @param burnAmount New burn amount (if 0, keeps current)
     * @param maxSupply New max supply (if 0, keeps current)
     * @param baseURI New base URI (if empty, keeps current)
     */
    function updateBadgeType(
        uint256 badgeTypeId,
        bool active,
        uint256 burnAmount,
        uint256 maxSupply,
        string calldata baseURI
    ) external onlyRole(BADGE_MANAGER_ROLE) {
        require(badgeTypeId < badgeTypeCount, "BurnRedeemer: badge type does not exist");
        
        BadgeType storage badge = badgeTypes[badgeTypeId];
        
        badge.active = active;
        
        if (burnAmount > 0) {
            badge.burnAmount = burnAmount;
        }
        
        // Can't reduce max supply below what's already minted
        if (maxSupply > 0 && maxSupply >= badge.minted) {
            badge.maxSupply = maxSupply;
        }
        
        if (bytes(baseURI).length > 0) {
            badge.baseURI = baseURI;
        }
    }
    
    /**
     * @dev Update the treasury share percentage (in basis points, 10000 = 100%)
     * @param newShare New treasury share
     */
    function setTreasuryShare(uint256 newShare) external onlyRole(ADMIN_ROLE) {
        require(newShare <= 5000, "BurnRedeemer: treasury share cannot exceed 50%");
        
        uint256 oldShare = treasuryShare;
        treasuryShare = newShare;
        
        emit TreasuryShareUpdated(oldShare, newShare);
    }
    
    /**
     * @dev Update the treasury address
     * @param newTreasury New treasury address
     */
    function setTreasury(address newTreasury) external onlyRole(ADMIN_ROLE) {
        require(newTreasury != address(0), "BurnRedeemer: treasury cannot be zero address");
        
        address oldTreasury = treasury;
        treasury = newTreasury;
        
        emit TreasuryUpdated(oldTreasury, newTreasury);
    }
    
    /**
     * @dev Emergency function to recover tokens accidentally sent to this contract
     * @param token The token to recover
     * @param to The address to send the tokens to
     * @param amount The amount to recover
     */
    function recoverERC20(address token, address to, uint256 amount) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(token != address(yapToken), "BurnRedeemer: cannot recover YAP token");
        IERC20(token).transfer(to, amount);
    }
}