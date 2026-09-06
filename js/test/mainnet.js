// Deployment and application rehearsal. Refuses to transact unless connected to an Anvil fork.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createPublicClient, createWalletClient, http, getContractAddress, keccak256,
    encodeFunctionData, decodeAbiParameters, parseAbi, toHex, parseEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { TransactionBuilder } from "../index.js";
import { A, ERC20, WETH, buildBatch } from "../examples/multiple_swaps.js";

const rpc = process.argv[2];
if (!rpc) throw Error("Usage: bun js/test/mainnet.js ANVIL_FORK_RPC");
const transport = http(rpc, {timeout: 120_000});
const client = createPublicClient({transport});
const info = await client.request({method: "anvil_nodeInfo"});
assert.equal(await client.getChainId(), 31337, "rehearsal requires local chain 31337");
assert.ok(info.forkConfig?.forkBlockNumber, "rehearsal requires a real mainnet fork");
const upstreamChain = await client.request({method: "eth_getCode", params: [A.WETH, "latest"]});
assert.notEqual(upstreamChain, "0x");
// Public Anvil development key. It is used only after the fork/chain checks above.
const account = privateKeyToAccount("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80");
const wallet = createWalletClient({account, transport});
const artifact = name => JSON.parse(readFileSync(new URL(`../../out/${name === "SevenSevenZeroTwoCaller" ? "7702Caller" : name}.sol/${name}.json`, import.meta.url)));
const factory = "0x4e59b44847b379578588920cA78FbF26c0B4956C";
const salt = toHex(0x4d756c746963616c6c5363726970746572n, {size: 32});
const contracts = {};
for (const name of ["MulticallScripter", "MulticallScripterReadOnly", "SevenSevenZeroTwoCaller"]) {
    const art = artifact(name);
    const address = getContractAddress({opcode: "CREATE2", from: factory, salt, bytecode: art.bytecode.object});
    assert.equal(await client.getCode({address}), art.deployedBytecode.object, `${name} deployed bytecode`);
    contracts[name] = {address, abi: art.abi, codeHash: keccak256(art.deployedBytecode.object)};
}
const writer = contracts.MulticallScripter, reader = contracts.MulticallScripterReadOnly, delegate = contracts.SevenSevenZeroTwoCaller;
const args = b => [b.targets, b.offsets, b.calldatas, b.msgValues];
const read = (address, abi, functionName, args=[]) => client.readContract({address, abi, functionName, args});
const balance = (token, owner) => read(token, ERC20, "balanceOf", [owner]);
const allowanceABI = parseAbi(["function allowance(address,address) view returns (uint256)"]);
const quoteABI = parseAbi(["function getAmountsOut(uint256,address[]) view returns (uint256[])"]);
const curveQuoteABI = parseAbi(["function get_dy(int128,int128,uint256) view returns (uint256)"]);
const amount = parseEther("0.1");
const quote = await read(A.UNISWAP_V2_ROUTER, quoteABI, "getAmountsOut", [amount, [A.WETH, A.DAI]]);
const quoteUsdc = await read(A.CURVE_3POOL, curveQuoteABI, "get_dy", [0n, 1n, quote[1]]);

// A dynamic Uniswap return-array element feeds a Curve quote. Compare every result with direct calls.
const reads = new TransactionBuilder();
const amounts = reads.addCall(quoteABI, A.UNISWAP_V2_ROUTER, "getAmountsOut", [amount, [A.WETH, A.DAI]]).with_length(2);
reads.addCall(curveQuoteABI, A.CURVE_3POOL, "get_dy", [0n, 1n, amounts[1]]);
const results = await read(reader.address, reader.abi, "execute", args(reads.build()));
assert.deepEqual(decodeAbiParameters([{type: "uint256[]"}], results[0])[0], quote);
assert.equal(decodeAbiParameters([{type: "uint256"}], results[1])[0], quoteUsdc);
console.log("PASS read-only Uniswap → Curve quote matches direct calls");

const deadline = (await client.getBlock()).timestamp + 3600n;
const beforeUsdc = await balance(A.USDC, account.address);
const batch = buildBatch(writer.address, account.address, amount, deadline, quote[1]*99n/100n, quoteUsdc*99n/100n);
const receipt = await client.waitForTransactionReceipt({hash: await wallet.writeContract({
    ...writer, functionName: "execute", args: args(batch), value: amount, chain: null, gas: 2_000_000n,
})});
assert.equal(receipt.status, "success");
const received = await balance(A.USDC, account.address) - beforeUsdc;
assert.ok(received >= quoteUsdc*99n/100n);
async function assertEmpty() {
    for (const token of [A.WETH, A.DAI, A.USDC]) assert.equal(await balance(token, writer.address), 0n, "executor token residue");
    assert.equal(await client.getBalance({address: writer.address}), 0n, "executor ETH residue");
    assert.equal(await read(A.WETH, allowanceABI, "allowance", [writer.address, A.UNISWAP_V2_ROUTER]), 0n);
    assert.equal(await read(A.DAI, allowanceABI, "allowance", [writer.address, A.CURVE_3POOL]), 0n);
}
await assertEmpty();
console.log(`PASS ETH → WETH → DAI → USDC: ${received} USDC base units; gas ${receipt.gasUsed}`);

// The final protocol call fails after deposits, approvals and a swap. Everything must roll back.
const poolWethBefore = await balance(A.WETH, "0xA478c2975Ab1Ea89e8196811F51A7B7Ade33eB11");
const failed = buildBatch(writer.address, account.address, amount, deadline, 1n, 1n << 255n);
const failedReceipt = await client.waitForTransactionReceipt({hash: await wallet.writeContract({
    ...writer, functionName: "execute", args: args(failed), value: amount, chain: null, gas: 2_000_000n,
})});
assert.equal(failedReceipt.status, "reverted");
assert.equal(await balance(A.USDC, account.address), beforeUsdc + received);
assert.equal(await balance(A.WETH, "0xA478c2975Ab1Ea89e8196811F51A7B7Ade33eB11"), poolWethBefore);
await assertEmpty();
console.log("PASS late slippage failure rolls back tokens, pool balance and allowances");

// Real EIP-7702 authorization transaction, not vm.etch. The delegated EOA owns the WETH calls.
const recipient = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
const self = new TransactionBuilder();
self.addCall(WETH, A.WETH, "deposit", [], amount);
self.addCall(ERC20, A.WETH, "transfer", [recipient, amount]);
const selfBatch = self.build();
const recipientBefore = await balance(A.WETH, recipient);
const authorization = await wallet.signAuthorization({contractAddress: delegate.address, executor: "self"});
const delegatedReceipt = await client.waitForTransactionReceipt({hash: await wallet.sendTransaction({
    to: account.address, chain: null, authorizationList: [authorization], gas: 1_000_000n,
    data: encodeFunctionData({abi: delegate.abi, functionName: "execute", args: args(selfBatch)}),
})});
assert.equal(delegatedReceipt.status, "success");
assert.equal((await client.getCode({address: account.address})).toLowerCase(), "0xef0100" + delegate.address.slice(2).toLowerCase());
assert.equal(await balance(A.WETH, recipient), recipientBefore + amount);
const nonce = await read(account.address, delegate.abi, "nonce");
const digest = await read(account.address, delegate.abi, "hashExecute", [...args(selfBatch), nonce, deadline]);
const signature = await account.sign({hash: digest});
const relayer = createWalletClient({account: recipient, transport});
const signedData = encodeFunctionData({abi: delegate.abi, functionName: "executeWithSignature", args: [...args(selfBatch), deadline, signature]});
const signedReceipt = await client.waitForTransactionReceipt({hash: await relayer.sendTransaction({to: account.address, data: signedData, chain: null, gas: 1_000_000n})});
assert.equal(signedReceipt.status, "success");
assert.equal(await read(account.address, delegate.abi, "nonce"), nonce + 1n);
assert.equal(await balance(A.WETH, recipient), recipientBefore + 2n*amount);
const replay = await client.waitForTransactionReceipt({hash: await relayer.sendTransaction({to: account.address, data: signedData, chain: null, gas: 1_000_000n})});
assert.equal(replay.status, "reverted");
assert.equal(await read(account.address, delegate.abi, "nonce"), nonce + 1n);
console.log("PASS real 7702 self-call, relayed signature, and rejected replay");
// Compare the same workload after nonce initialization as well as the first signed call.
const steadyDigest = await read(account.address, delegate.abi, "hashExecute", [...args(selfBatch), nonce + 1n, deadline]);
const steadySignature = await account.sign({hash: steadyDigest});
const steadyReceipt = await client.waitForTransactionReceipt({hash: await relayer.sendTransaction({
    to: account.address, chain: null, gas: 1_000_000n,
    data: encodeFunctionData({abi: delegate.abi, functionName: "executeWithSignature", args: [...args(selfBatch), deadline, steadySignature]}),
})});
assert.equal(steadyReceipt.status, "success");
assert.equal(await read(account.address, delegate.abi, "nonce"), nonce + 2n);
assert.equal(await balance(A.WETH, recipient), recipientBefore + 3n*amount);
// Removing delegation preserves storage and does not cancel unused application signatures.
const pendingNonce = await read(account.address, delegate.abi, "nonce");
const pendingDigest = await read(account.address, delegate.abi, "hashExecute", [...args(selfBatch), pendingNonce, deadline]);
const pendingSignature = await account.sign({hash: pendingDigest});
const pendingData = encodeFunctionData({abi: delegate.abi, functionName: "executeWithSignature",
    args: [...args(selfBatch), deadline, pendingSignature]});
const clearAuthorization = await wallet.signAuthorization({contractAddress: "0x0000000000000000000000000000000000000000", executor: "self"});
const cleared = await client.waitForTransactionReceipt({hash: await wallet.sendTransaction({
    to: account.address, chain: null, authorizationList: [clearAuthorization], data: "0x", gas: 1_000_000n,
})});
assert.equal(cleared.status, "success");
assert.ok([undefined, "0x"].includes(await client.getCode({address: account.address})));
const restoreAuthorization = await wallet.signAuthorization({contractAddress: delegate.address, executor: "self"});
const restored = await client.waitForTransactionReceipt({hash: await wallet.sendTransaction({
    to: account.address, chain: null, authorizationList: [restoreAuthorization], data: "0xdeadbeef", gas: 1_000_000n,
})});
assert.equal(restored.status, "reverted"); // Execution fails, but protocol authorization persists.
assert.equal((await client.getCode({address: account.address})).toLowerCase(), "0xef0100" + delegate.address.slice(2).toLowerCase());
assert.equal(await read(account.address, delegate.abi, "nonce"), pendingNonce);
const staleReplay = await client.waitForTransactionReceipt({hash: await relayer.sendTransaction({
    to: account.address, data: signedData, chain: null, gas: 1_000_000n,
})});
assert.equal(staleReplay.status, "reverted");
// It remains executable after restoration; simulate without consuming the nonce.
await client.simulateContract({address: account.address, abi: delegate.abi, functionName: "executeWithSignature",
    args: [...args(selfBatch), deadline, pendingSignature], account: recipient});
// Cancel the still-unused pending signature by consuming its nonce with an empty signed batch.
const empty = [[], [], "0x", []];
const cancelDigest = await read(account.address, delegate.abi, "hashExecute", [...empty, pendingNonce, deadline]);
const cancelSignature = await account.sign({hash: cancelDigest});
const canceled = await client.waitForTransactionReceipt({hash: await relayer.sendTransaction({
    to: account.address, chain: null, gas: 1_000_000n,
    data: encodeFunctionData({abi: delegate.abi, functionName: "executeWithSignature", args: [...empty, deadline, cancelSignature]}),
})});
assert.equal(canceled.status, "success");
assert.equal(await read(account.address, delegate.abi, "nonce"), pendingNonce + 1n);
const canceledReplay = await client.waitForTransactionReceipt({hash: await relayer.sendTransaction({
    to: account.address, data: pendingData, chain: null, gas: 1_000_000n,
})});
assert.equal(canceledReplay.status, "reverted");
assert.equal(await balance(A.WETH, recipient), recipientBefore + 3n*amount);
console.log("PASS real 7702 removal, failed-execution restoration, nonce persistence and signature cancellation");
// Deliberately corrupt deployed code: a rerun must fail, not silently accept an occupied address.
await client.request({method: "anvil_setCode", params: [reader.address, "0x00"]});
try {
    const check = spawnSync("bash", ["script/deploy.sh", rpc, "--sender", recipient], {
        cwd: new URL("../../", import.meta.url), encoding: "utf8", env: {...process.env, DEPLOY_7702: "true"},
    });
    assert.notEqual(check.status, 0);
    assert.match(check.stdout + check.stderr, /Deployed runtime does not match release build/);
} finally {
    await client.request({method: "anvil_setCode", params: [reader.address, artifact("MulticallScripterReadOnly").deployedBytecode.object]});
}
console.log("PASS deployment rerun rejects mismatched runtime bytecode");
console.log(JSON.stringify({forkBlock: info.forkConfig.forkBlockNumber,
    hardfork: info.hardFork,
    contracts: Object.fromEntries(Object.entries(contracts).map(([name, {address, codeHash}]) => [name, {address, codeHash}])), swapGas: receipt.gasUsed.toString(),
    authorizationGas: delegatedReceipt.gasUsed.toString(), signedGas: signedReceipt.gasUsed.toString(), subsequentSignedGas: steadyReceipt.gasUsed.toString()}, (_,value) => value, 2));
