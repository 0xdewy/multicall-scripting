// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {CallBuilder} from "./CallBuilder.sol";
import {MulticallScripterReadOnly} from "src/MulticallScripterReadOnly.sol";
import {MulticallScripter} from "src/MulticallScripter.sol";
import {Math, SimpleReturn, DynamicReturn, Fuzzy, ArrayElementAccess} from "./Helpers.sol";

contract MulticallScripterReadOnlyTest is Test, CallBuilder {
    MulticallScripterReadOnly reader;
    Math math;
    SimpleReturn simpleReturn;
    DynamicReturn dynamicReturn;
    Fuzzy fuzzy;
    ArrayElementAccess arrays;

    address[] targets;
    uint256[] offsets;
    bytes[] calldatas;
    uint256[] values;

    uint256[] memTargets;
    uint256[] resultLengths;
    uint256[] returnOffsets;

    function setUp() public {
        reader = new MulticallScripterReadOnly();
        math = new Math();
        simpleReturn = new SimpleReturn();
        dynamicReturn = new DynamicReturn();
        fuzzy = new Fuzzy();
        arrays = new ArrayElementAccess();
    }

    // x = add(2, 2); y = add(2, x); z = add(y, y) — every intermediate value is returned
    function test_chain_returns_every_result() public {
        calldatas.push(abi.encodeWithSelector(Math.add.selector, 2, 2));
        targets.push(address(math));
        offsets.push(staticCall(0x24, 0x20));

        calldatas.push(abi.encodeWithSelector(Math.add.selector, 2, 0));
        targets.push(address(math));
        memTargets.push(0x04);
        memTargets.push(0x24);
        resultLengths.push(0x20);
        resultLengths.push(0x20);
        returnOffsets.push(0x00);
        returnOffsets.push(0x00);
        offsets.push(staticCallPartialReturn(memTargets, resultLengths, returnOffsets, 0x20));

        calldatas.push(abi.encodeWithSelector(Math.add.selector, 0, 0));
        targets.push(address(math));
        offsets.push(staticCall(0, 0));

        bytes[] memory results = reader.execute(targets, offsets, pack(calldatas), values);

        assertEq(results.length, 3);
        assertEq(abi.decode(results[0], (uint256)), 4);
        assertEq(abi.decode(results[1], (uint256)), 6);
        assertEq(abi.decode(results[2], (uint256)), 12);
    }

    // the same slice can be copied twice within one partial word; the source stays intact
    function test_partial_slices_into_a_later_call() public {
        calldatas.push(abi.encodeWithSelector(DynamicReturn.getTupleConstant.selector));
        targets.push(address(dynamicReturn));
        memTargets.push(0x04); // first arg of add ← tuple[0]
        memTargets.push(0x24); // second arg of add ← tuple[2]
        resultLengths.push(0x20);
        resultLengths.push(0x20);
        returnOffsets.push(0x00);
        returnOffsets.push(0x40);
        offsets.push(staticCallPartialReturn(memTargets, resultLengths, returnOffsets, 0x60));

        calldatas.push(abi.encodeWithSelector(Math.add.selector, 0, 0));
        targets.push(address(math));
        offsets.push(staticCall(0, 0));

        bytes[] memory results = reader.execute(targets, offsets, pack(calldatas), values);
        (uint256 a, uint256 b, uint256 c) = abi.decode(results[0], (uint256, uint256, uint256));
        assertEq(a, 1);
        assertEq(b, 2);
        assertEq(c, 3);
        assertEq(abi.decode(results[1], (uint256)), 4);
    }

    // a consumer two calls after the producer: memTarget spans the intermediate call's region
    function test_consumer_two_calls_later() public {
        calldatas.push(abi.encodeWithSelector(SimpleReturn.getConstant.selector)); // 69
        targets.push(address(simpleReturn));
        // next call occupies 32 + pad32(4 + 64) = 128 bytes; land in the call after it at 0x24
        offsets.push(staticCall(128 + 0x24, 0x20));

        calldatas.push(abi.encodeWithSelector(Math.add.selector, 1, 1));
        targets.push(address(math));
        offsets.push(staticCall(0, 0));

        calldatas.push(abi.encodeWithSelector(Math.add.selector, 1, 0));
        targets.push(address(math));
        offsets.push(staticCall(0, 0));

        bytes[] memory results = reader.execute(targets, offsets, pack(calldatas), values);
        assertEq(abi.decode(results[1], (uint256)), 2);
        assertEq(abi.decode(results[2], (uint256)), 70);
    }

    // dynamic return data is captured in full and decodes normally
    function test_dynamic_return_data_captured() public {
        fuzzy.changeState(hex"deadbeefcafe");
        arrays.setNumbers(_nums());

        calldatas.push(abi.encodeWithSelector(Fuzzy.getState.selector));
        targets.push(address(fuzzy));
        offsets.push(staticCall(0, 0));

        calldatas.push(abi.encodeWithSelector(ArrayElementAccess.getConstantNumbers.selector));
        targets.push(address(arrays));
        offsets.push(staticCall(0, 0));

        bytes[] memory results = reader.execute(targets, offsets, pack(calldatas), values);
        assertEq(abi.decode(results[0], (bytes)), hex"deadbeefcafe");
        uint256[] memory nums = abi.decode(results[1], (uint256[]));
        assertEq(nums.length, 3);
        assertEq(nums[2], 300);
    }

    function test_fuzz_returns_calldata_sized_data(bytes calldata blob) public {
        fuzzy.changeState(blob);
        calldatas.push(abi.encodeWithSelector(Fuzzy.getState.selector));
        targets.push(address(fuzzy));
        offsets.push(staticCall(0, 0));

        bytes[] memory results = reader.execute(targets, offsets, pack(calldatas), values);
        assertEq(abi.decode(results[0], (bytes)), blob);
    }

    function hashDecoded(bytes calldata data) external pure returns (bytes32) {
        (address[] memory t, uint256[] memory o, bytes memory c, uint256[] memory v) =
            abi.decode(data[4:], (address[], uint256[], bytes, uint256[]));
        return keccak256(abi.encode(t, o, c, v));
    }

    function test_fuzz_internal_padding_is_signed(uint8 dirty) public {
        dirty = uint8(bound(dirty, 1, 255));
        RawEcho echo = new RawEcho();
        address[] memory t = new address[](3);
        uint256[] memory o = new uint256[](3);
        bytes[] memory c = new bytes[](3);
        for (uint256 i; i < 3; ++i) {
            t[i] = address(echo);
            o[i] = staticCall(0, 0);
        }
        c[0] = abi.encode(uint256(5));
        c[1] = hex"11";
        c[2] = hex"22";
        // Splicing into a later frame length can expose its padding. All those bytes are signed.
        o[0] = staticCall(32, 32);
        bytes memory script = pack(c);
        bytes memory data = abi.encodeCall(reader.execute, (t, o, script, new uint256[](0)));
        bytes32 beforeHash = this.hashDecoded(data);
        bytes[] memory a = reader.execute(t, o, script, new uint256[](0));
        assertEq(a[2], hex"2200000000");
        script[161] = bytes1(dirty);
        data = abi.encodeCall(reader.execute, (t, o, script, new uint256[](0)));
        assertNotEq(this.hashDecoded(data), beforeHash);
        bytes[] memory b = reader.execute(t, o, script, new uint256[](0));
        bytes memory expected = abi.encodePacked(bytes1(0x22), dirty, bytes3(0));
        assertEq(b[2], expected);
        MulticallScripter executor = new MulticallScripter();
        vm.expectCall(address(echo), expected);
        executor.execute(t, o, script, new uint256[](0));
    }

    function test_fuzz_packed_frame_bounds(uint256 declared, uint8 payloadWords, uint8 tailBytes) public {
        payloadWords = uint8(bound(payloadWords, 0, 8));
        tailBytes = uint8(bound(tailBytes, 0, 31));
        bytes memory script = new bytes(32 + uint256(payloadWords) * 32 + tailBytes);
        // Mix arbitrary 256-bit lengths with values around actual frame boundaries.
        if (declared & 1 == 0) declared %= uint256(payloadWords) * 32 + 34;
        assembly ("memory-safe") { mstore(add(script, 32), declared) }
        RawEcho echo = new RawEcho();
        targets.push(address(echo));
        offsets.push(staticCall(0, 0));
        bytes4 expected;
        if (tailBytes != 0) expected = MulticallScripter.LengthMismatch.selector;
        else if (declared > uint256(payloadWords) * 32) expected = MulticallScripter.InvalidMemoryTarget.selector;
        else if ((declared + 31) / 32 != payloadWords) expected = MulticallScripter.LengthMismatch.selector;
        MulticallScripter executor = new MulticallScripter();
        if (expected != bytes4(0)) vm.expectRevert(expected);
        executor.execute(targets, offsets, script, values);
        if (expected != bytes4(0)) vm.expectRevert(expected);
        bytes[] memory result = reader.execute(targets, offsets, script, values);
        if (expected == bytes4(0)) assertEq(result[0], new bytes(declared));
    }

    function test_missing_frame_reverts_both_executors() public {
        targets.push(address(math));
        offsets.push(staticCall(0, 0));
        MulticallScripter executor = new MulticallScripter();
        vm.expectRevert(MulticallScripter.InvalidMemoryTarget.selector);
        executor.execute(targets, offsets, hex"", values);
        vm.expectRevert(MulticallScripterReadOnly.InvalidMemoryTarget.selector);
        reader.execute(targets, offsets, hex"", values);
    }

    function test_spliced_frame_length_cannot_escape_region() public {
        RawEcho echo = new RawEcho();
        for (uint256 i; i < 3; ++i) {
            targets.push(address(echo));
            offsets.push(staticCall(0, 0));
        }
        calldatas.push(abi.encode(type(uint256).max));
        calldatas.push(hex"11");
        calldatas.push(hex"22");
        offsets[0] = staticCall(32, 32);
        MulticallScripter executor = new MulticallScripter();
        vm.expectRevert(MulticallScripter.InvalidMemoryTarget.selector);
        executor.execute(targets, offsets, pack(calldatas), values);
        vm.expectRevert(MulticallScripterReadOnly.InvalidMemoryTarget.selector);
        reader.execute(targets, offsets, pack(calldatas), values);
    }

    function test_empty_batch() public {
        bytes[] memory results = reader.execute(targets, offsets, pack(calldatas), values);
        assertEq(results.length, 0);
    }

    // Independent byte-copy model: mixed regular/partial words, unaligned slices, fan-out,
    // skipped consumers and varying calldata padding. Compare every intermediate result.
    function test_fuzz_chaining_matches_byte_model(uint256 seed, uint8 count) public {
        RawEcho echo = new RawEcho();
        MulticallScripter executor = new MulticallScripter();
        uint256 n = bound(count, 2, 8);
        address[] memory dests = new address[](n);
        uint256[] memory words = new uint256[](n);
        bytes[] memory inputs = new bytes[](n);
        bytes[] memory expected = new bytes[](n);
        for (uint256 i; i < n; ++i) {
            seed = uint256(keccak256(abi.encode(seed, i)));
            inputs[i] = new bytes(32 + seed % 97);
            for (uint256 j; j < inputs[i].length; ++j) {
                inputs[i][j] = bytes1(keccak256(abi.encode(seed, j)));
            }
            expected[i] = bytes.concat(inputs[i]);
            dests[i] = address(echo);
        }
        for (uint256 i; i + 1 < n; ++i) {
            seed = uint256(keccak256(abi.encode(seed, i)));
            bool isPartial = seed & 1 != 0;
            bool callFlag = seed & 2 != 0;
            uint256 slices = isPartial ? 1 + (seed >> 2) % 3 : 1;
            uint256[] memory mts = new uint256[](slices);
            uint256[] memory lens = new uint256[](slices);
            uint256[] memory ros = new uint256[](slices);
            for (uint256 s; s < slices; ++s) {
                seed = uint256(keccak256(abi.encode(seed, s)));
                uint256 consumer = i + 1 + seed % (n - i - 1);
                uint256 len = 1 + (seed >> 32) % 32;
                uint256 source = isPartial ? (seed >> 64) % (expected[i].length - len + 1) : 0;
                uint256 destination = (seed >> 96) % (expected[consumer].length - len + 1);
                mts[s] = destination;
                for (uint256 k = i + 1; k < consumer; ++k) {
                    mts[s] += 32 + ((inputs[k].length + 31) / 32) * 32;
                }
                lens[s] = len;
                ros[s] = source;
                for (uint256 j; j < len; ++j) {
                    expected[consumer][destination + j] = expected[i][source + j];
                }
            }
            if (isPartial) {
                words[i] = callFlag
                    ? callPartialReturn(0, mts, lens, ros, expected[i].length)
                    : staticCallPartialReturn(mts, lens, ros, expected[i].length);
            } else {
                words[i] = callFlag ? stateChangingCall(0, mts[0], lens[0]) : staticCall(mts[0], lens[0]);
            }
        }
        words[n - 1] = staticCall(0, 0);
        bytes[] memory actual = reader.execute(dests, words, pack(inputs), new uint256[](0));
        assertEq(actual.length, n);
        for (uint256 i; i < n; ++i) {
            assertEq(actual[i], expected[i]);
            vm.expectCall(address(echo), expected[i]);
        }
        executor.execute(dests, words, pack(inputs), new uint256[](0));
    }

    function test_fuzz_partial_boundaries(uint16 source, uint16 length, uint16 destination, uint8 vars) public {
        source = uint16(bound(source, 0, 65));
        length = uint16(bound(length, 0, 65));
        destination = uint16(bound(destination, 0, 65));
        vars = uint8(bound(vars, 0, 4));
        RawEcho echo = new RawEcho();
        targets.push(address(echo));
        targets.push(address(echo));
        calldatas.push(new bytes(64));
        calldatas.push(new bytes(64));
        // Deliberately bypass the encoder so malformed words reach the executor.
        uint256 word = (uint256(0xFC) << 248) | (uint256(destination) << 200) | (uint256(length) << 104)
            | (uint256(source) << 56) | (64 << 8) | vars;
        offsets.push(word);
        offsets.push(staticCall(0, 0));
        if (vars > 3) {
            vm.expectRevert(abi.encodeWithSelector(MulticallScripterReadOnly.InvalidOffset.selector, word));
        } else if (vars != 0 && uint256(destination) + length > 64) {
            vm.expectRevert(MulticallScripterReadOnly.InvalidMemoryTarget.selector);
        } else if (vars != 0 && uint256(source) + length > 64) {
            vm.expectRevert(MulticallScripterReadOnly.InsufficientReturnData.selector);
        }
        reader.execute(targets, offsets, pack(calldatas), values);
    }

    function test_partial_short_capture_reverts() public {
        targets.push(address(simpleReturn));
        calldatas.push(abi.encodeCall(SimpleReturn.getConstant, ()));
        offsets.push((uint256(0xFC) << 248) | (33 << 8));
        vm.expectRevert(MulticallScripterReadOnly.InsufficientReturnData.selector);
        reader.execute(targets, offsets, pack(calldatas), values);
    }

    function test_last_call_cannot_splice() public {
        targets.push(address(simpleReturn));
        calldatas.push(abi.encodeCall(SimpleReturn.getConstant, ()));
        offsets.push(staticCall(0, 32));
        vm.expectRevert(MulticallScripterReadOnly.InvalidMemoryTarget.selector);
        reader.execute(targets, offsets, pack(calldatas), values);
    }

    function test_raw_returns_have_canonical_padding() public {
        RawEcho echo = new RawEcho();
        bytes[] memory expected = new bytes[](4);
        expected[0] = hex"ab";
        expected[1] = new bytes(0);
        expected[2] = new bytes(33);
        expected[3] = hex"cdef";
        for (uint256 i; i < expected.length; ++i) {
            targets.push(address(echo));
            offsets.push(staticCall(0, 0));
            calldatas.push(expected[i]);
        }
        (bool ok, bytes memory result) =
            address(reader).staticcall(abi.encodeCall(reader.execute, (targets, offsets, pack(calldatas), values)));
        assertTrue(ok);
        assertEq(result, abi.encode(expected));
    }

    function test_execution_follows_relocated_abi_tail() public {
        RawEcho echo = new RawEcho();
        targets.push(address(echo));
        offsets.push(staticCall(0, 0));
        calldatas.push(hex"010203");
        bytes memory script = pack(calldatas);
        bytes memory original = abi.encodeCall(reader.execute, (targets, offsets, script, values));
        bytes memory data = bytes.concat(original, abi.encode(script.length), script);
        assembly ("memory-safe") { mstore(add(data, 100), sub(mload(original), 4)) }
        assertEq(this.hashDecoded(data), this.hashDecoded(original));
        (bool ok, bytes memory result) = address(reader).staticcall(data);
        assertTrue(ok);
        bytes[] memory actual = abi.decode(result, (bytes[]));
        assertEq(actual[0], hex"010203");
    }

    // 0xFE / 0xFB words are accepted but run as staticcall: a writing callee reverts
    function test_state_change_reverts() public {
        calldatas.push(abi.encodeWithSelector(SimpleReturn.setUint.selector, 1));
        targets.push(address(simpleReturn));
        offsets.push(stateChangingCall());

        vm.expectRevert();
        reader.execute{gas: 100_000}(targets, offsets, pack(calldatas), values);
    }

    function test_call_flag_on_pure_function_is_fine() public {
        calldatas.push(abi.encodeWithSelector(Math.add.selector, 3, 4));
        targets.push(address(math));
        offsets.push(stateChangingCall(0x1, 0x04, 0x20)); // value index is ignored

        calldatas.push(abi.encodeWithSelector(Math.add.selector, 0, 1));
        targets.push(address(math));
        offsets.push(stateChangingCall());

        bytes[] memory results = reader.execute(targets, offsets, pack(calldatas), values);
        assertEq(abi.decode(results[1], (uint256)), 8);
    }

    function test_callee_revert_bubbles() public {
        calldatas.push(abi.encodeWithSelector(ArrayElementAccess.getNumberAt.selector, 99));
        targets.push(address(arrays));
        offsets.push(staticCall(0, 0));

        vm.expectRevert("Index out of bounds");
        reader.execute(targets, offsets, pack(calldatas), values);
    }

    function test_short_return_data_reverts() public {
        calldatas.push(abi.encodeWithSelector(SimpleReturn.getConstant.selector));
        targets.push(address(0xBEEF));
        offsets.push(staticCall(0x4, 0x20));
        calldatas.push(abi.encodeWithSelector(Math.add.selector, 0, 0));
        targets.push(address(math));
        offsets.push(staticCall(0, 0));

        vm.expectRevert(MulticallScripterReadOnly.InsufficientReturnData.selector);
        reader.execute(targets, offsets, pack(calldatas), values);
    }

    function test_out_of_bounds_target_reverts() public {
        calldatas.push(abi.encodeWithSelector(SimpleReturn.getConstant.selector));
        targets.push(address(simpleReturn));
        offsets.push(staticCall(0x10000, 0x20));
        calldatas.push(abi.encodeWithSelector(Math.add.selector, 0, 0));
        targets.push(address(math));
        offsets.push(staticCall(0, 0));

        vm.expectRevert(MulticallScripterReadOnly.InvalidMemoryTarget.selector);
        reader.execute(targets, offsets, pack(calldatas), values);
    }

    function test_invalid_offset_reverts() public {
        calldatas.push(abi.encodeWithSelector(SimpleReturn.getConstant.selector));
        targets.push(address(simpleReturn));
        offsets.push(0);

        vm.expectRevert(abi.encodeWithSelector(MulticallScripterReadOnly.InvalidOffset.selector, 0));
        reader.execute(targets, offsets, pack(calldatas), values);
    }

    function test_length_mismatch() public {
        targets.push(address(math));
        vm.expectRevert(MulticallScripterReadOnly.LengthMismatch.selector);
        reader.execute(targets, offsets, pack(calldatas), values);
    }

    // a builder-produced batch (js/test/arrayElementAccess.js) contains setters, so run the
    // read-only prefix of an equivalent chain through the reader: getConstantNumbers → sumTwoNumbers
    function test_element_access_chain() public {
        calldatas.push(abi.encodeWithSelector(ArrayElementAccess.getConstantNumbers.selector));
        targets.push(address(arrays));
        memTargets.push(0x04); // a ← numbers[0] (return: [ptr][len][e0][e1][e2])
        memTargets.push(0x24); // b ← numbers[1]
        resultLengths.push(0x20);
        resultLengths.push(0x20);
        returnOffsets.push(0x40);
        returnOffsets.push(0x60);
        offsets.push(staticCallPartialReturn(memTargets, resultLengths, returnOffsets, 0xa0));

        calldatas.push(abi.encodeWithSelector(ArrayElementAccess.sumTwoNumbers.selector, 0, 0));
        targets.push(address(arrays));
        offsets.push(staticCall(0, 0));

        bytes[] memory results = reader.execute(targets, offsets, pack(calldatas), values);
        assertEq(abi.decode(results[1], (uint256)), 300);
    }

    function _nums() internal pure returns (uint256[] memory n) {
        n = new uint256[](1);
        n[0] = 1;
    }
}

contract RawEcho {
    fallback(bytes calldata data) external returns (bytes memory) {
        return data;
    }
}
