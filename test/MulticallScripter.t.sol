// SPDX-License-Identifier: GPL3
pragma solidity ^0.8.28;

import {Test, console} from "forge-std/Test.sol";
import {CallBuilder, CallDecoder} from "src/CallBuilder.sol";
import {MulticallScripter} from "src/MulticallScripter.sol";
import {Math} from "./helpers/Math.sol";

contract MulticallScriptTest is Test, CallBuilder, MulticallScripter {
    MulticallScripter multicall;
    CallDecoder callDecoder;

    SimpleReturn simpleReturn;
    DynamicReturn dynamicReturn;
    Math math;

    address[] targets;
    uint256[] offsets;
    bytes[] calldatas;
    uint256[] values;

    // partial return types
    uint256[] memTargets;
    uint256[] resultLengths;
    uint256[] returnOffsets;

    function setUp() public {
        multicall = new MulticallScripter();
        simpleReturn = new SimpleReturn();
        dynamicReturn = new DynamicReturn();
        callDecoder = new CallDecoder();
        math = new Math();
    }

    function test_simple_usage_raw() public {
        calldatas.push(abi.encodeWithSelector(Math.add.selector, 2, 2));
        console.logBytes(calldatas[0]);
        targets.push(address(math));
        offsets.push(staticCall(0x24, 0x20));

        calldatas.push(abi.encodeWithSelector(Math.add.selector, 2, 0));
        console.logBytes(calldatas[1]);
        targets.push(address(math));
        offsets.push(staticCall(0x4, 0x20));

        calldatas.push(abi.encodeWithSelector(Math.setNum.selector, 0));
        targets.push(address(math));
        offsets.push(stateChangingCall(0x00));

        multicall.execute(targets, offsets, calldatas, values);

        // 2 + 2 => 4 + 2 => 6
        assertEq(math.number(), 6);
    }

    function test_use_static_call_data_simple() public {
        calldatas.push(abi.encodeWithSelector(SimpleReturn.getConstant.selector));
        calldatas.push(abi.encodeWithSelector(SimpleReturn.setUint.selector, 0x0));
        targets.push(address(simpleReturn));
        targets.push(address(simpleReturn));
        //  |currentOffset|<size><calldata><size><calldata>
        uint256 memTarget = 0x4; // save static call return data 2 words forward (to be used in next call)
        offsets.push(staticCall(memTarget, 0x20));
        offsets.push(stateChangingCall(0x0));

        multicall.execute(targets, offsets, calldatas, values);

        assertEq(simpleReturn.getUint(), 69);
    }

    function test_use_raw_data_simple() public {
        calldatas.push(abi.encodeWithSelector(SimpleReturn.setUint.selector, 0x420));
        targets.push(address(simpleReturn));
        offsets.push(stateChangingCall(0x0));

        multicall.execute(targets, offsets, calldatas, values);
        assertEq(simpleReturn.getUint(), 0x420);
    }

    function test_multiple_raw_data_simple() public {
        calldatas.push(abi.encodeWithSelector(SimpleReturn.setUint.selector, 0x420));
        calldatas.push(abi.encodeWithSelector(SimpleReturn.setUint.selector, 0x69));
        targets.push(address(simpleReturn));
        targets.push(address(simpleReturn));
        offsets.push(stateChangingCall(0x0));
        offsets.push(stateChangingCall(0x0));

        multicall.execute(targets, offsets, calldatas, values);
        assertEq(simpleReturn.getUint(), 0x69);
    }

    function test_raw_data_simple_value() public {
        calldatas.push(abi.encodeWithSelector(SimpleReturn.setUintValue.selector));
        targets.push(address(simpleReturn));
        offsets.push(stateChangingCall(0x1));
        values.push(0x420);

        multicall.execute{value: 0x420}(targets, offsets, calldatas, values);

        assertEq(simpleReturn.getUint(), 0x420);
    }

    function test_use_tuple_packed_data() public {
        // getTuplePackedConstant
        calldatas.push(abi.encodeWithSelector(DynamicReturn.getTuplePackedConstant.selector));
        targets.push(address(dynamicReturn));
        uint256 memTarget = 0x4; // add(0x20, add(4, encodedCalldataLen))
        offsets.push(staticCall(memTarget, 0x60)); // tuple is returned with each element padded to 32 bytes

        // setTuplePacked
        calldatas.push(abi.encodeWithSelector(DynamicReturn.setTuplePacked.selector, 0, 0, 0));
        targets.push(address(dynamicReturn));
        offsets.push(stateChangingCall(0x0));

        multicall.execute(targets, offsets, calldatas, values);

        (uint128 a, uint64 b, uint64 c) = dynamicReturn.tuplePacked();
        assertEq(a, uint128(1));
        assertEq(b, uint64(2));
        assertEq(c, uint64(3));
    }

    function test_set_tuple_raw() public {
        // set tuple to all max uints
        calldatas.push(
            abi.encodeWithSelector(
                DynamicReturn.setTuple.selector, type(uint256).max, type(uint256).max, type(uint256).max
            )
        );
        targets.push(address(dynamicReturn));
        offsets.push(stateChangingCall(0x0));

        multicall.execute(targets, offsets, calldatas, values);

        (uint256 a, uint256 b, uint256 c) = dynamicReturn.tuple();
        assertEq(a, type(uint256).max);
        assertEq(b, type(uint256).max);
        assertEq(c, type(uint256).max);
    }

    function test_use_tuple_data() public {
        // getTupleConstant
        calldatas.push(abi.encodeWithSelector(DynamicReturn.getTupleConstant.selector));
        targets.push(address(dynamicReturn));
        uint256 memTarget = 0x4; // add(0x20, add(4, encodedCalldataLen))
        offsets.push(staticCall(memTarget, 0x60)); // tuple is returned with each element padded to 32 bytes

        // setTuple
        calldatas.push(abi.encodeWithSelector(DynamicReturn.setTuple.selector, 0, 0, 0));
        targets.push(address(dynamicReturn));
        offsets.push(stateChangingCall(0x0));

        multicall.execute(targets, offsets, calldatas, values);

        (uint256 a, uint256 b, uint256 c) = dynamicReturn.tuple();
        assertEq(a, uint256(1));
        assertEq(b, uint256(2));
        assertEq(c, uint256(3));
    }

    function test_partial_return_data() public {
        // set tuple(max, max, max) -> get_tuple_constants -> (1, 2, 3) -> setTuple(1, max, 3)

        // set_tuple(max, max, max)
        bytes memory set_tuple_first_calldata = abi.encodeWithSelector(
            DynamicReturn.setTuple.selector, type(uint256).max, type(uint256).max, type(uint256).max
        );

        // get tuple constants() -> (1, 2, 3)
        bytes memory partial_return_static_call = abi.encodeWithSelector(DynamicReturn.getTupleConstant.selector);

        // set_tuple(1, max, 3)
        bytes memory set_tuple_second_calldata =
            abi.encodeWithSelector(DynamicReturn.setTuple.selector, uint256(0), type(uint256).max, uint256(0));

        // ================set_tuple=======================
        // call and pass along the calldata with 0x0 msg.value
        calldatas.push(set_tuple_first_calldata);
        targets.push(address(dynamicReturn));
        offsets.push(stateChangingCall(0x0));

        // ===============get_tuple_constants=======================
        calldatas.push(partial_return_static_call);
        targets.push(address(dynamicReturn));

        uint256 next_call_data_start = set_tuple_second_calldata.length - 0x60;
        /* 
          parameters are stored in sequence, but if it is bytes the value is a pointer to the byte array
          <4byte_selector><tuple_data_offset><tuple_length><item0><item1><item2>
        */

        // all calldata minus 3 variables of 0x20 bytes each

        memTargets.push(next_call_data_start); // pos 0
        memTargets.push(next_call_data_start + 0x40); // pos 3
        returnOffsets.push(0x0);
        returnOffsets.push(0x40);
        resultLengths.push(0x20);
        resultLengths.push(0x20);
        offsets.push(staticCallPartialReturn(memTargets, resultLengths, returnOffsets, 0x60));

        // ==================set_tuple=================================
        calldatas.push(set_tuple_second_calldata);
        targets.push(address(dynamicReturn));
        offsets.push(stateChangingCall(0x0));

        // ===================execute=================================
        multicall.execute(targets, offsets, calldatas, values);

        (uint256 a, uint256 b, uint256 c) = dynamicReturn.tuple();
        assertEq(a, 1);
        assertEq(b, type(uint256).max);
        assertEq(c, 3);
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
