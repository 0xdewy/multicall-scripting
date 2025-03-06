// SPDX-License-Identifier: MIT
pragma solidity ^0.8.11;

contract Math {
    uint256 public number;

    function add(uint256 a, uint256 b) public pure returns (uint256) {
        return a + b;
    }

    function setNum(uint256 a) public {
        number = a;
    }
}
