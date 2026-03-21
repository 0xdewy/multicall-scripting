#!/usr/bin/env node

/**
 * test_curve_larger.js - Test Curve swap with larger amount
 */

const { parseEther, formatEther } = require("viem");
const { createWalletClient, createPublicClient, http } = require("viem");
const { privateKeyToAccount } = require("viem/accounts");
const { startAnvil, stopAnvil } = require("./anvilFork.js");

// Contract addresses
const ADDRESSES = {
  WETH: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
  DAI: "0x6B175474E89094C44Da98b954EedeAC495271d0F",
  USDC: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
  CURVE_DAI_USDC_USDT_POOL: "0xbEbc44782C7dB0a1A60Cb6fe97d0b483032FF1C7",
  UNISWAP_V2_ROUTER: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D"
};

// Contract ABIs
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
  },
  {
    type: "function",
    name: "balanceOf",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view"
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

const UNISWAP_ABI = [
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

async function main() {
  console.log('🔍 Test Curve Swap with Larger Amount\n');
  
  let anvil;
  
  try {
    // Start Anvil
    anvil = await startAnvil({ port: 8561 });
    
    // Create clients
    const publicClient = createPublicClient({ 
      transport: http(`http://localhost:${anvil.port}`) 
    });
    
    const walletClient = createWalletClient({
      transport: http(`http://localhost:${anvil.port}`),
      account: privateKeyToAccount("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80")
    });
    
    const account = walletClient.account;
    
    console.log(`👤 Account: ${account.address}\n`);
    
    // First, get more DAI by swapping more WETH
    console.log('1. Getting DAI from Uniswap...');
    
    const swapAmount = parseEther("0.1"); // 0.1 ETH for more DAI
    const deadline = Math.floor(Date.now() / 1000) + 3600;
    
    // Wrap ETH
    console.log('   a. Wrapping 0.1 ETH...');
    const wrapHash = await walletClient.writeContract({
      address: ADDRESSES.WETH,
      abi: [{ type: "function", name: "deposit", inputs: [], outputs: [], stateMutability: "payable" }],
      functionName: 'deposit',
      account,
      value: swapAmount
    });
    await publicClient.waitForTransactionReceipt({ hash: wrapHash });
    
    // Approve WETH
    console.log('   b. Approving WETH...');
    const approveWethHash = await walletClient.writeContract({
      address: ADDRESSES.WETH,
      abi: ERC20_ABI,
      functionName: 'approve',
      args: [ADDRESSES.UNISWAP_V2_ROUTER, swapAmount],
      account
    });
    await publicClient.waitForTransactionReceipt({ hash: approveWethHash });
    
    // Swap WETH → DAI
    console.log('   c. Swapping WETH → DAI...');
    const swapHash = await walletClient.writeContract({
      address: ADDRESSES.UNISWAP_V2_ROUTER,
      abi: UNISWAP_ABI,
      functionName: 'swapExactTokensForTokens',
      args: [swapAmount, 0n, [ADDRESSES.WETH, ADDRESSES.DAI], account.address, deadline],
      account
    });
    const swapReceipt = await publicClient.waitForTransactionReceipt({ hash: swapHash });
    
    if (swapReceipt.status !== 'success') {
      console.log('❌ Uniswap swap failed');
      return { success: false };
    }
    
    // Check DAI balance
    const daiBalance = await publicClient.readContract({
      address: ADDRESSES.DAI,
      abi: ERC20_ABI,
      functionName: 'balanceOf',
      args: [account.address]
    });
    
    console.log(`   ✅ Got ${formatEther(daiBalance)} DAI\n`);
    
    // Test Curve swap with different amounts
    const testAmounts = [
      parseEther("1"),     // 1 DAI
      parseEther("10"),    // 10 DAI
      parseEther("100"),   // 100 DAI
      parseEther("1000")   // 1000 DAI
    ];
    
    for (const curveSwapAmount of testAmounts) {
      if (daiBalance < curveSwapAmount) {
        console.log(`❌ Skipping ${formatEther(curveSwapAmount)} DAI test (not enough DAI)`);
        continue;
      }
      
      console.log(`2. Testing Curve swap with ${formatEther(curveSwapAmount)} DAI...`);
      
      // Approve DAI for Curve
      console.log('   a. Approving DAI for Curve...');
      const approveDaiHash = await walletClient.writeContract({
        address: ADDRESSES.DAI,
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [ADDRESSES.CURVE_DAI_USDC_USDT_POOL, curveSwapAmount],
        account
      });
      await publicClient.waitForTransactionReceipt({ hash: approveDaiHash });
      
      // Try Curve swap
      console.log('   b. Attempting Curve swap...');
      try {
        const curveHash = await walletClient.writeContract({
          address: ADDRESSES.CURVE_DAI_USDC_USDT_POOL,
          abi: CURVE_POOL_ABI,
          functionName: 'exchange',
          args: [0, 1, curveSwapAmount, 0n], // DAI → USDC
          account
        });
        
        const curveReceipt = await publicClient.waitForTransactionReceipt({ hash: curveHash });
        console.log(`   ✅ Curve swap succeeded! Gas used: ${curveReceipt.gasUsed}`);
        
        // Check USDC balance
        const usdcBalance = await publicClient.readContract({
          address: ADDRESSES.USDC,
          abi: ERC20_ABI,
          functionName: 'balanceOf',
          args: [account.address]
        });
        
        console.log(`   📊 Got ${usdcBalance / 10n ** 6n} USDC`);
        console.log(`   💰 Rate: ~${(usdcBalance / 10n ** 6n) / Number(formatEther(curveSwapAmount))} USDC per DAI`);
        
        return { success: true, amount: curveSwapAmount };
        
      } catch (curveError) {
        console.log(`   ❌ Curve swap failed: ${curveError.message}`);
        
        // Check error signature
        if (curveError.signature) {
          console.log(`   Error signature: ${curveError.signature}`);
          
          // Common Curve errors:
          // 0x5c975abb - "Slippage" (min_dy not met)
          // 0x5ff10377 - "Amount too small" or other pool-specific error
          // 0x4e6f7420 - "Not enough" (insufficient liquidity)
          
          if (curveError.signature === '0x5ff10377') {
            console.log('   Likely error: Amount too small or pool constraint');
          } else if (curveError.signature === '0x5c975abb') {
            console.log('   Likely error: Slippage too high (try with min_dy = 0)');
          }
        }
      }
      
      console.log('');
    }
    
    console.log('❌ All Curve swap attempts failed');
    return { success: false };
    
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
      console.log(`\n✅ Curve swap test successful with ${formatEther(result.amount)} DAI.`);
      process.exit(0);
    } else {
      console.error('\n❌ Curve swap test failed.');
      process.exit(1);
    }
  });
}