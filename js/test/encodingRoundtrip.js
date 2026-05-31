import { staticCall, stateChangingCall, staticCallPartialReturn } from "../index.js";

// Emit known offsets so Solidity can decode them with CallDecoder and verify the bit layout.
function main() {
    const cases = {
        // staticCall: memTarget=0x24, resultLength=0x20
        staticCallSimple: staticCall(0x24, 0x20).toString(),
        // stateChangingCall: no value (msgValueIndex=0)
        stateChangingNoValue: stateChangingCall(0).toString(),
        // stateChangingCall: msgValueIndex=2
        stateChangingWithValue: stateChangingCall(2).toString(),
        // staticCallPartialReturn: one variable, memTarget=0x04, resultLength=0x20, returnOffset=0x20, returnDataSize=0x60
        partialReturnOne: staticCallPartialReturn([0x04], [0x20], [0x20], 0x60).toString(),
        // staticCallPartialReturn: two variables
        partialReturnTwo: staticCallPartialReturn([0x04, 0x44], [0x20, 0x20], [0x00, 0x40], 0x60).toString(),
    };

    console.log(JSON.stringify(cases));
}

main();
