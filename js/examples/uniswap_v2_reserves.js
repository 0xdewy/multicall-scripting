/**
 * Example: Read Uniswap V2 reserves and use individual fields in a downstream call.
 *
 * getReserves() returns a struct (reserve0, reserve1, blockTimestampLast).
 * This example shows how to access struct fields as descriptors and pass them
 * to a subsequent call — here, a hypothetical amountIn calculation.
 *
 * Partial return is used automatically when only some fields of the struct
 * are needed: only the accessed fields are copied into the next call's calldata.
 */

import { TransactionBuilder } from "../index.js";

const UNISWAP_V2_PAIR_ABI = [
  {
    type: "function",
    name: "getReserves",
    inputs: [],
    outputs: [
      { name: "reserve0", type: "uint112" },
      { name: "reserve1", type: "uint112" },
      { name: "blockTimestampLast", type: "uint32" },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "swap",
    inputs: [
      { name: "amount0Out", type: "uint256" },
      { name: "amount1Out", type: "uint256" },
      { name: "to", type: "address" },
      { name: "data", type: "bytes" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
];

// A simple price oracle ABI — this contract uses on-chain reserves to compute amountOut
const ORACLE_ABI = [
  {
    type: "function",
    name: "getAmountOut",
    inputs: [
      { name: "amountIn", type: "uint256" },
      { name: "reserveIn", type: "uint112" },
      { name: "reserveOut", type: "uint112" },
    ],
    outputs: [{ name: "amountOut", type: "uint256" }],
    stateMutability: "pure",
  },
];

// TODO: replace with real addresses before submitting
const PAIR_ADDRESS   = "0xB4e16d0168e52d35CaCD2c6185b44281Ec28C9Dc"; // USDC/WETH pair on mainnet
const ORACLE_ADDRESS = "0x0000000000000000000000000000000000000001"; // replace with oracle
const RECIPIENT      = "0x0000000000000000000000000000000000000002"; // replace with recipient
const AMOUNT_IN = 1_000_000n; // 1 USDC (6 decimals)

const builder = new TransactionBuilder();

// Step 1: get reserves — multiple outputs are returned as an array of descriptors
const [reserve0, reserve1] = builder.addCall(UNISWAP_V2_PAIR_ABI, PAIR_ADDRESS, "getReserves", []);

// Step 2: compute amountOut using the on-chain oracle, piping reserve0/reserve1
// Only the two slots are needed, so only those are copied into the next call's calldata
const amountOut = builder.addCall(ORACLE_ABI, ORACLE_ADDRESS, "getAmountOut", [
  AMOUNT_IN,
  reserve0,
  reserve1,
]);

// Step 3: execute the swap using the computed amountOut
// amount0Out = 0 (we're selling token0), amount1Out = computed value
builder.addCall(UNISWAP_V2_PAIR_ABI, PAIR_ADDRESS, "swap", [
  0n,          // amount0Out
  amountOut,   // amount1Out — wired from oracle's return value
  RECIPIENT,
  "0x",        // empty bytes (no flash loan callback)
]);

const { targets, offsets, calldatas, msgValues } = builder.build();

console.log("Swap calldata (read reserves → compute amountOut → swap, atomic):");
console.log("  targets:   ", targets);
console.log("  offsets:   ", offsets.map(o => "0x" + o.toString(16)));
console.log("  calldatas: ", calldatas);
console.log("  msgValues: ", msgValues);
