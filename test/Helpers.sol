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

contract Structs {
    struct Complex {
        uint256 a;
        Static nested;
    }

    struct Static {
        uint256 nA;
        uint256 nB;
    }

    Complex complexStruct;

    function setComplexStruct(Complex calldata s) public {
        complexStruct = s;
    }

    function getComplexStruct() public view returns (Complex memory s) {
        s = complexStruct;
    }

    function getConstantStruct() public pure returns (Complex memory s) {
        Static memory _static = Static(200, 300);
        s = Complex(100, _static);
    }
}

contract DynamicVar {
    address[] addr;

    function setAddresses(address[] calldata s) public {
        addr = s;
    }

    function getAddresses() public view returns (address[] memory s) {
        s = addr;
    }

    function getConstantAddresses() public pure returns (address[] memory s) {
        s = new address[](3);
        s[0] = address(0xCAFE);
        s[1] = address(0xBEEF);
        s[2] = address(0xDEAD);
    }
}

contract ArrayElementAccess {
    uint256[] public numbers;
    address[] public addresses;
    
    // Array setters
    function setNumbers(uint256[] calldata _numbers) public { numbers = _numbers; }
    function setAddresses(address[] calldata _addresses) public { addresses = _addresses; }
    
    // Element getters (for testing partial returns)
    function getNumberAt(uint256 index) public view returns (uint256) {
        require(index < numbers.length, "Index out of bounds");
        return numbers[index];
    }
    
    function getAddressAt(uint256 index) public view returns (address) {
        require(index < addresses.length, "Index out of bounds");
        return addresses[index];
    }
    
    
    // Constant arrays for testing
    function getConstantNumbers() public pure returns (uint256[] memory) {
        uint256[] memory arr = new uint256[](3);
        arr[0] = 100;
        arr[1] = 200;
        arr[2] = 300;
        return arr;
    }
    
    function getConstantAddresses() public pure returns (address[] memory) {
        address[] memory arr = new address[](3);
        arr[0] = address(0x1111111111111111111111111111111111111111);
        arr[1] = address(0x2222222222222222222222222222222222222222);
        arr[2] = address(0x3333333333333333333333333333333333333333);
        return arr;
    }
    
    // Function that takes array elements as parameters
    function sumTwoNumbers(uint256 a, uint256 b) public pure returns (uint256) {
        return a + b;
    }
    
}

contract StringAndBytesOperations {
    string public text;
    bytes public dynamicBytes;
    
    // String operations
    function setText(string calldata _text) public { text = _text; }
    function getText() public view returns (string memory) { return text; }
    function getTextLength() public view returns (uint256) { return bytes(text).length; }
    
    // Bytes operations
    function setDynamicBytes(bytes calldata data) public { dynamicBytes = data; }
    function getDynamicBytes() public view returns (bytes memory) { return dynamicBytes; }
    function getBytesLength() public view returns (uint256) { return dynamicBytes.length; }
    
    // String manipulation
    function concatenateStrings(string calldata a, string calldata b) public pure returns (string memory) {
        return string(abi.encodePacked(a, b));
    }
    
    // Bytes manipulation
    function concatenateBytes(bytes calldata a, bytes calldata b) public pure returns (bytes memory) {
        return abi.encodePacked(a, b);
    }
    
    // Constant values for testing
    function getConstantString() public pure returns (string memory) {
        return "Hello, Multicall Scripting!";
    }
    
    function getConstantBytes() public pure returns (bytes memory) {
        return hex"deadbeefcafebabe1234567890abcdef";
    }
    
}
