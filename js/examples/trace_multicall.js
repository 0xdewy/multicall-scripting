#!/usr/bin/env node

/**
 * trace_multicall.js - Trace multicall transaction to debug failures
 */

const { parseEther, formatEther } = require("viem");
const { createPublicClient, http, createWalletClient } = require("viem");
const { privateKeyToAccount } = require("viem/accounts");
const { startAnvil, stopAnvil } = require("./anvilFork.js");

// Contract addresses
const ADDRESSES = {
  WETH: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
  DAI: "0x6B175474E89094C44Da98b954EedeAC495271d0F",
  USDC: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
  UNISWAP_V2_ROUTER: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D",
  CURVE_DAI_USDC_USDT_POOL: "0xbEbc44782C7dB0a1A60Cb6fe97d0b483032FF1C7"
};

// Test private key
const TEST_PRIVATE_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

async function main() {
  console.log('🔍 Trace Multicall Transaction\n');
  
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
    
    // Get initial balances
    console.log('1. Checking initial balances...');
    const initialEth = await publicClient.getBalance({ address: account.address });
    console.log(`   ETH: ${formatEther(initialEth)}`);
    
    // Test individual calls first
    console.log('\n2. Testing individual calls...');
    
    // Test 1: Wrap ETH to WETH
    console.log('   a. WETH wrap:');
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
      const wrapTx = await walletClient.writeContract({
        address: ADDRESSES.WETH,
        abi: wethAbi,
        functionName: 'deposit',
        value: parseEther("0.1")
      });
      console.log(`      ✓ Success: ${wrapTx}`);
    } catch (error) {
      console.log(`      ✗ Failed: ${error.message}`);
    }
    
    // Test 2: Approve WETH for Uniswap
    console.log('   b. WETH approve for Uniswap:');
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
      const approveTx = await walletClient.writeContract({
        address: ADDRESSES.WETH,
        abi: erc20Abi,
        functionName: 'approve',
        args: [ADDRESSES.UNISWAP_V2_ROUTER, parseEther("1000")]
      });
      console.log(`      ✓ Success: ${approveTx}`);
    } catch (error) {
      console.log(`      ✗ Failed: ${error.message}`);
    }
    
    // Test 3: Uniswap swap
    console.log('   c. Uniswap swap (WETH→DAI):');
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
      const swapTx = await walletClient.writeContract({
        address: ADDRESSES.UNISWAP_V2_ROUTER,
        abi: uniswapRouterAbi,
        functionName: 'swapExactTokensForTokens',
        args: [
          parseEther("0.01"), // 0.01 WETH
          parseEther("30"), // min 30 DAI (conservative)
          [ADDRESSES.WETH, ADDRESSES.DAI],
          account.address,
          Math.floor(Date.now() / 1000) + 300
        ]
      });
      console.log(`      ✓ Success: ${swapTx}`);
    } catch (error) {
      console.log(`      ✗ Failed: ${error.message}`);
    }
    
    // Test 4: DAI approve for Curve
    console.log('   d. DAI approve for Curve:');
    try {
      const daiApproveTx = await walletClient.writeContract({
        address: ADDRESSES.DAI,
        abi: erc20Abi,
        functionName: 'approve',
        args: [ADDRESSES.CURVE_DAI_USDC_USDT_POOL, parseEther("1000")]
      });
      console.log(`      ✓ Success: ${daiApproveTx}`);
    } catch (error) {
      console.log(`      ✗ Failed: ${error.message}`);
    }
    
    // Test 5: Curve swap
    console.log('   e. Curve swap (DAI→USDC):');
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
      const curveTx = await walletClient.writeContract({
        address: ADDRESSES.CURVE_DAI_USDC_USDT_POOL,
        abi: curvePoolAbi,
        functionName: 'exchange',
        args: [
          0, // DAI index
          1, // USDC index
          parseEther("10"), // 10 DAI
          BigInt(9.9 * 1e6) // min 9.9 USDC (0.99 USDC per DAI)
        ]
      });
      console.log(`      ✓ Success: ${curveTx}`);
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
      console.log('\n✅ Trace completed.');
      process.exit(0);
    } else {
      console.error('\n❌ Failed to trace multicall.');
      process.exit(1);
    }
  });
}