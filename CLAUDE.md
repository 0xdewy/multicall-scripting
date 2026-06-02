<!-- agentify: generated 2026-06-01 | score-before: 75 | source: 1.4.0 -->
# multicall-scripting

Atomic multi-contract execution with return-value chaining: the return data of one
call can be spliced into the calldata of a later call within the same transaction.
A Solidity executor (`src/MulticallScripter.sol`, pure-assembly `execute()`), a
JavaScript transaction builder (`js/index.js`), and a Rust builder (`rust/`, alloy-based)
all share a 256-bit offset encoding defined canonically in `schema/offset-schema.json`.

@AGENTS.md

## Commands

```bash
# Install dependencies (JS)
cd js && bun install

# Install dependencies (Solidity/Foundry)
forge install

# Build contracts
forge build

# Test all layers
forge test -vv
cd js && bun test
cd rust && cargo test

# Run a specific Solidity test
forge test --match-test test_partial_return_data -vv

# Run a specific JS test
cd js && bun test/test/simpleValue.js

# Build/test the Rust layer (offset constants are codegen'd from offset-schema.json)
cd rust && cargo build && cargo test

# Regenerate cross-language golden vectors after changing the JS encoders
bun js/scripts/gen-test-vectors.js

# Execute example strategies
cd js/examples && bun run multiple_swaps.js
```

## Key Constraints

- **Bit alignment must match across all three layers** — Solidity, JavaScript, and Rust share one bit layout. `schema/offset-schema.json` is the single source of truth: the Rust constants are codegen'd from it (`rust/crates/codec/build.rs`), the JS layer reads a generated mirror `js/offset-schema.json` (synced via `bun run sync:schema`; the npm package bundles the mirror), and `src/MulticallScripter.sol` mirrors it by hand. When adding a flag/feature, edit `schema/offset-schema.json` first, then `bun run sync:schema`, update `src/MulticallScripter.sol`, `js/index.js`, and `rust/`, and regenerate golden vectors (`bun js/scripts/gen-test-vectors.js`).
- **The `mcopy` opcode (EIP-5656) is required** — this project targets Cancun+ EVM. Do not remove mcopy usage or replace with slower opcodes.
- **Maximum 3 return variables per call** — the 256-bit offset encoding only fits 3×40-bit memTargets, 3×16-bit resultLengths, and 3×16-bit returnOffsets.
- **Each return value descriptor can only be used once** — passing the same proxy to two calls throws. Create a new addCall() for a fresh descriptor.

## Navigation

| Topic | Where to find it |
|-------|-----------------|
| Architecture & components | docs/OVERVIEW.md |
| Solidity contracts | docs/contracts.md |
| JavaScript library | docs/javascript.md |
| Rust library | docs/rust.md |
| Test patterns | docs/testing.md |
| Example strategies | docs/examples.md |
| Solidity conventions | .claude/rules/solidity.md |
| JavaScript conventions | .claude/rules/javascript.md |
| Rust conventions | .claude/rules/rust.md |
| Testing conventions | .claude/rules/testing.md |
| Implementation plans | docs/plans/ |
| Feature specs | docs/specs/ |
| Review findings | docs/reviews/ |
| Find anything quickly | .claude/context-map.md |
| How to maintain these docs | docs/NAVIGATION.md |
| Personal preferences | CLAUDE.local.md (add to .gitignore) |
