# multicall-scripting

[![License: GPL3](https://img.shields.io/badge/License-GPL3-blue.svg)](LICENSE)
[![Solidity](https://img.shields.io/badge/Solidity-^0.8.28-363636?logo=solidity)](https://soliditylang.org/)
[![Foundry](https://img.shields.io/badge/Built%20with-Foundry-FF6C37?logo=ethereum)](https://getfoundry.sh/)

Execute complex multi-contract strategies in a single atomic transaction with full return value chaining between calls.

## The problem

Regular multicall (like Multicall3) only batches independent calls — it can't use the return value from one call as an argument to the next within the same transaction. The usual workarounds are writing a custom contract per strategy, or splitting into multiple transactions. Both approaches add friction and break atomicity.

Multicall Scripting solves this by precalculating memory offsets offchain and using the `mcopy` opcode to copy return data directly into subsequent call arguments at execution time.

## Components

- **`MulticallScripter.sol`** — core execution contract. Accepts a batch of calls with encoded offset metadata and runs them in sequence, writing return data to the locations specified by the offsets.
- **`CallBuilder.sol`** — Solidity DSL for building call chains in tests.
- **`TransactionBuilder` (JS)** — builds the call batch, encodes offsets, and returns ABI-encoded arguments ready for `execute()`.
- **Descriptors** — proxy objects returned by `addCall()`. Pass them as arguments to subsequent calls to express data dependencies.

## Quick start

```bash
git clone https://github.com/0xdewy/multicall-scripting
cd multicall-scripting

# JS library
cd js && bun install

# Solidity (requires Foundry)
curl -L https://foundry.paradigm.xyz | bash && foundryup
forge install
```

### Read a balance, then transfer it

```javascript
import { TransactionBuilder } from "./js/index.js";

const builder = new TransactionBuilder();

// addCall returns a descriptor for the return value
const balance = builder.addCall(ERC20_ABI, tokenAddress, "balanceOf", [userAddress]);

// pass the descriptor as an argument — the actual value is wired at execution time
builder.addCall(ERC20_ABI, tokenAddress, "transfer", [recipientAddress, balance]);

const { targets, offsets, calldatas, msgValues } = builder.build();
await multicallScripter.execute(targets, offsets, calldatas, msgValues);
```

### Struct field access

```javascript
// getUser() returns a struct; access its fields directly as descriptors
const user = builder.addCall(aaveABI, pool, "getUserAccountData", [userAddress]);

builder.addCall(aaveABI, pool, "borrow", [
  daiAddress,
  user.availableBorrowsBase,
  2,
  0,
  userAddress,
]);
```

### Dynamic types

Dynamic types (strings, bytes, dynamic arrays) require calling `.with_length(n)` before use so the builder can calculate the memory layout:

```javascript
const text = builder.addCall(abi, target, "getName", []);
text.with_length(24); // expected byte length of the returned string

builder.addCall(abi, target, "setName", [text]);
```

Array elements can be accessed by index after `.with_length()`:

```javascript
const addresses = builder.addCall(abi, target, "getOwners", []);
addresses.with_length(3);

builder.addCall(abi, target, "transfer", [addresses[0], amount]);
```

## How it works

The JavaScript builder tracks a virtual memory layout as you add calls. When you pass a descriptor as an argument, the builder records where in memory the source call's return data should land and what slice of the destination call's calldata it should overwrite. This produces a compact 256-bit offset per call that encodes the copy instructions.

At execution time, `MulticallScripter.execute()` copies all calldata into memory up front, then executes each call in order. After each static call, it copies the specified slices of return data to the specified memory locations (into the calldata of later calls) using `mcopy`. State-changing calls use the same layout but don't support output chaining yet.

## API

### `TransactionBuilder`

```javascript
import { TransactionBuilder } from "multicall-scripter";

const builder = new TransactionBuilder();
```

**`addCall(abi, target, functionName, args, msgValue = 0n)`**

Adds a call to the sequence. Returns a descriptor (or object of descriptors for structs, or array-like proxy for dynamic arrays) representing the call's return value. Descriptors can be passed as arguments to subsequent `addCall()` invocations.

**`build()`**

Returns `{ targets, offsets, calldatas, msgValues }` — the four arrays expected by `MulticallScripter.execute()`.

### Offset data layout

Each offset is a 256-bit value encoding the call type and copy instructions.

**Static call / state-changing call:**

| Bits | Field | Description |
|------|-------|-------------|
| 8 | `calltype` | `0xFF` static, `0xFE` regular call |
| 120 | `memTarget` | Memory offset where return data is written |
| 120 | `resultLength` | Bytes of return data to copy |

**Partial return (`0xFC`)** — used when a call produces multiple distinct output slots:

| Bits | Field | Description |
|------|-------|-------------|
| 8 | `calltype` | `0xFC` |
| 8 | `valueIndex` | Index into values array for msg.value |
| 120 | `memTargets` (40×3) | Destination offsets for up to 3 variables |
| 48 | `resultLengths` (16×3) | Byte lengths for each variable |
| 48 | `returnOffsets` (16×3) | Source offsets within the return data |
| 16 | `returnDataSize` | Total return data size (max 65535 bytes) |
| 8 | `num_vars` | Number of variable slots used |

## Limitations

- **Max 3 variables per call** — the partial return encoding uses 248 bits for three 40+16+16 bit triplets.
- **Dynamic types require `.with_length(n)`** — the builder needs to know the byte length up front to calculate memory positions.
- **Each return value can only be used once** — passing the same descriptor to two different calls throws.
- **Return values from state-changing calls cannot be chained** — only static calls support the partial return mechanism.
- **Return data size capped at 65535 bytes** — the `returnDataSize` field is 16 bits.
- **Requires Cancun or later** — the contract uses the `mcopy` opcode (EIP-5656).

## Running tests

```bash
# Solidity
forge test -vv

# JavaScript
cd js && bun test
```

## Security

This repository has not been audited. See [AUDIT.md](AUDIT.md) for a self-assessment of known issues. Not suitable for production use without independent review.

## Related projects

- [Multicall3](https://github.com/mds1/multicall) — standard call batching without return-value chaining
- [Weiroll](https://github.com/weiroll/weiroll) — a more complete scripting VM for EVM

## License

GPL-3.0 — see [LICENSE](LICENSE).
