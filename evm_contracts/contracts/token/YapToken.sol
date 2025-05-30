// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * @title YAPToken
 * @dev ERC-20 token with role-based minting, burning, pausing, and transfer-lock hooks.
 * Implements ERC20Permit for gasless approvals to enhance mobile UX.
 */
contract YAPToken is ERC20Permit, AccessControl, Pausable {
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant BURNER_ROLE = keccak256("BURNER_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    
    address public vestingBucket;

    event VestingBucketSet(address indexed vestingBucket);

    /**
     * @dev Constructor that sets up roles and initializes the token
     * with name "YAP Token" and symbol "YAP"
     */
    constructor() ERC20("YAP Token", "YAP") ERC20Permit("YAP Token") {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(MINTER_ROLE, msg.sender);
        _grantRole(BURNER_ROLE, msg.sender);
        _grantRole(PAUSER_ROLE, msg.sender);
    }
    
    /**
     * @dev Set the VestingBucket address for transfer lock checking
     * @param _vestingBucket Address of the VestingBucket contract
     */
    function setVestingBucket(address _vestingBucket) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_vestingBucket != address(0), "YAPToken: vesting bucket cannot be zero address");
        vestingBucket = _vestingBucket;
        emit VestingBucketSet(_vestingBucket);
    }

    /**
     * @dev Creates `amount` tokens and assigns them to `to`, increasing the total supply.
     * Can only be called by accounts with the MINTER_ROLE.
     * 
     * @param to The address to mint tokens to
     * @param amount The amount of tokens to mint
     */
    function mint(address to, uint256 amount) public onlyRole(MINTER_ROLE) {
        _mint(to, amount);
    }
    
    /**
     * @dev Destroys `amount` tokens from `from`, reducing the total supply.
     * Can only be called by accounts with the BURNER_ROLE.
     * 
     * @param from The address to burn tokens from
     * @param amount The amount of tokens to burn
     */
    function burn(address from, uint256 amount) public onlyRole(BURNER_ROLE) {
        _burn(from, amount);
    }
    
    /**
     * @dev Pauses all token transfers.
     * Can only be called by accounts with the PAUSER_ROLE.
     */
    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }
    
    /**
     * @dev Unpauses all token transfers.
     * Can only be called by accounts with the PAUSER_ROLE.
     */
    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    /**
     * @dev Hook that is called before any transfer of tokens including mint and burn.
     * Enforces VestingBucket transfer locks when applicable.
     */
    function _beforeTokenTransfer(
        address from, 
        address to, 
        uint256 amount
    ) internal override whenNotPaused {
        super._beforeTokenTransfer(from, to, amount);
        
        // Skip vesting check for minting and burning operations
        if (from == address(0) || to == address(0)) return;
        
        // Skip if VestingBucket not set yet
        if (vestingBucket == address(0)) return;
        
        // Check with VestingBucket if the transfer is allowed
        // solhint-disable-next-line avoid-low-level-calls
        (bool success, bytes memory data) = vestingBucket.call(
            abi.encodeWithSignature("beforeTransfer(address,address,uint256)", from, to, amount)
        );
        
        require(
            success && abi.decode(data, (bool)),
            "YAPToken: transfer lock active or destination not whitelisted"
        );
    }
}