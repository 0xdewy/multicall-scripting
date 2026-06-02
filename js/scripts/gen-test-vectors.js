// Generates js/test-vectors.json — shared golden vectors for cross-language offset parity.
//
// The JS encoders are the source of truth for the vectors; both the JS suite
// (js/test/goldenVectors.test.js) and the Rust codec tests assert against this file. Regenerate
// with:  bun js/scripts/gen-test-vectors.js   (commit the result).

import { writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import {
    staticCall,
    stateChangingCall,
    staticCallPartialReturn,
    callPartialReturn,
} from "../encoding.js";

const U120_MAX = (1n << 120n) - 1n;
const U40_MAX = (1n << 40n) - 1n;

const vectors = [];

function staticCallVec(memTarget, resultLength) {
    vectors.push({
        kind: "static_call",
        mem_target: memTarget.toString(),
        result_length: resultLength.toString(),
        offset: staticCall(memTarget, resultLength).toString(),
    });
}

function stateChangingVec(msgValueIndex) {
    vectors.push({
        kind: "state_changing_call",
        msg_value_index: Number(msgValueIndex),
        offset: stateChangingCall(msgValueIndex).toString(),
    });
}

function staticPartialVec(memTargets, resultLengths, returnOffsets, returnDataSize) {
    vectors.push({
        kind: "static_call_partial_return",
        mem_targets: memTargets,
        result_lengths: resultLengths,
        return_offsets: returnOffsets,
        return_data_size: returnDataSize,
        offset: staticCallPartialReturn(memTargets, resultLengths, returnOffsets, returnDataSize).toString(),
    });
}

function callPartialVec(msgValueIndex, memTargets, resultLengths, returnOffsets, returnDataSize) {
    vectors.push({
        kind: "call_partial_return",
        msg_value_index: msgValueIndex,
        mem_targets: memTargets,
        result_lengths: resultLengths,
        return_offsets: returnOffsets,
        return_data_size: returnDataSize,
        offset: callPartialReturn(msgValueIndex, memTargets, resultLengths, returnOffsets, returnDataSize).toString(),
    });
}

// static_call: small, zero, and full-width boundary values
staticCallVec(0n, 0n);
staticCallVec(4n, 32n);
staticCallVec(36n, 32n);
staticCallVec(U120_MAX, U120_MAX);
staticCallVec(1n << 119n, 1n << 100n);

// state_changing_call: no value, indexed value, max index
stateChangingVec(0n);
stateChangingVec(1n);
stateChangingVec(255n);

// static_call_partial_return: 1, 2, 3 vars, and per-field max
staticPartialVec([4], [32], [0], 32);
staticPartialVec([4, 36], [32, 32], [0, 32], 64);
staticPartialVec([4, 36, 68], [32, 32, 32], [0, 32, 64], 96);
staticPartialVec([Number(U40_MAX)], [65535], [0], 65535);

// call_partial_return: with msg.value index, 1 and 2 vars
callPartialVec(1, [4], [32], [0], 32);
callPartialVec(255, [4, 36], [32, 32], [0, 32], 64);

const outPath = join(dirname(fileURLToPath(import.meta.url)), "..", "test-vectors.json");
writeFileSync(outPath, JSON.stringify(vectors, null, 2) + "\n");
process.stdout.write(`wrote ${vectors.length} vectors to ${outPath}\n`);
