// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "./token/YAPToken.sol";
import "./vesting/VestingBucket.sol";

/**
 * @title DailyCompletion
 * @dev Records daily lesson and quiz completions, calculates rewards,
 * and allocates tokens to the VestingBucket for time-based vesting.
 */
contract DailyCompletion is AccessControl, ReentrancyGuard, Pausable {
    bytes32 public constant BACKEND_ROLE = keccak256("BACKEND_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    
    YAPToken public token;
    VestingBucket public vestingBucket;

    // Reward parameters
    uint256 public dailyReward = 25e16;              // 0.25 YAP (1 YAP = 1e18)
    uint256 public quizReward = 1e18;                // 1 YAP for quiz completion
    uint256 public pointsPerYAP = 4;                 // 4 points required for 1 YAP
    
    // Emission decay parameters
    uint256 public lastDecayTimestamp;
    uint256 public decayPeriod = 30 days;
    uint256 public decayRate = 200;                 // 2% decay (divide by 10000)
    
    // User state tracking
    mapping(address => uint256) public lastDay;      // UTC‒day stamp
    mapping(address => uint256) public lastQuizDay;  // UTC-day stamp for quiz completion
    
    struct UserStats {
        uint256 pointTotal;        // Total points earned (1 per day)
        uint256 quizPoints;        // Points earned from quiz completions
        uint256 totalYAPAllocated; // Total YAP allocated through vesting
    }
    
    mapping(address => UserStats) public userStats;
    
    // Events
    event DailyCompleted(address indexed user, uint256 day, uint256 reward);
    event QuizCompleted(address indexed user, uint256 day, uint256 reward);
    event PointsConverted(address indexed user, uint256 points, uint256 yapAmount);
    event RewardDecayed(uint256 oldReward, uint256 newReward, uint256 timestamp);
    
    /**
     * @dev Constructor that sets up roles and connects to token and vesting contracts
     * @param _token The YAP token address
     * @param _vestingBucket The VestingBucket contract address
     */
    constructor(address _token, address _vestingBucket) { 
        token = YAPToken(_token);
        vestingBucket = VestingBucket(_vestingBucket);
        
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(BACKEND_ROLE, msg.sender);
        _grantRole(PAUSER_ROLE, msg.sender);
        
        lastDecayTimestamp = block.timestamp;
    }

    /**
     * @dev Record a daily lesson completion for a user
     * @param user The user's wallet address
     * @return success Whether the operation was successful
     */
    function recordCompletion(address user) 
        external 
        onlyRole(BACKEND_ROLE) 
        whenNotPaused 
        nonReentrant 
        returns (bool success) 
    {
        uint256 today = block.timestamp / 1 days;
        require(lastDay[user] != today, "DailyCompletion: already claimed today");
        
        // Check if rewards need decaying
        _checkAndApplyDecay();
        
        // Update the last completion day
        lastDay[user] = today;
        
        // Increment user's point total
        userStats[user].pointTotal += 1;
        
        // Allocate reward to vesting bucket
        _allocateReward(user, dailyReward);
        
        emit DailyCompleted(user, today, dailyReward);
        return true;
    }
    
    /**
     * @dev Record a quiz completion for a user
     * @param user The user's wallet address
     * @return success Whether the operation was successful
     */
    function recordQuiz(address user) 
        external 
        onlyRole(BACKEND_ROLE) 
        whenNotPaused 
        nonReentrant 
        returns (bool success) 
    {
        uint256 today = block.timestamp / 1 days;
        require(lastQuizDay[user] != today, "DailyCompletion: quiz already completed today");
        
        // Update the last quiz completion day
        lastQuizDay[user] = today;
        
        // Add quiz points
        userStats[user].quizPoints += 1;
        
        // When points threshold is reached, convert to tokens
        uint256 pointsToUse = userStats[user].quizPoints / pointsPerYAP * pointsPerYAP;
        
        if (pointsToUse > 0) {
            uint256 yapAmount = (pointsToUse / pointsPerYAP) * quizReward;
            userStats[user].quizPoints -= pointsToUse;
            
            // Allocate reward to vesting bucket
            _allocateReward(user, yapAmount);
            
            emit PointsConverted(user, pointsToUse, yapAmount);
        }
        
        emit QuizCompleted(user, today, quizReward);
        return true;
    }
    
    /**
     * @dev Allocate tokens to the vesting bucket for a user
     * @param user The user's wallet address
     * @param amount The amount of tokens to allocate
     */
    function _allocateReward(address user, uint256 amount) internal {
        // Mint tokens to the vesting bucket
        token.mint(address(vestingBucket), amount);
        
        // Register the allocation with the vesting bucket
        vestingBucket.allocate(user, amount);
        
        // Update user stats
        userStats[user].totalYAPAllocated += amount;
    }
    
    /**
     * @dev Check if rewards need to be decayed and apply decay if needed
     */
    function _checkAndApplyDecay() internal {
        if (block.timestamp >= lastDecayTimestamp + decayPeriod) {
            uint256 periods = (block.timestamp - lastDecayTimestamp) / decayPeriod;
            
            // Update the last decay timestamp
            lastDecayTimestamp += periods * decayPeriod;
            
            // Calculate new reward with decay
            uint256 oldReward = dailyReward;
            
            // Apply decay formula: reward = reward * (1 - decayRate/10000)^periods
            for (uint256 i = 0; i < periods; i++) {
                dailyReward = dailyReward * (10000 - decayRate) / 10000;
            }
            
            emit RewardDecayed(oldReward, dailyReward, block.timestamp);
        }
    }
    
    /**
     * @dev Force decay check and update (can be called by anyone)
     */
    function checkDecay() external {
        _checkAndApplyDecay();
    }
    
    /**
     * @dev Pause the contract
     */
    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }
    
    /**
     * @dev Unpause the contract
     */
    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    // ========== ADMIN FUNCTIONS ==========
    
    /**
     * @dev Set the daily reward amount (subject to timelock governance)
     * @param amount New daily reward amount
     */
    function setDailyReward(uint256 amount) external onlyRole(DEFAULT_ADMIN_ROLE) {
        dailyReward = amount;
    }
    
    /**
     * @dev Set the quiz reward amount (subject to timelock governance)
     * @param amount New quiz reward amount
     */
    function setQuizReward(uint256 amount) external onlyRole(DEFAULT_ADMIN_ROLE) {
        quizReward = amount;
    }
    
    /**
     * @dev Set the number of points required per YAP (subject to timelock governance)
     * @param points New points per YAP
     */
    function setPointsPerYAP(uint256 points) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(points > 0, "DailyCompletion: points must be greater than 0");
        pointsPerYAP = points;
    }
    
    /**
     * @dev Set the decay parameters (subject to timelock governance)
     * @param period New decay period in seconds
     * @param rate New decay rate (divide by 10000)
     */
    function setDecayParams(uint256 period, uint256 rate) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(period > 0, "DailyCompletion: period must be greater than 0");
        require(rate <= 5000, "DailyCompletion: rate cannot exceed 50%");
        
        // Apply pending decay before changing parameters
        _checkAndApplyDecay();
        
        decayPeriod = period;
        decayRate = rate;
    }
    
    // ========== VIEW FUNCTIONS ==========
    
    /**
     * @dev Check if a user has completed their daily activity today
     * @param user The user's wallet address
     * @return completed Whether user has completed daily activity today
     */
    function hasDailyCompletion(address user) external view returns (bool completed) {
        uint256 today = block.timestamp / 1 days;
        return lastDay[user] == today;
    }
    
    /**
     * @dev Check if a user has completed their quiz today
     * @param user The user's wallet address
     * @return completed Whether user has completed quiz today
     */
    function hasQuizCompletion(address user) external view returns (bool completed) {
        uint256 today = block.timestamp / 1 days;
        return lastQuizDay[user] == today;
    }
    
    /**
     * @dev Get user statistics
     * @param user The user's wallet address
     * @return pointTotal Total points earned
     * @return quizPoints Current quiz points
     * @return yapAllocated Total YAP tokens allocated to user
     */
    function getUserStats(address user) external view returns (
        uint256 pointTotal,
        uint256 quizPoints,
        uint256 yapAllocated
    ) {
        UserStats memory stats = userStats[user];
        return (stats.pointTotal, stats.quizPoints, stats.totalYAPAllocated);
    }
    
    /**
     * @dev Calculate when the next decay will occur
     * @return timestamp Next decay timestamp
     */
    function getNextDecayTimestamp() external view returns (uint256 timestamp) {
        return lastDecayTimestamp + decayPeriod;
    }
}
