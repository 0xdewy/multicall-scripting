<!-- agentify: generated 2026-05-31 | score-before: 0 | source: 1.3.0 -->
---
title: Security self-audit (AUDIT.md)
status: complete
---

## What
Create `AUDIT.md` covering the trust model, attack surface, and known risks
of MulticallScripter. The README references this file but it doesn't exist.

## Why
The README states "See AUDIT.md for a self-assessment of known issues.
Not suitable for production use without independent review." — but the file
doesn't exist. Anyone considering using this library has no security context.

## Acceptance criteria
- [x] `AUDIT.md` exists at repo root
- [x] Covers at minimum:
  - **Trust model:** Who supplies what input? (user supplies all arrays —
    offsets determine memory targets, so caller controls everything)
  - **Reentrancy:** Stateless contract, low risk. But `delegatecall` would
    change this if implemented
  - **Frontrunning:** Attacker can reorder or replace user's call batch
  - **mcopy bounds:** `memTarget + resultLength` checked against calldata region
  - **Assembly correctness:** The entire executor is in Yul — no Solidity
    safety nets for overflow or memory corruption
  - **Value handling:** ETH sent via `values[]` is forwarded; contract rejects
    direct ETH
  - **EIP-7702 interaction:** `7702Caller.sol` delegates to MulticallScripter
  - **Known gaps:** 0xFD unimplemented, 0xFB undertested, no formal verification
- [x] Severity ratings for each finding (critical/high/medium/low)
- [x] Recommendations for production use (minimum: independent audit)

## Steps
1. Review all assembly paths in `MulticallScripter.sol`
2. Review `7702Caller.sol` for auth bypass risks
3. Document trust model: user provides targets, offsets, calldatas, values
4. Document attack surface per component
5. Cross-reference with findings from docs/reviews/
6. Write AUDIT.md with findings + severity + recommendations

## References
- `src/MulticallScripter.sol` — core executor
- `src/7702Caller.sol` — EIP-7702 wrapper
- README.md line "See AUDIT.md for a self-assessment"
