// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.28;

import {Constants} from "./MulticallScripter.sol";

/// @title MulticallScripterReadOnly
/// @notice Read-only twin of `MulticallScripter`: same arguments, same offset-word encoding, same
/// splicing, but every call is a `staticcall` and the function returns the complete return data
/// of every call. Use it through `eth_call` to evaluate a chain of reads (reserves → quote →
/// health factor …) in one round trip, with the intermediate values visible.
///
/// Differences from the executor:
/// - `view`: state-changing calls (0xFE / 0xFB offset words are accepted) run as `staticcall`, so
///   a callee that writes reverts. `values` is ignored; no ETH can be sent.
/// - returns `bytes[]` with one entry per call holding that call's full return data, regardless
///   of how much of it the offset word spliced onward.
/// - has no asset recovery path. Never send tokens to this address.
///
/// Memory layout: [calldata region][0x20][n][ptr_0..ptr_n-1][entry_0]...[entry_n-1]. Each call's
/// return data is appended as the next entry and slices are `mcopy`'d from there into the region,
/// so the result array doubles as the splice source and is returned without re-encoding.
contract MulticallScripterReadOnly is Constants {
    /// @dev 0xff633a38 — targets/offsets/frame counts must match; frames must be word-padded
    error LengthMismatch();
    /// @dev 0x6115f2de — unknown calltype byte, or more than 3 partial-return vars
    error InvalidOffset(uint256 offset);
    /// @dev 0xd558ad4e — a return-data write would land outside the calldata region
    error InvalidMemoryTarget();
    /// @dev 0xcbce8a22 — callee returned fewer bytes than the offset word requires
    error InsufficientReturnData();

    /// @notice Run packed calldata frame `i` against `targets[i]` as static calls, splicing return data into
    /// later calls per `offsets[i]`, and return every call's return data.
    function execute(
        address[] calldata targets,
        uint256[] calldata offsets,
        bytes calldata calldatas,
        uint256[] calldata /* values: unused, kept for interface parity */
    ) external view returns (bytes[] memory) {
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

            // partial layout: copy numVars (returnOffset, resultLength) slices of `data` (size bytes
            // of return data) to their memTargets relative to nextArgs
            function splice(offset, data, size, nextArgs, regionEnd) {
                let retSize := and(shr(8, offset), 0xFFFF)
                let numVars := and(offset, 0xFF)
                if gt(numVars, PARTIAL_RETURN_VARS) { failOffset(offset) }
                if lt(size, retSize) { fail(0xcbce8a22) } // InsufficientReturnData()

                for { let u := 0 } lt(u, numVars) { u := add(u, 1) } {
                    let s := mul(16, sub(2, u))
                    let resLength := and(shr(add(72, s), offset), 0xFFFF)
                    let retOffset := and(shr(add(24, s), offset), 0xFFFF)
                    let memTarget := add(nextArgs, and(shr(add(120, mul(40, sub(2, u))), offset), 0xFFFFFFFFFF))

                    if gt(add(memTarget, resLength), regionEnd) { fail(0xd558ad4e) } // InvalidMemoryTarget()
                    if gt(add(retOffset, resLength), retSize) { fail(0xcbce8a22) } // InsufficientReturnData()
                    mcopy(memTarget, add(data, retOffset), resLength)
                }
            }

            // runs call i whose [len][data] sits at ptr, appends its return data as the bytes entry
            // at `free`, splices per the offset word; returns the next ptr and the next free slot
            function step(targetsOff, offsetsOff, i, ptr, regionEnd, free) -> nextPtr, nextFree {
                let target := calldataload(add(targetsOff, shl(5, i)))
                let offset := calldataload(add(offsetsOff, shl(5, i)))
                let calltype := shr(VALUE_OFFSET, offset)
                let isPartial :=
                    or(eq(calltype, STATIC_CALL_PARTIAL_RETURN_FLAG), eq(calltype, CALL_PARTIAL_RETURN_FLAG))
                if iszero(or(isPartial, or(eq(calltype, STATIC_CALL_FLAG), eq(calltype, CALL_FLAG)))) {
                    failOffset(offset)
                }

                let argsLen := mload(ptr)
                let args := add(ptr, 0x20)
                nextPtr := add(args, and(add(argsLen, 31), not(31)))
                if or(gt(argsLen, regionEnd), gt(nextPtr, regionEnd)) { fail(0xd558ad4e) }

                if iszero(staticcall(gas(), target, add(ptr, 0x20), argsLen, 0x00, 0x00)) {
                    let data := mload(0x40)
                    returndatacopy(data, 0x00, returndatasize())
                    revert(data, returndatasize())
                }
                let size := returndatasize()
                let data := add(free, 0x20)
                mstore(free, size)
                returndatacopy(data, 0x00, size)
                nextFree := add(data, and(add(size, 31), not(31)))

                switch isPartial
                // regular: [8][8][120 memTarget][120 returnSize]
                case 0 {
                    let retSize := and(offset, 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF)
                    if retSize {
                        if lt(size, retSize) { fail(0xcbce8a22)} // InsufficientReturnData()
                        let memTarget :=
                            add(add(nextPtr, 0x20), and(shr(120, offset), 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF))
                        if gt(add(memTarget, retSize), regionEnd) { fail(0xd558ad4e) } // InvalidMemoryTarget()
                        mcopy(memTarget, data, retSize)
                    }
                }
                default { splice(offset, data, size, add(nextPtr, 0x20), regionEnd) }
            }

            // Copy the packed, signed calldata frames once.
            let ptr := mload(0x40)
            let regionEnd := add(ptr, calldatas.length)
            calldatacopy(ptr, calldatas.offset, calldatas.length)

            // ---- 2. Result header right after the region: [0x20][n][ptr_i ...]; entries follow
            let ret := regionEnd
            mstore(ret, 0x20)
            mstore(add(ret, 0x20), targets.length)
            let heads := add(ret, 0x40)
            let free := add(heads, shl(5, targets.length))
            mstore(0x40, free)

            // ---- 3. Run the calls, appending each return data as the next entry
            for { let i := 0 } lt(i, targets.length) { i := add(i, 1) } {
                // element pointers are relative to the first element slot (after the length word)
                mstore(add(heads, shl(5, i)), sub(free, heads))
                ptr, free := step(targets.offset, offsets.offset, i, ptr, regionEnd, free)
            }

            if iszero(eq(ptr, regionEnd)) { fail(0xff633a38) } // LengthMismatch()
            return(ret, sub(free, ret))
        }
    }
}
