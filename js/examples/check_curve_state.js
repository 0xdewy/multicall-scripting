#!/usr/bin/env node

/**
 * check_curve_state.js - Check Curve pool state
 */

const { parseEther, formatEther } = require("viem");
const { createPublicClient, http } = require("viem");
const { startAnvil, stopAnvil } = require("./anvilFork.js");

// Contract addresses
const ADDRESSES = {
  DAI: "0x6B175474E89094C44Da98b954EedeAC495271d0F",
  USDC: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
  CURVE_DAI_USDC_USDT_POOL: "0xbEbc44782C7dB0a1A60Cb6fe97d0b483032FF1C7"
};

// Curve Pool ABI (with more functions)
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
  },
  {
    type: "function",
    name: "coins",
    inputs: [{ name: "i", type: "uint256" }],
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "balances",
    inputs: [{ name: "i", type: "uint256" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "A",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "fee",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "admin_fee",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "get_virtual_price",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "calc_token_amount",
    inputs: [
      { name: "amounts", type: "uint256[3]" },
      { name: "is_deposit", type: "bool" }
    ],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "calc_withdraw_one_coin",
    inputs: [
      { name: "_token_amount", type: "uint256" },
      { name: "i", type: "int128" }
    ],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "get_dy",
    inputs: [
      { name: "i", type: "int128" },
      { name: "j", type: "int128" },
      { name: "dx", type: "uint256" }
    ],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view"
  }
];

async function main() {
  console.log('🔍 Check Curve Pool State\n');
  
  let anvil;
  
  try {
    // Start Anvil
    anvil = await startAnvil({ port: 8562 });
    
    // Create client
    const publicClient = createPublicClient({ 
      transport: http(`http://localhost:${anvil.port}`) 
    });
    
    console.log(`🌐 Connected to fork at http://localhost:${anvil.port}\n`);
    
    // Check Curve pool state
    console.log('1. Checking Curve 3pool state...');
    
    // Check coins
    console.log('   a. Pool coins:');
    for (let i = 0; i < 3; i++) {
      try {
        const coin = await publicClient.readContract({
          address: ADDRESSES.CURVE_DAI_USDC_USDT_POOL,
          abi: CURVE_POOL_ABI,
          functionName: 'coins',
          args: [i]
        });
        console.log(`      Coin ${i}: ${coin}`);
      } catch (error) {
        console.log(`      Coin ${i}: Error - ${error.message}`);
      }
    }
    
    // Check balances
    console.log('\n   b. Pool balances:');
    for (let i = 0; i < 3; i++) {
      try {
        const balance = await publicClient.readContract({
          address: ADDRESSES.CURVE_DAI_USDC_USDT_POOL,
          abi: CURVE_POOL_ABI,
          functionName: 'balances',
          args: [i]
        });
        if (i === 0) {
          console.log(`      Balance ${i} (DAI): ${formatEther(balance)} DAI`);
        } else {
          console.log(`      Balance ${i} (${i === 1 ? 'USDC' : 'USDT'}): ${balance / 10n ** 6n} ${i === 1 ? 'USDC' : 'USDT'}`);
        }
      } catch (error) {
        console.log(`      Balance ${i}: Error - ${error.message}`);
      }
    }
    
    // Get actual balances to check if pool is usable
    const daiBalance = await publicClient.readContract({
      address: ADDRESSES.CURVE_DAI_USDC_USDT_POOL,
      abi: CURVE_POOL_ABI,
      functionName: 'balances',
      args: [0]
    });
    const usdcBalance = await publicClient.readContract({
      address: ADDRESSES.CURVE_DAI_USDC_USDT_POOL,
      abi: CURVE_POOL_ABI,
      functionName: 'balances',
      args: [1]
    });
    
    if (usdcBalance < 10n ** 6n) { // Less than 1 USDC
      console.log(`\n   ⚠️  WARNING: USDC balance is only ${usdcBalance / 10n ** 6n} USDC!`);
      console.log(`      This pool cannot execute DAI→USDC swaps.`);
      console.log(`      The pool has ${formatEther(daiBalance)} DAI but only ${usdcBalance / 10n ** 6n} USDC.`);
    }
    
    // Check pool parameters
    console.log('\n   c. Pool parameters:');
    try {
      const A = await publicClient.readContract({
        address: ADDRESSES.CURVE_DAI_USDC_USDT_POOL,
        abi: CURVE_POOL_ABI,
        functionName: 'A'
      });
      console.log(`      A (amplification coefficient): ${A}`);
    } catch (error) {
      console.log(`      A: Error - ${error.message}`);
    }
    
    try {
      const fee = await publicClient.readContract({
        address: ADDRESSES.CURVE_DAI_USDC_USDT_POOL,
        abi: CURVE_POOL_ABI,
        functionName: 'fee'
      });
      console.log(`      Fee: ${fee} (${Number(fee) / 10000000}%)`);
    } catch (error) {
      console.log(`      Fee: Error - ${error.message}`);
    }
    
    try {
      const adminFee = await publicClient.readContract({
        address: ADDRESSES.CURVE_DAI_USDC_USDT_POOL,
        abi: CURVE_POOL_ABI,
        functionName: 'admin_fee'
      });
      console.log(`      Admin fee: ${adminFee} (${Number(adminFee) / 10000000}%)`);
    } catch (error) {
      console.log(`      Admin fee: Error - ${error.message}`);
    }
    
    try {
      const virtualPrice = await publicClient.readContract({
        address: ADDRESSES.CURVE_DAI_USDC_USDT_POOL,
        abi: CURVE_POOL_ABI,
        functionName: 'get_virtual_price'
      });
      console.log(`      Virtual price: ${formatEther(virtualPrice)}`);
    } catch (error) {
      console.log(`      Virtual price: Error - ${error.message}`);
    }
    
    // Test swap calculation
    console.log('\n   d. Test swap calculations:');
    const testAmounts = [parseEther("1"), parseEther("10"), parseEther("100")];
    
    for (const amount of testAmounts) {
      try {
        const dy = await publicClient.readContract({
          address: ADDRESSES.CURVE_DAI_USDC_USDT_POOL,
          abi: CURVE_POOL_ABI,
          functionName: 'get_dy',
          args: [0, 1, amount] // DAI → USDC
        });
        const dyUsdc = Number(dy) / 1e6;
        const amountDai = Number(formatEther(amount));
        console.log(`      ${amountDai} DAI → ${dyUsdc} USDC`);
        console.log(`        Rate: ${(dyUsdc / amountDai).toFixed(6)} USDC per DAI`);
      } catch (error) {
        console.log(`      ${formatEther(amount)} DAI: Error - ${error.message}`);
      }
    }
    
    // Check if pool is working by testing a small simulation
    console.log('\n2. Testing pool simulation...');
    try {
      // Try to calculate token amount
      const amounts = [parseEther("1000"), 0n, 0n];
      const tokenAmount = await publicClient.readContract({
        address: ADDRESSES.CURVE_DAI_USDC_USDT_POOL,
        abi: CURVE_POOL_ABI,
        functionName: 'calc_token_amount',
        args: [amounts, true]
      });
      console.log(`   Adding 1000 DAI would give: ${formatEther(tokenAmount)} LP tokens`);
    } catch (error) {
      console.log(`   Simulation error: ${error.message}`);
    }
    
    console.log('\n✅ Curve pool check completed.');
    
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
      console.log('\n✅ Curve pool is accessible.');
      process.exit(0);
    } else {
      console.error('\n❌ Failed to check Curve pool.');
      process.exit(1);
    }
  });
}