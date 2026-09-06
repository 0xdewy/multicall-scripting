// Public-API batches checked against a separate ABI interpreter. Fixed seeds make failures replayable.
import { test, expect } from "bun:test";
import { encodeAbiParameters, decodeFunctionData, encodeFunctionData } from "viem";
import { TransactionBuilder, decodePartialReturn } from "../index.js";

const T = "0x0000000000000000000000000000000000000001";
const ABI = [
    { type: "function", name: "add", stateMutability: "pure", inputs: [{ type: "uint256" }, { type: "uint256" }], outputs: [{ type: "uint256" }] },
    { type: "function", name: "echo", stateMutability: "pure", inputs: [{ type: "bytes" }], outputs: [{ type: "bytes" }] },
    { type: "function", name: "numbers", stateMutability: "pure", inputs: [{ type: "uint256[]" }], outputs: [{ type: "uint256[]" }] },
];
const bytes = hex => Buffer.from(hex.slice(2), "hex");

function checkSeed(seed) {
    let state = seed;
    const random = n => {
        state ^= state << 13; state ^= state >>> 17; state ^= state << 5;
        return (state >>> 0) % n;
    };
    const b = new TransactionBuilder();
    const calls = [];
    const outputs = [];
    for (let i = 0, n = 3 + random(10); i < n; ++i) {
        const fn = ABI[random(ABI.length)];
        const expectedArgs = [];
        const args = fn.inputs.map(param => {
            const candidates = outputs.filter(o => o.type === param.type && o.uses < 3);
            if (candidates.length && random(3) !== 0) {
                const source = candidates[random(candidates.length)];
                ++source.uses;
                expectedArgs.push(source.value);
                return source.ref;
            }
            const value = param.type === "uint256" ? BigInt(random(1000))
                : param.type === "bytes" ? "0x" + Array.from({length: random(98)}, () => random(256).toString(16).padStart(2, "0")).join("")
                : Array.from({length: random(5)}, () => BigInt(random(1000)));
            expectedArgs.push(value);
            return value;
        });
        const value = fn.name === "add" ? expectedArgs[0] + expectedArgs[1] : expectedArgs[0];
        const ref = b.addCall(ABI, T, fn.name, args);
        if (fn.name !== "add") ref.with_length(fn.name === "echo" ? (value.length - 2) / 2 : value.length);
        outputs.push({ref, value, type: fn.outputs[0].type, uses: 0});
        calls.push({fn, expectedArgs, result: bytes(encodeAbiParameters(fn.outputs, [value]))});
    }
    const built = b.build();
    const starts = [];
    const lengths = [];
    const region = bytes(built.calldatas);
    let cursor = 0;
    for (const call of calls) {
        starts.push(cursor);
        const length = bytes(encodeFunctionData({abi: ABI, functionName: call.fn.name, args: call.expectedArgs})).length;
        lengths.push(length);
        expect(BigInt("0x" + region.subarray(cursor, cursor + 32).toString("hex"))).toBe(BigInt(length));
        cursor += 32 + Math.ceil(length / 32) * 32;
    }
    expect(cursor).toBe(region.length);
    calls.forEach((call, i) => {
        const input = region.subarray(starts[i] + 32, starts[i] + 32 + lengths[i]);
        const actualHex = "0x" + input.toString("hex");
        expect(decodeFunctionData({abi: ABI, data: actualHex}).args).toEqual(call.expectedArgs);
        expect(actualHex).toBe(encodeFunctionData({abi: ABI, functionName: call.fn.name, args: call.expectedArgs}));
        if ((built.offsets[i] >> 248n) !== 0xFCn) return;
        const d = decodePartialReturn(built.offsets[i]);
        expect(d.numVars).toBeLessThanOrEqual(3);
        expect(d.returnDataSize).toBeLessThanOrEqual(call.result.length);
        for (let j = 0; j < d.numVars; ++j) {
            const target = starts[i + 1] + 32 + d.memTargets[j];
            expect(target + d.resultLengths[j]).toBeLessThanOrEqual(region.length);
            call.result.copy(region, target, d.returnOffsets[j], d.returnOffsets[j] + d.resultLengths[j]);
        }
    });
}

test("generated scalar, bytes and array chains match an ABI reference interpreter", () => {
    for (let seed = 1; seed <= 100; ++seed) {
        try { checkSeed(seed); }
        catch (error) { throw new Error(`Replay with checkSeed(${seed}): ${error.message}`, {cause: error}); }
    }
});
