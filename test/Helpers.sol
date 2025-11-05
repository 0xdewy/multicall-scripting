// SPDX-License-Identifier: MIT
pragma solidity ^0.8.11;

contract Math {
    uint256 public number;

    function add(uint256 a, uint256 b) public pure returns (uint256) {
        unchecked {
            return a + b;
        }
    }

    function setNum(uint256 a) public {
        number = a;
    }
}

contract Events {
    event LogUint(uint256 value);
    event Paid(uint256 value);
    event LogAddress(address addr);

    function logUint(uint256 value) public {
        emit LogUint(value);
    }

    function logAddress(address addr) public {
        emit LogAddress(addr);
    }
}

contract Fuzzy {
    bytes public state;
    bytes public state2;
    bool public booool;

    function changeState(bytes calldata b) public returns (bool) {
        state2 = state;
        state = b;
        return state.length != state2.length;
    }

    function getState() public view returns (bytes memory) {
        return state;
    }

    function setBool(bool a) public {
        booool = a;
    }
}

contract SimpleReturn {
    uint256 public a;

    // 0x4ef65c3b
    function setUint(uint256 _a) public returns (uint256) {
        a = _a;
        return a;
    }

    // 0x68f47707
    function setUintValue() public payable {
        a = msg.value;
    }

    // 0x000267a4
    function getUint() public view returns (uint256) {
        return a;
    }

    // 0xf13a38a6
    function getConstant() public pure returns (uint64) {
        return uint64(69);
    }
}

contract DynamicReturn {
    struct TuplePacked {
        uint128 a;
        uint64 b;
        uint64 c;
    }

    struct Tuple {
        uint256 a;
        uint256 b;
        uint256 c;
    }

    TuplePacked public tuplePacked;

    Tuple public tuple;

    function setTuple(uint256 a, uint256 b, uint256 c) public {
        tuple = Tuple(a, b, c);
    }

    function getTupleConstant() public pure returns (Tuple memory) {
        return Tuple(1, 2, 3);
    }

    function setTuplePacked(uint128 a, uint64 b, uint64 c) public {
        tuplePacked = TuplePacked(a, b, c);
    }

    function getTuplePackedConstant() public pure returns (TuplePacked memory) {
        return TuplePacked(1, 2, 3);
    }
}
