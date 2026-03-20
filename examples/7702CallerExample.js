#!/usr/bin/env node

/**
 * Example: Using 7702Caller with the TransactionBuilder
 * 
 * This shows how to create a batch transaction for the 7702Caller smart wallet
 * that can be executed by an authorized signer or through EIP-7702 authorization.
 */

const { TransactionBuilder } = require("../js/index.js");
const { loadABI } = require("../js/test/common.js");
const fs = require("fs");

// Example ABI for 7702Caller (would need to be generated from compilation)
// For this example, we'll use a mock ABI
const mock7702CallerABI = [
  {
    "type": "function",
    "name": "execute",
    "inputs": [
      {"name": "targets", "type": "address[]"},
      {"name": "offsets", "type": "uint256[]"},
      {"name": "calldatas", "type": "bytes[]"},
      {"name": "values", "type": "uint256[]"}
    ],
    "outputs": [],
    "stateMutability": "payable"
  },
  {
    "type": "function",
    "name": "executeCall",
    "inputs": [
      {"name": "target", "type": "address"},
      {"name": "value", "type": "uint256"},
      {"name": "data", "type": "bytes"}
    ],
    "outputs": [{"name": "", "type": "bytes"}],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "withdrawETH",
    "inputs": [
      {"name": "to", "type": "address"},
      {"name": "amount", "type": "uint256"}
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  }
];

function create7702CallerTransaction() {
  const builder = new TransactionBuilder();
  
  // Address of the 7702Caller contract
  const callerAddress = "0x0000000000000000000000000000000000000000"; // Replace with actual address
  
  // Example 1: Execute a single call through the wallet
  console.log("Example 1: Single call through 7702Caller");
  
  const targetContract = "0x742d35Cc6634C0532925a3b844Bc9e90F1b6f1d8"; // Example target
  const callValue = BigInt(0);
  const callData = "0x12345678"; // Example calldata
  
  builder.addCall(
    mock7702CallerABI,
    callerAddress,
    "executeCall",
    [targetContract, callValue, callData],
    BigInt(0)
  );
  
  const result1 = builder.build();
  console.log("Single call transaction:", JSON.stringify({
    targets: result1.targets,
    offsets: result1.offsets.map(o => o.toString()),
    calldatas: result1.calldatas,
    msgValues: result1.msgValues.map(v => Number(v))
  }, null, 2));
  
  // Reset builder for next example
  const builder2 = new TransactionBuilder();
  
  // Example 2: Batch execute through 7702Caller
  console.log("\nExample 2: Batch execute through 7702Caller");
  
  // Create a batch of calls to be executed by 7702Caller
  const targets = [
    "0x742d35Cc6634C0532925a3b844Bc9e90F1b6f1d8", // Target 1
    "0x742d35Cc6634C0532925a3b844Bc9e90F1b6f1d8"  // Target 2
  ];
  
  // We need to encode the offsets properly for MulticallScripter
  // For regular calls with no return data: CALL_FLAG (0xFE) << 248
  const callOffset = BigInt("0xFE00000000000000000000000000000000000000000000000000000000000000");
  
  const offsets = [callOffset, callOffset];
  
  const calldatas = [
    "0x12345678", // Call data for target 1
    "0x87654321"  // Call data for target 2
  ];
  
  const values = [BigInt(0), BigInt(0)];
  
  builder2.addCall(
    mock7702CallerABI,
    callerAddress,
    "execute",
    [targets, offsets, calldatas, values],
    BigInt(0)
  );
  
  const result2 = builder2.build();
  console.log("Batch execute transaction:", JSON.stringify({
    targets: result2.targets,
    offsets: result2.offsets.map(o => o.toString()),
    calldatas: result2.calldatas,
    msgValues: result2.msgValues.map(v => Number(v))
  }, null, 2));
  
  // Example 3: Complex workflow with return data usage
  console.log("\nExample 3: Complex workflow (conceptual)");
  console.log("A 7702Caller could:");
  console.log("1. Call a DEX to swap tokens");
  console.log("2. Use the return data (amount received) in a subsequent call");
  console.log("3. Deposit the tokens into a lending protocol");
  console.log("4. All in a single transaction with EIP-7702 authorization");
  
  console.log("\nThe JavaScript library supports:");
  console.log("- Creating complex transaction batches");
  console.log("- Using return values from previous calls");
  console.log("- Struct/tuple return value access (e.g., retStruct.nested.field)");
  console.log("- Integration with EIP-7702 signed authorizations");
}

if (require.main === module) {
  create7702CallerTransaction();
}

module.exports = { create7702CallerTransaction };