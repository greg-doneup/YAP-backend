// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import "@openzeppelin/contracts/access/Ownable.sol";
import "./YapToken.sol";

contract DailyCompletion is Ownable {
    YapToken public token;
    uint256 public dailyReward = 25e16;              // 0.25 YAP (1 YAP = 1e18)
    uint256 public pointsPerYap = 4;                 // 4 points required for 1 YAP
    mapping(address => uint256) public lastDay;      // UTC‒day stamp
    mapping(address => uint256) public lastQuizDay;  // UTC-day stamp for quiz completion
    
    // New user tracking state
    struct UserStats {
        uint256 pointTotal;        // Total points earned (1 per day)
        uint256 quizPoints;        // Points earned from quiz completions
        uint256 mintableYap;       // Amount of YAP that can be minted
        uint256 totalYapMinted;    // Total amount of YAP minted so far
    }
    
    mapping(address => UserStats) public userStats;
    
    // Track whether YAP minting is enabled
    bool public mintingEnabled = false;

    // Events
    event DailyCompleted(address indexed user, uint256 day);
    event QuizCompleted(address indexed user, uint256 day, uint256 pointsEarned);
    event PointsConverted(address indexed user, uint256 points, uint256 yapAmount);
    event YapMinted(address indexed user, uint256 amount);

    constructor(address _token) Ownable(msg.sender) { 
        token = YapToken(_token); 
    }

    // Complete daily streak
    function complete() external {
        uint256 today = block.timestamp / 1 days;
        require(lastDay[msg.sender] != today, "already claimed");
        
        // Update the last completion day
        lastDay[msg.sender] = today;
        
        // Increment user's point total and mintable YAP
        userStats[msg.sender].pointTotal += 1;
        userStats[msg.sender].mintableYap += dailyReward;
        
        emit DailyCompleted(msg.sender, today);
    }
    
    // Complete a quiz correctly to earn points
    function completeQuiz() external {
        uint256 today = block.timestamp / 1 days;
        require(lastQuizDay[msg.sender] != today, "quiz already completed today");
        
        // Update the last quiz completion day
        lastQuizDay[msg.sender] = today;
        
        // Add one point for correct quiz answer
        userStats[msg.sender].quizPoints += 1;
        
        emit QuizCompleted(msg.sender, today, 1);
    }
    
    // Allow users to convert accumulated quiz points to mintable YAP
    function convertPointsToYap() external {
        require(userStats[msg.sender].quizPoints >= pointsPerYap, "Not enough points to convert");
        
        // Calculate how many complete YAP tokens can be created from points
        uint256 totalPoints = userStats[msg.sender].quizPoints;
        uint256 yapToMint = totalPoints / pointsPerYap;
        uint256 pointsToConvert = yapToMint * pointsPerYap;
        
        // Calculate YAP amount (1 YAP = 1e18)
        uint256 yapAmount = yapToMint * 1e18;
        
        // Update user stats
        userStats[msg.sender].quizPoints -= pointsToConvert;
        userStats[msg.sender].mintableYap += yapAmount;
        
        emit PointsConverted(msg.sender, pointsToConvert, yapAmount);
    }
    
    // Allow users to mint their accumulated YAP
    function mintAccumulatedYap() external {
        require(mintingEnabled, "Minting not yet enabled");
        require(userStats[msg.sender].mintableYap > 0, "No YAP available to mint");
        
        uint256 amountToMint = userStats[msg.sender].mintableYap;
        userStats[msg.sender].mintableYap = 0;
        
        _mintYap(msg.sender, amountToMint);
    }
    
    // Internal function to mint YAP and update stats
    function _mintYap(address user, uint256 amount) internal {
        token.mint(user, amount);
        userStats[user].totalYapMinted += amount;
        emit YapMinted(user, amount);
    }
    
    // Admin function to enable/disable YAP minting
    function setMintingEnabled(bool enabled) external onlyOwner {
        mintingEnabled = enabled;
    }
    
    // Admin function to mint accumulated YAP for a specific user
    function adminMintFor(address user) external onlyOwner {
        require(userStats[user].mintableYap > 0, "No YAP available to mint");
        
        uint256 amountToMint = userStats[user].mintableYap;
        userStats[user].mintableYap = 0;
        
        _mintYap(user, amountToMint);
    }

    function setReward(uint256 _amt) external onlyOwner {
        dailyReward = _amt;
    }
    
    function setPointsPerYap(uint256 _points) external onlyOwner {
        pointsPerYap = _points;
    }
    
    // Getter functions to easily access user stats
    function getUserPointTotal(address user) external view returns (uint256) {
        return userStats[user].pointTotal;
    }
    
    function getUserQuizPoints(address user) external view returns (uint256) {
        return userStats[user].quizPoints;
    }
    
    function getUserMintableYap(address user) external view returns (uint256) {
        return userStats[user].mintableYap;
    }
    
    function getUserTotalYapMinted(address user) external view returns (uint256) {
        return userStats[user].totalYapMinted;
    }
    
    // Calculate maximum YAP tokens a user can get from their current points
    function getMaxYapFromUserPoints(address user) public view returns (uint256) {
        uint256 points = userStats[user].quizPoints;
        return points / pointsPerYap;
    }
    
    // Helper function to calculate how many YAP tokens a user can get based on their points
    function getYapFromPoints(uint256 points) public view returns (uint256) {
        return (points / pointsPerYap) * 1e18;
    }
}
