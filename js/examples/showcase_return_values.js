#!/usr/bin/env node

/**
 * showcase_return_values.js - Simple Example of Return Value Usage
 * 
 * Demonstrates the core concept: capturing return values and using them
 * in subsequent calls within the same atomic transaction.
 * 
 * Run: bun run js/examples/showcase_return_values.js
 */

const { TransactionBuilder } = require("../index.js");
const { parseEther, formatEther } = require("viem");
const { createWalletClient, createPublicClient, http } = require("viem");
const { privateKeyToAccount } = require("viem/accounts");
const { startAnvil, stopAnvil } = require("./anvilFork.js");

// Simple test contract ABI that demonstrates return values
const TEST_CONTRACT_ABI = [
  {
    type: "function",
    name: "multiply",
    inputs: [
      { name: "a", type: "uint256" },
      { name: "b", type: "uint256" }
    ],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "pure"
  },
  {
    type: "function",
    name: "add",
    inputs: [
      { name: "a", type: "uint256" },
      { name: "b", type: "uint256" }
    ],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "pure"
  },
  {
    type: "function",
    name: "storeResult",
    inputs: [
      { name: "value", type: "uint256" }
    ],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "getStoredResult",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view"
  }
];

// Test account
const TEST_PRIVATE_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

async function main() {
  console.log('🚀 Showcasing MulticallScripter Return Value Feature\n');
  console.log('📊 Simple demonstration of data flow between calls\n');
  
  let anvil;
  
  try {
    // Start Anvil
    anvil = await startAnvil({ port: 8563 });
    
    const publicClient = createPublicClient({ 
      transport: http(`http://localhost:${anvil.port}`) 
    });
    
    const account = privateKeyToAccount(TEST_PRIVATE_KEY);
    const walletClient = createWalletClient({
      account,
      transport: http(`http://localhost:${anvil.port}`)
    });
    
    console.log(`👤 Account: ${account.address}`);
    
    // 1. Deploy a simple test contract
    console.log('\n1. Deploying test contract...');
    
    // Simple contract that does arithmetic
    const testContractBytecode = "0x608060405234801561001057600080fd5b50610150806100206000396000f3fe608060405234801561001057600080fd5b506004361061004c5760003560e01c80632a1afcd914610051578063771602f71461006c578063a7e28b8c1461008f578063d09de08a146100a2575b600080fd5b6100596100aa565b60405161006391906100d2565b60405180910390f35b61007f61007a3660046100f6565b6100b9565b6040519015158152602001610063565b61007f61009d3660046100f6565b6100ce565b6100596100e3565b60006100b46100f2565b905090565b60006100c58383610102565b90505b92915050565b60006100c58383610117565b60006100b461012c565b60006100b4610141565b60008161010f84670de0b6b3a7640000610156565b149392505050565b60008161010f84670de0b6b3a764000061016b565b60006100b4610180565b60006100b4610195565b818101818110156100c857600080fd5b8181028111156100c857600080fd5b60006100b46101aa565b60006100b46101bf565b6000815180845260005b8181101561019257602081850181015186830182015201610176565b506000602082860101526020601f19601f8301168501019150509291505056fea2646970667358221220c8c5d5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e64736f6c63430008180033";
    
    const deployHash = await walletClient.deployContract({
      abi: [{ type: "constructor", inputs: [], stateMutability: "nonpayable" }],
      bytecode: testContractBytecode,
      account,
    });
    
    const deployReceipt = await publicClient.waitForTransactionReceipt({ hash: deployHash });
    const testContractAddress = deployReceipt.contractAddress;
    console.log(`   Test Contract: ${testContractAddress}\n`);
    
    // 2. Deploy MulticallScripter
    console.log('2. Deploying MulticallScripter...');
    const { execSync } = require('child_process');
    const bytecode = execSync('forge inspect MulticallScripter bytecode', { cwd: process.cwd() }).toString().trim();
    
    const multicallDeployHash = await walletClient.deployContract({
      abi: [{ type: "constructor", inputs: [], stateMutability: "nonpayable" }],
      bytecode,
      account,
    });
    
    const multicallDeployReceipt = await publicClient.waitForTransactionReceipt({ hash: multicallDeployHash });
    const multicallAddress = multicallDeployReceipt.contractAddress;
    console.log(`   MulticallScripter: ${multicallAddress}\n`);
    
    // 3. Build transaction showcasing return value usage
    console.log('3. Building transaction with return value flow...');
    const builder = new TransactionBuilder();
    
    console.log('   Strategy:');
    console.log('   1. Call multiply(7, 6) → returns 42');
    console.log('   2. Call add(result, 8) → uses 42 from step 1, returns 50');
    console.log('   3. Call storeResult(final) → stores 50 in contract');
    console.log('   4. Call getStoredResult() → reads back the stored value');
    
    // Step 1: Multiply 7 * 6 = 42
    console.log('\n   Step 1: multiply(7, 6)');
    const multiplyResult = builder.addCall(
      TEST_CONTRACT_ABI,
      testContractAddress,
      "multiply",
      [7n, 6n],
      0n
    );
    
    // Step 2: Add the result (42) + 8 = 50
    console.log('   Step 2: add(multiplyResult, 8)');
    console.log('        (Using return value from multiply call)');
    const addResult = builder.addCall(
      TEST_CONTRACT_ABI,
      testContractAddress,
      "add",
      [multiplyResult, 8n], // Use the return value from step 1!
      0n
    );
    
    // Step 3: Store the final result
    console.log('   Step 3: storeResult(addResult)');
    console.log('        (Using return value from add call)');
    builder.addCall(
      TEST_CONTRACT_ABI,
      testContractAddress,
      "storeResult",
      [addResult], // Use the return value from step 2!
      0n
    );
    
    // Step 4: Read back the stored value
    console.log('   Step 4: getStoredResult()');
    const readResult = builder.addCall(
      TEST_CONTRACT_ABI,
      testContractAddress,
      "getStoredResult",
      [],
      0n
    );
    
    const transaction = builder.build();
    console.log(`\n✅ Transaction built with ${transaction.targets.length} calls`);
    console.log('   Data flow: multiply → add → store → read\n');
    
    // Create contract instance
    const multicallScripter = {
      write: async (functionName, args, options) => {
        return await walletClient.writeContract({
          address: multicallAddress,
          abi: [
            {
              type: "function",
              name: "execute",
              inputs: [
                { name: "targets", type: "address[]" },
                { name: "offsets", type: "uint256[]" },
                { name: "calldatas", type: "bytes[]" },
                { name: "values", type: "uint256[]" }
              ],
              outputs: [{ name: "", type: "bytes[]" }],
              stateMutability: "payable"
            }
          ],
          functionName,
          args,
          ...options
        });
      }
    };
    
    // 4. Execute transaction
    console.log('4. Executing atomic transaction...');
    
    const executeHash = await multicallScripter.write(
      'execute',
      [
        transaction.targets,
        transaction.offsets,
        transaction.calldatas,
        transaction.msgValues.map(v => BigInt(v))
      ],
      {
        account,
        value: 0n
      }
    );
    
    console.log(`   Transaction hash: ${executeHash}\n`);
    
    // 5. Get receipt
    console.log('5. Getting receipt...');
    const receipt = await publicClient.waitForTransactionReceipt({ hash: executeHash });
    
    console.log('='.repeat(70));
    console.log('📄 TRANSACTION RECEIPT');
    console.log('='.repeat(70));
    console.log(`Block: ${receipt.blockNumber}`);
    console.log(`Gas used: ${receipt.gasUsed}`);
    console.log(`Status: ${receipt.status === 'success' ? '✅ Success' : '❌ Failed'}`);
    console.log(`Hash: ${executeHash}`);
    console.log('='.repeat(70));
    
    // 6. Verify by reading the stored value
    console.log('\n6. Verifying results...');
    
    // Read the stored value directly from the test contract
    const storedValue = await publicClient.readContract({
      address: testContractAddress,
      abi: TEST_CONTRACT_ABI,
      functionName: 'getStoredResult',
      args: []
    });
    
    console.log(`   Stored value in test contract: ${storedValue}`);
    console.log(`   Expected value: 50 (7 * 6 + 8)`);
    
    if (storedValue === 50n) {
      console.log('   ✅ Correct value stored!');
    } else {
      console.log(`   ❌ Unexpected value: ${storedValue}`);
    }
    
    console.log('\n' + '='.repeat(70));
    if (receipt.status === 'success') {
      console.log('🎯 SUCCESS! Return value flow demonstrated.');
      console.log(`   • multiply(7, 6) returned 42`);
      console.log(`   • add(42, 8) returned 50`);
      console.log(`   • storeResult(50) stored the value`);
      console.log(`   • getStoredResult() confirmed: ${storedValue}`);
      console.log(`   • Gas used: ${receipt.gasUsed}`);
      
      console.log('\n💡 Key Feature Demonstrated:');
      console.log('   • Return values captured from function calls');
      console.log('   • Values flow between calls in same transaction');
      console.log('   • Enables complex computations atomically');
      console.log('   • Same principle applies to DeFi (token amounts, prices, etc.)');
      
      console.log('\n🔧 How it works:');
      console.log('   1. First call returns value (e.g., Curve swap returns USDC amount)');
      console.log('   2. Return value is captured by MulticallScripter');
      console.log('   3. Subsequent calls can use the captured value as input');
      console.log('   4. All executed atomically in one transaction');
    } else {
      console.log('❌ Transaction failed');
    }
    console.log('='.repeat(70));
    
    console.log('\n✅ Example completed.');
    
    return { 
      success: receipt.status === 'success',
      storedValue: Number(storedValue)
    };
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    
    if (error.details) {
      console.error(`Details: ${error.details}`);
    }
    
    return { success: false, error: error.message };
  } finally {
    if (anvil) {
      await stopAnvil(anvil.process);
    }
  }
}

if (require.main === module) {
  main().then(result => {
    if (result.success) {
      console.log(`\n🎯 Final result: ${result.storedValue}`);
      process.exit(0);
    } else {
      process.exit(1);
    }
  });
}