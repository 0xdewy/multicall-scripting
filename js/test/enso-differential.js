// Differential fork test for the Enso Weiroll decoder. It uses no API credential: the same
// synthetic command program runs through Enso's deployed EIP-7702 VM and through Scripter.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
    createPublicClient, createWalletClient, encodeFunctionData, getContractAddress, http,
    parseAbi, parseEther, toHex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { buildEnsoDelegateBatch } from "../enso.js";

const rpc = process.argv[2];
if (!rpc) throw new Error("Usage: bun js/test/enso-differential.js ANVIL_FORK_RPC");
const transport = http(rpc, {timeout: 120_000});
const client = createPublicClient({transport});
const account = privateKeyToAccount("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80");
const wallet = createWalletClient({account, transport});
const receiver = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
const weth = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
const ensoDelegate = "0x0aeb78d3f961b0394e4a3b94537b543e9e57bab1";
const artifact = JSON.parse(readFileSync(new URL("../../out/7702Caller.sol/SevenSevenZeroTwoCaller.json", import.meta.url)));
const scripterDelegate = getContractAddress({
    opcode: "CREATE2", from: "0x4e59b44847b379578588920cA78FbF26c0B4956C",
    salt: toHex(0x4d756c746963616c6c5363726970746572n, {size: 32}), bytecode: artifact.bytecode.object,
});
assert.equal((await client.getCode({address: account.address})).toLowerCase(), `0xef0100${scripterDelegate.slice(2).toLowerCase()}`);
assert.ok((await client.getCode({address: ensoDelegate})).length > 2, "Enso EIP-7702 implementation is absent");

const shortcutAbi = parseAbi(["function executeShortcut(bytes32,bytes32,bytes32[],bytes[]) payable returns (bytes[])"]);
const erc20 = parseAbi(["function balanceOf(address) view returns (uint256)"]);
const zero = `0x${"00".repeat(32)}`;
const amount = parseEther("0.001");
const word = (value) => `0x${BigInt(value).toString(16).padStart(64, "0")}`;
const addressWord = (value) => `0x${value.slice(2).padStart(64, "0")}`;
const command = (selector, flags, indices, output, target) =>
    `0x${selector.slice(2)}${flags.toString(16).padStart(2, "0")}${indices.map(i => i.toString(16).padStart(2, "0")).join("").padEnd(12, "f")}${output.toString(16).padStart(2, "0")}${target.slice(2)}`;
const commands = [
    command("0xd0e30db0", 0x03, [0], 0xff, weth),              // WETH.deposit{value: amount}()
    command("0x70a08231", 0x02, [1], 2, weth),                 // amount = WETH.balanceOf(account)
    command("0xa9059cbb", 0x01, [3, 2], 0xff, weth),           // WETH.transfer(receiver, amount)
];
const state = [word(amount), addressWord(account.address), "0x", addressWord(receiver)];
const data = encodeFunctionData({abi: shortcutAbi, functionName: "executeShortcut", args: [zero, zero, commands, state]});
const route = {tx: {from: account.address, to: ensoDelegate, data, value: amount.toString()}};
const {batch, value} = buildEnsoDelegateBatch(route, {caller: account.address, routingStrategy: "delegate"});

const snapshot = await client.request({method: "evm_snapshot"});
const before = await client.readContract({address: weth, abi: erc20, functionName: "balanceOf", args: [receiver]});
await client.request({method: "anvil_setCode", params: [account.address, `0xef0100${ensoDelegate.slice(2)}`]});
const ensoReceipt = await client.waitForTransactionReceipt({hash: await wallet.sendTransaction({
    to: account.address, data, value, gas: 1_000_000n, chain: null,
})});
assert.equal(ensoReceipt.status, "success");
const ensoReceived = await client.readContract({address: weth, abi: erc20, functionName: "balanceOf", args: [receiver]}) - before;
assert.equal(await client.request({method: "evm_revert", params: [snapshot]}), true);

const scripterBefore = await client.readContract({address: weth, abi: erc20, functionName: "balanceOf", args: [receiver]});
const scripterReceipt = await client.waitForTransactionReceipt({hash: await wallet.writeContract({
    address: account.address, abi: artifact.abi, functionName: "execute",
    args: [batch.targets, batch.offsets, batch.calldatas, batch.msgValues], value, gas: 1_000_000n, chain: null,
})});
assert.equal(scripterReceipt.status, "success");
const scripterReceived = await client.readContract({address: weth, abi: erc20, functionName: "balanceOf", args: [receiver]}) - scripterBefore;
assert.equal(scripterReceived, ensoReceived);
assert.equal(scripterReceived, amount);
const delta = scripterReceipt.gasUsed - ensoReceipt.gasUsed;
const percent = Number(delta * 10_000n / ensoReceipt.gasUsed) / 100;
console.log(`PASS same 3-call Weiroll plan: Enso VM ${ensoReceipt.gasUsed} gas; Scripter ${scripterReceipt.gasUsed} gas; ${delta} (${percent}%)`);
