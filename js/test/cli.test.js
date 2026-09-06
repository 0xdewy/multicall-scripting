import {test, expect, beforeAll, afterAll} from "bun:test";
import {mkdtempSync, writeFileSync, unlinkSync, rmdirSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";
import {parseAbi, decodeFunctionData} from "viem";
import {TransactionBuilder} from "../index.js";
const abi = parseAbi(["function pay(uint256 n) payable", "function over(uint256 n)", "function over(uint256[2] n)"]);
const target = "0x0000000000000000000000000000000000000001";
let dir, abiPath;
beforeAll(() => { dir = mkdtempSync(join(tmpdir(), "multicall-cli-")); abiPath = join(dir, "abi.json"); writeFileSync(abiPath, JSON.stringify(abi)); });
afterAll(() => { unlinkSync(abiPath); rmdirSync(dir); });
const call = (args, value="0") => [{abiPath, target, functionName: "pay", args, value}];
const run = data => spawnSync(process.execPath, [fileURLToPath(new URL("../cli.js", import.meta.url)), data], {encoding: "utf8"});

test("CLI rejects numeric precision loss before encoding", () => {
    const result = run(JSON.stringify(call(["UNSAFE"])).replace('"UNSAFE"', '9007199254740993'));
    expect(result.status).toBe(1); expect(result.stderr).toContain("quote large integers");
});
test("CLI preserves full uint256 argument and value strings", () => {
    const maximum = ((1n << 256n) - 1n).toString();
    const result = run(JSON.stringify(call([maximum], maximum)));
    expect(result.status).toBe(0);
    const built = JSON.parse(result.stdout);
    const data = "0x" + built.calldatas.slice(66, 66 + 72);
    expect(decodeFunctionData({abi, data}).args).toEqual([BigInt(maximum)]);
    expect(built.msgValues).toEqual([maximum]);
});
test("CLI rejects invalid ETH values", () => {
    for (const value of ["oops", "", true, false, "-1", (1n << 256n).toString()]) expect(run(JSON.stringify(call([1], value))).status).toBe(1);
});
test("builder rejects unsafe JavaScript numbers", () => {
    const b = new TransactionBuilder();
    expect(() => b.addCall(abi, target, "pay", [Number.MAX_SAFE_INTEGER + 1])).toThrow("BigInt");
    expect(() => b.addCall(abi, target, "pay", [1], Number.MAX_SAFE_INTEGER + 1)).toThrow("BigInt");
});
test("builder rejects ambiguous overloaded names", () => {
    expect(() => new TransactionBuilder().addCall(abi, target, "over", [1])).toThrow("Ambiguous function");
});
