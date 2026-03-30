#!/usr/bin/env node

/**
 * execute_with_transfer.js - DeFi Example with USDC Transfer to User
 * 
 * Complete example that transfers USDC to user after Curve swap.
 * 
 * Run: bun run js/examples/execute_with_transfer.js
 */

const { TransactionBuilder } = require("../index.js");
const { parseEther, formatEther } = require("viem");
const { createWalletClient, createPublicClient, http } = require("viem");
const { privateKeyToAccount } = require("viem/accounts");
const { startAnvil, stopAnvil } = require("./anvilFork.js");

// Import all ABIs and addresses from abis.js
const {
    ERC20_ABI,
    WETH_ABI,
    UNISWAP_V2_ROUTER_ABI,
    CURVE_POOL_ABI,
    ADDRESSES
} = require("./abis.js");

// Import helper functions
const {
    getMulticallScripterABI,
    deployMulticallScripter,
    printStrategy
} = require("./helpers.js");

// Test account
const TEST_PRIVATE_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

async function main() {
  console.log('🚀 DeFi Example: ETH → WETH → Uniswap → Curve → User\n');
  
  let anvil;
  
  try {
    // Start Anvil
    anvil = await startAnvil({ port: 8545 });
    
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
    
    // 1. Deploy MulticallScripter using helper
    const multicallAddress = await deployMulticallScripter(walletClient, publicClient, account);
    
    // Get MulticallScripter ABI
    const multicallScripterABI = getMulticallScripterABI();
    
    // Create contract instance
    const multicallScripter = {
      write: async (functionName, args, options) => {
        return await walletClient.writeContract({
          address: multicallAddress,
          abi: multicallScripterABI,
          functionName,
          args,
          ...options
        });
      }
    };
    
    // 2. Build transaction with transfer
    console.log('2. Building transaction...');
    const builder = new TransactionBuilder();
    
    const initialEth = parseEther("1");
    
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
    console.log('   WETH deposit call added');
    
    console.log('   Adding WETH approve call...');
    builder.addCall(
      ERC20_ABI,
      ADDRESSES.WETH,
      "approve",
      [ADDRESSES.UNISWAP_V2_ROUTER, initialEth],
      0n
    );
    console.log('   WETH approve call added');
    
    const swapPath = [ADDRESSES.WETH, ADDRESSES.DAI];
    const deadline = Math.floor(Date.now() / 1000) + 3600;
    const minOut = 0n;
    
    console.log('   Adding Uniswap swap call...');
    builder.addCall(
      UNISWAP_V2_ROUTER_ABI,
      ADDRESSES.UNISWAP_V2_ROUTER,
      "swapExactTokensForTokens",
      [initialEth, minOut, swapPath, multicallAddress, deadline],
      0n
    );
    console.log('   Uniswap swap call added');
    
    // Step 4: Approve DAI for Curve
    console.log(`   4. Approve DAI for Curve swap`);

    const daiBalanceToApprove = builder.addCall(
      ERC20_ABI,
      ADDRESSES.DAI,
      "balanceOf",
      [multicallAddress],
      0n
    );
    );
    console.log('   DAI balanceOf call added, daiBalance:', daiBalance);

    console.log('   Adding DAI approve call...');
    console.log('   daiBalance type:', typeof daiBalance);
    console.log('   daiBalance:', JSON.stringify(daiBalance, null, 2));
    try {
      builder.addCall(
        ERC20_ABI,
        ADDRESSES.DAI,
        "approve",
        [ADDRESSES.CURVE_DAI_USDC_USDT_POOL, daiBalance],
        0n
      );
      console.log('   DAI approve call added');
    } catch (error) {
      console.error('   Error adding DAI approve call:', error.message);
      console.error('   Error stack:', error.stack);
      throw error;
    }

    // Note: Cannot use return value more than once so have to fetch balance again
    console.log('   Adding second DAI balanceOf call...');
    const daiBalance2 = builder.addCall(
        ERC20_ABI,
        ADDRESSES.DAI,
        "balanceOf",
        [multicallAddress],
        0n
    );
    console.log('   Second DAI balanceOf call added, daiBalance2:', daiBalance2);
    
    // Step 5: Curve swap DAI → USDC
    const curveMinOut = 0n;
    console.log('   Adding Curve exchange call...');
    builder.addCall(
      CURVE_POOL_ABI,
      ADDRESSES.CURVE_DAI_USDC_USDT_POOL,
      [0, 1, daiBalance2, curveMinOut],
      0n
    );
    console.log('   Curve exchange call added');
    
    // Step 6: Transfer USDC to user (approximate amount - in reality would need return value)
    console.log(`   6. Transfer USDC to user account`);

    const usdcOut = builder.addCall(
      ERC20_ABI,
      ADDRESSES.USDC,
      "balanceOf",
      [multicallAddress],
      0n
    );
    builder.addCall(
      ERC20_ABI,
      ADDRESSES.USDC,
       [account.address, usdcOut],
      0n
    );
    console.log('   USDC transfer call added');
    
    const transaction = builder.build();
    console.log(`\n✅ Strategy built with ${transaction.targets.length} calls\n`);
    
    // 3. Execute transaction
    console.log('3. Executing atomic transaction...');
    
    const executeHash = await walletClient.writeContract({
      address: multicallAddress,
      abi: multicallScripterABI,
      functionName: "execute",
      args: [transaction.targets, transaction.offsets, transaction.calldatas, transaction.msgValues],
      value: initialEth
    });
    
    console.log(`   Transaction hash: ${executeHash}\n`);
    
    console.log(`   Transaction hash: ${executeHash}\n`);
    
    // 4. Get receipt
    console.log('4. Getting receipt...');
    const receipt = await publicClient.waitForTransactionReceipt({ hash: executeHash });
    
    console.log('='.repeat(70));
    console.log('📄 TRANSACTION RECEIPT');
    console.log('='.repeat(70));
    console.log(`Block: ${receipt.blockNumber}`);
    console.log(`Gas used: ${receipt.gasUsed}`);
    console.log(`Status: ${receipt.status === 'success' ? '✅ Success' : '❌ Failed'}`);
    console.log(`Hash: ${executeHash}`);
    console.log('='.repeat(70));
    
    // 5. Verify results
    console.log('\n5. Verifying results...');
    
    // Check balances
    const finalBalance = await publicClient.getBalance({ address: account.address });
    
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
    const userWethBalance = await wethContract.read('balanceOf', [account.address]);
    const userDaiBalance = await daiContract.read('balanceOf', [account.address]);
    const userUsdcBalance = await usdcContract.read('balanceOf', [account.address]);
    
    const contractWethBalance = await wethContract.read('balanceOf', [multicallAddress]);
    const contractDaiBalance = await daiContract.read('balanceOf', [multicallAddress]);
    const contractUsdcBalance = await usdcContract.read('balanceOf', [multicallAddress]);
    
    console.log(`   Final ETH balance: ${formatEther(finalBalance)}`);
    console.log(`   ETH used: ${formatEther(initialBalance - finalBalance)}`);
    
    console.log('\n   User Account:');
    console.log(`     • WETH: ${formatEther(userWethBalance)}`);
    console.log(`     • DAI: ${formatEther(userDaiBalance)}`);
    console.log(`     • USDC: ${userUsdcBalance / 10n ** 6n} USDC`);
    
    console.log('\n   Contract Account:');
    console.log(`     • WETH: ${formatEther(contractWethBalance)}`);
    console.log(`     • DAI: ${formatEther(contractDaiBalance)}`);
    console.log(`     • USDC: ${contractUsdcBalance / 10n ** 6n} USDC`);
    
    console.log('\n' + '='.repeat(70));
    if (receipt.status === 'success') {
      console.log('🎯 SUCCESS! Complete DeFi strategy executed.');
      console.log(`   • Wrapped ${formatEther(initialEth)} ETH → WETH`);
      console.log(`   • Swapped WETH → DAI via Uniswap V2`);
      console.log(`   • Transferred USDC to user account`);
      console.log(`   • User received: ${userUsdcBalance / 10n ** 6n} USDC`);
      console.log(`   • Gas used: ${receipt.gasUsed}`);
      
      if (userUsdcBalance > 0) {
        console.log('\n✅ USDC successfully transferred to user!');
      } else {
        console.log('\n⚠️  USDC transfer may have failed or amount was incorrect.');
        console.log('   In production, capture Curve swap return value for exact amount.');
      }
    } else {
      console.log('❌ Transaction failed');
    }
    console.log('='.repeat(70));
    
    console.log('\n✅ Example completed.');
    
    return { success: receipt.status === 'success' };
    
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
      process.exit(0);
    } else {
      process.exit(1);
    }
  });
}
