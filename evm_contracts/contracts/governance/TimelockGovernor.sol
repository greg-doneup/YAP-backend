// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/governance/TimelockController.sol";

/**
 * @title TimelockGovernor
 * @dev Implements a timelock mechanism for parameter changes with a 24-hour delay
 * This ensures critical parameters can't be changed immediately and gives the community
 * time to observe pending changes.
 */
contract TimelockGovernor is TimelockController {
    /**
     * @dev Constructor that sets up the contract with a 24-hour delay
     * @param proposers Array of addresses that can propose actions
     * @param executors Array of addresses that can execute actions
     * @param admin Address that will be granted admin role
     */
    constructor(
        address[] memory proposers,
        address[] memory executors,
        address admin
    ) TimelockController(
        24 hours,  // 24 hour timelock delay
        proposers,
        executors,
        admin
    ) {}
}