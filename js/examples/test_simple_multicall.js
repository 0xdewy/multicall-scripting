#!/usr/bin/env node

/**
 * test_simple_multicall.js - Test simple multicall with WETH deposit
 */

const { parseEther, formatEther } = require("viem");
const { createPublicClient, http, createWalletClient } = require("viem");
const { privateKeyToAccount } = require("viem/accounts");
const { startAnvil, stopAnvil } = require("./anvilFork.js");

// Import TransactionBuilder
const { TransactionBuilder } = require('../index.js');

// Test private key
const TEST_PRIVATE_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

async function main() {
  console.log('🔍 Test Simple Multicall (WETH deposit only)\n');
  
  let anvil;
  
  try {
    // Start Anvil
    anvil = await startAnvil({ port: 8562 });
    
    // Create clients
    const publicClient = createPublicClient({ 
      transport: http(`http://localhost:${anvil.port}`) 
    });
    
    const account = privateKeyToAccount(TEST_PRIVATE_KEY);
    const walletClient = createWalletClient({
      account,
      transport: http(`http://localhost:${anvil.port}`)
    });
    
    console.log(`🌐 Connected to fork at http://localhost:${anvil.port}\n`);
    
    // Deploy MulticallScripter
    console.log('1. Deploying MulticallScripter...');
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
    
    // Test 1: Single WETH deposit in multicall
    console.log('2. Testing single WETH deposit in multicall...');
    
    const builder = new TransactionBuilder();
    
    // WETH deposit ABI
    const WETH_ABI = [
      {
        type: "function",
        name: "deposit",
        inputs: [],
        outputs: [],
        stateMutability: "payable"
      }
    ];
    
    const WETH_ADDRESS = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
    const depositAmount = parseEther("0.01");
    
    builder.addCall(
      WETH_ABI,
      WETH_ADDRESS,
      "deposit",
      [],
      depositAmount
    );
    
    const transaction = builder.build();
    
    console.log('   Transaction details:');
    console.log(`   - Targets: ${transaction.targets.length}`);
    console.log(`   - Offsets: ${transaction.offsets.length}`);
    console.log(`   - Calldatas: ${transaction.calldatas.length}`);
    console.log(`   - msgValues: ${transaction.msgValues.length} = ${formatEther(transaction.msgValues[0])} ETH`);
    
    // MulticallScripter ABI
    const multicallScripterABI = [
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
    ];
    
    console.log('\n3. Executing multicall...');
    try {
      const executeTx = await walletClient.writeContract({
        address: multicallAddress,
        abi: multicallScripterABI,
        functionName: 'execute',
        args: [
          transaction.targets,
          transaction.offsets,
          transaction.calldatas,
          transaction.msgValues.map(v => BigInt(v))
        ],
        account,
        value: depositAmount // Send ETH to contract
      });
      
      const executeReceipt = await publicClient.waitForTransactionReceipt({ hash: executeTx });
      console.log(`   ✓ Success: ${executeReceipt.status === 'success' ? '✅' : '❌'}`);
      
      if (executeReceipt.status === 'success') {
        // Check WETH balance
        const wethBalance = await publicClient.readContract({
          address: WETH_ADDRESS,
          abi: [
            {
              type: "function",
              name: "balanceOf",
              inputs: [{ name: "account", type: "address" }],
              outputs: [{ name: "", type: "uint256" }],
              stateMutability: "view"
            }
          ],
          functionName: 'balanceOf',
          args: [account.address]
        });
        console.log(`   WETH balance: ${formatEther(wethBalance)} WETH`);
      }
    } catch (error) {
      console.log(`   ✗ Failed: ${error.message}`);
      console.log(`   Error: ${error.details || error.shortMessage || 'No details'}`);
      
      // Try to decode offset
      console.log('\n4. Debugging offset...');
      const offset = transaction.offsets[0];
      console.log(`   Offset: ${offset.toString()}`);
      console.log(`   Hex: 0x${offset.toString(16)}`);
      
      // Decode offset according to contract
      const VALUE_OFFSET = 248n;
      const callType = offset >> VALUE_OFFSET;
      console.log(`   Call type: 0x${callType.toString(16)}`);
      
      const value = (offset >> 8n) & ((1n << 8n) - 1n);
      console.log(`   Value index: ${value} (0-based: ${value > 0 ? value - 1 : 'none'})`);
    }
    
    console.log('\n✅ Test completed.');
    
    return { success: true };
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
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
      console.log('\n✅ Simple multicall test completed.');
      process.exit(0);
    } else {
      console.error('\n❌ Failed to test simple multicall.');
      process.exit(1);
    }
  });
}