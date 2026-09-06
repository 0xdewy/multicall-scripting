// Offset-word encoding/decoding for the JS layer. Every constant and bit position comes from
// offset-schema.json (a generated mirror of schema/offset-schema.json — run `bun run sync:schema`).
// src/MulticallScripter.sol and rust/crates/codec must agree with this file bit for bit.

import schema from "./offset-schema.json";

const flag = (name) => BigInt(schema.flags[name].value);

export const PARTIAL_RETURN_VARS = Number(schema.partial_return_vars);
export const VALUE_OFFSET = BigInt(schema.value_offset);

export const STATIC_CALL_FLAG = flag("STATIC_CALL_FLAG");
export const CALL_FLAG = flag("CALL_FLAG");
export const STATIC_CALL_PARTIAL_RETURN_FLAG = flag("STATIC_CALL_PARTIAL_RETURN_FLAG");
export const CALL_PARTIAL_RETURN_FLAG = flag("CALL_PARTIAL_RETURN_FLAG");

const KNOWN_FLAGS = new Set(Object.values(schema.flags).map((f) => Number(BigInt(f.value))));

const UINT120_MAX = (1n << 120n) - 1n;
const UINT40_MAX = (1n << 40n) - 1n;
const UINT16_MAX = (1n << 16n) - 1n;
const UINT8_MAX = 0xffn;

// Reject coercions (null/booleans/empty strings) and rounded JS numbers before bit packing.
function unsigned(value) {
    if (!["bigint", "string", "number"].includes(typeof value)
        || (typeof value === "string" && value.trim() === "")
        || (typeof value === "number" && !Number.isSafeInteger(value))) {
        throw new Error("Expected an exact unsigned integer; use BigInt or a string for large integers");
    }
    const n = BigInt(value);
    if (n < 0n) throw new Error("Expected an unsigned integer");
    return n;
}

function offsetWord(value) {
    const n = unsigned(value);
    if (n >= (1n << 256n)) throw new Error("offset must fit uint256");
    return n;
}

// ---- Encoders: all return the 256-bit offset word as a BigInt ----

function regular(flag_, msgValueIndex, memTarget, resultLength) {
    msgValueIndex = unsigned(msgValueIndex);
    memTarget = unsigned(memTarget);
    resultLength = unsigned(resultLength);
    if (msgValueIndex > UINT8_MAX) throw new Error("msgValueIndex too large");
    if (memTarget > UINT120_MAX) throw new Error("memTarget value too large");
    if (resultLength > UINT120_MAX) throw new Error("resultLength value too large");
    return (flag_ << VALUE_OFFSET) | (msgValueIndex << 240n) | (memTarget << 120n) | resultLength;
}

function partial(flag_, msgValueIndex, memTargets, resultLengths, returnOffsets, returnDataSize) {
    msgValueIndex = unsigned(msgValueIndex);
    returnDataSize = unsigned(returnDataSize);
    const len = memTargets.length;
    if (len > PARTIAL_RETURN_VARS || resultLengths.length > PARTIAL_RETURN_VARS || returnOffsets.length > PARTIAL_RETURN_VARS) {
        throw new Error("invalid number of params");
    }
    if (resultLengths.length !== len || returnOffsets.length !== len) {
        throw new Error("mismatched memTargets/resultLengths/returnOffsets lengths");
    }
    if (msgValueIndex > UINT8_MAX) throw new Error("msgValueIndex too large");
    if (returnDataSize > UINT16_MAX) throw new Error("returnDataSize is too large");

    let packedTargets = 0n;
    let packedLengths = 0n;
    let packedOffsets = 0n;
    for (let i = 0; i < len; i++) {
        const memTarget = unsigned(memTargets[i]);
        const resultLength = unsigned(resultLengths[i]);
        const returnOffset = unsigned(returnOffsets[i]);
        if (memTarget > UINT40_MAX) throw new Error("memTarget value too large");
        if (resultLength > UINT16_MAX) throw new Error("resultLength value too large");
        if (returnOffset > UINT16_MAX) throw new Error("returnOffset value too large");

        // MSB-first: var 0 occupies the highest bits of each field
        const slot = BigInt(PARTIAL_RETURN_VARS - (i + 1));
        packedTargets |= memTarget << (slot * 40n);
        packedLengths |= resultLength << (slot * 16n);
        packedOffsets |= returnOffset << (slot * 16n);
    }

    return (
        (flag_ << VALUE_OFFSET) |
        (msgValueIndex << 240n) |
        (packedTargets << 120n) |
        (packedLengths << 72n) |
        (packedOffsets << 24n) |
        (returnDataSize << 8n) |
        BigInt(len)
    );
}

/** 0xFF: staticcall; copy `resultLength` bytes of return data to `memTarget` of the next call. */
export function staticCall(memTarget, resultLength) {
    return regular(STATIC_CALL_FLAG, 0, memTarget, resultLength);
}

/** 0xFE: call with optional msg.value (`msgValueIndex` is 1-based into msgValues; 0 = none). */
export function stateChangingCall(msgValueIndex = 0, memTarget = 0, resultLength = 0) {
    return regular(CALL_FLAG, msgValueIndex, memTarget, resultLength);
}

/** 0xFC: staticcall; capture `returnDataSize` bytes, then copy up to 3 slices into the next call. */
export function staticCallPartialReturn(memTargets, resultLengths, returnOffsets, returnDataSize) {
    return partial(STATIC_CALL_PARTIAL_RETURN_FLAG, 0, memTargets, resultLengths, returnOffsets, returnDataSize);
}

/** 0xFB: as staticCallPartialReturn but with call() and an optional msg.value. */
export function callPartialReturn(msgValueIndex, memTargets, resultLengths, returnOffsets, returnDataSize) {
    return partial(CALL_PARTIAL_RETURN_FLAG, msgValueIndex, memTargets, resultLengths, returnOffsets, returnDataSize);
}

// ---- Decoders ----

export function decodeCalltype(offset) {
    return Number(offsetWord(offset) >> VALUE_OFFSET);
}

export function decodeValueIndex(offset, flag_) {
    offset = offsetWord(offset);
    if (flag_ !== Number(CALL_FLAG) && flag_ !== Number(CALL_PARTIAL_RETURN_FLAG)) return 0;
    return Number((offsetWord(offset) >> 240n) & UINT8_MAX);
}

export function decodeMemTarget(offset) {
    return (offsetWord(offset) >> 120n) & UINT120_MAX;
}

export function decodeResultLength(offset) {
    return offsetWord(offset) & UINT120_MAX;
}

export function decodePartialReturn(offset) {
    offset = offsetWord(offset);
    const numVars = Number(offset & UINT8_MAX);
    if (numVars > PARTIAL_RETURN_VARS) throw new Error("invalid number of params");
    const returnDataSize = Number((offset >> 8n) & UINT16_MAX);
    const memTargets = [];
    const resultLengths = [];
    const returnOffsets = [];
    for (let i = 0; i < numVars; i++) {
        const slot = BigInt(PARTIAL_RETURN_VARS - (i + 1));
        memTargets.push(Number((offset >> (120n + slot * 40n)) & UINT40_MAX));
        resultLengths.push(Number((offset >> (72n + slot * 16n)) & UINT16_MAX));
        returnOffsets.push(Number((offset >> (24n + slot * 16n)) & UINT16_MAX));
    }
    return { memTargets, resultLengths, returnOffsets, returnDataSize, numVars };
}

/** Validate the word width, calltype and partial count (batch-dependent bounds need execution). */
export function validateOffset(offset) {
    const calltype = decodeCalltype(offset);
    if (!KNOWN_FLAGS.has(calltype)) throw new Error(`Unknown calltype: 0x${calltype.toString(16)}`);
    if ((calltype === Number(STATIC_CALL_PARTIAL_RETURN_FLAG) || calltype === Number(CALL_PARTIAL_RETURN_FLAG))
        && (offsetWord(offset) & UINT8_MAX) > BigInt(PARTIAL_RETURN_VARS)) throw new Error("invalid number of params");
}
