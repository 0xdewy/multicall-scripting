// Optional authenticated Enso route rehearsal. The caller supplies ENSO_API_KEY in the process
// environment; this script never reads dotenv files or prints the key.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
    createPublicClient, createWalletClient, getContractAddress, http, parseAbi, parseEther, toHex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { buildEnsoRouterBatch } from "../enso.js";

const rpc = process.argv[2];
if (!rpc) throw new Error("Usage: ENSO_API_KEY=... bun js/test/enso-mainnet.js ANVIL_FORK_RPC");
const apiKey = process.env.ENSO_API_KEY;
if (!apiKey) throw new Error("ENSO_API_KEY is required");

const transport = http(rpc, {timeout: 120_000});
const client = createPublicClient({transport});
const info = await client.request({method: "anvil_nodeInfo"});
assert.equal(await client.getChainId(), 31337, "Enso rehearsal requires local chain 31337");
assert.ok(info.forkConfig?.forkBlockNumber, "Enso rehearsal requires a mainnet fork");

const account = privateKeyToAccount("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80");
const wallet = createWalletClient({account, transport});
const artifact = JSON.parse(readFileSync(new URL("../../out/7702Caller.sol/SevenSevenZeroTwoCaller.json", import.meta.url)));
const delegateAddress = getContractAddress({
    opcode: "CREATE2",
    from: "0x4e59b44847b379578588920cA78FbF26c0B4956C",
    salt: toHex(0x4d756c746963616c6c5363726970746572n, {size: 32}),
    bytecode: artifact.bytecode.object,
});
assert.equal((await client.getCode({address: account.address})).toLowerCase(),
    `0xef0100${delegateAddress.slice(2).toLowerCase()}`, "rehearsal account must already delegate to SevenSevenZeroTwoCaller");

const amountIn = parseEther("0.005");
const receiver = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
const erc20 = parseAbi(["function balanceOf(address) view returns (uint256)"]);
const routes = [
    {symbol: "USDC", token: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"},
    {symbol: "DAI", token: "0x6B175474E89094C44Da98b954EedeAC495271d0F"},
];
for (const {symbol, token} of routes) {
    const query = new URLSearchParams({
        chainId: "1",
        fromAddress: account.address,
        receiver,
        routingStrategy: "router",
        tokenIn: "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE",
        tokenOut: token,
        amountIn: amountIn.toString(),
        slippage: "100",
    });
    const response = await fetch(`https://api.enso.build/api/v1/shortcuts/route?${query}`, {
        headers: {Authorization: `Bearer ${apiKey}`, Accept: "application/json"},
    });
    if (!response.ok) throw new Error(`Enso ${symbol} route request failed with HTTP ${response.status}`);
    const route = await response.json();
    const {batch, value} = buildEnsoRouterBatch(route, {caller: account.address, routingStrategy: "router"});
    assert.equal(value, amountIn, "Enso route must forward exactly the requested native input");

    // Execute the exact response directly and through Scripter from identical Anvil state.
    const snapshot = await client.request({method: "evm_snapshot"});
    const before = await client.readContract({address: token, abi: erc20, functionName: "balanceOf", args: [receiver]});
    let directGas = 0n;
    const directTransactions = [...(route.preTransactions ?? []).map(entry => entry.tx), route.tx];
    for (const tx of directTransactions) {
        const directReceipt = await client.waitForTransactionReceipt({hash: await wallet.sendTransaction({
            to: tx.to, data: tx.data, value: BigInt(tx.value ?? 0), gas: 3_000_000n, chain: null,
        })});
        assert.equal(directReceipt.status, "success");
        directGas += directReceipt.gasUsed;
    }
    const directReceived = await client.readContract({address: token, abi: erc20, functionName: "balanceOf", args: [receiver]}) - before;
    assert.equal(await client.request({method: "evm_revert", params: [snapshot]}), true);

    const wrappedBefore = await client.readContract({address: token, abi: erc20, functionName: "balanceOf", args: [receiver]});
    const receipt = await client.waitForTransactionReceipt({hash: await wallet.writeContract({
        address: account.address,
        abi: artifact.abi,
        functionName: "execute",
        args: [batch.targets, batch.offsets, batch.calldatas, batch.msgValues],
        value,
        gas: 3_000_000n,
        chain: null,
    })});
    assert.equal(receipt.status, "success");
    const received = await client.readContract({address: token, abi: erc20, functionName: "balanceOf", args: [receiver]}) - wrappedBefore;
    const minimum = Array.isArray(route.minAmountOut) ? BigInt(route.minAmountOut[0]) : BigInt(route.minAmountOut);
    assert.equal(received, directReceived, "direct and wrapped execution must produce identical output from identical state");
    assert.ok(received >= minimum, "received output must satisfy Enso's minAmountOut");
    const delta = receipt.gasUsed - directGas;
    const percent = Number(delta * 10_000n / directGas) / 100;
    console.log(`PASS Enso ETH → ${symbol}: direct ${directGas} gas; Scripter ${receipt.gasUsed} gas; ${delta >= 0n ? "+" : ""}${delta} (${percent}%); output ${received}`);
}
