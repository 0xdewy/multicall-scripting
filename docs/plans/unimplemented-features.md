<!-- agentify: generated 2026-05-31 | score-before: 0 | source: 1.3.0 -->
---
title: Implement delegatecall + improve 0xFB test coverage
status: ready
---

## What
Implement the `DELEGATE_CALL_FLAG (0xFD)` path in `MulticallScripter.execute()`
and write comprehensive tests for `CALL_PARTIAL_RETURN_FLAG (0xFB)`.

## Why
- **0xFD:** Currently reverts with `InvalidCalltype`. The flag is defined in
  both layers but has no implementation — it's dead code that confuses users.
  Implementing it enables proxy-pattern strategies where a contract delegates
  to another while using its own storage context.
- **0xFB:** The flag exists, an encoding helper exists in both layers, a single
  Solidity test exists in `CallBuilder.t.sol`, but there are no tests in
  `MulticallScripter.t.sol` and no JS roundtrip tests for it. The path is
  undertested.

## Acceptance criteria
- [ ] `DELEGATE_CALL_FLAG (0xFD)` in `execute()` performs a `delegatecall`
- [ ] Delegate call uses caller's context (storage, msg.sender, msg.value)
- [ ] JS encoding helper `delegateCall()` exists in `encoding.js`
- [ ] `test_delegatecall` in `MulticallScripter.t.sol`
- [ ] Delegatecall roundtrip test in `JsLibrary.t.sol`
- [ ] `CALL_PARTIAL_RETURN_FLAG (0xFB)` tests in `MulticallScripter.t.sol`:
  - [ ] Fuzz: single variable, varying msg.value
  - [ ] Fuzz: 3 variables with msg.value
  - [ ] Edge: valueIndex=0 (no msg.value)
  - [ ] Edge: returnDataSize=0 (no return data)
- [ ] `callPartialReturn` roundtrip in `schemaRoundtrip.test.js`

## Steps
1. Add `delegatecall` case to `execute()` assembly dispatch (after the 0xFB block)
2. Add `delegateCall()` helper to `src/CallBuilder.sol`
3. Add `delegateCall()` to `js/encoding.js`
4. Add `DELEGATE_CALL` layout to `js/offset-schema.json` (reuse "regular" layout)
5. Write `test_delegatecall` in MulticallScripter.t.sol
6. Write 0xFB tests in MulticallScripter.t.sol
7. Add roundtrip tests in schemaRoundtrip.test.js
8. Add roundtrip test in JsLibrary.t.sol
9. Run full test suite

## Dependencies
- Shared encode/decode schema (complete)
