// Unit tests for the builder's position arithmetic: every memTarget / returnOffset below is worked
// out by hand from the ABI encoding. The same layouts are executed on-chain in
// test/JsLibrary.t.sol:test_js_layouts via js/test/layouts.js.

import { describe, test, expect } from "bun:test";
import { TransactionBuilder, decodePartialReturn, decodeCalltype, STATIC_CALL_FLAG, CALL_FLAG } from "../index.js";

const T = "0x0000000000000000000000000000000000000001";
const fn = (name, inputs, outputs, stateMutability = "view") => ({ type: "function", name, inputs, outputs, stateMutability });
const u = (name = "") => ({ name, type: "uint256" });
const STATIC = { name: "s", type: "tuple", components: [u("nA"), u("nB")] };

const ABI = [
    fn("getWord", [], [u()]),
    fn("getItem", [], [{ name: "", type: "tuple", components: [u("id"), { name: "name", type: "string" }] }]),
    fn("getCountAndNums", [], [u(), { name: "", type: "uint256[]" }]),
    fn("getPairs", [], [{ name: "", type: "tuple[]", components: [u("nA"), u("nB")] }]),
    fn("getTwoStrings", [], [{ name: "a", type: "string" }, { name: "b", type: "string" }]),
    fn("getFixed", [], [{ name: "", type: "uint256[2]" }]),
    fn("setWord", [u("w")], [], "nonpayable"),
    fn("setStaticThenWord", [STATIC, u("w")], [], "nonpayable"),
    fn("setNums", [u("a"), { name: "n", type: "uint256[]" }], [], "nonpayable"),
    fn("setPairs", [{ name: "p", type: "tuple[]", components: [u("nA"), u("nB")] }], [], "nonpayable"),
    fn("setTexts", [{ name: "a", type: "string" }, { name: "b", type: "string" }], [], "nonpayable"),
    fn("setBytes", [{ name: "b", type: "bytes" }], [], "nonpayable"),
];

const first = (b) => decodePartialReturn(b.build().offsets[0]);

describe("return-data offsets", () => {
    test("field of a dynamic tuple output sits behind the pointer word", () => {
        const b = new TransactionBuilder();
        const item = b.addCall(ABI, T, "getItem", []);
        b.addCall(ABI, T, "setWord", [item.id]);
        expect(first(b)).toEqual({ memTargets: [4], resultLengths: [32], returnOffsets: [32], returnDataSize: 64, numVars: 1 });
    });

    test("string field of a dynamic tuple output: tail after the tuple heads", () => {
        const b = new TransactionBuilder();
        const item = b.addCall(ABI, T, "getItem", []);
        item.name.with_length(5);
        b.addCall(ABI, T, "setTexts", ["", item.name]);
        // return: [ptr][id][name ptr][len][data] → name tail at 96, 64 bytes copied
        // calldata: 4 + heads(64) + tail a(32) = 100 → b's tail
        expect(first(b)).toEqual({ memTargets: [100], resultLengths: [64], returnOffsets: [96], returnDataSize: 160, numVars: 1 });
    });

    test("elements of a dynamic array that is the second output", () => {
        const b = new TransactionBuilder();
        const [, nums] = b.addCall(ABI, T, "getCountAndNums", []);
        nums.with_length(3);
        b.addCall(ABI, T, "setWord", [nums[1]]);
        // return: [count][ptr][len][e0][e1][e2] → e1 at 128
        expect(first(b)).toEqual({ memTargets: [4], resultLengths: [32], returnOffsets: [128], returnDataSize: 160, numVars: 1 });
    });

    test("whole dynamic array output copied into an array argument", () => {
        const b = new TransactionBuilder();
        const [count, nums] = b.addCall(ABI, T, "getCountAndNums", []);
        nums.with_length(3);
        b.addCall(ABI, T, "setNums", [count, nums]);
        // count: head 0 → calldata 4; nums: tail at 64 (32 + 32*... ) length word at 64 in return data;
        // calldata: 4 + heads(64) = 68 is the array tail
        const d = first(b);
        expect(d.memTargets).toEqual([4, 68]);
        expect(d.returnOffsets).toEqual([0, 64]);
        expect(d.resultLengths).toEqual([32, 32 + 3 * 32]);
    });

    test("struct field inside an array-of-structs output", () => {
        const b = new TransactionBuilder();
        const pairs = b.addCall(ABI, T, "getPairs", []);
        pairs.with_length(2);
        b.addCall(ABI, T, "setWord", [pairs[1].nB]);
        // return: [ptr][len][a0][b0][a1][b1] → b1 at 160
        expect(first(b).returnOffsets).toEqual([160]);
    });

    test("fixed-size array output is indexable inline", () => {
        const b = new TransactionBuilder();
        const arr = b.addCall(ABI, T, "getFixed", []);
        b.addCall(ABI, T, "setWord", [arr[1]]);
        expect(first(b).returnOffsets).toEqual([32]);
    });

    test("second dynamic output is rejected, static outputs stay usable", () => {
        const b = new TransactionBuilder();
        const [a, c] = b.addCall(ABI, T, "getTwoStrings", []);
        expect(() => a.with_length(1)).toThrow("more than one dynamic value");
        expect(() => c.with_length(1)).toThrow("more than one dynamic value");
    });
});

describe("calldata targets", () => {
    test("descriptor inside a struct argument, after a static tuple parameter", () => {
        const b = new TransactionBuilder();
        const w = b.addCall(ABI, T, "getWord", []);
        const w2 = b.addCall(ABI, T, "getWord", []);
        b.addCall(ABI, T, "setStaticThenWord", [{ nA: 1n, nB: w2 }, w]);
        const out = b.build();
        // call 1 (w2) → nB at 4 + 32 = 36 in the next call
        expect(decodePartialReturn(out.offsets[1]).memTargets).toEqual([36]);
        // call 0 (w) → w at 4 + 64 = 68, plus the 36 + 64 = 100... call 1's region (32 + pad32(4)) = 64 bytes
        expect(decodePartialReturn(out.offsets[0]).memTargets).toEqual([64 + 68]);
    });

    test("descriptor inside an array argument of a multi-parameter function", () => {
        const b = new TransactionBuilder();
        const w = b.addCall(ABI, T, "getWord", []);
        b.addCall(ABI, T, "setNums", [1n, [2n, w]]);
        // heads 64 → array tail at 4 + 64 = 68: [len][e0][e1] → e1 at 68 + 64 = 132
        expect(first(b).memTargets).toEqual([132]);
    });

    test("descriptor inside a struct inside an array argument", () => {
        const b = new TransactionBuilder();
        const w = b.addCall(ABI, T, "getWord", []);
        b.addCall(ABI, T, "setPairs", [[{ nA: 1n, nB: 2n }, { nA: w, nB: 3n }]]);
        // tail at 4 + 32 = 36: [len][a0][b0][a1][b1] → a1 at 36 + 32 + 64 = 132
        expect(first(b).memTargets).toEqual([132]);
    });

    test("non-ASCII literal before a dynamic descriptor is measured in UTF-8 bytes", () => {
        const b = new TransactionBuilder();
        const item = b.addCall(ABI, T, "getItem", []);
        item.name.with_length(5);
        b.addCall(ABI, T, "setTexts", ["héllo ✓", item.name]); // 9 bytes → 32 padded
        // heads 64, a tail at 68 = [len][32] → b tail at 68 + 64 = 132
        expect(first(b).memTargets).toEqual([132]);
    });

    test("consumer several calls after the producer", () => {
        const b = new TransactionBuilder();
        const w = b.addCall(ABI, T, "getWord", []);
        b.addCall(ABI, T, "setWord", [1n]); // region: 32 + pad32(36) = 96
        b.addCall(ABI, T, "setWord", [2n]); // 96
        b.addCall(ABI, T, "setWord", [w]);
        expect(first(b).memTargets).toEqual([96 + 96 + 4]);
    });
});

describe("validation", () => {
    test("dynamic descriptor needs with_length", () => {
        const b = new TransactionBuilder();
        const item = b.addCall(ABI, T, "getItem", []);
        expect(() => b.addCall(ABI, T, "setTexts", ["", item.name])).toThrow("requires with_length()");
    });

    test("with_length only on dynamic values, and only non-negative integers", () => {
        const b = new TransactionBuilder();
        const w = b.addCall(ABI, T, "getWord", []);
        expect(() => w.with_length(1)).toThrow("is static");
        const item = b.addCall(ABI, T, "getItem", []);
        expect(() => item.name.with_length(-1)).toThrow("non-negative integer");
        expect(() => item.name.with_length(1.5)).toThrow("non-negative integer");
    });

    test("array elements need with_length and are bounds-checked", () => {
        const b = new TransactionBuilder();
        const [, nums] = b.addCall(ABI, T, "getCountAndNums", []);
        expect(() => nums[0]).toThrow("before indexing");
        nums.with_length(2);
        expect(() => nums[2]).toThrow("out of range");
        expect([...nums].length).toBe(2);
    });

    test("descriptor type must match the parameter kind", () => {
        const b = new TransactionBuilder();
        const w = b.addCall(ABI, T, "getWord", []);
        expect(() => b.addCall(ABI, T, "setBytes", [w])).toThrow("cannot pass a uint256 return value as a bytes argument");
    });

    test("msg.value on a view call is rejected", () => {
        const b = new TransactionBuilder();
        expect(() => b.addCall(ABI, T, "getWord", [], 1n)).toThrow("cannot receive msg.value");
    });

    test("a descriptor can feed multiple consumers", () => {
        const b = new TransactionBuilder();
        const w = b.addCall(ABI, T, "getWord", []);
        b.addCall(ABI, T, "setWord", [w]);
        b.addCall(ABI, T, "setWord", [w]);
        expect(first(b).memTargets).toEqual([4, 96 + 4]);
        expect(first(b).returnOffsets).toEqual([0, 0]);
    });

    test("incompatible array shapes are rejected before any splice is recorded", () => {
        const b = new TransactionBuilder();
        const pairs = b.addCall(ABI, T, "getPairs", []).with_length(2);
        expect(() => b.addCall(ABI, T, "setNums", [0n, pairs])).toThrow("cannot pass");
        const wrongTuple = [{ ...ABI.find(f => f.name === "setPairs"), inputs: [{type: "tuple[]", components: [u("nA")]}] }];
        expect(() => b.addCall(wrongTuple, T, "setPairs", [pairs])).toThrow("cannot pass");
        b.addCall(ABI, T, "setPairs", [pairs]);
        expect(first(b).resultLengths).toEqual([160]);
        expect(first(b).memTargets).toEqual([36]);
    });

    test("failed calldata encoding leaves a descriptor reusable", () => {
        const b = new TransactionBuilder();
        const w = b.addCall(ABI, T, "getWord", []);
        expect(() => b.addCall(ABI, T, "setStaticThenWord", [{nA: "invalid", nB: 0n}, w])).toThrow();
        b.addCall(ABI, T, "setWord", [w]);
        expect(first(b).memTargets).toEqual([4]);
    });

    test("at most three slices per producing call", () => {
        const b = new TransactionBuilder();
        const pairs = b.addCall(ABI, T, "getPairs", []);
        pairs.with_length(2);
        b.addCall(ABI, T, "setPairs", [[{ nA: pairs[0].nA, nB: pairs[0].nB }, { nA: pairs[1].nA, nB: pairs[1].nB }]]);
        expect(() => b.build()).toThrow("Too many variables");
    });

    test("calltype follows state mutability", () => {
        const b = new TransactionBuilder();
        b.addCall(ABI, T, "getWord", []);
        b.addCall(ABI, T, "setWord", [1n]);
        const { offsets } = b.build();
        expect(decodeCalltype(offsets[0])).toBe(Number(STATIC_CALL_FLAG));
        expect(decodeCalltype(offsets[1])).toBe(Number(CALL_FLAG));
    });
});

test("references from another builder cannot silently bind to the same call index", () => {
    const a = new TransactionBuilder(), b = new TransactionBuilder();
    const [, own] = a.addCall(ABI, T, "getCountAndNums", []);
    const [, foreign] = b.addCall(ABI, T, "getCountAndNums", []);
    foreign.with_length(2);
    const before = a.build();
    expect(() => a.addCall(ABI, T, "setWord", [foreign[0]])).toThrow("another builder");
    expect(a.build()).toEqual(before);
    own.with_length(2);
    a.addCall(ABI, T, "setWord", [own[0]]);
    expect(a.build().targets.length).toBe(2);
});
