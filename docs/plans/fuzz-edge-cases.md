<!-- agentify: generated 2026-05-31 | score-before: 0 | source: 1.3.0 -->
---
title: Property-based fuzz tests for JS builder
status: ready
---

## What
Add property-based tests for the JavaScript TransactionBuilder that generate
random call sequences and verify invariants (no memory overlap, correct
descriptor wiring, valid offsets). Also un-skip `test_partial_return_overflow`
and test in both layers.

## Why
- Current JS tests are per-feature integration tests with hardcoded inputs.
  Property-based testing would find edge cases the human-authored inputs miss.
- `test_partial_return_overflow` in `MulticallScripter.t.sol` is **skipped**
  with a comment saying the JS layer tests it — but the JS layer doesn't
  actually test the `require()` in `CallBuilder.sol:87`.

## Acceptance criteria
- [ ] Property test: random call sequence → `build()` → verify:
  - No two memTarget ranges overlap
  - Every memTarget + resultLength ≤ calldata region size
  - `returnOffsets[i] + resultLengths[i] ≤ returnDataSize`
  - All calltype flags are valid
  - `num_vars ≤ 3`
- [ ] `test_partial_return_overflow` is un-skipped and passes in both:
  - Solidity: `CallBuilder.sol:87` `require(returnLength <= type(uint16).max)`
  - JS: `staticCallPartialReturn` throws on `returnDataSize > 0xFFFF`
- [ ] Fuzz test: `test_partial_return` with randomized valid inputs in `MulticallScripter.t.sol`

## Steps
1. Install a property-testing library for Bun (e.g., fast-check or write custom)
2. Create `js/test/property-tests.test.js`
3. Implement random call sequence generator
4. Assert invariants on each generated sequence
5. Un-skip `test_partial_return_overflow` in `CallBuilder.t.sol` (test the require)
6. Add `test_fuzz_partial_return(uint40[3], uint16[3], uint16[3], uint16)` to `MulticallScripter.t.sol`
7. Run full test suite

## Dependencies
- Shared encode/decode schema (complete)
