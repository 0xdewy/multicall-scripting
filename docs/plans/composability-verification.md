---
title: Composability safety — formal non-interference property statement
status: ready
---

## What
Define a formal non-interference property for MulticallScripter scripts, using
the hyperproperty framework from the literature, as a prerequisite for
machine-checkable composability verification.

## Why
Research (251 papers; `research/evm-vm-gas-verification/RESEARCH.md`) found:
- Composability *is* formalizable as non-interference — *DeFi Composability as
  MEV Non-interference* (arXiv:2309.10781, abstract only) provides a definition,
  and *A Semantic Framework for the Security Analysis of Ethereum Smart
  Contracts* (DOI 10.1007/978-3-319-89722-6_10, full text) defines call integrity
  as a hyperproperty with a soundness theorem (Theorem 1).
- But existing EVM verifiers (eThor, VerX, solc-verify) target single-trace
  reachability — the wrong shape for 2-safety non-interference.
- The gap is **one well-defined reduction**: self-composition to reduce 2-safety
  non-interference to single-trace reachability, applied to the data-dependent
  dispatch of the chaining VM. The pieces nearly fit.

Getting the property statement right is the hard part (the verification machinery
can follow). This plan produces that property statement.

## Acceptance criteria
- [ ] Formal non-interference property stated for multicall scripts:
  "For any sequence of calls in a multicall script, the return data spliced
  into call N+1 depends only on the script's specified data flow, not on
  adversarial reordering or interference from untrusted callees."
- [ ] Property decomposed into verifiable sub-properties following the Semantic
  Framework's pattern (independence properties + single-entrancy → call integrity)
- [ ] Concrete instantiations for the MulticallScripter execution model:
  - AC-code independence: callee code does not affect the interpreter's
    control flow (i.e., CALL/RETURNDATA behavior)
  - AC-effect independence: callee return data outside the specified extraction
    region does not affect subsequent call construction
  - Chaining integrity: returndata offsets and memory targets are respected
    regardless of callee behavior
- [ ] Property stated at bytecode-semantics level (source-level tools are
  structurally excluded — see formal-verification plan)
- [ ] Self-composition sketch: how to reduce the 2-safety property to a
  single-trace reachability obligation on a product VM
- [ ] Documented in `docs/reviews/composability-property.md`

## Steps
1. Study the Semantic Framework's call integrity decomposition (full text
   available in `data/fulltext/`)
2. Map each sub-property (AC-code independence, AC-effect independence,
   single-entrancy) to the MulticallScripter execution model
3. Add the chaining-specific property: returndata used for calldata construction
   respects the script's declared offsets
4. Write formal property statement in temporal logic or Hoare-style notation
5. Sketch self-composition reduction: duplicated VM state with synchronized
   dispatch, differing only in callee-controlled bytes; prove output
   indistinguishability via product-VM reachability invariant
6. Identify which existing bytecode tool (Halmos, hevm, KEVM) could discharge
   the resulting single-trace obligations

## Dependencies
- `docs/plans/formal-verification.md` — bytecode-level verification constraint
- `docs/plans/symbolic-execution.md` — Halmos/hevm for encoding-layer proofs
- `research/evm-vm-gas-verification/data/fulltext/` — Semantic Framework,
  eThor, VerX full texts
- `src/MulticallScripter.sol` — the VM whose semantics must be modeled

## Research grounding
- Semantic Framework (DOI 10.1007/978-3-319-89722-6_10, full text): call
  integrity hyperproperty, Theorem 1 soundness, PDG-based non-interference
  overapproximation
- DeFi Composability as MEV Non-interference (arXiv:2309.10781, abstract only):
  composability definition as non-interference — the definitional target
- eThor (DOI 10.1145/3372297.3417250, full text): sound bytecode analysis,
  ⊤-havoc on unknown callee return values — the analysis technique to build on

## References
- `research/evm-vm-gas-verification/RESEARCH.md` — §2-3, H2/H3 findings
- `docs/plans/formal-verification.md`
- `docs/plans/symbolic-execution.md`
