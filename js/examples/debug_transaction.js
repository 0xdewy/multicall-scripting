#!/usr/bin/env node

/**
 * debug_transaction.js - Debug the execute.js transaction
 */

const { parseEther, formatEther } = require("viem");
const { createPublicClient, http } = require("viem");
const { startAnvil, stopAnvil } = require("./anvilFork.js");

async function main() {
  console.log('🔍 Debug Execute.js Transaction\n');
  
  let anvil;
  
  try {
    // Start Anvil
    anvil = await startAnvil({ port: 8545 });
    
    // Create client
    const publicClient = createPublicClient({ 
      transport: http(`http://localhost:${anvil.port}`) 
    });
    
    console.log(`🌐 Connected to fork at http://localhost:${anvil.port}\n`);
    
    // Transaction hash from execute.js output
    const txHash = "0xeb75169f3139881f887a16b66eec1eb1b8994e11dd717e3a5f16cb03c5e396c9";
    
    console.log(`1. Getting transaction ${txHash}...\n`);
    
    // Get transaction
    const tx = await publicClient.getTransaction({ hash: txHash });
    console.log(`   From: ${tx.from}`);
    console.log(`   To: ${tx.to}`);
    console.log(`   Value: ${formatEther(tx.value)} ETH`);
    console.log(`   Gas: ${tx.gas}`);
    console.log(`   Input length: ${tx.input.length} bytes`);
    
    // Get transaction receipt
    const receipt = await publicClient.getTransactionReceipt({ hash: txHash });
    console.log(`\n   Status: ${receipt.status === 'success' ? '✅ Success' : '❌ Failed'}`);
    console.log(`   Gas used: ${receipt.gasUsed}`);
    console.log(`   Logs: ${receipt.logs.length}`);
    
    // Decode logs if any
    if (receipt.logs.length > 0) {
      console.log(`\n2. Transaction logs:`);
      
      // WETH Deposit event signature
      const WETH_DEPOSIT_TOPIC = "0xe1fffcc4923d04b559f4d29a8bfc6cda04eb5b0d3c460751c2402c5c5cc9109c";
      // ERC20 Transfer event signature
      const ERC20_TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
      // ERC20 Approval event signature  
      const ERC20_APPROVAL_TOPIC = "0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925";
      
      for (let i = 0; i < Math.min(receipt.logs.length, 10); i++) {
        const log = receipt.logs[i];
        console.log(`\n   Log ${i}:`);
        console.log(`     Address: ${log.address}`);
        console.log(`     Topics: ${log.topics.length}`);
        
        if (log.topics[0] === WETH_DEPOSIT_TOPIC) {
          console.log(`     Event: WETH Deposit`);
          const depositor = '0x' + log.topics[1].slice(26);
          const amount = BigInt(log.data);
          console.log(`       Depositor: ${depositor}`);
          console.log(`       Amount: ${formatEther(amount)} ETH`);
        } else if (log.topics[0] === ERC20_TRANSFER_TOPIC) {
          console.log(`     Event: ERC20 Transfer`);
          const from = '0x' + log.topics[1].slice(26);
          const to = '0x' + log.topics[2].slice(26);
          const amount = BigInt(log.data);
          
          // Try to identify token
          let tokenName = 'Unknown';
          if (log.address.toLowerCase() === '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2') {
            tokenName = 'WETH';
            console.log(`       Token: WETH`);
            console.log(`       From: ${from}`);
            console.log(`       To: ${to}`);
            console.log(`       Amount: ${formatEther(amount)} WETH`);
          } else if (log.address.toLowerCase() === '0x6b175474e89094c44da98b954eedeac495271d0f') {
            tokenName = 'DAI';
            console.log(`       Token: DAI`);
            console.log(`       From: ${from}`);
            console.log(`       To: ${to}`);
            console.log(`       Amount: ${formatEther(amount)} DAI`);
          } else if (log.address.toLowerCase() === '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48') {
            tokenName = 'USDC';
            console.log(`       Token: USDC`);
            console.log(`       From: ${from}`);
            console.log(`       To: ${to}`);
            console.log(`       Amount: ${amount / 10n ** 6n} USDC`);
          } else {
            console.log(`       Token: ${log.address}`);
            console.log(`       From: ${from}`);
            console.log(`       To: ${to}`);
            console.log(`       Amount: ${amount}`);
          }
        } else if (log.topics[0] === ERC20_APPROVAL_TOPIC) {
          console.log(`     Event: ERC20 Approval`);
          const owner = '0x' + log.topics[1].slice(26);
          const spender = '0x' + log.topics[2].slice(26);
          const amount = BigInt(log.data);
          
          if (log.address.toLowerCase() === '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2') {
            console.log(`       Token: WETH`);
            console.log(`       Owner: ${owner}`);
            console.log(`       Spender: ${spender}`);
            console.log(`       Amount: ${formatEther(amount)} WETH`);
          } else if (log.address.toLowerCase() === '0x6b175474e89094c44da98b954eedeac495271d0f') {
            console.log(`       Token: DAI`);
            console.log(`       Owner: ${owner}`);
            console.log(`       Spender: ${spender}`);
            console.log(`       Amount: ${formatEther(amount)} DAI`);
          }
        } else {
          console.log(`     Unknown event: ${log.topics[0]}`);
        }
      }
      
      if (receipt.logs.length > 10) {
        console.log(`\n   ... and ${receipt.logs.length - 10} more logs`);
      }
    }
    
    console.log('\n✅ Transaction debug completed.');
    
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
      console.log('\n✅ Transaction debug completed.');
      process.exit(0);
    } else {
      console.error('\n❌ Failed to debug transaction.');
      process.exit(1);
    }
  });
}