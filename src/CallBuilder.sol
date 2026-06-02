import {Constants} from "./MulticallScripter.sol";

// SPDX-License-Identifier: GPL3
pragma solidity ^0.8.28;

contract CallDecoder is Constants {
    // index into value array for msg.value
    function getValueIndex(uint256 offset) public pure returns (uint16 index) {
        assembly {
            index := shr(VALUE_OFFSET, shl(8, offset))
        }
    }

    // where in memory the return data will be stored, to be used in subsequent calls
    function getMemTarget(uint256 offset) public pure returns (uint256 memTarget) {
        assembly {
            memTarget := shr(136, shl(16, offset))
        }
    }

    // length of return data
    function getResultLength(uint256 offset) public pure returns (uint256 resLength) {
        // explicit low-120-bit mask, symmetric with getMemTarget
        resLength = offset & ((uint256(1) << 120) - 1);
    }
}

contract CallBuilder is Constants {
    // memTarget = uint120 = where in memory to store return data for subsequent calls
    // resultLength = uint120 = length of data to save for subsequent calls
    // valueIndex = uint8
    // calltype = uint8
    //      8         8           120         120
    // <calltype><valueIndex><memTarget><resultLength>
    function staticCall(uint256 memTarget, uint256 resultLength) internal pure returns (uint256 offsets) {
        require(memTarget <= type(uint120).max, "memTarget value too large");
        require(resultLength <= type(uint120).max, "resultLength value too large");

        // ignore value since it has to be 0 for static calls
        offsets = (STATIC_CALL_FLAG << VALUE_OFFSET) | (memTarget << 120) | resultLength;
    }

    // CALL with no msg.value and no return data
    function stateChangingCall() internal pure returns (uint256) {
        return stateChangingCall(0);
    }

    // CALL with msg.value
    // NOTE: the index is shifted up 1, so that 0 mean there is no msg.value...1 == first item in value array
    function stateChangingCall(uint256 msgValueIndex) internal pure returns (uint256) {
        require(msgValueIndex <= type(uint8).max, "msgValueIndex too large");
        return stateChangingCall(msgValueIndex, 0x0, 0x0);
    }

    // CALL with return data.
    // NOTE: index of msg.value is shifted so 0 == no msg.value, 1 == first index in values array
    //      8         8           120         120
    // <calltype><valueIndex><memTarget><resultLength>
    function stateChangingCall(uint256 msgValueIndex, uint256 memTarget, uint256 resultLength)
        internal
        pure
        returns (uint256 offsets)
    {
        require(msgValueIndex <= type(uint8).max, "msgValueIndex too large");
        require(memTarget <= type(uint120).max, "memTarget value too large");
        require(resultLength <= type(uint120).max, "resultLength value too large");

        // ignore value since it has to be 0 for static calls
        offsets = (CALL_FLAG << VALUE_OFFSET) | (msgValueIndex << 240) | (memTarget << 120) | resultLength;
    }

    // parses return data and can select up to 3 variables to use in following calls
    //     8           8      120 (40x3)    48 (16x3)       48 (16x3)        16          8
    // <calltype><valueIndex><memTargets><resultLengths><returnOffsets><resultLength><num_vars>
    function staticCallPartialReturn(
        uint256[] memory memTargets,
        uint256[] memory resultLengths,
        uint256[] memory returnOffsets,
        uint256 returnLength
    ) internal pure returns (uint256 offsets) {
        // static call + save all of return data + memcpy parts of return data to proper location
        require(
            memTargets.length <= PARTIAL_RETURN_VARS && resultLengths.length <= PARTIAL_RETURN_VARS
                && returnOffsets.length <= PARTIAL_RETURN_VARS,
            "invalid number of params"
        );
        require(returnLength <= type(uint16).max, "returnLength is too large");

        uint256 len = memTargets.length;

        uint256 encodedMemTargets = 0x0;
        uint256 encodedResultLengths = 0x0;
        uint256 encodedOffsets = 0x0;

        for (uint256 i = 0; i < len; i++) {
            require(memTargets[i] <= type(uint40).max, "memTarget value too large");
            require(resultLengths[i] <= type(uint16).max, "resultLength value too large");
            require(returnOffsets[i] <= type(uint16).max, "returnOffset value too large");

            uint256 varOffset = (PARTIAL_RETURN_VARS - (i + 1));

            encodedMemTargets |= (memTargets[i] << (varOffset * 40));
            encodedResultLengths |= (resultLengths[i] << (varOffset * 16));
            encodedOffsets |= (returnOffsets[i] << (varOffset * 16));
        }

        offsets = (STATIC_CALL_PARTIAL_RETURN_FLAG << 248) | (0x00 << 240) | encodedMemTargets << 120
            | (encodedResultLengths << 72) | (encodedOffsets << 24) | (returnLength << 8) | len;
    }

    // Same layout as staticCallPartialReturn but uses call() with optional msg.value.
    function callPartialReturn(
        uint256 msgValueIndex,
        uint256[] memory memTargets,
        uint256[] memory resultLengths,
        uint256[] memory returnOffsets,
        uint256 returnLength
    ) internal pure returns (uint256 offsets) {
        require(
            memTargets.length <= PARTIAL_RETURN_VARS && resultLengths.length <= PARTIAL_RETURN_VARS
                && returnOffsets.length <= PARTIAL_RETURN_VARS,
            "invalid number of params"
        );
        require(msgValueIndex <= type(uint8).max, "msgValueIndex too large");
        require(returnLength <= type(uint16).max, "returnLength is too large");

        uint256 len = memTargets.length;
        uint256 encodedMemTargets = 0x0;
        uint256 encodedResultLengths = 0x0;
        uint256 encodedOffsets = 0x0;

        for (uint256 i = 0; i < len; i++) {
            require(memTargets[i] <= type(uint40).max, "memTarget value too large");
            require(resultLengths[i] <= type(uint16).max, "resultLength value too large");
            require(returnOffsets[i] <= type(uint16).max, "returnOffset value too large");

            uint256 varOffset = (PARTIAL_RETURN_VARS - (i + 1));
            encodedMemTargets |= (memTargets[i] << (varOffset * 40));
            encodedResultLengths |= (resultLengths[i] << (varOffset * 16));
            encodedOffsets |= (returnOffsets[i] << (varOffset * 16));
        }

        offsets = (CALL_PARTIAL_RETURN_FLAG << 248) | (msgValueIndex << 240) | encodedMemTargets << 120
            | (encodedResultLengths << 72) | (encodedOffsets << 24) | (returnLength << 8) | len;
    }
}

library VarLib {
    struct Var {
        uint256 callIndex;
        uint256 start;
        uint256 length;
    }

    // Creates a Var with callIndex, start=0x0, length=0x20 (first parameter)
    function first(uint256 callIndex) internal pure returns (Var memory) {
        return Var(callIndex, 0x0, 0x20);
    }

    // Creates a Var with callIndex, start=0x20, length=0x20 (second parameter)
    function second(uint256 callIndex) internal pure returns (Var memory) {
        return Var(callIndex, 0x20, 0x20);
    }

    // Creates a Var with callIndex, start=0x40, length=0x20 (third parameter)
    function third(uint256 callIndex) internal pure returns (Var memory) {
        return Var(callIndex, 0x40, 0x20);
    }

    // Sets the start and length values for a Var
    function withMemRange(uint256 callIndex, uint256 _start, uint256 _length) internal pure returns (Var memory) {
        return Var(callIndex, _start, _length);
    }
}

contract Scripter is CallBuilder {
    using VarLib for uint256;

    // Struct to store a single call's data
    struct Call {
        address target; // Target contract address
        bytes fnCalldata; // Calldata for the call
        uint256 calltype_flag; // Flag indicating call type (e.g., staticcall)
        uint256 memPos; // Memory position of this call
        uint256[] memTargets; // Memory offset for return data usage
        uint256[] returnDataLens; // Length of return data
        uint256[] returnDataOffsets;
        uint256 msgValue;
    }

    // Storage array to hold all calls
    Call[] public calls;
    // Free memory pointer
    uint256 public free_mem;

    function _pushCall(address target, bytes memory callData, uint256 callType, uint256 value)
        private
        returns (uint256)
    {
        uint256[] memory empty = new uint256[](0);
        calls.push(Call(target, callData, callType, free_mem, empty, empty, empty, value));
        free_mem += callData.length;
        return calls.length - 1;
    }

    function call_static(address target, bytes memory callData) external returns (uint256) {
        return _pushCall(target, callData, STATIC_CALL_FLAG, 0);
    }

    function call(address target, bytes memory callData, uint256 value) external returns (uint256) {
        return _pushCall(target, callData, CALL_FLAG, value);
    }

    // replace a parameter with return data from a previous call
    function useCallOutput(VarLib.Var memory returnData, VarLib.Var memory callParameter) public {
        require(returnData.callIndex < callParameter.callIndex, "Can only use output from previous calls");
        Call storage this_call = calls[callParameter.callIndex];
        Call storage old_call = calls[returnData.callIndex];

        // memTarget is an offset -- how many bytes forward is this return data required to be set
        uint256 memTarget =
            (this_call.memPos + callParameter.start + 0x4) - (old_call.memPos + old_call.fnCalldata.length);
        // modify old call to store return data in position of callParameter
        old_call.memTargets.push(memTarget);
        old_call.returnDataLens.push(callParameter.length);
        old_call.returnDataOffsets.push(returnData.start);
    }

    function build()
        external
        returns (address[] memory targets, uint256[] memory offsets, bytes[] memory datas, uint256[] memory values)
    {
        uint256 len = calls.length;
        targets = new address[](len);
        offsets = new uint256[](len);
        datas = new bytes[](len);
        values = new uint256[](len);
        uint256 values_iter;

        for (uint256 i; i < len; i++) {
            Call storage _call = calls[i];
            targets[i] = _call.target;
            datas[i] = _call.fnCalldata;

            if (_call.calltype_flag == STATIC_CALL_FLAG) {
                if (_call.memTargets.length == 0) {
                    offsets[i] = staticCall(0, 0);
                } else if (_call.memTargets.length == 1 && _call.returnDataOffsets[0] == 0x0) {
                    // simple path: take first N bytes of return data and copy to memTarget
                    offsets[i] = staticCall(_call.memTargets[0], _call.returnDataLens[0]);
                } else {
                    // partial return path: select up to 3 variables at arbitrary offsets
                    uint256 returnDataSize = 0;
                    for (uint256 j = 0; j < _call.returnDataOffsets.length; j++) {
                        uint256 end = _call.returnDataOffsets[j] + _call.returnDataLens[j];
                        if (end > returnDataSize) returnDataSize = end;
                    }
                    offsets[i] = staticCallPartialReturn(
                        _call.memTargets, _call.returnDataLens, _call.returnDataOffsets, returnDataSize
                    );
                }
            } else if (_call.calltype_flag == CALL_FLAG) {
                if (_call.memTargets.length > 0) {
                    uint256 returnDataSize = 0;
                    for (uint256 j = 0; j < _call.returnDataOffsets.length; j++) {
                        uint256 end = _call.returnDataOffsets[j] + _call.returnDataLens[j];
                        if (end > returnDataSize) returnDataSize = end;
                    }
                    uint256 msgValueIndex = 0;
                    if (_call.msgValue > 0) {
                        msgValueIndex = values_iter + 1;
                        values[values_iter] = _call.msgValue;
                        values_iter++;
                    }
                    offsets[i] = callPartialReturn(
                        msgValueIndex, _call.memTargets, _call.returnDataLens, _call.returnDataOffsets, returnDataSize
                    );
                } else if (_call.msgValue > 0) {
                    offsets[i] = stateChangingCall(values_iter + 1);
                    values[values_iter] = _call.msgValue;
                    values_iter++;
                } else {
                    offsets[i] = stateChangingCall();
                }
            }
        }

        // update values size
        assembly {
            mstore(values, values_iter)
        }
        assert(values_iter <= len);
    }
}
