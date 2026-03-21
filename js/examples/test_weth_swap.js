#!/usr/bin/env node

/**
 * test_weth_swap.js - Test WETH deposit + approve + swap in multicall
 */

const { parseEther, formatEther } = require("viem");
const { createPublicClient, http, createWalletClient } = require("viem");
const { privateKeyToAccount } = require("viem/accounts");
const { startAnvil, stopAnvil } = require("./anvilFork.js");

// Import TransactionBuilder
const { TransactionBuilder } = require('../index.js');

// Test private key
const TEST_PRIVATE_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

async function main() {
  console.log('🔍 Test WETH Deposit + Approve + Swap in Multicall\n');
  
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
    
    // Test: WETH deposit + approve + swap in multicall
    console.log('2. Testing WETH deposit + approve + swap in multicall...');
    
    const builder = new TransactionBuilder();
    
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
      }
    ];
    
    const UNISWAP_ROUTER_ABI = [
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
    
    const WETH_ADDRESS = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
    const DAI_ADDRESS = "0x6B175474E89094C44Da98b954EedeAC495271d0F";
    const UNISWAP_ROUTER = "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D";
    const depositAmount = parseEther("0.01");
    
    // Call 1: WETH deposit
    builder.addCall(
      WETH_ABI,
      WETH_ADDRESS,
      "deposit",
      [],
      depositAmount
    );
    
    // Call 2: WETH approve
    builder.addCall(
      ERC20_ABI,
      WETH_ADDRESS,
      "approve",
      [UNISWAP_ROUTER, depositAmount],
      0n
    );
    
    // Call 3: Uniswap swap
    const swapPath = [WETH_ADDRESS, DAI_ADDRESS];
    const deadline = Math.floor(Date.now() / 1000) + 3600;
    const minOut = 0n;
    
    builder.addCall(
      UNISWAP_ROUTER_ABI,
      UNISWAP_ROUTER,
      "swapExactTokensForTokens",
      [depositAmount, minOut, swapPath, account.address, deadline],
      0n
    );
    
    const transaction = builder.build();
    
    console.log('   Transaction details:');
    console.log(`   - Targets: ${transaction.targets.length}`);
    console.log(`   - Offsets: ${transaction.offsets.length}`);
    console.log(`   - Calldatas: ${transaction.calldatas.length}`);
    console.log(`   - msgValues: ${transaction.msgValues.length} = ${formatEther(transaction.msgValues[0])} ETH`);
    
    // MulticallScripter ABI
    const multicallScripterABI = [
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
    
    console.log('\n3. Executing multicall...');
    try {
      const executeTx = await walletClient.writeContract({
        address: multicallAddress,
        abi: multicallScripterABI,
        functionName: 'execute',
        args: [
          transaction.targets,
          transaction.offsets,
          transaction.calldatas,
          transaction.msgValues.map(v => BigInt(v))
        ],
        account,
        value: depositAmount // Send ETH to contract
      });
      
      const executeReceipt = await publicClient.waitForTransactionReceipt({ hash: executeTx });
      console.log(`   ✓ Success: ${executeReceipt.status === 'success' ? '✅' : '❌'}`);
      
      if (executeReceipt.status === 'success') {
        // Check DAI balance of our account
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
          args: [account.address]
        });
        console.log(`   Our DAI balance: ${formatEther(daiBalance)} DAI`);
        
        // Check WETH balance of MulticallScripter (should be 0 after swap)
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
      }
    } catch (error) {
      console.log(`   ✗ Failed: ${error.message}`);
      console.log(`   Error: ${error.details || error.shortMessage || 'No details'}`);
    }
    
    console.log('\n✅ Test completed.');
    
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
      console.log('\n✅ WETH deposit+approve+swap test completed.');
      process.exit(0);
    } else {
      console.error('\n❌ Failed to test WETH deposit+approve+swap.');
      process.exit(1);
    }
  });
}