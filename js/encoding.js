// ---------------------------------------------------------------
// encoding.js — shared offset encoding/decoding for the JS layer.
//
// All constants and bit layouts derive from offset-schema.json.
// The Solidity contracts (src/MulticallScripter.sol, src/CallBuilder.sol)
// must mirror these definitions exactly.
// ---------------------------------------------------------------

import schema from "./offset-schema.json";

function flag(name) {
  const f = schema.flags[name];
  return BigInt(f.value);
}

// ---- Constants (exported, match Solidity Constants contract) ----

export const PARTIAL_RETURN_VARS = BigInt(schema.partial_return_vars);

export const STATIC_CALL_FLAG                = flag("STATIC_CALL_FLAG");
export const CALL_FLAG                       = flag("CALL_FLAG");
export const DELEGATE_CALL_FLAG              = flag("DELEGATE_CALL_FLAG");
export const STATIC_CALL_PARTIAL_RETURN_FLAG = flag("STATIC_CALL_PARTIAL_RETURN_FLAG");
export const CALL_PARTIAL_RETURN_FLAG        = flag("CALL_PARTIAL_RETURN_FLAG");

export const VALUE_OFFSET = BigInt(schema.value_offset);

const UINT120_MAX = (1n << 120n) - 1n;
const UINT8_MAX = BigInt(0xFF);
const UINT40_MAX = (1n << 40n) - 1n;
const UINT16_MAX = (1n << 16n) - 1n;

// ---- Encode helpers (exported, all return BigInt offset words) ----

export function staticCall(memTarget, resultLength) {
    memTarget = BigInt(memTarget);
    resultLength = BigInt(resultLength);
    if (memTarget > UINT120_MAX) throw new Error("memTarget value too large");
    if (resultLength > UINT120_MAX) throw new Error("resultLength value too large");
    return (STATIC_CALL_FLAG << VALUE_OFFSET) | (memTarget << 120n) | resultLength;
}

export function stateChangingCall(msgValueIndex = 0) {
    msgValueIndex = BigInt(msgValueIndex);
    if (msgValueIndex > UINT8_MAX) throw new Error("msgValueIndex too large");
    return (CALL_FLAG << VALUE_OFFSET) | (msgValueIndex << 240n);
}

export function staticCallPartialReturn(memTargets, resultLengths, returnOffsets, returnDataSize) {
    returnDataSize = BigInt(returnDataSize);

    if (memTargets.length > PARTIAL_RETURN_VARS ||
        resultLengths.length > PARTIAL_RETURN_VARS ||
        returnOffsets.length > PARTIAL_RETURN_VARS) {
        throw new Error("invalid number of params");
    }
    if (returnDataSize > UINT16_MAX) {
        throw new Error("returnDataSize is too large");
    }

    const len = memTargets.length;
    let encodedMemTargets = 0n;
    let encodedResultLengths = 0n;
    let encodedOffsets = 0n;

    for (let i = 0; i < len; i++) {
        const v_memTarget = BigInt(memTargets[i]);
        const v_resultLength = BigInt(resultLengths[i]);
        const v_returnOffset = BigInt(returnOffsets[i]);

        if (v_memTarget > UINT40_MAX) throw new Error("memTarget value too large");
        if (v_resultLength > UINT16_MAX) throw new Error("resultLength value too large");
        if (v_returnOffset > UINT16_MAX) throw new Error("returnOffset value too large");

        const varOffset = Number(PARTIAL_RETURN_VARS) - (i + 1);
        encodedMemTargets |= v_memTarget << BigInt(varOffset * 40);
        encodedResultLengths |= v_resultLength << BigInt(varOffset * 16);
        encodedOffsets |= v_returnOffset << BigInt(varOffset * 16);
    }

    return (
        (STATIC_CALL_PARTIAL_RETURN_FLAG << VALUE_OFFSET) |
        (encodedMemTargets << 120n) |
        (encodedResultLengths << 72n) |
        (encodedOffsets << 24n) |
        (returnDataSize << 8n) |
        BigInt(len)
    );
}

export function callPartialReturn(msgValueIndex, memTargets, resultLengths, returnOffsets, returnDataSize) {
    msgValueIndex = BigInt(msgValueIndex);
    returnDataSize = BigInt(returnDataSize);

    if (memTargets.length > PARTIAL_RETURN_VARS ||
        resultLengths.length > PARTIAL_RETURN_VARS ||
        returnOffsets.length > PARTIAL_RETURN_VARS) {
        throw new Error("invalid number of params");
    }
    if (msgValueIndex > UINT8_MAX) throw new Error("msgValueIndex too large");
    if (returnDataSize > UINT16_MAX) throw new Error("returnDataSize is too large");

    const len = memTargets.length;
    let encodedMemTargets = 0n;
    let encodedResultLengths = 0n;
    let encodedOffsets = 0n;

    for (let i = 0; i < len; i++) {
        const v_memTarget = BigInt(memTargets[i]);
        const v_resultLength = BigInt(resultLengths[i]);
        const v_returnOffset = BigInt(returnOffsets[i]);

        if (v_memTarget > UINT40_MAX) throw new Error("memTarget value too large");
        if (v_resultLength > UINT16_MAX) throw new Error("resultLength value too large");
        if (v_returnOffset > UINT16_MAX) throw new Error("returnOffset value too large");

        const varOffset = Number(PARTIAL_RETURN_VARS) - (i + 1);
        encodedMemTargets |= v_memTarget << BigInt(varOffset * 40);
        encodedResultLengths |= v_resultLength << BigInt(varOffset * 16);
        encodedOffsets |= v_returnOffset << BigInt(varOffset * 16);
    }

    return (
        (CALL_PARTIAL_RETURN_FLAG << VALUE_OFFSET) |
        (msgValueIndex << 240n) |
        (encodedMemTargets << 120n) |
        (encodedResultLengths << 72n) |
        (encodedOffsets << 24n) |
        (returnDataSize << 8n) |
        BigInt(len)
    );
}

// ---- Decode helpers (new — not previously present in the codebase) ----

export function decodeCalltype(offset) {
    return Number(BigInt(offset) >> VALUE_OFFSET);
}

export function decodeValueIndex(offset, flag) {
    if (flag !== 0xFE && flag !== 0xFB) return 0;
    offset = BigInt(offset);
    return Number((offset >> 240n) & 0xFFn);
}

export function decodeMemTarget(offset) {
    offset = BigInt(offset);
    return (offset >> 120n) & UINT120_MAX;
}

export function decodeResultLength(offset) {
    offset = BigInt(offset);
    return offset & UINT120_MAX;
}

export function decodePartialReturn(offset) {
    offset = BigInt(offset);
    const numVars = Number(offset & 0xFFn);
    const returnDataSize = Number((offset >> 8n) & 0xFFFFn);

    const rawReturnOffsets = (offset >> 24n) & 0xFFFFFFFFFFFFn;
    const rawResultLengths = (offset >> 72n) & 0xFFFFFFFFFFFFn;
    const rawMemTargets = (offset >> 120n) & ((1n << 120n) - 1n);

    const memTargets = [];
    const resultLengths = [];
    const returnOffsets = [];

    for (let i = 0; i < numVars; i++) {
        const varShift = (Number(PARTIAL_RETURN_VARS) - (i + 1)) * 40;
        const smallShift = (Number(PARTIAL_RETURN_VARS) - (i + 1)) * 16;
        memTargets.push(Number((rawMemTargets >> BigInt(varShift)) & 0xFFFFFFFFFFn));
        resultLengths.push(Number((rawResultLengths >> BigInt(smallShift)) & 0xFFFFn));
        returnOffsets.push(Number((rawReturnOffsets >> BigInt(smallShift)) & 0xFFFFn));
    }

    return { memTargets, resultLengths, returnOffsets, returnDataSize, numVars };
}

// ---- Validation (new — check an offset against schema constraints) ----

export function validateOffset(offset) {
    const calltype = decodeCalltype(offset);
    const flag = Object.entries(schema.flags).find(([, f]) => Number(BigInt(f.value)) === calltype);
    if (!flag) throw new Error(`Unknown calltype: 0x${calltype.toString(16)}`);
    if (flag[1].status === "unimplemented") throw new Error(`Unimplemented calltype: ${flag[0]}`);
}
