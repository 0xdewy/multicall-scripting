// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {SevenSevenZeroTwoCaller} from "src/7702Caller.sol";

/// @dev Signature check used by Permit2, Seaport and similar protocols: accounts with code are
/// verified through ERC-1271, accounts without code through ecrecover. A delegated EOA has code.
contract CodeAwareVerifier {
    function isValid(address signer, bytes32 hash, bytes calldata signature) external view returns (bool) {
        if (signer.code.length > 0) {
            (bool ok, bytes memory ret) =
                signer.staticcall(abi.encodeWithSignature("isValidSignature(bytes32,bytes)", hash, signature));
            return ok && ret.length == 32 && abi.decode(ret, (bytes4)) == 0x1626ba7e;
        }
        (bytes32 r, bytes32 s) = abi.decode(signature[:64], (bytes32, bytes32));
        return ecrecover(hash, uint8(signature[64]), r, s) == signer;
    }
}

/// @dev Minimal stand-ins for the receiver checks in ERC-721 `safeTransferFrom` / ERC-1155 transfers.
contract SafeTransferSender {
    function send721(address to) external {
        if (to.code.length > 0) {
            bytes4 ret = IReceiver(to).onERC721Received(msg.sender, address(this), 1, "");
            require(ret == IReceiver.onERC721Received.selector, "ERC721: non receiver");
        }
    }

    function send1155(address to) external {
        if (to.code.length > 0) {
            bytes4 ret = IReceiver(to).onERC1155Received(msg.sender, address(this), 1, 1, "");
            require(ret == IReceiver.onERC1155Received.selector, "ERC1155: rejected");
            uint256[] memory ids = new uint256[](1);
            ret = IReceiver(to).onERC1155BatchReceived(msg.sender, address(this), ids, ids, "");
            require(ret == IReceiver.onERC1155BatchReceived.selector, "ERC1155: batch rejected");
        }
    }
}

interface IReceiver {
    function onERC721Received(address, address, uint256, bytes calldata) external returns (bytes4);
    function onERC1155Received(address, address, uint256, uint256, bytes calldata) external returns (bytes4);
    function onERC1155BatchReceived(address, address, uint256[] calldata, uint256[] calldata, bytes calldata)
        external
        returns (bytes4);
    function supportsInterface(bytes4) external view returns (bool);
    function isValidSignature(bytes32, bytes calldata) external view returns (bytes4);
}

/// @notice A delegated EOA must keep working with protocols that treat accounts with code as
/// contracts: off-chain signatures (Permit2, orders) and token receiver callbacks.
contract SevenSevenZeroTwoCompatTest is Test {
    uint256 constant EOA_KEY = 0xA11CE;
    uint256 constant OTHER_KEY = 0xB0B;

    address eoa = vm.addr(EOA_KEY);
    IReceiver account;
    CodeAwareVerifier verifier;
    SafeTransferSender sender;

    function setUp() public {
        // Same simulation as 7702Caller.t.sol: the EOA runs the delegate's runtime code.
        vm.etch(eoa, address(new SevenSevenZeroTwoCaller()).code);
        account = IReceiver(eoa);
        verifier = new CodeAwareVerifier();
        sender = new SafeTransferSender();
        assertGt(eoa.code.length, 0, "delegation installed");
    }

    function test_offchain_signature_still_verifies_after_delegation() public view {
        bytes32 hash = keccak256("permit");
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(EOA_KEY, hash);
        assertTrue(verifier.isValid(eoa, hash, abi.encodePacked(r, s, v)));
    }

    function test_isValidSignature_accepts_compact_signatures() public view {
        bytes32 hash = keccak256("compact");
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(EOA_KEY, hash);
        // EIP-2098: the top bit of s carries the y-parity (v - 27)
        bytes32 vs = bytes32(uint256(s) | (uint256(v - 27) << 255));
        assertEq(account.isValidSignature(hash, abi.encodePacked(r, vs)), bytes4(0x1626ba7e));
    }

    function test_isValidSignature_rejects_other_signers() public view {
        bytes32 hash = keccak256("permit");
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(OTHER_KEY, hash);
        assertFalse(verifier.isValid(eoa, hash, abi.encodePacked(r, s, v)));
        assertEq(account.isValidSignature(hash, abi.encodePacked(r, s, v)), bytes4(0xffffffff));
    }

    function test_isValidSignature_rejects_malformed_signatures() public view {
        bytes32 hash = keccak256("permit");
        assertEq(account.isValidSignature(hash, hex""), bytes4(0xffffffff));
        assertEq(account.isValidSignature(hash, new bytes(65)), bytes4(0xffffffff));
        assertEq(account.isValidSignature(hash, new bytes(66)), bytes4(0xffffffff));
    }

    function test_receives_erc721_and_erc1155_safe_transfers() public {
        sender.send721(eoa);
        sender.send1155(eoa);
    }

    function test_supportsInterface() public view {
        assertTrue(account.supportsInterface(0x01ffc9a7)); // ERC-165
        assertTrue(account.supportsInterface(0x150b7a02)); // ERC-721 receiver
        assertTrue(account.supportsInterface(0x4e2312e0)); // ERC-1155 receiver
        assertFalse(account.supportsInterface(0xffffffff));
    }
}
