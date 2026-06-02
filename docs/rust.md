<!-- agentify: generated 2026-06-01 | score-before: 0 | source: 1.4.0 -->
# Rust Library

The `rust/` workspace is the third implementation of the multicall-scripting layer, alongside the
Solidity executor and the JavaScript builder. It lets Rust/alloy tooling (bots, simulators,
Foundry-adjacent code) build the same return-value-chaining transactions, and it shares the one
canonical bit layout in `schema/offset-schema.json`.

## Why alloy

`alloy` (v1.x) is the stable, recommended Rust EVM toolkit and the backbone of Foundry, revm, and
reth. `ethers-rs` is deprecated — do not use it. The mapping to the JS layer:

| JS (viem / BigInt) | Rust (alloy) |
|--------------------|--------------|
| `BigInt` offset words | `alloy_primitives::U256` |
| `viem.encodeFunctionData` | `alloy-dyn-abi` `DynSolValue::abi_encode_params` |
| ABI loading | `alloy-json-abi` `JsonAbi` |

## Crate map

| Crate | Path | Mirrors | Purpose |
|-------|------|---------|---------|
| `multicall-scripter-codec` | `rust/crates/codec` | `js/encoding.js` | constants + encode/decode of the 256-bit offset word |
| `multicall-scripter` | `rust/crates/builder` | `js/index.js` | `TransactionBuilder`, `Arg`, `ReturnRef`, `build()` |
| `multicall-scripter-cli` (bin `tx-builder-rs`) | `rust/crates/cli` | `js/cli.js` | JSON in → `{targets, offsets, calldatas, msgValues}` out |

## Schema as single source of truth

`rust/crates/codec/build.rs` reads `schema/offset-schema.json` at build time and generates
`$OUT_DIR/schema_constants.rs` (flag values, `VALUE_OFFSET`, `PARTIAL_RETURN_VARS`, and a `FLAGS`
table for `validate_offset`). The constants are **never hand-written**; editing the schema and
rebuilding keeps Rust locked to the other two layers.

## Parity model

The Rust layer is pinned to the JS reference (which is itself on-chain-verified) by the project's
three-ring verification system — **see [docs/testing.md](testing.md) for the full model**. The
Rust-specific touchpoints:

- `rust/crates/codec/tests/golden.rs` asserts the codec reproduces `js/test-vectors.json`.
- `rust/crates/codec/tests/properties.rs` (proptest) covers encode→decode roundtrips and validation.
- `rust/crates/builder/tests/parity.rs` asserts whole-`build()` output matches `js/build-vectors.json`.
- `test/RustLibrary.t.sol` executes the Rust CLI's output through the real contract over FFI.

## Build & test

```bash
cd rust && cargo build && cargo test
cargo clippy --all-targets -- -D warnings
# Rust CLI → on-chain parity (run from repo root; needs cargo on PATH + ffi=true):
forge test --match-contract RustLibrary -vv
```

## Current scope & limitations

The builder ports the **primary path**: scalar return values chained as scalar arguments, calls
with no chained return, state-changing calls with an indexed `msg.value`, a single dynamic
(`bytes`/`string`) return sized via `ReturnRef::with_length`, and multiple scalar returns
(referenced positionally).

Not yet ported (mirrors the `TODO`s at `js/index.js:398,435`): a `ReturnRef` nested inside an
array/tuple argument, array-element references (`result[0]`) spliced into an array parameter, and
struct field access by name. These are documented in `rust/crates/builder/src/lib.rs`.

Note: `js/cli.js` cannot pass partial-return refs through its CLI (its `JSON.parse` reviver
stringifies the numeric ref fields, which its own validator then rejects). The Rust CLI accepts
them; ref-chaining parity is therefore verified on-chain via `RustLibrary`, not by diffing CLIs.

## See Also

- Conventions → .claude/rules/rust.md
- Canonical bit layout → schema/offset-schema.json, docs/contracts.md
- JS counterpart → docs/javascript.md
