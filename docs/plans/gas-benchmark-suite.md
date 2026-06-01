---
title: Gas benchmark suite — interpreter-overhead decomposition
status: complete
---

## What
Build a comprehensive gas benchmark suite (`test/GasBenchmarks.t.sol`) that
measures the interpreter overhead of MulticallScripter by decomposing it into
its constituent costs: dispatch, marshalling, and total-vs-native.

## Why
Peer-reviewed literature (251 papers analyzed in `research/evm-vm-gas-verification/RESEARCH.md`)
establishes the EVM gas model well — but no study measures a chaining interpreter
VM's overhead directly. The repo sits in genuine white space. The Max-SMT
Superoptimizer (DOI 10.1007/978-3-030-99524-9_11, full text) decomposes low-level
EVM savings as 51% stack scheduler + 34.4% stack rules + 14.6% memory rules —
suggesting dispatch savings may exceed memory savings at small payloads, making
this the #1 empirical question the repo can uniquely answer.

## Acceptance criteria
- [ ] **Dispatch-only benchmark:** N no-op staticcalls (empty calldata, no
  return-data chaining) measuring the pure script-loop overhead
- [ ] **Marshalling benchmarks** at 3 payload sizes (32, 320, 1024 bytes):
  chain return data between calls and measure overhead
- [ ] **Total-vs-native benchmark:** same sequence executed via MulticallScripter
  vs separate EOAs vs Multicall3 — isolate interpreter overhead
- [ ] **`mcopy` vs loop-copy:** compare Cancun `mcopy` (current) vs word-loop
  `MLOAD`/`MSTORE` for return-data splicing
- [ ] **dispatch-vs-marshalling decomposition:** for a representative script,
  subtract dispatch-only from total to isolate marshalling cost
- [ ] **Partial return overhead:** staticCallPartialReturn (0xFC, 3 vars) vs
  equivalent full-return static calls
- [ ] CI regression check: no benchmark regresses >5% from committed snapshot
- [ ] Data reported in table form suitable for inclusion in `docs/contracts.md`

## Steps
1. Read `.gas-snapshot`, `test/GasComparisons.t.sol`, `src/MulticallScripter.sol`
2. Create `test/GasBenchmarks.t.sol`:
   - `NmMath` helper: a simple `add(a,b)` contract returning `uint256`
   - `BufferReturn` helper: returns `bytes` of configurable length
   - Benchmarks use `assertLe(gasUsed, THRESHOLD)` with thresholds established
     from initial measurements
3. Measure and record:
   - a. Dispatch baseline: 1, 5, 10, 30 static calls to `add()`, no chaining
   - b. Marshalling at 32 bytes (uint256 chaining): 5-30 calls, each uses
        prior return data as next input
   - c. Marshalling at 320 bytes (bytes(320) chaining): 5 calls
   - d. Marshalling at 1024 bytes (bytes(1024) chaining): 5 calls
   - e. 30-call chain: Scripter vs pure direct calls vs Multicall3
   - f. staticCallPartialReturn (0xFC): 3 vars extracted, repeated 5 times
   - g. Dispatch-vs-marshalling breakdown: subtract (a) dispatch cost from
        (b) total cost to approximate marshalling share
4. Run `forge snapshot` to commit baseline
5. Add `forge snapshot --check` step in `.github/workflows/test.yml`
6. Cross-reference results in `docs/plans/gas-regression.md`

## Dependencies
- `docs/plans/ci-pipeline.md` (CI must run forge snapshot --check)
- `docs/plans/gas-regression.md` (regression thresholds calibrated from these
  benchmarks)

## Research grounding
- GASOL (DOI 10.1007/978-3-030-45237-7_7): storage dominates total-transaction
  gas — benchmarks must isolate interpreter-attributable overhead from callee
  storage costs
- Max-SMT Superoptimizer (DOI 10.1007/978-3-030-99524-9_11): 14.6% of low-level
  EVM gas savings come from memory rules — expect marshalling cost to be
  significant but not dominant at small payloads
- Running on Fumes (full text): memory gas cost ∝ access distance — quadratic
  expansion cost could dominate at large payloads
- MultiCall paper (DOI 10.1145/3457337.3457839, unavailable): the one study that
  might contain interpreter gas figures; our benchmarks fill this gap

## References
- `test/GasComparisons.t.sol` — existing gas comparison (needs assertion
  conversion — see gas-regression plan)
- `test/Helpers.sol` — mock contracts (Math, Events, etc.)
- `research/evm-vm-gas-verification/RESEARCH.md` — full literature analysis
