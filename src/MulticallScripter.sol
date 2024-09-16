// SPDX-License-Identifier: GPL3
pragma solidity ^0.8.13;

contract MulticallScripter {
    uint256 constant STATIC_CALL_FLAG = 0xFF;

    function getValueIndex(uint256 offset) public pure returns (uint16 index) {
        assembly {
            index := shr(240, shl(8, offset))
        }
    }

    function getMemTarget(uint256 offset) public pure returns (uint256 memTarget) {
        assembly {
            memTarget := shr(136, shl(16, offset))
        }
    }

    function getResultLength(uint256 offset) public pure returns (uint256 resLength) {
        resLength = uint120(offset);
    }

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
                // clear upper bits and retrieve return data offset
                let returnOffset := add(calldataOffset, shr(136, shl(16, offset)))
                // clear upper bits and get the size of the return data
                let returnSize := shr(136, shl(136, offset))
                let calldataLen := mload(calldataOffset)
                // get the length of calldata at the nearest 32 byte interval
                let lengthPadded := add(calldataLen, sub(32, mod(calldataLen, 32)))
                // preserve the start location of this calls calldata
                let dataStart := add(calldataOffset, 0x20)
                // TODO: fuzz test this
                calldataOffset := add(calldataOffset, add(0x20, lengthPadded))
                // 0 = no value sent, 0x01-0xFFF0 = index into params
                let callType := shr(248, offset)

                // staticall(gas, address, argsOffset, argssize, retOffset, retSize)
                if eq(callType, STATIC_CALL_FLAG) {
                    // make staticcall and bubble up revert
                    if iszero(staticcall(gas(), target, dataStart, calldataLen, returnOffset, returnSize)) {
                        returndatacopy(0x00, 0x00, returndatasize())
                        revert(0x00, returndatasize())
                    }

                    continue
                }

                // extract value flag and load value if flag is set
                let value := shr(248, shl(8, offset))
                // avoid jumpi by multiplying by result of conditional (if msg.value is being used)
                let msgValue := mul(gt(value, 0), calldataload(add(values.offset, sub(shl(5, value), 0x20))))

                // call
                if eq(callType, sub(STATIC_CALL_FLAG, 1)) {
                    // call(gas, address, value, argsOffset, argssize, retOffset, retSize)
                    if iszero(call(gas(), target, msgValue, dataStart, lengthPadded, returnOffset, returnSize)) {
                        returndatacopy(0x00, 0x00, returndatasize())
                        revert(0x00, returndatasize())
                    }

                    continue
                }

                // delegate call
                if eq(callType, sub(STATIC_CALL_FLAG, 2)) {
                    // TODO: delegate call?
                    continue
                }

                // static call with partial return
                if eq(callType, sub(STATIC_CALL_FLAG, 3)) {
                    // TODO: static call with partial return data
                    /*
                        TODO: if need to use only part of the return data we have to save the whole return o memory and then memcopy the segment that we want into the correct place

                        - if so, make static call and save data temporarily to free memory
                        - use offset to figure out data offset + size to memcopy
                    */

                    continue
                }

                // TODO: 0x420 is not a very descriptive error message
                mstore(0x00, 0x420)
                revert(0x00, 0x20)
            }
        }
    }
}
