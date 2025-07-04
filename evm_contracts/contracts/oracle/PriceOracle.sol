// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

/**
 * @title PriceOracle
 * @dev Provides real-time YAP/USD price feeds for the Token Cost Matrix
 * Supports multiple oracle sources with fallback mechanisms
 */
contract PriceOracle is AccessControl, Pausable {
    bytes32 public constant ORACLE_UPDATER_ROLE = keccak256("ORACLE_UPDATER_ROLE");
    bytes32 public constant EMERGENCY_ROLE = keccak256("EMERGENCY_ROLE");
    
    // Price data structure
    struct PriceData {
        uint256 price;      // YAP price in USD with 18 decimal precision
        uint256 timestamp;  // When this price was last updated
        bool isValid;       // Whether this price source is currently valid
    }
    
    // Multiple oracle sources for redundancy
    mapping(address => PriceData) public oracleSources;
    address[] public oracleAddresses;
    
    // Current active price
    uint256 public currentPrice;
    uint256 public lastUpdateTimestamp;
    
    // Price validation parameters
    uint256 public maxPriceAge = 3600; // 1 hour in seconds
    uint256 public minPrice = 1e15;    // $0.001 minimum (prevents manipulation)
    uint256 public maxPrice = 1e21;    // $1000 maximum (prevents manipulation)
    uint256 public maxPriceDeviation = 500; // 5% maximum deviation between sources (basis points)
    
    // Fallback price for emergencies
    uint256 public fallbackPrice = 5e16; // $0.05 default (matches matrix base cost)
    bool public useFallbackPrice = false;
    
    // Events
    event PriceUpdated(address indexed oracle, uint256 oldPrice, uint256 newPrice, uint256 timestamp);
    event OracleAdded(address indexed oracle);
    event OracleRemoved(address indexed oracle);
    event FallbackActivated(uint256 price, string reason);
    event FallbackDeactivated();
    event PriceValidationFailed(address indexed oracle, uint256 price, string reason);
    
    /**
     * @dev Constructor sets up the price oracle
     */
    constructor() {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(ORACLE_UPDATER_ROLE, msg.sender);
        _grantRole(EMERGENCY_ROLE, msg.sender);
        
        // Initialize with fallback price
        currentPrice = fallbackPrice;
        lastUpdateTimestamp = block.timestamp;
    }
    
    /**
     * @dev Get current YAP price in USD
     * @return price Current YAP price with 18 decimal precision
     * @return timestamp When this price was last updated
     * @return isValid Whether the price is considered valid and recent
     */
    function getYAPPriceUSD() external view returns (uint256 price, uint256 timestamp, bool isValid) {
        if (useFallbackPrice) {
            return (fallbackPrice, block.timestamp, true);
        }
        
        bool priceIsRecent = (block.timestamp - lastUpdateTimestamp) <= maxPriceAge;
        return (currentPrice, lastUpdateTimestamp, priceIsRecent);
    }
    
    /**
     * @dev Update price from an authorized oracle source
     * @param newPrice New YAP price in USD (18 decimal precision)
     */
    function updatePrice(uint256 newPrice) external onlyRole(ORACLE_UPDATER_ROLE) whenNotPaused {
        require(newPrice >= minPrice && newPrice <= maxPrice, "PriceOracle: price out of valid range");
        
        address oracle = msg.sender;
        uint256 oldPrice = oracleSources[oracle].price;
        
        // Validate price deviation if we have existing data
        if (currentPrice > 0 && !useFallbackPrice) {
            uint256 deviation = _calculateDeviation(currentPrice, newPrice);
            if (deviation > maxPriceDeviation) {
                emit PriceValidationFailed(oracle, newPrice, "excessive deviation");
                return;
            }
        }
        
        // Update oracle source data
        oracleSources[oracle] = PriceData({
            price: newPrice,
            timestamp: block.timestamp,
            isValid: true
        });
        
        // Recalculate current price from all valid sources
        _updateCurrentPrice();
        
        emit PriceUpdated(oracle, oldPrice, newPrice, block.timestamp);
    }
    
    /**
     * @dev Add a new oracle source
     * @param oracle Address of the oracle source
     */
    function addOracle(address oracle) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(oracle != address(0), "PriceOracle: oracle cannot be zero address");
        require(!_isOracleExists(oracle), "PriceOracle: oracle already exists");
        
        oracleAddresses.push(oracle);
        _grantRole(ORACLE_UPDATER_ROLE, oracle);
        
        emit OracleAdded(oracle);
    }
    
    /**
     * @dev Remove an oracle source
     * @param oracle Address of the oracle source to remove
     */
    function removeOracle(address oracle) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_isOracleExists(oracle), "PriceOracle: oracle does not exist");
        
        // Remove from array
        for (uint256 i = 0; i < oracleAddresses.length; i++) {
            if (oracleAddresses[i] == oracle) {
                oracleAddresses[i] = oracleAddresses[oracleAddresses.length - 1];
                oracleAddresses.pop();
                break;
            }
        }
        
        // Invalidate oracle data
        oracleSources[oracle].isValid = false;
        
        // Revoke role
        _revokeRole(ORACLE_UPDATER_ROLE, oracle);
        
        // Recalculate current price
        _updateCurrentPrice();
        
        emit OracleRemoved(oracle);
    }
    
    /**
     * @dev Activate fallback price (emergency use)
     * @param reason Reason for activating fallback
     */
    function activateFallback(string calldata reason) external onlyRole(EMERGENCY_ROLE) {
        useFallbackPrice = true;
        emit FallbackActivated(fallbackPrice, reason);
    }
    
    /**
     * @dev Deactivate fallback price
     */
    function deactivateFallback() external onlyRole(EMERGENCY_ROLE) {
        useFallbackPrice = false;
        _updateCurrentPrice();
        emit FallbackDeactivated();
    }
    
    /**
     * @dev Update fallback price
     * @param newFallbackPrice New fallback price
     */
    function updateFallbackPrice(uint256 newFallbackPrice) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(newFallbackPrice >= minPrice && newFallbackPrice <= maxPrice, "PriceOracle: invalid fallback price");
        fallbackPrice = newFallbackPrice;
    }
    
    /**
     * @dev Update price validation parameters
     * @param _maxPriceAge Maximum age for price data (seconds)
     * @param _maxPriceDeviation Maximum allowed deviation between sources (basis points)
     */
    function updateValidationParams(
        uint256 _maxPriceAge,
        uint256 _maxPriceDeviation
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_maxPriceAge > 0, "PriceOracle: max age must be positive");
        require(_maxPriceDeviation <= 10000, "PriceOracle: deviation cannot exceed 100%");
        
        maxPriceAge = _maxPriceAge;
        maxPriceDeviation = _maxPriceDeviation;
    }
    
    /**
     * @dev Update price range limits
     * @param _minPrice Minimum allowed price
     * @param _maxPrice Maximum allowed price
     */
    function updatePriceRange(uint256 _minPrice, uint256 _maxPrice) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_minPrice > 0, "PriceOracle: min price must be positive");
        require(_maxPrice > _minPrice, "PriceOracle: max price must be greater than min");
        
        minPrice = _minPrice;
        maxPrice = _maxPrice;
    }
    
    /**
     * @dev Get all oracle addresses
     * @return addresses Array of oracle addresses
     */
    function getOracleAddresses() external view returns (address[] memory addresses) {
        return oracleAddresses;
    }
    
    /**
     * @dev Get oracle data for a specific address
     * @param oracle Oracle address
     * @return priceData Price data for this oracle
     */
    function getOracleData(address oracle) external view returns (PriceData memory priceData) {
        return oracleSources[oracle];
    }
    
    /**
     * @dev Check if system is healthy (has recent, valid price data)
     * @return healthy True if system is operating normally
     * @return activeOracles Number of oracles with recent, valid data
     */
    function getSystemHealth() external view returns (bool healthy, uint256 activeOracles) {
        if (useFallbackPrice) {
            return (true, 0); // Fallback mode is considered "healthy" but not ideal
        }
        
        uint256 validOracles = 0;
        for (uint256 i = 0; i < oracleAddresses.length; i++) {
            PriceData memory data = oracleSources[oracleAddresses[i]];
            if (data.isValid && (block.timestamp - data.timestamp) <= maxPriceAge) {
                validOracles++;
            }
        }
        
        bool systemHealthy = validOracles > 0 && (block.timestamp - lastUpdateTimestamp) <= maxPriceAge;
        return (systemHealthy, validOracles);
    }
    
    /**
     * @dev Pause the oracle (emergency use)
     */
    function pause() external onlyRole(EMERGENCY_ROLE) {
        _pause();
    }
    
    /**
     * @dev Unpause the oracle
     */
    function unpause() external onlyRole(EMERGENCY_ROLE) {
        _unpause();
    }
    
    /**
     * @dev Update current price based on all valid oracle sources
     */
    function _updateCurrentPrice() private {
        if (useFallbackPrice) {
            return;
        }
        
        uint256 totalPrice = 0;
        uint256 validSources = 0;
        
        // Aggregate prices from all valid, recent sources
        for (uint256 i = 0; i < oracleAddresses.length; i++) {
            PriceData memory data = oracleSources[oracleAddresses[i]];
            
            if (data.isValid && (block.timestamp - data.timestamp) <= maxPriceAge) {
                totalPrice += data.price;
                validSources++;
            }
        }
        
        if (validSources > 0) {
            currentPrice = totalPrice / validSources; // Simple average
            lastUpdateTimestamp = block.timestamp;
        }
    }
    
    /**
     * @dev Calculate percentage deviation between two prices
     * @param price1 First price
     * @param price2 Second price
     * @return deviation Deviation in basis points (1% = 100 basis points)
     */
    function _calculateDeviation(uint256 price1, uint256 price2) private pure returns (uint256 deviation) {
        uint256 diff = price1 > price2 ? price1 - price2 : price2 - price1;
        return (diff * 10000) / price1; // Convert to basis points
    }
    
    /**
     * @dev Check if oracle address already exists
     * @param oracle Oracle address to check
     * @return exists True if oracle exists
     */
    function _isOracleExists(address oracle) private view returns (bool exists) {
        for (uint256 i = 0; i < oracleAddresses.length; i++) {
            if (oracleAddresses[i] == oracle) {
                return true;
            }
        }
        return false;
    }
}
