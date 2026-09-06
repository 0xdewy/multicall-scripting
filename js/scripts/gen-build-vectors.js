// Generates js/build-vectors.json — whole-transaction golden vectors for cross-language parity.
//
// Each scenario is built with the JS TransactionBuilder (the on-chain-verified reference) and its
// full build() output is recorded. The Rust builder reproduces the same scenarios in
// rust/crates/builder/tests/parity.rs and must match offsets + calldatas + msgValues exactly.
// Regenerate with:  bun js/scripts/gen-build-vectors.js   (commit the result).

import { writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { TransactionBuilder } from "../index.js";

// Inline ABI shared verbatim with the Rust parity test, so both layers encode against identical
// definitions (the point of the test is to compare viem vs alloy encoding + offset math).
const ABI = [
    { type: "function", name: "add", stateMutability: "pure",
      inputs: [{ name: "a", type: "uint256" }, { name: "b", type: "uint256" }],
      outputs: [{ name: "", type: "uint256" }] },
    { type: "function", name: "setNum", stateMutability: "nonpayable",
      inputs: [{ name: "n", type: "uint256" }], outputs: [] },
    { type: "function", name: "getThree", stateMutability: "pure", inputs: [],
      outputs: [{ name: "", type: "uint256" }, { name: "", type: "uint256" }, { name: "", type: "uint256" }] },
    { type: "function", name: "setThree", stateMutability: "nonpayable",
      inputs: [{ name: "a", type: "uint256" }, { name: "b", type: "uint256" }, { name: "c", type: "uint256" }],
      outputs: [] },
    { type: "function", name: "getConstantString", stateMutability: "pure", inputs: [],
      outputs: [{ name: "", type: "string" }] },
    { type: "function", name: "setText", stateMutability: "nonpayable",
      inputs: [{ name: "t", type: "string" }], outputs: [] },
    { type: "function", name: "setUintValue", stateMutability: "payable", inputs: [], outputs: [] },
    { type: "function", name: "deposit", stateMutability: "payable", inputs: [],
      outputs: [{ name: "", type: "uint256" }] },
    { type: "function", name: "getConstant", stateMutability: "pure", inputs: [],
      outputs: [{ name: "", type: "uint64" }] },
    { type: "function", name: "setStaticThenWord", stateMutability: "nonpayable",
      inputs: [{ name: "s", type: "tuple", components: [{ name: "nA", type: "uint256" }, { name: "nB", type: "uint256" }] },
               { name: "w", type: "uint256" }],
      outputs: [] },
];

const T = "0x0000000000000000000000000000000000000001";

function record(name, built) {
    return {
        name,
        offsets: built.offsets.map((o) => o.toString()),
        calldatas: built.calldatas,
        msgValues: built.msgValues.map((v) => v.toString()),
    };
}

export function buildScenarios() {
const scenarios = [];

// 1. scalar chain: x = add(2,2); y = add(2,x); setNum(y)
scenarios.push(record("scalar_chain", (() => {
    const b = new TransactionBuilder();
    const x = b.addCall(ABI, T, "add", [2n, 2n]);
    const y = b.addCall(ABI, T, "add", [2n, x]);
    b.addCall(ABI, T, "setNum", [y]);
    return b.build();
})()));

// 2. multiple scalar returns: (a,b,c) = getThree(); setThree(a,b,c)
scenarios.push(record("multi_return", (() => {
    const b = new TransactionBuilder();
    const [a, bb, c] = b.addCall(ABI, T, "getThree", []);
    b.addCall(ABI, T, "setThree", [a, bb, c]);
    return b.build();
})()));

// 3. msg.value, no return
scenarios.push(record("msg_value_no_return", (() => {
    const b = new TransactionBuilder();
    b.addCall(ABI, T, "setUintValue", [], 1000n);
    return b.build();
})()));

// 4. msg.value + chained return: r = deposit{value}(); setNum(r)
scenarios.push(record("msg_value_with_return", (() => {
    const b = new TransactionBuilder();
    const r = b.addCall(ABI, T, "deposit", [], 500n);
    b.addCall(ABI, T, "setNum", [r]);
    return b.build();
})()));

// 5. dynamic string return: s = getConstantString().with_length(24); setText(s)
scenarios.push(record("dynamic_string", (() => {
    const b = new TransactionBuilder();
    const s = b.addCall(ABI, T, "getConstantString", []);
    s.with_length(24);
    b.addCall(ABI, T, "setText", [s]);
    return b.build();
})()));

// 6. static call with no consumer + a literal state-changing call
scenarios.push(record("static_no_consumer", (() => {
    const b = new TransactionBuilder();
    b.addCall(ABI, T, "getConstant", []);
    b.addCall(ABI, T, "setNum", [5n]);
    return b.build();
})()));

// 7. static tuple parameter before the spliced argument (head is 64 bytes, not 32)
scenarios.push(record("static_tuple_then_ref", (() => {
    const b = new TransactionBuilder();
    const w = b.addCall(ABI, T, "getConstant", []);
    b.addCall(ABI, T, "setStaticThenWord", [{ nA: 1n, nB: 2n }, w]);
    return b.build();
})()));

// 8. consumer two calls after the producer (memTarget spans the intermediate call)
scenarios.push(record("consumer_two_calls_later", (() => {
    const b = new TransactionBuilder();
    const w = b.addCall(ABI, T, "getConstant", []);
    b.addCall(ABI, T, "setNum", [1n]);
    b.addCall(ABI, T, "setNum", [w]);
    return b.build();
})()));

scenarios.push(record("scalar_fanout", (() => {
    const b = new TransactionBuilder();
    const x = b.addCall(ABI, T, "add", [2n, 2n]);
    b.addCall(ABI, T, "add", [x, x]);
    b.addCall(ABI, T, "setNum", [x]);
    return b.build();
})()));

    return scenarios;
}

if (import.meta.main) {
    const scenarios = buildScenarios();
    const outPath = join(dirname(fileURLToPath(import.meta.url)), "..", "build-vectors.json");
    writeFileSync(outPath, JSON.stringify(scenarios, null, 2) + "\n");
    process.stdout.write(`wrote ${scenarios.length} build vectors to ${outPath}\n`);
}
