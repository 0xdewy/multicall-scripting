/**
 * Example: Approve → deposit → read resulting balance, all in one atomic transaction.
 *
 * This shows a mixed batch: two state-changing calls (approve, deposit) followed
 * by a static call (balanceOf) that reads the resulting state. The static call's
 * return value could be piped into a subsequent call, but here we just include it
 * to confirm the deposit landed.
 *
 * Note: return values from state-changing calls (approve, deposit) cannot currently
 * be chained into subsequent calls — only static call outputs support chaining.
 */

import { TransactionBuilder } from "../index.js";

const ERC20_ABI = [
  {
    type: "function",
    name: "approve",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "balanceOf",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
];

// Minimal Aave-style lending pool ABI
const LENDING_POOL_ABI = [
  {
    type: "function",
    name: "deposit",
    inputs: [
      { name: "asset", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "onBehalfOf", type: "address" },
      { name: "referralCode", type: "uint16" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
];

const ATOKEN_ABI = [
  {
    type: "function",
    name: "balanceOf",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
];

// TODO: replace with real addresses before submitting
const USDC      = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const AAVE_POOL = "0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2"; // Aave v3 mainnet
const AUSDC     = "0x98C23E9d8f34FEFb1B7BD6a91B7FF122F4e16F5c"; // aUSDC v3 mainnet
const USER      = "0x0000000000000000000000000000000000000001"; // replace with your address

const DEPOSIT_AMOUNT = 1_000_000n; // 1 USDC

const builder = new TransactionBuilder();

// Step 1: approve the pool to spend USDC
builder.addCall(ERC20_ABI, USDC, "approve", [AAVE_POOL, DEPOSIT_AMOUNT]);

// Step 2: deposit into Aave
builder.addCall(LENDING_POOL_ABI, AAVE_POOL, "deposit", [
  USDC,
  DEPOSIT_AMOUNT,
  USER,
  0, // referralCode
]);

// Step 3: read the resulting aUSDC balance (static call — output could be chained further)
const aTokenBalance = builder.addCall(ATOKEN_ABI, AUSDC, "balanceOf", [USER]);

// aTokenBalance is a descriptor and could be passed to another builder.addCall() here.
// For this example we just build and inspect the calldata.
void aTokenBalance;

const { targets, offsets, calldatas, msgValues } = builder.build();

console.log("approve → deposit → balanceOf (atomic):");
console.log("  targets:   ", targets);
console.log("  offsets:   ", offsets.map(o => "0x" + o.toString(16)));
console.log("  calldatas: ", calldatas);
console.log("  msgValues: ", msgValues);
