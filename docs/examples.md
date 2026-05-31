<!-- agentify: generated 2026-05-31 | score-before: 0 | source: 1.3.0 -->
# Example Strategies

Working JavaScript scripts demonstrating common usage patterns. Each example
shows a specific strategy built with the TransactionBuilder. Run them with Bun:

```bash
cd js/examples && bun run <script>.js
```

## Key Files

| File | What it demonstrates |
|------|---------------------|
| `js/examples/erc20_balance_transfer.js` | Read an ERC20 balance, then transfer that amount — the simplest descriptor chaining pattern |
| `js/examples/approve_and_deposit.js` | Approve token spending, then deposit to a vault — state-changing call followed by dependent state-changing call |
| `js/examples/multiple_swaps.js` | Multi-hop swap routing: read reserves, compute swap amounts, execute swaps across multiple DEXes |
| `js/examples/uniswap_v2_reserves.js` | Read Uniswap V2 pair reserves via static call, chain reserve data into subsequent calls |
| `js/examples/anvilFork.js` | Fork testing with Anvil — execute strategies against mainnet state |
| `js/examples/helpers.js` | Shared utilities: token approvals, contract wrappers, amount parsing |
| `js/examples/abis.js` | ABI definitions for common contracts (ERC20, Uniswap V2, Aave) |

## Common Patterns in Examples

### Basic balance-read-then-transfer
```javascript
const balance = builder.addCall(ERC20_ABI, token, "balanceOf", [user]);
builder.addCall(ERC20_ABI, token, "transfer", [recipient, balance]);
```
The simplest descriptor chaining: static call returns a value, that value becomes an argument to a subsequent state-changing call.

### Multi-step with struct fields
```javascript
const accountData = builder.addCall(aaveABI, pool, "getUserAccountData", [user]);
builder.addCall(aaveABI, pool, "borrow", [
  dai,
  accountData.availableBorrowsBase,  // struct field access
  2, 0, user
]);
```

### Dynamic type with with_length
```javascript
const names = builder.addCall(abi, registry, "getNames", []);
names.with_length(3);  // array of 3 items
builder.addCall(abi, registry, "setFirst", [names[0]]);  // index access
```

## Gotchas

- **Examples assume a running Anvil fork** (`run_anvil.sh` starts one) — they connect to `localhost:8545` via ethers or viem
- **ABI files in `js/examples/abis.js`** are hand-curated for the specific protocols used; add ABIs as needed
- **Amounts may be mainnet-dependent** — examples work against forked state; adjust addresses and amounts for different chains
- **Not all examples include value transfers** — check `msgValues` in the built output before sending ETH

## See Also

- Full TransactionBuilder API → [docs/javascript.md](javascript.md)
- Test patterns → [docs/testing.md](testing.md)
- Architecture overview → [docs/OVERVIEW.md](OVERVIEW.md)
