<!-- agentify: generated 2026-05-31 | score-before: 0 | source: 1.3.0 -->
---
paths:
  - "src/**/*.sol"
  - "test/**/*.sol"
  - "script/**/*.sol"
---

## Conventions

- All Solidity files start with `// SPDX-License-Identifier: GPL3` followed by `pragma solidity ^0.8.28;`
- Named imports only: `import {ContractName} from "path/to/file.sol";` — never `import "path.sol";`
- For custom errors, use either `error Name(uint256 arg);` with 4-byte selector reverts in assembly OR `require()` with string messages — both patterns exist in the codebase; follow the pattern of the file you're editing
- Test contracts use multiple inheritance: `contract MyTest is Test, CallBuilder, MulticallScripter { }` to use both offset-building helpers and execution methods directly
- Contract-level state arrays (`targets[]`, `offsets[]`, `calldatas[]`, `values[]`) are used in tests — Foundry's test isolation ensures they're fresh per test

## Patterns

### Offset constant definitions
```solidity
uint256 constant STATIC_CALL_FLAG = 0xFF;
uint256 constant CALL_FLAG = 0xFE;
uint256 constant VALUE_OFFSET = 248;
```
These must match `js/index.js` exactly. When adding a new flag: add it to both files, add a decode case in the `execute()` assembly dispatch, and add the encode helper in both `CallBuilder.sol` and `js/index.js`.

### Assembly blocks
- The `execute()` function in `MulticallScripter.sol` is pure Yul assembly — all memory management, looping, and call dispatch happens in assembly
- Every assembly section has comment blocks showing exact bit field layouts:
  ```solidity
  // [8:calltype][8:valueIndex][120:memTarget][120:resultLength]
  ```
- Error reverts in assembly use a 4-byte selector written to memory then `revert(pos, 4)`:
  ```solidity
  mstore(0, 0x8f61746f) // InvalidCalltype selector
  revert(0x1c, 0x04)
  ```

### Memory layout in execute()
- All calldata entries are copied contiguously into memory at the start of `execute()`
- Free memory pointer (`mstore(0x40, ...)`) is advanced past the calldata region before any calls
- After each static call, return data is `mcopy`'d from `returndatasize` region to the target positions within calldata memory

## Pitfalls

- NEVER change bit field sizes in offset encoding without updating both the Solidity assembly decoder AND the JavaScript encoder — the layouts are hand-rolled and there is no shared schema
- NEVER use `.transfer()` or `.send()` for ETH — the contract is stateless and rejects direct ETH in `receive()`. Use `execute()` with `values[]` array
- NEVER import `src/` contracts into `CallBuilder.sol` — it only imports `Constants` to avoid circular dependencies
- Dynamic return types in tests: arrays are encoded as `abi.encodeWithSelector` with fixed params; use `abi.decode()` to parse dynamic arrays back

## See Also

- On-chain execution flow → docs/contracts.md
- JavaScript offset encoding → docs/javascript.md
- Constants sync between layers → docs/OVERVIEW.md
