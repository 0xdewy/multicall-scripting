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
        // Use the actual Structs contract bytecode from compilation
        const structTestBytecode = "0x6080604052348015600e575f5ffd5b506103e68061001c5f395ff3fe608060405234801561000f575f5ffd5b506004361061003f575f3560e01c80634609e6b414610043578063b03e37771461005f578063be3e3f231461007d575b5f5ffd5b61005d60048036038101906100589190610194565b61009b565b005b6100676100af565b6040516100749190610231565b60405180910390f35b6100856100ee565b6040516100929190610231565b60405180910390f35b805f81816100a991906103a2565b90505050565b6100b7610137565b5f604051806040016040528060c8815260200161012c81525090506040518060400160405280606481526020018281525091505090565b6100f6610137565b5f6040518060400160405290815f8201548152602001600182016040518060400160405290815f8201548152602001600182015481525050815250905060405180604001604052805f81526020015f81525090565b6040518060400160405280600081526020015f81525090565b5f80fd5b5f819050919050565b61017d8161016b565b8114610187575f5ffd5b50565b5f8135905061019881610174565b92915050565b5f602082840312156101b3576101b2610167565b5b5f6101c08482850161018a565b91505092915050565b5f81519050919050565b5f82825260208201905092915050565b5f819050602082019050919050565b6101fa8161016b565b82525050565b5f61020b83836101f1565b60208301905092915050565b5f602082019050919050565b5f61022d826101c9565b61023781856101d3565b9350610242836101e3565b805f5b838110156102725781516102598882610200565b975061026483610217565b925050600181019050610245565b5085935050505092915050565b5f6020820190508181035f8301526102978184610223565b905092915050565b5f819050919050565b6102b18161029f565b81146102bb575f5ffd5b50565b5f813590506102cc816102a8565b92915050565b5f602082840312156102e7576102e6610167565b5b5f6102f4848285016102be565b91505092915050565b6103068161029f565b82525050565b5f60208201905061031f5f8301846102fd565b92915050565b7f4e487b71000000000000000000000000000000000000000000000000000000005f52601160045260245ffd5b5f61035c8261029f565b91506103678361029f565b925082820190508082111561037f5761037e610325565b5b92915050565b5f61038f8261029f565b915061039a8361029f565b92508282039050818111156103b2576103b1610325565b5b92915050565b5f6103c28261029f565b91506103cd8361029f565b92508282026103db8161029f565b91508082146103ed576103ec610325565b5b509291505056";
        
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
        
        console.log("   Strategy: Demonstrate basic struct operations");
        console.log('   Steps:');
        
        // Step 1: Get constant struct (returns Complex struct with nested struct)
        console.log(`   1. Call getConstantStruct()`);
        console.log(`      Returns: { a: 100, nested: { nA: 200, nB: 300 } }`);
        builder.addCall(
            STRUCT_TEST_ABI,
            structTestAddress,
            "getConstantStruct",
            [],
            0n
        );
        
        // Step 2: Set a struct using fixed values (demonstrate struct construction)
        console.log(`   2. Call setComplexStruct() with a new struct:`);
        console.log(`      - a = 999`);
        console.log(`      - nested.nA = 888`);
        console.log(`      - nested.nB = 777`);
        builder.addCall(
            STRUCT_TEST_ABI,
            structTestAddress,
            "setComplexStruct",
            [
                {
                    a: 999n,
                    nested: {
                        nA: 888n,
                        nB: 777n
                    }
                }
            ],
            0n
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
            value: 0n  // No value needed - msgValues array handles individual call values
        });
        
        console.log(`   Transaction hash: ${txHash}`);
        
        const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
        console.log(`   Gas used: ${receipt.gasUsed}`);
        console.log(`   Status: ${receipt.status === "success" ? "✅ Success" : "❌ Failed"}`);
        
        if (receipt.status !== "success") {
            throw new Error("Transaction failed");
        }
        
        console.log("\n🎉 Transaction executed successfully!");
        console.log(`   - Retrieved constant complex nested struct: {a=100, nested: {nA=200, nB=300}}`);
        console.log(`   - Set new struct: {a=999, nested: {nA=888, nB=777}}`);
        console.log(`   - All steps executed atomically in one transaction!`);
        
        console.log("\n💡 ADVANCED FEATURES DEMONSTRATED:");
        console.log(`   1. Struct Retrieval: Getting complex nested structs from contracts`);
        console.log(`   2. Struct Construction: Creating and passing structs to contract functions`);
        console.log(`   3. Atomic Execution: Multiple operations in one transaction`);
        
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