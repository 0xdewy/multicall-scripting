// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.28;

import {MulticallScripter} from "./MulticallScripter.sol";

/// @title SevenSevenZeroTwoCaller
/// @notice EIP-7702 delegate: an EOA that designates this code can run a MulticallScripter batch
/// as itself — its own balance, allowances and msg.sender — with return-value chaining.
///
/// Two entry points, both authorised by the EOA's own key and nothing else:
///  - `execute`: the EOA sends a transaction to itself (msg.sender == address(this)).
///  - `executeWithSignature`: anyone (a relayer / sponsor) submits a batch the EOA signed as
///    EIP-712 typed data, bound to this chain, this account, a nonce and a deadline.
///
/// The only storage is `nonce`, which lives in the delegating EOA's account. There is no owner
/// list, entry point or admin function to misconfigure. Unlike the bare executor this contract
/// accepts ETH, so a script can unwrap WETH into the account.
///
/// Delegation gives the EOA code, and many protocols treat any address with code as a contract:
/// Permit2, Seaport and similar verify its signatures through ERC-1271, and ERC-721 / ERC-1155
/// safe transfers call receiver hooks. The account implements both so it keeps working with them:
/// `isValidSignature` accepts exactly the signatures the EOA key would pass with `ecrecover`.
contract SevenSevenZeroTwoCaller is MulticallScripter {
    /// @dev 0x82b42900
    error Unauthorized();
    /// @dev 0x0819bdcd
    error SignatureExpired();
    /// @dev 0x8baa579f
    error InvalidSignature();
    /// @dev 0x756688fe
    error InvalidNonce();

    bytes32 private constant DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
    bytes32 private constant NAME_HASH = keccak256("MulticallScripter7702");
    bytes32 private constant VERSION_HASH = keccak256("3");
    bytes32 public constant EXECUTE_TYPEHASH = keccak256("Execute(bytes32 batchHash,uint256 nonce,uint256 deadline)");

    // ERC-7201: keccak256(abi.encode(uint256(keccak256(namespace)) - 1)) & ~bytes32(uint256(0xff)).
    // Namespace: multicall-scripting.7702.nonce. Avoid collisions with other delegates' slot zero.
    bytes32 private constant NONCE_SLOT = 0x4241ee3f5a008d1ff7829760ff02d0f163ee67d34e87e7c670a49035bb9f4400;

    /// @notice Next nonce expected by `executeWithSignature`. Stored in the account's namespace.
    function nonce() public view returns (uint256 n) {
        assembly ("memory-safe") { n := sload(NONCE_SLOT) }
    }

    receive() external payable override {}

    /// @notice Skip the signature nonce forward to `newNonce`, cancelling every pending signature
    /// below it, including future-nonce ones. Only the account itself may call.
    function invalidateNonces(uint256 newNonce) external {
        if (msg.sender != address(this)) revert Unauthorized();
        if (newNonce <= nonce()) revert InvalidNonce();
        assembly ("memory-safe") { sstore(NONCE_SLOT, newNonce) }
    }

    /// @notice ERC-1271. Valid exactly when the account's own key signed `hash` (65-byte or
    /// EIP-2098 64-byte signature), matching what an undelegated EOA passes via `ecrecover`.
    function isValidSignature(bytes32 hash, bytes calldata signature) external view returns (bytes4) {
        return _recover(hash, signature) == address(this) ? bytes4(0x1626ba7e) : bytes4(0xffffffff);
    }

    /// @notice ERC-721 / ERC-1155 receiver hooks: `onERC721Received`, `onERC1155Received` and
    /// `onERC1155BatchReceived` return their own selector. Handled here rather than as functions
    /// to keep the selector table (paid on every call) small. Anything else reverts.
    fallback() external {
        assembly ("memory-safe") {
            let sig := shr(224, calldataload(0))
            if or(eq(sig, 0x150b7a02), or(eq(sig, 0xf23a6e61), eq(sig, 0xbc197c81))) {
                mstore(0x00, shl(224, sig))
                return(0x00, 0x20)
            }
            revert(0x00, 0x00)
        }
    }

    /// @notice ERC-165: ERC-165 itself, ERC-721 receiver and ERC-1155 receiver.
    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return interfaceId == 0x01ffc9a7 || interfaceId == 0x150b7a02 || interfaceId == 0x4e2312e0;
    }

    /// @notice Run a batch as this account. Only the account itself may call (EOA self-call).
    function execute(
        address[] calldata targets,
        uint256[] calldata offsets,
        bytes calldata calldatas,
        uint256[] calldata values
    ) public payable override {
        if (msg.sender != address(this)) revert Unauthorized();
        super.execute(targets, offsets, calldatas, values);
    }

    /// @notice Run a batch that this account signed. Callable by anyone before `deadline`.
    /// @dev The signature covers the decoded targets, offsets, packed calldata and values.
    /// Re-encoding those same inputs is harmless; changing any input invalidates the signature.
    /// Each signature is usable exactly once. Domain version 3 separates the namespaced nonce
    /// from earlier releases' slot-zero nonce. Removing delegation does not cancel signatures.
    function executeWithSignature(
        address[] calldata targets,
        uint256[] calldata offsets,
        bytes calldata calldatas,
        uint256[] calldata values,
        uint256 deadline,
        bytes calldata signature
    ) external payable {
        if (block.timestamp > deadline) revert SignatureExpired();
        uint256 currentNonce = nonce();
        uint256 nextNonce = currentNonce + 1;
        assembly ("memory-safe") { sstore(NONCE_SLOT, nextNonce) }
        bytes32 digest = hashExecute(targets, offsets, calldatas, values, currentNonce, deadline);
        if (_recover(digest, signature) != address(this)) revert InvalidSignature();
        super.execute(targets, offsets, calldatas, values);
    }

    /// @notice EIP-712 digest a signer must sign for `executeWithSignature`.
    function hashExecute(
        address[] calldata targets,
        uint256[] calldata offsets,
        bytes calldata calldatas,
        uint256[] calldata values,
        uint256 nonce_,
        uint256 deadline
    ) public view returns (bytes32) {
        bytes32 batchHash = keccak256(abi.encode(targets, offsets, calldatas, values));
        bytes32 structHash = keccak256(abi.encode(EXECUTE_TYPEHASH, batchHash, nonce_, deadline));
        return keccak256(abi.encodePacked("\x19\x01", domainSeparator(), structHash));
    }

    /// @dev Computed per call: under EIP-7702 `address(this)` is the delegating EOA, not the
    /// implementation, so it cannot be cached at construction. Also tracks chain-id changes.
    function domainSeparator() public view returns (bytes32) {
        return keccak256(abi.encode(DOMAIN_TYPEHASH, NAME_HASH, VERSION_HASH, block.chainid, address(this)));
    }

    /// @dev Signer of `digest`, or address(0) for a malformed or invalid signature. Accepts 65-byte
    /// [r][s][v] (v may be 0/1 or 27/28) and EIP-2098 64-byte [r][yParity|s] signatures.
    function _recover(bytes32 digest, bytes calldata signature) private pure returns (address) {
        bytes32 r;
        bytes32 s;
        uint8 v;
        if (signature.length == 65) {
            r = bytes32(signature[0:32]);
            s = bytes32(signature[32:64]);
            v = uint8(signature[64]);
            if (v < 27) v += 27;
        } else if (signature.length == 64) {
            r = bytes32(signature[0:32]);
            bytes32 vs = bytes32(signature[32:64]);
            s = vs & bytes32(type(uint256).max >> 1);
            v = uint8(uint256(vs) >> 255) + 27;
        } else {
            return address(0);
        }
        return ecrecover(digest, v, r, s);
    }
}
