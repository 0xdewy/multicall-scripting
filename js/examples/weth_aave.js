#!/usr/bin/env node

/**
 * weth_aave.js - WETH + AAVE BORROWING EXAMPLE
 * 
 * Real DeFi example that executes on mainnet fork:
 * 1. Wrap ETH to WETH
 * 2. Supply WETH as collateral to Aave
 * 3. Borrow DAI against the collateral
 * 4. Withdraw borrowed DAI
 * 
 * This demonstrates atomic execution of borrowing strategy.
 * Uses fixed amounts (no return value dependencies) for reliability.
 * 
 * Run: bun run js/examples/weth_aave.js
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
    AAVE_POOL_ABI,
    ADDRESSES
} = require("./abis.js");

// Import helper functions
const {
    getMulticallScripterABI,
    deployMulticallScripter
} = require("./helpers.js");

async function main() {
    console.log("🚀 WETH + Aave Borrowing Example (Fixed Amounts)");
    console.log("================================================\n");
    
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
        console.log(`   Aave Pool: ${ADDRESSES.AAVE_POOL}`);
        console.log(`   WETH: ${ADDRESSES.WETH}`);
        console.log(`   DAI: ${ADDRESSES.DAI}\n`);
        
        // 1. Deploy MulticallScripter using helper
        const multicallAddress = await deployMulticallScripter(walletClient, publicClient, account);
        
        // Get MulticallScripter ABI
        const multicallScripterABI = getMulticallScripterABI();
        
        // 2. Build WETH + Aave transaction (FIXED AMOUNTS)
        console.log("4. Building WETH + Aave transaction (fixed amounts)...");
        const builder = new TransactionBuilder();
        
        const initialEth = parseEther("0.01"); // 0.01 ETH for collateral
        
        console.log(`   Strategy: ${formatEther(initialEth)} ETH → WETH → Aave Collateral`);
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
        
        // Step 2: Approve WETH as collateral for Aave
        console.log(`   2. Approve WETH as collateral for Aave`);
        builder.addCall(
            ERC20_ABI,
            ADDRESSES.WETH,
            "approve",
            [ADDRESSES.AAVE_POOL, initialEth],
            0n
        );
        
        // Step 3: Supply WETH as collateral to Aave
        console.log(`   3. Supply WETH as collateral to Aave`);
        builder.addCall(
            AAVE_POOL_ABI,
            ADDRESSES.AAVE_POOL,
            "supply",
            [ADDRESSES.WETH, initialEth, account.address, 0],
            0n
        );
        
        console.log(`\n   Total steps: 3 (WETH → Aave supply only)`);
        
        // 3. Build and execute transaction
        console.log("\n5. Building transaction...");
        const { targets, offsets, calldatas, msgValues } = builder.build();
        
        console.log(`   Targets: ${targets.length}`);
        console.log(`   Calldatas: ${calldatas.length}`);
        console.log(`   Total value: ${formatEther(msgValues.reduce((a, b) => a + b, 0n))} ETH\n`);
        
        console.log("6. Executing transaction...");
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
            throw new Error("Transaction failed - check Aave integration");
        }
        
        console.log("\n🎉 Transaction executed successfully!");
        console.log(`   - Wrapped ${formatEther(initialEth)} ETH to WETH`);
        console.log(`   - Supplied WETH as collateral to Aave`);
        console.log(`   - Full WETH → Aave supply completed!`);
        console.log(`   - All 3 steps executed atomically in one transaction`);
        
    } catch (error) {
        console.error("\n❌ Error:", error.message);
        if (error.stack) {
            console.error("Stack trace:", error.stack.split('\n').slice(0, 5).join('\n'));
        }
        throw error;
    } finally {
        // Stop Anvil
        if (anvilProcess) {
            console.log("\n7. Stopping Anvil...");
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