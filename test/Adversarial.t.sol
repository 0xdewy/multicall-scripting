// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.28;

import {MockERC20} from "forge-std/mocks/MockERC20.sol";
import {Test} from "forge-std/Test.sol";
import {CallBuilder} from "./CallBuilder.sol";
import {MulticallScripter} from "src/MulticallScripter.sol";
import {MulticallScripterReadOnly} from "src/MulticallScripterReadOnly.sol";
import {SevenSevenZeroTwoCaller} from "src/7702Caller.sol";

contract AttackTarget {
    uint256 public total;
    uint256 public calls;

    function add(uint256 value) external payable returns (uint256) {
        total += value;
        ++calls;
        return value + 1;
    }

    function forbiddenUnderStatic(uint256 operation) external {
        assembly ("memory-safe") {
            switch operation
            case 0 { sstore(0, 1) }
            case 1 { tstore(0, 1) }
            case 2 { log0(0, 0) }
            case 3 { pop(create(0, 0, 0)) }
            case 4 { selfdestruct(caller()) }
            case 5 { pop(call(gas(), caller(), 1, 0, 0, 0, 0)) }
        }
    }

    function revertBytes(bytes memory data) external pure {
        assembly ("memory-safe") { revert(add(data, 32), mload(data)) }
    }

    function caller() external view returns (address) {
        return msg.sender;
    }

    function returnFalse() external pure returns (bool) {
        return false;
    }

    function requireTrue(bool ok) external pure {
        require(ok, "Operation returned false");
    }

    function twoNumbers() external pure returns (uint256[] memory numbers) {
        numbers = new uint256[](2);
        numbers[0] = 42;
        numbers[1] = 77;
    }

    function secondNumber(uint256[] calldata x, uint256[] calldata) external pure returns (uint256) {
        return x[1];
    }

    fallback(bytes calldata data) external returns (bytes memory) {
        return data;
    }
}

contract ReentrantCaller is CallBuilder {
    MulticallScripter immutable executor;
    AttackTarget immutable target;
    uint256 public refunds;
    address replayAccount;
    bytes replayData;
    bool public replaySucceeded;

    constructor(MulticallScripter e, AttackTarget t) {
        executor = e;
        target = t;
    }

    function nested(uint256 n) external returns (uint256) {
        address[] memory ts = new address[](1);
        ts[0] = address(target);
        uint256[] memory os = new uint256[](1);
        os[0] = stateChangingCall();
        bytes[] memory cs = new bytes[](1);
        cs[0] = abi.encodeCall(target.add, (n));
        executor.execute(ts, os, pack(cs), new uint256[](0));
        return n + 1;
    }

    function refundBatch() external payable {
        executor.execute{value: msg.value}(new address[](0), new uint256[](0), hex"", new uint256[](0));
    }

    receive() external payable {
        ++refunds;
        address[] memory ts = new address[](1);
        ts[0] = address(target);
        uint256[] memory os = new uint256[](1);
        os[0] = stateChangingCall(1);
        bytes[] memory cs = new bytes[](1);
        cs[0] = abi.encodeCall(target.add, (11));
        uint256[] memory vs = new uint256[](1);
        vs[0] = msg.value / 2;
        executor.execute{value: vs[0]}(ts, os, pack(cs), vs);
    }

    function setReplay(address account, bytes memory data) external {
        replayAccount = account;
        replayData = data;
    }

    function replay() external {
        (replaySucceeded,) = replayAccount.call(replayData);
        require(!replaySucceeded, "Reentrant signature replay succeeded");
    }
}

contract EchoTarget {
    fallback(bytes calldata data) external returns (bytes memory) {
        return data;
    }
}

contract ForcedEther {
    constructor(address payable recipient) payable {
        selfdestruct(recipient);
    }
}

contract AdversarialTest is Test, CallBuilder {
    MulticallScripter executor;
    MulticallScripterReadOnly reader;
    AttackTarget target;
    address[] ts;
    uint256[] os;
    bytes[] cs;
    uint256[] vs;

    function setUp() public {
        executor = new MulticallScripter();
        reader = new MulticallScripterReadOnly();
        target = new AttackTarget();
        vm.deal(address(this), 100 ether);
    }
    receive() external payable {}

    function testFuzz_static_context_blocks_every_stateful_opcode(uint8 op, uint8 flag) public {
        op = uint8(bound(op, 0, 5));
        flag = uint8(bound(flag, 0, 3));
        ts.push(address(target));
        cs.push(abi.encodeCall(target.forbiddenUnderStatic, (op)));
        uint256[4] memory flags = [uint256(0xff), 0xfe, 0xfc, 0xfb];
        os.push(flags[flag] << 248);
        vm.expectRevert();
        reader.execute{gas: 150_000}(ts, os, pack(cs), vs);
        os[0] = staticCall(0, 0);
        vm.expectRevert();
        executor.execute{gas: 150_000}(ts, os, pack(cs), vs);
        assertEq(target.total(), 0);
        assertEq(address(target).balance, 0);
    }

    function testFuzz_revert_bytes_bubble_exactly_and_rollback(uint16 length, bytes32 seed) public {
        length = uint16(bound(length, 0, 4096));
        bytes memory reason = new bytes(length);
        for (uint256 i; i < length; ++i) {
            reason[i] = seed[i % 32];
        }
        ts.push(address(target));
        os.push(stateChangingCall(1));
        cs.push(abi.encodeCall(target.add, (42)));
        vs.push(1 ether);
        ts.push(address(target));
        os.push(stateChangingCall());
        cs.push(abi.encodeCall(target.revertBytes, (reason)));
        bytes memory data = abi.encodeCall(executor.execute, (ts, os, pack(cs), vs));
        (bool ok, bytes memory returned) = address(executor).call{value: 2 ether}(data);
        assertFalse(ok);
        assertEq(returned, reason);
        assertEq(target.calls(), 0);
        assertEq(target.total(), 0);
        assertEq(address(target).balance, 0);
        assertEq(address(executor).balance, 0);
        assertEq(address(this).balance, 100 ether);
        // The reader's first call must itself be a read so we actually reach the reverting call.
        cs[0] = hex"112233";
        os[0] = staticCall(0, 0);
        (ok, returned) = address(reader).staticcall(abi.encodeCall(reader.execute, (ts, os, pack(cs), vs)));
        assertFalse(ok);
        assertEq(returned, reason);
    }

    function test_nested_execute_does_not_corrupt_outer_splice() public {
        ReentrantCaller reentrant = new ReentrantCaller(executor, target);
        ts.push(address(reentrant));
        os.push(stateChangingCall(0, 4, 32));
        cs.push(abi.encodeCall(reentrant.nested, (7)));
        ts.push(address(target));
        os.push(stateChangingCall());
        cs.push(abi.encodeCall(target.add, (0)));
        executor.execute(ts, os, pack(cs), vs);
        assertEq(target.calls(), 2);
        assertEq(target.total(), 15);
    }

    function test_refund_callback_can_execute_a_separate_batch() public {
        ReentrantCaller reentrant = new ReentrantCaller(executor, target);
        reentrant.refundBatch{value: 2 ether}();
        assertEq(reentrant.refunds(), 1);
        assertEq(target.calls(), 1);
        assertEq(target.total(), 11);
        assertEq(address(target).balance, 1 ether);
        assertEq(address(reentrant).balance, 1 ether);
        assertEq(address(executor).balance, 0);
    }

    function test_reentrant_signature_replay_cannot_reuse_nonce() public {
        uint256 key = 0xA11CE;
        address eoa = vm.addr(key);
        vm.etch(eoa, address(new SevenSevenZeroTwoCaller()).code);
        SevenSevenZeroTwoCaller account = SevenSevenZeroTwoCaller(payable(eoa));
        ReentrantCaller reentrant = new ReentrantCaller(executor, target);
        ts.push(address(reentrant));
        os.push(stateChangingCall());
        cs.push(abi.encodeCall(reentrant.replay, ()));
        uint256 deadline = block.timestamp + 100;
        bytes32 digest = account.hashExecute(ts, os, pack(cs), vs, 0, deadline);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, digest);
        bytes memory batch =
            abi.encodeCall(account.executeWithSignature, (ts, os, pack(cs), vs, deadline, abi.encodePacked(r, s, v)));
        reentrant.setReplay(eoa, batch);
        (bool ok,) = eoa.call(batch);
        assertTrue(ok);
        assertFalse(reentrant.replaySucceeded());
        assertEq(account.nonce(), 1);
    }

    function test_forced_eth_is_publicly_spendable() public {
        new ForcedEther{value: 1 ether}(payable(address(executor)));
        ts.push(address(target));
        os.push(stateChangingCall(1));
        cs.push(abi.encodeCall(target.add, (1)));
        vs.push(1 ether);
        vm.prank(address(0xBAD));
        executor.execute(ts, os, pack(cs), vs);
        assertEq(address(executor).balance, 0);
        assertEq(address(target).balance, 1 ether);
    }

    function test_reader_and_writer_have_distinct_caller_contexts() public {
        address echo = address(new EchoTarget());
        ts.push(address(target));
        os.push(staticCall(0, 32));
        cs.push(abi.encodeCall(target.caller, ()));
        ts.push(echo);
        os.push(staticCall(0, 0));
        cs.push(abi.encode(uint256(0)));
        bytes[] memory result = reader.execute(ts, os, pack(cs), vs);
        assertEq(result[0], abi.encode(address(reader)));
        assertEq(result[1], result[0]);
        vm.expectCall(echo, abi.encode(address(executor)));
        executor.execute(ts, os, pack(cs), vs);
    }

    function test_false_return_is_data_not_a_revert() public {
        ts.push(address(target));
        os.push(stateChangingCall());
        cs.push(abi.encodeCall(target.returnFalse, ()));
        executor.execute(ts, os, pack(cs), vs);
        bytes[] memory result = reader.execute(ts, os, pack(cs), vs);
        assertFalse(abi.decode(result[0], (bool)));
    }

    function test_public_executor_can_spend_any_allowance_granted_to_it() public {
        MockERC20 token = new MockERC20();
        address victim = address(0xA11CE);
        address thief = address(0xBAD);
        deal(address(token), victim, 10 ether);
        vm.prank(victim);
        token.approve(address(executor), 10 ether);
        ts.push(address(token));
        os.push(stateChangingCall());
        cs.push(abi.encodeCall(token.transferFrom, (victim, thief, 10 ether)));
        vm.prank(thief);
        executor.execute(ts, os, pack(cs), vs);
        assertEq(token.balanceOf(victim), 0);
        assertEq(token.balanceOf(thief), 10 ether);
    }

    function test_false_return_can_be_checked_explicitly_and_roll_back() public {
        ts.push(address(target));
        os.push(stateChangingCall());
        cs.push(abi.encodeCall(target.add, (42)));
        ts.push(address(target));
        os.push(stateChangingCall(0, 4, 32));
        cs.push(abi.encodeCall(target.returnFalse, ()));
        ts.push(address(target));
        os.push(stateChangingCall());
        cs.push(abi.encodeCall(target.requireTrue, (true)));
        vm.expectRevert(bytes("Operation returned false"));
        executor.execute(ts, os, pack(cs), vs);
        assertEq(target.calls(), 0);
        assertEq(target.total(), 0);
    }

    function test_wrong_dynamic_length_can_consume_an_adjacent_argument() public {
        ts.push(address(target));
        ts.push(address(target));
        cs.push(abi.encodeCall(target.twoNumbers, ()));
        // Equivalent to declaring with_length(1), though the producer returns two elements.
        uint256[] memory x = new uint256[](1);
        uint256[] memory y = new uint256[](1);
        cs.push(abi.encodeCall(target.secondNumber, (x, y)));
        uint256[] memory destinations = new uint256[](1);
        uint256[] memory lengths = new uint256[](1);
        uint256[] memory sources = new uint256[](1);
        destinations[0] = 68; // selector + two argument head pointers
        lengths[0] = 64; // original length word (2) plus first element
        sources[0] = 32; // skip producer's ABI head pointer
        os.push(staticCallPartialReturn(destinations, lengths, sources, 96));
        os.push(staticCall(0, 0));
        bytes[] memory observed = reader.execute(ts, os, pack(cs), vs);
        assertEq(abi.decode(observed[1], (uint256)), 1); // reads y.length, NOT the real second value 77
        // Compare the writer with the exact bytes independently reconstructed below.
        bytes memory consumed = abi.encodeCall(target.secondNumber, (x, y));
        assembly ("memory-safe") {
            mstore(add(consumed, 100), 2)
            mstore(add(consumed, 132), 42)
        }
        vm.expectCall(address(target), consumed);
        executor.execute(ts, os, pack(cs), vs);
    }

    function testFuzz_mutated_frames_have_identical_success_semantics(uint256 seed, uint8 count) public {
        address echo = address(new EchoTarget());
        count = uint8(bound(count, 1, 8));
        for (uint256 i; i < count; ++i) {
            ts.push(echo);
            os.push(staticCall(0, 0));
            cs.push(abi.encode(seed, i));
        }
        bytes memory script = pack(cs);
        uint256 choice = seed % 3;
        if (choice == 0) {
            uint256 at = (seed >> 8) % script.length;
            script[at] ^= bytes1(uint8(seed >> 16));
        } else if (choice == 1) {
            os[(seed >> 8) % count] = seed & ~(uint256(0xff) << 240); // values intentionally ignored in both paths
        } else {
            assembly ("memory-safe") { mstore(add(script, 32), seed) }
        }
        (bool writeOk,) = address(executor).call(abi.encodeCall(executor.execute, (ts, os, script, vs)));
        (bool readOk, bytes memory result) =
            address(reader).staticcall(abi.encodeCall(reader.execute, (ts, os, script, vs)));
        assertEq(writeOk, readOk);
        if (readOk) {
            bytes[] memory actual = abi.decode(result, (bytes[]));
            assertEq(actual.length, count);
            for (uint256 i; i < count; ++i) {
                vm.expectCall(echo, actual[i]);
            }
            executor.execute(ts, os, script, vs);
        }
    }
}
