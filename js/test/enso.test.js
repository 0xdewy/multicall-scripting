import { describe, expect, test } from "bun:test";
import { encodeFunctionData, parseAbi } from "viem";
import { decodeMemTarget, decodeResultLength } from "../encoding.js";
import {
    ENSO_COMPATIBILITY, assertEnsoSimulation, buildEnsoDelegateBatch, inspectEnsoDelegateRoute,
} from "../enso.js";

const CALLER = "0x00000000000000000000000000000000000000AA";
const TOKEN = "0x00000000000000000000000000000000000000bb";
const RECEIVER = "0x00000000000000000000000000000000000000cc";
const ABI = parseAbi(["function executeShortcut(bytes32,bytes32,bytes32[],bytes[]) payable returns (bytes[])"]);
const ZERO = `0x${"00".repeat(32)}`;
const stateWord = (value) => `0x${BigInt(value).toString(16).padStart(64, "0")}`;
const addressWord = (value) => `0x${value.slice(2).padStart(64, "0")}`;

function command(selector, flags, indices, output, target = TOKEN) {
    return `0x${selector.slice(2)}${flags.toString(16).padStart(2, "0")}${indices.map(i => i.toString(16).padStart(2, "0")).join("").padEnd(12, "f")}${output.toString(16).padStart(2, "0")}${target.slice(2)}`;
}

function response(commands, state, value = 0n) {
    return {tx: {from: CALLER, to: CALLER, value: value.toString(), data: encodeFunctionData({
        abi: ABI, functionName: "executeShortcut", args: [ZERO, ZERO, commands, state],
    })}};
}

function frames(packed) {
    const bytes = Buffer.from(packed.slice(2), "hex"), result = [];
    for (let cursor = 0; cursor < bytes.length;) {
        const length = Number(BigInt(`0x${bytes.subarray(cursor, cursor + 32).toString("hex")}`));
        cursor += 32;
        result.push(`0x${bytes.subarray(cursor, cursor + length).toString("hex")}`);
        cursor += Math.ceil(length / 32) * 32;
    }
    return result;
}

describe("Enso delegate translator", () => {
    test("removes the Enso executor and wires a scalar result into the next protocol call", () => {
        const balanceOf = command("0x70a08231", 0x02, [0], 2);
        const transfer = command("0xa9059cbb", 0x01, [1, 2], 0xff);
        const {batch, value, commandCount} = inspectEnsoDelegateRoute(
            response([balanceOf, transfer], [addressWord(CALLER), addressWord(RECEIVER), "0x"]),
            {caller: CALLER, routingStrategy: "delegate", chainId: 1},
        );
        expect(batch.targets).toEqual([TOKEN, TOKEN]);
        expect(frames(batch.calldatas)).toEqual([
            `0x70a08231${CALLER.slice(2).padStart(64, "0").toLowerCase()}`,
            `0xa9059cbb${RECEIVER.slice(2).padStart(64, "0").toLowerCase()}${"00".repeat(32)}`,
        ]);
        expect(decodeMemTarget(batch.offsets[0])).toBe(36n);
        expect(decodeResultLength(batch.offsets[0])).toBe(32n);
        expect(batch.msgValues).toEqual([]);
        expect(value).toBe(0n);
        expect(commandCount).toBe(2);
    });

    test("reconstructs literal dynamic arguments and fixed call value", () => {
        const dynamic = `0x${stateWord(3).slice(2)}010203${"00".repeat(29)}`;
        const call = command("0x12345678", 0x03, [0, 0x81], 0xff);
        // Delegate routes may spend the EOA's existing balance with tx.value == 0.
        const {batch, value} = inspectEnsoDelegateRoute(response([call], [stateWord(7), dynamic]), {
            caller: CALLER, routingStrategy: "delegate", chainId: 1,
        });
        expect(frames(batch.calldatas)).toEqual([`0x12345678${stateWord(32).slice(2)}${dynamic.slice(2)}`]);
        expect(batch.msgValues).toEqual([7n]);
        expect(value).toBe(0n);
    });

    test("supports extended commands", () => {
        const first = command("0x12345678", 0x41, [], 0xff);
        const indices = `0x${[0, 1, 2, 3, 4, 5, 6].map(i => i.toString(16).padStart(2, "0")).join("").padEnd(64, "f")}`;
        const {batch} = inspectEnsoDelegateRoute(response([first, indices], Array.from({length: 7}, (_, i) => stateWord(i))), {
            caller: CALLER, routingStrategy: "delegate", chainId: 1,
        });
        expect(frames(batch.calldatas)[0]).toBe(`0x12345678${Array.from({length: 7}, (_, i) => stateWord(i).slice(2)).join("")}`);
    });

    test("expands scalar fan-out beyond three destinations through the identity precompile", () => {
        const producer = command("0x12345678", 0x02, [], 0);
        const consumers = Array.from({length: 4}, () => command("0x87654321", 0x01, [0], 0xff));
        const {batch, commandCount, relayCount} = inspectEnsoDelegateRoute(
            response([producer, ...consumers], [ZERO]),
            {caller: CALLER, routingStrategy: "delegate", chainId: 1},
        );
        expect(commandCount).toBe(6);
        expect(relayCount).toBe(1);
        expect(batch.targets[1]).toBe("0x0000000000000000000000000000000000000004");
        expect(frames(batch.calldatas)[1]).toBe(ZERO);
        expect(batch.offsets).toHaveLength(6);
    });

    test.each([
        ["router strategy", response([], []), {routingStrategy: "router"}],
        ["non-shortcut calldata", {tx: {from: CALLER, to: TOKEN, value: "0", data: "0x12345678"}}, {}],
        ["delegatecall", response([command("0x12345678", 0x00, [], 0xff)], []), {}],
        ["computed value", response([command("0x12345678", 0x01, [], 0), command("0x12345678", 0x03, [0], 0xff)], [ZERO]), {}],
        ["dynamic return consumer", response([command("0x12345678", 0x01, [], 0x80), command("0x12345678", 0x01, [0x80], 0xff)], ["0x"]), {}],
        ["state replacement", response([command("0x12345678", 0x01, [], 0xfe)], []), {}],
        ["composite input", response([command("0x12345678", 0x01, [0xfd], 0xff)], []), {}],
    ])("rejects %s", (_, route, options) => {
        expect(() => inspectEnsoDelegateRoute(route, {caller: CALLER, routingStrategy: "delegate", chainId: 1, ...options})).toThrow();
    });

    test("requires an explicit target, approval, recipient and ETH policy before execution", () => {
        const approve = command("0x095ea7b3", 0x01, [0, 1], 0xff);
        const route = response([approve], [addressWord(RECEIVER), stateWord(99)]);
        const base = {caller: CALLER, routingStrategy: "delegate", chainId: 1};
        expect(() => buildEnsoDelegateBatch(route, base)).toThrow("policy is required");
        expect(() => buildEnsoDelegateBatch(route, {...base, policy: {
            maxEthSpend: 0n, allowedTargets: [TOKEN], allowedApprovals: [], expectedReceiver: RECEIVER,
            expectedInputToken: TOKEN, expectedOutputToken: TOKEN,
        }})).toThrow("is not allowed by policy");
        const result = buildEnsoDelegateBatch(route, {...base, policy: {
            maxEthSpend: 0n, allowedTargets: [TOKEN], expectedReceiver: RECEIVER,
            expectedInputToken: TOKEN, expectedOutputToken: TOKEN,
            allowedApprovals: [{token: TOKEN, operator: RECEIVER, maxAmount: 99n}],
        }});
        expect(result.approvals).toEqual([{callIndex: 0, token: TOKEN, operator: RECEIVER, amount: 99n, kind: "approve"}]);
        expect(result.compatibility.weirollVersion).toBe("1.4.1");
    });

    test("caps aggregate internal ETH spend independently of outer msg.value", () => {
        const pay = command("0x12345678", 0x03, [0], 0xff);
        const route = response([pay], [stateWord(8)]);
        const options = {caller: CALLER, routingStrategy: "delegate", chainId: 1, policy: {
            maxEthSpend: 7n, allowedTargets: [TOKEN], expectedReceiver: TOKEN,
            expectedInputToken: TOKEN, expectedOutputToken: TOKEN,
        }};
        expect(() => buildEnsoDelegateBatch(route, options)).toThrow("above policy.maxEthSpend");
    });

    test("rejects permit-style authorization that the approval policy cannot bound", () => {
        const permit2 = command("0x87517c45", 0x01, [0, 1, 2, 3], 0xff);
        expect(() => inspectEnsoDelegateRoute(
            response([permit2], [addressWord(TOKEN), addressWord(RECEIVER), stateWord(1), stateWord(1)]),
            {caller: CALLER, routingStrategy: "delegate", chainId: 1},
        )).toThrow("unsupported permit or Permit2 authorization");
    });

    test("pins the supported chain and exact differential simulation deltas", () => {
        expect(ENSO_COMPATIBILITY.weirollCommit).toHaveLength(40);
        expect(() => inspectEnsoDelegateRoute(response([], []), {
            caller: CALLER, routingStrategy: "delegate", chainId: 10,
        })).toThrow("pinned to chain 1");
        const routeHash = `0x${"12".repeat(32)}`;
        expect(assertEnsoSimulation({routeHash, chainId: 1, forkBlock: 1,
            enso: {routeHash, inputDelta: 10n, outputDelta: 20n},
            scripter: {routeHash, inputDelta: 10n, outputDelta: 20n},
            minOutput: 19n, maxInput: 10n,
        })).toEqual({inputDelta: 10n, outputDelta: 20n});
        expect(() => assertEnsoSimulation({routeHash, chainId: 1, forkBlock: 1,
            enso: {routeHash, inputDelta: 10n, outputDelta: 20n},
            scripter: {routeHash, inputDelta: 11n, outputDelta: 20n},
            minOutput: 0n, maxInput: 20n,
        })).toThrow("different balance deltas");
    });

    test("generated scalar fan-out plans stay within the three-patch offset limit", () => {
        let seed = 0x51c7;
        for (let run = 0; run < 1024; run++) {
            seed = (seed * 1103515245 + 12345) >>> 0;
            const fanout = seed % 65;
            const producer = command("0x12345678", 0x02, [], 0);
            const consumers = Array.from({length: fanout}, () => command("0x87654321", 0x01, [0], 0xff));
            const inspected = inspectEnsoDelegateRoute(response([producer, ...consumers], [ZERO]), {
                caller: CALLER, routingStrategy: "delegate", chainId: 1,
            });
            const expectedRelays = fanout > 3 ? Math.ceil((fanout - 3) / 2) : 0;
            expect(inspected.relayCount).toBe(expectedRelays);
            expect(inspected.commandCount).toBe(1 + fanout + expectedRelays);
            expect(inspected.batch.targets).toHaveLength(inspected.commandCount);
            expect(inspected.batch.offsets).toHaveLength(inspected.commandCount);
        }
    });
});
