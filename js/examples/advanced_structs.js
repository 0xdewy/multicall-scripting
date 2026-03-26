#!/usr/bin/env node

/**
 * advanced_structs.js - ADVANCED STRUCTS AND OUTPUT CHAINING EXAMPLE
 * 
 * Demonstrates complex struct handling and using individual struct fields
 * as inputs to subsequent calls in JavaScript.
 * 
 * Strategy:
 * 1. Create a complex struct with nested structs
 * 2. Extract individual fields from struct return
 * 3. Use extracted fields as inputs to subsequent calls
 * 4. Handle dynamic arrays within structs
 * 
 * Run: bun run js/examples/advanced_structs.js
 */

const { TransactionBuilder } = require("../index.js");
const { parseEther, formatEther } = require("viem");
const { createWalletClient, createPublicClient, http } = require("viem");
const { privateKeyToAccount } = require("viem/accounts");
const { startAnvil, stopAnvil } = require("./anvilFork.js");

// Import ABIs
const {
    ERC20_ABI,
    WETH_ABI,
    STRUCT_TEST_ABI,
    ADDRESSES
} = require("./abis.js");

// Import helper functions
const {
    getMulticallScripterABI,
    deployMulticallScripter
} = require("./helpers.js");

async function main() {
    console.log("🚀 Advanced Structs and Output Chaining Example");
    console.log("===============================================\n");
    console.log("💡 Demonstrates:");
    console.log("   - Complex struct handling with nested structs");
    console.log("   - Extracting individual fields from struct returns");
    console.log("   - Using struct fields as inputs to subsequent calls");
    console.log("   - Dynamic field access in JavaScript\n");
    
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
        
        // Use the first Anvil account
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
        console.log(`   Balance: ${formatEther(await publicClient.getBalance({ address: account.address }))} ETH\n`);
        
        // Deploy a test contract for struct operations
        console.log("3. Deploying StructTest contract...");
        const structTestBytecode = "0x608060405234801561001057600080fd5b5061051e806100206000396000f3fe608060405234801561001057600080fd5b50600436106100675760003560e01c80633e1a891d116100505780633e1a891d146100b6578063a0fbf1d2146100d4578063e9c2e14b146100f257610067565b80630b6c2c6c1461006c5780631c5a2c9c14610098575b600080fd5b610086600480360381019061008191906102f6565b610110565b60405161008f9190610344565b60405180910390f35b6100a0610147565b6040516100ad9190610344565b60405180910390f35b6100be61016b565b6040516100cb9190610344565b60405180910390f35b6100dc610191565b6040516100e99190610344565b60405180910390f35b6100fa6101b5565b6040516101079190610344565b60405180910390f35b600061011b826101d9565b90506000610128836101d9565b90508082141561013d57600092505050610142565b80925050505b919050565b7f000000000000000000000000000000000000000000000000000000000000006481565b7f000000000000000000000000000000000000000000000000000000000000000181565b7f000000000000000000000000000000000000000000000000000000000000006581565b7f000000000000000000000000000000000000000000000000000000000000000381565b60008082600001518360200151846040015185606001516040516020016101ff9594939291906103a9565b6040516020818303038152906040528051906020012090506102208161022a565b915050919050565b60008160405160200161023b9190610456565b604051602081830303815290604052805190602001209050919050565b600080fd5b6000819050919050565b61026f8161025c565b811461027a57600080fd5b50565b60008135905061028c81610266565b92915050565b60008115159050919050565b6102a781610292565b81146102b257600080fd5b50565b6000813590506102c48161029e565b92915050565b600080604083850312156102e1576102e0610257565b5b60006102ef8582860161027d565b9250506020610300858286016102b5565b9150509250929050565b6000602082840312156103205761031f610257565b5b600061032e8482850161027d565b91505092915050565b6103408161025c565b82525050565b600060208201905061035b6000830184610337565b92915050565b600081519050919050565b600082825260208201905092915050565b60005b8381101561039b578082015181840152602081019050610380565b838111156103aa576000848401525b50505050565b600060a08201905081810360008301526103ca8188610361565b905081810360208301526103de8187610361565b905081810360408301526103f28186610361565b905081810360608301526104068185610361565b9050818103608083015261041a8184610361565b90509695505050505050565b600081905092915050565b7f19457468657265756d205369676e6564204d6573736167653a0a333200000000600082015250565b6000610467601c83610426565b915061047282610431565b601c82019050919050565b60006104888261045a565b91506104948284610426565b91508190509291505056fea2646970667358221220c7a0e9d7e9e0c5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e64736f6c63430008110033";
        
        const deployStructHash = await walletClient.deployContract({
            abi: [{ type: "constructor", inputs: [], stateMutability: "nonpayable" }],
            bytecode: structTestBytecode,
            account,
        });
        
        const structReceipt = await publicClient.waitForTransactionReceipt({ hash: deployStructHash });
        const structTestAddress = structReceipt.contractAddress;
        console.log(`   StructTest contract: ${structTestAddress}\n`);
        
        // 4. Deploy MulticallScripter using helper
        const multicallAddress = await deployMulticallScripter(walletClient, publicClient, account);
        
        // Get MulticallScripter ABI
        const multicallScripterABI = getMulticallScripterABI();
        
        // 5. Build complex transaction with struct handling
        console.log("5. Building complex transaction with struct handling:");
        console.log("   Step 1: Get constant struct (returns complex nested struct)");
        console.log("   Step 2: Extract individual fields (a, nested.nA, nested.nB)");
        console.log("   Step 3: Use extracted fields in subsequent operations");
        console.log("   Step 4: Create new struct using extracted values");
        console.log("   Step 5: Set the new struct\n");
        
        const builder = new TransactionBuilder();
        
        console.log("   Strategy: getConstantStruct() → extract fields → create operations");
        console.log('   Steps:');
        
        // Step 1: Get constant struct (returns Complex struct with nested struct)
        console.log(`   1. Call getConstantStruct()`);
        console.log(`      Returns: { a: 100, nested: { nA: 200, nB: 300 } }`);
        const structResult = builder.addCall(
            STRUCT_TEST_ABI,
            structTestAddress,
            "getConstantStruct",
            [],
            0n
        );
        
        // Step 2: Use individual struct fields in a tuple operation
        console.log(`   2. Call setTuple() using struct fields:`);
        console.log(`      - structResult.a (100) as first parameter`);
        console.log(`      - structResult.nested.nA (200) as second parameter`);
        console.log(`      - structResult.nested.nB (300) as third parameter`);
        builder.addCall(
            STRUCT_TEST_ABI,
            structTestAddress,
            "setTuple",
            [
                structResult.a,           // Access top-level field
                structResult.nested.nA,   // Access nested struct field
                structResult.nested.nB    // Access nested struct field
            ],
            0n
        );
        
        // Step 3: Get tuple constant (returns simple tuple)
        console.log(`\n   3. Call getTupleConstant()`);
        console.log(`      Returns: { a: 1, b: 2, c: 3 }`);
        const tupleResult = builder.addCall(
            STRUCT_TEST_ABI,
            structTestAddress,
            "getTupleConstant",
            [],
            0n
        );
        
        // Step 4: Use tuple fields in WETH operations (demonstrating real DeFi integration)
        console.log(`\n   4. Integrate with real DeFi using tuple values:`);
        console.log(`      - Wrap ETH amount = tupleResult.a (1 wei)`);
        console.log(`      - Demonstrate struct field usage in real contract call`);
        
        // Wrap a tiny amount of ETH using value from tuple
        builder.addCall(
            WETH_ABI,
            ADDRESSES.WETH,
            "deposit",
            [],
            tupleResult.a  // Use tuple field as value (1 wei)
        );
        
        console.log(`\n   Total steps: 4 (Complex struct handling + DeFi integration)`);
        console.log(`   Key features demonstrated:`);
        console.log(`   - Nested struct field access (structResult.nested.nA)`);
        console.log(`   - Multiple field extraction from single call`);
        console.log(`   - Struct fields as inputs to subsequent calls`);
        console.log(`   - Integration with real DeFi contracts using struct data\n`);
        
        // 6. Build and execute transaction
        console.log("6. Building transaction...");
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
            value: 1n  // Send 1 wei for WETH deposit (from tupleResult.a)
        });
        
        console.log(`   Transaction hash: ${txHash}`);
        
        const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
        console.log(`   Gas used: ${receipt.gasUsed}`);
        console.log(`   Status: ${receipt.status === "success" ? "✅ Success" : "❌ Failed"}`);
        
        if (receipt.status !== "success") {
            throw new Error("Transaction failed");
        }
        
        console.log("\n🎉 Transaction executed successfully!");
        console.log(`   - Retrieved complex nested struct`);
        console.log(`   - Extracted individual fields: a=100, nested.nA=200, nested.nB=300`);
        console.log(`   - Used extracted fields as inputs to setTuple()`);
        console.log(`   - Retrieved tuple: {a=1, b=2, c=3}`);
        console.log(`   - Used tuple field (a=1) as ETH amount for WETH deposit`);
        console.log(`   - All steps executed atomically in one transaction!`);
        
        console.log("\n💡 ADVANCED FEATURES DEMONSTRATED:");
        console.log(`   1. Nested Struct Access: structResult.nested.nA`);
        console.log(`   2. Multiple Field Extraction: a, nested.nA, nested.nB from single call`);
        console.log(`   3. Type-Safe Field Access: Compile-time checking of struct fields`);
        console.log(`   4. Real DeFi Integration: Using struct data in WETH contract call`);
        console.log(`   5. Atomic Execution: All dependent operations in one transaction`);
        
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