#!/usr/bin/env node

/**
 * execute_professional.js - Professional DeFi Example with MulticallScripter
 * 
 * Demonstrates atomic execution of a multi-step DeFi strategy:
 * 1. Wrap ETH → WETH
 * 2. Approve WETH for Uniswap V2
 * 3. Swap WETH → DAI on Uniswap V2
 * 4. Approve DAI for Curve Finance
 * 5. Swap DAI → USDC on Curve 3pool
 * 
 * All steps execute atomically in a single transaction using MulticallScripter.
 * Includes comprehensive error handling, validation, and result verification.
 * 
 * Run: bun run examples/execute_professional.js
 */

const { TransactionBuilder } = require("../index.js");
const { parseEther, formatEther } = require("viem");
const { createWalletClient, createPublicClient, http } = require("viem");
const { privateKeyToAccount } = require("viem/accounts");
const { startAnvil, stopAnvil } = require("./anvilFork.js");

// ============================================================================
// Configuration
// ============================================================================

// Mainnet contract addresses
const ADDRESSES = {
  WETH: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
  DAI: "0x6B175474E89094C44Da98b954EedeAC495271d0F",
  USDC: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
  UNISWAP_V2_ROUTER: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D",
  CURVE_DAI_USDC_USDT_POOL: "0xbEbc44782C7dB0a1A60Cb6fe97d0b483032FF1C7"
};

// Contract ABIs (minimal for required functions)
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

const WETH_ABI = [
  {
    type: "function",
    name: "deposit",
    inputs: [],
    outputs: [],
    stateMutability: "payable"
  }
];

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

// MulticallScripter ABI
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

// Test account (Anvil default account with 10,000 ETH)
const TEST_PRIVATE_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

// Strategy parameters
const STRATEGY_CONFIG = {
  ETH_AMOUNT: parseEther("0.01"),      // 0.01 ETH to start
  CURVE_SWAP_AMOUNT: parseEther("10"), // 10 DAI to swap on Curve
  MIN_OUT_RATIO: 0.95,                 // Accept 5% slippage
  DEADLINE_BUFFER: 3600,               // 1 hour deadline
  ANVIL_PORT: 8545,
  RPC_URL: "https://eth.drpc.org"
};

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Format USDC amount (6 decimals)
 */
function formatUSDC(amount) {
  return Number(amount) / 1e6;
}

/**
 * Calculate minimum output with slippage tolerance
 */
function calculateMinOut(expectedAmount, slippageTolerance = STRATEGY_CONFIG.MIN_OUT_RATIO) {
  return BigInt(Math.floor(Number(expectedAmount) * slippageTolerance));
}

/**
 * Create a contract instance for reading
 */
function createReadContract(client, address, abi) {
  return {
    read: async (functionName, args) => {
      return await client.readContract({
        address,
        abi,
        functionName,
        args
      });
    }
  };
}

/**
 * Print section header
 */
function printHeader(title) {
  console.log('\n' + '='.repeat(70));
  console.log(`📋 ${title}`);
  console.log('='.repeat(70));
}

/**
 * Print success/failure status
 */
function printStatus(success, message) {
  const icon = success ? '✅' : '❌';
  console.log(`${icon} ${message}`);
}

// ============================================================================
// Main Execution
// ============================================================================

async function executeDeFiStrategy() {
  let anvil = null;
  let multicallAddress = null;
  
  try {
    printHeader("Real DeFi Example: ETH → WETH → Uniswap → Curve");
    
    // ------------------------------------------------------------------------
    // 1. Initialize Environment
    // ------------------------------------------------------------------------
    printHeader("1. Initializing Environment");
    
    console.log(`🚀 Starting Anvil fork on port ${STRATEGY_CONFIG.ANVIL_PORT}...`);
    anvil = await startAnvil({ 
      port: STRATEGY_CONFIG.ANVIL_PORT,
      forkUrl: STRATEGY_CONFIG.RPC_URL
    });
    
    const publicClient = createPublicClient({ 
      transport: http(`http://localhost:${anvil.port}`) 
    });
    
    const account = privateKeyToAccount(TEST_PRIVATE_KEY);
    const walletClient = createWalletClient({
      account,
      transport: http(`http://localhost:${anvil.port}`)
    });
    
    console.log(`🌐 Connected to mainnet fork at http://localhost:${anvil.port}`);
    console.log(`👤 Executor: ${account.address}`);
    
    const initialEthBalance = await publicClient.getBalance({ address: account.address });
    console.log(`💰 Initial ETH balance: ${formatEther(initialEthBalance)} ETH`);
    
    // Validate sufficient balance
    if (initialEthBalance < STRATEGY_CONFIG.ETH_AMOUNT) {
      throw new Error(`Insufficient ETH balance. Need ${formatEther(STRATEGY_CONFIG.ETH_AMOUNT)} ETH, have ${formatEther(initialEthBalance)} ETH`);
    }
    
    // ------------------------------------------------------------------------
    // 2. Deploy MulticallScripter
    // ------------------------------------------------------------------------
    printHeader("2. Deploying MulticallScripter");
    
    console.log("📦 Compiling MulticallScripter bytecode...");
    const { execSync } = require('child_process');
    const bytecode = execSync('forge inspect MulticallScripter bytecode', { 
      cwd: process.cwd(),
      encoding: 'utf-8'
    }).trim();
    
    if (!bytecode || bytecode.length < 100) {
      throw new Error("Failed to compile MulticallScripter bytecode");
    }
    
    console.log("🚀 Deploying contract...");
    const deployHash = await walletClient.deployContract({
      abi: [{ type: "constructor", inputs: [], stateMutability: "nonpayable" }],
      bytecode,
      account,
    });
    
    const deployReceipt = await publicClient.waitForTransactionReceipt({ hash: deployHash });
    multicallAddress = deployReceipt.contractAddress;
    
    if (!multicallAddress) {
      throw new Error("Failed to deploy MulticallScripter - no contract address returned");
    }
    
    printStatus(true, `MulticallScripter deployed: ${multicallAddress}`);
    
    // ------------------------------------------------------------------------
    // 3. Build DeFi Transaction
    // ------------------------------------------------------------------------
    printHeader("3. Building DeFi Transaction");
    
    console.log(`🎯 Strategy: ${formatEther(STRATEGY_CONFIG.ETH_AMOUNT)} ETH → WETH → DAI → USDC`);
    console.log('\n📝 Transaction Steps:');
    
    const builder = new TransactionBuilder();
    const deadline = Math.floor(Date.now() / 1000) + STRATEGY_CONFIG.DEADLINE_BUFFER;
    
    // Step 1: Wrap ETH → WETH
    console.log(`   1. Wrap ${formatEther(STRATEGY_CONFIG.ETH_AMOUNT)} ETH → WETH`);
    builder.addCall(
      WETH_ABI,
      ADDRESSES.WETH,
      "deposit",
      [],
      STRATEGY_CONFIG.ETH_AMOUNT
    );
    
    // Step 2: Approve WETH for Uniswap
    console.log(`   2. Approve WETH for Uniswap V2 Router`);
    builder.addCall(
      ERC20_ABI,
      ADDRESSES.WETH,
      "approve",
      [ADDRESSES.UNISWAP_V2_ROUTER, STRATEGY_CONFIG.ETH_AMOUNT],
      0n
    );
    
    // Step 3: Swap WETH → DAI on Uniswap V2
    console.log(`   3. Swap WETH → DAI on Uniswap V2`);
    const swapPath = [ADDRESSES.WETH, ADDRESSES.DAI];
    const minDaiOut = 0n; // Accept any amount for demonstration
    
    builder.addCall(
      UNISWAP_V2_ROUTER_ABI,
      ADDRESSES.UNISWAP_V2_ROUTER,
      "swapExactTokensForTokens",
      [STRATEGY_CONFIG.ETH_AMOUNT, minDaiOut, swapPath, multicallAddress, deadline],
      0n
    );
    
    // Step 4: Approve DAI for Curve
    console.log(`   4. Approve ${formatEther(STRATEGY_CONFIG.CURVE_SWAP_AMOUNT)} DAI for Curve`);
    builder.addCall(
      ERC20_ABI,
      ADDRESSES.DAI,
      "approve",
      [ADDRESSES.CURVE_DAI_USDC_USDT_POOL, STRATEGY_CONFIG.CURVE_SWAP_AMOUNT],
      0n
    );
    
    // Step 5: Swap DAI → USDC on Curve 3pool
    console.log(`   5. Swap ${formatEther(STRATEGY_CONFIG.CURVE_SWAP_AMOUNT)} DAI → USDC on Curve`);
    const minUsdcOut = 0n; // Accept any amount for demonstration
    
    builder.addCall(
      CURVE_POOL_ABI,
      ADDRESSES.CURVE_DAI_USDC_USDT_POOL,
      "exchange",
      [0, 1, STRATEGY_CONFIG.CURVE_SWAP_AMOUNT, minUsdcOut], // DAI (0) → USDC (1)
      0n
    );
    
    const transaction = builder.build();
    
    // Validate transaction structure
    if (transaction.targets.length !== 5) {
      throw new Error(`Invalid transaction: expected 5 calls, got ${transaction.targets.length}`);
    }
    
    if (!transaction.msgValues || transaction.msgValues.length !== 1) {
      throw new Error(`Invalid msgValues: expected 1 value for WETH deposit`);
    }
    
    printStatus(true, `Transaction built with ${transaction.targets.length} calls`);
    console.log(`   • Total ETH value: ${formatEther(transaction.msgValues[0])} ETH`);
    
    // ------------------------------------------------------------------------
    // 4. Execute Atomic Transaction
    // ------------------------------------------------------------------------
    printHeader("4. Executing Atomic Transaction");
    
    console.log("⚡ Executing multicall transaction...");
    
    const executeHash = await walletClient.writeContract({
      address: multicallAddress,
      abi: getMulticallScripterABI(),
      functionName: 'execute',
      args: [
        transaction.targets,
        transaction.offsets,
        transaction.calldatas,
        transaction.msgValues.map(v => BigInt(v))
      ],
      account,
      value: STRATEGY_CONFIG.ETH_AMOUNT
    });
    
    console.log(`📨 Transaction submitted: ${executeHash}`);
    console.log("⏳ Waiting for confirmation...");
    
    const executeReceipt = await publicClient.waitForTransactionReceipt({ 
      hash: executeHash,
      timeout: 60000 // 60 second timeout
    });
    
    const success = executeReceipt.status === 'success';
    printStatus(success, `Transaction ${success ? 'confirmed' : 'failed'}`);
    console.log(`   • Block: ${executeReceipt.blockNumber}`);
    console.log(`   • Gas used: ${executeReceipt.gasUsed}`);
    console.log(`   • Status: ${success ? 'Success' : 'Reverted'}`);
    
    if (!success) {
      throw new Error("Transaction execution failed");
    }
    
    // ------------------------------------------------------------------------
    // 5. Verify Results
    // ------------------------------------------------------------------------
    printHeader("5. Verifying Results");
    
    // Create contract instances for balance checking
    const wethContract = createReadContract(publicClient, ADDRESSES.WETH, ERC20_ABI);
    const daiContract = createReadContract(publicClient, ADDRESSES.DAI, ERC20_ABI);
    const usdcContract = createReadContract(publicClient, ADDRESSES.USDC, ERC20_ABI);
    
    // Check final balances
    const finalEthBalance = await publicClient.getBalance({ address: account.address });
    const contractWethBalance = await wethContract.read('balanceOf', [multicallAddress]);
    const contractDaiBalance = await daiContract.read('balanceOf', [multicallAddress]);
    const contractUsdcBalance = await usdcContract.read('balanceOf', [multicallAddress]);
    
    const userWethBalance = await wethContract.read('balanceOf', [account.address]);
    const userDaiBalance = await daiContract.read('balanceOf', [account.address]);
    const userUsdcBalance = await usdcContract.read('balanceOf', [account.address]);
    
    console.log("📊 Balance Summary:");
    console.log('\n   User Account:');
    console.log(`     • ETH: ${formatEther(finalEthBalance)}`);
    console.log(`     • WETH: ${formatEther(userWethBalance)}`);
    console.log(`     • DAI: ${formatEther(userDaiBalance)}`);
    console.log(`     • USDC: ${formatUSDC(userUsdcBalance)}`);
    
    console.log('\n   MulticallScripter Contract:');
    console.log(`     • WETH: ${formatEther(contractWethBalance)}`);
    console.log(`     • DAI: ${formatEther(contractDaiBalance)}`);
    console.log(`     • USDC: ${formatUSDC(contractUsdcBalance)}`);
    
    // Calculate metrics
    const ethUsed = Number(formatEther(initialEthBalance - finalEthBalance));
    const expectedDaiFromUniswap = 21.43; // Based on current rate ~2143 DAI per ETH
    const expectedUsdcFromCurve = 10.0;   // 10 DAI should give ~10 USDC
    
    console.log('\n📈 Performance Metrics:');
    console.log(`   • ETH consumed: ${ethUsed.toFixed(6)} ETH`);
    console.log(`   • Gas cost: ${executeReceipt.gasUsed} gas`);
    console.log(`   • Expected DAI from Uniswap: ~${expectedDaiFromUniswap.toFixed(2)} DAI`);
    console.log(`   • Expected USDC from Curve: ~${expectedUsdcFromCurve.toFixed(2)} USDC`);
    console.log(`   • Actual USDC in contract: ${formatUSDC(contractUsdcBalance).toFixed(2)} USDC`);
    
    // ------------------------------------------------------------------------
    // 6. Success Summary
    // ------------------------------------------------------------------------
    printHeader("6. Execution Summary");
    
    if (contractUsdcBalance > 0) {
      printStatus(true, "DeFi strategy executed successfully!");
      console.log('\n🎯 Achievements:');
      console.log(`   • Atomically executed ${transaction.targets.length} DeFi operations`);
      console.log(`   • Wrapped ${formatEther(STRATEGY_CONFIG.ETH_AMOUNT)} ETH to WETH`);
      console.log(`   • Swapped WETH for DAI via Uniswap V2`);
      console.log(`   • Swapped ${formatEther(STRATEGY_CONFIG.CURVE_SWAP_AMOUNT)} DAI for USDC via Curve`);
      console.log(`   • All operations completed in a single transaction`);
      console.log(`   • Generated ${formatUSDC(contractUsdcBalance).toFixed(2)} USDC in contract`);
      
      console.log('\n💡 Next Steps:');
      console.log(`   • Add a transfer call to send USDC to user account`);
      console.log(`   • Implement slippage protection with minimum output amounts`);
      console.log(`   • Add price oracle checks for better rate validation`);
    } else {
      console.log('⚠️  Strategy executed but no USDC detected in contract.');
      console.log('   This could be due to:');
      console.log('   • Curve swap amount too small (rounding to zero)');
      console.log('   • Pool imbalance affecting swap rate');
      console.log('   • Try increasing CURVE_SWAP_AMOUNT in configuration');
    }
    
    return {
      success: true,
      transactionHash: executeHash,
      contractAddress: multicallAddress,
      gasUsed: executeReceipt.gasUsed,
      balances: {
        user: {
          eth: formatEther(finalEthBalance),
          weth: formatEther(userWethBalance),
          dai: formatEther(userDaiBalance),
          usdc: formatUSDC(userUsdcBalance)
        },
        contract: {
          weth: formatEther(contractWethBalance),
          dai: formatEther(contractDaiBalance),
          usdc: formatUSDC(contractUsdcBalance)
        }
      }
    };
    
  } catch (error) {
    console.error('\n' + '='.repeat(70));
    console.error('❌ Execution Failed');
    console.log('='.repeat(70));
    console.error(`Error: ${error.message}`);
    
    if (error.details) {
      console.error(`Details: ${error.details}`);
    }
    
    if (error.shortMessage) {
      console.error(`Short message: ${error.shortMessage}`);
    }
    
    console.log('\n🔍 Troubleshooting:');
    console.log('   1. Check RPC connection and Anvil fork');
    console.log('   2. Verify contract addresses are correct');
    console.log('   3. Ensure sufficient ETH balance for gas');
    console.log('   4. Try with smaller amounts if pool liquidity is low');
    console.log('   5. Check Curve pool state with check_curve_state.js');
    
    return {
      success: false,
      error: error.message,
      contractAddress: multicallAddress
    };
    
  } finally {
    if (anvil) {
      console.log('\n' + '='.repeat(70));
      console.log("🛑 Cleaning up...");
      await stopAnvil(anvil.process);
      console.log("✅ Anvil stopped");
    }
  }
}

// ============================================================================
// Entry Point
// ============================================================================

if (require.main === module) {
  console.log('🚀 MulticallScripter - Professional DeFi Example');
  console.log('='.repeat(70));
  
  executeDeFiStrategy()
    .then(result => {
      console.log('\n' + '='.repeat(70));
      if (result.success) {
        console.log('✅ Example completed successfully!');
        process.exit(0);
      } else {
        console.log(`❌ Example failed: ${result.error}`);
        process.exit(1);
      }
    })
    .catch(error => {
      console.error('\n' + '='.repeat(70));
      console.error('❌ Unhandled error:', error.message);
      console.error(error.stack);
      process.exit(1);
    });
}

module.exports = { executeDeFiStrategy };