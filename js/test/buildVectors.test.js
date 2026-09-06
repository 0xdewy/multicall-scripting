// Guards JS-side drift of the whole-transaction parity vectors: re-runs the scenario builders and
// asserts they still equal the committed js/build-vectors.json (which the Rust parity test also
// asserts against). Regenerate with: bun js/scripts/gen-build-vectors.js

import { describe, test, expect } from "bun:test";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { buildScenarios } from "../scripts/gen-build-vectors.js";

const path = join(dirname(fileURLToPath(import.meta.url)), "..", "build-vectors.json");
const committed = JSON.parse(readFileSync(path, "utf8"));

describe("build vectors", () => {
    test("JS builder still matches committed build-vectors.json", () => {
        const fresh = buildScenarios();
        expect(fresh).toEqual(committed);
    });

    test("covers the implemented build() branches", () => {
        const names = committed.map((s) => s.name);
        for (const expected of [
            "scalar_chain",
            "scalar_fanout",
            "multi_return",
            "msg_value_no_return",
            "msg_value_with_return",
            "dynamic_string",
            "static_no_consumer",
            "static_tuple_then_ref",
            "consumer_two_calls_later",
        ]) {
            expect(names).toContain(expected);
        }
    });
});
