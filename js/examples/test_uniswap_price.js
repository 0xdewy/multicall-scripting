#!/usr/bin/env node

/**
 * test_uniswap_price.js - Check Uniswap price for WETH/DAI
 */

const { parseEther, formatEther } = require("viem");
const { createPublicClient, http } = require("viem");
const { startAnvil, stopAnvil } = require("./anvilFork.js");

// Contract addresses
const ADDRESSES = {
  WETH: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
  DAI: "0x6B175474E89094C44Da98b954EedeAC495271d0F",
  UNISWAP_V2_ROUTER: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D"
};

// Uniswap Router ABI
const UNISWAP_ROUTER_ABI = [
  {
    type: "function",
    name: "getAmountsOut",
    inputs: [
      { name: "amountIn", type: "uint256" },
      { name: "path", type: "address[]" }
    ],
    outputs: [{ name: "amounts", type: "uint256[]" }],
    stateMutability: "view"
  }
];

async function main() {
  console.log('🔍 Check Uniswap WETH/DAI Price\n');
  
  let anvil;
  
  try {
    // Start Anvil
    anvil = await startAnvil({ port: 8562 });
    
    // Create client
    const publicClient = createPublicClient({ 
      transport: http(`http://localhost:${anvil.port}`) 
    });
    
    console.log(`🌐 Connected to fork at http://localhost:${anvil.port}\n`);
    
    // Check price for different amounts
    console.log('1. Checking WETH→DAI prices:');
    const testAmounts = [parseEther("0.001"), parseEther("0.01"), parseEther("0.1")];
    
    for (const amount of testAmounts) {
      try {
        const amounts = await publicClient.readContract({
          address: ADDRESSES.UNISWAP_V2_ROUTER,
          abi: UNISWAP_ROUTER_ABI,
          functionName: 'getAmountsOut',
          args: [
            amount,
            [ADDRESSES.WETH, ADDRESSES.DAI]
          ]
        });
        
        const wethAmount = Number(formatEther(amount));
        const daiAmount = Number(formatEther(amounts[1]));
        const price = daiAmount / wethAmount;
        
        console.log(`   ${wethAmount} WETH → ${daiAmount.toFixed(2)} DAI`);
        console.log(`   Rate: ${price.toFixed(2)} DAI per WETH`);
        console.log(`   (${(1/price).toFixed(6)} WETH per DAI)\n`);
      } catch (error) {
        console.log(`   ${formatEther(amount)} WETH: Error - ${error.message}`);
      }
    }
    
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
      console.log('\n✅ Price check completed.');
      process.exit(0);
    } else {
      console.error('\n❌ Failed to check prices.');
      process.exit(1);
    }
  });
}