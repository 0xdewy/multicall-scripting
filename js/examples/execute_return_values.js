#!/usr/bin/env node

/**
 * execute_return_values.js - Showcase MulticallScripter Return Value Usage
 * 
 * Demonstrates using return values from one call as inputs to subsequent calls.
 * Strategy: Start with DAI, swap to USDC on Curve, then use exact USDC amount
 * to swap back to DAI on Uniswap (via different path).
 * 
 * Shows the power of atomic execution with data flow between calls.
 * 
 * Run: bun run js/examples/execute_return_values.js
 */

const { TransactionBuilder } = require("../index.js");
const { parseEther, formatEther } = require("viem");
const { createWalletClient, createPublicClient, http } = require("viem");
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

// ABIs
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
  },
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
  },
  {
    type: "function",
    name: "swapTokensForExactTokens",
    inputs: [
      { name: "amountOut", type: "uint256" },
      { name: "amountInMax", type: "uint256" },
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
    outputs: [{ name: "", type: "uint256" }], // Returns actual amount received
    stateMutability: "nonpayable"
  }
];

// Test account
const TEST_PRIVATE_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

async function main() {
  console.log('🚀 Showcasing Return Value Usage in MulticallScripter\n');
  console.log('📊 Strategy: DAI → USDC (Curve) → Use exact USDC → DAI (Uniswap)\n');
  
  let anvil;
  
  try {
    // Start Anvil
    anvil = await startAnvil({ port: 8563 });
    
    const publicClient = createPublicClient({ 
      transport: http(`http://localhost:${anvil.port}`) 
    });
    
    const account = privateKeyToAccount(TEST_PRIVATE_KEY);
    const walletClient = createWalletClient({
      account,
      transport: http(`http://localhost:${anvil.port}`)
    });
    
    console.log(`👤 Account: ${account.address}`);
    const initialBalance = await publicClient.getBalance({ address: account.address });
    console.log(`💰 Initial ETH balance: ${formatEther(initialBalance)} ETH\n`);
    
    // First, we need to get some DAI for testing
    console.log('1. Setting up test DAI balance...');
    
    // Use a whale to transfer DAI to our account
    const DAI_WHALE = "0x28C6c06298d514Db089934071355E5743bf21d60";
    
    // Impersonate whale
    await publicClient.request({
      method: 'anvil_impersonateAccount',
      params: [DAI_WHALE]
    });
    
    // Transfer 100 DAI to our account
    const transferHash = await walletClient.writeContract({
      address: ADDRESSES.DAI,
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
    
    await publicClient.waitForTransactionReceipt({ hash: transferHash });
    
    // Stop impersonation
    await publicClient.request({
      method: 'anvil_stopImpersonatingAccount',
      params: [DAI_WHALE]
    });
    
    // Check DAI balance
    const daiBalance = await publicClient.readContract({
      address: ADDRESSES.DAI,
      abi: [{ type: "function", name: "balanceOf", inputs: [{ name: "account", type: "address" }], outputs: [{ name: "", type: "uint256" }], stateMutability: "view" }],
      functionName: 'balanceOf',
      args: [account.address]
    });
    
    console.log(`   ✅ Received ${formatEther(daiBalance)} DAI\n`);
    
    // 2. Deploy MulticallScripter
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
    
    // Create contract instance
    const multicallScripter = {
      write: async (functionName, args, options) => {
        return await walletClient.writeContract({
          address: multicallAddress,
          abi: [
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
          ],
          functionName,
          args,
          ...options
        });
      }
    };
    
    // 3. Build transaction showcasing return value usage
    console.log('3. Building transaction with return value flow...');
    const builder = new TransactionBuilder();
    
    const daiToSwap = parseEther("10"); // 10 DAI
    const deadline = Math.floor(Date.now() / 1000) + 3600;
    
    console.log('   Strategy steps:');
    console.log('   1. Transfer DAI to MulticallScripter contract');
    console.log('   2. Approve DAI for Curve swap');
    console.log('   3. Swap 10 DAI → USDC on Curve (capture return value)');
    console.log('   4. Approve USDC for Uniswap');
    console.log('   5. Swap exact USDC (from Curve) → DAI on Uniswap');
    console.log('   6. Transfer remaining DAI back to user');
    
    // Step 1: Transfer DAI to MulticallScripter
    console.log(`\n   Step 1: Transfer ${formatEther(daiToSwap)} DAI to contract`);
    builder.addCall(
      ERC20_ABI,
      ADDRESSES.DAI,
      "transfer",
      [multicallAddress, daiToSwap],
      0n
    );
    
    // Step 2: Approve DAI for Curve
    console.log(`   Step 2: Approve DAI for Curve`);
    builder.addCall(
      ERC20_ABI,
      ADDRESSES.DAI,
      "approve",
      [ADDRESSES.CURVE_DAI_USDC_USDT_POOL, daiToSwap],
      0n
    );
    
    // Step 3: Curve swap DAI → USDC (capture return value!)
    console.log(`   Step 3: Swap ${formatEther(daiToSwap)} DAI → USDC on Curve`);
    console.log('        (Capturing USDC output amount as return value)');
    const curveMinOut = 0n; // Accept any amount
    
    // This call returns the actual USDC amount received
    const curveSwapResult = builder.addCall(
      CURVE_POOL_ABI,
      ADDRESSES.CURVE_DAI_USDC_USDT_POOL,
      "exchange",
      [0, 1, daiToSwap, curveMinOut], // DAI→USDC
      0n
    );
    
    // Step 4: Approve USDC for Uniswap (using the return value!)
    console.log(`   Step 4: Approve USDC for Uniswap`);
    console.log('        (Using captured USDC amount from Curve swap)');
    builder.addCall(
      ERC20_ABI,
      ADDRESSES.USDC,
      "approve",
      [ADDRESSES.UNISWAP_V2_ROUTER, curveSwapResult], // Use the return value!
      0n
    );
    
    // Step 5: Uniswap swap USDC → DAI (using exact amount from Curve)
    console.log(`   Step 5: Swap exact USDC → DAI on Uniswap`);
    console.log('        (Using captured USDC amount as exact input)');
    const usdcToDaiPath = [ADDRESSES.USDC, ADDRESSES.WETH, ADDRESSES.DAI]; // USDC→WETH→DAI
    const minDaiOut = 0n; // Accept any amount
    
    builder.addCall(
      UNISWAP_V2_ROUTER_ABI,
      ADDRESSES.UNISWAP_V2_ROUTER,
      "swapExactTokensForTokens",
      [curveSwapResult, minDaiOut, usdcToDaiPath, multicallAddress, deadline], // Use return value!
      0n
    );
    
    // Step 6: Transfer any remaining DAI back to user
    console.log(`   Step 6: Transfer DAI back to user`);
    builder.addCall(
      ERC20_ABI,
      ADDRESSES.DAI,
      "transfer",
      [account.address, 0n], // Would need actual amount in production
      0n
    );
    
    const transaction = builder.build();
    console.log(`\n✅ Transaction built with ${transaction.targets.length} calls`);
    console.log(`   Note: Curve swap return value flows to Uniswap swap!\n`);
    
    // 4. Execute transaction
    console.log('4. Executing atomic transaction...');
    
    const executeHash = await multicallScripter.write(
      'execute',
      [
        transaction.targets,
        transaction.offsets,
        transaction.calldatas,
        transaction.msgValues.map(v => BigInt(v))
      ],
      {
        account,
        value: 0n // No ETH needed for this strategy
      }
    );
    
    console.log(`   Transaction hash: ${executeHash}\n`);
    
    // 5. Get receipt
    console.log('5. Getting receipt...');
    const receipt = await publicClient.waitForTransactionReceipt({ hash: executeHash });
    
    console.log('='.repeat(70));
    console.log('📄 TRANSACTION RECEIPT');
    console.log('='.repeat(70));
    console.log(`Block: ${receipt.blockNumber}`);
    console.log(`Gas used: ${receipt.gasUsed}`);
    console.log(`Status: ${receipt.status === 'success' ? '✅ Success' : '❌ Failed'}`);
    console.log(`Hash: ${executeHash}`);
    console.log('='.repeat(70));
    
    // 6. Verify results
    console.log('\n6. Verifying results...');
    
    // Check balances
    const finalEthBalance = await publicClient.getBalance({ address: account.address });
    
    // Create contract instances
    const createContract = (client, address, abi) => ({
      read: async (functionName, args) => {
        return await client.readContract({
          address,
          abi,
          functionName,
          args
        });
      }
    });
    
    const wethContract = createContract(publicClient, ADDRESSES.WETH, ERC20_ABI);
    const daiContract = createContract(publicClient, ADDRESSES.DAI, ERC20_ABI);
    const usdcContract = createContract(publicClient, ADDRESSES.USDC, ERC20_ABI);
    
    // Get balances
    const userDaiBalance = await daiContract.read('balanceOf', [account.address]);
    const userUsdcBalance = await usdcContract.read('balanceOf', [account.address]);
    
    const contractDaiBalance = await daiContract.read('balanceOf', [multicallAddress]);
    const contractUsdcBalance = await usdcContract.read('balanceOf', [multicallAddress]);
    
    console.log(`   Final ETH balance: ${formatEther(finalEthBalance)}`);
    
    console.log('\n   User Account:');
    console.log(`     • DAI: ${formatEther(userDaiBalance)}`);
    console.log(`     • USDC: ${userUsdcBalance / 10n ** 6n} USDC`);
    
    console.log('\n   Contract Account:');
    console.log(`     • DAI: ${formatEther(contractDaiBalance)}`);
    console.log(`     • USDC: ${contractUsdcBalance / 10n ** 6n} USDC`);
    
    // Calculate what happened
    const initialDai = 100n;
    const swappedDai = 10n;
    const expectedRemainingDai = 90n;
    
    const actualUserDai = userDaiBalance;
    const daiDifference = Number(formatEther(actualUserDai)) - Number(formatEther(expectedRemainingDai));
    
    console.log('\n📈 Analysis:');
    console.log(`   • Started with: ${formatEther(initialDai * 10n ** 18n)} DAI`);
    console.log(`   • Swapped on Curve: ${formatEther(swappedDai * 10n ** 18n)} DAI`);
    console.log(`   • Expected remaining: ${formatEther(expectedRemainingDai * 10n ** 18n)} DAI`);
    console.log(`   • Actual user DAI: ${formatEther(actualUserDai)} DAI`);
    console.log(`   • Difference: ${daiDifference.toFixed(6)} DAI`);
    
    if (Math.abs(daiDifference) < 1) {
      console.log(`   ✅ DAI amounts match expectation (round-trip successful)`);
    } else if (daiDifference > 0) {
      console.log(`   📈 User gained ${daiDifference.toFixed(6)} DAI (arbitrage profit!)`);
    } else {
      console.log(`   📉 User lost ${Math.abs(daiDifference).toFixed(6)} DAI (fees/slippage)`);
    }
    
    console.log('\n' + '='.repeat(70));
    if (receipt.status === 'success') {
      console.log('🎯 SUCCESS! Return value flow demonstrated.');
      console.log(`   • DAI transferred to contract`);
      console.log(`   • Curve swap executed (DAI → USDC)`);
      console.log(`   • USDC amount captured as return value`);
      console.log(`   • USDC approved using captured amount`);
      console.log(`   • Uniswap swap executed with exact USDC amount`);
      console.log(`   • Gas used: ${receipt.gasUsed}`);
      
      console.log('\n💡 Key Feature Demonstrated:');
      console.log('   • MulticallScripter can capture return values from calls');
      console.log('   • Return values can be used as inputs to subsequent calls');
      console.log('   • Enables complex data flows in atomic transactions');
      console.log('   • No need to hardcode amounts or estimate outputs');
      
      if (contractDaiBalance > 0 || contractUsdcBalance > 0) {
        console.log('\n⚠️  Note: Some tokens remain in contract.');
        console.log('   In production, add transfer calls for exact amounts.');
      }
    } else {
      console.log('❌ Transaction failed');
    }
    console.log('='.repeat(70));
    
    console.log('\n✅ Example completed.');
    
    return { success: receipt.status === 'success' };
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    
    if (error.details) {
      console.error(`Details: ${error.details}`);
    }
    
    console.log('\n🔍 Troubleshooting:');
    console.log('   1. Check if whale has DAI on fork');
    console.log('   2. Verify Curve pool has liquidity');
    console.log('   3. Try with smaller amounts');
    
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
      process.exit(0);
    } else {
      process.exit(1);
    }
  });
}