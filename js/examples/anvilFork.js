#!/usr/bin/env node

/**
 * anvilFork.js - Start Anvil with mainnet fork
 * 
 * Usage:
 * const { startAnvil, stopAnvil } = require('./anvilFork.js');
 * 
 * // Start Anvil
 * const anvil = await startAnvil({ port: 8545 });
 * 
 * // Stop Anvil  
 * await stopAnvil(anvil);
 */

const { spawn } = require('child_process');

async function startAnvil(options = {}) {
  const port = options.port || 8545;
  const rpcUrl = options.rpcUrl || 'https://eth.drpc.org';
  
  console.log(`🚀 Starting Anvil on port ${port} (forking ${rpcUrl})`);
  
  const anvil = spawn('anvil', [
    '--fork-url', rpcUrl,
    '--port', port.toString(),
    '--chain-id', '1',
    '--silent'
  ]);
  
  // Wait for Anvil to start
  await new Promise(resolve => setTimeout(resolve, 3000));
  
  console.log(`✅ Anvil started on http://localhost:${port}`);
  
  return {
    process: anvil,
    port,
    rpcUrl,
    stop: () => stopAnvil(anvil)
  };
}

async function stopAnvil(anvilProcess) {
  if (!anvilProcess) return;
  
  console.log('🛑 Stopping Anvil...');
  anvilProcess.kill('SIGTERM');
  
  // Wait for process to exit
  await new Promise(resolve => {
    anvilProcess.on('close', resolve);
    setTimeout(resolve, 1000);
  });
  
  console.log('✅ Anvil stopped');
}

// If run directly, start Anvil
if (require.main === module) {
  startAnvil().then(anvil => {
    console.log('\nAnvil running. Press Ctrl+C to stop.');
    
    process.on('SIGINT', async () => {
      await stopAnvil(anvil.process);
      process.exit(0);
    });
  }).catch(console.error);
}

module.exports = { startAnvil, stopAnvil };