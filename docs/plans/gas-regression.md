<!-- agentify: generated 2026-05-31 | score-before: 0 | source: 1.3.0 -->
---
title: Gas regression testing
status: ready
---

## What
Add CI-enforced gas regression checks. The existing `GasComparisons.t.sol`
benchmarks against Weiroll but doesn't fail on regression — it only logs.

## Why
Gas efficiency is a core value proposition (MulticallScripter beats Weiroll
by ~2× in current benchmarks). A change that silently degrades gas usage
undermines the project's main advantage over alternatives.

## Acceptance criteria
- [ ] `GasComparisons.t.sol` tests assert on gas usage (not just log)
- [ ] Gas snapshot committed to repo (`forge snapshot` output)
- [ ] CI compares PR gas usage against snapshot and fails on regression >5%
- [ ] Gas benchmarks for at minimum:
  - `addUints`: 30 sequential additions
  - `staticCallPartialReturn` with 3 variables
  - `call` with msg.value
  - `staticCall` with return data chaining

## Steps
1. Change `GasComparisons.t.sol` to use `assertLt(gasUsed, THRESHOLD)` instead of just logging
2. Run `forge snapshot` to establish baselines
3. Commit `.gas-snapshot` (already exists — update it)
4. Add CI step: `forge snapshot --check` (fails if gas differs from committed snapshot)
5. Add comparison against Multicall3 as additional baseline
6. Document gas characteristics in `docs/contracts.md`

## References
- `test/GasComparisons.t.sol` (existing)
- `.gas-snapshot` (existing file in repo)
