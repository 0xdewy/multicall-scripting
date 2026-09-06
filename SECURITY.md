# Security

This code has not been audited by an independent third party. This document states the trust
model, what the internal review covered and fixed, and the limits that remain. Report issues
privately to the maintainer listed in `js/package.json` before disclosing them.

## Trust model

`MulticallScripter.execute` takes four caller-supplied inputs and guarantees only:

1. the calls run in order, atomically (any failure reverts the whole transaction with the
   callee's revert data);
2. return data is written exactly where the offset words say, and only inside the memory that
   holds the batch's own calldata;
3. every byte spliced comes from bytes the callee actually returned;
4. `msg.value` forwarded per call is taken from `values` by a checked index, and whatever part
   of `msg.value` the batch did not spend is returned to the caller.

It does **not** validate targets or calldata contents. A script that calls a malicious contract
gets whatever that contract does. Execution depends only on the decoded inputs, not on how they
were ABI-encoded.

The executor is stateless and permissionless. **Anything in its possession when a transaction ends
— tokens, ETH, allowances — can be taken by the next caller.** Scripts must move all assets out
before finishing. Direct ETH transfers to the executor revert. For the same reason, **no one
should ever grant the executor a token allowance**: any caller could spend it.

`SevenSevenZeroTwoCaller` is the opposite: it *is* an account (the delegating EOA) and holds
value. Its only authority is the EOA's own key: `execute` requires `msg.sender == address(this)`,
`executeWithSignature` requires an EIP-712 signature by the account over the full batch, a nonce
and a deadline. There are no signers, owners or entry points to misconfigure.

## What the internal review (September 2026) found and fixed

Executor (`src/MulticallScripter.sol`):

- Return-data length was never checked. A call to an address with no code (a typo'd token
  address) succeeded with empty return data, leaving the placeholder argument in place. Now
  `InsufficientReturnData`.
- Partial-return slices could read past the captured return data (zeros). Now checked.
- `valueIndex` out of range read past the `values` array. Now `InvalidValueIndex`.
- Unspent `msg.value` stayed in the executor, claimable by anyone. Now refunded.
- Execution walked calldata bodies sequentially and assumed the `values` array followed them,
  so a non-canonical encoding of the same inputs could execute different bytes than a signature
  covered. The third argument is now a packed `bytes` buffer, located through its ABI head. Every
  internal byte, including frame padding, is signed. Frame lengths and final consumption are
  bounds-checked. This removes the per-call normalization pass and the unsigned-padding ambiguity.
  The ABI changed from `bytes[]` to `bytes`, and the 7702 domain version changed to 2.
- `InvalidCalltype` was reverted with malformed error data (selector right-aligned in a
  32-byte word). Replaced by a correctly encoded `InvalidOffset(uint256)`.
- A defined-but-unimplemented `delegatecall` flag was removed from every layer.

EIP-7702 delegate (`src/7702Caller.sol`, rewritten):

- `executeWithAuthorization` accepted a signature that did not cover the batch and did not check
  the signer was authorised: anyone could sign for themselves and drain the wallet. The whole
  contract was replaced by the two-entry-point design above.
- Constructor-initialised `authorizedSigners` / `entryPoint` are meaningless under 7702 (the
  constructor never runs in the EOA's storage). Removed.

JavaScript builder (`js/index.js`, rewritten):

- Memory targets were positions inside the consuming call, but the executor interprets them
  relative to the call after the producer. Chaining silently corrupted the intermediate call's
  arguments whenever the consumer was not the very next call.
- Argument positions assumed every parameter head is 32 bytes (wrong for static tuples), that
  dynamic tails follow a single 32-byte head (wrong for multi-parameter functions), that string
  literals are ASCII, and that descriptors inside struct arguments sit at the struct's first slot.
  Return offsets ignored the pointer word of dynamic tuple outputs and the position of arrays
  that were not the first output. All positions are now derived from the real encoding; layouts
  that cannot be known before execution are rejected.

Both builders now reject incompatible dynamic layouts (including array element sizes), permit
reusing a return value within the three-slice limit, and validate references before recording
splices. A failed addition does not consume a descriptor. Oversized dynamic lengths are rejected
before allocating placeholders.

The Rust builder shared the head-size and consumer-distance bugs and was fixed the same way.

Build: the optimizer was off; it is now on (via-IR), and the compilation target is pinned.

## Remaining limits

- **No whole-contract formal verification.** The executor's memory safety argument is by construction (every
  write is bounds-checked against the calldata region; partial slices read directly from the EVM
  return-data buffer) and by tests,
  not by proof.
- **Delegation lifecycle.** The nonce uses ERC-7201 namespace `multicall-scripting.7702.nonce`.
  Domain version 3 rejects old slot-zero signatures. An arbitrary delegate can still deliberately
  overwrite this namespace; storage-safe migration is a caller responsibility. Removing delegation
  preserves storage and does not invalidate unused signatures after restoration. An empty signed
  batch consumes the current nonce; ordinary self-calls do not. Future-nonce signatures need
  separate invalidation or expiry, and pending cancellations can be raced. Protocol authorization
  survives a reverted execution transaction. These rules follow [EIP-7702](https://eips.ethereum.org/EIPS/eip-7702)
  and are exercised with actual Anvil authorization transactions, not just etched runtime code.
- **Callee behaviour is the caller's responsibility.** Nested execution has separate EVM memory,
  and the bare executor has no storage. This is not protection against malicious callees: they
  can reenter the executor or batch targets and interact with assets and allowances available
  during the batch. Only include targets and calldata the caller intends to trust.
- **EVM success is not protocol success.** An ERC-20 returning `false` does not revert the batch.
  The executor does not interpret results or add SafeERC20 checks. Use protocols that revert on
  failure or explicitly enforce the necessary return-value conditions in the script's callees.
- **Reader caller context.** Targets see `msg.sender == reader`, which differs from the write
  executor or a delegated EOA. Matching input arrays do not guarantee matching caller-dependent
  reads; the reader is not a state-changing batch simulator. This distinction has a regression test.
- **Resource limits.** Gas exhaustion or very large return/revert data can fail a batch or an RPC
  read. The reader returns all results, so its memory/output costs grow with returned data.
- **`with_length` must be exact.** It reserves space; it does not validate the runtime length.
  The original length word is copied. If a callee returns more than declared, the consumer can
  revert or read an adjacent argument as part of that value. Fewer bytes may trigger
  `InsufficientReturnData`, but padding can also mask a wrong declaration. Only use canonical ABI
  return encodings with exact known lengths. The new adversarial test demonstrates adjacent-array
  interpretation; there is no safe-truncation guarantee.
- **Value accounting.** Refunds cover unspent incoming `msg.value`, not the contract's entire
  balance. ETH can be forced in or pre-funded before deployment and is publicly spendable in
  the bare executor. A call can spend an existing balance; insufficient available ETH causes
  the call to fail. The delegate deliberately spends its EOA's balance. Amounts returned by
  callees are not automatically swept as refunds; scripts must dispose of those assets.
- **Signature malleability** is irrelevant to replay (nonces), but a low-`s` check is not
  enforced; do not use the signature bytes as an identifier.
- **The Rust builder** covers scalar chaining and one dynamic value per call. Nested references
  and element access are JS-only.
- **External route builders remain trusted input.** The experimental Enso translator validates
  transaction shape, caller context, Weiroll bounds, and only the subset it can reproduce without
  changing execution semantics. It cannot prove that API-provided targets or calldata express the
  intended route, and a translated static return accepts extra trailing return bytes that Enso's VM
  rejects. Inspect route metadata, set a bounded minimum output, use a fresh quote, and simulate
  both executions before signing. Cross-chain completion remains outside source-chain atomicity.

## Release validation — 2026-09-05

This is an internal adversarial review and deployment rehearsal, not an independent audit or a
proof of optimal gas. The write executor remains byte-for-byte unchanged in this follow-up;
all nine previous-code execution gas caps still pass. The reader's custody comment was corrected
(changing its metadata/hash, not execution logic). The delegate now has namespaced nonce storage
and signature domain version 3.

The release pass additionally fixed CLI input handling: unsafe JSON numbers now fail instead of
being rounded, invalid Rust ETH values fail instead of becoming zero, and ambiguous overloaded
function names are rejected. The swap example requires explicit deadline/slippage bounds.
Deployment now targets one explicit Ethereum/local-fork RPC, needs no raw key for simulation,
checks exact runtime bytecode and is idempotent. It preserves failures and full diagnostics.

### Adversarial and stateful evidence

- The full Solidity suite passes **128 tests** with both mainnet swaps enabled (no skips).
  JavaScript passes **63 tests** and Rust **21 tests**. Strict Clippy and fixed-seed gas snapshots
  pass as well.
- The follow-up invariant campaign uses seeds `0xdecaf` and `0xbadc0de`, 1,024 runs and depth 512
  for each of three properties: **3,145,728 handler actions, zero unexpected reverts**. Expected failing batches
  are caught inside handlers, and their lack of state/balance changes is checked explicitly.
- Executor accounting models committed chained arithmetic, call counts, ETH paid, unspent
  refunds, callee failures and rejected refunds. The reader's observations must match that model.
  The 7702 model separately tracks nonce, replay rejection, authorization and account/relayer ETH.
- The 4,096-run fuzz campaign covers malformed/mutated frames, byte-copy differential behavior,
  all four call flags, static restrictions (SSTORE, TSTORE, LOG, CREATE, SELFDESTRUCT, value CALL),
  and exact binary revert payloads up to 4 KiB with rollback of earlier writes and ETH transfers.
- Directed attacks cover nested execute/splicing, refund callbacks, signature replay during an
  active signed batch, forced ETH, and successful calls returning false.

The follow-up reproduced and fixed three additional implementation problems:

- JavaScript unsigned offset fields accepted negative/inexact/coerced values. All encode/decode
  boundaries now validate exact unsigned inputs. JS and Rust reject impossible partial counts;
  Rust's `decode_partial_return` now returns `Result` instead of panicking on malformed words.
- Generated descriptors from a different builder could silently refer to a local call with the
  same index. Both builders now bind generated references to their originating builder. Raw CLI
  references remain explicitly supplied byte positions.
- A delegation migration overwriting ordinary slot zero could reset the old nonce and revive a
  used signature. A failing-before/passing-after regression demonstrates this case. The new
  ERC-7201 namespace avoids ordinary slot collisions; domain version 3 invalidates earlier-domain
  signatures instead of reusing them against the new storage location.

Additional tests cover signature malleability plus replay rejection, cancellation with an empty
signed batch, exact deadline boundaries, rejected-relayer-refund rollback, public token-approval
exploitation, explicit checking of false return values, and the unsafe dynamic-length assumption.
The 7702 invariant handler now interleaves cancellations and other-delegate slot-zero writes.

`uv run script/check-memory-bounds.py` runs four scoped Z3 bit-vector checks: packed-frame bounds,
regular and partial destination bounds, and partial returndata containment. All produce `unsat`
for a violation, assuming allocated memory addresses below 2^64 (far above feasible EVM memory).
These manually modeled inequalities are **not** formal verification of the whole executor,
compiler, memory-safe annotation, protocol integrations, or signature system.

In the earlier release pass, six deliberate source mutations were compiled and tested in isolated copies. All were detected:

| Broken behavior | Detecting regression test |
|---|---|
| Removed packed-frame bound | `test_fuzz_packed_frame_bounds` |
| Removed regular short-return check | `test_short_return_data_reverts_regular` |
| Shifted partial-copy source by one byte | `test_fuzz_chaining_matches_byte_model` |
| Removed ETH value-index check | `test_value_index_out_of_range` |
| Copied one fewer byte in the reader | `test_chain_returns_every_result` |
| Removed nonce increment | `test_reentrant_signature_replay_cannot_reuse_nonce` |

### Deployment rehearsal

`script/rehearse.sh` deploys the exact artifacts on an Anvil mainnet fork and verifies runtime
bytecode against local compilation. It sends real local transactions through WETH, Uniswap V2
and Curve 3pool, checks residual balances/allowances and a failed-slippage rollback, compares
read-only results with direct RPC calls, and tests real EIP-7702 delegation, self-execution,
relayed execution and replay rejection. It also rejects deliberately corrupted deployed code.
The Solidity swaps assert actual token output. Their test deployment address already has ETH
on mainnet, so they check that the batch retains no additional ETH rather than assuming the
address began empty. Fork-only deployments below are not announcements of a mainnet deployment.

Final follow-up rehearsal: Ethereum block **25,915,378**, hash
`0x0e733e5c94981a274a07b5ed069a5fd8b399ca3dd90567d80034ccfba3c9f81c`; local chain 31337, Anvil hardfork `Bpo1`.
The 0.1 ETH multi-protocol swap used **299,535 gas**; authorization/self-call used **88,098 gas**.
The first signed batch used **78,009 gas**, and the same workload after nonce initialization used
**64,329 gas**. The prior slot-zero rehearsal used pre-existing nonzero mainnet storage at the test
EOA, so its first call was not a comparable fresh-nonce measurement. An isolated same-compiler,
same-state empty-batch comparison measured a **5 execution-gas increase** for namespaced nonce
access (26,490 → 26,495 at zero; 6,590 → 6,595 with initialized, warm nonce storage). This is an
intentional delegate hardening cost; write-executor gas did not increase.
These are workload-specific receipts and measurements, not universal gas estimates.

| Contract | CREATE2 address checked on the fork |
|---|---|
| `MulticallScripter` | `0xe9Ac863E40A25d460299Bc1c514fd798020574cc` |
| `MulticallScripterReadOnly` | `0xdf9e2601030184F463DB25D57be30cE1E035cEF8` |
| `SevenSevenZeroTwoCaller` | `0x1D0E0C2bAd56212c16c2a64dB2A6cF2A7e20c03B` |

Runtime code hashes for this tested build:

```text
MulticallScripter: 0xaae6b023e1b63db280bf39a5caf8393a7c5c641f22deea06f3d617ec92ca44d3
MulticallScripterReadOnly: 0xc69d894479aeddc65682897328b79041d583c41ca6477a52b1b26a89225e6940
SevenSevenZeroTwoCaller: 0x3b4eb5a03f2bbcdf18d564848190b265dd59d8411f5431e7beaabbcfa60ff665
```

### Compiler review and remaining release work

Compilation is pinned to Solidity 0.8.28, via-IR, optimizer runs 1,000,000, EVM target Prague.
Foundry 1.7.1, Bun 1.3.14 and Cargo 1.97.1 were used for this review; CI pins Foundry 1.7.1.
The [Solidity known-bug list](https://docs.solidity.org/en/latest/bugs.html) was checked:
`UnsoundSpillInMutualRecursion` needs mutually recursive internal functions;
`TransientStorageClearingHelperCollision` needs clearing both transient and persistent storage;
`LostStorageArrayWriteOnSlotOverflow` needs storage arrays crossing the slot boundary.
The production contracts do not contain those triggering constructs. The storage-layout warning
bug introduced in 0.8.29 does not affect 0.8.28. This source-level screening is not a compiler proof.
SELFDESTRUCT/transient-storage warnings in the adversarial fixtures are intentional attack cases,
not operations in the production executors.

Before directing substantial funds through a live release, obtain independent review of the
final assembly and deployed build, verify the live chain's bytecode and run the intended production
batches with their actual tokens, slippage limits and callers. The local rehearsal cannot establish
safety for arbitrary third-party contracts, token behavior, future compiler changes or RPC services.
