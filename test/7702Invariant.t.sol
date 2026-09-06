// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {SevenSevenZeroTwoCaller} from "src/7702Caller.sol";

contract AccountingTarget {
    uint256 public value;
    uint256 public calls;

    function set(uint256 n, bool fail) external payable {
        require(!fail);
        value = n;
        ++calls;
    }
}

import {CallBuilder} from "./CallBuilder.sol";

contract AccountHandler is Test, CallBuilder {
    uint256 constant KEY = 0xA11CE;
    uint256 public constant INITIAL = 100_000 ether;
    address public constant RELAYER = address(0xBEEF);
    SevenSevenZeroTwoCaller public account;
    AccountingTarget public sink;
    uint256 public signedBatches;
    uint256 public successfulCalls;
    uint256 public accountSpent;
    uint256 public relayerSpent;
    uint256 public sent;
    uint256 public lastValue;
    bytes private previousBatch;

    constructor() {
        address eoa = vm.addr(KEY);
        SevenSevenZeroTwoCaller implementation = new SevenSevenZeroTwoCaller();
        vm.etch(eoa, address(implementation).code);
        account = SevenSevenZeroTwoCaller(payable(eoa));
        sink = new AccountingTarget();
        vm.deal(eoa, INITIAL);
        vm.deal(RELAYER, INITIAL);
    }

    function signedBatch(uint96 amountSeed, uint96 contributionSeed, uint256 value, bool fail) external {
        uint256 amount = bound(amountSeed, 0, 1 ether);
        uint256 contribution = bound(contributionSeed, 0, 2 ether);
        uint256 n = fail ? 2 : 1;
        address[] memory targets = new address[](n);
        uint256[] memory offsets = new uint256[](n);
        bytes[] memory inputs = new bytes[](n);
        uint256[] memory values = new uint256[](1);
        values[0] = amount;
        targets[0] = address(sink);
        offsets[0] = (uint256(0xFE) << 248) | (uint256(1) << 240);
        inputs[0] = abi.encodeCall(sink.set, (value, false));
        if (fail) {
            targets[1] = address(sink);
            offsets[1] = uint256(0xFE) << 248;
            inputs[1] = abi.encodeCall(sink.set, (0, true));
        }
        uint256 deadline = block.timestamp + 1;
        bytes32 digest = account.hashExecute(targets, offsets, pack(inputs), values, account.nonce(), deadline);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(KEY, digest);
        bytes memory batch = abi.encodeCall(
            account.executeWithSignature, (targets, offsets, pack(inputs), values, deadline, abi.encodePacked(r, s, v))
        );
        vm.prank(RELAYER);
        (bool ok,) = address(account).call{value: contribution}(batch);
        assertEq(ok, !fail);
        if (ok) {
            previousBatch = batch;
            ++signedBatches;
            ++successfulCalls;
            sent += amount;
            relayerSpent += contribution < amount ? contribution : amount;
            accountSpent += amount > contribution ? amount - contribution : 0;
            lastValue = value;
        }
    }

    function selfBatch(uint96 amountSeed, uint256 value) external {
        uint256 amount = bound(amountSeed, 0, 1 ether);
        address[] memory targets = new address[](1);
        targets[0] = address(sink);
        uint256[] memory offsets = new uint256[](1);
        offsets[0] = (uint256(0xFE) << 248) | (uint256(1) << 240);
        bytes[] memory inputs = new bytes[](1);
        inputs[0] = abi.encodeCall(sink.set, (value, false));
        uint256[] memory values = new uint256[](1);
        values[0] = amount;
        vm.prank(address(account));
        account.execute(targets, offsets, pack(inputs), values);
        ++successfulCalls;
        sent += amount;
        accountSpent += amount;
        lastValue = value;
    }

    function cancelPendingNonce() external {
        address[] memory targets = new address[](0);
        uint256[] memory words = new uint256[](0);
        uint256 deadline = block.timestamp + 1;
        bytes32 digest = account.hashExecute(targets, words, hex"", words, account.nonce(), deadline);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(KEY, digest);
        vm.prank(RELAYER);
        account.executeWithSignature(targets, words, hex"", words, deadline, abi.encodePacked(r, s, v));
        ++signedBatches;
    }

    function otherDelegateStorage(uint256 value) external {
        // Model an ordinary slot-zero write during a delegation change.
        vm.store(address(account), bytes32(0), bytes32(value));
    }

    function replay() external {
        if (previousBatch.length == 0) return;
        vm.prank(RELAYER);
        (bool ok,) = address(account).call(previousBatch);
        assertFalse(ok);
    }

    function unauthorized(uint256 value) external {
        address[] memory targets = new address[](1);
        targets[0] = address(sink);
        uint256[] memory offsets = new uint256[](1);
        offsets[0] = uint256(0xFE) << 248;
        bytes[] memory inputs = new bytes[](1);
        inputs[0] = abi.encodeCall(sink.set, (value, false));
        vm.prank(RELAYER);
        (bool ok,) =
            address(account).call(abi.encodeCall(account.execute, (targets, offsets, pack(inputs), new uint256[](0))));
        assertFalse(ok);
    }
}

contract SevenSevenZeroTwoInvariantTest is Test {
    AccountHandler handler;

    function setUp() public {
        handler = new AccountHandler();
        bytes4[] memory selectors = new bytes4[](6);
        selectors[0] = handler.signedBatch.selector;
        selectors[1] = handler.selfBatch.selector;
        selectors[2] = handler.replay.selector;
        selectors[3] = handler.unauthorized.selector;
        selectors[4] = handler.cancelPendingNonce.selector;
        selectors[5] = handler.otherDelegateStorage.selector;
        targetSelector(FuzzSelector(address(handler), selectors));
        targetContract(address(handler));
    }

    function invariant_nonce_state_and_eth_match_successful_batches() public view {
        assertEq(handler.account().nonce(), handler.signedBatches());
        assertEq(handler.sink().calls(), handler.successfulCalls());
        assertEq(handler.sink().value(), handler.lastValue());
        assertEq(address(handler.account()).balance, handler.INITIAL() - handler.accountSpent());
        assertEq(handler.RELAYER().balance, handler.INITIAL() - handler.relayerSpent());
        assertEq(address(handler.sink()).balance, handler.sent());
        assertEq(handler.accountSpent() + handler.relayerSpent(), handler.sent());
    }
}
