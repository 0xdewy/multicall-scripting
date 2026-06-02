// Asserts the JS encoders reproduce the committed golden vectors (js/test-vectors.json).
// The same file is consumed by the Rust codec tests (rust/crates/codec/tests/golden.rs), so this
// guards JS-side drift and pins JS↔Rust parity. Regenerate: bun js/scripts/gen-test-vectors.js

import { describe, test, expect } from "bun:test";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import {
    staticCall,
    stateChangingCall,
    staticCallPartialReturn,
    callPartialReturn,
} from "../encoding.js";

const vectorsPath = join(dirname(fileURLToPath(import.meta.url)), "..", "test-vectors.json");
const vectors = JSON.parse(readFileSync(vectorsPath, "utf8"));

function encode(v) {
    switch (v.kind) {
        case "static_call":
            return staticCall(BigInt(v.mem_target), BigInt(v.result_length));
        case "state_changing_call":
            return stateChangingCall(v.msg_value_index);
        case "static_call_partial_return":
            return staticCallPartialReturn(v.mem_targets, v.result_lengths, v.return_offsets, v.return_data_size);
        case "call_partial_return":
            return callPartialReturn(v.msg_value_index, v.mem_targets, v.result_lengths, v.return_offsets, v.return_data_size);
        default:
            throw new Error(`unknown vector kind: ${v.kind}`);
    }
}

describe("golden vectors", () => {
    test("JS encoders match committed vectors", () => {
        expect(vectors.length).toBeGreaterThan(0);
        for (const v of vectors) {
            expect(encode(v).toString()).toBe(v.offset);
        }
    });
});
