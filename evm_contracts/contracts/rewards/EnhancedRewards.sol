// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../token/YapToken.sol";

/**
 * @title EnhancedRewards
 * @dev Matrix-compliant reward distribution system for YAP Token Cost Matrix
 * Handles all reward mechanisms specified in the official matrix
 */
contract EnhancedRewards is AccessControl, ReentrancyGuard, Pausable {
    bytes32 public constant BACKEND_ROLE = keccak256("BACKEND_ROLE");
    bytes32 public constant REWARD_ADMIN_ROLE = keccak256("REWARD_ADMIN_ROLE");

    YAPToken public yapToken;
    
    // Reward configuration based on YAP Token Cost Matrix
    mapping(bytes32 => uint256) public rewardAmounts; // rewardId => token amount
    
    // User milestone tracking
    mapping(address => uint256) public userStreaks; // user => current streak
    mapping(address => uint256) public lastLessonDate; // user => last lesson timestamp
    mapping(address => mapping(uint256 => bool)) public milestonesClaimed; // user => milestone day => claimed
    
    // Referral tracking
    mapping(address => address) public referrers; // user => referrer
    mapping(address => uint256) public referralCompletions; // referrer => completed referrals
    
    // Survey and bug bounty tracking
    mapping(bytes32 => bool) public surveysCompleted; // surveyId => completed
    mapping(bytes32 => bool) public bugsReported; // bugId => reported
    mapping(address => uint256) public userSurveyCount; // user => surveys completed
    mapping(address => uint256) public userBugCount; // user => bugs reported
    
    // Events
    event RewardDistributed(
        address indexed user,
        bytes32 indexed rewardType,
        uint256 amount,
        uint256 timestamp,
        bytes32 indexed contextId
    );
    
    event MilestoneReached(
        address indexed user,
        uint256 streakDay,
        uint256 rewardAmount,
        uint256 timestamp
    );
    
    event ReferralCompleted(
        address indexed referrer,
        address indexed referee,
        uint256 rewardAmount,
        uint256 timestamp
    );
    
    event SurveyCompleted(
        address indexed user,
        bytes32 indexed surveyId,
        uint256 rewardAmount,
        uint256 timestamp
    );
    
    event BugBountyAwarded(
        address indexed user,
        bytes32 indexed bugId,
        uint256 rewardAmount,
        uint256 timestamp
    );
    
    event RewardConfigUpdated(bytes32 indexed rewardType, uint256 oldAmount, uint256 newAmount);
    
    /**
     * @dev Constructor initializes the rewards contract
     * @param _yapToken Address of the YAP token contract
     */
    constructor(address _yapToken) {
        require(_yapToken != address(0), "EnhancedRewards: YAP token cannot be zero address");
        
        yapToken = YAPToken(_yapToken);
        
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(BACKEND_ROLE, msg.sender);
        _grantRole(REWARD_ADMIN_ROLE, msg.sender);
        
        _initializeRewards();
    }
    
    /**
     * @dev Distribute lesson completion rewards based on score
     * @param user User address
     * @param score Lesson score (0-100)
     * @param lessonId Unique lesson identifier
     */
    function distributeLessonReward(
        address user,
        uint256 score,
        bytes32 lessonId
    ) external onlyRole(BACKEND_ROLE) whenNotPaused nonReentrant {
        require(user != address(0), "EnhancedRewards: user cannot be zero address");
        require(score <= 100, "EnhancedRewards: invalid score");
        
        uint256 rewardAmount = 0;
        bytes32 rewardType;
        
        // Matrix-compliant reward logic
        if (score == 100) {
            // 100% Pass = 2 tokens + perfect score bonus (1 token)
            rewardAmount = rewardAmounts[keccak256("lesson_pass_100")] + 
                          rewardAmounts[keccak256("perfect_score_bonus")];
            rewardType = keccak256("lesson_perfect");
        } else if (score >= 85) {
            // 85% Pass = 1 token
            rewardAmount = rewardAmounts[keccak256("lesson_pass_85")];
            rewardType = keccak256("lesson_pass");
        }
        
        if (rewardAmount > 0) {
            _distributeReward(user, rewardType, rewardAmount, lessonId);
            
            // Update streak and check for milestones
            _updateStreak(user);
        }
    }
    
    /**
     * @dev Distribute quiz completion rewards
     * @param user User address
     * @param score Quiz score (0-100)
     * @param isWeeklyQuiz Whether this is the special Sunday weekly quiz
     * @param isFirstTry Whether this is the first attempt
     * @param quizId Unique quiz identifier
     */
    function distributeQuizReward(
        address user,
        uint256 score,
        bool isWeeklyQuiz,
        bool isFirstTry,
        bytes32 quizId
    ) external onlyRole(BACKEND_ROLE) whenNotPaused nonReentrant {
        require(user != address(0), "EnhancedRewards: user cannot be zero address");
        require(score <= 100, "EnhancedRewards: invalid score");
        
        uint256 rewardAmount = 0;
        bytes32 rewardType;
        
        if (isWeeklyQuiz && isFirstTry && score >= 90) {
            // Weekly Quiz: Pass = 5 tokens on first try
            rewardAmount = rewardAmounts[keccak256("weekly_quiz_first_try")];
            rewardType = keccak256("weekly_quiz");
        } else if (score >= 90) {
            // Regular Quiz: 90% Pass = 2 tokens
            rewardAmount = rewardAmounts[keccak256("quiz_pass_90")];
            rewardType = keccak256("quiz_pass");
        }
        
        if (rewardAmount > 0) {
            _distributeReward(user, rewardType, rewardAmount, quizId);
        }
    }
    
    /**
     * @dev Distribute unit exam rewards
     * @param user User address
     * @param score Exam score (0-100)
     * @param wasStaked Whether user staked tokens before exam
     * @param isSkipAhead Whether this is a skip-ahead exam
     * @param examId Unique exam identifier
     */
    function distributeExamReward(
        address user,
        uint256 score,
        bool wasStaked,
        bool isSkipAhead,
        bytes32 examId
    ) external onlyRole(BACKEND_ROLE) whenNotPaused nonReentrant {
        require(user != address(0), "EnhancedRewards: user cannot be zero address");
        require(score <= 100, "EnhancedRewards: invalid score");
        
        uint256 rewardAmount = 0;
        bytes32 rewardType;
        
        if (isSkipAhead && score >= 85) {
            // Skip-ahead exam: Pass = 3 tokens + unit unlocked
            rewardAmount = rewardAmounts[keccak256("skip_ahead_pass")];
            rewardType = keccak256("skip_ahead");
        } else if (score >= 95) {
            // Regular exam: Score ≥ 95% → earn 1 token
            rewardAmount = rewardAmounts[keccak256("exam_score_95")];
            if (wasStaked) {
                // Pass with stake = 1.5× normal reward
                rewardAmount = (rewardAmount * 15) / 10;
                rewardType = keccak256("exam_staked");
            } else {
                rewardType = keccak256("exam_pass");
            }
        }
        
        if (rewardAmount > 0) {
            _distributeReward(user, rewardType, rewardAmount, examId);
        }
    }
    
    /**
     * @dev Complete a referral and distribute rewards
     * @param referrer Address of the referrer
     * @param referee Address of the referee
     */
    function completeReferral(
        address referrer,
        address referee
    ) external onlyRole(BACKEND_ROLE) whenNotPaused nonReentrant {
        require(referrer != address(0), "EnhancedRewards: referrer cannot be zero address");
        require(referee != address(0), "EnhancedRewards: referee cannot be zero address");
        require(referrer != referee, "EnhancedRewards: cannot refer yourself");
        require(referrers[referee] == address(0), "EnhancedRewards: referee already has referrer");
        
        // Set referral relationship
        referrers[referee] = referrer;
        referralCompletions[referrer]++;
        
        // Both users get 5 tokens
        uint256 rewardAmount = rewardAmounts[keccak256("referral_completion")];
        bytes32 contextId = keccak256(abi.encodePacked(referrer, referee, block.timestamp));
        
        _distributeReward(referrer, keccak256("referral_referrer"), rewardAmount, contextId);
        _distributeReward(referee, keccak256("referral_referee"), rewardAmount, contextId);
        
        emit ReferralCompleted(referrer, referee, rewardAmount, block.timestamp);
    }
    
    /**
     * @dev Complete a feedback survey and award tokens
     * @param user User address
     * @param surveyId Unique survey identifier
     */
    function completeSurvey(
        address user,
        bytes32 surveyId
    ) external onlyRole(BACKEND_ROLE) whenNotPaused nonReentrant {
        require(user != address(0), "EnhancedRewards: user cannot be zero address");
        require(!surveysCompleted[surveyId], "EnhancedRewards: survey already completed");
        
        surveysCompleted[surveyId] = true;
        userSurveyCount[user]++;
        
        // 2 tokens for submitted surveys
        uint256 rewardAmount = rewardAmounts[keccak256("survey_completion")];
        _distributeReward(user, keccak256("survey"), rewardAmount, surveyId);
        
        emit SurveyCompleted(user, surveyId, rewardAmount, block.timestamp);
    }
    
    /**
     * @dev Award bug bounty for validated bug report
     * @param user User address
     * @param bugId Unique bug identifier
     */
    function awardBugBounty(
        address user,
        bytes32 bugId
    ) external onlyRole(REWARD_ADMIN_ROLE) whenNotPaused nonReentrant {
        require(user != address(0), "EnhancedRewards: user cannot be zero address");
        require(!bugsReported[bugId], "EnhancedRewards: bug already reported");
        
        bugsReported[bugId] = true;
        userBugCount[user]++;
        
        // 5 tokens for every validated unique bug
        uint256 rewardAmount = rewardAmounts[keccak256("bug_bounty")];
        _distributeReward(user, keccak256("bug_bounty"), rewardAmount, bugId);
        
        emit BugBountyAwarded(user, bugId, rewardAmount, block.timestamp);
    }
    
    /**
     * @dev Update user streak and check for milestone rewards
     * @param user User address
     */
    function _updateStreak(address user) private {
        uint256 currentDay = block.timestamp / 1 days;
        uint256 lastDay = lastLessonDate[user] / 1 days;
        
        if (currentDay == lastDay) {
            // Same day, no streak update needed
            return;
        } else if (currentDay == lastDay + 1) {
            // Consecutive day, increment streak
            userStreaks[user]++;
        } else {
            // Streak broken, reset to 1
            userStreaks[user] = 1;
        }
        
        lastLessonDate[user] = block.timestamp;
        
        // Check for milestone rewards
        uint256 streak = userStreaks[user];
        if (_isMilestoneDay(streak) && !milestonesClaimed[user][streak]) {
            milestonesClaimed[user][streak] = true;
            
            uint256 rewardAmount = _getMilestoneReward(streak);
            if (rewardAmount > 0) {
                bytes32 contextId = keccak256(abi.encodePacked("milestone", streak, user));
                _distributeReward(user, keccak256("milestone"), rewardAmount, contextId);
                
                emit MilestoneReached(user, streak, rewardAmount, block.timestamp);
            }
        }
    }
    
    /**
     * @dev Check if a streak day is a milestone
     * @param day Streak day number
     * @return Whether this day is a milestone
     */
    function _isMilestoneDay(uint256 day) private pure returns (bool) {
        if (day == 3 || day == 7 || day == 15 || day == 30) {
            return true;
        }
        // Every 15 days after day 30
        if (day > 30 && (day - 30) % 15 == 0) {
            return true;
        }
        return false;
    }
    
    /**
     * @dev Get milestone reward amount
     * @param day Streak day number
     * @return Reward amount in tokens
     */
    function _getMilestoneReward(uint256 day) private view returns (uint256) {
        if (day == 3) {
            return rewardAmounts[keccak256("milestone_day_3")];
        } else if (day == 7) {
            return rewardAmounts[keccak256("milestone_day_7")];
        } else if (day == 15 || day == 30 || (day > 30 && (day - 30) % 15 == 0)) {
            return rewardAmounts[keccak256("milestone_day_15_plus")];
        }
        return 0;
    }
    
    /**
     * @dev Internal function to distribute rewards
     * @param user User address
     * @param rewardType Type of reward
     * @param amount Token amount
     * @param contextId Context identifier
     */
    function _distributeReward(
        address user,
        bytes32 rewardType,
        uint256 amount,
        bytes32 contextId
    ) private {
        require(amount > 0, "EnhancedRewards: reward amount must be positive");
        
        // Mint reward tokens
        yapToken.mint(user, amount);
        
        emit RewardDistributed(user, rewardType, amount, block.timestamp, contextId);
    }
    
    /**
     * @dev Initialize reward amounts based on YAP Token Cost Matrix
     */
    function _initializeRewards() private {
        // Lesson completion rewards
        rewardAmounts[keccak256("lesson_pass_85")] = 1;           // 85% Pass = 1 token
        rewardAmounts[keccak256("lesson_pass_100")] = 2;          // 100% Pass = 2 tokens
        rewardAmounts[keccak256("perfect_score_bonus")] = 1;      // Perfect score bonus = 1 token
        
        // Quiz rewards
        rewardAmounts[keccak256("quiz_pass_90")] = 2;             // 90% Pass = 2 tokens
        rewardAmounts[keccak256("weekly_quiz_first_try")] = 5;    // Sunday quiz first try = 5 tokens
        
        // Exam rewards
        rewardAmounts[keccak256("exam_score_95")] = 1;            // Score ≥ 95% = 1 token
        rewardAmounts[keccak256("skip_ahead_pass")] = 3;          // Skip-ahead pass = 3 tokens
        
        // Milestone rewards
        rewardAmounts[keccak256("milestone_day_3")] = 1;          // Day 3 = 1 token
        rewardAmounts[keccak256("milestone_day_7")] = 3;          // Day 7 = 3 tokens
        rewardAmounts[keccak256("milestone_day_15_plus")] = 10;   // Day 15+ = 10 tokens
        
        // Social rewards
        rewardAmounts[keccak256("referral_completion")] = 5;      // Referral = 5 tokens each
        rewardAmounts[keccak256("survey_completion")] = 2;        // Survey = 2 tokens
        rewardAmounts[keccak256("bug_bounty")] = 5;               // Bug bounty = 5 tokens
    }
    
    /**
     * @dev Update reward amount (admin only)
     * @param rewardType Reward type identifier
     * @param newAmount New reward amount
     */
    function updateRewardAmount(
        bytes32 rewardType,
        uint256 newAmount
    ) external onlyRole(REWARD_ADMIN_ROLE) {
        uint256 oldAmount = rewardAmounts[rewardType];
        rewardAmounts[rewardType] = newAmount;
        
        emit RewardConfigUpdated(rewardType, oldAmount, newAmount);
    }
    
    /**
     * @dev Get user's current streak
     * @param user User address
     * @return Current streak days
     */
    function getUserStreak(address user) external view returns (uint256) {
        return userStreaks[user];
    }
    
    /**
     * @dev Check if user has claimed a milestone
     * @param user User address
     * @param day Milestone day
     * @return Whether milestone has been claimed
     */
    function hasMilestoneClaimed(address user, uint256 day) external view returns (bool) {
        return milestonesClaimed[user][day];
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
