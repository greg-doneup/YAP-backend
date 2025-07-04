// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../token/YapToken.sol";

/**
 * @title TokenSpendingManager
 * @dev Core contract for YAP Token Cost Matrix implementation
 * Handles all token spending with 50% burn / 50% treasury split
 * Integrates with PriceOracle for real-time YAP/USD conversion
 */
contract TokenSpendingManager is AccessControl, ReentrancyGuard, Pausable {
    bytes32 public constant BACKEND_ROLE = keccak256("BACKEND_ROLE");
    bytes32 public constant TREASURY_ROLE = keccak256("TREASURY_ROLE");
    bytes32 public constant ORACLE_ROLE = keccak256("ORACLE_ROLE");

    YAPToken public yapToken;
    address public treasury;
    address public priceOracle;
    
    // Base cost per token in USD (5 cents = 5 * 10^16 wei equivalent)
    uint256 public constant BASE_COST_USD = 5e16; // $0.05 in wei-equivalent
    
    // Feature spending tracking
    mapping(bytes32 => uint256) public featureCosts; // featureId => token cost
    mapping(address => mapping(bytes32 => uint256)) public userSpending; // user => feature => amount spent
    mapping(address => uint256) public totalUserSpending; // user => total tokens spent
    
    // Spending events
    event TokensSpent(
        address indexed user,
        bytes32 indexed featureId,
        uint256 tokenAmount,
        uint256 burnedAmount,
        uint256 treasuryAmount,
        uint256 timestamp
    );
    
    event FeatureCostUpdated(bytes32 indexed featureId, uint256 oldCost, uint256 newCost);
    event TreasuryUpdated(address oldTreasury, address newTreasury);
    event PriceOracleUpdated(address oldOracle, address newOracle);
    event FeatureCostsInitialized(uint256 timestamp);
    
    /**
     * @dev Constructor sets up the spending manager
     * @param _yapToken Address of the YAP token contract
     * @param _treasury Address to receive treasury portion of spent tokens
     */
    constructor(address _yapToken, address _treasury) {
        require(_yapToken != address(0), "TokenSpendingManager: token cannot be zero address");
        require(_treasury != address(0), "TokenSpendingManager: treasury cannot be zero address");
        
        yapToken = YAPToken(_yapToken);
        treasury = _treasury;
        
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(BACKEND_ROLE, msg.sender);
        _grantRole(TREASURY_ROLE, msg.sender);
        
        // Initialize feature costs from YAP Token Cost Matrix
        _initializeFeatureCosts();
    }
    
    /**
     * @dev Spend tokens for a specific feature with 50/50 burn/treasury split
     * @param user Address of the user spending tokens
     * @param featureId Identifier for the feature being purchased
     * @param tokenAmount Amount of YAP tokens to spend
     * @return success Whether the spending was successful
     */
    function spendTokens(
        address user,
        bytes32 featureId,
        uint256 tokenAmount
    ) external onlyRole(BACKEND_ROLE) whenNotPaused nonReentrant returns (bool success) {
        require(user != address(0), "TokenSpendingManager: user cannot be zero address");
        require(tokenAmount > 0, "TokenSpendingManager: amount must be greater than zero");
        require(yapToken.balanceOf(user) >= tokenAmount, "TokenSpendingManager: insufficient balance");
        
        // Calculate burn and treasury amounts (50/50 split)
        uint256 burnAmount = tokenAmount / 2;
        uint256 treasuryAmount = tokenAmount - burnAmount; // Handle odd numbers
        
        // Transfer tokens from user to this contract
        require(yapToken.transferFrom(user, address(this), tokenAmount), "TokenSpendingManager: transfer failed");
        
        // Burn 50% of tokens
        yapToken.burn(address(this), burnAmount);
        
        // Transfer 50% to treasury
        require(yapToken.transfer(treasury, treasuryAmount), "TokenSpendingManager: treasury transfer failed");
        
        // Update spending tracking
        userSpending[user][featureId] += tokenAmount;
        totalUserSpending[user] += tokenAmount;
        
        emit TokensSpent(user, featureId, tokenAmount, burnAmount, treasuryAmount, block.timestamp);
        
        return true;
    }
    
    /**
     * @dev Calculate YAP tokens needed for a feature based on current USD price
     * @param featureId Feature identifier
     * @return yapAmount Amount of YAP tokens needed
     */
    function calculateTokenCost(bytes32 featureId) external view returns (uint256 yapAmount) {
        require(featureCosts[featureId] > 0, "TokenSpendingManager: unknown feature");
        
        if (priceOracle == address(0)) {
            // Fallback: use 1:1 ratio for testing
            return featureCosts[featureId];
        }
        
        // Get current YAP/USD price from oracle
        uint256 yapPriceUSD = _getYAPPriceUSD();
        require(yapPriceUSD > 0, "TokenSpendingManager: invalid oracle price");
        
        // Calculate: (feature_cost_tokens * BASE_COST_USD) / yapPriceUSD
        uint256 totalCostUSD = featureCosts[featureId] * BASE_COST_USD;
        yapAmount = (totalCostUSD * 1e18) / yapPriceUSD; // Convert to 18 decimal precision
        
        return yapAmount;
    }
    
    /**
     * @dev Get user's total spending for a specific feature
     * @param user User address
     * @param featureId Feature identifier
     * @return amount Total tokens spent on this feature
     */
    function getUserFeatureSpending(address user, bytes32 featureId) external view returns (uint256 amount) {
        return userSpending[user][featureId];
    }
    
    /**
     * @dev Get user's total spending across all features
     * @param user User address
     * @return amount Total tokens spent by user
     */
    function getUserTotalSpending(address user) external view returns (uint256 amount) {
        return totalUserSpending[user];
    }
    
    /**
     * @dev Update feature cost (admin only)
     * @param featureId Feature identifier
     * @param newCost New token cost for this feature
     */
    function updateFeatureCost(bytes32 featureId, uint256 newCost) external onlyRole(DEFAULT_ADMIN_ROLE) {
        uint256 oldCost = featureCosts[featureId];
        featureCosts[featureId] = newCost;
        emit FeatureCostUpdated(featureId, oldCost, newCost);
    }
    
    /**
     * @dev Update treasury address (admin only)
     * @param newTreasury New treasury address
     */
    function updateTreasury(address newTreasury) external onlyRole(TREASURY_ROLE) {
        require(newTreasury != address(0), "TokenSpendingManager: treasury cannot be zero address");
        address oldTreasury = treasury;
        treasury = newTreasury;
        emit TreasuryUpdated(oldTreasury, newTreasury);
    }
    
    /**
     * @dev Update price oracle address (admin only)
     * @param newOracle New oracle address
     */
    function updatePriceOracle(address newOracle) external onlyRole(DEFAULT_ADMIN_ROLE) {
        address oldOracle = priceOracle;
        priceOracle = newOracle;
        emit PriceOracleUpdated(oldOracle, newOracle);
    }
    
    /**
     * @dev Pause the contract (emergency use)
     */
    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }
    
    /**
     * @dev Unpause the contract
     */
    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }
    
    /**
     * @dev Initialize feature costs based on YAP Token Cost Matrix
     * All costs mapped directly from the official matrix specification
     */
    function _initializeFeatureCosts() private {
        // DAILY LESSONS - Core learning feature
        featureCosts[keccak256("dailyLessons_extraLesson")] = 1;              // 1 token per extra lesson
        featureCosts[keccak256("dailyLessons_unlimitedDay")] = 3;             // 3 tokens → unlimited for rest of day
        featureCosts[keccak256("dailyLessons_unlimitedWeek")] = 20;           // 20 tokens → unlimited for 7 days
        featureCosts[keccak256("dailyLessons_unlimitedMonth")] = 75;          // 75 tokens → unlimited for 30 days
        
        // AI SPEECH CHAT - Time-based allowances
        featureCosts[keccak256("aiSpeechChat_extraMinutes15")] = 1;           // 1 token = 15 min (stackable)
        
        // AI TEXT CHAT - Message-based allowances
        featureCosts[keccak256("aiTextChat_unlimitedHour")] = 2;              // 2 tokens = unlimited messages for 1 hour
        
        // UNIT EXAMS - Assessment features
        featureCosts[keccak256("unitExamSkipAhead_twoAttempts")] = 1;         // 1 token = 2 attempts
        featureCosts[keccak256("unitExam_optionalStake")] = 1;                // Optional: stake 1 token before starting
        
        // PRONUNCIATION LESSON - Detailed feedback
        featureCosts[keccak256("pronunciationLesson_detailedFeedback")] = 2;  // 2 tokens per lesson
        
        // WEEKLY LEADERBOARD - Competition staking
        featureCosts[keccak256("weeklyLeaderboard_stakeToEnter")] = 1;        // Stake 1 token to enter
        
        // COMMUNITY CHALLENGE - Pool-based competition
        featureCosts[keccak256("communityChallenge_joinNewQuest")] = 1;       // 1 token to join new quest
        
        // ADAPTIVE REVIEW QUIZ - AI-generated
        featureCosts[keccak256("adaptiveReviewQuiz_generateSet")] = 1;        // 1 token to generate set
        
        // STORY MODE - Interactive dialogue
        featureCosts[keccak256("storyMode_unlock")] = 2;                      // 2 tokens to unlock
        
        // EVENT PASS - Limited-time cultural events
        featureCosts[keccak256("eventPass_joinEvent")] = 1;                   // 1 token to join event
        
        // Emit initialization event
        emit FeatureCostsInitialized(block.timestamp);
    }
    
    /**
     * @dev Get YAP price in USD from oracle
     * @return price YAP price in USD with 18 decimal precision
     */
    function _getYAPPriceUSD() private view returns (uint256 price) {
        if (priceOracle == address(0)) {
            return 0;
        }
        
        // Call oracle contract to get current price
        // This will be implemented when PriceOracle contract is deployed
        (bool success, bytes memory data) = priceOracle.staticcall(
            abi.encodeWithSignature("getYAPPriceUSD()")
        );
        
        if (success && data.length >= 32) {
            return abi.decode(data, (uint256));
        }
        
        return 0;
    }
    
    /**
     * @dev Emergency withdrawal function (admin only)
     * @param token Token address to withdraw (use address(0) for ETH)
     * @param amount Amount to withdraw
     */
    function emergencyWithdraw(address token, uint256 amount) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (token == address(0)) {
            payable(msg.sender).transfer(amount);
        } else {
            IERC20(token).transfer(msg.sender, amount);
        }
    }
}
