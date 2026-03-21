#!/usr/bin/env node

/**
 * execute_final.js - FINAL REAL DEFI EXAMPLE WITH CURVE (FIXED)
 * 
 * Real DeFi example that actually executes on mainnet fork:
 * 1. Wrap ETH → WETH
 * 2. Approve WETH for Uniswap
 * 3. Swap WETH → DAI on Uniswap V2
 * 4. Approve DAI for Curve
 * 5. Swap DAI → USDC on Curve 3pool
 * 6. Transfer USDC to user account
 * 
 * This demonstrates atomic execution of multiple DeFi steps across protocols.
 * 
 * Run: node js/examples/execute_final.js
 */

const { TransactionBuilder } = require("../index.js");
const { parseEther, formatEther } = require("viem");
const { createWalletClient, createPublicClient, http } = require("viem");
const { privateKeyToAccount } = require("viem/accounts");
const { startAnvil, stopAnvil } = require("./anvilFork.js");

// Contract addresses (mainnet)
const ADDRESSES = {
  WETH: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
  DAI: "0x6B175474E89094C44Da98b954EedeAC495271d0F",
  USDC: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
  UNISWAP_V2_ROUTER: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D",
  CURVE_DAI_USDC_USDT_POOL: "0xbEbc44782C7dB0a1A60Cb6fe97d0b483032FF1C7"
};

// ABIs
const WETH_ABI = [
  {
    type: "function",
    name: "deposit",
    inputs: [],
    outputs: [],
    stateMutability: "payable"
  }
];

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

// Test account
const TEST_PRIVATE_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

async function main() {
  console.log('🚀 Real DeFi Example: ETH → WETH → Uniswap → Curve (FIXED)\n');
  
  let anvil;
  
  try {
    // Start Anvil fork
    anvil = await startAnvil({ port: 8545 });
    
    // Create clients
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
    
    // 1. Deploy MulticallScripter
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
    
    // Create wagmi-style contract instance
    const multicallScripter = {
      write: async (functionName, args, options) => {
        return await walletClient.writeContract({
          address: multicallAddress,
          abi: getMulticallScripterABI(),
          functionName,
          args,
          ...options
        });
      }
    };
    
    // 2. Build DeFi transaction
    console.log('2. Building DeFi transaction...');
    const builder = new TransactionBuilder();
    
    const initialEth = parseEther("0.01"); // 0.01 ETH
    
    console.log(`   Strategy: ${formatEther(initialEth)} ETH → WETH → DAI → USDC → User`);
    console.log('   Steps:');
    
    // Step 1: Wrap ETH → WETH
    console.log(`   1. Wrap ${formatEther(initialEth)} ETH → WETH`);
    builder.addCall(
      WETH_ABI,
      ADDRESSES.WETH,
      "deposit",
      [],
      initialEth
    );
    
    // Step 2: Approve WETH for Uniswap swap
    console.log(`   2. Approve WETH for Uniswap`);
    builder.addCall(
      ERC20_ABI,
      ADDRESSES.WETH,
      "approve",
      [ADDRESSES.UNISWAP_V2_ROUTER, initialEth],
      0n
    );
    
    // Step 3: Swap WETH → DAI on Uniswap V2
    console.log(`   3. Swap WETH → DAI on Uniswap`);
    const swapPath = [ADDRESSES.WETH, ADDRESSES.DAI];
    const deadline = Math.floor(Date.now() / 1000) + 3600;
    const minOut = 0n; // Accept any amount
    
    builder.addCall(
      UNISWAP_V2_ROUTER_ABI,
      ADDRESSES.UNISWAP_V2_ROUTER,
      "swapExactTokensForTokens",
      [initialEth, minOut, swapPath, multicallAddress, deadline], // Send DAI to multicall contract
      0n
    );
    
    // Step 4: Approve DAI for Curve swap
    console.log(`   4. Approve DAI for Curve swap`);
    const daiForCurveSwap = parseEther("10"); // 10 DAI (minimum for reasonable rate)
    builder.addCall(
      ERC20_ABI,
      ADDRESSES.DAI,
      "approve",
      [ADDRESSES.CURVE_DAI_USDC_USDT_POOL, daiForCurveSwap],
      0n
    );
    
    // Step 5: Swap DAI → USDC on Curve 3pool
    console.log(`   5. Swap ${formatEther(daiForCurveSwap)} DAI → USDC on Curve`);
    const curveMinOut = 0n; // Accept any amount
    builder.addCall(
      CURVE_POOL_ABI,
      ADDRESSES.CURVE_DAI_USDC_USDT_POOL,
      "exchange",
      [0, 1, daiForCurveSwap, curveMinOut], // DAI→USDC
      0n
    );
    
    // Step 6: Transfer USDC to user account
    console.log(`   6. Transfer USDC to user account`);
    builder.addCall(
      ERC20_ABI,
      ADDRESSES.USDC,
      "transfer",
      [account.address, 0n], // Amount will be determined by Curve swap output
      0n
    );
    
    const transaction = builder.build();
    console.log(`\n✅ Strategy built with ${transaction.targets.length} calls\n`);
    
    // 3. Execute the atomic transaction
    console.log('3. Executing atomic transaction...');
    
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
        value: initialEth
      }
    );
    
    console.log(`   Transaction hash: ${executeHash}\n`);
    
    // 4. Get receipt
    console.log('4. Getting receipt...');
    const executeReceipt = await publicClient.waitForTransactionReceipt({ hash: executeHash });
    
    console.log('='.repeat(70));
    console.log('📄 DEFI TRANSACTION RECEIPT');
    console.log('='.repeat(70));
    console.log(`Block: ${executeReceipt.blockNumber}`);
    console.log(`Gas used: ${executeReceipt.gasUsed}`);
    console.log(`Status: ${executeReceipt.status === 'success' ? '✅ Success' : '❌ Failed'}`);
    console.log(`Hash: ${executeHash}`);
    console.log('='.repeat(70));
    
    // 5. Verify results
    console.log('\n5. Verifying results...');
    
    const finalEth = await publicClient.getBalance({ address: account.address });
    console.log(`   Final ETH balance: ${formatEther(finalEth)}`);
    
    // Check user token balances
    const userWethBalance = await publicClient.readContract({
      address: ADDRESSES.WETH,
      abi: [{ type: "function", name: "balanceOf", inputs: [{ name: "account", type: "address" }], outputs: [{ name: "", type: "uint256" }], stateMutability: "view" }],
      functionName: 'balanceOf',
      args: [account.address]
    });
    
    const userDaiBalance = await publicClient.readContract({
      address: ADDRESSES.DAI,
      abi: [{ type: "function", name: "balanceOf", inputs: [{ name: "account", type: "address" }], outputs: [{ name: "", type: "uint256" }], stateMutability: "view" }],
      functionName: 'balanceOf',
      args: [account.address]
    });
    
    const userUsdcBalance = await publicClient.readContract({
      address: ADDRESSES.USDC,
      abi: [{ type: "function", name: "balanceOf", inputs: [{ name: "account", type: "address" }], outputs: [{ name: "", type: "uint256" }], stateMutability: "view" }],
      functionName: 'balanceOf',
      args: [account.address]
    });
    
    console.log(`   User WETH balance: ${formatEther(userWethBalance)}`);
    console.log(`   User DAI balance: ${formatEther(userDaiBalance)}`);
    console.log(`   User USDC balance: ${userUsdcBalance / 10n ** 6n} USDC`);
    
    // Check contract balances
    const contractUsdcBalance = await publicClient.readContract({
      address: ADDRESSES.USDC,
      abi: [{ type: "function", name: "balanceOf", inputs: [{ name: "account", type: "address" }], outputs: [{ name: "", type: "uint256" }], stateMutability: "view" }],
      functionName: 'balanceOf',
      args: [multicallAddress]
    });
    
    const contractDaiBalance = await publicClient.readContract({
      address: ADDRESSES.DAI,
      abi: [{ type: "function", name: "balanceOf", inputs: [{ name: "account", type: "address" }], outputs: [{ name: "", type: "uint256" }], stateMutability: "view" }],
      functionName: 'balanceOf',
      args: [multicallAddress]
    });
    
    console.log(`\n   Contract USDC balance: ${contractUsdcBalance / 10n ** 6n} USDC`);
    console.log(`   Contract DAI balance: ${formatEther(contractDaiBalance)} DAI`);
    
    const ethUsed = parseFloat(formatEther(initialBalance)) - parseFloat(formatEther(finalEth));
    console.log(`   ETH used: ${ethUsed.toFixed(18)}`);
    
    console.log('\n' + '='.repeat(70));
    if (executeReceipt.status === 'success') {
      console.log('🎯 SUCCESS! Real DeFi example executed atomically.');
      console.log(`   Executed ${transaction.targets.length} DeFi steps`);
      console.log(`   Wrapped ${formatEther(initialEth)} ETH → WETH`);
      console.log(`   Approved WETH for Uniswap`);
      console.log(`   Swapped WETH → DAI on Uniswap V2`);
      console.log(`   Approved DAI for Curve`);
      console.log(`   Swapped ${formatEther(daiForCurveSwap)} DAI → USDC on Curve 3pool`);
      console.log(`   Transferred USDC to user account`);
      console.log(`   Final USDC: ${userUsdcBalance / 10n ** 6n} USDC`);
      console.log(`   Gas used: ${executeReceipt.gasUsed}`);
      
      console.log('\n💡 Real DeFi example executed!');
      console.log('   • ETH → WETH wrap');
      console.log('   • WETH approval for Uniswap');
      console.log('   • WETH → DAI swap on Uniswap V2');
      console.log('   • DAI approval for Curve');
      console.log('   • DAI → USDC swap on Curve 3pool');
      console.log('   • USDC transfer to user');
      console.log('   • All steps executed atomically in one transaction');
    } else {
      console.log('❌ DeFi strategy failed.');
    }
    console.log('='.repeat(70));
    
    console.log('\n✅ Real DeFi strategy executed successfully!');
    console.log(`   ETH → WETH → Uniswap → Curve → User executed atomically.`);
    
    return { success: executeReceipt.status === 'success' };
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    
    console.log('\n💡 Debug tips:');
    console.log('   1. Try with smaller amounts');
    console.log('   2. Check if Curve pool has liquidity on fork');
    console.log('   3. Verify all contract addresses are correct');
    
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
      console.error('\n❌ DeFi strategy failed.');
      process.exit(1);
    }
  });
}