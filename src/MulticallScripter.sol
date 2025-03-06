// SPDX-License-Identifier: GPL3
pragma solidity ^0.8.28;

contract Constants {
    uint256 constant PARTIAL_RETURN_VARS = 3;
    uint256 constant STATIC_CALL_FLAG = 0xFF;
    uint256 constant CALL_FLAG = 0xFE;
    uint256 constant DELEGATE_CALL_FLAG = 0xFD;
    uint256 constant STATIC_CALL_PARTIAL_RETURN_FLAG = 0xFC;

    uint256 constant PARTIAL_RETURN_MEM_TARGET_FLAG_INDIVIDUAL = 0xFFFFFFFFFF;
    // TODO: does the compiler remove redundant flags??
    uint256 constant PARTIAL_RETURN_RES_LENGTH_FLAG = 0xFFFFFFFFFFFF;
    uint256 constant PARTIAL_RETURN_RET_OFFSET_FLAG = 0xFFFFFFFFFFFF;

    uint256 constant VALUE_OFFSET = 248;
}

contract MulticallScripter is Constants {
    /*
        Set all calls in memory and use return data in subsequent calls
        TODO: is it possible to avoid storing byte array lengths in memory

    */
    function execute(
        address[] calldata targets,
        uint256[] calldata offsets,
        bytes[] calldata calldatas,
        uint256[] calldata values
    ) public payable {
        // Note: calldata byte array is encoded as follows:
        // [length(dataOffset), offset1, offset2, length1, data1, length2, data2]
        assembly {
            let calldataOffset := mload(0x40)

            // copy all calldata to memory to be used for calls later
            // NOTE: shl(5, calldatas.length) == mul(calldatas.length, 32)
            // TODO: get total size of the byte array instead of calldatasize
            calldatacopy(calldataOffset, add(calldatas.offset, shl(5, calldatas.length)), calldatasize())

            // update free memory
            mstore(0x40, add(calldataOffset, calldatasize()))

            let i := 0
            // loop through all calls and execute in order
            for {} lt(i, calldatas.length) { i := add(i, 1) } {
                // shl(5,i) == mul(i, 32)
                let target := calldataload(add(targets.offset, shl(5, i)))
                let offset := calldataload(add(offsets.offset, shl(5, i)))

                // clear upper bits and get the size of the return data
                let returnSize := shr(136, shl(136, offset))
                let calldataLen := mload(calldataOffset)
                // get the length of calldata at the nearest 32 byte interval
                let lengthPadded := add(calldataLen, sub(32, mod(calldataLen, 32)))
                // preserve the start location of this calls calldata
                let dataStart := add(calldataOffset, 0x20)
                // TODO: fuzz test this
                calldataOffset := add(calldataOffset, add(0x20, lengthPadded))
                // clear upper bits and retrieve return data offset
                let returnOffset := add(add(calldataOffset, 0x20), shr(136, shl(16, offset)))
                // 0 = no value sent, 0x01-0xFFF0 = index into params
                let callType := shr(VALUE_OFFSET, offset)

                // staticall(gas, address, argsOffset, argssize, retOffset, retSize)
                if eq(callType, STATIC_CALL_FLAG) {
                    // make staticcall and bubble up revert
                    if iszero(staticcall(gas(), target, dataStart, calldataLen, returnOffset, returnSize)) {
                        returndatacopy(0x00, 0x00, returndatasize())
                        revert(0x00, returndatasize())
                    }

                    continue
                }

                // clean calltype flag and extract value flag
                let value := shr(VALUE_OFFSET, shl(8, offset))
                // avoid jumpi by multiplying by result of conditional (if msg.value is being used)
                let msgValue := mul(gt(value, 0), calldataload(add(values.offset, sub(shl(5, value), 0x20))))

                // call (0xFE)
                if eq(callType, sub(STATIC_CALL_FLAG, 1)) {
                    // call(gas, address, value, argsOffset, argssize, retOffset, retSize)
                    if iszero(call(gas(), target, msgValue, dataStart, lengthPadded, returnOffset, returnSize)) {
                        returndatacopy(0x00, 0x00, returndatasize())
                        revert(0x00, returndatasize())
                    }

                    continue
                }

                // delegate call (0xFD)
                if eq(callType, sub(STATIC_CALL_FLAG, 2)) {
                    // TODO: delegate call?
                    continue
                }

                // static call with partial return (0xFC)
                if eq(callType, sub(STATIC_CALL_FLAG, 3)) {
                    // TODO: static call with partial return data
                    /*
                        TODO: if need to use only part of the return data we have to save the whole return o memory and then memcopy the segment that we want into the correct place

                        - if so, make static call and save data temporarily to free memory
                        - use offset to figure out data offset + size to memcopy
                    */

                    // return size is modified for this type of call
                    let retSize := shr(8, and(0xFFFF, offset))
                    let free_mem := mload(0x40)
                    mstore(0x40, add(free_mem, retSize))

                    // make static call and save results to free memory to mcopy variables
                    if iszero(staticcall(gas(), target, dataStart, calldataLen, free_mem, retSize)) {
                        returndatacopy(0x00, 0x00, returndatasize())
                        revert(0x00, returndatasize())
                    }

                    // loop through return data and memcpy to correct position
                    //
                    //             current calldata             next calldata (needs data)          extract some vars from return
                    // <calldata_for_current_static_call><null, 0x30, null, 0x40><other_calldata><return_data:var1, var2, var3>

                    // requirements:
                    // offset of return data
                    // offset where data should go in memory
                    // length of each variable to be copied
                    // only have 240 bits for all of this, so will only support 3 variables...
                    // this puts a limitation of approx 1mil size for memTarget, return data offset, variable length

                    // NOTE: offset has a different structure here
                    //     8           8      120 (40x3)    48 (16x3)       48 (16x3)        16          8
                    // <calltype><valueIndex><memTargets><resultLengths><returnOffsets><resultLength><num_vars>
                    let o := offset
                    let calldata_start := add(calldataOffset, 0x20)

                    // TODO: just use masks (deploys cost higher, runtime lower)
                    // remove calltype + value index and shift to right
                    let memTargets := shr(136, shl(16, o))
                    // let memTargets := and(shl(120, PARTIAL_RETURN_MEM_TARGET_FLAG), o);
                    // remove calltype + value + memTargets
                    let resLengths := and(PARTIAL_RETURN_RES_LENGTH_FLAG, shr(72, o))
                    // remove calltype + value + memTargets + resultLengths
                    let retDatas := and(PARTIAL_RETURN_RET_OFFSET_FLAG, shr(24, o))

                    let num_vars := byte(31, o)

                    let u := 0
                    for {} lt(u, num_vars) { u := add(u, 1) } {
                        // where in memory to memcpy data to
                        let memTarget :=
                            and(PARTIAL_RETURN_MEM_TARGET_FLAG_INDIVIDUAL, shr(mul(40, sub(2, u)), memTargets))
                        memTarget := add(memTarget, calldata_start)

                        // number of bytes to shr to access vars at this index
                        let var_index := mul(16, sub(2, u))

                        // the length of data to memcpy
                        let resLength := and(0xFF, shr(var_index, resLengths))

                        // the offset of the return data to memcpy
                        let returnDataOffset := and(0xFF, shr(var_index, retDatas))
                        returnDataOffset := add(free_mem, returnDataOffset)

                        // destOffset, offsetToCopyFrom, size
                        mcopy(memTarget, returnDataOffset, resLength)
                        continue
                    }
                    // TODO: is it worth it to clear memory??
                    continue
                }

                // TODO: 0x420 is not a very descriptive error message
                mstore(0x00, 0x420)
                revert(0x00, 0x20)
            }
        }
    }
}
