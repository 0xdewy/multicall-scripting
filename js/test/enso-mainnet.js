// Optional authenticated Enso stress rehearsal. rehearse.sh supplies ENSO_API_KEY from its
// environment or through Bun's --env-file; this script never prints the key.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
    createPublicClient, createWalletClient, getContractAddress, http, parseAbi, parseEther, toHex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { buildEnsoDelegateBatch } from "../enso.js";

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
    opcode: "CREATE2", from: "0x4e59b44847b379578588920cA78FbF26c0B4956C",
    salt: toHex(0x4d756c746963616c6c5363726970746572n, {size: 32}), bytecode: artifact.bytecode.object,
});
const ENSO_EIP7702 = "0x0aeb78d3f961b0394e4a3b94537b543e9e57bab1";
assert.ok((await client.getCode({address: ENSO_EIP7702})).length > 2, "Enso EIP-7702 implementation is not deployed on this fork");
assert.equal((await client.getCode({address: account.address})).toLowerCase(),
    `0xef0100${delegateAddress.slice(2).toLowerCase()}`, "rehearsal account must delegate to SevenSevenZeroTwoCaller");

const amountIn = parseEther("0.005");
const receiver = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
const ETH = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
const TOKENS = {
    WETH: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
    USDC: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    DAI: "0x6B175474E89094C44Da98b954EedeAC495271d0F",
    USDT: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
    FRAX: "0x853d955aCEf822Db058eb8505911ED77F175b99e",
    yvWETH: "0xa258C4606Ca8206D8aA700cE2143D7db854D168c",
    threeCRV: "0x6c3F90f043a72FA612cbac8115EE7e52BDe6E490",
};
const erc20 = parseAbi(["function balanceOf(address) view returns (uint256)"]);
const headers = {Authorization: `Bearer ${apiKey}`, Accept: "application/json"};

async function json(response, label) {
    if (!response.ok) {
        const detail = (await response.text()).slice(0, 240).replaceAll(/\s+/g, " ");
        throw new Error(`${label} request failed with HTTP ${response.status}: ${detail}`);
    }
    return response.json();
}

async function route(label, tokenOut) {
    const query = new URLSearchParams({
        chainId: "1", fromAddress: account.address, receiver, spender: account.address,
        refundReceiver: account.address, routingStrategy: "delegate", tokenIn: ETH, tokenOut,
        amountIn: amountIn.toString(), slippage: "100",
    });
    return json(await fetch(`https://api.enso.build/api/v1/shortcuts/route?${query}`, {
        headers, signal: AbortSignal.timeout(30_000),
    }), label);
}

async function bundle(label, path) {
    const query = new URLSearchParams({
        chainId: "1", fromAddress: account.address, routingStrategy: "delegate",
        receiver, spender: account.address, refundReceiver: account.address,
    });
    const actions = path.slice(1).map((tokenOut, i) => ({
        protocol: "enso", action: "route", args: {
            tokenIn: path[i], tokenOut,
            amountIn: i === 0 ? amountIn.toString() : {useOutputOfCallAt: i - 1},
            receiver: i === path.length - 2 ? receiver : account.address,
            slippage: "100",
        },
    }));
    return json(await fetch(`https://api.enso.build/api/v1/shortcuts/bundle?${query}`, {
        method: "POST", headers: {...headers, "Content-Type": "application/json"},
        body: JSON.stringify(actions), signal: AbortSignal.timeout(45_000),
    }), label);
}

async function compare(label, outputToken, response, required) {
    const routeSteps = Array.isArray(response.route) ? response.route.length : 0;
    const txBytes = (response.tx?.data?.length - 2) / 2;
    let translated;
    try {
        translated = buildEnsoDelegateBatch(response, {caller: account.address, routingStrategy: "delegate"});
    } catch (error) {
        const message = `LIMIT ${label}: ${routeSteps} route steps; ${txBytes} tx bytes; ${error.message}`;
        if (required) throw new Error(message);
        console.log(message);
        return null;
    }
    const {batch, value, commandCount} = translated;
    const snapshot = await client.request({method: "evm_snapshot"});
    await client.request({method: "anvil_setCode", params: [account.address, `0xef0100${ENSO_EIP7702.slice(2)}`]});
    const before = await client.readContract({address: outputToken, abi: erc20, functionName: "balanceOf", args: [receiver]});
    let ensoGas = 0n;
    for (const tx of (response.preTransactions ?? []).map(entry => entry.tx)) {
        const receipt = await client.waitForTransactionReceipt({hash: await wallet.sendTransaction({
            to: tx.to, data: tx.data, value: BigInt(tx.value ?? 0), gas: 20_000_000n, chain: null,
        })});
        assert.equal(receipt.status, "success");
        ensoGas += receipt.gasUsed;
    }
    const ensoReceipt = await client.waitForTransactionReceipt({hash: await wallet.sendTransaction({
        to: account.address, data: response.tx.data, value: BigInt(response.tx.value ?? 0), gas: 20_000_000n, chain: null,
    })});
    assert.equal(ensoReceipt.status, "success");
    ensoGas += ensoReceipt.gasUsed;
    const ensoReceived = await client.readContract({address: outputToken, abi: erc20, functionName: "balanceOf", args: [receiver]}) - before;
    assert.equal(await client.request({method: "evm_revert", params: [snapshot]}), true);

    const scripterBefore = await client.readContract({address: outputToken, abi: erc20, functionName: "balanceOf", args: [receiver]});
    const receipt = await client.waitForTransactionReceipt({hash: await wallet.writeContract({
        address: account.address, abi: artifact.abi, functionName: "execute",
        args: [batch.targets, batch.offsets, batch.calldatas, batch.msgValues],
        value, gas: 20_000_000n, chain: null,
    })});
    assert.equal(receipt.status, "success");
    const received = await client.readContract({address: outputToken, abi: erc20, functionName: "balanceOf", args: [receiver]}) - scripterBefore;
    assert.equal(received, ensoReceived, `${label}: Enso and Scripter output differ`);
    if (response.minAmountOut !== undefined) {
        const minimum = Array.isArray(response.minAmountOut) ? BigInt(response.minAmountOut[0]) : BigInt(response.minAmountOut);
        assert.ok(received >= minimum, `${label}: output is below minAmountOut`);
    }
    const delta = receipt.gasUsed - ensoGas;
    const percent = Number(delta * 10_000n / ensoGas) / 100;
    console.log(`PASS ${label}: ${routeSteps} route steps; ${commandCount} calls; ${txBytes} tx bytes; Enso VM ${ensoGas} gas; Scripter ${receipt.gasUsed} gas; ${delta} (${percent}%); output ${received}`);
    return {label, commandCount, txBytes, ensoGas, scripterGas: receipt.gasUsed};
}

const cases = [
    {label: "ETH → USDC", output: TOKENS.USDC, required: true, load: () => route("ETH → USDC", TOKENS.USDC)},
    {label: "ETH → yvWETH vault", output: TOKENS.yvWETH, load: () => route("ETH → yvWETH", TOKENS.yvWETH)},
    {label: "ETH → 3CRV LP", output: TOKENS.threeCRV, load: () => route("ETH → 3CRV", TOKENS.threeCRV)},
    {label: "2-leg ETH → USDC → DAI", output: TOKENS.DAI,
        load: () => bundle("2-leg bundle", [ETH, TOKENS.USDC, TOKENS.DAI])},
    {label: "4-leg ETH → USDC → DAI → WETH → USDT", output: TOKENS.USDT,
        load: () => bundle("4-leg bundle", [ETH, TOKENS.USDC, TOKENS.DAI, TOKENS.WETH, TOKENS.USDT])},
    {label: "8-leg swap chain", output: TOKENS.USDC,
        load: () => bundle("8-leg bundle", [ETH, TOKENS.USDC, TOKENS.DAI, TOKENS.WETH, TOKENS.USDT, TOKENS.FRAX, TOKENS.WETH, TOKENS.DAI, TOKENS.USDC])},
];

const results = [];
for (const testCase of cases) {
    try {
        const result = await compare(testCase.label, testCase.output, await testCase.load(), testCase.required ?? false);
        if (result) results.push(result);
    } catch (error) {
        if (testCase.required) throw error;
        console.log(`SKIP ${testCase.label}: ${error.message}`);
    }
}
assert.ok(results.length > 0, "no Enso route was translated and executed");
const largest = results.reduce((a, b) => b.commandCount > a.commandCount ? b : a);
console.log(`UPPER TESTED LIMIT: ${largest.label}; ${largest.commandCount} direct calls; ${largest.txBytes} Enso calldata bytes; Scripter ${largest.scripterGas} gas`);
