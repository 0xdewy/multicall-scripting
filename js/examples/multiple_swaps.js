/** ETH → WETH → DAI (Uniswap V2) → USDC (Curve 3pool) → recipient.
 * Used by `script/rehearse.sh`. The caller supplies deadline and slippage bounds.
 */
import { TransactionBuilder } from "../index.js";

export const A = {
  WETH: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
  DAI: "0x6B175474E89094C44Da98b954EedeAC495271d0F",
  USDC: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
  UNISWAP_V2_ROUTER: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D",
  CURVE_3POOL: "0xbEbc44782C7dB0a1A60Cb6fe97d0b483032FF1C7",
};

export const ERC20 = [
  { type: "function", name: "approve", stateMutability: "nonpayable", inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ type: "bool" }] },
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "account", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "transfer", stateMutability: "nonpayable", inputs: [{ name: "to", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ type: "bool" }] },
];
export const WETH = [{ type: "function", name: "deposit", stateMutability: "payable", inputs: [], outputs: [] }];
export const ROUTER = [{
  type: "function", name: "swapExactTokensForTokens", stateMutability: "nonpayable",
  inputs: [{ name: "amountIn", type: "uint256" }, { name: "amountOutMin", type: "uint256" }, { name: "path", type: "address[]" }, { name: "to", type: "address" }, { name: "deadline", type: "uint256" }],
  outputs: [{ name: "amounts", type: "uint256[]" }],
}];
export const CURVE = [{
  type: "function", name: "exchange", stateMutability: "nonpayable",
  inputs: [{ name: "i", type: "int128" }, { name: "j", type: "int128" }, { name: "dx", type: "uint256" }, { name: "min_dy", type: "uint256" }],
  outputs: [{ type: "uint256" }],
}];

export function buildBatch(executor, recipient, ethIn, deadline, minDai, minUsdc) {
  const b = new TransactionBuilder();

  b.addCall(WETH, A.WETH, "deposit", [], ethIn);
  b.addCall(ERC20, A.WETH, "approve", [A.UNISWAP_V2_ROUTER, ethIn]);
  b.addCall(ROUTER, A.UNISWAP_V2_ROUTER, "swapExactTokensForTokens", [ethIn, minDai, [A.WETH, A.DAI], executor, deadline]);

  const daiForApproval = b.addCall(ERC20, A.DAI, "balanceOf", [executor]);
  b.addCall(ERC20, A.DAI, "approve", [A.CURVE_3POOL, daiForApproval]);
  b.addCall(CURVE, A.CURVE_3POOL, "exchange", [0n, 1n, daiForApproval, minUsdc]);

  const usdcOut = b.addCall(ERC20, A.USDC, "balanceOf", [executor]);
  b.addCall(ERC20, A.USDC, "transfer", [recipient, usdcOut]);

  return b.build();
}
