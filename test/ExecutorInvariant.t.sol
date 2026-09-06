// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {CallBuilder} from "./CallBuilder.sol";
import {AttackTarget} from "./Adversarial.t.sol";
import {MulticallScripter} from "src/MulticallScripter.sol";
import {MulticallScripterReadOnly} from "src/MulticallScripterReadOnly.sol";

contract ExecutorHandler is Test, CallBuilder {
    uint256 public constant INITIAL = 100_000 ether;
    MulticallScripter public executor = new MulticallScripter();
    AttackTarget public sink = new AttackTarget();
    uint256 public expectedTotal;
    uint256 public expectedCalls;
    uint256 public expectedSpent;
    uint256 public successes;
    uint256 public failures;
    bool rejectRefund;

    constructor() {
        vm.deal(address(this), INITIAL);
    }

    receive() external payable {
        require(!rejectRefund, "Refund rejected");
    }

    // Ghost accounting is computed from the intended arithmetic, not decoded offset words.
    function batch(uint96 amountSeed, uint96 refundSeed, uint64 first, uint8 count, uint8 mode) external {
        count = uint8(bound(count, 1, 6));
        mode = uint8(bound(mode, 0, 3));
        uint256 amount = bound(amountSeed, 0, 1 ether);
        uint256 refund = bound(refundSeed, 1, 1 ether);
        address[] memory ts = new address[](count);
        uint256[] memory os = new uint256[](count);
        bytes[] memory cs = new bytes[](count);
        uint256[] memory vs = new uint256[](1);
        vs[0] = amount;
        uint256[] memory dest = new uint256[](1);
        dest[0] = 4;
        uint256[] memory size = new uint256[](1);
        size[0] = 32;
        uint256[] memory source = new uint256[](1);
        for (uint256 i; i < count; ++i) {
            ts[i] = address(sink);
            cs[i] = abi.encodeCall(sink.add, (i == 0 ? uint256(first) : 0));
            os[i] = i == count - 1
                ? stateChangingCall(1)
                : mode == 0 ? stateChangingCall(1, 4, 32) : callPartialReturn(1, dest, size, source, 32);
        }
        if (mode == 2) cs[count - 1] = abi.encodeCall(sink.revertBytes, (hex"deadbeef"));
        rejectRefund = mode == 3;
        uint256 sent = amount * count;
        (bool ok,) =
            address(executor).call{value: sent + refund}(abi.encodeCall(executor.execute, (ts, os, pack(cs), vs)));
        rejectRefund = false;
        assertEq(ok, mode < 2);
        if (ok) {
            expectedTotal += uint256(first) * count + uint256(count) * (count - 1) / 2;
            expectedCalls += count;
            expectedSpent += sent;
            ++successes;
        } else {
            ++failures;
        }
    }
}

contract ExecutorInvariantTest is Test, CallBuilder {
    ExecutorHandler handler;
    MulticallScripterReadOnly reader;

    function setUp() public {
        handler = new ExecutorHandler();
        reader = new MulticallScripterReadOnly();
        bytes4[] memory selectors = new bytes4[](1);
        selectors[0] = handler.batch.selector;
        targetSelector(FuzzSelector(address(handler), selectors));
        targetContract(address(handler));
    }

    function invariant_state_and_eth_match_only_committed_batches() public view {
        assertEq(handler.sink().total(), handler.expectedTotal());
        assertEq(handler.sink().calls(), handler.expectedCalls());
        assertEq(address(handler.sink()).balance, handler.expectedSpent());
        assertEq(address(handler).balance, handler.INITIAL() - handler.expectedSpent());
        assertEq(address(handler.executor()).balance, 0);
    }

    function invariant_reader_observes_the_same_state() public view {
        address[] memory ts = new address[](2);
        ts[0] = address(handler.sink());
        ts[1] = ts[0];
        uint256[] memory os = new uint256[](2);
        os[0] = staticCall(0, 0);
        os[1] = os[0];
        bytes[] memory cs = new bytes[](2);
        cs[0] = abi.encodeCall(handler.sink().total, ());
        cs[1] = abi.encodeCall(handler.sink().calls, ());
        bytes[] memory result = reader.execute(ts, os, pack(cs), new uint256[](0));
        assertEq(abi.decode(result[0], (uint256)), handler.expectedTotal());
        assertEq(abi.decode(result[1], (uint256)), handler.expectedCalls());
    }
}
