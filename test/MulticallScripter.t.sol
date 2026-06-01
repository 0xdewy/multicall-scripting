// SPDX-License-Identifier: GPL3
pragma solidity ^0.8.28;

import {Test, console} from "forge-std/Test.sol";
import {CallBuilder, CallDecoder} from "src/CallBuilder.sol";
import {MulticallScripter} from "src/MulticallScripter.sol";
import {Math, SimpleReturn, DynamicReturn, Fuzzy, CalldataVerifier} from "./Helpers.sol";

contract MulticallScriptTest is Test, CallBuilder, MulticallScripter {
    MulticallScripter multicall;
    CallDecoder callDecoder;

    SimpleReturn simpleReturn;
    DynamicReturn dynamicReturn;
    Math math;
    Fuzzy fuzzy;

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
        fuzzy = new Fuzzy();
    }

    function test_simple_usage_raw() public {
        // x = math.add(2,2)
        calldatas.push(abi.encodeWithSelector(Math.add.selector, 2, 2));
        targets.push(address(math));
        // store output of static call 36 bytes ahead in call chain as second param of following math.add(a,b)
        // <this_call><add_fn_selector><first_param><second_param>
        offsets.push(staticCall(0x24, 0x20));

        // y = math.add(2, x)
        calldatas.push(abi.encodeWithSelector(Math.add.selector, 2, 0));
        targets.push(address(math));
        // next param offset is 4bytes + 32bytes (32==0x20)
        offsets.push(staticCall(0x4, 0x20));

        // math.setNum(y)
        calldatas.push(abi.encodeWithSelector(Math.setNum.selector, 0));
        targets.push(address(math));
        offsets.push(stateChangingCall());

        // execute calls
        multicall.execute(targets, offsets, calldatas, values);
        // 2 + 2 => 4 + 2 => 6
        assertEq(math.number(), 6, "failed to add numbers");
    }

    function test_use_static_call_data_simple() public {
        calldatas.push(abi.encodeWithSelector(SimpleReturn.getConstant.selector));
        calldatas.push(abi.encodeWithSelector(SimpleReturn.setUint.selector, 0x0));
        targets.push(address(simpleReturn));
        targets.push(address(simpleReturn));
        uint256 memTarget = 0x4;
        offsets.push(staticCall(memTarget, 0x20));
        offsets.push(stateChangingCall());

        multicall.execute(targets, offsets, calldatas, values);

        assertEq(simpleReturn.getUint(), 69);
    }

    function test_fuzz_simple_set_and_get(uint256 set) public {
        calldatas.push(abi.encodeWithSelector(SimpleReturn.setUint.selector, set));
        targets.push(address(simpleReturn));
        offsets.push(stateChangingCall());

        multicall.execute(targets, offsets, calldatas, values);

        assertEq(simpleReturn.getUint(), set);
    }

    function test_use_state_changing_call_return(uint256 val, uint256 val2) public {
        // x = setUint(val)
        calldatas.push(abi.encodeWithSelector(SimpleReturn.setUint.selector, val));
        targets.push(address(simpleReturn));
        offsets.push(stateChangingCall(0x0, 0x4, 0x20));

        // y = math.add(x, 2)
        calldatas.push(abi.encodeWithSelector(Math.add.selector, 0x4, val2));
        targets.push(address(math));
        offsets.push(staticCall(0x4, 0x20));

        // setUint(y)
        calldatas.push(abi.encodeWithSelector(SimpleReturn.setUint.selector, 0x0));
        targets.push(address(simpleReturn));
        offsets.push(stateChangingCall());

        multicall.execute(targets, offsets, calldatas, values);

        uint256 res;
        unchecked {
            res = val + val2;
        }

        assertEq(simpleReturn.getUint(), res);
    }

    function test_use_raw_data_simple() public {
        calldatas.push(abi.encodeWithSelector(SimpleReturn.setUint.selector, 0x420));
        targets.push(address(simpleReturn));
        offsets.push(stateChangingCall());

        multicall.execute(targets, offsets, calldatas, values);
        assertEq(simpleReturn.getUint(), 0x420);
    }

    function test_multiple_raw_data_simple() public {
        calldatas.push(abi.encodeWithSelector(SimpleReturn.setUint.selector, 0x420));
        calldatas.push(abi.encodeWithSelector(SimpleReturn.setUint.selector, 0x69));
        targets.push(address(simpleReturn));
        targets.push(address(simpleReturn));
        offsets.push(stateChangingCall());
        offsets.push(stateChangingCall());

        multicall.execute(targets, offsets, calldatas, values);
        assertEq(simpleReturn.getUint(), 0x69);
    }

    function test_raw_data_multiple_values() public {
        calldatas.push(abi.encodeWithSelector(SimpleReturn.setUintValue.selector));
        targets.push(address(simpleReturn));
        offsets.push(stateChangingCall(0x1));
        values.push(1);

        calldatas.push(abi.encodeWithSelector(SimpleReturn.setUintValue.selector));
        targets.push(address(simpleReturn));
        offsets.push(stateChangingCall(0x2));
        values.push(69e18);

        // send exact amount
        multicall.execute{value: 69e18 + 1}(targets, offsets, calldatas, values);
        assertEq(simpleReturn.getUint(), 69e18);
        assertEq(address(simpleReturn).balance, 69e18 + 1);

        // Run calls again but finish with first value
        calldatas.push(abi.encodeWithSelector(SimpleReturn.setUintValue.selector));
        targets.push(address(simpleReturn));
        offsets.push(stateChangingCall(0x1));

        // Send too much and make sure the rest is returned
        multicall.execute{value: 100e18}(targets, offsets, calldatas, values);

        assertEq(simpleReturn.getUint(), 1);
        assertEq(address(simpleReturn).balance, (69e18 + 1) * 2 + 1);
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
        offsets.push(stateChangingCall());

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
        offsets.push(stateChangingCall());

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
        offsets.push(stateChangingCall());

        multicall.execute(targets, offsets, calldatas, values);

        (uint256 a, uint256 b, uint256 c) = dynamicReturn.tuple();
        assertEq(a, uint256(1));
        assertEq(b, uint256(2));
        assertEq(c, uint256(3));
    }

    // set tuple(max, max, max) -> get_tuple_constants -> (1, 2, 3) -> setTuple(1, max, 3)
    function test_partial_return_data() public {
        // set_tuple(max, max, max)
        bytes memory set_tuple_first_calldata = abi.encodeWithSelector(
            DynamicReturn.setTuple.selector, type(uint256).max, type(uint256).max, type(uint256).max
        );
        // get tuple constants() -> (1, 2, 3)
        bytes memory partial_return_static_call = abi.encodeWithSelector(DynamicReturn.getTupleConstant.selector);
        // set_tuple(1, max, 3)
        bytes memory set_tuple_second_calldata =
            abi.encodeWithSelector(DynamicReturn.setTuple.selector, uint256(0), type(uint256).max, uint256(0));

        // ===============set_tuple=======================
        calldatas.push(set_tuple_first_calldata);
        targets.push(address(dynamicReturn));
        offsets.push(stateChangingCall());

        // ===============get_tuple_constants=======================
        calldatas.push(partial_return_static_call);
        targets.push(address(dynamicReturn));

        // 3 parameters from the last parameter
        //  <4byte_selector><tuple_data_offset><tuple_length><item0><item1><item2>
        uint256 next_call_data_start = set_tuple_second_calldata.length - 0x60;
        assertEq(next_call_data_start, 0x04);

        // where in next call to use
        memTargets.push(0x04); // pos 1
        memTargets.push(0x04 + 0x40); // pos 3
        // where in current call to fetch data
        returnOffsets.push(0x0); // first item
        returnOffsets.push(0x40); // third item
        resultLengths.push(0x20); // uint256
        resultLengths.push(0x20); // uint256
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

    // changeState(startData) -> returns true
    // x = changeState(startData) -> returns false
    // setBool(x)
    function test_fuzz_bytes(bytes calldata startData) public {
        calldatas.push(abi.encodeWithSelector(Fuzzy.changeState.selector, startData));
        targets.push(address(fuzzy));
        offsets.push(stateChangingCall()); // tuple is returned with each element padded to 32 bytes

        calldatas.push(abi.encodeWithSelector(Fuzzy.getState.selector));
        targets.push(address(fuzzy));
        offsets.push(staticCall(0x04, startData.length)); // tuple is returned with each element padded to 32 bytes

        calldatas.push(abi.encodeWithSelector(Fuzzy.changeState.selector, startData));
        targets.push(address(fuzzy));
        offsets.push(stateChangingCall(0x0, 0x04, 0x20)); // tuple is returned with each element padded to 32 bytes

        calldatas.push(abi.encodeWithSelector(Fuzzy.setBool.selector, 0x0));
        targets.push(address(fuzzy));
        offsets.push(stateChangingCall());

        multicall.execute(targets, offsets, calldatas, values);

        assertEq(fuzzy.getState(), startData);
        assertEq(fuzzy.booool(), false);
    }

    function test_fuzz_bytes_alt(bytes calldata startData) public {
        calldatas.push(abi.encodeWithSelector(Fuzzy.changeState.selector, startData));
        targets.push(address(fuzzy));
        offsets.push(stateChangingCall()); // tuple is returned with each element padded to 32 bytes

        bytes memory newData = abi.encodeWithSignature("randomsignature(uint)", 0x69);

        while (newData.length == startData.length) {
            newData = abi.encode(newData, startData);
        }

        calldatas.push(abi.encodeWithSelector(Fuzzy.changeState.selector, newData));
        targets.push(address(fuzzy));
        offsets.push(stateChangingCall(0x0, 0x04, 0x20)); // tuple is returned with each element padded to 32 bytes

        calldatas.push(abi.encodeWithSelector(Fuzzy.setBool.selector, 0x0));
        targets.push(address(fuzzy));
        offsets.push(stateChangingCall());

        multicall.execute(targets, offsets, calldatas, values);

        assertEq(fuzzy.getState(), newData);
        assertEq(fuzzy.booool(), true);
    }

    function test_empty_batch() public {
        multicall.execute(targets, offsets, calldatas, values);
        // just verifying no revert on empty arrays
    }

    function test_single_call_batch() public {
        calldatas.push(abi.encodeWithSelector(SimpleReturn.setUint.selector, 42));
        targets.push(address(simpleReturn));
        offsets.push(stateChangingCall());

        multicall.execute(targets, offsets, calldatas, values);

        assertEq(simpleReturn.getUint(), 42);
    }

    function test_invalid_calltype_reverts() public {
        calldatas.push(abi.encodeWithSelector(SimpleReturn.setUint.selector, 42));
        targets.push(address(simpleReturn));
        // offset with calltype 0x00 (no known flag matches)
        offsets.push(0x00);
        values.push(0);

        // The raw assembly revert mstores 0x8f61746f as a right-aligned 32-byte value
        bytes memory expected = hex"000000000000000000000000000000000000000000000000000000008f61746f";
        vm.expectRevert(expected);
        multicall.execute(targets, offsets, calldatas, values);
    }

    function test_partial_return_max_size() public {
        // Test that staticCallPartialReturn accepts max uint16 value
        memTargets.push(0x04);
        resultLengths.push(0x20);
        returnOffsets.push(0x00);
        offsets.push(staticCallPartialReturn(memTargets, resultLengths, returnOffsets, type(uint16).max));

        calldatas.push(abi.encodeWithSelector(SimpleReturn.getConstant.selector));
        targets.push(address(simpleReturn));
        values.push(0);

        calldatas.push(abi.encodeWithSelector(SimpleReturn.setUint.selector, 0));
        targets.push(address(simpleReturn));
        offsets.push(stateChangingCall());
        values.push(0);

        multicall.execute(targets, offsets, calldatas, values);

        assertEq(simpleReturn.getUint(), 69);
    }

    // simpleReturn.setUint(99) → state-changing, returns 99 via 0xFB path → math.setNum(<99>)
    function test_call_partial_return() public {
        // setUint(99): CALL_PARTIAL_RETURN_FLAG; memTarget=0x4 (first param of next call), returnDataSize=0x20
        memTargets.push(0x04);
        resultLengths.push(0x20);
        returnOffsets.push(0x00);
        uint256 cpOffset = callPartialReturn(0, memTargets, resultLengths, returnOffsets, 0x20);

        calldatas.push(abi.encodeWithSelector(SimpleReturn.setUint.selector, 99));
        targets.push(address(simpleReturn));
        offsets.push(cpOffset);

        // math.setNum(0) — placeholder; will be overwritten with 99 via mcopy
        calldatas.push(abi.encodeWithSelector(Math.setNum.selector, uint256(0)));
        targets.push(address(math));
        offsets.push(stateChangingCall());

        multicall.execute(targets, offsets, calldatas, values);

        assertEq(math.number(), 99);
    }

    // Test that returnLength > uint16 max is rejected by CallBuilder.staticCallPartialReturn
    function test_partial_return_overflow() public {
        PartialReturnTestWrapper wrapper = new PartialReturnTestWrapper();
        vm.expectRevert(bytes("returnLength is too large"));
        wrapper.externalStaticCallPartialReturn(
            _toUintArray(1, 0x04),
            _toUintArray(1, 0x20),
            _toUintArray(1, 0x00),
            uint256(type(uint16).max) + 1
        );
    }

    function test_partial_return_boundary() public {
        PartialReturnTestWrapper wrapper = new PartialReturnTestWrapper();
        uint256 offset = wrapper.externalStaticCallPartialReturn(
            _toUintArray(1, 0x04),
            _toUintArray(1, 0x20),
            _toUintArray(1, 0x00),
            uint256(type(uint16).max)
        );
        assertTrue(offset != 0, "should produce a valid offset");
    }

    function _toUintArray(uint256 len, uint256 value) private pure returns (uint256[] memory arr) {
        arr = new uint256[](len);
        for (uint256 i = 0; i < len; i++) {
            arr[i] = value;
        }
    }

    // Fuzz: staticCallPartialReturn with randomized valid inputs
    function test_fuzz_partialReturn(
        uint40 memTarget1,
        uint40 memTarget2,
        uint40 memTarget3,
        uint16 resultLength1,
        uint16 resultLength2,
        uint16 resultLength3,
        uint16 returnOffset1,
        uint16 returnOffset2,
        uint16 returnOffset3,
        uint16 returnDataSize
    ) public {
        // Bound inputs to be valid (returnOffsets + resultLengths ≤ returnDataSize)
        vm.assume(uint256(returnOffset1) + uint256(resultLength1) <= uint256(returnDataSize));
        vm.assume(uint256(returnOffset2) + uint256(resultLength2) <= uint256(returnDataSize));
        vm.assume(uint256(returnOffset3) + uint256(resultLength3) <= uint256(returnDataSize));

        // All resultLengths must be > 0 (otherwise the variable is empty for this slot;
        // zero-length slots at the end are fine since memTargets.length is dynamic)
        // For the fuzz: we use all 3 slots regardless
        memTargets = new uint256[](3);
        resultLengths = new uint256[](3);
        returnOffsets = new uint256[](3);
        memTargets[0] = memTarget1;
        memTargets[1] = memTarget2;
        memTargets[2] = memTarget3;
        resultLengths[0] = resultLength1;
        resultLengths[1] = resultLength2;
        resultLengths[2] = resultLength3;
        returnOffsets[0] = returnOffset1;
        returnOffsets[1] = returnOffset2;
        returnOffsets[2] = returnOffset3;

        // Should not revert for any valid input combination
        uint256 offset = staticCallPartialReturn(memTargets, resultLengths, returnOffsets, returnDataSize);
        assertTrue(offset != 0, "should produce non-zero offset");

        // Decode and verify via the JS layer's schema (encode+decode roundtrip covered in js/test/)
    }

    function test_call_with_unpadded_calldata() public {
        CalldataVerifier calldataVerifier = new CalldataVerifier();
        calldatas.push(abi.encodeWithSelector(CalldataVerifier.noArgs.selector));
        targets.push(address(calldataVerifier));
        offsets.push(stateChangingCall());
        multicall.execute(targets, offsets, calldatas, values);
        assertEq(calldataVerifier.lastCalldataLength(), 4, "should be 4 bytes (selector only)");
    }

    function test_staticcall_with_unpadded_calldata() public {
        CalldataVerifier calldataVerifier = new CalldataVerifier();
        calldatas.push(abi.encodeWithSelector(CalldataVerifier.noArgsView.selector));
        targets.push(address(calldataVerifier));
        offsets.push(staticCall(0x04, 0x20));
        // Use the return value (msg.data.length) as parameter to setUint
        calldatas.push(abi.encodeWithSelector(SimpleReturn.setUint.selector, 0));
        targets.push(address(simpleReturn));
        offsets.push(stateChangingCall());
        multicall.execute(targets, offsets, calldatas, values);
        assertEq(simpleReturn.getUint(), 4);
    }
}

// Minimal external wrapper so vm.expectRevert can be used on the internal
// staticCallPartialReturn function.
contract PartialReturnTestWrapper is CallBuilder {
    function externalStaticCallPartialReturn(
        uint256[] memory memTargets,
        uint256[] memory resultLengths,
        uint256[] memory returnOffsets,
        uint256 returnLength
    ) external pure returns (uint256) {
        return staticCallPartialReturn(memTargets, resultLengths, returnOffsets, returnLength);
    }
}

