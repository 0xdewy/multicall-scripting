#!/usr/bin/env node

/**
 * test_multicall_curve.js - Test Curve swap in multicall
 */

const { parseEther, formatEther } = require("viem");
const { createPublicClient, http, createWalletClient } = require("viem");
const { privateKeyToAccount } = require("viem/accounts");
const { startAnvil, stopAnvil } = require("./anvilFork.js");

// Import TransactionBuilder from execute.js
const { TransactionBuilder } = require('../index.js');

// MulticallScripter ABI (from execute.js)
function getMulticallScripterABI() {
  return [
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
}

// Test private key
const TEST_PRIVATE_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

async function main() {
  console.log('🔍 Test Curve Swap in Multicall\n');
  
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
    
    // First, give account some DAI for testing
    console.log('1. Setting up test DAI balance...');
    
    // Use a whale address to transfer DAI to our account
    const DAI_WHALE = "0x28C6c06298d514Db089934071355E5743bf21d60";
    const DAI_ADDRESS = "0x6B175474E89094C44Da98b954EedeAC495271d0F";
    
    // Impersonate whale
    await publicClient.request({
      method: 'anvil_impersonateAccount',
      params: [DAI_WHALE]
    });
    
    // Transfer DAI
    const transferTx = await walletClient.writeContract({
      address: DAI_ADDRESS,
      abi: [
        {
          type: "function",
          name: "transfer",
          inputs: [
            { name: "to", type: "address" },
            { name: "amount", type: "uint256" }
          ],
          outputs: [{ name: "", type: "bool" }],
          stateMutability: "nonpayable"
        }
      ],
      functionName: 'transfer',
      args: [account.address, parseEther("100")],
      account: privateKeyToAccount(TEST_PRIVATE_KEY) // Still our account
    });
    
    await publicClient.waitForTransactionReceipt({ hash: transferTx });
    
    // Stop impersonation
    await publicClient.request({
      method: 'anvil_stopImpersonatingAccount',
      params: [DAI_WHALE]
    });
    
    // Check DAI balance
    const daiBalance = await publicClient.readContract({
      address: DAI_ADDRESS,
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
    
    console.log(`   DAI balance: ${formatEther(daiBalance)} DAI\n`);
    
    // Deploy MulticallScripter
    console.log('2. Deploying MulticallScripter...');
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
    
    // Test 1: Single Curve swap in multicall
    console.log('3. Testing single Curve swap in multicall...');
    
    const builder = new TransactionBuilder();
    
    // Step 1: Approve DAI for Curve
    console.log('   a. Approve DAI for Curve');
    const ERC20_ABI = [
      {
        type: "function",
        name: "approve",
        inputs: [
          { name: "spender", type: "address" },
          { name: "amount", type: "uint256" }
        ],
        outputs: [{ name: "", type: "bool" }],
        stateMutability: "nonpayable"
      }
    ];
    
    const CURVE_POOL_ABI = [
      {
        type: "function",
        name: "exchange",
        inputs: [
          { name: "i", type: "int128" },
          { name: "j", type: "int128" },
          { name: "dx", type: "uint256" },
          { name: "min_dy", type: "uint256" }
        ],
        outputs: [{ name: "", type: "uint256" }],
        stateMutability: "nonpayable"
      }
    ];
    
    const CURVE_POOL = "0xbEbc44782C7dB0a1A60Cb6fe97d0b483032FF1C7";
    const swapAmount = parseEther("10"); // 10 DAI
    
    builder.addCall(
      ERC20_ABI,
      DAI_ADDRESS,
      "approve",
      [CURVE_POOL, swapAmount],
      0n
    );
    
    // Step 2: Curve swap
    console.log('   b. Curve swap DAI→USDC');
    builder.addCall(
      CURVE_POOL_ABI,
      CURVE_POOL,
      "exchange",
      [0, 1, swapAmount, 0n], // DAI→USDC, min_dy = 0
      0n
    );
    
    const transaction = builder.build();
    
    // Execute
    console.log('   c. Executing multicall...');
    try {
      const executeTx = await walletClient.writeContract({
        address: multicallAddress,
        abi: getMulticallScripterABI(),
        functionName: 'execute',
        args: [
          transaction.targets,
          transaction.offsets,
          transaction.calldatas,
          transaction.values
        ],
        account
      });
      
      const executeReceipt = await publicClient.waitForTransactionReceipt({ hash: executeTx });
      console.log(`      ✓ Success: ${executeReceipt.status === 'success' ? '✅' : '❌'}`);
      
      if (executeReceipt.status === 'success') {
        // Check USDC balance
        const USDC_ADDRESS = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
        const usdcBalance = await publicClient.readContract({
          address: USDC_ADDRESS,
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
        console.log(`      USDC received: ${usdcBalance / 10n ** 6n} USDC`);
      }
    } catch (error) {
      console.log(`      ✗ Failed: ${error.message}`);
      console.log(`      Error: ${error.details || error.shortMessage || 'No details'}`);
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
      console.log('\n✅ Curve multicall test completed.');
      process.exit(0);
    } else {
      console.error('\n❌ Failed to test Curve multicall.');
      process.exit(1);
    }
  });
}