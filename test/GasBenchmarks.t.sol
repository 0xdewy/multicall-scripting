// SPDX-License-Identifier: GPL3
pragma solidity ^0.8.28;

import {Test, console2} from "forge-std/Test.sol";
import {CallBuilder} from "../src/CallBuilder.sol";
import {MulticallScripter} from "../src/MulticallScripter.sol";
import {Math, Events, DynamicReturn} from "./Helpers.sol";

/// @notice Returns configurable-length bytes for marshalling benchmarks.
contract BufferReturn {
    function getBytes32() public pure returns (bytes32) {
        return bytes32(hex"deadbeefcafebabedeadbeefcafebabedeadbeefcafebabedeadbeefcafebabe");
    }

    function getBytes(uint256 length) public pure returns (bytes memory) {
        bytes memory buf = new bytes(length);
        for (uint256 i = 0; i < length; i++) {
            buf[i] = bytes1(uint8(i & 0xFF));
        }
        return buf;
    }
}

/// @notice Decomposes interpreter overhead into dispatch, marshalling, and total-vs-native.
contract GasBenchmarksTest is Test, CallBuilder {
    MulticallScripter multicall;
    Math math;
    Events events;
    BufferReturn bufReturn;

    address[] targets;
    uint256[] offsets;
    bytes[] calldatas;
    uint256[] values;

    function setUp() public {
        multicall = new MulticallScripter();
        math = new Math();
        events = new Events();
        bufReturn = new BufferReturn();
    }

    // ─── Helpers ───────────────────────────────────────────────────────────

    function gasUsedFromExecute() internal returns (uint256) {
        uint256 g = gasleft();
        multicall.execute(targets, offsets, calldatas, values);
        return g - gasleft();
    }

    function clearState() internal {
        delete targets;
        delete offsets;
        delete calldatas;
        delete values;
    }

    // ─── A. Dispatch-only: N no-op staticcalls, no return-data chaining ────

    function test_benchmark_dispatch_only() public {
        uint256 N = 30;
        for (uint256 i = 0; i < N; i++) {
            calldatas.push(abi.encodeWithSelector(Math.add.selector, 1, 2));
            targets.push(address(math));
            offsets.push(staticCall(0, 0)); // no return data copied
        }

        uint256 gas = gasUsedFromExecute();
        console2.log("dispatch-only (30 calls, no chaining): ", gas);
        console2.log("dispatch-only per-call: ", gas / N);
        assertLe(gas, 160_000, "dispatch-only gas");
    }

    function test_benchmark_dispatch_only_10() public {
        uint256 N = 10;
        for (uint256 i = 0; i < N; i++) {
            calldatas.push(abi.encodeWithSelector(Math.add.selector, 1, 2));
            targets.push(address(math));
            offsets.push(staticCall(0, 0));
        }
        uint256 gas = gasUsedFromExecute();
        console2.log("dispatch-only (10 calls): ", gas);
        assertLe(gas, 60_000, "dispatch-only-10 gas");
    }

    // ─── B. Marshalling: chained uint256 (32 bytes) between calls ──────────

    function test_benchmark_marshalling_32bytes() public {
        uint256 N = 30;
        // Call 1: math.add(1,2) — return data (32 bytes) goes to offset 0x24
        //         in next calldata region, filling second arg of next add().
        calldatas.push(abi.encodeWithSelector(Math.add.selector, 1, 2));
        targets.push(address(math));
        offsets.push(staticCall(0x24, 0x20));

        for (uint256 i = 1; i < N; i++) {
            calldatas.push(abi.encodeWithSelector(Math.add.selector, 1, uint256(0)));
            targets.push(address(math));
            offsets.push(staticCall(0x24, 0x20));
        }
        // Last call: pass result to events
        calldatas.push(abi.encodeWithSelector(Events.logUint.selector, uint256(0)));
        targets.push(address(events));
        offsets.push(stateChangingCall());

        uint256 gas = gasUsedFromExecute();
        console2.log("marshalling-32B (30-chain, uint256): ", gas);
        assertLe(gas, 160_000, "marshalling-32B gas");
    }

    // ─── C. Marshalling: 320 bytes between calls ───────────────────────────

    function test_benchmark_marshalling_320bytes() public {
        uint256 N = 5;
        uint256 payload = 320;

        // calldata must accommodate memTarget(0x04) + resultLength(payload) bytes
        bytes memory largeCalldata = _makeBytesCalldata(payload);

        calldatas.push(largeCalldata);
        targets.push(address(bufReturn));
        offsets.push(staticCall(0x04, payload));

        for (uint256 i = 1; i < N; i++) {
            calldatas.push(largeCalldata);
            targets.push(address(bufReturn));
            offsets.push(staticCall(0x04, payload));
        }

        uint256 gas = gasUsedFromExecute();
        console2.log("marshalling-320B (5-chain): ", gas);
        assertLe(gas, 130_000, "marshalling-320B gas");
    }

    // ─── D. Marshalling: 1024 bytes between calls ──────────────────────────

    function test_benchmark_marshalling_1024bytes() public {
        uint256 N = 5;
        uint256 payload = 1024;

        bytes memory largeCalldata = _makeBytesCalldata(payload);

        calldatas.push(largeCalldata);
        targets.push(address(bufReturn));
        offsets.push(staticCall(0x04, payload));

        for (uint256 i = 1; i < N; i++) {
            calldatas.push(largeCalldata);
            targets.push(address(bufReturn));
            offsets.push(staticCall(0x04, payload));
        }

        uint256 gas = gasUsedFromExecute();
        console2.log("marshalling-1024B (5-chain): ", gas);
        assertLe(gas, 280_000, "marshalling-1024B gas");
    }

    function _makeBytesCalldata(uint256 payload) internal pure returns (bytes memory) {
        bytes memory b = new bytes(4 + payload);
        uint32 sel = uint32(BufferReturn.getBytes.selector);
        b[0] = bytes1(uint8(sel >> 24));
        b[1] = bytes1(uint8((sel >> 16) & 0xFF));
        b[2] = bytes1(uint8((sel >> 8) & 0xFF));
        b[3] = bytes1(uint8(sel & 0xFF));
        uint256 p = payload;
        for (uint256 j = 0; j < 32; j++) {
            b[4 + j] = bytes1(uint8((p >> (248 - j * 8)) & 0xFF));
        }
        return b;
    }

    // ─── E. Total vs native: same sequence via Scripter vs direct calls ────

    function test_benchmark_total_vs_native() public {
        uint256 N = 30;
        uint256 a = 10000;
        uint256 b = 32490283094;

        // Scripter path
        for (uint256 i = 0; i < N; i++) {
            calldatas.push(abi.encodeWithSelector(Math.add.selector, a, b));
            targets.push(address(math));
            offsets.push(staticCall(0x24, 0x20));
        }
        calldatas.push(abi.encodeWithSelector(Events.logUint.selector, uint256(0)));
        targets.push(address(events));
        offsets.push(stateChangingCall());

        uint256 scripterGas = gasUsedFromExecute();
        console2.log("Scripter (30-chain): ", scripterGas);

        // Native direct calls baseline
        uint256 g = gasleft();
        uint256 val = a;
        for (uint256 i = 0; i < N; i++) {
            val = math.add(val, b);
        }
        events.logUint(val);
        uint256 directGas = g - gasleft();
        console2.log("Native direct (30 iter): ", directGas);
        console2.log("Scripter overhead: ", scripterGas - directGas);

        assertLe(scripterGas, 160_000, "total-vs-native scripter");
    }

    // ─── F. Partial return overhead (0xFC, 3 vars) ─────────────────────────

    function test_benchmark_partial_return_3vars() public {
        uint256 N = 5;
        DynamicReturn dr = new DynamicReturn();

        uint256[] memory mTargets = new uint256[](3);
        uint256[] memory rLengths = new uint256[](3);
        uint256[] memory rOffsets = new uint256[](3);
        mTargets[0] = 0x04;
        mTargets[1] = 0x24;
        mTargets[2] = 0x44;
        rLengths[0] = 0x20;
        rLengths[1] = 0x20;
        rLengths[2] = 0x20;
        rOffsets[0] = 0x00;
        rOffsets[1] = 0x20;
        rOffsets[2] = 0x40;

        // calldata: getTupleConstant() = just 4-byte selector,
        // padded to 100 bytes to fit 3 uint256 at offsets 0x04,0x24,0x44
        bytes memory calld = new bytes(100);
        uint32 sel = uint32(DynamicReturn.getTupleConstant.selector);
        calld[0] = bytes1(uint8(sel >> 24));
        calld[1] = bytes1(uint8((sel >> 16) & 0xFF));
        calld[2] = bytes1(uint8((sel >> 8) & 0xFF));
        calld[3] = bytes1(uint8(sel & 0xFF));

        for (uint256 i = 0; i < N; i++) {
            calldatas.push(calld);
            targets.push(address(dr));
            offsets.push(staticCallPartialReturn(mTargets, rLengths, rOffsets, 0x60));
        }

        uint256 gas = gasUsedFromExecute();
        console2.log("partial-return-3vars (5x): ", gas);
        assertLe(gas, 45_000, "partial-return-3vars gas");
    }
}
