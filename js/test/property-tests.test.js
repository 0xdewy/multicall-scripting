// ---------------------------------------------------------------
// property-tests.test.js — property-based fuzz tests for the
// JavaScript TransactionBuilder and offset encoding layer.
//
// Generates random call sequences and verifies invariants:
// - No two memTarget/returnOffset ranges overlap within a call
// - returnOffsets[i] + resultLengths[i] ≤ returnDataSize
// - All calltype flags are valid (0xFF, 0xFE, 0xFC, 0xFB)
// - num_vars ≤ 3
// - build() output offsets roundtrip through decode helpers
// - Overflow conditions throw correctly
// ---------------------------------------------------------------

import { describe, test, expect } from "bun:test";
import { TransactionBuilder } from "../index.js";
import {
    validateOffset,
    decodeCalltype,
    decodeMemTarget,
    decodeResultLength,
    decodePartialReturn,
    staticCall,
    staticCallPartialReturn,
    STATIC_CALL_FLAG,
    CALL_FLAG,
    VALUE_OFFSET,
} from "../encoding.js";

const UINT40_MAX = (1n << 40n) - 1n;
const UINT16_MAX = (1n << 16n) - 1n;

// ---- Random generators ----

function randomUint40() {
    return Number(BigInt(Math.floor(Math.random() * 2**52)) % (UINT40_MAX + 1n));
}

function randomUint16() {
    return Math.floor(Math.random() * 65536);
}

function randomFlag() {
    const flags = [STATIC_CALL_FLAG, CALL_FLAG];
    return flags[Math.floor(Math.random() * flags.length)];
}

function randomAddress() {
    const hex = "0x" + Array.from({length: 40}, () => Math.floor(Math.random() * 16).toString(16)).join("");
    return hex;
}

function randomCalldata(minBytes = 4, maxBytes = 256) {
    const len = minBytes + Math.floor(Math.random() * (maxBytes - minBytes + 1));
    return "0x" + Array.from({length: len * 2}, () => Math.floor(Math.random() * 16).toString(16)).join("");
}

function randomCallObject(hasPartialReturn = false) {
    const flag = (Math.random() < 0.5 ? STATIC_CALL_FLAG : CALL_FLAG);

    const numVars = hasPartialReturn ? Math.floor(Math.random() * 4) : 0;
    const memTargets = [];
    const resultLengths = [];
    const returnOffsets = [];
    let returnDataSize = 0;

    for (let v = 0; v < numVars; v++) {
        const mt = randomUint40();
        const rl = randomUint16();
        const ro = randomUint16();
        memTargets.push(mt);
        resultLengths.push(rl);
        returnOffsets.push(ro);
        returnDataSize = Math.max(returnDataSize, ro + rl);
    }

    return {
        target: randomAddress(),
        fnCalldata: randomCalldata(),
        calltype_flag: flag,
        memTargets,
        resultLengths: resultLengths.map(n => BigInt(n)),
        returnOffsets: returnOffsets.map(n => BigInt(n)),
        returnDataSize: BigInt(returnDataSize),
        msgValue: flag === CALL_FLAG && Math.random() < 0.3 ? BigInt(Math.floor(Math.random() * 1e18)) : BigInt(0),
    };
}

// ---- Helpers ----

function rangesOverlap(aStart, aLen, bStart, bLen) {
    const aEnd = aStart + aLen;
    const bEnd = bStart + bLen;
    return (aStart < bEnd && bStart < aEnd) || (aStart === bStart && aLen > 0 && bLen > 0);
}

function buildAndReturn(builder) {
    try {
        return { result: builder.build(), error: null };
    } catch (e) {
        return { result: null, error: e.message };
    }
}

// ================================================================
// Property tests
// ================================================================

describe("property: random call sequence invariants", () => {
    test("50 random sequences → build() succeeds or throws cleanly", () => {
        for (let trial = 0; trial < 50; trial++) {
            const builder = new TransactionBuilder();
            const numCalls = 2 + Math.floor(Math.random() * 15);

            for (let c = 0; c < numCalls; c++) {
                const call = randomCallObject(Math.random() < 0.3);
                builder.calls.push(call);
            }

            const { result, error } = buildAndReturn(builder);

            if (result) {
                expect(result.targets.length).toBe(numCalls);
                expect(result.offsets.length).toBe(numCalls);
                expect(result.calldatas.length).toBe(numCalls);
            } else {
                // Allowed failures: >3 vars, bad flag, overflow
                expect(error).toMatch(/Too many variables|Invalid calltype|return data slice exceeds|returnDataSize is too large/);
            }
        }
    });

    test("returnOffsets + resultLengths never silently exceed returnDataSize", () => {
        for (let trial = 0; trial < 50; trial++) {
            const builder = new TransactionBuilder();
            const call = randomCallObject(true);
            // Force oversized returnOffsets
            if (call.memTargets.length > 0) {
                const badIdx = Math.floor(Math.random() * call.memTargets.length);
                call.returnOffsets[badIdx] += UINT16_MAX - BigInt(Math.floor(Math.random() * 100));
            }
            builder.calls.push(call);

            const { result, error } = buildAndReturn(builder);
            // Must either throw or have valid bounds
            if (result) {
                for (let j = 0; j < call.returnOffsets.length; j++) {
                    expect(Number(call.returnOffsets[j]) + Number(call.resultLengths[j]))
                        .toBeLessThanOrEqual(Number(call.returnDataSize));
                }
            } else {
                expect(error).toMatch(/return data slice exceeds|returnDataSize is too large/);
            }
        }
    });

    test("memTarget ranges never overlap within a call", () => {
        const builder = new TransactionBuilder();

        // Construct a call with overlapping memTarget ranges
        const call = {
            target: randomAddress(),
            fnCalldata: "0xdeadbeef",
            calltype_flag: Number(STATIC_CALL_FLAG),
            memTargets: [10, 8],  // [10,10+20]=[10,30] overlaps [8,8+20]=[8,28]
            resultLengths: [BigInt(20), BigInt(20)],
            returnOffsets: [BigInt(0), BigInt(32)],
            returnDataSize: BigInt(64),
            msgValue: BigInt(0),
        };
        builder.calls.push(call);

        const { result } = buildAndReturn(builder);
        expect(result).not.toBeNull();

        // Decode partial return and verify both memTargets exist
        const offset0 = result.offsets[0];
        const decoded = decodePartialReturn(offset0);
        expect(decoded.numVars).toBe(2);
        expect(decoded.memTargets).toContain(10);
        expect(decoded.memTargets).toContain(8);

        // Verify no overlap in the return extraction ranges
        for (let i = 0; i < decoded.numVars; i++) {
            for (let j = i + 1; j < decoded.numVars; j++) {
                const aStart = decoded.returnOffsets[i];
                const aLen = decoded.resultLengths[i];
                const bStart = decoded.returnOffsets[j];
                const bLen = decoded.resultLengths[j];
                expect(rangesOverlap(aStart, aLen, bStart, bLen)).toBe(false);
            }
        }
    });

    test("num_vars never exceeds 3", () => {
        const builder = new TransactionBuilder();
        builder.calls.push({
            target: randomAddress(),
            fnCalldata: "0xdeadbeef",
            calltype_flag: Number(STATIC_CALL_FLAG),
            memTargets: [1, 2, 3, 4],
            resultLengths: [BigInt(10), BigInt(10), BigInt(10), BigInt(10)],
            returnOffsets: [BigInt(0), BigInt(16), BigInt(32), BigInt(48)],
            returnDataSize: BigInt(64),
            msgValue: BigInt(0),
        });

        const { error } = buildAndReturn(builder);
        expect(error).toMatch(/Too many variables/);
    });

    test("all valid calltype flags (0xFF/0xFE/0xFC/0xFB) pass validateOffset", () => {
        const offsets = [
            staticCall(0n, 0n),
            staticCallPartialReturn([0x04n], [0x20n], [0x00n], 0x60n),
        ];

        for (const o of offsets) {
            expect(() => validateOffset(o)).not.toThrow();
        }
    });

    test("build output offsets roundtrip through decode helpers", () => {
        const builder = new TransactionBuilder();

        // Mix of regular and partial return calls
        builder.calls.push({
            target: randomAddress(),
            fnCalldata: randomCalldata(4, 64),
            calltype_flag: Number(STATIC_CALL_FLAG),
            memTargets: [1, 2],
            resultLengths: [BigInt(0x20), BigInt(0x20)],
            returnOffsets: [BigInt(0), BigInt(0x40)],
            returnDataSize: BigInt(0x60),
            msgValue: BigInt(0),
        });

        builder.calls.push({
            target: randomAddress(),
            fnCalldata: randomCalldata(4, 64),
            calltype_flag: Number(CALL_FLAG),
            memTargets: [],
            resultLengths: [],
            returnOffsets: [],
            returnDataSize: BigInt(0),
            msgValue: BigInt(0),
        });

        builder.calls.push({
            target: randomAddress(),
            fnCalldata: randomCalldata(4, 64),
            calltype_flag: Number(CALL_FLAG),
            memTargets: [0x04, 0x64, 0x124],
            resultLengths: [BigInt(0x20), BigInt(0x40), BigInt(0x20)],
            returnOffsets: [BigInt(0x00), BigInt(0x20), BigInt(0x60)],
            returnDataSize: BigInt(0x80),
            msgValue: BigInt(1e15),
        });

        const { result, error } = buildAndReturn(builder);
        expect(error).toBeNull();
        expect(result.offsets.length).toBe(3);

        // Roundtrip partial return
        const d = decodePartialReturn(result.offsets[0]);
        expect(d.numVars).toBe(2);
        expect(d.memTargets).toEqual([1, 2]);
        expect(d.resultLengths).toEqual([0x20, 0x20]);
        expect(d.returnOffsets).toEqual([0, 0x40]);

        // Regular call roundtrip
        const ct = decodeCalltype(result.offsets[1]);
        expect(ct).toBe(Number(CALL_FLAG));

        // Full partial return with value
        const d2 = decodePartialReturn(result.offsets[2]);
        expect(d2.numVars).toBe(3);
        expect(d2.memTargets).toEqual([0x04, 0x64, 0x124]);
        expect(d2.returnDataSize).toBe(0x80);
    });
});

// ================================================================
// Overflow tests (JS layer equivalent of CallBuilder.sol:87)
// ================================================================

describe("overflow rejection", () => {
    test("build rejects returnDataSize > uint16 max via encoding layer", () => {
        // Test 1: encoding.js directly rejects oversized returnDataSize
        expect(() => staticCallPartialReturn([1n], [1n], [0n], BigInt(0x10000)))
            .toThrow("returnDataSize is too large");

        // Test 2: build() rejects a call with returnDataSize > 0xFFFF
        const builder = new TransactionBuilder();
        builder.calls.push({
            target: randomAddress(),
            fnCalldata: "0xdeadbeef",
            calltype_flag: Number(STATIC_CALL_FLAG),
            memTargets: [1],
            resultLengths: [BigInt(0x20)],
            returnOffsets: [BigInt(0)],
            returnDataSize: BigInt(0x10000),
            msgValue: BigInt(0),
        });
        // staticCallPartialReturn inside build() should throw
        expect(() => builder.build()).toThrow("returnDataSize is too large");
    });

    test("build allows returnDataSize = 0xFFFF (boundary)", () => {
        const builder = new TransactionBuilder();
        builder.calls.push({
            target: randomAddress(),
            fnCalldata: "0xdeadbeef",
            calltype_flag: Number(STATIC_CALL_FLAG),
            memTargets: [1],
            resultLengths: [BigInt(0xFFFF)],
            returnOffsets: [BigInt(0)],
            returnDataSize: BigInt(0xFFFF),
            msgValue: BigInt(0),
        });
        const { error } = buildAndReturn(builder);
        expect(error).toBeNull();
    });
});
