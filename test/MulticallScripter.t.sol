// SPDX-License-Identifier: GPL3
pragma solidity ^0.8.13;

import {Test, console} from "forge-std/Test.sol";
import {CallBuilder} from "src/CallBuilder.sol";
import {MulticallScripter} from "src/MulticallScripter.sol";

contract MulticallScriptTest is Test, CallBuilder, MulticallScripter {
    MulticallScripter multicall;

    SimpleReturn simpleReturn;
    DynamicReturn dynamicReturn;

    address[] targets;
    uint256[] offsets;
    bytes[] calldatas;
    uint256[] values;

    function setUp() public {
        multicall = new MulticallScripter();
        simpleReturn = new SimpleReturn();
        dynamicReturn = new DynamicReturn();
    }

    function test_use_static_call_data_simple() public {
        calldatas.push(abi.encodeWithSelector(SimpleReturn.getConstant.selector));
        calldatas.push(abi.encodeWithSelector(SimpleReturn.setUint.selector, 0x0));
        targets.push(address(simpleReturn));
        targets.push(address(simpleReturn));
        //  |currentOffset|<size><calldata><size><calldata>
        uint256 memTarget = 0x64; // save static call return data 2 words forward (to be used in next call)
        offsets.push(staticCall(memTarget, 0x20));
        offsets.push(call(0x0));

        multicall.execute(targets, offsets, calldatas, values);

        assertEq(simpleReturn.getUint(), 69);
    }

    function test_use_raw_data_simple() public {
        calldatas.push(abi.encodeWithSelector(SimpleReturn.setUint.selector, 0x420));
        targets.push(address(simpleReturn));
        offsets.push(call(0x0));

        multicall.execute(targets, offsets, calldatas, values);
        assertEq(simpleReturn.getUint(), 0x420);
    }

    function test_multiple_raw_data_simple() public {
        calldatas.push(abi.encodeWithSelector(SimpleReturn.setUint.selector, 0x420));
        calldatas.push(abi.encodeWithSelector(SimpleReturn.setUint.selector, 0x69));
        targets.push(address(simpleReturn));
        targets.push(address(simpleReturn));
        offsets.push(call(0x0));
        offsets.push(call(0x0));

        multicall.execute(targets, offsets, calldatas, values);
        assertEq(simpleReturn.getUint(), 0x69);
    }

    function test_raw_data_simple_value() public {
        calldatas.push(abi.encodeWithSelector(SimpleReturn.setUintValue.selector));
        targets.push(address(simpleReturn));
        offsets.push(call(0x1));
        values.push(0x420);

        multicall.execute{value: 0x420}(targets, offsets, calldatas, values);

        assertEq(simpleReturn.getUint(), 0x420);
    }

    function test_use_tuple_packed_data() public {
        // getTuplePackedConstant
        calldatas.push(abi.encodeWithSelector(DynamicReturn.getTuplePackedConstant.selector));
        targets.push(address(dynamicReturn));
        uint256 memTarget = 0x64; // add(0x20, add(4, encodedCalldataLen))
        offsets.push(staticCall(memTarget, 0x60)); // tuple is returned with each element padded to 32 bytes

        // setTuplePacked
        calldatas.push(abi.encodeWithSelector(DynamicReturn.setTuplePacked.selector, abi.encodePacked(uint256(0))));
        targets.push(address(dynamicReturn));
        offsets.push(call(0x0));

        multicall.execute(targets, offsets, calldatas, values);

        (uint128 a, uint64 b, uint64 c) = dynamicReturn.tuplePacked();
        assertEq(a, uint128(1));
        assertEq(b, uint64(2));
        assertEq(c, uint64(3));
    }

    function test_use_tuple_data() public {
        // getTupleConstant
        calldatas.push(abi.encodeWithSelector(DynamicReturn.getTupleConstant.selector));
        targets.push(address(dynamicReturn));
        uint256 memTarget = 0x64; // add(0x20, add(4, encodedCalldataLen))
        offsets.push(staticCall(memTarget, 0x60)); // tuple is returned with each element padded to 32 bytes

        // setTuple
        calldatas.push(abi.encodeWithSelector(DynamicReturn.setTuple.selector, abi.encodePacked(uint256(0))));
        targets.push(address(dynamicReturn));
        offsets.push(call(0x0));

        multicall.execute(targets, offsets, calldatas, values);

        (uint256 a, uint256 b, uint256 c) = dynamicReturn.tuple();
        assertEq(a, uint256(1));
        assertEq(b, uint256(2));
        assertEq(c, uint256(3));
    }
}

contract SimpleReturn {
    uint256 public a;

    // 0x4ef65c3b
    function setUint(uint256 _a) public {
        a = _a;
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
