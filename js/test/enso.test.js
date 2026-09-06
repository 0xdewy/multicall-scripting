import { describe, expect, test } from "bun:test";
import { decodeValueIndex, CALL_FLAG } from "../encoding.js";
import { buildEnsoRouterBatch } from "../enso.js";

const CALLER = "0x00000000000000000000000000000000000000AA";
const APPROVAL = "0x00000000000000000000000000000000000000bb";
const ROUTER = "0x00000000000000000000000000000000000000cc";

function frames(packed) {
    const bytes = Buffer.from(packed.slice(2), "hex");
    const result = [];
    for (let cursor = 0; cursor < bytes.length;) {
        const length = Number(BigInt(`0x${bytes.subarray(cursor, cursor + 32).toString("hex")}`));
        cursor += 32;
        result.push(`0x${bytes.subarray(cursor, cursor + length).toString("hex")}`);
        cursor += Math.ceil(length / 32) * 32;
    }
    return result;
}

describe("Enso router adapter", () => {
    test("preserves pre-transaction order, calldata, targets, and ETH values", () => {
        const response = {
            preTransactions: [{tx: {from: CALLER, to: APPROVAL, data: "0x095ea7b3", value: "0"}}],
            tx: {from: CALLER, to: ROUTER, data: "0x1234abcd00", value: "0x2a"},
        };
        const {batch, value} = buildEnsoRouterBatch(response, {caller: CALLER, routingStrategy: "router"});
        expect(batch.targets).toEqual([APPROVAL, ROUTER]);
        expect(frames(batch.calldatas)).toEqual(["0x095ea7b3", "0x1234abcd00"]);
        expect(batch.msgValues).toEqual([42n]);
        expect(decodeValueIndex(batch.offsets[0], Number(CALL_FLAG))).toBe(0);
        expect(decodeValueIndex(batch.offsets[1], Number(CALL_FLAG))).toBe(1);
        expect(value).toBe(42n);
    });

    test("accepts a route without pre-transactions", () => {
        const {batch, value} = buildEnsoRouterBatch({
            tx: {from: CALLER.toLowerCase(), to: ROUTER.toLowerCase(), data: "0x", value: "0"},
        }, {caller: CALLER, routingStrategy: "router"});
        expect(batch.targets).toEqual([ROUTER]);
        expect(frames(batch.calldatas)).toEqual(["0x"]);
        expect(batch.msgValues).toEqual([]);
        expect(value).toBe(0n);
    });

    test("requires the routing strategy to be stated explicitly", () => {
        const response = {tx: {from: CALLER, to: ROUTER, data: "0x", value: "0"}};
        expect(() => buildEnsoRouterBatch(response, {caller: CALLER})).toThrow(/Only Enso router/);
    });

    test.each([
        ["main caller mismatch", {tx: {from: APPROVAL, to: ROUTER, data: "0x", value: "0"}}, {}],
        ["pre-transaction caller mismatch", {preTransactions: [{tx: {from: APPROVAL, to: ROUTER, data: "0x", value: "0"}}], tx: {from: CALLER, to: ROUTER, data: "0x", value: "0"}}, {}],
        ["delegate response", {tx: {from: CALLER, to: ROUTER, data: "0x", value: "0"}}, {routingStrategy: "delegate"}],
        ["malformed calldata", {tx: {from: CALLER, to: ROUTER, data: "0x123", value: "0"}}, {}],
        ["negative value", {tx: {from: CALLER, to: ROUTER, data: "0x", value: "-1"}}, {}],
        ["missing main transaction", {}, {}],
        ["malformed pre-transactions", {preTransactions: {}, tx: {from: CALLER, to: ROUTER, data: "0x", value: "0"}}, {}],
    ])("rejects %s", (_, response, options) => {
        expect(() => buildEnsoRouterBatch(response, {caller: CALLER, routingStrategy: "router", ...options})).toThrow();
    });
});
