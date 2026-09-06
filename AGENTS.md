# AGENTS.md — working on multicall-scripting

Read this before changing anything. It is the one place that explains how the three layers fit
together and what must stay true. README.md is the user-facing guide; SECURITY.md the trust model.

## What this is

An on-chain executor (`MulticallScripter.execute`) runs a list of calls and splices return data
from earlier calls into the calldata of later ones, driven by one 256-bit "offset word" per call.
Two off-chain builders (JavaScript, Rust) produce targets, packed calldata, values and offset words from ABIs. An
optional EIP-7702 delegate wraps the executor for EOAs.

```
src/MulticallScripter.sol   executor (Yul). Constants contract mirrors the schema by hand.
src/MulticallScripterReadOnly.sol  view twin: staticcall everything, return bytes[] of all return data
src/7702Caller.sol          EIP-7702 delegate: self-call or EIP-712 signed batch.
schema/offset-schema.json   canonical bit layout. Edit this first.
js/encoding.js              offset encode/decode (reads js/offset-schema.json, a synced mirror)
js/index.js                 TransactionBuilder + ABI layout engine + descriptors
js/cli.js                   JSON in → {targets, offsets, calldatas, msgValues} out (used by FFI tests)
js/test/*.test.js           bun unit tests;  js/test/*.js (no .test) are FFI scripts run by forge
js/test-vectors.json        golden offset vectors (JS-generated, asserted by JS and Rust)
js/build-vectors.json       golden whole-build vectors (JS-generated, asserted by JS and Rust)
rust/crates/codec           encode/decode; constants generated from the schema by build.rs
rust/crates/builder         TransactionBuilder port (scalar + single dynamic value paths)
rust/crates/cli             tx-builder-rs, same JSON contract as js/cli.js
test/MulticallScripter.t.sol executor unit + fuzz tests (every error path has a test)
test/MulticallScripterReadOnly.t.sol  read-only twin (same error paths, result encoding)
test/7702Caller.t.sol        delegate tests (EOA simulated with vm.etch)
test/7702Invariant.t.sol     stateful nonce, rollback and ETH-accounting model
test/ExecutorInvariant.t.sol committed arithmetic, refunds, ETH conservation and read-only observations
test/Adversarial.t.sol       malicious callees, replay callbacks, static restrictions, malformed frames
script/rehearse.sh           deterministic deployment + real protocol and 7702 mainnet-fork rehearsal
test/CallBuilder.sol         test-only Solidity offset encoders + a small Scripter DSL
test/JsLibrary.t.sol         JS builder → on-chain (vm.ffi bun ...)
test/RustLibrary.t.sol       Rust CLI → on-chain (vm.ffi cargo run ...)
test/Gas*.t.sol              gas benchmarks and a Weiroll comparison (lib/weiroll-huff)
.claude/skills/multicall-scripting  installable skill for people using the library
```

## Commands

```bash
forge build && forge test                 # needs bun + cargo on PATH for the FFI suites
ETH_RPC_URL=... FORK_BLOCK=... forge test --mc CallBuilder   # the two mainnet-fork tests (skipped otherwise)
uv run script/check-memory-bounds.py     # scoped solver checks (not full formal verification)
script/rehearse.sh                       # local deployment, real protocol/7702 transactions, fork tests
forge snapshot --fuzz-seed 0x51c7 --no-match-contract 'JsLibrary|RustLibrary|Invariant' --no-match-test 'test_mint_weth_and_swap'   # refresh .gas-snapshot (CI checks it, 5% tolerance)
cd js && bun install && bun test
cd rust && cargo test && cargo clippy --all-targets
bun js/scripts/gen-test-vectors.js && bun js/scripts/gen-build-vectors.js   # after changing encoders/builder
cd js && bun run sync:schema              # after editing schema/offset-schema.json
```

## Invariants — do not break these

1. **One bit layout.** `schema/offset-schema.json` is canonical. Solidity mirrors it by hand
   (`Constants` + the masks/shifts in `execute`), JS reads the synced mirror, Rust generates
   constants at build time. Changing a field means: schema → `bun run sync:schema` → Solidity →
   regenerate both vector files → all three suites green.
2. **memTargets are relative to the call after the producer.** `execute` resolves
   `memTarget` against the start of the calldata of call `i+1` when call `i` produced the data.
   Builders must add the region size (`32 + pad32(len)`) of every call between producer and
   consumer. The JS builder does this in `addCall`; Rust in `add_call`.
3. **Positions come from real encodings, never guesses.** The JS builder locates argument
   positions by reading head pointers out of the viem-encoded calldata (`locate`), and lays out
   return data from the ABI outputs (`layoutTuple`). Anything whose position is only known at run
   time (a second dynamic value, arrays of dynamic elements) is marked `unsupported` and throws on
   use. Keep it that way; a wrong position means the executor splices into the wrong argument.
4. **The executor validates what it can.** Every write must stay inside the calldata region
   (`InvalidMemoryTarget`), every byte spliced must come from real return data
   (`InsufficientReturnData`), `valueIndex` must be in range, unspent `msg.value` is refunded.
   Execution depends only on the decoded inputs, not on how they were encoded (the packed `bytes` buffer is located through its ABI head). The 7702 signature covers `abi.encode` of all four inputs.
   The third argument is packed `bytes`: `[length][data padded to 32]` frames, with no inner
   head table. All bytes are signed; frame bounds and the final frame count are validated.
5. **Stateless executor.** No storage, no held balances, `receive()` reverts. The 7702 delegate
   has exactly one namespaced storage slot (`nonce`, ERC-7201 `multicall-scripting.7702.nonce`) and no admin surface.
6. **Error selectors are hardcoded in Yul.** If you add or rename an error, recompute the selector
   (`cast sig 'Name()'`), update the Yul literal and the `@dev` comment, and add an
   `expectRevert` test — the test is what proves the literal is right.
7. **Golden vectors pin Rust to JS.** If a JS change alters `build()` output for an existing
   scenario, that is either a bug fix (regenerate vectors, and expect Rust to need the same fix) or
   a regression. Never regenerate vectors to make a failing test pass without understanding why.

## How a change flows

- **New executor behaviour** → `src/MulticallScripter.sol` *and* `src/MulticallScripterReadOnly.sol`
  (they share the decode/splice rules — keep them in step; the writer copies partial slices directly from returndata) → test in `test/MulticallScripter.t.sol`
  (and `test/CallBuilder.sol` if the encoders change) → `forge snapshot` → both builders if the
  encoding changed.
- **New builder capability** → `js/index.js` → unit test in `js/test/layouts.test.js` with
  hand-computed positions → on-chain proof in `js/test/layouts.js` + `test/JsLibrary.t.sol`
  (add a function to `Layouts` in `test/Helpers.sol`) → port to Rust if it is on the supported
  path, or extend the "Not ported" list in `rust/crates/builder/src/lib.rs`.
- **Docs** → README.md for users, this file for contributors, SECURITY.md for trust/limits, the
  skill for library consumers. Keep them factual; delete rather than let them drift.

## Conventions

- Solidity: `// SPDX-License-Identifier: GPL-3.0`, `pragma solidity ^0.8.28`, named imports,
  custom errors (no revert strings in `src/`), `assembly ("memory-safe")`. Build is via-IR with
  the optimizer on; the executors are written as small Yul functions (`step`, `partial`/`splice`,
  `doCall`) — that, plus via-IR, is what keeps them clear of stack-too-deep. Do not fold them back
  into one block.
- JS: ES modules, `BigInt` for every 256-bit quantity, viem is the only runtime dependency,
  private helpers stay module-local. Tests are bun (`*.test.js`); FFI scripts print one JSON line.
- Rust: alloy only (no ethers-rs), `thiserror` errors whose messages mirror the JS strings,
  offsets are `U256`, constants never hand-written.
- Tests: every executor error has a test; every builder position rule has a hand-computed unit
  test and an on-chain FFI test; write benchmarks cap executor-only gas at the pre-review baseline (no regression headroom).

## Things that look like bugs but are not

- `values` may be shorter than `targets`; only calls with `valueIndex > 0` read it.
- A static call with `staticCall(0, 0)` and no consumer is legal (side-effect-free read that
  nobody uses); the builder emits it for unconsumed view calls.
- The last call can never chain (there is no next call); the executor reverts with
  `InvalidMemoryTarget` rather than writing past the region.
- `with_length(0)` is allowed (empty array / bytes → 32-byte length word only).
- The CLIs reject unsafe JSON numbers. Quote large integers; JS API callers use BigInt or
  strings. Reference objects contain safe integer positions. Ambiguous overloaded names are rejected.

## Things that are genuinely out of scope

- `delegatecall` from the executor (removed; it would break statelessness).
- ERC-4337 / entry-point integration in the 7702 delegate.
- Chaining values whose position depends on runtime data (second dynamic value, dynamic elements).
