// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "../token/YapToken.sol";

/**
 * @title VestingBucket
 * @dev Holds user balances under time-based vesting with a cliff
 * Allows tokens to be spent to whitelisted contracts even while locked
 */
contract VestingBucket is AccessControl, ReentrancyGuard, Pausable {
    bytes32 public constant ALLOCATOR_ROLE = keccak256("ALLOCATOR_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    
    YapToken public token;
    
    // Vesting parameters
    uint256 public cliffDuration = 7 days;
    uint256 public vestingDuration = 30 days; 
    
    // Whitelist for spending locked tokens
    mapping(address => bool) public whitelistedDestinations;
    
    // User vesting data 
    struct VestingSchedule {
        uint256 totalAmount;       // Total tokens allocated to user
        uint256 released;          // Amount already released/spent
        uint256 startTimestamp;    // When vesting begins
        uint256 lastAllocation;    // Last allocation timestamp for cliff reset
    }
    
    mapping(address => VestingSchedule) public vestingSchedules;
    
    // Events
    event TokensAllocated(address indexed user, uint256 amount, uint256 timestamp);
    event TokensReleased(address indexed user, uint256 amount, uint256 timestamp);
    event TokensSpentToWhitelist(address indexed user, address indexed destination, uint256 amount);
    event DestinationWhitelisted(address indexed destination, bool status);
    event VestingParametersUpdated(uint256 cliffDuration, uint256 vestingDuration);
    
    /**
     * @dev Constructor that initializes the contract with a token and sets up roles
     * @param _token The address of the YAP token contract
     */
    constructor(address _token) {
        token = YapToken(_token);
        
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(ALLOCATOR_ROLE, msg.sender);
        _grantRole(PAUSER_ROLE, msg.sender);
    }
    
    /**
     * @dev Allocate tokens to a user's vesting schedule
     * @param user The address to allocate tokens to
     * @param amount The amount of tokens to allocate
     * @return success Whether the allocation was successful
     */
    function allocate(address user, uint256 amount) 
        external 
        onlyRole(ALLOCATOR_ROLE) 
        whenNotPaused 
        returns (bool success) 
    {
        require(user != address(0), "VestingBucket: cannot allocate to zero address");
        require(amount > 0, "VestingBucket: amount must be greater than zero");
        
        VestingSchedule storage schedule = vestingSchedules[user];
        
        // Initialize or update the vesting schedule
        if (schedule.totalAmount == 0) {
            // New schedule - initialize
            schedule.startTimestamp = block.timestamp;
            schedule.lastAllocation = block.timestamp;
        } else {
            // Existing schedule - check if cliff should reset
            uint256 timeSinceLastAllocation = block.timestamp - schedule.lastAllocation;
            
            // Reset cliff if it's been too long since last allocation
            if (timeSinceLastAllocation > 7 days) {
                schedule.startTimestamp = block.timestamp;
            }
            
            schedule.lastAllocation = block.timestamp;
        }
        
        // Add tokens to vesting schedule
        schedule.totalAmount += amount;
        
        emit TokensAllocated(user, amount, block.timestamp);
        return true;
    }
    
    /**
     * @dev Release vested tokens to the user (transfers from this contract to user)
     * @return amount The amount released
     */
    function claim() external nonReentrant whenNotPaused returns (uint256 amount) {
        VestingSchedule storage schedule = vestingSchedules[msg.sender];
        
        // Calculate releasable amount
        uint256 releasable = releasableAmount(msg.sender);
        require(releasable > 0, "VestingBucket: no tokens are due for release");
        
        // Update released amount
        schedule.released += releasable;
        
        // Transfer tokens to user
        require(token.transfer(msg.sender, releasable), "VestingBucket: transfer failed");
        
        emit TokensReleased(msg.sender, releasable, block.timestamp);
        return releasable;
    }
    
    /**
     * @dev Spend tokens to whitelisted destination even if still locked
     * @param destination The whitelisted contract to spend tokens to
     * @param amount The amount of tokens to spend
     * @return success Whether the spend was successful
     */
    function spendToWhitelisted(address destination, uint256 amount) 
        external 
        nonReentrant 
        whenNotPaused 
        returns (bool success) 
    {
        require(whitelistedDestinations[destination], "VestingBucket: destination not whitelisted");
        require(amount > 0, "VestingBucket: amount must be greater than zero");
        
        VestingSchedule storage schedule = vestingSchedules[msg.sender];
        
        // Check that user has enough balance (locked or unlocked)
        uint256 availableBalance = schedule.totalAmount - schedule.released;
        require(availableBalance >= amount, "VestingBucket: insufficient balance");
        
        // Update released amount
        schedule.released += amount;
        
        // Transfer tokens to destination (typically a burn/redeem contract)
        require(token.transfer(destination, amount), "VestingBucket: transfer failed");
        
        emit TokensSpentToWhitelist(msg.sender, destination, amount);
        return true;
    }
    
    /**
     * @dev Called by the YapToken contract before any token transfer
     * @param from The sender address
     * @param to The recipient address
     * @param amount The transfer amount
     * @return allowed Whether the transfer is allowed
     */
    function beforeTransfer(address from, address to, uint256 amount) external view returns (bool allowed) {
        // Only the token contract should call this
        require(msg.sender == address(token), "VestingBucket: caller must be token contract");
        
        // Check if sender has enough unlocked tokens or is sending to a whitelisted destination
        if (whitelistedDestinations[to]) {
            return true;
        }
        
        // Calculate how many tokens are unlocked
        uint256 unlockedAmount = releasableAmount(from);
        
        // Allow transfer if it doesn't exceed unlocked amount
        return amount <= unlockedAmount;
    }
    
    /**
     * @dev Calculate amount that has vested and is ready to be released
     * @param user The user to check releasable amount for
     * @return amount The amount that can be released
     */
    function releasableAmount(address user) public view returns (uint256 amount) {
        VestingSchedule memory schedule = vestingSchedules[user];
        
        // Nothing to release if no tokens allocated
        if (schedule.totalAmount == 0) return 0;
        
        // Calculate total vested amount
        uint256 vested = vestedAmount(user);
        
        // Releasable = vested - already released
        return vested > schedule.released ? vested - schedule.released : 0;
    }
    
    /**
     * @dev Calculate how many tokens have vested so far
     * @param user The user to check vested amount for
     * @return amount The total vested amount
     */
    function vestedAmount(address user) public view returns (uint256 amount) {
        VestingSchedule memory schedule = vestingSchedules[user];
        
        // Nothing vested if no tokens or before cliff
        if (schedule.totalAmount == 0) return 0;
        
        // Handle cliff period
        if (block.timestamp < schedule.startTimestamp + cliffDuration) {
            return 0;
        }
        
        // After vesting period, everything is vested
        if (block.timestamp >= schedule.startTimestamp + cliffDuration + vestingDuration) {
            return schedule.totalAmount;
        }
        
        // During vesting period - linear release
        uint256 timeFromCliff = block.timestamp - (schedule.startTimestamp + cliffDuration);
        return schedule.totalAmount * timeFromCliff / vestingDuration;
    }
    
    /**
     * @dev Calculate locked amount (not yet vested)
     * @param user The user to check locked amount for
     * @return amount The amount still locked
     */
    function lockedAmount(address user) external view returns (uint256 amount) {
        VestingSchedule memory schedule = vestingSchedules[user];
        uint256 vested = vestedAmount(user);
        return schedule.totalAmount > vested ? schedule.totalAmount - vested : 0;
    }
    
    /**
     * @dev Get next release timestamp and amount for a user
     * @param user The user address
     * @return timestamp The next release timestamp (or 0 if fully vested)
     * @return amount The amount that will be released at that timestamp
     */
    function nextRelease(address user) external view returns (uint256 timestamp, uint256 amount) {
        VestingSchedule memory schedule = vestingSchedules[user];
        
        // Nothing to release if nothing allocated
        if (schedule.totalAmount == 0) return (0, 0);
        
        // Still in cliff period
        if (block.timestamp < schedule.startTimestamp + cliffDuration) {
            // Next release will be at cliff end
            timestamp = schedule.startTimestamp + cliffDuration;
            
            // Amount will be initial release after cliff
            amount = schedule.totalAmount * 1 days / vestingDuration;
            return (timestamp, amount);
        }
        
        // Past vesting period - nothing more to release
        if (block.timestamp >= schedule.startTimestamp + cliffDuration + vestingDuration) {
            return (0, 0);
        }
        
        // During vesting period - next release is tomorrow
        timestamp = block.timestamp + 1 days;
        
        // Calculate daily release amount
        amount = schedule.totalAmount * 1 days / vestingDuration;
        return (timestamp, amount);
    }
    
    // ========== ADMIN FUNCTIONS ==========
    
    /**
     * @dev Update vesting parameters (only affects new allocations)
     * @param _cliffDuration New cliff duration in seconds
     * @param _vestingDuration New vesting duration in seconds
     */
    function setVestingParameters(uint256 _cliffDuration, uint256 _vestingDuration) 
        external 
        onlyRole(DEFAULT_ADMIN_ROLE) 
    {
        require(_vestingDuration > 0, "VestingBucket: vesting duration must be greater than 0");
        
        cliffDuration = _cliffDuration;
        vestingDuration = _vestingDuration;
        
        emit VestingParametersUpdated(_cliffDuration, _vestingDuration);
    }
    
    /**
     * @dev Add or remove a destination to the whitelist
     * @param destination The destination address
     * @param whitelisted Whether the destination should be whitelisted
     */
    function setWhitelistedDestination(address destination, bool whitelisted) 
        external 
        onlyRole(DEFAULT_ADMIN_ROLE) 
    {
        require(destination != address(0), "VestingBucket: destination cannot be zero address");
        whitelistedDestinations[destination] = whitelisted;
        emit DestinationWhitelisted(destination, whitelisted);
    }
    
    /**
     * @dev Batch whitelist destinations
     * @param destinations Array of destination addresses
     * @param whitelisted Whether the destinations should be whitelisted
     */
    function batchSetWhitelistedDestinations(address[] calldata destinations, bool whitelisted) 
        external 
        onlyRole(DEFAULT_ADMIN_ROLE) 
    {
        for (uint256 i = 0; i < destinations.length; i++) {
            require(destinations[i] != address(0), "VestingBucket: destination cannot be zero address");
            whitelistedDestinations[destinations[i]] = whitelisted;
            emit DestinationWhitelisted(destinations[i], whitelisted);
        }
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
}