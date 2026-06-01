<!-- agentify: generated 2026-05-31 | score-before: 0 | source: 1.3.0 -->
---
title: Gas regression testing
status: complete
---

## What
Add CI-enforced gas regression checks. The existing `GasComparisons.t.sol`
benchmarks against Weiroll but doesn't fail on regression — it only logs.

## Why
Gas efficiency is a core value proposition (MulticallScripter beats Weiroll
by ~2× in current benchmarks). A change that silently degrades gas usage
undermines the project's main advantage over alternatives.

## Acceptance criteria
- [x] `GasComparisons.t.sol` tests assert on gas usage (not just log)
- [x] Gas snapshot committed to repo (`forge snapshot` output)
- [x] CI compares PR gas usage against snapshot and fails on regression >5%
- [x] Gas benchmarks for at minimum:
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

## Research grounding
Peer-reviewed literature (251 papers; `research/evm-vm-gas-verification/RESEARCH.md`)
establishes that no study has measured a chaining interpreter VM's gas breakdown.
The Max-SMT Superoptimizer (DOI 10.1007/978-3-030-99524-9_11, full text)
decomposes low-level EVM savings as 51% stack scheduler + 34.4% stack rules +
14.6% memory rules — memory savings are real but not dominant. The regression
thresholds here should be calibrated against the benchmarks in
`docs/plans/gas-benchmark-suite.md`, which decompose interpreter overhead into
dispatch vs marshalling at varying payload sizes.

## References
- `test/GasComparisons.t.sol` (existing — convert from logging to assertions)
- `test/GasBenchmarks.t.sol` (created — see `docs/plans/gas-benchmark-suite.md`)
- `.gas-snapshot` (existing file in repo)
- `research/evm-vm-gas-verification/RESEARCH.md` — full gas-axis findings
