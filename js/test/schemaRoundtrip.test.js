// ---------------------------------------------------------------
// schemaRoundtrip.test.js — exhaustive schema-based roundtrip tests
//
// Validates that the encoding/decoding functions from encoding.js
// produce correct results for all flag types, including edge cases.
// This provides a stronger guarantee than the existing encodingRoundtrip.js
// (which only tests a few hardcoded values against Solidity via FFI).
// ---------------------------------------------------------------

import { describe, test, expect } from "bun:test";
import {
    staticCall,
    stateChangingCall,
    staticCallPartialReturn,
    callPartialReturn,
    decodeCalltype,
    decodeValueIndex,
    decodeMemTarget,
    decodeResultLength,
    decodePartialReturn,
    validateOffset,
    STATIC_CALL_FLAG,
    CALL_FLAG,
    STATIC_CALL_PARTIAL_RETURN_FLAG,
    CALL_PARTIAL_RETURN_FLAG,
    DELEGATE_CALL_FLAG,
    VALUE_OFFSET,
} from "../encoding.js";

function flagOf(offset) {
    return Number(BigInt(offset) >> VALUE_OFFSET);
}

// ================================================================
// Regular calls (0xFF STATIC_CALL, 0xFE CALL)
// ================================================================

describe("regular call encoding", () => {
    test("staticCall packs calltype + memTarget + resultLength", () => {
        const o = staticCall(0x24n, 0x20n);

        expect(decodeCalltype(o)).toBe(Number(STATIC_CALL_FLAG));
        expect(decodeMemTarget(o)).toBe(0x24n);
        expect(decodeResultLength(o)).toBe(0x20n);
    });

    test("staticCall with zero values", () => {
        const o = staticCall(0n, 0n);
        expect(decodeCalltype(o)).toBe(Number(STATIC_CALL_FLAG));
        expect(decodeMemTarget(o)).toBe(0n);
        expect(decodeResultLength(o)).toBe(0n);
    });

    test("staticCall with max 120-bit values", () => {
        const max120 = (1n << 120n) - 1n;
        const o = staticCall(max120, max120);
        expect(decodeMemTarget(o)).toBe(max120);
        expect(decodeResultLength(o)).toBe(max120);
    });

    test("staticCall rejects >120-bit memTarget", () => {
        expect(() => staticCall(1n << 120n, 0n)).toThrow("memTarget value too large");
    });

    test("staticCall rejects >120-bit resultLength", () => {
        expect(() => staticCall(0n, 1n << 120n)).toThrow("resultLength value too large");
    });

    test("stateChangingCall() defaults to msgValueIndex=0", () => {
        const o = stateChangingCall();
        expect(decodeCalltype(o)).toBe(Number(CALL_FLAG));
        expect(decodeValueIndex(o, 0xFE)).toBe(0);
    });

    test("stateChangingCall(5) packs valueIndex at position 240", () => {
        const o = stateChangingCall(5);
        expect(decodeCalltype(o)).toBe(Number(CALL_FLAG));
        expect(decodeValueIndex(o, 0xFE)).toBe(5);
    });

    test("stateChangingCall rejects >8-bit msgValueIndex", () => {
        expect(() => stateChangingCall(256)).toThrow("msgValueIndex too large");
    });

    test("stateChangingCall(0) and staticCall(0,0) differ in calltype only", () => {
        const sc = staticCall(0n, 0n);
        const scc = stateChangingCall(0);
        const mask = 0xFFn << VALUE_OFFSET;
        // Everything below calltype bits should be zero for both
        expect(sc & ~mask).toBe(0n);
        expect(scc & ~mask).toBe(0n);
    });
});

// ================================================================
// Partial return calls (0xFC, 0xFB)
// ================================================================

describe("partial return encoding", () => {
    test("staticCallPartialReturn with 1 variable", () => {
        const o = staticCallPartialReturn([0x04n], [0x20n], [0x08n], 0x60n);
        expect(decodeCalltype(o)).toBe(Number(STATIC_CALL_PARTIAL_RETURN_FLAG));

        const d = decodePartialReturn(o);
        expect(d.numVars).toBe(1);
        expect(d.returnDataSize).toBe(0x60);
        expect(d.memTargets[0]).toBe(0x04);
        expect(d.resultLengths[0]).toBe(0x20);
        expect(d.returnOffsets[0]).toBe(0x08);
    });

    test("staticCallPartialReturn with 2 variables", () => {
        const o = staticCallPartialReturn(
            [0x04n, 0x64n],
            [0x20n, 0x40n],
            [0x00n, 0x20n],
            0x80n
        );
        const d = decodePartialReturn(o);
        expect(d.numVars).toBe(2);
        expect(d.returnDataSize).toBe(0x80);
        expect(d.memTargets).toEqual([0x04, 0x64]);
        expect(d.resultLengths).toEqual([0x20, 0x40]);
        expect(d.returnOffsets).toEqual([0x00, 0x20]);
    });

    test("staticCallPartialReturn with 3 variables", () => {
        const o = staticCallPartialReturn(
            [1n, 2n, 3n],
            [10n, 20n, 30n],
            [100n, 200n, 300n],
            0x200n
        );
        const d = decodePartialReturn(o);
        expect(d.numVars).toBe(3);
        expect(d.memTargets).toEqual([1, 2, 3]);
        expect(d.resultLengths).toEqual([10, 20, 30]);
        expect(d.returnOffsets).toEqual([100, 200, 300]);
    });

    test("staticCallPartialReturn rejects >3 variables", () => {
        expect(() => staticCallPartialReturn([1, 2, 3, 4], [1, 2, 3, 4], [1, 2, 3, 4], 0x100))
            .toThrow("invalid number of params");
    });

    test("staticCallPartialReturn rejects >40-bit memTarget", () => {
        expect(() => staticCallPartialReturn([1n << 40n], [1n], [0n], 0x60n))
            .toThrow("memTarget value too large");
    });

    test("staticCallPartialReturn rejects >16-bit resultLength", () => {
        expect(() => staticCallPartialReturn([1n], [0x10000n], [0n], 0x60n))
            .toThrow("resultLength value too large");
    });

    test("staticCallPartialReturn rejects >16-bit returnOffset", () => {
        expect(() => staticCallPartialReturn([1n], [1n], [0x10000n], 0x60n))
            .toThrow("returnOffset value too large");
    });

    test("staticCallPartialReturn rejects >16-bit returnDataSize", () => {
        expect(() => staticCallPartialReturn([1n], [1n], [0n], 0x10000n))
            .toThrow("returnDataSize is too large");
    });

    test("callPartialReturn encodes valueIndex for FLAG=0xFB", () => {
        const o = callPartialReturn(7, [0x04n], [0x20n], [0x00n], 0x60n);
        expect(decodeCalltype(o)).toBe(Number(CALL_PARTIAL_RETURN_FLAG));
        expect(decodeValueIndex(o, 0xFB)).toBe(7);
    });

    test("callPartialReturn rejects >8-bit msgValueIndex", () => {
        expect(() => callPartialReturn(256, [1n], [1n], [0n], 0x60n))
            .toThrow("msgValueIndex too large");
    });

    test("partial return roundtrip: encode → decode → fields match input", () => {
        // Test a range of combos
        const combos = [
            { m: [0x04n],         l: [0x20n],         r: [0x00n],          s: 0x20n },
            { m: [0x04n, 0x44n],  l: [0x20n, 0x20n],  r: [0x00n, 0x40n],   s: 0x60n },
            { m: [1n, 2n, 3n],    l: [10n, 20n, 30n], r: [100n, 200n, 300n], s: 0x200n },
            { m: [0n, 0n, 0n],    l: [0n, 0n, 0n],    r: [0n, 0n, 0n],      s: 0n },
            // max values
            { m: [0xFFFFFFFFFFn, 0xFFFFFFFFFFn, 0xFFFFFFFFFFn],
              l: [0xFFFFn, 0xFFFFn, 0xFFFFn],
              r: [0xFFFFn, 0xFFFFn, 0xFFFFn],
              s: 0xFFFFn },
        ];
        for (const c of combos) {
            const o = staticCallPartialReturn(c.m, c.l, c.r, c.s);
            const d = decodePartialReturn(o);
            const mNum = c.m.map(n => Number(n));
            const lNum = c.l.map(n => Number(n));
            const rNum = c.r.map(n => Number(n));
            expect(d.memTargets).toEqual(mNum);
            expect(d.resultLengths).toEqual(lNum);
            expect(d.returnOffsets).toEqual(rNum);
            expect(d.returnDataSize).toBe(Number(c.s));
        }
    });
});

// ================================================================
// Decode helpers (new)
// ================================================================

describe("decode helpers", () => {
    test("decodeCalltype returns the top 8 bits", () => {
        expect(decodeCalltype(staticCall(0n, 0n))).toBe(0xFF);
        expect(decodeCalltype(stateChangingCall(0))).toBe(0xFE);
    });

    test("decodeValueIndex returns 0 for flags that don't use it", () => {
        expect(decodeValueIndex(staticCall(0n, 0n), 0xFF)).toBe(0);
    });

    test("decodeValueIndex returns packed value for 0xFE", () => {
        expect(decodeValueIndex(stateChangingCall(3), 0xFE)).toBe(3);
    });

    test("decodeValueIndex returns packed value for 0xFB", () => {
        const o = callPartialReturn(5, [1n], [2n], [3n], 4n);
        expect(decodeValueIndex(o, 0xFB)).toBe(5);
    });
});

// ================================================================
// Validation
// ================================================================

describe("validateOffset", () => {
    test("valid offset passes validation", () => {
        expect(() => validateOffset(staticCall(0n, 0n))).not.toThrow();
        expect(() => validateOffset(stateChangingCall(0))).not.toThrow();
    });

    test("delegate call flag (unimplemented) throws", () => {
        const delegateOffset = DELEGATE_CALL_FLAG << VALUE_OFFSET;
        expect(() => validateOffset(delegateOffset)).toThrow("Unimplemented calltype");
    });

    test("unknown calltype throws", () => {
        const unknown = 0xABn << VALUE_OFFSET;
        expect(() => validateOffset(unknown)).toThrow("Unknown calltype");
    });
});

// ================================================================
// Identity: encoding output matches original imports from index.js
// ================================================================

describe("compatibility with index.js exports", () => {
    test("index.js re-exports match encoding.js originals", async () => {
        const idx = await import("../index.js");
        const enc = await import("../encoding.js");

        // constants
        expect(idx.STATIC_CALL_FLAG).toBe(enc.STATIC_CALL_FLAG);
        expect(idx.CALL_FLAG).toBe(enc.CALL_FLAG);
        expect(idx.STATIC_CALL_PARTIAL_RETURN_FLAG).toBe(enc.STATIC_CALL_PARTIAL_RETURN_FLAG);
        expect(idx.CALL_PARTIAL_RETURN_FLAG).toBe(enc.CALL_PARTIAL_RETURN_FLAG);
        expect(idx.PARTIAL_RETURN_VARS).toBe(enc.PARTIAL_RETURN_VARS);
        expect(idx.VALUE_OFFSET).toBe(enc.VALUE_OFFSET);

        // helpers produce identical results
        const sc = idx.staticCall(0x24n, 0x20n);
        expect(sc).toBe(enc.staticCall(0x24n, 0x20n));

        const scc = idx.stateChangingCall(2);
        expect(scc).toBe(enc.stateChangingCall(2));

        const pr = idx.staticCallPartialReturn([0x04n, 0x44n], [0x20n, 0x20n], [0x00n, 0x40n], 0x60n);
        expect(pr).toBe(enc.staticCallPartialReturn([0x04n, 0x44n], [0x20n, 0x20n], [0x00n, 0x40n], 0x60n));
    });
});
