/**
 * Example: Read balance and transfer it in one atomic transaction.
 *
 * This demonstrates the most fundamental use of TransactionBuilder:
 * the return value of one call (balanceOf) is passed directly as
 * an argument to the next (transfer), without any off-chain reads.
 *
 * The two calls execute atomically — if transfer reverts, balanceOf
 * also rolls back.
 */

import { TransactionBuilder } from "../index.js";

// Minimal ERC-20 ABI — only the functions we use
const ERC20_ABI = [
  {
    type: "function",
    name: "balanceOf",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "transfer",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "nonpayable",
  },
];

// TODO: replace with real addresses before submitting
const TOKEN_ADDRESS = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"; // USDC on mainnet
const SENDER    = "0x0000000000000000000000000000000000000001"; // replace with sender
const RECIPIENT = "0x0000000000000000000000000000000000000002"; // replace with recipient

const builder = new TransactionBuilder();

// Step 1: read balance — returns a descriptor, not an actual value
const balance = builder.addCall(ERC20_ABI, TOKEN_ADDRESS, "balanceOf", [SENDER]);

// Step 2: transfer that exact balance — `balance` is wired at execution time
builder.addCall(ERC20_ABI, TOKEN_ADDRESS, "transfer", [RECIPIENT, balance]);

// build() produces the four arrays expected by MulticallScripter.execute()
const { targets, offsets, calldatas, msgValues } = builder.build();

console.log("Calldata ready to submit to MulticallScripter.execute():");
console.log("  targets:   ", targets);
console.log("  offsets:   ", offsets.map(o => "0x" + o.toString(16)));
console.log("  calldatas: ", calldatas);
console.log("  msgValues: ", msgValues);

// To actually execute, call:
//   await multicallScripter.execute(targets, offsets, calldatas, msgValues)
// where multicallScripter is a viem contract instance pointing to the deployed MulticallScripter.
