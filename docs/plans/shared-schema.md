<!-- agentify: generated 2026-05-31 | score-before: 0 | source: 1.3.0 -->
---
title: Extract shared encode/decode schema
status: complete
---

## What
Create `js/offset-schema.json` as a single source of truth for offset bit
layouts, then derive Solidity constants and JavaScript encoding helpers from it.

## Why
The two layers (Solidity assembly + JavaScript BigInt math) maintain identical
bit layouts by convention only. A change requires error-prone manual sync
across three files (`MulticallScripter.sol`, `CallBuilder.sol`, `js/index.js`).

## Acceptance criteria
- [x] `js/offset-schema.json` defines all 5 flags, layouts, and constraints
- [x] `js/encoding.js` imports the schema and exports all constants + encode/decode helpers
- [x] `js/index.js` re-exports from `encoding.js` (backward compatible)
- [x] `Src/MulticallScripter.sol` Constants anchor comment points to schema
- [x] `js/test/schemaRoundtrip.test.js` exhaustively roundtrips all layouts
- [x] `forge test -vv` passes (61/61)
- [x] `cd js && bun test` passes (28/28)
- [x] Cross-layer FFI tests pass (10/10 in JsLibrary.t.sol)

## Steps
1. Create `js/offset-schema.json` — canonical encoding spec
2. Create `js/encoding.js` — schema-derived constants, encode, decode, validate
3. Update `js/index.js` — re-export from encoding.js instead of hardcoding
4. Add `// GENERATED from js/offset-schema.json` comment to Solidity Constants
5. Add `js/test/schemaRoundtrip.test.js` — exhaustive roundtrip tests
6. Verify all existing tests pass unchanged

## Outcome
- **Created:** `js/offset-schema.json`, `js/encoding.js`
- **Modified:** `js/index.js` (re-exports), `src/MulticallScripter.sol` (comment), `js/package.json` (files array)
- **Added:** `js/test/schemaRoundtrip.test.js` (28 tests, all pass)
- **Zero behavioral change** — all encoding output identical to before
