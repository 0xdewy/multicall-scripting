#!/usr/bin/env node

/**
 * trace_execute_failure.js - Trace the failing execute.js transaction
 */

const { parseEther, formatEther } = require("viem");
const { createPublicClient, http, createWalletClient } = require("viem");
const { privateKeyToAccount } = require("viem/accounts");
const { startAnvil, stopAnvil } = require("./anvilFork.js");

// Test private key
const TEST_PRIVATE_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

async function main() {
  console.log('🔍 Trace Execute.js Failure\n');
  
  let anvil;
  
  try {
    // Start Anvil with tracing
    anvil = await startAnvil({ 
      port: 8562,
      args: ['--steps-tracing']
    });
    
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
    
    // Run execute.js but capture the transaction hash
    console.log('1. Running execute.js transaction...\n');
    
    // First deploy MulticallScripter
    const { execSync } = require('child_process');
    const bytecode = execSync('forge inspect MulticallScripter bytecode', { cwd: process.cwd() }).toString().trim();
    
    const deployHash = await walletClient.deployContract({
      abi: [{ type: "constructor", inputs: [], stateMutability: "nonpayable" }],
      bytecode,
      account,
    });
    
    const deployReceipt = await publicClient.waitForTransactionReceipt({ hash: deployHash });
    const multicallAddress = deployReceipt.contractAddress;
    console.log(`   MulticallScripter: ${multicallAddress}`);
    
    // Build the exact transaction from execute.js
    const { TransactionBuilder } = require('../index.js');
    
    const builder = new TransactionBuilder();
    
    // Same calls as execute.js
    const initialEth = parseEther("0.01");
    
    // 1. WETH deposit
    const WETH_ABI = [
      {
        type: "function",
        name: "deposit",
        inputs: [],
        outputs: [],
        stateMutability: "payable"
      }
    ];
    
    builder.addCall(
      WETH_ABI,
      "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
      "deposit",
      [],
      initialEth
    );
    
    // 2. WETH approve
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
    
    builder.addCall(
      ERC20_ABI,
      "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
      "approve",
      ["0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D", initialEth],
      0n
    );
    
    // 3. Uniswap swap
    const UNISWAP_V2_ROUTER_ABI = [
      {
        type: "function",
        name: "swapExactTokensForTokens",
        inputs: [
          { name: "amountIn", type: "uint256" },
          { name: "amountOutMin", type: "uint256" },
          { name: "path", type: "address[]" },
          { name: "to", type: "address" },
          { name: "deadline", type: "uint256" }
        ],
        outputs: [{ name: "amounts", type: "uint256[]" }],
        stateMutability: "nonpayable"
      }
    ];
    
    const swapPath = ["0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", "0x6B175474E89094C44Da98b954EedeAC495271d0F"];
    const deadline = Math.floor(Date.now() / 1000) + 3600;
    const minOut = 0n;
    
    builder.addCall(
      UNISWAP_V2_ROUTER_ABI,
      "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D",
      "swapExactTokensForTokens",
      [initialEth, minOut, swapPath, account.address, deadline],
      0n
    );
    
    // 4. DAI approve for Curve
    const daiForCurveSwap = parseEther("5");
    builder.addCall(
      ERC20_ABI,
      "0x6B175474E89094C44Da98b954EedeAC495271d0F",
      "approve",
      ["0xbEbc44782C7dB0a1A60Cb6fe97d0b483032FF1C7", daiForCurveSwap],
      0n
    );
    
    // 5. Curve swap
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
    
    const curveMinOut = 0n;
    builder.addCall(
      CURVE_POOL_ABI,
      "0xbEbc44782C7dB0a1A60Cb6fe97d0b483032FF1C7",
      "exchange",
      [0, 1, daiForCurveSwap, curveMinOut],
      0n
    );
    
    const transaction = builder.build();
    
    console.log('   Transaction details:');
    console.log(`   - Targets: ${transaction.targets.length} addresses`);
    console.log(`   - Offsets: ${transaction.offsets.length} values`);
    console.log(`   - Calldatas: ${transaction.calldatas.length} items`);
    console.log(`   - msgValues: ${transaction.msgValues ? transaction.msgValues.length : 'undefined'} items`);
    if (transaction.msgValues) {
      console.log(`     msgValues: ${transaction.msgValues.map(v => v.toString()).join(', ')}`);
    }
    
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
    
    console.log('\n2. Executing transaction with tracing...\n');
    
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
        account
      });
      
      console.log(`   Transaction hash: ${executeTx}`);
      
      // Wait for receipt
      const executeReceipt = await publicClient.waitForTransactionReceipt({ hash: executeTx });
      console.log(`   Status: ${executeReceipt.status === 'success' ? '✅ Success' : '❌ Failed'}`);
      
      if (executeReceipt.status === 'reverted') {
        console.log('\n3. Tracing failed transaction...');
        
        try {
          const trace = await publicClient.request({
            method: 'debug_traceTransaction',
            params: [executeTx, { tracer: 'callTracer' }]
          });
          
          console.log('\n   Transaction trace:');
          console.log(JSON.stringify(trace, null, 2));
          
        } catch (traceError) {
          console.log(`   Trace failed: ${traceError.message}`);
          
          // Try simpler trace
          try {
            const simpleTrace = await publicClient.request({
              method: 'debug_traceTransaction',
              params: [executeTx, { tracer: 'prestateTracer' }]
            });
            console.log(`   Simple trace available`);
          } catch (simpleError) {
            console.log(`   Simple trace also failed: ${simpleError.message}`);
          }
        }
      }
      
    } catch (error) {
      console.log(`   ✗ Transaction failed: ${error.message}`);
      console.log(`   Error: ${error.details || error.shortMessage || 'No details'}`);
    }
    
    console.log('\n✅ Trace completed.');
    
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
      console.log('\n✅ Execute failure trace completed.');
      process.exit(0);
    } else {
      console.error('\n❌ Failed to trace execute failure.');
      process.exit(1);
    }
  });
}