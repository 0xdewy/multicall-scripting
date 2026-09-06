# multicall-scripting

[![License: GPL-3.0](https://img.shields.io/badge/License-GPL3-blue.svg)](LICENSE)
[![Solidity](https://img.shields.io/badge/Solidity-^0.8.28-363636?logo=solidity)](https://soliditylang.org/)
[![Foundry](https://img.shields.io/badge/Built%20with-Foundry-FF6C37?logo=ethereum)](https://getfoundry.sh/)

Run a sequence of contract calls in one atomic transaction, where the return value of any call can
be used as an argument to a later call.

Plain multicall (Multicall3 and friends) only batches independent calls. If step 3 needs the number
step 1 returned, you either write a bespoke contract or split the flow into several transactions.
This project precomputes, off-chain, exactly which bytes of each call's return data must land where
in a later call's calldata, and a tiny on-chain executor copies return data directly into calldata before
each call, without persistent executor state.

## Components

| Piece | Path | Role |
|---|---|---|
| `MulticallScripter` | `src/MulticallScripter.sol` | The executor. One function, `execute(targets, offsets, calldatas, values)`, in Yul. Stateless. |
| `MulticallScripterReadOnly` | `src/MulticallScripterReadOnly.sol` | Same arguments and encoding, but `view`: every call is a `staticcall` and the function returns each call's full return data. For `eth_call` reads. |
| `SevenSevenZeroTwoCaller` | `src/7702Caller.sol` | Optional EIP-7702 delegate so an EOA can run a batch as itself, or have a relayer submit a signed batch. |
| `TransactionBuilder` (JS) | `js/` | Builds the four inputs. Tracks return-value dependencies and encodes the 256-bit offset words. Published as `multicall-scripter`. |
| `multicall-scripter` (Rust) | `rust/` | Alloy-based port of the builder (codec + builder + CLI) for Rust tooling. Covers the scalar and single-dynamic-value paths. |
| `schema/offset-schema.json` | | The single definition of the offset-word bit layout all three layers follow. |

## Quick start

```bash
git clone https://github.com/0xdewy/multicall-scripting && cd multicall-scripting
forge install            # Solidity (needs Foundry)
cd js && bun install     # JavaScript
cd ../rust && cargo build # Rust (optional)
```

### Read a balance, then transfer exactly that amount

```javascript
import { TransactionBuilder } from "multicall-scripter";

const builder = new TransactionBuilder();

// addCall returns a descriptor: a placeholder for the value this call will return
const balance = builder.addCall(ERC20_ABI, token, "balanceOf", [executor]);

// pass the descriptor as an argument; the executor splices the real value in at run time
builder.addCall(ERC20_ABI, token, "transfer", [recipient, balance]);

const { targets, offsets, calldatas, msgValues } = builder.build();

await walletClient.writeContract({
  address: EXECUTOR, abi: EXECUTOR_ABI, functionName: "execute",
  args: [targets, offsets, calldatas, msgValues],
  value: msgValues.reduce((a, b) => a + b, 0n),
});
```

Calls run from the executor's address, so `balanceOf(executor)` above reads tokens the batch sent
to the executor earlier in the same transaction. See [`js/examples`](js/examples) for a full
ETH → WETH → DAI → USDC → user flow against an Anvil fork.

### Struct fields, multiple returns, arrays

```javascript
// multiple outputs come back as an array of descriptors
const [reserve0, reserve1] = builder.addCall(PAIR_ABI, pair, "getReserves", []);

// a struct output is an array of its fields that also answers to field names
const user = builder.addCall(AAVE_ABI, pool, "getUserAccountData", [me]);
builder.addCall(AAVE_ABI, pool, "borrow", [dai, user.availableBorrowsBase, 2, 0, me]);

// descriptors can sit anywhere inside an argument: structs, arrays, structs in arrays
builder.addCall(abi, target, "setPairs", [[{ a: reserve0, b: 1n }, { a: 2n, b: reserve1 }]]);
```

### Dynamic values

`bytes`, `string` and `T[]` return values need their runtime length declared before use, because
the builder reserves that much space in the consuming call's calldata:

```javascript
const owners = builder.addCall(abi, safe, "getOwners", []);
owners.with_length(3);                                   // element count for arrays, byte length for bytes/string
builder.addCall(abi, target, "setOwners", [owners]);      // whole array
builder.addCall(abi, target, "transfer", [owners[0], 1n]); // or one element
```

The declared length must be exact. The executor reverts (`InsufficientReturnData`) if the callee
returns too few bytes; incorrect lengths can also make the consumer read adjacent arguments.
The declaration is a caller precondition, not a runtime length check.

### Enso route translation (experimental)

The optional adapter uses Enso to find a route, then replaces Enso's Weiroll executor with
MulticallScripter. Request the `delegate` strategy: its `executeShortcut` calldata contains the
underlying command and state arrays for execution in the EOA's context.

```javascript
import { buildEnsoDelegateBatch } from "multicall-scripter/enso";

const route = await enso.getRouteData({
  chainId: 1,
  fromAddress: EXECUTOR,
  routingStrategy: "delegate",
  // tokenIn, tokenOut, amountIn, receiver, slippage...
});
const { batch, value } = buildEnsoDelegateBatch(route, {
  caller: EXECUTOR,
  routingStrategy: "delegate",
});

await walletClient.writeContract({
  address: EXECUTOR, abi: EXECUTOR_ABI, functionName: "execute",
  args: [batch.targets, batch.offsets, batch.calldatas, batch.msgValues],
  value,
});
```

`caller` must match every returned `tx.from`; under EIP-7702 it is the delegating EOA. The adapter
decodes the Enso transaction but does not call its `tx.to`: each supported Weiroll command target
is placed directly in the Scripter batch. It fails closed when a route uses semantics that the
fixed offset format cannot preserve, including delegatecalls, runtime-sized return values,
computed ETH values, state replacement, and Weiroll's composite state indices. Treat this as a
route-dependent experiment until the exact live response passes simulation and differential
execution against Enso's VM. Enso also requires a consumed scalar return to be exactly 32 bytes;
Scripter requires at least 32, so simulation is the compatibility check for each concrete route.

For ERC-20 input, approvals and funding must belong to the execution account. A public bare
executor must receive tokens inside the same atomic batch and must not retain approvals or assets.
EIP-7702 is the natural path when the EOA already owns the input tokens. Cross-chain routes only
initiate work on the source chain; destination execution cannot be composed into the same batch.

## Rules

- **Successful calls can return `false`.** The executor propagates EVM reverts; it does not interpret ERC-20 boolean results. Scripts must enforce their own success conditions.
- **The executor is shared and permissionless.** Anything left in it when the transaction ends
  (tokens, ETH, allowances) belongs to whoever calls next. End every batch by moving assets out.
  Unspent `msg.value` is refunded to the caller automatically.
- **Never approve the executor to spend your tokens.** Anyone could then call `execute` with a
  `transferFrom` against you. Fund a batch with `msg.value`, with tokens transferred *inside* the
  batch, or run it from your own address through the EIP-7702 delegate.
- **At most 3 return-value slices per producing call.** The offset word has room for three
  (target, length, source) triples. Read the same value twice with two calls if you need more.
- **Descriptors belong to one builder.** Generated references from another builder are rejected. Raw CLI references remain explicit byte positions.
- **Descriptors can be reused.** One result may feed multiple arguments or later calls, within the three-slice limit.
- **`with_length(n)` is an exact precondition, not a runtime check or safe truncation.** The original length word is copied too. A wrong length can revert or make the consumer read adjacent arguments. Use only canonical ABI returns with known exact lengths.
- **Dynamic argument layouts must match.** Array element types and tuple components are checked before reserving splice space.
- **One dynamic value per return.** If a function returns two strings, only the static outputs
  are usable; the position of the second string depends on the first's length.
- **Arrays of dynamic elements** (`string[]`, `bytes[]`, structs containing strings inside arrays)
  cannot be chained.
- **`msg.value` only on state-changing calls.** The builder rejects value on `view`/`pure`.
- **Cancun or later** (`mcopy`). The 7702 delegate additionally needs Prague.

## How it works

`build()` produces, per call, a 256-bit offset word describing what to do with the call's return
data. The executor copies all calldata into one contiguous memory region, then for each call:

1. reads the offset word; for state-changing calls, picks `msg.value` from `values`,
2. performs `staticcall` / `call` with return data written straight into the memory of a later
   call's calldata (regular layout) or with `returndatacopy` for each selected slice (partial layout),
3. reverts with the callee's revert data if the call fails, or `InsufficientReturnData` if the
   callee returned fewer bytes than the word requires.

Memory targets are byte offsets from the start of the *next* call's calldata; the builder adds the
size of any calls in between. A target outside the calldata region reverts (`InvalidMemoryTarget`).

### Packed calldata ABI (breaking change)

`execute(address[],uint256[],bytes,uint256[])` takes one packed `bytes` buffer as its third
argument. Both builders return it as `calldatas` (`0x…` in JS/JSON, `Bytes` in Rust). Update
contract ABIs and rebuild saved scripts; the previous `bytes[]` selector is no longer supported.
The 7702 signature domain is version **3**, so old signatures must be replaced too.
The Rust codec now returns `Result` from `decode_partial_return`; handle malformed words explicitly.

The buffer is the concatenation of `[uint256 byteLength][call bytes][zero padding to 32 bytes]`
for each call. There is no array length or table of element offsets inside it. For example, one
empty call is a single zero word; an empty batch is `0x`. The frame count must match `targets`
and `offsets`. The executor validates each frame's bounds and copies the buffer once.
Every byte inside the buffer, including frame padding, is covered by a signed batch hash.
Builders emit zero padding; hand-written scripts may splice into later frame headers or padding,
but the resulting frames must remain within the buffer and consume it exactly.

### Offset word layouts

Canonical definition: [`schema/offset-schema.json`](schema/offset-schema.json).

Regular — `0xFF` static, `0xFE` call:

| Bits | Field | |
|---|---|---|
| 8 | calltype | |
| 8 | valueIndex | 1-based index into `values`; 0 = none (`0xFE` only) |
| 120 | memTarget | where the return data is written |
| 120 | returnSize | bytes of return data written (callee must return at least this many) |

Partial return — `0xFC` static, `0xFB` call:

| Bits | Field | |
|---|---|---|
| 8 | calltype | |
| 8 | valueIndex | as above (`0xFB` only) |
| 3×40 | memTargets | destination per slice, MSB-first |
| 3×16 | resultLengths | bytes per slice |
| 3×16 | returnOffsets | source offset within the return data per slice |
| 16 | returnDataSize | bytes of return data captured (max 65535) |
| 8 | numVars | slices in use (≤ 3) |

### Errors

| Error | Selector | Meaning |
|---|---|---|
| `LengthMismatch()` | `0xff633a38` | target/offset/frame counts differ, or packed buffer is not word-padded |
| `InvalidOffset(uint256)` | `0x6115f2de` | unknown calltype byte, or `numVars > 3` |
| `InvalidMemoryTarget()` | `0xd558ad4e` | a frame or return-data write would leave the calldata region |
| `InvalidValueIndex()` | `0x3b1a9b29` | `valueIndex > values.length` |
| `InsufficientReturnData()` | `0xcbce8a22` | callee returned fewer bytes than required |
| `RefundFailed()` | `0xf0c49d44` | caller could not receive the unspent `msg.value` |
| `EthNotAccepted()` | `0x60f8f321` | ETH sent to the executor outside `execute` |

Any other revert is the callee's, bubbled unchanged.

## Reading a chain off-chain

`MulticallScripterReadOnly.execute` takes the same four inputs and returns `bytes[]`, one entry
per call with that call's complete return data, so a chain of reads (reserves → quote → health
factor) is one `eth_call` and every intermediate value is visible:

```javascript
const results = await publicClient.readContract({
  address: READER, abi: READER_ABI, functionName: "execute",
  args: [targets, offsets, calldatas, msgValues],
});
const quote = decodeAbiParameters([{ type: "uint256" }], results[1])[0];
```

Targets see the reader as `msg.sender`, not the write executor or a delegated EOA. Reads that
depend on the caller can therefore differ; use explicit account arguments when appropriate.
This endpoint evaluates read chains, not a simulation of state-changing batches.

State-changing offset words are accepted but executed as `staticcall`, so a callee that writes
reverts; `values` is ignored. It shares the executor's errors except `InvalidValueIndex`, `RefundFailed`, and `EthNotAccepted`.

## EIP-7702

`SevenSevenZeroTwoCaller` lets an EOA that delegates to it run a batch with the EOA as
`msg.sender`, spending the EOA's own balance and allowances:

- `execute(...)` — callable only by the account itself (send the transaction to your own address).
- `executeWithSignature(targets, offsets, calldatas, values, deadline, signature)` — callable by
  anyone with an EIP-712 signature from the account over the whole batch, a nonce and a deadline.
  `hashExecute(...)` returns the digest to sign; `nonce()` the next nonce.

The domain is `{ name: "MulticallScripter7702", version: "3", chainId, verifyingContract: <EOA> }`
and the type is `Execute(bytes32 batchHash,uint256 nonce,uint256 deadline)` with
`batchHash = keccak256(abi.encode(targets, offsets, calldatas, values))`.

The delegate has no owner list, entry point or admin functions; the EOA key is the only authority.
Its nonce uses the ERC-7201 namespace `multicall-scripting.7702.nonce`, rather than slot zero.
Version 3 rejects signatures from the earlier slot-zero implementation; regenerate signed batches.

Delegation changes preserve account storage. Removing delegation does **not** cancel unused batch
signatures: they can work again after restoration if their nonce and deadline are still valid.
To cancel signatures for the current nonce, sign and execute an empty batch with that nonce;
signatures for future nonces require separate invalidation or expiry. An ordinary self-call does
not advance the signature nonce. A competing relayer can race cancellation until it is confirmed.
A failed authorization transaction can still install delegation: the protocol authorization is
processed separately from EVM execution rollback. The rehearsal tests these lifecycle cases.
Only migrate to code whose storage and signature behavior you have reviewed; namespacing prevents
accidental ordinary-slot collisions, not deliberate writes by another delegate.

## Deployment and mainnet rehearsal

The deployment wrapper targets **Ethereum (chain 1)** or a local fork (31337). It deploys both
executors; set `DEPLOY_7702=true` to include the delegate. It uses the CREATE2 factory at
`0x4e59b44847b379578588920cA78FbF26c0B4956C`, checks the predicted addresses and exact runtime
bytecode, and safely accepts an existing matching deployment. Addresses depend on the salt and
**exact creation bytecode**, including compiler settings and metadata.

Rehearse the release against real mainnet state, without a mainnet wallet:

```bash
cd js && bun install && cd ..
script/rehearse.sh
# Reproduce a specific block using an archive-capable endpoint:
ETH_RPC_URL=https://your-archive-rpc FORK_BLOCK=25914306 script/rehearse.sh
```

The rehearsal starts its own Anvil process on an automatically selected free local port
(set `FORK_PORT` to require a specific port),
prints the fork block, deploys all three contracts, checks a second deployment run, and verifies:

- deployed runtime bytecode equals the local release artifacts;
- read-only Uniswap → Curve quotes equal direct calls;
- ETH → WETH → DAI → USDC reaches the recipient and leaves no executor balances or allowances;
- a late slippage failure rolls back the swaps, balances and approvals;
- a real EIP-7702 authorization, self-call, signed relayed batch and rejected replay work;
- a deployment rerun rejects mismatched code, and both Solidity mainnet-fork swaps pass.

If `ENSO_API_KEY` is already exported, the rehearsal also requests live Enso `delegate`
ETH → USDC and ETH → DAI routes. It executes each underlying command program through Enso's
EIP-7702 VM and its translated Scripter batch from identical fork state, asserts identical output
and `minAmountOut`, and reports the executor gas difference. The script never sources `.env`;
`.env` is ignored by Git. Without the exported key, this optional live check reports `SKIP`.

The process uses public Anvil test accounts and sends transactions only to its own local node.
Historical blocks may require an archive RPC; public endpoints can impose rate or history limits.

Simulate the actual Ethereum deployment with an explicit deployer address:

```bash
DEPLOY_7702=true script/deploy.sh https://your-mainnet-rpc --sender YOUR_DEPLOYER_ADDRESS
```

To broadcast an approved release, pass `--broadcast` and Foundry wallet options, for example
`--account YOUR_KEYSTORE --sender YOUR_DEPLOYER_ADDRESS --broadcast --verify`. Use `--ledger`
if signing with a hardware wallet. Explorer verification needs the appropriate Foundry explorer
configuration. The wrapper neither sources a shell `.env` nor requires a raw private key.
Foundry itself supports dotenv; prefer exported settings and keystore/hardware-wallet signing.
A failed deployment or bytecode check exits nonzero and preserves the full error output.

## Testing

```bash
forge test
cd js && bun test && cd ..
cd rust && cargo test && cargo clippy --all-targets -- -D warnings && cd ..
forge test --match-contract 'AdversarialTest|MulticallScripterReadOnlyTest|MulticallScriptTest|SevenSevenZeroTwoCallerTest' --fuzz-runs 4096 --fuzz-seed 0x51c7
FOUNDRY_INVARIANT_RUNS=1024 FOUNDRY_INVARIANT_DEPTH=512 forge test --match-contract Invariant --fuzz-seed 0x51c7
uv run script/check-memory-bounds.py  # scoped arithmetic checks, not whole-contract verification
```

`forge test` includes JS and Rust FFI tests, so Bun and Cargo must be on PATH. Two swaps in
`test/CallBuilder.t.sol` require `ETH_RPC_URL`; they skip in an offline run and are required by
the fork rehearsal. `FORK_BLOCK` pins the state; otherwise those tests use the endpoint's current
block. The CI workflow has a manual mainnet-fork rehearsal job as well.

The byte-copy model checks both executors against expected intermediate calldata. Adversarial
tests exercise malformed frames, exact revert propagation, static-context restrictions, nested
execution, refund callbacks, reentrant signature replay, forced ETH and false return values.
Stateful models track committed arithmetic, calls, refunds, balances and nonces across success
and rollback; the read-only executor must report the modeled state. Unexpected handler reverts
fail the invariant run.

JS property tests generate reproducible batches through the public builder API and interpret
them independently. Golden vectors pin Rust and JS encodings. Both CLIs reject invalid ETH values
and unsafe JSON numbers: quote integers larger than `9007199254740991`; the JS API accepts
`BigInt` or strings. For overloaded functions, supply an ABI containing only the intended overload.
See [SECURITY.md](SECURITY.md) for release evidence and limits, and [AGENTS.md](AGENTS.md) for the
contributor workflow.

### Gas regression gates

`test/GasBenchmarks.t.sol` measures the executor call itself with `vm.lastCallGas()`, excluding
batch construction and ABI encoding in the test. Its nine hard caps are the old executor's
measurements at commit `f8d42dfc4d73a9c571e033c704f430de4b31e668`, compiled with the same current
Solidity 0.8.28, via-IR, 1,000,000 optimizer runs and Prague settings. Every cap passes without
regression tolerance. Whole-test snapshots are a separate check, using a fixed fuzz seed to avoid sampling noise.

Actual Anvil Prague transaction receipts, with identical targets and calls for both versions:

| Workload | Previous gas | Packed gas | Reduction |
|---|---:|---:|---:|
| 10 reads | 50,020 | 46,220 | 7.6% |
| 30 reads | 102,020 | 90,620 | 11.2% |
| 30 scalar links + event | 105,170 | 93,390 | 11.2% |
| 5 links, 320-byte payload | 259,227 | 258,190 | 0.4% |
| 5 links, 1024-byte payload | 743,196 | 742,166 | 0.1% |
| 5 calls, three slices | 39,764 | 38,316 | 3.6% |
| 10 chained writes | 65,579 | 63,866 | 2.6% |
| 10 writes, partial slices | 68,263 | 66,521 | 2.6% |
| 10 ETH-bearing writes | 132,635 | 131,122 | 1.1% |

The same receipt comparison also passes against the old compiler configuration (optimizer off).
Execution-only gas and transaction gas differ: transaction receipts include calldata charges,
including [Prague's calldata floor](https://eips.ethereum.org/EIPS/eip-7623). The packed buffer saves one 32-byte ABI head per call.

## Security

Not independently audited. [SECURITY.md](SECURITY.md) describes the trust model, what has been
reviewed, and the remaining limitations.

## Related

- [Multicall3](https://github.com/mds1/multicall) — batching without return-value chaining
- [Weiroll](https://github.com/weiroll/weiroll) — a full scripting VM for the EVM

GPL-3.0 — see [LICENSE](LICENSE).
