// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.28;

import {Constants} from "src/MulticallScripter.sol";

/// @dev Test-only helpers: offset-word encoders (mirrors js/encoding.js and rust/crates/codec) plus a
/// small Solidity DSL (`Scripter`) for building call chains in Foundry tests. Not deployed.
contract CallDecoder is Constants {
    function getValueIndex(uint256 offset) public pure returns (uint256) {
        return (offset >> 240) & 0xFF;
    }

    function getMemTarget(uint256 offset) public pure returns (uint256) {
        return (offset >> 120) & ((uint256(1) << 120) - 1);
    }

    function getResultLength(uint256 offset) public pure returns (uint256) {
        return offset & ((uint256(1) << 120) - 1);
    }
}

contract CallBuilder is Constants {
    function pack(bytes[] memory calls) internal pure returns (bytes memory script) {
        uint256 size;
        for (uint256 i; i < calls.length; ++i) {
            size += 32 + ((calls[i].length + 31) / 32) * 32;
        }
        script = new bytes(size);
        uint256 cursor;
        for (uint256 i; i < calls.length; ++i) {
            bytes memory data = calls[i];
            assembly ("memory-safe") {
                let dest := add(add(script, 32), cursor)
                mstore(dest, mload(data))
                mcopy(add(dest, 32), add(data, 32), mload(data))
            }
            cursor += 32 + ((data.length + 31) / 32) * 32;
        }
    }

    //      8         8           120         120
    // <calltype><valueIndex><memTarget><resultLength>
    function staticCall(uint256 memTarget, uint256 resultLength) internal pure returns (uint256) {
        return _regular(STATIC_CALL_FLAG, 0, memTarget, resultLength);
    }

    // CALL with no msg.value and no return data
    function stateChangingCall() internal pure returns (uint256) {
        return _regular(CALL_FLAG, 0, 0, 0);
    }

    // CALL with msg.value. msgValueIndex is 1-based: 0 = no value, 1 = values[0].
    function stateChangingCall(uint256 msgValueIndex) internal pure returns (uint256) {
        return _regular(CALL_FLAG, msgValueIndex, 0, 0);
    }

    function stateChangingCall(uint256 msgValueIndex, uint256 memTarget, uint256 resultLength)
        internal
        pure
        returns (uint256)
    {
        return _regular(CALL_FLAG, msgValueIndex, memTarget, resultLength);
    }

    //     8           8      120 (40x3)    48 (16x3)       48 (16x3)        16          8
    // <calltype><valueIndex><memTargets><resultLengths><returnOffsets><returnDataSize><num_vars>
    function staticCallPartialReturn(
        uint256[] memory memTargets,
        uint256[] memory resultLengths,
        uint256[] memory returnOffsets,
        uint256 returnDataSize
    ) internal pure returns (uint256) {
        return _partial(STATIC_CALL_PARTIAL_RETURN_FLAG, 0, memTargets, resultLengths, returnOffsets, returnDataSize);
    }

    function callPartialReturn(
        uint256 msgValueIndex,
        uint256[] memory memTargets,
        uint256[] memory resultLengths,
        uint256[] memory returnOffsets,
        uint256 returnDataSize
    ) internal pure returns (uint256) {
        return _partial(
            CALL_PARTIAL_RETURN_FLAG, msgValueIndex, memTargets, resultLengths, returnOffsets, returnDataSize
        );
    }

    function _regular(uint256 flag, uint256 msgValueIndex, uint256 memTarget, uint256 resultLength)
        private
        pure
        returns (uint256)
    {
        require(msgValueIndex <= type(uint8).max, "msgValueIndex too large");
        require(memTarget <= type(uint120).max, "memTarget value too large");
        require(resultLength <= type(uint120).max, "resultLength value too large");
        return (flag << VALUE_OFFSET) | (msgValueIndex << 240) | (memTarget << 120) | resultLength;
    }

    function _partial(
        uint256 flag,
        uint256 msgValueIndex,
        uint256[] memory memTargets,
        uint256[] memory resultLengths,
        uint256[] memory returnOffsets,
        uint256 returnDataSize
    ) private pure returns (uint256) {
        uint256 len = memTargets.length;
        require(len == resultLengths.length && len == returnOffsets.length, "array length mismatch");
        require(len <= PARTIAL_RETURN_VARS, "invalid number of params");
        require(msgValueIndex <= type(uint8).max, "msgValueIndex too large");
        require(returnDataSize <= type(uint16).max, "returnLength is too large");

        uint256 packedTargets;
        uint256 packedLengths;
        uint256 packedOffsets;
        for (uint256 i = 0; i < len; i++) {
            require(memTargets[i] <= type(uint40).max, "memTarget value too large");
            require(resultLengths[i] <= type(uint16).max, "resultLength value too large");
            require(returnOffsets[i] <= type(uint16).max, "returnOffset value too large");
            // MSB-first: var 0 occupies the highest bits of each field
            uint256 slot = PARTIAL_RETURN_VARS - (i + 1);
            packedTargets |= memTargets[i] << (slot * 40);
            packedLengths |= resultLengths[i] << (slot * 16);
            packedOffsets |= returnOffsets[i] << (slot * 16);
        }

        return (flag << VALUE_OFFSET) | (msgValueIndex << 240) | (packedTargets << 120) | (packedLengths << 72)
            | (packedOffsets << 24) | (returnDataSize << 8) | len;
    }
}

library VarLib {
    struct Var {
        uint256 callIndex;
        uint256 start;
        uint256 length;
    }

    // first / second / third 32-byte word of a call's return data or arguments
    function first(uint256 callIndex) internal pure returns (Var memory) {
        return Var(callIndex, 0x0, 0x20);
    }

    function second(uint256 callIndex) internal pure returns (Var memory) {
        return Var(callIndex, 0x20, 0x20);
    }

    function third(uint256 callIndex) internal pure returns (Var memory) {
        return Var(callIndex, 0x40, 0x20);
    }

    function withMemRange(uint256 callIndex, uint256 start, uint256 length) internal pure returns (Var memory) {
        return Var(callIndex, start, length);
    }
}

/// @dev Minimal Solidity-side transaction builder for tests: record calls, wire outputs to inputs,
/// then `build()` the four arrays `MulticallScripter.execute` expects.
contract Scripter is CallBuilder {
    struct Call {
        address target;
        bytes fnCalldata;
        uint256 calltypeFlag;
        uint256 memPos; // byte position of this call's calldata within the concatenated region
        uint256[] memTargets;
        uint256[] returnDataLens;
        uint256[] returnDataOffsets;
        uint256 msgValue;
    }

    Call[] public calls;
    uint256 public freeMem;

    function _pushCall(address target, bytes memory callData, uint256 callType, uint256 value)
        private
        returns (uint256)
    {
        uint256[] memory empty;
        calls.push(Call(target, callData, callType, freeMem, empty, empty, empty, value));
        freeMem += callData.length;
        return calls.length - 1;
    }

    function call_static(address target, bytes memory callData) external returns (uint256) {
        return _pushCall(target, callData, STATIC_CALL_FLAG, 0);
    }

    function call(address target, bytes memory callData, uint256 value) external returns (uint256) {
        return _pushCall(target, callData, CALL_FLAG, value);
    }

    // splice `returnData` (a slice of an earlier call's return data) over `callParameter` of a later call
    function useCallOutput(VarLib.Var memory returnData, VarLib.Var memory callParameter) public {
        require(returnData.callIndex < callParameter.callIndex, "Can only use output from previous calls");
        Call storage thisCall = calls[callParameter.callIndex];
        Call storage oldCall = calls[returnData.callIndex];

        // memTarget is relative to the start of the call *after* oldCall
        uint256 memTarget = (thisCall.memPos + callParameter.start + 0x4) - (oldCall.memPos + oldCall.fnCalldata.length);
        oldCall.memTargets.push(memTarget);
        oldCall.returnDataLens.push(callParameter.length);
        oldCall.returnDataOffsets.push(returnData.start);
    }

    function build()
        external
        view
        returns (address[] memory targets, uint256[] memory offsets, bytes[] memory datas, uint256[] memory values)
    {
        uint256 len = calls.length;
        targets = new address[](len);
        offsets = new uint256[](len);
        datas = new bytes[](len);
        values = new uint256[](len);
        uint256 numValues;

        for (uint256 i; i < len; i++) {
            Call storage c = calls[i];
            targets[i] = c.target;
            datas[i] = c.fnCalldata;

            uint256 msgValueIndex;
            if (c.msgValue > 0) {
                values[numValues] = c.msgValue;
                msgValueIndex = ++numValues;
            }

            uint256 returnDataSize;
            for (uint256 j = 0; j < c.returnDataOffsets.length; j++) {
                uint256 end = c.returnDataOffsets[j] + c.returnDataLens[j];
                if (end > returnDataSize) returnDataSize = end;
            }

            if (c.calltypeFlag == STATIC_CALL_FLAG) {
                offsets[i] = c.memTargets.length == 0
                    ? staticCall(0, 0)
                    : staticCallPartialReturn(c.memTargets, c.returnDataLens, c.returnDataOffsets, returnDataSize);
            } else {
                offsets[i] = c.memTargets.length == 0
                    ? stateChangingCall(msgValueIndex)
                    : callPartialReturn(
                        msgValueIndex, c.memTargets, c.returnDataLens, c.returnDataOffsets, returnDataSize
                    );
            }
        }

        assembly {
            mstore(values, numValues)
        }
    }
}
