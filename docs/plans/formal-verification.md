<!-- agentify: generated 2026-05-31 | score-before: 0 | source: 1.3.0 -->
---
title: Formal verification of encoding invariants
status: ready
---

## What
Add Certora or Halmos specs proving that the offset encoding/decoding is
correct across all valid inputs — the two layers produce identical output
for the same parameters.

## Why
The current defense is integration tests (JsLibrary.t.sol FFI roundtrips)
which sample a finite set of inputs. A single shift-by-1 or mask error
silently corrupts memory at runtime. Formal verification would prove
absence of such bugs for all inputs within the valid ranges.

## Acceptance criteria
- [ ] Encoding invariant: `solDecode(jsEncode(params)) = params` for all valid params
- [ ] Memory bounds invariant: `memTarget + resultLength ≤ calldata_region_end`
- [ ] Partial return invariant: 3×40 + 3×16 + 3×16 + 16 + 8 ≤ 256 (no overflow)
- [ ] Value index invariant: `valueIndex ∈ {0, ..., 255}`
- [ ] At least one invariant spec runs in CI

## Steps
1. Choose tool: Certora Prover (requires setup) or Halmos (symbolic testing via Foundry)
2. Write specs for:
   - `staticCall(memTarget, resultLength)` → encode → decode → verify
   - `stateChangingCall(valueIndex, memTarget, resultLength)` → same
   - `staticCallPartialReturn(memTargets[], resultLengths[], returnOffsets[], size)` → same
   - Memory bounds: `memTarget + resultLength ≤ calldataRegion`
3. Integrate into CI
4. Document in `docs/contracts.md` under a new "Verification" section

## Dependencies
- Shared encode/decode schema (complete)
