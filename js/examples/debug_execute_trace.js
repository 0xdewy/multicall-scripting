#!/usr/bin/env node

/**
 * debug_execute_trace.js - Debug execute.js with transaction tracing
 */

const { parseEther, formatEther } = require("viem");
const { createPublicClient, http, createWalletClient } = require("viem");
const { privateKeyToAccount } = require("viem/accounts");
const { startAnvil, stopAnvil } = require("./anvilFork.js");

// Same as execute.js but with tracing
const TEST_PRIVATE_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

async function main() {
  console.log('🔍 Debug Execute with Tracing\n');
  
  let anvil;
  
  try {
    // Start Anvil with tracing enabled
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
    
    // Test the exact same calls as execute.js
    console.log('2. Testing exact calls from execute.js...\n');
    
    // Call 1: WETH deposit (wrap 0.01 ETH)
    console.log('   Call 1: WETH deposit (wrap 0.01 ETH)');
    const wethAbi = [
      {
        type: "function",
        name: "deposit",
        inputs: [],
        outputs: [],
        stateMutability: "payable"
      }
    ];
    
    try {
      const tx1 = await walletClient.writeContract({
        address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
        abi: wethAbi,
        functionName: 'deposit',
        value: parseEther("0.01")
      });
      const receipt1 = await publicClient.waitForTransactionReceipt({ hash: tx1 });
      console.log(`      ✓ Success: ${receipt1.status === 'success' ? '✅' : '❌'}`);
      
      // Trace this transaction
      try {
        const trace1 = await publicClient.request({
          method: 'debug_traceTransaction',
          params: [tx1, { tracer: 'callTracer' }]
        });
        console.log(`      Trace: ${JSON.stringify(trace1, null, 2).substring(0, 200)}...`);
      } catch (traceError) {
        console.log(`      Trace failed: ${traceError.message}`);
      }
    } catch (error) {
      console.log(`      ✗ Failed: ${error.message}`);
    }
    
    // Call 2: WETH approve for Uniswap
    console.log('\n   Call 2: WETH approve for Uniswap');
    const erc20Abi = [
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
    
    try {
      const tx2 = await walletClient.writeContract({
        address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
        abi: erc20Abi,
        functionName: 'approve',
        args: ["0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D", parseEther("0.01")]
      });
      const receipt2 = await publicClient.waitForTransactionReceipt({ hash: tx2 });
      console.log(`      ✓ Success: ${receipt2.status === 'success' ? '✅' : '❌'}`);
    } catch (error) {
      console.log(`      ✗ Failed: ${error.message}`);
    }
    
    // Call 3: Uniswap swap WETH→DAI
    console.log('\n   Call 3: Uniswap swap WETH→DAI');
    const uniswapRouterAbi = [
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
    
    try {
      const tx3 = await walletClient.writeContract({
        address: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D",
        abi: uniswapRouterAbi,
        functionName: 'swapExactTokensForTokens',
        args: [
          parseEther("0.01"), // 0.01 WETH
          0n, // minOut = 0
          ["0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", "0x6B175474E89094C44Da98b954EedeAC495271d0F"],
          account.address,
          Math.floor(Date.now() / 1000) + 3600
        ]
      });
      const receipt3 = await publicClient.waitForTransactionReceipt({ hash: tx3 });
      console.log(`      ✓ Success: ${receipt3.status === 'success' ? '✅' : '❌'}`);
      
      if (receipt3.status === 'success') {
        // Check DAI balance
        const daiBalance = await publicClient.readContract({
          address: "0x6B175474E89094C44Da98b954EedeAC495271d0F",
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
        console.log(`      DAI received: ${formatEther(daiBalance)}`);
      }
    } catch (error) {
      console.log(`      ✗ Failed: ${error.message}`);
    }
    
    // Call 4: DAI approve for Curve
    console.log('\n   Call 4: DAI approve for Curve');
    try {
      const tx4 = await walletClient.writeContract({
        address: "0x6B175474E89094C44Da98b954EedeAC495271d0F",
        abi: erc20Abi,
        functionName: 'approve',
        args: ["0xbEbc44782C7dB0a1A60Cb6fe97d0b483032FF1C7", parseEther("5")]
      });
      const receipt4 = await publicClient.waitForTransactionReceipt({ hash: tx4 });
      console.log(`      ✓ Success: ${receipt4.status === 'success' ? '✅' : '❌'}`);
    } catch (error) {
      console.log(`      ✗ Failed: ${error.message}`);
    }
    
    // Call 5: Curve swap DAI→USDC
    console.log('\n   Call 5: Curve swap DAI→USDC');
    const curvePoolAbi = [
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
    
    try {
      const tx5 = await walletClient.writeContract({
        address: "0xbEbc44782C7dB0a1A60Cb6fe97d0b483032FF1C7",
        abi: curvePoolAbi,
        functionName: 'exchange',
        args: [
          0, // DAI index
          1, // USDC index
          parseEther("5"), // 5 DAI
          0n // min_dy = 0
        ]
      });
      const receipt5 = await publicClient.waitForTransactionReceipt({ hash: tx5 });
      console.log(`      ✓ Success: ${receipt5.status === 'success' ? '✅' : '❌'}`);
      
      if (receipt5.status === 'success') {
        // Check USDC balance
        const usdcBalance = await publicClient.readContract({
          address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
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
        console.log(`      USDC received: ${usdcBalance / 10n ** 6n}`);
      }
    } catch (error) {
      console.log(`      ✗ Failed: ${error.message}`);
      console.log(`      Error details: ${error.details || error.shortMessage || 'No details'}`);
    }
    
    console.log('\n✅ Individual call tests completed.');
    
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
      console.log('\n✅ Debug completed.');
      process.exit(0);
    } else {
      console.error('\n❌ Failed to debug.');
      process.exit(1);
    }
  });
}