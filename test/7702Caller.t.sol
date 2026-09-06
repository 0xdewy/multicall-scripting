// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {SevenSevenZeroTwoCaller} from "src/7702Caller.sol";
import {MulticallScripter} from "src/MulticallScripter.sol";
import {CallBuilder} from "./CallBuilder.sol";

contract MockTarget {
    uint256 public value;
    address public caller;
    uint256 public callValue;

    function setValue(uint256 _value) external payable {
        value = _value;
        caller = msg.sender;
        callValue = msg.value;
    }
}

/// @dev The EOA is simulated by etching the delegate's runtime code at the EOA address, which is
/// what an EIP-7702 delegation designator resolves to at call time.
contract SevenSevenZeroTwoCallerTest is Test, CallBuilder {
    uint256 constant EOA_KEY = 0xA11CE;
    uint256 constant OTHER_KEY = 0xB0B;

    address eoa = vm.addr(EOA_KEY);
    address relayer = address(0xEE);
    SevenSevenZeroTwoCaller impl;
    SevenSevenZeroTwoCaller account; // the EOA, running the delegate's code
    MockTarget target;

    address[] targets;
    uint256[] offsets;
    bytes[] calldatas;
    uint256[] values;

    function setUp() public {
        impl = new SevenSevenZeroTwoCaller();
        vm.etch(eoa, address(impl).code);
        account = SevenSevenZeroTwoCaller(payable(eoa));
        target = new MockTarget();
        vm.deal(eoa, 10 ether);
        vm.deal(relayer, 1 ether);

        targets.push(address(target));
        calldatas.push(abi.encodeWithSelector(MockTarget.setValue.selector, 42));
        offsets.push(stateChangingCall());
    }

    function _sign(uint256 key, uint256 nonce, uint256 deadline) internal view returns (bytes memory) {
        bytes32 digest = account.hashExecute(targets, offsets, pack(calldatas), values, nonce, deadline);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, digest);
        return abi.encodePacked(r, s, v);
    }

    // ───────────────────────────── self-call path ─────────────────────────────

    function test_execute_as_self() public {
        vm.prank(eoa);
        account.execute(targets, offsets, pack(calldatas), values);

        assertEq(target.value(), 42);
        assertEq(target.caller(), eoa, "calls must originate from the EOA");
    }

    function test_execute_rejects_other_callers() public {
        vm.prank(relayer);
        vm.expectRevert(SevenSevenZeroTwoCaller.Unauthorized.selector);
        account.execute(targets, offsets, pack(calldatas), values);

        vm.expectRevert(SevenSevenZeroTwoCaller.Unauthorized.selector);
        account.execute(targets, offsets, pack(calldatas), values);
    }

    function test_execute_spends_account_balance() public {
        offsets[0] = stateChangingCall(1);
        values.push(1 ether);

        vm.prank(eoa);
        account.execute(targets, offsets, pack(calldatas), values);

        assertEq(target.callValue(), 1 ether);
        assertEq(eoa.balance, 9 ether, "value comes from the account, nothing else leaves");
    }

    function test_receives_eth() public {
        (bool ok,) = eoa.call{value: 1 ether}("");
        assertTrue(ok);
        assertEq(eoa.balance, 11 ether);
    }

    // ───────────────────────────── signature path ─────────────────────────────

    function test_execute_with_signature() public {
        bytes memory sig = _sign(EOA_KEY, 0, block.timestamp + 100);

        vm.prank(relayer);
        account.executeWithSignature(targets, offsets, pack(calldatas), values, block.timestamp + 100, sig);

        assertEq(target.value(), 42);
        assertEq(target.caller(), eoa);
        assertEq(account.nonce(), 1);
    }

    function testFuzz_previous_signature_domains_rejected(uint8 previous) public {
        previous = uint8(bound(previous, 1, 2));
        uint256 deadline = block.timestamp + 100;
        bytes32 oldDomain = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256("MulticallScripter7702"),
                keccak256(bytes(previous == 1 ? "1" : "2")),
                block.chainid,
                eoa
            )
        );
        bytes32 batchHash = keccak256(abi.encode(targets, offsets, pack(calldatas), values));
        bytes32 structHash = keccak256(abi.encode(account.EXECUTE_TYPEHASH(), batchHash, uint256(0), deadline));
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", oldDomain, structHash));
        (uint8 v, bytes32 r, bytes32 sigS) = vm.sign(EOA_KEY, digest);
        vm.expectRevert(SevenSevenZeroTwoCaller.InvalidSignature.selector);
        account.executeWithSignature(targets, offsets, pack(calldatas), values, deadline, abi.encodePacked(r, sigS, v));
        assertEq(account.nonce(), 0);
    }

    function test_signature_covers_frame_padding() public {
        uint256 deadline = block.timestamp + 100;
        bytes memory sig = _sign(EOA_KEY, 0, deadline);
        bytes memory script = pack(calldatas);
        script[script.length - 1] = 0x01;
        vm.expectRevert(SevenSevenZeroTwoCaller.InvalidSignature.selector);
        account.executeWithSignature(targets, offsets, script, values, deadline, sig);
        assertEq(account.nonce(), 0);
    }

    function test_signature_cannot_be_replayed() public {
        uint256 deadline = block.timestamp + 100;
        bytes memory sig = _sign(EOA_KEY, 0, deadline);
        account.executeWithSignature(targets, offsets, pack(calldatas), values, deadline, sig);

        vm.expectRevert(SevenSevenZeroTwoCaller.InvalidSignature.selector);
        account.executeWithSignature(targets, offsets, pack(calldatas), values, deadline, sig);
    }

    function test_signature_expired() public {
        bytes memory sig = _sign(EOA_KEY, 0, block.timestamp - 1);
        vm.expectRevert(SevenSevenZeroTwoCaller.SignatureExpired.selector);
        account.executeWithSignature(targets, offsets, pack(calldatas), values, block.timestamp - 1, sig);
    }

    function test_signature_from_other_key_rejected() public {
        bytes memory sig = _sign(OTHER_KEY, 0, block.timestamp + 100);
        vm.expectRevert(SevenSevenZeroTwoCaller.InvalidSignature.selector);
        account.executeWithSignature(targets, offsets, pack(calldatas), values, block.timestamp + 100, sig);
    }

    function test_signature_bound_to_batch() public {
        bytes memory sig = _sign(EOA_KEY, 0, block.timestamp + 100);
        calldatas[0] = abi.encodeWithSelector(MockTarget.setValue.selector, 1337);

        vm.expectRevert(SevenSevenZeroTwoCaller.InvalidSignature.selector);
        account.executeWithSignature(targets, offsets, pack(calldatas), values, block.timestamp + 100, sig);
    }

    function test_signature_bound_to_values() public {
        bytes memory sig = _sign(EOA_KEY, 0, block.timestamp + 100);
        values.push(1 ether);

        vm.expectRevert(SevenSevenZeroTwoCaller.InvalidSignature.selector);
        account.executeWithSignature(targets, offsets, pack(calldatas), values, block.timestamp + 100, sig);
    }

    function test_signature_bound_to_account() public {
        // same key, same batch, but a signature produced for the implementation's domain
        bytes32 digest = impl.hashExecute(targets, offsets, pack(calldatas), values, 0, block.timestamp + 100);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(EOA_KEY, digest);

        vm.expectRevert(SevenSevenZeroTwoCaller.InvalidSignature.selector);
        account.executeWithSignature(
            targets, offsets, pack(calldatas), values, block.timestamp + 100, abi.encodePacked(r, s, v)
        );
        assertTrue(impl.domainSeparator() != account.domainSeparator());
    }

    function test_malformed_signature_rejected() public {
        vm.expectRevert(SevenSevenZeroTwoCaller.InvalidSignature.selector);
        account.executeWithSignature(targets, offsets, pack(calldatas), values, block.timestamp + 100, hex"deadbeef");
    }

    // A relayer's unspent msg.value goes back to the relayer, never into the account.
    function test_relayer_overpayment_refunded() public {
        bytes memory sig = _sign(EOA_KEY, 0, block.timestamp + 100);

        vm.prank(relayer);
        account.executeWithSignature{value: 0.5 ether}(
            targets, offsets, pack(calldatas), values, block.timestamp + 100, sig
        );

        assertEq(relayer.balance, 1 ether);
        assertEq(eoa.balance, 10 ether);
    }

    function test_failed_call_reverts_and_keeps_nonce() public {
        calldatas[0] = abi.encodeWithSignature("doesNotExist()");
        bytes memory sig = _sign(EOA_KEY, 0, block.timestamp + 100);

        vm.expectRevert(bytes(""));
        account.executeWithSignature(targets, offsets, pack(calldatas), values, block.timestamp + 100, sig);
        assertEq(account.nonce(), 0);
    }

    function test_fuzz_signature_bound_to_chain(uint64 otherChain) public {
        uint256 deadline = block.timestamp + 100;
        bytes memory sig = _sign(EOA_KEY, 0, deadline);
        vm.assume(otherChain != block.chainid);
        vm.chainId(otherChain);
        vm.expectRevert(SevenSevenZeroTwoCaller.InvalidSignature.selector);
        account.executeWithSignature(targets, offsets, pack(calldatas), values, deadline, sig);
        assertEq(account.nonce(), 0);
    }

    function test_fuzz_signature_bound_to_every_input(uint8 field) public {
        uint256 deadline = block.timestamp + 100;
        bytes memory sig = _sign(EOA_KEY, 0, deadline);
        field = uint8(bound(field, 0, 3));
        if (field == 0) targets[0] = address(0xBEEF);
        if (field == 1) offsets[0] ^= 1;
        if (field == 2) calldatas[0] = abi.encodeCall(target.setValue, (43));
        if (field == 3) values.push(1);
        vm.expectRevert(SevenSevenZeroTwoCaller.InvalidSignature.selector);
        account.executeWithSignature(targets, offsets, pack(calldatas), values, deadline, sig);
        assertEq(account.nonce(), 0);
        assertEq(target.value(), 0);
    }

    function test_migration_writing_slot_zero_cannot_revive_a_used_signature() public {
        uint256 deadline = block.timestamp + 100;
        bytes memory sig = _sign(EOA_KEY, 0, deadline);
        account.executeWithSignature(targets, offsets, pack(calldatas), values, deadline, sig);
        // Another delegate's ordinary Solidity storage can overwrite slot zero.
        vm.store(eoa, bytes32(0), bytes32(0));
        vm.expectRevert(SevenSevenZeroTwoCaller.InvalidSignature.selector);
        account.executeWithSignature(targets, offsets, pack(calldatas), values, deadline, sig);
        assertEq(account.nonce(), 1);
    }

    function test_nonce_namespace_matches_erc7201_and_preserves_other_storage() public {
        bytes32 slot =
            keccak256(abi.encode(uint256(keccak256("multicall-scripting.7702.nonce")) - 1)) & ~bytes32(uint256(0xff));
        vm.store(eoa, bytes32(0), bytes32(uint256(999)));
        assertEq(account.nonce(), 0);
        uint256 deadline = block.timestamp + 100;
        account.executeWithSignature(targets, offsets, pack(calldatas), values, deadline, _sign(EOA_KEY, 0, deadline));
        assertEq(vm.load(eoa, slot), bytes32(uint256(1)));
        assertEq(vm.load(eoa, bytes32(0)), bytes32(uint256(999)));
    }

    function testFuzz_malleated_signature_cannot_bypass_nonce(uint256 value) public {
        calldatas[0] = abi.encodeCall(target.setValue, (value));
        uint256 deadline = block.timestamp + 100;
        bytes32 digest = account.hashExecute(targets, offsets, pack(calldatas), values, 0, deadline);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(EOA_KEY, digest);
        bytes32 highS = bytes32(0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141 - uint256(s));
        bytes memory twin = abi.encodePacked(r, highS, uint8(v == 27 ? 28 : 27));
        account.executeWithSignature(targets, offsets, pack(calldatas), values, deadline, twin);
        vm.expectRevert(SevenSevenZeroTwoCaller.InvalidSignature.selector);
        account.executeWithSignature(targets, offsets, pack(calldatas), values, deadline, abi.encodePacked(r, s, v));
        assertEq(account.nonce(), 1);
        assertEq(target.value(), value);
    }

    function test_empty_signed_batch_cancels_pending_nonce() public {
        uint256 deadline = block.timestamp + 100;
        bytes memory pending = _sign(EOA_KEY, 0, deadline);
        address[] memory emptyTargets = new address[](0);
        uint256[] memory emptyWords = new uint256[](0);
        bytes32 digest = account.hashExecute(emptyTargets, emptyWords, hex"", emptyWords, 0, deadline);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(EOA_KEY, digest);
        account.executeWithSignature(emptyTargets, emptyWords, hex"", emptyWords, deadline, abi.encodePacked(r, s, v));
        vm.expectRevert(SevenSevenZeroTwoCaller.InvalidSignature.selector);
        account.executeWithSignature(targets, offsets, pack(calldatas), values, deadline, pending);
        assertEq(target.value(), 0);
        assertEq(account.nonce(), 1);
    }

    function test_deadline_is_inclusive_but_cannot_be_extended() public {
        uint256 deadline = block.timestamp + 100;
        bytes memory sig = _sign(EOA_KEY, 0, deadline);
        vm.expectRevert(SevenSevenZeroTwoCaller.InvalidSignature.selector);
        account.executeWithSignature(targets, offsets, pack(calldatas), values, deadline + 1, sig);
        vm.warp(deadline);
        account.executeWithSignature(targets, offsets, pack(calldatas), values, deadline, sig);
        vm.warp(deadline + 1);
        vm.expectRevert(SevenSevenZeroTwoCaller.SignatureExpired.selector);
        account.executeWithSignature(targets, offsets, pack(calldatas), values, deadline, sig);
    }

    function test_rejected_relayer_refund_rolls_back_nonce_and_calls() public {
        address rejectsEth = address(new MockTarget());
        vm.deal(rejectsEth, 1 ether);
        uint256 deadline = block.timestamp + 100;
        bytes memory sig = _sign(EOA_KEY, 0, deadline);
        vm.prank(rejectsEth);
        vm.expectRevert(MulticallScripter.RefundFailed.selector);
        account.executeWithSignature{value: 1 ether}(targets, offsets, pack(calldatas), values, deadline, sig);
        assertEq(account.nonce(), 0);
        assertEq(target.value(), 0);
        assertEq(rejectsEth.balance, 1 ether);
        assertEq(eoa.balance, 10 ether);
    }

    // executor validation still applies through the wrapper
    function test_invalid_offset_through_wrapper() public {
        offsets[0] = 0;
        vm.prank(eoa);
        vm.expectRevert(abi.encodeWithSelector(MulticallScripter.InvalidOffset.selector, 0));
        account.execute(targets, offsets, pack(calldatas), values);
    }
}
