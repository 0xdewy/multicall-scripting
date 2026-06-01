<!-- agentify: generated 2026-06-01 | score-before: 75 | source: 1.4.0 -->
# multicall-scripting

Atomic multi-contract execution with return-value chaining: the return data of one
call can be spliced into the calldata of a later call within the same transaction.
A Solidity executor (`src/MulticallScripter.sol`, pure-assembly `execute()`) and a
JavaScript transaction builder (`js/index.js`) share a 256-bit offset encoding
defined canonically in `js/offset-schema.json`.

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

# Run a specific Solidity test
forge test --match-test test_partial_return_data -vv

# Run a specific JS test
cd js && bun test/test/simpleValue.js

# Execute example strategies
cd js/examples && bun run multiple_swaps.js
```

## Key Constraints

- **Bit alignment must match** between JavaScript and Solidity — constants (STATIC_CALL_FLAG=0xFF, VALUE_OFFSET=248, etc.) must be identical in both layers. When adding features, update `src/MulticallScripter.sol` and `js/index.js` together.
- **The `mcopy` opcode (EIP-5656) is required** — this project targets Cancun+ EVM. Do not remove mcopy usage or replace with slower opcodes.
- **Maximum 3 return variables per call** — the 256-bit offset encoding only fits 3×40-bit memTargets, 3×16-bit resultLengths, and 3×16-bit returnOffsets.
- **Each return value descriptor can only be used once** — passing the same proxy to two calls throws. Create a new addCall() for a fresh descriptor.

## Navigation

| Topic | Where to find it |
|-------|-----------------|
| Architecture & components | docs/OVERVIEW.md |
| Solidity contracts | docs/contracts.md |
| JavaScript library | docs/javascript.md |
| Test patterns | docs/testing.md |
| Example strategies | docs/examples.md |
| Solidity conventions | .claude/rules/solidity.md |
| JavaScript conventions | .claude/rules/javascript.md |
| Testing conventions | .claude/rules/testing.md |
| Implementation plans | docs/plans/ |
| Feature specs | docs/specs/ |
| Review findings | docs/reviews/ |
| Find anything quickly | .claude/context-map.md |
| How to maintain these docs | docs/NAVIGATION.md |
| Personal preferences | CLAUDE.local.md (add to .gitignore) |
