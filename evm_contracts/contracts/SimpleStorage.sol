// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract SimpleStorage {
    uint private _value;
    
    function store(uint value) public {
        _value = value;
    }
    
    function retrieve() public view returns (uint) {
        return _value;
    }
}