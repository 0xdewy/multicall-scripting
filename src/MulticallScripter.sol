// SPDX-License-Identifier: GPL3
pragma solidity ^0.8.28;

contract Constants {
    uint256 constant PARTIAL_RETURN_VARS = 3;
    uint256 constant STATIC_CALL_FLAG = 0xFF;
    uint256 constant CALL_FLAG = 0xFE;
    uint256 constant DELEGATE_CALL_FLAG = 0xFD;
    uint256 constant STATIC_CALL_PARTIAL_RETURN_FLAG = 0xFC;
    uint256 constant CALL_PARTIAL_RETURN_FLAG = 0xFB;

    uint256 constant PARTIAL_RETURN_MEM_TARGET_FLAG_INDIVIDUAL = 0xFFFFFFFFFF;
    // TODO: does the compiler remove redundant flags??
    uint256 constant PARTIAL_RETURN_RES_LENGTH_FLAG = 0xFFFFFFFFFFFF;
    uint256 constant PARTIAL_RETURN_RET_OFFSET_FLAG = 0xFFFFFFFFFFFF;

    uint256 constant VALUE_OFFSET = 248;
}

contract MulticallScripter is Constants {
    // 0x8f61746f
    error InvalidCalltype(uint256 calltype);
    // 0xd558ad4e
    error InvalidMemoryTarget();

    /*
      This contract is a stateless executor. It must never hold token balances or
      be granted allowances — any such funds would be accessible to any caller.
      ETH sent directly (outside of execute()) is rejected.
    */
    receive() external payable virtual {
        revert("MulticallScripter: ETH not accepted");
    }

    /*
      Execute a sequence of calls with the ability to use return data in subsequent calls.
    */
    function execute(
        address[] calldata targets,
        uint256[] calldata offsets,
        bytes[] calldata calldatas,
        uint256[] calldata values
    ) public payable virtual {
        require(targets.length == offsets.length && offsets.length == calldatas.length, "array length mismatch");
        assembly {
            let calldataOffset := mload(0x40)
            let totalCalldataBytes := sub(values.offset, calldatas.offset)

            // copy all calldata to memory to be used for calls later
            // shl(5, calldatas.length) == mul(calldatas.length, 32)
            calldatacopy(calldataOffset, add(calldatas.offset, shl(5, calldatas.length)), totalCalldataBytes)

            // update free memory
            mstore(0x40, add(calldataOffset, totalCalldataBytes))

            let i := 0
            // loop through all calls and execute in order
            for {} lt(i, calldatas.length) { i := add(i, 1) } {
                // shl(5,i) == mul(i, 32)
                let target := calldataload(add(targets.offset, shl(5, i)))
                let offset := calldataload(add(offsets.offset, shl(5, i)))

                let calldataLen := mload(calldataOffset)
                // round up to nearest 32 bytes: (calldataLen + 31) / 32 * 32
                let lengthPadded := shl(5, shr(5, add(calldataLen, 31)))
                // preserve the start location of this calls calldata
                let dataStart := add(calldataOffset, 0x20)
                // TODO: fuzz test this
                calldataOffset := add(calldataOffset, add(0x20, lengthPadded))
                // 0 = no value sent, 0x01-0xFFF0 = index into params
                let callType := shr(VALUE_OFFSET, offset)

                // staticall(gas, address, argsOffset, argssize, retOffset, returnDataSize)
                if eq(callType, STATIC_CALL_FLAG) {
                    let returnSize := shr(136, shl(136, offset))
                    // clear upper bits and retrieve return data offset
                    let returnOffset := add(add(calldataOffset, 0x20), shr(136, shl(16, offset)))

                    // make staticcall and bubble up revert
                    if iszero(staticcall(gas(), target, dataStart, calldataLen, returnOffset, returnSize)) {
                        returndatacopy(0x00, 0x00, returndatasize())
                        revert(0x00, returndatasize())
                    }

                    continue
                }

                // call (0xFE)
                if eq(callType, CALL_FLAG) {
                    let returnSize := shr(136, shl(136, offset))
                    // clean calltype flag and extract value flag
                    let value := shr(VALUE_OFFSET, shl(8, offset))
                    // avoid jumpi by multiplying by result of conditional (if msg.value is being used)
                    let msgValue := mul(gt(value, 0), calldataload(add(values.offset, sub(shl(5, value), 0x20))))

                    // clear upper bits and retrieve return data offset
                    let returnOffset := add(add(calldataOffset, 0x20), shr(136, shl(16, offset)))

                    // call(gas, address, value, argsOffset, argssize, retOffset, returnDataSize)
                    if iszero(call(gas(), target, msgValue, dataStart, calldataLen, returnOffset, returnSize)) {
                        returndatacopy(0x00, 0x00, returndatasize())
                        revert(0x00, returndatasize())
                    }

                    continue
                }

                // static call with partial return (0xFC)
                if eq(callType, STATIC_CALL_PARTIAL_RETURN_FLAG) {
                    // return size is modified for this type of call
                    let returnDataSize := shr(8, and(0xFFFF, offset))
                    // free_mem holds the end of the pre-allocated calldata region before this update.
                    // It doubles as the bounds-check limit for mcopy destinations (M-3).
                    let free_mem := mload(0x40)
                    mstore(0x40, add(free_mem, returnDataSize))

                    // make static call and save results to free memory to mcopy variables
                    if iszero(staticcall(gas(), target, dataStart, calldataLen, free_mem, returnDataSize)) {
                        returndatacopy(0x00, 0x00, returndatasize())
                        revert(0x00, returndatasize())
                    }

                    // all return data was added to free memory, now we need to loop through return data and memcpy to correct position
                    // only have 240 bits for all of this, so will only support 3 variable segments. (variables already in-order count as 1 variable. just memcopy both at same time)
                    // memTargets = uint40[3] = where the variables need to be copied to
                    // resultLengths = uint48[3] = the length of the variables to be copied
                    // returnOffsets = uint48[3] = offset from beginning of return data for each var
                    // returnDataSize = uint16 = total length of return data (MAX IS 65536 -- 2048 items)
                    // num_vars = uint8 = number of variable segments to use from last call

                    // NOTE: offset has a different layout for this type of call
                    //     8           8      120 (40x3)    48 (16x3)       48 (16x3)        16          8
                    // <calltype><valueIndex><memTargets><resultLengths><returnOffsets><returnDataSize><num_vars>
                    let o := offset
                    let calldata_start := add(calldataOffset, 0x20)

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
                        let resLength := and(0xFFFF, shr(var_index, resLengths))

                        // bounds check: free_mem still holds the original mload(0x40) value (the end of
                        // the pre-allocated calldata region) because it is a Yul local, not aliased to 0x40.
                        if gt(add(memTarget, resLength), free_mem) {
                            mstore(0x00, 0xd558ad4e) // InvalidMemoryTarget()
                            revert(0x1c, 0x04)
                        }

                        // the offset of the return data to memcpy
                        let returnDataOffset := and(0xFFFF, shr(var_index, retDatas))
                        returnDataOffset := add(free_mem, returnDataOffset)

                        // destOffset, offsetToCopyFrom, size
                        mcopy(memTarget, returnDataOffset, resLength)
                        continue
                    }
                    // TODO: is it worth it to clear memory??
                    continue
                }

                // state-changing call with partial return (0xFB)
                // Same bit layout as 0xFC but uses call() instead of staticcall() and supports msg.value.
                if eq(callType, CALL_PARTIAL_RETURN_FLAG) {
                    let returnDataSize := shr(8, and(0xFFFF, offset))
                    let free_mem := mload(0x40)
                    mstore(0x40, add(free_mem, returnDataSize))

                    // extract msg.value from the valueIndex field (same as CALL_FLAG)
                    let value := shr(VALUE_OFFSET, shl(8, offset))
                    let msgValue := mul(gt(value, 0), calldataload(add(values.offset, sub(shl(5, value), 0x20))))

                    if iszero(call(gas(), target, msgValue, dataStart, calldataLen, free_mem, returnDataSize)) {
                        returndatacopy(0x00, 0x00, returndatasize())
                        revert(0x00, returndatasize())
                    }

                    let o := offset
                    let calldata_start := add(calldataOffset, 0x20)
                    let memTargets := shr(136, shl(16, o))
                    let resLengths := and(PARTIAL_RETURN_RES_LENGTH_FLAG, shr(72, o))
                    let retDatas := and(PARTIAL_RETURN_RET_OFFSET_FLAG, shr(24, o))
                    let num_vars := byte(31, o)

                    let u := 0
                    for {} lt(u, num_vars) { u := add(u, 1) } {
                        let memTarget :=
                            and(PARTIAL_RETURN_MEM_TARGET_FLAG_INDIVIDUAL, shr(mul(40, sub(2, u)), memTargets))
                        memTarget := add(memTarget, calldata_start)

                        let var_index := mul(16, sub(2, u))
                        let resLength := and(0xFFFF, shr(var_index, resLengths))

                        if gt(add(memTarget, resLength), free_mem) {
                            mstore(0x00, 0xd558ad4e) // InvalidMemoryTarget()
                            revert(0x1c, 0x04)
                        }

                        let returnDataOffset := and(0xFFFF, shr(var_index, retDatas))
                        returnDataOffset := add(free_mem, returnDataOffset)

                        mcopy(memTarget, returnDataOffset, resLength)
                        continue
                    }
                    continue
                }

                // delegate call (0xFD) is not yet implemented — revert explicitly rather than silently skipping
                if eq(callType, DELEGATE_CALL_FLAG) {
                    mstore(0x00, 0x8f61746f) // InvalidCalltype(uint256)
                    revert(0x00, 0x20)
                }

                mstore(0x00, 0x8f61746f)
                revert(0x00, 0x20)
            }
        }
    }
}
