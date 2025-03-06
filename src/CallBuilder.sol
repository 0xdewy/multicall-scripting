import {Constants} from "./MulticallScripter.sol";
//import {Test, console} from "forge-std/Test.sol";

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
        resLength = uint120(offset);
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

        uint256 calltype = 0xFC;
        uint256 encodedMemTargets = 0x0;
        uint256 encodedResultLengths = 0x0;
        uint256 encodedOffsets = 0x0;

        require(
            memTargets.length <= PARTIAL_RETURN_VARS && resultLengths.length <= PARTIAL_RETURN_VARS
                && returnOffsets.length <= PARTIAL_RETURN_VARS,
            "invalid number of params"
        );
        require(returnLength <= type(uint24).max, "returnLength is too large");

        uint256 len = memTargets.length;
        for (uint256 i = 0; i < len; i++) {
            require(memTargets[i] <= type(uint40).max, "memTarget value too large");
            require(resultLengths[i] <= type(uint16).max, "resultLength value too large");
            require(returnOffsets[i] <= type(uint16).max, "returnOffset value too large");

            uint256 varOffset = (PARTIAL_RETURN_VARS - (i + 1));

            encodedMemTargets |= (memTargets[i] << (varOffset * 40));
            encodedResultLengths |= (resultLengths[i] << (varOffset * 16));
            encodedOffsets |= (returnOffsets[i] << (varOffset * 16));
        }

        offsets = (calltype << 248) | (0x00 << 240) | encodedMemTargets << 120 | (encodedResultLengths << 72)
            | (encodedOffsets << 24) | (returnLength << 8) | memTargets.length;
    }

    // if msgValue is 0, just leave it as 0, otherwise indicate index
    // TODO: might need to support using return data from this
    function stateChangingCall(uint256 msgValueIndex) internal pure returns (uint256 offsets) {
        require(msgValueIndex <= type(uint8).max, "msgValueIndex too large");
        offsets = (CALL_FLAG << 248) | (msgValueIndex << 240);
    }
}

library VarLib {
    struct Var {
        uint256 callIndex;
        uint256 start;
        uint256 length;
    }

    // Creates a new Var with the given callIndex, defaulting start and length to 0
    function newVar(uint256 callIndex) internal pure returns (Var memory) {
        return Var(callIndex, 0, 0);
    }

    // Sets the start value and returns the modified Var
    function withStart(Var memory self, uint256 _start) internal pure returns (Var memory) {
        self.start = _start;
        return self;
    }

    // Sets the length value and returns the modified Var
    function withLength(Var memory self, uint256 _length) internal pure returns (Var memory) {
        self.length = _length;
        return self;
    }

    // Convenience method to create a Var with default start = 0x0 and length = 0x20
    function single(uint256 callIndex) internal pure returns (Var memory) {
        return Var(callIndex, 0x0, 0x20);
    }

    function second_parameter_single(uint256 callIndex) internal pure returns (Var memory) {
      return Var(callIndex, 0x20, 0x20);
    }

    function third_parameter_single(uint256 callIndex) internal pure returns (Var memory) {
      return Var(callIndex, 0x40, 0x20);
    }

}


contract Scripter is CallBuilder {
  using VarLib for VarLib.Var;

    // Custom errors
    error MustUseDataFromPreviousCall();
    error InvalidCallIndex();

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
        bool special;
    }

    // Storage array to hold all calls
    Call[] public calls;
    // Free memory pointer (in storage)
    uint256 public free_mem;

    function _pushCall(address target, bytes memory callData, uint256 callType, uint256 value)
        private
        returns (uint256)
    {
        require(target != address(0), "Invalid target");
        uint256[] memory empty = new uint256[](0);
        calls.push(Call(target, callData, callType, free_mem, empty, empty, empty, value, false));
        free_mem += callData.length;
        return calls.length - 1;
    }

    function call_static(address target, bytes memory callData) external returns (uint256) {
        return _pushCall(target, callData, STATIC_CALL_FLAG, 0);
    }

    function call(address target, bytes memory callData, uint256 value) external returns (uint256) {
        return _pushCall(target, callData, CALL_FLAG, value);
    }

    // replace a parameter from previous calldata
    function replaceVar(VarLib.Var memory paramBeingReplaced, VarLib.Var memory newParam) public {
        Call storage this_call = calls[paramBeingReplaced.callIndex];
        Call storage old_call = calls[newParam.callIndex];

        //
        bool is_special = (newParam.start != 0x0) || (old_call.memTargets.length > 0) || old_call.special;

        uint256 memTarget =
            (this_call.memPos + paramBeingReplaced.start + 0x4) - (old_call.memPos + old_call.fnCalldata.length);
        // modify old call to store return data in position of paramBeingReplaced
        old_call.memTargets.push(memTarget);
        old_call.returnDataLens.push(paramBeingReplaced.length);
        old_call.returnDataOffsets.push(newParam.start);
        old_call.special = is_special;
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

            if (_call.special) {
                require(
                    _call.calltype_flag == STATIC_CALL_FLAG && _call.memTargets.length > 0
                        && _call.returnDataLens.length > 0,
                    "Invalid special call"
                );
            }

            uint256 memTarget = _call.memTargets.length > 0 ? _call.memTargets[0] : 0;
            uint256 returnData = _call.returnDataLens.length > 0 ? _call.returnDataLens[0] : 0;

            if (_call.calltype_flag == STATIC_CALL_FLAG) {
                offsets[i] = staticCall(memTarget, returnData);
            } else if (_call.calltype_flag == CALL_FLAG) {
                offsets[i] = stateChangingCall(values_iter);
                values[values_iter++] = _call.msgValue;
            }
        }

        assembly {
            mstore(values, values_iter)
        }
        assert(values.length == values_iter || values_iter <= len);
    }
}
