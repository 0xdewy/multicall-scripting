// SPDX-License-Identifier: GPL3
pragma solidity ^0.8.28;

import "forge-std/Test.sol";
import "../src/7702Caller.sol";

contract MockTarget {
    uint256 public value;
    bool public called;
    address public caller;
    uint256 public callValue;

    function setValue(uint256 _value) external payable {
        value = _value;
        called = true;
        caller = msg.sender;
        callValue = msg.value;
    }

    function getValue() external view returns (uint256) {
        return value;
    }

    function revertCall() external pure {
        revert("MockTarget: intentional revert");
    }
}

    uint256 constant AUTHORIZED_KEY = 0x789;
    uint256 constant UNAUTHORIZED_KEY = 0xABC;

contract SevenSevenZeroTwoCallerTest is Test {
    SevenSevenZeroTwoCaller public wallet;
    MockTarget public mockTarget;
    address public entryPoint = address(0x123);
    address public owner = address(0x456);
    address public authorizedUser = vm.addr(AUTHORIZED_KEY);
    address public unauthorizedUser = vm.addr(UNAUTHORIZED_KEY);

    function setUp() public {
        vm.startPrank(owner);
        wallet = new SevenSevenZeroTwoCaller(entryPoint);
        mockTarget = new MockTarget();
        vm.stopPrank();

        // Add authorized user
        vm.prank(owner);
        wallet.addSigner(authorizedUser);
    }

    function testConstructor() public {
        assertEq(wallet.entryPoint(), entryPoint);
        assertTrue(wallet.isAuthorized(owner));
        assertTrue(wallet.isAuthorized(authorizedUser));
        assertFalse(wallet.isAuthorized(unauthorizedUser));
    }

    function testAddSigner() public {
        address newSigner = address(0xDEF);

        vm.prank(owner);
        wallet.addSigner(newSigner);

        assertTrue(wallet.isAuthorized(newSigner));
    }

    function testAddSignerUnauthorized() public {
        address newSigner = address(0xDEF);

        vm.prank(unauthorizedUser);
        vm.expectRevert("7702Caller: unauthorized");
        wallet.addSigner(newSigner);
    }

    function testRemoveSigner() public {
        vm.prank(owner);
        wallet.removeSigner(authorizedUser);

        assertFalse(wallet.isAuthorized(authorizedUser));
    }

    function testRemoveSignerSelf() public {
        vm.prank(owner);
        vm.expectRevert("7702Caller: cannot remove self");
        wallet.removeSigner(owner);
    }

    function testExecuteCall() public {
        uint256 testValue = 42;

        vm.prank(authorizedUser);
        wallet.executeCall(address(mockTarget), 0, abi.encodeWithSelector(MockTarget.setValue.selector, testValue));

        assertEq(mockTarget.value(), testValue);
        assertTrue(mockTarget.called());
        assertEq(mockTarget.caller(), address(wallet));
    }

    function testExecuteCallWithValue() public {
        uint256 testValue = 42;
        uint256 ethValue = 1 ether;

        vm.deal(address(wallet), ethValue);

        vm.prank(authorizedUser);
        wallet.executeCall(
            address(mockTarget), ethValue, abi.encodeWithSelector(MockTarget.setValue.selector, testValue)
        );

        assertEq(mockTarget.value(), testValue);
        assertEq(mockTarget.callValue(), ethValue);
    }

    function testExecuteCallUnauthorized() public {
        vm.prank(unauthorizedUser);
        vm.expectRevert("7702Caller: unauthorized");
        wallet.executeCall(address(mockTarget), 0, abi.encodeWithSelector(MockTarget.setValue.selector, 42));
    }

    function testExecuteBatch() public {
        address[] memory targets = new address[](2);
        uint256[] memory offsets = new uint256[](2);
        bytes[] memory calldatas = new bytes[](2);
        uint256[] memory values = new uint256[](2);

        // Encode offsets for regular calls (CALL_FLAG = 0xFE, VALUE_OFFSET = 248)
        // offset = (CALL_FLAG << 248) | (msgValueIndex << 240) | (memTarget << 120) | resultLength
        // For msgValueIndex = 0, memTarget = 0, resultLength = 0
        uint256 callOffset = 0xFE00000000000000000000000000000000000000000000000000000000000000;

        // First call: set value to 100
        targets[0] = address(mockTarget);
        offsets[0] = callOffset;
        calldatas[0] = abi.encodeWithSelector(MockTarget.setValue.selector, 100);
        values[0] = 0;

        // Second call: set value to 200
        targets[1] = address(mockTarget);
        offsets[1] = callOffset;
        calldatas[1] = abi.encodeWithSelector(MockTarget.setValue.selector, 200);
        values[1] = 0;

        vm.prank(authorizedUser);
        wallet.execute(targets, offsets, calldatas, values);

        assertEq(mockTarget.value(), 200); // Last call wins
    }

    function testExecuteBatchNotEntryPoint() public {
        address[] memory targets = new address[](1);
        uint256[] memory offsets = new uint256[](1);
        bytes[] memory calldatas = new bytes[](1);
        uint256[] memory values = new uint256[](1);

        targets[0] = address(mockTarget);
        offsets[0] = 0;
        calldatas[0] = abi.encodeWithSelector(MockTarget.setValue.selector, 42);
        values[0] = 0;

        vm.prank(unauthorizedUser);
        vm.expectRevert("7702Caller: not entry point or authorized");
        wallet.execute(targets, offsets, calldatas, values);
    }

    function testWithdrawETH() public {
        uint256 initialBalance = 10 ether;
        uint256 withdrawAmount = 5 ether;

        vm.deal(address(wallet), initialBalance);

        address recipient = address(0x999);
        uint256 recipientInitialBalance = recipient.balance;

        vm.prank(authorizedUser);
        wallet.withdrawETH(payable(recipient), withdrawAmount);

        assertEq(address(wallet).balance, initialBalance - withdrawAmount);
        assertEq(recipient.balance, recipientInitialBalance + withdrawAmount);
    }

    function testWithdrawETHUnauthorized() public {
        vm.deal(address(wallet), 10 ether);

        vm.prank(unauthorizedUser);
        vm.expectRevert("7702Caller: unauthorized");
        wallet.withdrawETH(payable(address(0x999)), 5 ether);
    }

    function testWithdrawETHInsufficientBalance() public {
        vm.deal(address(wallet), 1 ether);

        vm.prank(authorizedUser);
        vm.expectRevert("7702Caller: insufficient balance");
        wallet.withdrawETH(payable(address(0x999)), 2 ether);
    }

    function testExecuteDelegateCall() public {
        // Create a simple logic contract
        SimpleLogic logic = new SimpleLogic();

        vm.prank(authorizedUser);
        wallet.executeDelegateCall(address(logic), abi.encodeWithSelector(SimpleLogic.setValue.selector, 999));

        // Check that wallet storage was updated via delegatecall
        // (This would require exposing the value variable in the wallet)
    }

    function testUpdateEntryPoint() public {
        address newEntryPoint = address(0x777);

        vm.prank(owner);
        wallet.updateEntryPoint(newEntryPoint);

        assertEq(wallet.entryPoint(), newEntryPoint);
    }

    function testUpdateEntryPointZeroAddress() public {
        vm.prank(owner);
        vm.expectRevert("7702Caller: zero address");
        wallet.updateEntryPoint(address(0));
    }

    function testReceiveETH() public {
        uint256 amount = 1 ether;

        vm.deal(address(this), amount);
        (bool success,) = address(wallet).call{value: amount}("");

        assertTrue(success);
        assertEq(address(wallet).balance, amount);
    }

    function testGetNextNonce() public {
        assertEq(wallet.getNextNonce(authorizedUser), 0);

        // After authorization verification, nonce should increment
        // (Testing executeWithAuthorization would require signature generation)
    }

    function testGetDomainSeparator() public {
        bytes32 domainSeparator = wallet.getDomainSeparator();
        assertTrue(domainSeparator != bytes32(0));
    }

    function test_executeWithAuthorization_valid_sig() public {
        uint256 nonce = wallet.getNextNonce(authorizedUser);
        uint256 expiry = block.timestamp + 1000;

        // Build EIP-712 typed data hash
        bytes32 typehash = wallet.EIP7702_TYPEHASH();
        bytes32 structHash = keccak256(abi.encode(typehash, authorizedUser, nonce, expiry));
        bytes32 domainSeparator = wallet.getDomainSeparator();
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", domainSeparator, structHash));

        // Sign with authorizedUser's key
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(AUTHORIZED_KEY, digest);
        bytes memory signature = abi.encodePacked(r, s, v);

        SevenSevenZeroTwoCaller.Authorization memory auth = SevenSevenZeroTwoCaller.Authorization({
            authority: authorizedUser,
            nonce: nonce,
            expiry: expiry,
            signature: signature
        });

        address[] memory targets = new address[](1);
        uint256[] memory offsets = new uint256[](1);
        bytes[] memory calldatas = new bytes[](1);
        uint256[] memory values = new uint256[](1);

        uint256 callOffset = 0xFE00000000000000000000000000000000000000000000000000000000000000;
        targets[0] = address(mockTarget);
        offsets[0] = callOffset;
        calldatas[0] = abi.encodeWithSelector(MockTarget.setValue.selector, 42);
        values[0] = 0;

        wallet.executeWithAuthorization(targets, offsets, calldatas, values, auth);

        assertEq(mockTarget.value(), 42);
        assertEq(wallet.getNextNonce(authorizedUser), 1);
    }

    function test_executeWithAuthorization_expired() public {
        uint256 nonce = wallet.getNextNonce(authorizedUser);
        uint256 expiry = 0; // expired (block.timestamp >= 1 on any running chain)

        bytes32 typehash = wallet.EIP7702_TYPEHASH();
        bytes32 structHash = keccak256(abi.encode(typehash, authorizedUser, nonce, expiry));
        bytes32 domainSeparator = wallet.getDomainSeparator();
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", domainSeparator, structHash));

        (uint8 v, bytes32 r, bytes32 s) = vm.sign(AUTHORIZED_KEY, digest);
        bytes memory signature = abi.encodePacked(r, s, v);

        SevenSevenZeroTwoCaller.Authorization memory auth = SevenSevenZeroTwoCaller.Authorization({
            authority: authorizedUser,
            nonce: nonce,
            expiry: expiry,
            signature: signature
        });

        address[] memory targets = new address[](1);
        uint256[] memory offsets = new uint256[](1);
        bytes[] memory calldatas = new bytes[](1);
        uint256[] memory values = new uint256[](1);
        targets[0] = address(mockTarget);
        offsets[0] = 0;
        calldatas[0] = "";
        values[0] = 0;

        vm.expectRevert("7702Caller: invalid authorization");
        wallet.executeWithAuthorization(targets, offsets, calldatas, values, auth);
    }

    function test_executeWithAuthorization_replay() public {
        uint256 nonce = wallet.getNextNonce(authorizedUser);
        uint256 expiry = block.timestamp + 1000;

        bytes32 typehash = wallet.EIP7702_TYPEHASH();
        bytes32 structHash = keccak256(abi.encode(typehash, authorizedUser, nonce, expiry));
        bytes32 domainSeparator = wallet.getDomainSeparator();
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", domainSeparator, structHash));

        (uint8 v, bytes32 r, bytes32 s) = vm.sign(AUTHORIZED_KEY, digest);
        bytes memory signature = abi.encodePacked(r, s, v);

        SevenSevenZeroTwoCaller.Authorization memory auth = SevenSevenZeroTwoCaller.Authorization({
            authority: authorizedUser,
            nonce: nonce,
            expiry: expiry,
            signature: signature
        });

        address[] memory targets = new address[](1);
        uint256[] memory offsets = new uint256[](1);
        bytes[] memory calldatas = new bytes[](1);
        uint256[] memory values = new uint256[](1);
        uint256 callOffset = 0xFE00000000000000000000000000000000000000000000000000000000000000;
        targets[0] = address(mockTarget);
        offsets[0] = callOffset;
        calldatas[0] = abi.encodeWithSelector(MockTarget.setValue.selector, 42);
        values[0] = 0;

        // First use should succeed
        wallet.executeWithAuthorization(targets, offsets, calldatas, values, auth);
        assertEq(wallet.getNextNonce(authorizedUser), 1);

        // Second use with same authorization should fail (nonce mismatch)
        vm.expectRevert("7702Caller: invalid authorization");
        wallet.executeWithAuthorization(targets, offsets, calldatas, values, auth);
    }
}

contract SimpleLogic {
    uint256 public value;

    function setValue(uint256 _value) external {
        value = _value;
    }
}
