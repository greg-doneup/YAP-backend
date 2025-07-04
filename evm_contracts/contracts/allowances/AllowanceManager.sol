// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/Reentr    /**
     * Use AI speec        
        _resetUserUsageIfNeeded(user);
        
        AllowanceLimits memory limits = _getUserLimit(user);
        require(userUsage[user].aiSpeechMinutesUsed + minutesAmount <= limits.aiSpeechMinutes, "AllowanceManager: AI speech limit exceeded");
        
        userUsage[user].aiSpeechMinutesUsed += minutesAmount;
        uint256 remaining = limits.aiSpeechMinutes - userUsage[user].aiSpeechMinutesUsed;
        
        emit AllowanceUsed(user, "ai_speech", minutesAmount, remaining);
        return true; for a user
     * @param user The user address
     * @param minutesAmount Number of minutes to use
     * @return success Whether the usage was successful
     */
    function useAISpeechAllowance(address user, uint256 minutesAmount) external onlyRole(BACKEND_ROLE) whenNotPaused nonReentrant returns (bool success) {
        require(minutesAmount > 0, "AllowanceManager: minutes must be positive");
        
        // Check if user has unlimited access
        if (unlimitedAccess[user].unlimitedSpeechUntil > block.timestamp) {
            emit AllowanceUsed(user, "ai_speech", minutesAmount, type(uint256).max);
            return true;
        };
import "@openzeppelin/contracts/utils/Pausable.sol";

/**
 * @title AllowanceManager
 * @dev Manages daily allowances for YAP Token Cost Matrix features
 * Tracks usage and resets at 00:00 UTC daily as per matrix specification
 */
contract AllowanceManager is AccessControl, ReentrancyGuard, Pausable {
    bytes32 public constant BACKEND_ROLE = keccak256("BACKEND_ROLE");
    bytes32 public constant ALLOWANCE_ADMIN_ROLE = keccak256("ALLOWANCE_ADMIN_ROLE");
    
    // Daily allowance limits per feature type
    struct AllowanceLimits {
        uint256 dailyLessons;        // 5 lessons per day
        uint256 aiSpeechMinutes;     // 15 minutes per day
        uint256 aiTextMessages;      // 25 messages per day
    }
    
    // User's current daily usage
    struct UserUsage {
        uint256 dailyLessonsUsed;
        uint256 aiSpeechMinutesUsed;
        uint256 aiTextMessagesUsed;
        uint256 lastResetDay;        // UTC day when last reset (timestamp / 86400)
    }
    
    // Time-based unlimited access (purchased with tokens)
    struct UnlimitedAccess {
        uint256 unlimitedLessonsUntil;    // Timestamp until which lessons are unlimited
        uint256 unlimitedSpeechUntil;     // Timestamp until which speech is unlimited  
        uint256 unlimitedTextUntil;       // Timestamp until which text chat is unlimited
    }
    
    // Default allowance limits (can be updated by admin)
    AllowanceLimits public defaultLimits = AllowanceLimits({
        dailyLessons: 5,
        aiSpeechMinutes: 15,
        aiTextMessages: 25
    });
    
    // User data mappings
    mapping(address => UserUsage) public userUsage;
    mapping(address => UnlimitedAccess) public unlimitedAccess;
    mapping(address => AllowanceLimits) public customLimits; // For premium users
    
    // Events
    event AllowanceUsed(address indexed user, string featureType, uint256 amount, uint256 remaining);
    event AllowanceReset(address indexed user, uint256 day);
    event UnlimitedAccessGranted(address indexed user, string featureType, uint256 until);
    event CustomLimitsSet(address indexed user, uint256 lessons, uint256 speechMinutes, uint256 textMessages);
    event DefaultLimitsUpdated(uint256 lessons, uint256 speechMinutes, uint256 textMessages);
    
    /**
     * @dev Constructor sets up the allowance manager
     */
    constructor() {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(BACKEND_ROLE, msg.sender);
        _grantRole(ALLOWANCE_ADMIN_ROLE, msg.sender);
    }
    
    /**
     * @dev Check if user can use a daily lesson
     * @param user User address
     * @return canUse Whether user has allowance remaining
     * @return remaining How many lessons remaining today
     */
    function checkDailyLessonAllowance(address user) external view returns (bool canUse, uint256 remaining) {
        // Check if user has unlimited access
        if (unlimitedAccess[user].unlimitedLessonsUntil > block.timestamp) {
            return (true, type(uint256).max); // Unlimited
        }
        
        UserUsage memory usage = _getCurrentUsage(user);
        uint256 limit = _getUserLimit(user).dailyLessons;
        
        if (usage.dailyLessonsUsed < limit) {
            return (true, limit - usage.dailyLessonsUsed);
        }
        
        return (false, 0);
    }
    
    /**
     * @dev Check if user can use AI speech chat
     * @param user User address
     * @param minutesRequested Minutes of speech chat requested
     * @return canUse Whether user has allowance remaining
     * @return remaining How many minutes remaining today
     */
    function checkAISpeechAllowance(address user, uint256 minutesRequested) external view returns (bool canUse, uint256 remaining) {
        // Check if user has unlimited access
        if (unlimitedAccess[user].unlimitedSpeechUntil > block.timestamp) {
            return (true, type(uint256).max); // Unlimited
        }
        
        UserUsage memory usage = _getCurrentUsage(user);
        uint256 limit = _getUserLimit(user).aiSpeechMinutes;
        
        if (usage.aiSpeechMinutesUsed + minutesRequested <= limit) {
            return (true, limit - usage.aiSpeechMinutesUsed);
        }
        
        return (false, limit > usage.aiSpeechMinutesUsed ? limit - usage.aiSpeechMinutesUsed : 0);
    }
    
    /**
     * @dev Check if user can use AI text chat
     * @param user User address
     * @param messagesRequested Number of messages requested
     * @return canUse Whether user has allowance remaining
     * @return remaining How many messages remaining today
     */
    function checkAITextAllowance(address user, uint256 messagesRequested) external view returns (bool canUse, uint256 remaining) {
        // Check if user has unlimited access for this hour
        if (unlimitedAccess[user].unlimitedTextUntil > block.timestamp) {
            return (true, type(uint256).max); // Unlimited
        }
        
        UserUsage memory usage = _getCurrentUsage(user);
        uint256 limit = _getUserLimit(user).aiTextMessages;
        
        if (usage.aiTextMessagesUsed + messagesRequested <= limit) {
            return (true, limit - usage.aiTextMessagesUsed);
        }
        
        return (false, limit > usage.aiTextMessagesUsed ? limit - usage.aiTextMessagesUsed : 0);
    }
    
    /**
     * @dev Use daily lesson allowance
     * @param user User address
     * @param amount Number of lessons to use (default 1)
     * @return success Whether the usage was successful
     */
    function useDailyLessonAllowance(address user, uint256 amount) external onlyRole(BACKEND_ROLE) whenNotPaused nonReentrant returns (bool success) {
        require(amount > 0, "AllowanceManager: amount must be positive");
        
        // Check if user has unlimited access
        if (unlimitedAccess[user].unlimitedLessonsUntil > block.timestamp) {
            emit AllowanceUsed(user, "daily_lessons", amount, type(uint256).max);
            return true;
        }
        
        _resetUserUsageIfNeeded(user);
        
        AllowanceLimits memory limits = _getUserLimit(user);
        require(userUsage[user].dailyLessonsUsed + amount <= limits.dailyLessons, "AllowanceManager: daily lesson limit exceeded");
        
        userUsage[user].dailyLessonsUsed += amount;
        uint256 remaining = limits.dailyLessons - userUsage[user].dailyLessonsUsed;
        
        emit AllowanceUsed(user, "daily_lessons", amount, remaining);
        return true;
    }
    
    /**
     * @dev Use AI speech allowance
     * @param user User address
     * @param minutesAmount Number of minutes to use
     * @return success Whether the usage was successful
     */
    function useAISpeechAllowance(address user, uint256 minutesAmount) external onlyRole(BACKEND_ROLE) whenNotPaused nonReentrant returns (bool success) {
        require(minutesAmount > 0, "AllowanceManager: minutes must be positive");
        
        // Check if user has unlimited access
        if (unlimitedAccess[user].unlimitedSpeechUntil > block.timestamp) {
            emit AllowanceUsed(user, "ai_speech", minutesAmount, type(uint256).max);
            return true;
        }
        
        _resetUserUsageIfNeeded(user);
        
        AllowanceLimits memory limits = _getUserLimit(user);
        require(userUsage[user].aiSpeechMinutesUsed + minutesAmount <= limits.aiSpeechMinutes, "AllowanceManager: AI speech limit exceeded");
        
        userUsage[user].aiSpeechMinutesUsed += minutesAmount;
        uint256 remaining = limits.aiSpeechMinutes - userUsage[user].aiSpeechMinutesUsed;
        
        emit AllowanceUsed(user, "ai_speech", minutesAmount, remaining);
        return true;
    }
    
    /**
     * @dev Use AI text chat allowance
     * @param user User address
     * @param messages Number of messages to use
     * @return success Whether the usage was successful
     */
    function useAITextAllowance(address user, uint256 messages) external onlyRole(BACKEND_ROLE) whenNotPaused nonReentrant returns (bool success) {
        require(messages > 0, "AllowanceManager: messages must be positive");
        
        // Check if user has unlimited access
        if (unlimitedAccess[user].unlimitedTextUntil > block.timestamp) {
            emit AllowanceUsed(user, "ai_text", messages, type(uint256).max);
            return true;
        }
        
        _resetUserUsageIfNeeded(user);
        
        AllowanceLimits memory limits = _getUserLimit(user);
        require(userUsage[user].aiTextMessagesUsed + messages <= limits.aiTextMessages, "AllowanceManager: AI text limit exceeded");
        
        userUsage[user].aiTextMessagesUsed += messages;
        uint256 remaining = limits.aiTextMessages - userUsage[user].aiTextMessagesUsed;
        
        emit AllowanceUsed(user, "ai_text", messages, remaining);
        return true;
    }
    
    /**
     * @dev Grant unlimited access for a specific feature and duration
     * @param user User address
     * @param featureType Type of feature ("lessons", "speech", "text")
     * @param durationSeconds How long unlimited access lasts
     */
    function grantUnlimitedAccess(
        address user, 
        string calldata featureType, 
        uint256 durationSeconds
    ) external onlyRole(BACKEND_ROLE) whenNotPaused {
        require(durationSeconds > 0, "AllowanceManager: duration must be positive");
        
        bytes32 featureHash = keccak256(bytes(featureType));
        uint256 unlimitedUntil = block.timestamp + durationSeconds;
        
        if (featureHash == keccak256("lessons")) {
            unlimitedAccess[user].unlimitedLessonsUntil = unlimitedUntil;
        } else if (featureHash == keccak256("speech")) {
            unlimitedAccess[user].unlimitedSpeechUntil = unlimitedUntil;
        } else if (featureHash == keccak256("text")) {
            unlimitedAccess[user].unlimitedTextUntil = unlimitedUntil;
        } else {
            revert("AllowanceManager: invalid feature type");
        }
        
        emit UnlimitedAccessGranted(user, featureType, unlimitedUntil);
    }
    
    /**
     * @dev Set custom allowance limits for a specific user (premium users)
     * @param user User address
     * @param lessons Daily lesson limit
     * @param speechMinutes Daily speech minutes limit
     * @param textMessages Daily text message limit
     */
    function setCustomLimits(
        address user,
        uint256 lessons,
        uint256 speechMinutes,
        uint256 textMessages
    ) external onlyRole(ALLOWANCE_ADMIN_ROLE) {
        customLimits[user] = AllowanceLimits({
            dailyLessons: lessons,
            aiSpeechMinutes: speechMinutes,
            aiTextMessages: textMessages
        });
        
        emit CustomLimitsSet(user, lessons, speechMinutes, textMessages);
    }
    
    /**
     * @dev Update default allowance limits
     * @param lessons New default daily lesson limit
     * @param speechMinutes New default daily speech minutes limit
     * @param textMessages New default daily text message limit
     */
    function updateDefaultLimits(
        uint256 lessons,
        uint256 speechMinutes,
        uint256 textMessages
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        defaultLimits = AllowanceLimits({
            dailyLessons: lessons,
            aiSpeechMinutes: speechMinutes,
            aiTextMessages: textMessages
        });
        
        emit DefaultLimitsUpdated(lessons, speechMinutes, textMessages);
    }
    
    /**
     * @dev Get user's current usage for today
     * @param user User address
     * @return usage Current usage data
     */
    function getCurrentUsage(address user) external view returns (UserUsage memory usage) {
        return _getCurrentUsage(user);
    }
    
    /**
     * @dev Get user's allowance limits
     * @param user User address
     * @return limits Allowance limits for this user
     */
    function getUserLimits(address user) external view returns (AllowanceLimits memory limits) {
        return _getUserLimit(user);
    }
    
    /**
     * @dev Get time until next reset (in seconds)
     * @return secondsUntilReset Seconds until 00:00 UTC tomorrow
     */
    function getTimeUntilReset() external view returns (uint256 secondsUntilReset) {
        uint256 currentDay = block.timestamp / 86400;
        uint256 nextResetTime = (currentDay + 1) * 86400;
        return nextResetTime - block.timestamp;
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
     * @dev Reset user usage if a new day has started (internal)
     * @param user User address
     */
    function _resetUserUsageIfNeeded(address user) private {
        uint256 currentDay = block.timestamp / 86400; // UTC days since epoch
        
        if (userUsage[user].lastResetDay < currentDay) {
            userUsage[user] = UserUsage({
                dailyLessonsUsed: 0,
                aiSpeechMinutesUsed: 0,
                aiTextMessagesUsed: 0,
                lastResetDay: currentDay
            });
            
            emit AllowanceReset(user, currentDay);
        }
    }
    
    /**
     * @dev Get current usage with auto-reset check
     * @param user User address
     * @return usage Current usage (after potential reset)
     */
    function _getCurrentUsage(address user) private view returns (UserUsage memory usage) {
        uint256 currentDay = block.timestamp / 86400;
        
        if (userUsage[user].lastResetDay < currentDay) {
            // Return reset usage without modifying state
            return UserUsage({
                dailyLessonsUsed: 0,
                aiSpeechMinutesUsed: 0,
                aiTextMessagesUsed: 0,
                lastResetDay: currentDay
            });
        }
        
        return userUsage[user];
    }
    
    /**
     * @dev Get user's allowance limits (custom or default)
     * @param user User address
     * @return limits Applicable limits for this user
     */
    function _getUserLimit(address user) private view returns (AllowanceLimits memory limits) {
        // Check if user has custom limits
        if (customLimits[user].dailyLessons > 0 || 
            customLimits[user].aiSpeechMinutes > 0 || 
            customLimits[user].aiTextMessages > 0) {
            return customLimits[user];
        }
        
        return defaultLimits;
    }
}
