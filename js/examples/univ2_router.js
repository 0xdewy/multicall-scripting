#!/usr/bin/env node

/**
 * uniswap_direct.js - UNISWAP V2 DIRECT SWAP EXAMPLE
 * 
 * Real DeFi example that executes on mainnet fork:
 * 1. Wrap ETH to WETH
 * 2. Transfer WETH to Uniswap V2 WETH-DAI pair
 * 3. Call pair's swap() function directly
 * 4. Receive DAI directly from pair
 * 
 * This demonstrates atomic execution WITHOUT using the Uniswap Router.
 * MulticallScripter acts as the router, interacting with core contracts directly.
 * 
 * Run: bun run js/examples/uniswap_direct.js
 */

const { TransactionBuilder } = require("../index.js");
const { parseEther, formatEther } = require("viem");
const { createWalletClient, createPublicClient, http } = require("viem");
const { privateKeyToAccount } = require("viem/accounts");
const { startAnvil, stopAnvil } = require("./anvilFork.js");

// Import all ABIs and addresses from abis.js
const {
    ERC20_ABI,
    WETH_ABI,
    ADDRESSES
} = require("./abis.js");

// Uniswap V2 Pair ABI (minimal for swap)
const UNISWAP_V2_PAIR_ABI = [
    {
        type: "function",
        name: "swap",
        inputs: [
            { name: "amount0Out", type: "uint256" },
            { name: "amount1Out", type: "uint256" },
            { name: "to", type: "address" },
            { name: "data", type: "bytes" }
        ],
        outputs: [],
        stateMutability: "nonpayable"
    },
    {
        type: "function",
        name: "getReserves",
        inputs: [],
        outputs: [
            { name: "reserve0", type: "uint112" },
            { name: "reserve1", type: "uint112" },
            { name: "blockTimestampLast", type: "uint32" }
        ],
        stateMutability: "view"
    },
    {
        type: "function",
        name: "token0",
        inputs: [],
        outputs: [{ name: "", type: "address" }],
        stateMutability: "view"
    },
    {
        type: "function",
        name: "token1",
        inputs: [],
        outputs: [{ name: "", type: "address" }],
        stateMutability: "view"
    }
];

// Uniswap V2 WETH-DAI pair address (mainnet)
const UNISWAP_V2_WETH_DAI_PAIR = "0xA478c2975Ab1Ea89e8196811F51A7B7Ade33eB11";

// Get MulticallScripter ABI (from build artifacts)
function getMulticallScripterABI() {
    const fs = require('fs');
    const path = require('path');
    const abiPath = path.join(__dirname, '../../out/MulticallScripter.sol/MulticallScripter.json');
    const data = JSON.parse(fs.readFileSync(abiPath, 'utf8'));
    return data.abi;
}

async function main() {
    console.log("🚀 Uniswap V2 Direct Swap Example (No Router)");
    console.log("=============================================\n");

    let anvilProcess;

    try {
        // Start Anvil with mainnet fork
        console.log("1. Starting Anvil with mainnet fork...");
        anvilProcess = await startAnvil(8545);
        console.log("   ✓ Anvil started on port 8545\n");

        // Wait for Anvil to be ready
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Setup clients
        const rpcUrl = "http://127.0.0.1:8545";
        const publicClient = createPublicClient({
            transport: http(rpcUrl)
        });

        // Use the first Anvil account (has 10,000 ETH)
        const privateKey = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
        const account = privateKeyToAccount(privateKey);

        const walletClient = createWalletClient({
            account,
            transport: http(rpcUrl),
            chain: {
                id: 1
            }
        });

        console.log("2. Setup complete:");
        console.log(`   Account: ${account.address}`);
        console.log(`   Balance: ${formatEther(await publicClient.getBalance({ address: account.address }))} ETH`);
        console.log(`   WETH-DAI Pair: ${UNISWAP_V2_WETH_DAI_PAIR}`);
        console.log(`   WETH: ${ADDRESSES.WETH}`);
        console.log(`   DAI: ${ADDRESSES.DAI}\n`);

        // Check pair reserves to understand token order
        console.log("3. Checking pair configuration...");
        const token0 = await publicClient.readContract({
            address: UNISWAP_V2_WETH_DAI_PAIR,
            abi: UNISWAP_V2_PAIR_ABI,
            functionName: "token0"
        });

        const token1 = await publicClient.readContract({
            address: UNISWAP_V2_WETH_DAI_PAIR,
            abi: UNISWAP_V2_PAIR_ABI,
            functionName: "token1"
        });

        const isWETHtoken0 = token0.toLowerCase() === ADDRESSES.WETH.toLowerCase();
        console.log(`   Token 0: ${token0} ${isWETHtoken0 ? '(WETH)' : '(DAI)'}`);
        console.log(`   Token 1: ${token1} ${!isWETHtoken0 ? '(WETH)' : '(DAI)'}`);

        // Get reserves
        const reserves = await publicClient.readContract({
            address: UNISWAP_V2_WETH_DAI_PAIR,
            abi: UNISWAP_V2_PAIR_ABI,
            functionName: "getReserves"
        });

        const wethReserve = isWETHtoken0 ? reserves[0] : reserves[1];
        const daiReserve = isWETHtoken0 ? reserves[1] : reserves[0];

        console.log(`   WETH Reserve: ${formatEther(wethReserve)} WETH`);
        console.log(`   DAI Reserve: ${formatEther(daiReserve)} DAI\n`);

        // 1. Deploy MulticallScripter
        console.log("4. Deploying MulticallScripter...");
        const { execSync } = require('child_process');
        const bytecode = execSync('forge inspect MulticallScripter bytecode', { cwd: process.cwd() }).toString().trim();

        const deployHash = await walletClient.deployContract({
            abi: [{ type: "constructor", inputs: [], stateMutability: "nonpayable" }],
            bytecode,
            account,
        });

        const deployReceipt = await publicClient.waitForTransactionReceipt({ hash: deployHash });
        const multicallAddress = deployReceipt.contractAddress;
        console.log(`   Contract: ${multicallAddress}\n`);

        // Get MulticallScripter ABI
        const multicallScripterABI = getMulticallScripterABI();

        // 2. Build direct swap transaction (FIXED AMOUNTS)
        console.log("5. Building direct swap transaction (fixed amounts)...");
        const builder = new TransactionBuilder();

        const initialEth = parseEther("1.0"); // 0.01 ETH to swap
        const expectedDaiOut = parseEther("1500"); // Conservative estimate

        console.log(`   Strategy: ${formatEther(initialEth)} ETH → WETH → Direct Pair Swap → DAI`);
        console.log('   Steps:');

        // Step 1: Wrap ETH to WETH
        console.log(`   1. Wrap ${formatEther(initialEth)} ETH → WETH`);
        builder.addCall(
            WETH_ABI,
            ADDRESSES.WETH,
            "deposit",
            [],
            initialEth
        );

        // Step 2: Transfer WETH to the pair (simulating swap input)
        // In a real direct swap, we'd need to transfer WETH to the pair first
        // The pair's swap() function expects the tokens to already be in the pair
        // For simplicity, we'll transfer WETH to the pair (this is what the router does internally)
        console.log(`   2. Transfer WETH to pair (swap input)`);
        builder.addCall(
            ERC20_ABI,
            ADDRESSES.WETH,
            "transfer",
            [UNISWAP_V2_WETH_DAI_PAIR, initialEth],
            0n
        );

        // Step 3: Call pair's swap() function directly
        // amount0Out = DAI out (if DAI is token0), amount1Out = DAI out (if DAI is token1)
        // We're swapping WETH for DAI, so DAI amount out > 0, WETH amount out = 0
        console.log(`   3. Call pair.swap() directly for ${formatEther(expectedDaiOut)} DAI`);

        const daiAmountOut = expectedDaiOut;
        const wethAmountOut = 0n;

        if (isWETHtoken0) {
            // WETH is token0, DAI is token1
            // amount0Out = 0 (no WETH out), amount1Out = daiAmountOut (DAI out)
            builder.addCall(
                UNISWAP_V2_PAIR_ABI,
                UNISWAP_V2_WETH_DAI_PAIR,
                "swap",
                [wethAmountOut, daiAmountOut, account.address, "0x"],
                0n
            );
        } else {
            // DAI is token0, WETH is token1
            // amount0Out = daiAmountOut (DAI out), amount1Out = 0 (no WETH out)
            builder.addCall(
                UNISWAP_V2_PAIR_ABI,
                UNISWAP_V2_WETH_DAI_PAIR,
                "swap",
                [daiAmountOut, wethAmountOut, account.address, "0x"],
                0n
            );
        }

        console.log(`\n   Total steps: 3 (Direct pair interaction, no router)`);
        console.log(`   Note: This is a simplified direct swap. In production, you'd need`);
        console.log(`   to calculate exact output amounts and handle slippage differently.`);

        // 3. Build and execute transaction
        console.log("\n6. Building transaction...");
        const { targets, offsets, calldatas, msgValues } = builder.build();

        console.log(`   Targets: ${targets.length}`);
        console.log(`   Calldatas: ${calldatas.length}`);
        console.log(`   Total value: ${formatEther(msgValues.reduce((a, b) => a + b, 0n))} ETH\n`);

        console.log("7. Executing transaction...");
        const txHash = await walletClient.writeContract({
            address: multicallAddress,
            abi: multicallScripterABI,
            functionName: "execute",
            args: [targets, offsets, calldatas, msgValues],
            value: initialEth // Send ETH for WETH deposit
        });

        console.log(`   Transaction hash: ${txHash}`);

        const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
        console.log(`   Gas used: ${receipt.gasUsed}`);
        console.log(`   Status: ${receipt.status === "success" ? "✅ Success" : "❌ Failed"}`);

        if (receipt.status !== "success") {
            throw new Error("Transaction failed - check direct swap logic");
        }

        // Check DAI balance after swap
        const daiBalance = await publicClient.readContract({
            address: ADDRESSES.DAI,
            abi: ERC20_ABI,
            functionName: "balanceOf",
            args: [account.address]
        });

        console.log("\n🎉 Transaction executed successfully!");
        console.log(`   - Wrapped ${formatEther(initialEth)} ETH to WETH`);
        console.log(`   - Transferred WETH to pair directly`);
        console.log(`   - Called pair.swap() directly (no router!)`);
        console.log(`   - Received ${formatEther(daiBalance)} DAI`);
        console.log(`   - All 3 steps executed atomically in one transaction!`);
        console.log(`\n💡 Key innovation: MulticallScripter acted as the router,`);
        console.log(`   interacting with Uniswap core contracts directly.`);

    } catch (error) {
        console.error("\n❌ Error:", error.message);
        if (error.stack) {
            console.error("Stack trace:", error.stack.split('\n').slice(0, 5).join('\n'));
        }
        throw error;
    } finally {
        // Stop Anvil
        if (anvilProcess) {
            console.log("\n8. Stopping Anvil...");
            await stopAnvil(anvilProcess.process);
            console.log("   ✓ Anvil stopped");
        }
    }
}

// Run if called directly
if (require.main === module) {
    main().catch(console.error);
}

module.exports = { main };
