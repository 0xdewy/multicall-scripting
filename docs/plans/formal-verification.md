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

## Critical constraint: bytecode-level verification only

Research (251 papers; `research/evm-vm-gas-verification/RESEARCH.md`) establishes
that **source-level verifiers structurally cannot express this VM's semantics**.
solc-verify "does not support low-level function calls such as callcode and
delegatecall as … would require encoding of the EVM details" and "does not
support inline assembly" (DOI 10.1007/978-3-030-41600-3_11, full text) — exactly
the constructs MulticallScripter is built from (assembly memory manipulation,
CALL/STATICCALL, mcopy). eThor demonstrates that sound bytecode analysis must
operate over EVM small-step semantics because dynamic jumps defeat static CFG
recovery (DOI 10.1145/3372297.3417250, full text).

**Source-level tools (Slither, solc-verify, VerX-on-Solidity-source) are a dead
end for this VM.** Verification tooling MUST target EVM bytecode: Halmos
(symbolic execution of bytecode), hevm (bytecode-level symbolic execution), or
Certora with bytecode-level specs. For composability safety specifically, see
`docs/plans/composability-verification.md`.

## Dependencies
- Shared encode/decode schema (complete)
- `docs/plans/composability-verification.md` — formal non-interference property
  statement for multicall scripts
- `docs/plans/symbolic-execution.md` — Halmos/hevm for encoding-layer proofs
