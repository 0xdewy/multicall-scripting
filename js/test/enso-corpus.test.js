import {expect, test} from "bun:test";
import {getAddress} from "viem";
import {ETH, LIVE_ENSO_CORPUS} from "./enso-corpus.js";

test("live Enso corpus covers simple, vault, LP and long bundle routes", () => {
    expect(LIVE_ENSO_CORPUS.length).toBeGreaterThanOrEqual(6);
    expect(LIVE_ENSO_CORPUS.some(({kind}) => kind === "route")).toBe(true);
    expect(LIVE_ENSO_CORPUS.some(({kind}) => kind === "bundle")).toBe(true);
    expect(Math.max(...LIVE_ENSO_CORPUS.map(({path}) => path.length - 1))).toBeGreaterThanOrEqual(8);
    for (const testCase of LIVE_ENSO_CORPUS) {
        expect(testCase.path[0]).toBe(ETH);
        expect(testCase.path.length).toBeGreaterThanOrEqual(2);
        for (const token of testCase.path) expect(() => getAddress(token)).not.toThrow();
    }
});
