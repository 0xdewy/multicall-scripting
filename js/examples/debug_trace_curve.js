#!/usr/bin/env node

/**
 * debug_trace_curve.js - Debug Curve pool with transaction tracing
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
  }
];

// MulticallScripter ABI
function getMulticallScripterABI() {
  const fs = require('fs');
  const path = require('path');
  const abiPath = path.join(__dirname, '../../out/MulticallScripter.sol/MulticallScripter.json');
  const data = JSON.parse(fs.readFileSync(abiPath, 'utf8'));
  return data.abi;
}

async function traceTransaction(rpcUrl, txHash) {
  try {
    const response = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'debug_traceTransaction',
        params: [txHash, { tracer: 'callTracer' }]
      })
    });
    
    const result = await response.json();
    return result;
  } catch (error) {
    console.log('Trace failed:', error.message);
    return null;
  }
}

async function testEachCallIndividually(walletClient, multicallAddress, publicClient, account) {
  console.log('\n🔍 Testing each call individually...');
  
  const amount = parseEther("0.001");
  const deadline = Math.floor(Date.now() / 1000) + 3600;
  
  // Test 1: WETH deposit
  console.log('1. Testing WETH deposit...');
  const builder1 = new TransactionBuilder();
  builder1.addCall(
    [{ type: "function", name: "deposit", inputs: [], outputs: [], stateMutability: "payable" }],
    ADDRESSES.WETH,
    "deposit",
    [],
    amount
  );
  
  const tx1 = builder1.build();
  try {
    const hash1 = await walletClient.writeContract({
      address: multicallAddress,
      abi: getMulticallScripterABI(),
      functionName: 'execute',
      args: [tx1.targets, tx1.offsets, tx1.calldatas, tx1.msgValues.map(v => BigInt(v))],
      account,
      value: amount
    });
    const receipt1 = await publicClient.waitForTransactionReceipt({ hash: hash1 });
    console.log(`   ✅ WETH deposit: ${receipt1.status === 'success' ? 'Success' : 'Failed'}`);
  } catch (error) {
    console.log(`   ❌ WETH deposit failed: ${error.message}`);
  }
  
  // Test 2: WETH approve
  console.log('2. Testing WETH approve...');
  const builder2 = new TransactionBuilder();
  builder2.addCall(
    ERC20_ABI,
    ADDRESSES.WETH,
    "approve",
    [ADDRESSES.UNISWAP_V2_ROUTER, amount],
    0n
  );
  
  const tx2 = builder2.build();
  try {
    const hash2 = await walletClient.writeContract({
      address: multicallAddress,
      abi: getMulticallScripterABI(),
      functionName: 'execute',
      args: [tx2.targets, tx2.offsets, tx2.calldatas, tx2.msgValues.map(v => BigInt(v))],
      account
    });
    const receipt2 = await publicClient.waitForTransactionReceipt({ hash: hash2 });
    console.log(`   ✅ WETH approve: ${receipt2.status === 'success' ? 'Success' : 'Failed'}`);
  } catch (error) {
    console.log(`   ❌ WETH approve failed: ${error.message}`);
  }
  
  // Test 3: Uniswap swap
  console.log('3. Testing Uniswap swap...');
  const builder3 = new TransactionBuilder();
  builder3.addCall(
    [{
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
    }],
    ADDRESSES.UNISWAP_V2_ROUTER,
    "swapExactTokensForTokens",
    [amount, 0n, [ADDRESSES.WETH, ADDRESSES.DAI], account.address, deadline],
    0n
  );
  
  const tx3 = builder3.build();
  try {
    const hash3 = await walletClient.writeContract({
      address: multicallAddress,
      abi: getMulticallScripterABI(),
      functionName: 'execute',
      args: [tx3.targets, tx3.offsets, tx3.calldatas, tx3.msgValues.map(v => BigInt(v))],
      account
    });
    const receipt3 = await publicClient.waitForTransactionReceipt({ hash: hash3 });
    console.log(`   ✅ Uniswap swap: ${receipt3.status === 'success' ? 'Success' : 'Failed'}`);
  } catch (error) {
    console.log(`   ❌ Uniswap swap failed: ${error.message}`);
  }
  
  // Test 4: DAI approve for Curve
  console.log('4. Testing DAI approve for Curve...');
  const builder4 = new TransactionBuilder();
  builder4.addCall(
    ERC20_ABI,
    ADDRESSES.DAI,
    "approve",
    [ADDRESSES.CURVE_DAI_USDC_USDT_POOL, amount],
    0n
  );
  
  const tx4 = builder4.build();
  try {
    const hash4 = await walletClient.writeContract({
      address: multicallAddress,
      abi: getMulticallScripterABI(),
      functionName: 'execute',
      args: [tx4.targets, tx4.offsets, tx4.calldatas, tx4.msgValues.map(v => BigInt(v))],
      account
    });
    const receipt4 = await publicClient.waitForTransactionReceipt({ hash: hash4 });
    console.log(`   ✅ DAI approve: ${receipt4.status === 'success' ? 'Success' : 'Failed'}`);
  } catch (error) {
    console.log(`   ❌ DAI approve failed: ${error.message}`);
  }
  
  // Test 5: Curve swap
  console.log('5. Testing Curve swap...');
  const builder5 = new TransactionBuilder();
  builder5.addCall(
    CURVE_POOL_ABI,
    ADDRESSES.CURVE_DAI_USDC_USDT_POOL,
    "exchange",
    [0, 1, amount, 0n],
    0n
  );
  
  const tx5 = builder5.build();
  try {
    const hash5 = await walletClient.writeContract({
      address: multicallAddress,
      abi: getMulticallScripterABI(),
      functionName: 'execute',
      args: [tx5.targets, tx5.offsets, tx5.calldatas, tx5.msgValues.map(v => BigInt(v))],
      account
    });
    const receipt5 = await publicClient.waitForTransactionReceipt({ hash: hash5 });
    console.log(`   ✅ Curve swap: ${receipt5.status === 'success' ? 'Success' : 'Failed'}`);
    
    if (receipt5.status !== 'success') {
      // Try to get trace
      const trace = await traceTransaction(`http://localhost:${walletClient.transport.url?.host?.split(':')[1] || '8545'}`, hash5);
      if (trace?.result) {
        console.log('   Trace:', JSON.stringify(trace.result, null, 2));
      }
    }
  } catch (error) {
    console.log(`   ❌ Curve swap failed: ${error.message}`);
    
    // Check Curve pool state
    console.log('\n🔍 Checking Curve pool state...');
    try {
      // Check pool coins
      const coin0 = await publicClient.readContract({
        address: ADDRESSES.CURVE_DAI_USDC_USDT_POOL,
        abi: CURVE_POOL_ABI,
        functionName: 'coins',
        args: [0]
      });
      
      const coin1 = await publicClient.readContract({
        address: ADDRESSES.CURVE_DAI_USDC_USDT_POOL,
        abi: CURVE_POOL_ABI,
        functionName: 'coins',
        args: [1]
      });
      
      console.log(`   Coin 0: ${coin0} (expected DAI: ${ADDRESSES.DAI})`);
      console.log(`   Coin 1: ${coin1} (expected USDC: ${ADDRESSES.USDC})`);
      
      // Check balances
      const balance0 = await publicClient.readContract({
        address: ADDRESSES.CURVE_DAI_USDC_USDT_POOL,
        abi: CURVE_POOL_ABI,
        functionName: 'balances',
        args: [0]
      });
      
      const balance1 = await publicClient.readContract({
        address: ADDRESSES.CURVE_DAI_USDC_USDT_POOL,
        abi: CURVE_POOL_ABI,
        functionName: 'balances',
        args: [1]
      });
      
      console.log(`   DAI balance in pool: ${formatEther(balance0)}`);
      console.log(`   USDC balance in pool: ${balance1 / 10n ** 6n}`);
      
      // Check if we have DAI
      const daiBalance = await publicClient.readContract({
        address: ADDRESSES.DAI,
        abi: ERC20_ABI,
        functionName: 'balanceOf',
        args: [account.address]
      });
      
      console.log(`   Our DAI balance: ${formatEther(daiBalance)}`);
      
    } catch (poolError) {
      console.log(`   Failed to check pool: ${poolError.message}`);
    }
  }
}

async function main() {
  console.log('🔍 Debug Curve Pool with Tracing\n');
  
  let anvil;
  
  try {
    // Start Anvil with tracing enabled
    anvil = await startAnvil({ 
      port: 8560,
      args: ['--steps-tracing']
    });
    
    const rpcUrl = `http://localhost:${anvil.port}`;
    
    // Create clients
    const publicClient = createPublicClient({ 
      transport: http(rpcUrl) 
    });
    
    const walletClient = createWalletClient({
      transport: http(rpcUrl),
      account: privateKeyToAccount("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80")
    });
    
    const account = walletClient.account;
    
    console.log(`👤 Account: ${account.address}`);
    console.log(`🌐 RPC URL: ${rpcUrl}\n`);
    
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
    
    // Test each call individually
    await testEachCallIndividually(walletClient, multicallAddress, publicClient, account);
    
    // Now test the full transaction
    console.log('\n🔍 Testing full transaction...');
    
    const builder = new TransactionBuilder();
    const amount = parseEther("0.001");
    const deadline = Math.floor(Date.now() / 1000) + 3600;
    
    // Step 1: WETH deposit
    builder.addCall(
      [{ type: "function", name: "deposit", inputs: [], outputs: [], stateMutability: "payable" }],
      ADDRESSES.WETH,
      "deposit",
      [],
      amount
    );
    
    // Step 2: WETH approve
    builder.addCall(
      ERC20_ABI,
      ADDRESSES.WETH,
      "approve",
      [ADDRESSES.UNISWAP_V2_ROUTER, amount],
      0n
    );
    
    // Step 3: Uniswap swap
    builder.addCall(
      [{
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
      }],
      ADDRESSES.UNISWAP_V2_ROUTER,
      "swapExactTokensForTokens",
      [amount, 0n, [ADDRESSES.WETH, ADDRESSES.DAI], account.address, deadline],
      0n
    );
    
    // Step 4: DAI approve for Curve
    builder.addCall(
      ERC20_ABI,
      ADDRESSES.DAI,
      "approve",
      [ADDRESSES.CURVE_DAI_USDC_USDT_POOL, amount],
      0n
    );
    
    // Step 5: Curve swap
    builder.addCall(
      CURVE_POOL_ABI,
      ADDRESSES.CURVE_DAI_USDC_USDT_POOL,
      "exchange",
      [0, 1, amount, 0n],
      0n
    );
    
    const transaction = builder.build();
    console.log(`   Built transaction with ${transaction.targets.length} calls`);
    
    try {
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
        value: amount
      });
      
      console.log(`   Transaction hash: ${executeHash}`);
      
      const receipt = await publicClient.waitForTransactionReceipt({ hash: executeHash });
      console.log(`   Status: ${receipt.status === 'success' ? '✅ Success' : '❌ Failed'}`);
      
      if (receipt.status !== 'success') {
        console.log('\n🔍 Getting transaction trace...');
        const trace = await traceTransaction(rpcUrl, executeHash);
        if (trace?.result) {
          console.log('Trace result (simplified):');
          // Try to find the failing call in the trace
          function findFailingCall(trace) {
            if (trace.error) {
              return trace;
            }
            if (trace.calls) {
              for (const call of trace.calls) {
                const failing = findFailingCall(call);
                if (failing) return failing;
              }
            }
            return null;
          }
          
          const failingCall = findFailingCall(trace.result);
          if (failingCall) {
            console.log('Failing call:', JSON.stringify(failingCall, null, 2));
          } else {
            console.log('Full trace:', JSON.stringify(trace.result, null, 2));
          }
        }
      }
      
    } catch (error) {
      console.log(`   ❌ Transaction failed: ${error.message}`);
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
      console.log('\n✅ Debug completed.');
      process.exit(0);
    } else {
      console.error('\n❌ Debug failed.');
      process.exit(1);
    }
  });
}