// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.28;

/// @dev Offset-word bit layouts. The canonical definition is schema/offset-schema.json; the JS and
/// Rust layers derive their constants from it and this file mirrors it by hand.
contract Constants {
    uint256 constant PARTIAL_RETURN_VARS = 3;

    uint256 constant STATIC_CALL_FLAG = 0xFF;
    uint256 constant CALL_FLAG = 0xFE;
    uint256 constant STATIC_CALL_PARTIAL_RETURN_FLAG = 0xFC;
    uint256 constant CALL_PARTIAL_RETURN_FLAG = 0xFB;

    // calltype lives in the top byte of every offset word
    uint256 constant VALUE_OFFSET = 248;
}

/// @title MulticallScripter
/// @notice Stateless, permissionless executor for a sequence of calls whose return data can be
/// spliced into the calldata of later calls, all inside one transaction.
///
/// Trust model: the caller supplies every target, calldata, offset word and value. The contract
/// only guarantees that it executes the calls in order, splices return data exactly as the offset
/// words describe, and reverts (bubbling the callee's revert data) if any call fails.
///
/// Because anyone can call `execute`, anything left in this contract — tokens, allowances, ETH —
/// is claimable by anyone. Scripts must move every asset out before the transaction ends.
/// Unspent `msg.value` is refunded to the caller automatically; ETH sent outside `execute` is
/// rejected.
///
/// Offset word layouts (bit positions, MSB first):
///   regular (0xFF static, 0xFE call):
///     [8 calltype][8 valueIndex][120 memTarget][120 returnSize]
///   partial return (0xFC static, 0xFB call):
///     [8 calltype][8 valueIndex][3×40 memTargets][3×16 resultLengths][3×16 returnOffsets]
///     [16 returnDataSize][8 numVars]
///
/// - valueIndex is 1-based into `values` (0 = send no ETH); only read for 0xFE / 0xFB.
/// - memTarget(s) are byte offsets relative to the start of the *next* call's calldata.
/// - returnSize (regular) / returnDataSize (partial) is the number of return-data bytes the callee
///   must produce; fewer is a revert. Regular calls copy those bytes straight to memTarget; partial
///   calls copy `numVars` slices (returnOffset, resultLength) → memTarget.
contract MulticallScripter is Constants {
    /// @dev 0xff633a38 — targets/offsets/frame counts must match; frames must be word-padded
    error LengthMismatch();
    /// @dev 0x6115f2de — unknown calltype byte, or more than 3 partial-return vars
    error InvalidOffset(uint256 offset);
    /// @dev 0xd558ad4e — a return-data write would land outside the calldata region
    error InvalidMemoryTarget();
    /// @dev 0x3b1a9b29 — valueIndex exceeds values.length
    error InvalidValueIndex();
    /// @dev 0xcbce8a22 — callee returned fewer bytes than the offset word requires
    error InsufficientReturnData();
    /// @dev 0xf0c49d44 — could not refund unspent msg.value to the caller
    error RefundFailed();
    /// @dev 0x60f8f321 — direct ETH transfers are rejected; send value through execute()
    error EthNotAccepted();

    receive() external payable virtual {
        revert EthNotAccepted();
    }

    /// @notice Execute packed calldata frame `i` against `targets[i]` in order, splicing return data into
    /// later calls as described by `offsets[i]`. Reverts on the first failing call.
    /// @param calldatas Concatenated [uint256 length][call bytes padded to 32] frames.
    /// @param values ETH amounts referenced by valueIndex. Unspent msg.value is refunded.
    function execute(
        address[] calldata targets,
        uint256[] calldata offsets,
        bytes calldata calldatas,
        uint256[] calldata values
    ) public payable virtual {
        if (targets.length != offsets.length || calldatas.length % 32 != 0) {
            revert LengthMismatch();
        }

        assembly ("memory-safe") {
            function fail(selector) {
                mstore(0x00, selector)
                revert(0x1c, 0x04)
            }
            function failOffset(offset) {
                mstore(0x00, shl(224, 0x6115f2de)) // InvalidOffset(uint256)
                mstore(0x04, offset)
                revert(0x00, 0x24)
            }

            // Copy partial slices directly from the EVM return-data buffer. No scratch allocation
            // or intermediate copy is needed; all slices read the same immutable return data.
            function splice(offset, nextArgs) {
                let retSize := and(shr(8, offset), 0xFFFF)
                let numVars := and(offset, 0xFF)
                if lt(returndatasize(), retSize) { fail(0xcbce8a22) } // InsufficientReturnData()
                if gt(numVars, 0) {
                    let size := and(shr(104, offset), 0xFFFF)
                    let source := and(shr(56, offset), 0xFFFF)
                    let dest := add(nextArgs, and(shr(200, offset), 0xFFFFFFFFFF))
                    if gt(add(dest, size), mload(0x40)) { fail(0xd558ad4e) } // InvalidMemoryTarget()
                    if gt(add(source, size), retSize) { fail(0xcbce8a22) } // InsufficientReturnData()
                    returndatacopy(dest, source, size)
                }
                if gt(numVars, 1) {
                    let size := and(shr(88, offset), 0xFFFF)
                    let source := and(shr(40, offset), 0xFFFF)
                    let dest := add(nextArgs, and(shr(160, offset), 0xFFFFFFFFFF))
                    if gt(add(dest, size), mload(0x40)) { fail(0xd558ad4e) } // InvalidMemoryTarget()
                    if gt(add(source, size), retSize) { fail(0xcbce8a22) } // InsufficientReturnData()
                    returndatacopy(dest, source, size)
                }
                if gt(numVars, 2) {
                    let size := and(shr(72, offset), 0xFFFF)
                    let source := and(shr(24, offset), 0xFFFF)
                    let dest := add(nextArgs, and(shr(120, offset), 0xFFFFFFFFFF))
                    if gt(add(dest, size), mload(0x40)) { fail(0xd558ad4e) } // InvalidMemoryTarget()
                    if gt(add(source, size), retSize) { fail(0xcbce8a22) } // InsufficientReturnData()
                    returndatacopy(dest, source, size)
                }
            }

            function callValue(offset) -> value {
                let idx := byte(1, offset)
                if idx {
                    if gt(idx, calldataload(sub(mload(0x20), 0x20))) { fail(0x3b1a9b29)} // InvalidValueIndex()
                    value := calldataload(add(mload(0x20), shl(5, sub(idx, 1))))
                    mstore(0x60, add(mload(0x60), value))
                }
            }

            function bubble() {
                let data := mload(0x40)
                returndatacopy(data, 0, returndatasize())
                revert(data, returndatasize())
            }

            // Dispatch once. Each branch performs exactly one call and only its own decoding.
            function step(target, offset, args, argsLen, nextArgs) {
                switch shr(248, offset)
                case 0xFC {
                    if gt(and(offset, 0xFF), PARTIAL_RETURN_VARS) { failOffset(offset) }
                    if iszero(staticcall(gas(), target, args, argsLen, 0, 0)) { bubble() }
                    splice(offset, nextArgs)
                    leave
                }
                case 0xFB {
                    if gt(and(offset, 0xFF), PARTIAL_RETURN_VARS) { failOffset(offset) }
                    let value := callValue(offset)
                    if iszero(call(gas(), target, value, args, argsLen, 0, 0)) { bubble() }
                    splice(offset, nextArgs)
                    leave
                }
                default { failOffset(offset) }
            }

            // Packed frames are [length][calldata padded to 32]. Every byte of this buffer is
            // part of the signed input, so one copy replaces per-element ABI normalization.
            let ptr := mload(0x40)
            let regionEnd := add(ptr, calldatas.length)
            calldatacopy(ptr, calldatas.offset, calldatas.length)
            mstore(0x40, regionEnd)

            // The value table is cold-path metadata. Scratch slots avoid keeping it live on
            // the stack across every static call; callees have their own EVM memory.
            let targetDelta := sub(targets.offset, offsets.offset)
            mstore(0x20, values.offset)
            // Temporarily use the zero slot for spent ETH; restore it before returning to Solidity.
            mstore(0x60, 0)

            // ---- 2. Run the calls
            let offsetsEnd := add(offsets.offset, shl(5, offsets.length))
            for { let head := offsets.offset } lt(head, offsetsEnd) { head := add(head, 0x20) } {
                let argsLen := mload(ptr)
                let args := add(ptr, 0x20)
                ptr := add(args, and(add(argsLen, 31), not(31)))
                // The length bound rejects wraparound; the padded end bound includes the header.
                // regionEnd is backed by the memory already expanded by calldatacopy above.
                if or(gt(argsLen, regionEnd), gt(ptr, regionEnd)) { fail(0xd558ad4e) }
                let offset := calldataload(head)
                let target := calldataload(add(head, targetDelta))
                let nextArgs := add(ptr, 0x20)
                if eq(shr(248, offset), 0xFF) {
                    let size := and(offset, 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF)
                    if iszero(size) {
                        if iszero(staticcall(gas(), target, args, argsLen, 0, 0)) { bubble() }
                        continue
                    }
                    let dest := add(nextArgs, and(shr(120, offset), 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF))
                    if gt(add(dest, size), mload(0x40)) { fail(0xd558ad4e) }
                    if iszero(staticcall(gas(), target, args, argsLen, dest, size)) { bubble() }
                    if lt(returndatasize(), size) { fail(0xcbce8a22) }
                    continue
                }
                if eq(shr(248, offset), 0xFE) {
                    let value := callValue(offset)
                    let size := and(offset, 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF)
                    if iszero(size) {
                        if iszero(call(gas(), target, value, args, argsLen, 0, 0)) { bubble() }
                        continue
                    }
                    let dest := add(nextArgs, and(shr(120, offset), 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF))
                    if gt(add(dest, size), mload(0x40)) { fail(0xd558ad4e) }
                    if iszero(call(gas(), target, value, args, argsLen, dest, size)) { bubble() }
                    if lt(returndatasize(), size) { fail(0xcbce8a22) }
                    continue
                }
                step(target, offset, args, argsLen, nextArgs)
            }

            // The frame count must exactly match the target/offset count.
            if iszero(eq(ptr, mload(0x40))) { fail(0xff633a38) } // LengthMismatch()

            // ---- 3. Refund unspent msg.value so nothing is left for the next caller to sweep
            if gt(callvalue(), mload(0x60)) {
                if iszero(call(gas(), caller(), sub(callvalue(), mload(0x60)), 0x00, 0x00, 0x00, 0x00)) {
                    fail(0xf0c49d44) // RefundFailed()
                }
            }
            mstore(0x60, 0)
        }
    }
}
