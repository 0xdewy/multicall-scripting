#!/usr/bin/env node

/**
 * verify_execute.js - Verify execute.js results
 */

const { parseEther, formatEther } = require("viem");
const { createPublicClient, http, createWalletClient } = require("viem");
const { privateKeyToAccount } = require("viem/accounts");
const { startAnvil, stopAnvil } = require("./anvilFork.js");

// Test private key
const TEST_PRIVATE_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

async function main() {
  console.log('🔍 Verify Execute.js Results\n');
  
  let anvil;
  
  try {
    // Start Anvil on same port as execute.js
    anvil = await startAnvil({ port: 8545 });
    
    // Create clients
    const publicClient = createPublicClient({ 
      transport: http(`http://localhost:${anvil.port}`) 
    });
    
    const account = privateKeyToAccount(TEST_PRIVATE_KEY);
    
    console.log(`🌐 Connected to fork at http://localhost:${anvil.port}\n`);
    
    // MulticallScripter address from execute.js output
    const multicallAddress = "0x9c58ea7823f562fb9f3936d3fe32fa09d3b510e9";
    
    console.log('1. Checking MulticallScripter contract balances...\n');
    
    // Check DAI balance
    const DAI_ADDRESS = "0x6B175474E89094C44Da98b954EedeAC495271d0F";
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
      args: [multicallAddress]
    });
    console.log(`   MulticallScripter DAI balance: ${formatEther(daiBalance)} DAI`);
    
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
      args: [multicallAddress]
    });
    console.log(`   MulticallScripter USDC balance: ${usdcBalance / 10n ** 6n} USDC`);
    
    // Check WETH balance
    const WETH_ADDRESS = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
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
      args: [multicallAddress]
    });
    console.log(`   MulticallScripter WETH balance: ${formatEther(wethBalance)} WETH`);
    
    console.log('\n2. Checking our account balances...\n');
    
    // Check our DAI balance
    const ourDaiBalance = await publicClient.readContract({
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
    console.log(`   Our DAI balance: ${formatEther(ourDaiBalance)} DAI`);
    
    // Check our USDC balance
    const ourUsdcBalance = await publicClient.readContract({
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
    console.log(`   Our USDC balance: ${ourUsdcBalance / 10n ** 6n} USDC`);
    
    // Check our WETH balance
    const ourWethBalance = await publicClient.readContract({
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
    console.log(`   Our WETH balance: ${formatEther(ourWethBalance)} WETH`);
    
    console.log('\n3. Transaction analysis...\n');
    
    // Expected: 0.01 WETH → ~21.43 DAI → swap 5 DAI → ~4.999 USDC
    // Remaining DAI in contract: ~16.43 DAI
    const expectedDaiRemaining = 21.43 - 5; // Rough estimate
    const actualDaiRemaining = Number(formatEther(daiBalance));
    
    console.log(`   Expected DAI in contract: ~${expectedDaiRemaining.toFixed(2)} DAI`);
    console.log(`   Actual DAI in contract: ${actualDaiRemaining.toFixed(2)} DAI`);
    console.log(`   Difference: ${(actualDaiRemaining - expectedDaiRemaining).toFixed(2)} DAI`);
    
    if (Math.abs(actualDaiRemaining - expectedDaiRemaining) < 1) {
      console.log(`   ✓ DAI balance matches expectation`);
    } else {
      console.log(`   ⚠️  DAI balance doesn't match expectation`);
    }
    
    console.log('\n✅ Verification completed.');
    
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
      console.log('\n✅ Execute.js verification completed.');
      process.exit(0);
    } else {
      console.error('\n❌ Failed to verify execute.js.');
      process.exit(1);
    }
  });
}