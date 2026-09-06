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
contract SevenSevenZeroTwoCaller is MulticallScripter {
    /// @dev 0x82b42900
    error Unauthorized();
    /// @dev 0x0819bdcd
    error SignatureExpired();
    /// @dev 0x8baa579f
    error InvalidSignature();

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

    function _recover(bytes32 digest, bytes calldata signature) private pure returns (address signer) {
        if (signature.length != 65) revert InvalidSignature();
        bytes32 r = bytes32(signature[0:32]);
        bytes32 s = bytes32(signature[32:64]);
        uint8 v = uint8(signature[64]);
        if (v < 27) v += 27;
        signer = ecrecover(digest, v, r, s);
        if (signer == address(0)) revert InvalidSignature();
    }
}
