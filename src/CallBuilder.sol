// SPDX-License-Identifier: GPL3
pragma solidity ^0.8.13;

contract CallBuilder {
    // memTarget = uint120
    // resultLength = uint120
    // valueIndex = uint8
    // calltype = uint8
    // <valueIndex><memTarget><resultLength>
    function staticCall(uint256 memTarget, uint256 resultLength) internal pure returns (uint256 offsets) {
        require(memTarget <= type(uint120).max, "memTarget value too large");
        require(resultLength <= type(uint120).max, "resultLength value too large");

        offsets = (0xFF << 248) | (memTarget << 120) | resultLength;
    }

    function staticCallPartialReturn(uint256 memTarget, uint256 resLen, uint256 returnOffset, uint256 returnLength)
        internal
        pure
        returns (uint256 offsets)
    {
        // make the static call and save the whole return data to free memory and then memcopy the desired data where it is needed.
        // TODO: should this handle multiple memcopies?
    }

    // if msgValue is 0, just leave it as 0, otherwise indicate index
    // TODO: might need to support using return data from this
    function call(uint256 msgValueIndex) internal pure returns (uint256 offsets) {
        require(msgValueIndex <= type(uint8).max, "msgValueIndex too large");
        offsets = (0xFE << 248) | (msgValueIndex << 240);
    }
}
