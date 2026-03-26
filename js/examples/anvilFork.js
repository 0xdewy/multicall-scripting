#!/usr/bin/env node

/**
 * anvilFork.js - Connect to Anvil with mainnet fork
 * 
 * Usage:
 * const { connectToAnvil, stopAnvil } = require('./anvilFork.js');
 * 
 * // Connect to Anvil (starts new one if not running)
 * const anvil = await connectToAnvil({ port: 8545 });
 * 
 * // Stop Anvil (only if we started it)
 * await stopAnvil(anvil);
 */

const { spawn } = require('child_process');
const { createPublicClient, http } = require('viem');

// Check if Anvil is already running on a port
async function isAnvilRunning(port = 8545) {
  try {
    const client = createPublicClient({
      transport: http(`http://localhost:${port}`)
    });
    
    // Try to get chain ID (Anvil-specific check)
    const chainId = await client.getChainId();
    
    // Anvil typically runs with chain ID 1 (mainnet fork) or 31337
    if (chainId === 1n || chainId === 31337n) {
      console.log(`✅ Found existing Anvil on port ${port} (chain ID: ${chainId})`);
      return true;
    }
  } catch (error) {
    // Connection failed, Anvil is not running
    return false;
  }
  return false;
}

async function connectToAnvil(options = {}) {
  const port = options.port || 8545;
  const rpcUrl = options.rpcUrl || 'https://eth.drpc.org';
  
  // Check if Anvil is already running
  const isRunning = await isAnvilRunning(port);
  
  if (isRunning) {
    console.log(`🔗 Connecting to existing Anvil on port ${port}`);
    return {
      process: null, // We didn't start this process
      port,
      rpcUrl,
      stop: () => {
        console.log('⚠️  Not stopping Anvil (connected to existing instance)');
        return Promise.resolve();
      },
      startedByUs: false
    };
  }
  
  // Start new Anvil instance
  console.log(`🚀 Starting new Anvil on port ${port} (forking ${rpcUrl})`);
  
  const anvil = spawn('anvil', [
    '--fork-url', rpcUrl,
    '--port', port.toString(),
    '--chain-id', '1',
    '--silent',
    '--gas-limit', '300000000',
    '--steps-tracing'  // Enable transaction tracing
  ]);
  
  // Capture stderr for debugging
  anvil.stderr.on('data', (data) => {
    const message = data.toString().trim();
    if (message && !message.includes('Listening on')) {
      console.error(`Anvil stderr: ${message}`);
    }
  });
  
  // Wait for Anvil to start
  let attempts = 0;
  const maxAttempts = 10;
  
  while (attempts < maxAttempts) {
    try {
      const client = createPublicClient({
        transport: http(`http://localhost:${port}`)
      });
      await client.getChainId();
      break; // Successfully connected
    } catch (error) {
      attempts++;
      if (attempts >= maxAttempts) {
        throw new Error(`Failed to start Anvil after ${maxAttempts} attempts: ${error.message}`);
      }
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  
  console.log(`✅ Anvil started on http://localhost:${port}`);
  
  return {
    process: anvil,
    port,
    rpcUrl,
    stop: () => stopAnvil(anvil),
    startedByUs: true
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

// If run directly, connect to Anvil
if (require.main === module) {
  connectToAnvil().then(anvil => {
    if (anvil.startedByUs) {
      console.log('\nAnvil running. Press Ctrl+C to stop.');
      
      process.on('SIGINT', async () => {
        await stopAnvil(anvil.process);
        process.exit(0);
      });
    } else {
      console.log('\nConnected to existing Anvil. Press Ctrl+C to exit.');
      process.on('SIGINT', () => {
        console.log('Exiting (Anvil remains running)');
        process.exit(0);
      });
    }
  }).catch(console.error);
}

module.exports = { connectToAnvil, stopAnvil, startAnvil: connectToAnvil }; // Keep backward compatibility