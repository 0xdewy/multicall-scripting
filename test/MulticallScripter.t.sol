// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {CallBuilder} from "./CallBuilder.sol";
import {MulticallScripter} from "src/MulticallScripter.sol";
import {Math, SimpleReturn, DynamicReturn, Fuzzy, CalldataVerifier} from "./Helpers.sol";

/// @dev A caller that cannot receive ETH, to exercise RefundFailed.
contract NoReceive is CallBuilder {
    function run(MulticallScripter m, address[] memory t, uint256[] memory o, bytes[] memory c, uint256[] memory v)
        external
        payable
    {
        m.execute{value: msg.value}(t, o, pack(c), v);
    }
}

contract MulticallScriptTest is Test, CallBuilder {
    MulticallScripter multicall;

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

    receive() external payable {}

    function setUp() public {
        multicall = new MulticallScripter();
        simpleReturn = new SimpleReturn();
        dynamicReturn = new DynamicReturn();
        math = new Math();
        fuzzy = new Fuzzy();
    }

    // ───────────────────────────── chaining ─────────────────────────────

    function test_simple_usage_raw() public {
        // x = math.add(2,2)
        calldatas.push(abi.encodeWithSelector(Math.add.selector, 2, 2));
        targets.push(address(math));
        // store output 36 bytes into the next call: <selector><first_param><second_param>
        offsets.push(staticCall(0x24, 0x20));

        // y = math.add(2, x)
        calldatas.push(abi.encodeWithSelector(Math.add.selector, 2, 0));
        targets.push(address(math));
        offsets.push(staticCall(0x4, 0x20));

        // math.setNum(y)
        calldatas.push(abi.encodeWithSelector(Math.setNum.selector, 0));
        targets.push(address(math));
        offsets.push(stateChangingCall());

        multicall.execute(targets, offsets, pack(calldatas), values);
        assertEq(math.number(), 6, "failed to add numbers");
    }

    function test_use_static_call_data_simple() public {
        calldatas.push(abi.encodeWithSelector(SimpleReturn.getConstant.selector));
        calldatas.push(abi.encodeWithSelector(SimpleReturn.setUint.selector, 0x0));
        targets.push(address(simpleReturn));
        targets.push(address(simpleReturn));
        offsets.push(staticCall(0x4, 0x20));
        offsets.push(stateChangingCall());

        multicall.execute(targets, offsets, pack(calldatas), values);
        assertEq(simpleReturn.getUint(), 69);
    }

    function test_fuzz_simple_set_and_get(uint256 set) public {
        calldatas.push(abi.encodeWithSelector(SimpleReturn.setUint.selector, set));
        targets.push(address(simpleReturn));
        offsets.push(stateChangingCall());

        multicall.execute(targets, offsets, pack(calldatas), values);
        assertEq(simpleReturn.getUint(), set);
    }

    function test_use_state_changing_call_return(uint256 val, uint256 val2) public {
        // x = setUint(val)  (regular CALL with return-data copy)
        calldatas.push(abi.encodeWithSelector(SimpleReturn.setUint.selector, val));
        targets.push(address(simpleReturn));
        offsets.push(stateChangingCall(0x0, 0x4, 0x20));

        // y = math.add(x, val2)
        calldatas.push(abi.encodeWithSelector(Math.add.selector, 0x4, val2));
        targets.push(address(math));
        offsets.push(staticCall(0x4, 0x20));

        // setUint(y)
        calldatas.push(abi.encodeWithSelector(SimpleReturn.setUint.selector, 0x0));
        targets.push(address(simpleReturn));
        offsets.push(stateChangingCall());

        multicall.execute(targets, offsets, pack(calldatas), values);

        uint256 res;
        unchecked {
            res = val + val2;
        }
        assertEq(simpleReturn.getUint(), res);
    }

    function test_multiple_raw_data_simple() public {
        calldatas.push(abi.encodeWithSelector(SimpleReturn.setUint.selector, 0x420));
        calldatas.push(abi.encodeWithSelector(SimpleReturn.setUint.selector, 0x69));
        targets.push(address(simpleReturn));
        targets.push(address(simpleReturn));
        offsets.push(stateChangingCall());
        offsets.push(stateChangingCall());

        multicall.execute(targets, offsets, pack(calldatas), values);
        assertEq(simpleReturn.getUint(), 0x69);
    }

    function test_use_tuple_data() public {
        calldatas.push(abi.encodeWithSelector(DynamicReturn.getTupleConstant.selector));
        targets.push(address(dynamicReturn));
        offsets.push(staticCall(0x4, 0x60)); // three padded words straight into setTuple's args

        calldatas.push(abi.encodeWithSelector(DynamicReturn.setTuple.selector, 0, 0, 0));
        targets.push(address(dynamicReturn));
        offsets.push(stateChangingCall());

        multicall.execute(targets, offsets, pack(calldatas), values);

        (uint256 a, uint256 b, uint256 c) = dynamicReturn.tuple();
        assertEq(a, 1);
        assertEq(b, 2);
        assertEq(c, 3);
    }

    function test_use_tuple_packed_data() public {
        calldatas.push(abi.encodeWithSelector(DynamicReturn.getTuplePackedConstant.selector));
        targets.push(address(dynamicReturn));
        offsets.push(staticCall(0x4, 0x60));

        calldatas.push(abi.encodeWithSelector(DynamicReturn.setTuplePacked.selector, 0, 0, 0));
        targets.push(address(dynamicReturn));
        offsets.push(stateChangingCall());

        multicall.execute(targets, offsets, pack(calldatas), values);

        (uint128 a, uint64 b, uint64 c) = dynamicReturn.tuplePacked();
        assertEq(a, 1);
        assertEq(b, 2);
        assertEq(c, 3);
    }

    // setTuple(max, max, max) -> getTupleConstant() = (1, 2, 3) -> setTuple(1, max, 3)
    function test_partial_return_data() public {
        calldatas.push(
            abi.encodeWithSelector(
                DynamicReturn.setTuple.selector, type(uint256).max, type(uint256).max, type(uint256).max
            )
        );
        targets.push(address(dynamicReturn));
        offsets.push(stateChangingCall());

        calldatas.push(abi.encodeWithSelector(DynamicReturn.getTupleConstant.selector));
        targets.push(address(dynamicReturn));
        memTargets.push(0x04); // first param of the next call
        memTargets.push(0x04 + 0x40); // third param
        returnOffsets.push(0x0); // first returned word
        returnOffsets.push(0x40); // third returned word
        resultLengths.push(0x20);
        resultLengths.push(0x20);
        offsets.push(staticCallPartialReturn(memTargets, resultLengths, returnOffsets, 0x60));

        calldatas.push(
            abi.encodeWithSelector(DynamicReturn.setTuple.selector, uint256(0), type(uint256).max, uint256(0))
        );
        targets.push(address(dynamicReturn));
        offsets.push(stateChangingCall());

        multicall.execute(targets, offsets, pack(calldatas), values);

        (uint256 a, uint256 b, uint256 c) = dynamicReturn.tuple();
        assertEq(a, 1);
        assertEq(b, type(uint256).max);
        assertEq(c, 3);
    }

    // simpleReturn.setUint(99) → state-changing partial return (0xFB) → math.setNum(<99>)
    function test_call_partial_return() public {
        memTargets.push(0x04);
        resultLengths.push(0x20);
        returnOffsets.push(0x00);

        calldatas.push(abi.encodeWithSelector(SimpleReturn.setUint.selector, 99));
        targets.push(address(simpleReturn));
        offsets.push(callPartialReturn(0, memTargets, resultLengths, returnOffsets, 0x20));

        calldatas.push(abi.encodeWithSelector(Math.setNum.selector, uint256(0)));
        targets.push(address(math));
        offsets.push(stateChangingCall());

        multicall.execute(targets, offsets, pack(calldatas), values);
        assertEq(math.number(), 99);
    }

    // 0xFB with msg.value: setUintValue() stores msg.value and returns nothing; chain getUint() instead
    function test_call_partial_return_with_value() public {
        calldatas.push(abi.encodeWithSelector(SimpleReturn.setUintValue.selector));
        targets.push(address(simpleReturn));
        offsets.push(callPartialReturn(1, memTargets, resultLengths, returnOffsets, 0)); // 0 vars, carries value
        values.push(0x420);

        calldatas.push(abi.encodeWithSelector(SimpleReturn.getUint.selector));
        targets.push(address(simpleReturn));
        offsets.push(staticCall(0x4, 0x20));

        calldatas.push(abi.encodeWithSelector(Math.setNum.selector, uint256(0)));
        targets.push(address(math));
        offsets.push(stateChangingCall());

        multicall.execute{value: 0x420}(targets, offsets, pack(calldatas), values);
        assertEq(math.number(), 0x420);
        assertEq(address(simpleReturn).balance, 0x420);
    }

    function test_partial_return_max_size() public {
        memTargets.push(0x04);
        resultLengths.push(0x20);
        returnOffsets.push(0x00);
        // returnDataSize = 0xFFFF is accepted by the encoder; the callee only returns 32 bytes so
        // execute() must reject it rather than splice zeros
        offsets.push(staticCallPartialReturn(memTargets, resultLengths, returnOffsets, type(uint16).max));
        calldatas.push(abi.encodeWithSelector(SimpleReturn.getConstant.selector));
        targets.push(address(simpleReturn));

        calldatas.push(abi.encodeWithSelector(SimpleReturn.setUint.selector, 0));
        targets.push(address(simpleReturn));
        offsets.push(stateChangingCall());

        vm.expectRevert(MulticallScripter.InsufficientReturnData.selector);
        multicall.execute(targets, offsets, pack(calldatas), values);
    }

    // changeState(startData) -> getState() spliced into changeState(...) -> setBool(<false>)
    function test_fuzz_bytes(bytes calldata startData) public {
        calldatas.push(abi.encodeWithSelector(Fuzzy.changeState.selector, startData));
        targets.push(address(fuzzy));
        offsets.push(stateChangingCall());

        calldatas.push(abi.encodeWithSelector(Fuzzy.getState.selector));
        targets.push(address(fuzzy));
        offsets.push(staticCall(0x04, startData.length));

        calldatas.push(abi.encodeWithSelector(Fuzzy.changeState.selector, startData));
        targets.push(address(fuzzy));
        offsets.push(stateChangingCall(0x0, 0x04, 0x20));

        calldatas.push(abi.encodeWithSelector(Fuzzy.setBool.selector, 0x0));
        targets.push(address(fuzzy));
        offsets.push(stateChangingCall());

        multicall.execute(targets, offsets, pack(calldatas), values);

        assertEq(fuzzy.getState(), startData);
        assertEq(fuzzy.booool(), false);
    }

    function test_fuzz_bytes_alt(bytes calldata startData) public {
        calldatas.push(abi.encodeWithSelector(Fuzzy.changeState.selector, startData));
        targets.push(address(fuzzy));
        offsets.push(stateChangingCall());

        bytes memory newData = abi.encodeWithSignature("randomsignature(uint)", 0x69);
        while (newData.length == startData.length) {
            newData = abi.encode(newData, startData);
        }

        calldatas.push(abi.encodeWithSelector(Fuzzy.changeState.selector, newData));
        targets.push(address(fuzzy));
        offsets.push(stateChangingCall(0x0, 0x04, 0x20));

        calldatas.push(abi.encodeWithSelector(Fuzzy.setBool.selector, 0x0));
        targets.push(address(fuzzy));
        offsets.push(stateChangingCall());

        multicall.execute(targets, offsets, pack(calldatas), values);

        assertEq(fuzzy.getState(), newData);
        assertEq(fuzzy.booool(), true);
    }

    function test_empty_batch() public {
        multicall.execute(targets, offsets, pack(calldatas), values);
    }

    function test_call_with_unpadded_calldata() public {
        CalldataVerifier verifier = new CalldataVerifier();
        calldatas.push(abi.encodeWithSelector(CalldataVerifier.noArgs.selector));
        targets.push(address(verifier));
        offsets.push(stateChangingCall());
        multicall.execute(targets, offsets, pack(calldatas), values);
        assertEq(verifier.lastCalldataLength(), 4, "should be 4 bytes (selector only)");
    }

    function test_staticcall_with_unpadded_calldata() public {
        CalldataVerifier verifier = new CalldataVerifier();
        calldatas.push(abi.encodeWithSelector(CalldataVerifier.noArgsView.selector));
        targets.push(address(verifier));
        offsets.push(staticCall(0x04, 0x20));
        calldatas.push(abi.encodeWithSelector(SimpleReturn.setUint.selector, 0));
        targets.push(address(simpleReturn));
        offsets.push(stateChangingCall());
        multicall.execute(targets, offsets, pack(calldatas), values);
        assertEq(simpleReturn.getUint(), 4);
    }

    function test_execution_follows_relocated_abi_tail() public {
        targets.push(address(simpleReturn));
        offsets.push(stateChangingCall());
        calldatas.push(abi.encodeCall(SimpleReturn.setUint, (2)));
        bytes memory script = pack(calldatas);
        bytes memory original = abi.encodeCall(multicall.execute, (targets, offsets, script, values));
        bytes memory data = bytes.concat(original, abi.encode(script.length), script);
        assembly ("memory-safe") { mstore(add(data, 100), sub(mload(original), 4)) }
        (bool ok,) = address(multicall).call(data);
        assertTrue(ok);
        assertEq(simpleReturn.getUint(), 2);
    }

    function test_raw_data_simple_value() public {
        calldatas.push(abi.encodeWithSelector(SimpleReturn.setUintValue.selector));
        targets.push(address(simpleReturn));
        offsets.push(stateChangingCall(0x1));
        values.push(0x420);

        multicall.execute{value: 0x420}(targets, offsets, pack(calldatas), values);
        assertEq(simpleReturn.getUint(), 0x420);
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

        multicall.execute{value: 69e18 + 1}(targets, offsets, pack(calldatas), values);
        assertEq(simpleReturn.getUint(), 69e18);
        assertEq(address(simpleReturn).balance, 69e18 + 1);
    }

    function test_unspent_value_is_refunded() public {
        calldatas.push(abi.encodeWithSelector(SimpleReturn.setUintValue.selector));
        targets.push(address(simpleReturn));
        offsets.push(stateChangingCall(0x1));
        values.push(1 ether);

        uint256 before = address(this).balance;
        multicall.execute{value: 5 ether}(targets, offsets, pack(calldatas), values);

        assertEq(address(simpleReturn).balance, 1 ether);
        assertEq(address(this).balance, before - 1 ether, "excess must come back to the caller");
        assertEq(address(multicall).balance, 0, "executor must hold nothing afterwards");
    }

    function test_refund_to_non_payable_caller_reverts() public {
        NoReceive caller = new NoReceive();
        calldatas.push(abi.encodeWithSelector(SimpleReturn.setUintValue.selector));
        targets.push(address(simpleReturn));
        offsets.push(stateChangingCall(0x1));
        values.push(1);

        vm.expectRevert(MulticallScripter.RefundFailed.selector);
        caller.run{value: 2}(multicall, targets, offsets, calldatas, values);
    }

    function test_value_index_out_of_range() public {
        calldatas.push(abi.encodeWithSelector(SimpleReturn.setUintValue.selector));
        targets.push(address(simpleReturn));
        offsets.push(stateChangingCall(0x1)); // values is empty

        vm.expectRevert(MulticallScripter.InvalidValueIndex.selector);
        multicall.execute{value: 1}(targets, offsets, pack(calldatas), values);
    }

    function test_direct_eth_rejected() public {
        (bool ok,) = address(multicall).call{value: 1}("");
        assertFalse(ok);
    }

    // ───────────────────────────── validation ─────────────────────────────

    function test_length_mismatch() public {
        targets.push(address(math));
        vm.expectRevert(MulticallScripter.LengthMismatch.selector);
        multicall.execute(targets, offsets, pack(calldatas), values);
    }

    function test_invalid_calltype_reverts() public {
        calldatas.push(abi.encodeWithSelector(SimpleReturn.setUint.selector, 42));
        targets.push(address(simpleReturn));
        offsets.push(0x00);

        vm.expectRevert(abi.encodeWithSelector(MulticallScripter.InvalidOffset.selector, 0));
        multicall.execute(targets, offsets, pack(calldatas), values);
    }

    function test_partial_too_many_vars_reverts() public {
        uint256 bad = (STATIC_CALL_PARTIAL_RETURN_FLAG << VALUE_OFFSET) | (0x20 << 8) | 4; // num_vars = 4
        calldatas.push(abi.encodeWithSelector(SimpleReturn.getConstant.selector));
        targets.push(address(simpleReturn));
        offsets.push(bad);

        vm.expectRevert(abi.encodeWithSelector(MulticallScripter.InvalidOffset.selector, bad));
        multicall.execute(targets, offsets, pack(calldatas), values);
    }

    // A regular call whose return-data write runs past the calldata region must revert.
    function test_regular_return_out_of_bounds() public {
        calldatas.push(abi.encodeWithSelector(SimpleReturn.getConstant.selector));
        targets.push(address(simpleReturn));
        offsets.push(staticCall(0x10000, 0x20));

        calldatas.push(abi.encodeWithSelector(SimpleReturn.setUint.selector, 0x0));
        targets.push(address(simpleReturn));
        offsets.push(stateChangingCall());

        vm.expectRevert(MulticallScripter.InvalidMemoryTarget.selector);
        multicall.execute(targets, offsets, pack(calldatas), values);
    }

    // The last call has no successor, so any return-data write is out of bounds.
    function test_last_call_cannot_write_return_data() public {
        calldatas.push(abi.encodeWithSelector(SimpleReturn.getConstant.selector));
        targets.push(address(simpleReturn));
        offsets.push(staticCall(0x0, 0x20));

        vm.expectRevert(MulticallScripter.InvalidMemoryTarget.selector);
        multicall.execute(targets, offsets, pack(calldatas), values);
    }

    function test_partial_return_out_of_bounds() public {
        memTargets.push(0x10000);
        resultLengths.push(0x20);
        returnOffsets.push(0x00);
        calldatas.push(abi.encodeWithSelector(SimpleReturn.getConstant.selector));
        targets.push(address(simpleReturn));
        offsets.push(staticCallPartialReturn(memTargets, resultLengths, returnOffsets, 0x20));

        calldatas.push(abi.encodeWithSelector(SimpleReturn.setUint.selector, 0x0));
        targets.push(address(simpleReturn));
        offsets.push(stateChangingCall());

        vm.expectRevert(MulticallScripter.InvalidMemoryTarget.selector);
        multicall.execute(targets, offsets, pack(calldatas), values);
    }

    // Calling an address with no code succeeds with empty return data; the executor must not
    // silently leave the placeholder argument in place.
    function test_short_return_data_reverts_regular() public {
        calldatas.push(abi.encodeWithSelector(SimpleReturn.getConstant.selector));
        targets.push(address(0xBEEF));
        offsets.push(staticCall(0x4, 0x20));

        calldatas.push(abi.encodeWithSelector(SimpleReturn.setUint.selector, 0x0));
        targets.push(address(simpleReturn));
        offsets.push(stateChangingCall());

        vm.expectRevert(MulticallScripter.InsufficientReturnData.selector);
        multicall.execute(targets, offsets, pack(calldatas), values);
    }

    function test_short_return_data_reverts_partial_slice() public {
        memTargets.push(0x04);
        resultLengths.push(0x20);
        returnOffsets.push(0x10); // slice [0x10, 0x30) exceeds the 0x20 bytes captured
        calldatas.push(abi.encodeWithSelector(SimpleReturn.getConstant.selector));
        targets.push(address(simpleReturn));
        offsets.push(staticCallPartialReturn(memTargets, resultLengths, returnOffsets, 0x20));

        calldatas.push(abi.encodeWithSelector(SimpleReturn.setUint.selector, 0x0));
        targets.push(address(simpleReturn));
        offsets.push(stateChangingCall());

        vm.expectRevert(MulticallScripter.InsufficientReturnData.selector);
        multicall.execute(targets, offsets, pack(calldatas), values);
    }

    function test_callee_revert_bubbles() public {
        calldatas.push(abi.encodeWithSelector(Fuzzy.setBool.selector, true));
        targets.push(address(fuzzy));
        offsets.push(stateChangingCall());

        calldatas.push(abi.encodeWithSignature("doesNotExist()"));
        targets.push(address(fuzzy));
        offsets.push(stateChangingCall());

        vm.expectRevert(bytes(""));
        multicall.execute(targets, offsets, pack(calldatas), values);
        assertEq(fuzzy.booool(), false, "batch must be atomic");
    }

    // ───────────────────────────── encoder limits ─────────────────────────────

    function test_partial_return_overflow() public {
        PartialReturnTestWrapper wrapper = new PartialReturnTestWrapper();
        vm.expectRevert(bytes("returnLength is too large"));
        wrapper.externalStaticCallPartialReturn(
            _toUintArray(1, 0x04), _toUintArray(1, 0x20), _toUintArray(1, 0x00), uint256(type(uint16).max) + 1
        );
    }

    function test_partial_return_boundary() public {
        PartialReturnTestWrapper wrapper = new PartialReturnTestWrapper();
        uint256 offset = wrapper.externalStaticCallPartialReturn(
            _toUintArray(1, 0x04), _toUintArray(1, 0x20), _toUintArray(1, 0x00), uint256(type(uint16).max)
        );
        assertTrue(offset != 0);
    }

    function _toUintArray(uint256 len, uint256 value) private pure returns (uint256[] memory arr) {
        arr = new uint256[](len);
        for (uint256 i = 0; i < len; i++) {
            arr[i] = value;
        }
    }
}

// Minimal external wrapper so vm.expectRevert can be used on the internal encoder.
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
