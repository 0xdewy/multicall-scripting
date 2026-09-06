// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.28;

import {Test, console2} from "forge-std/Test.sol";
import {CallBuilder} from "./CallBuilder.sol";
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

contract WriteReturn {
    uint256 public value;

    function setAndReturn(uint256 n) external payable returns (uint256) {
        value = n;
        return n + 1;
    }
}

/// @notice Execution-only gas caps from the pre-review executor at f8d42dfc4d73a9c571e033c704f430de4b31e668.
/// Baseline compiled with the SAME solc 0.8.28 / via-IR / 1,000,000 runs / Prague settings and
/// identical callees/workloads. lastCallGas excludes test setup, storage-to-memory copying and
/// ABI encoding in the caller. No tolerance: every workload must stay at or below its baseline.
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
        multicall.execute(targets, offsets, pack(calldatas), values);
        return vm.lastCallGas().gasTotalUsed;
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
        assertLe(gas, 22_570, "dispatch-only gas");
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
        assertLe(gas, 9_909, "dispatch-only-10 gas");
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
            // every add feeds the next add's second arg; the last one feeds logUint's only arg
            offsets.push(staticCall(i == N - 1 ? 0x04 : 0x24, 0x20));
        }
        // Last call: pass result to events
        calldatas.push(abi.encodeWithSelector(Events.logUint.selector, uint256(0)));
        targets.push(address(events));
        offsets.push(stateChangingCall());

        uint256 gas = gasUsedFromExecute();
        console2.log("marshalling-32B (30-chain, uint256): ", gas);
        assertLe(gas, 26_812, "marshalling-32B gas");
    }

    // ─── C. Marshalling: 320 bytes between calls ───────────────────────────

    function test_benchmark_marshalling_320bytes() public {
        uint256 N = 5;
        uint256 payload = 320;

        // getBytes(payload) returns [ptr][len][payload bytes]; the whole blob is copied into the
        // next call's calldata after its argument word, which is sized to hold it
        bytes memory largeCalldata = _makeBytesCalldata(payload);

        for (uint256 i = 0; i < N; i++) {
            calldatas.push(largeCalldata);
            targets.push(address(bufReturn));
            offsets.push(staticCall(0x24, 64 + payload));
        }
        // sink call: receives the final copy so no write lands past the calldata region
        calldatas.push(largeCalldata);
        targets.push(address(bufReturn));
        offsets.push(staticCall(0, 0));

        uint256 gas = gasUsedFromExecute();
        console2.log("marshalling-320B (5-chain): ", gas);
        assertLe(gas, 222_091, "marshalling-320B gas"); // dominated by getBytes() building the buffer
    }

    // ─── D. Marshalling: 1024 bytes between calls ──────────────────────────

    function test_benchmark_marshalling_1024bytes() public {
        uint256 N = 5;
        uint256 payload = 1024;

        bytes memory largeCalldata = _makeBytesCalldata(payload);

        for (uint256 i = 0; i < N; i++) {
            calldatas.push(largeCalldata);
            targets.push(address(bufReturn));
            offsets.push(staticCall(0x24, 64 + payload));
        }
        // sink call: receives the final copy so no write lands past the calldata region
        calldatas.push(largeCalldata);
        targets.push(address(bufReturn));
        offsets.push(staticCall(0, 0));

        uint256 gas = gasUsedFromExecute();
        console2.log("marshalling-1024B (5-chain): ", gas);
        assertLe(gas, 689_248, "marshalling-1024B gas"); // dominated by getBytes() building the buffer
    }

    // getBytes(payload) selector + arg, followed by room for a 64 + payload byte return blob
    function _makeBytesCalldata(uint256 payload) internal pure returns (bytes memory) {
        bytes memory b = new bytes(4 + 32 + 64 + payload);
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

    // ─── E. Partial-return slices ─────────────────────────────────────────

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
            // the last call has no successor to splice into
            offsets.push(i == N - 1 ? staticCall(0, 0) : staticCallPartialReturn(mTargets, rLengths, rOffsets, 0x60));
        }

        uint256 gas = gasUsedFromExecute();
        console2.log("partial-return-3vars (5x): ", gas);
        assertLe(gas, 8_880, "partial-return-3vars gas");
    }

    function test_benchmark_write_chain() public {
        WriteReturn sink = new WriteReturn();
        for (uint256 i; i < 10; ++i) {
            targets.push(address(sink));
            calldatas.push(abi.encodeCall(sink.setAndReturn, (1)));
            offsets.push(i == 9 ? stateChangingCall() : stateChangingCall(0, 4, 32));
        }
        uint256 used = gasUsedFromExecute();
        console2.log("write-chain (10 calls): ", used);
        assertLe(used, 31_667, "write-chain gas");
        assertEq(sink.value(), 10);
    }

    function test_benchmark_write_partial_return() public {
        WriteReturn sink = new WriteReturn();
        uint256[] memory mts = new uint256[](1);
        uint256[] memory lens = new uint256[](1);
        uint256[] memory ros = new uint256[](1);
        mts[0] = 4;
        lens[0] = 32;
        for (uint256 i; i < 10; ++i) {
            targets.push(address(sink));
            calldatas.push(abi.encodeCall(sink.setAndReturn, (1)));
            offsets.push(i == 9 ? stateChangingCall() : callPartialReturn(0, mts, lens, ros, 32));
        }
        uint256 used = gasUsedFromExecute();
        console2.log("write-partial (10 calls): ", used);
        assertLe(used, 34_135, "write-partial gas");
        assertEq(sink.value(), 10);
    }

    function test_benchmark_value_calls() public {
        WriteReturn sink = new WriteReturn();
        values.push(1);
        for (uint256 i; i < 10; ++i) {
            targets.push(address(sink));
            calldatas.push(abi.encodeCall(sink.setAndReturn, (i + 1)));
            offsets.push(stateChangingCall(1));
        }
        multicall.execute{value: 10}(targets, offsets, pack(calldatas), values);
        uint256 used = vm.lastCallGas().gasTotalUsed;
        console2.log("value-calls (10 calls): ", used);
        assertLe(used, 98_667, "value-calls gas");
        assertEq(sink.value(), 10);
        assertEq(address(sink).balance, 10);
    }
}
