# 05 — Decision Log (PI is sole writer)

Verdicts enter as **PROPOSED** (Phase 3) → **RATIFIED** after red-team (Phase 4).

---

### V-001 — H1 (gas: cost is in the bytes, not the dispatch)
**Verdict: INCONCLUSIVE** (mechanism supported; interpreter-specific claim unmeasured). **State: RATIFIED.** Confidence: moderate, hedged for missing-evidence risk (MultiCall paper unavailable — could contain interpreter measurements that would resolve this).
- Mechanism grounded in EVM gas schedule: memory expansion (quadratic) + returndata/calldata copy cost ≫ dispatch (JUMPI/PUSH ~3–10 gas), supported by *A Max-SMT Superoptimizer* (full text, DOI 10.1007/978-3-030-99524-9_11), *GASOL* (full text, DOI 10.1007/978-3-030-45237-7_7), and *Running on Fumes* (full text).
- **But:** no corpus paper measures a Weiroll/multicall interpreter's gas breakdown; the falsifier's "false-dichotomy" point (CALL+SSTORE dominate *total* gas) is answered only by the rebuttal's "interpreter-attributable delta" reasoning, which is sound engineering but not in the literature. *MultiCall: A Transaction-batching Interpreter for Ethereum* (DOI 10.1145/3457337.3457839) is in corpus but failed to fetch — the one paper that could shift this from INCONCLUSIVE.
- Evidence: `04-evidence/H1-{proponent,falsifier,rebuttal}.md`.
- Red-team: no overturn. Added missing-evidence hedge.

### V-002 — H2 (composability formalizable as non-interference; verifiable with existing frameworks)
**Verdict: INCONCLUSIVE — SPLITS.** **State: RATIFIED.** Confidence: high on the split; tentative on each half (the MEV non-interference paper is abstract-only, limiting confidence in the definition's precision).
- **Supported (tentative):** composability *is formalizable* as a non-interference property — *DeFi Composability as MEV Non-interference* (abstract only; manifest: failed, arXiv:2309.10781) provides a formal definition. Independently, *A Semantic Framework for the Security Analysis of Ethereum Smart Contracts* (full text, DOI 10.1007/978-3-319-89722-6_10) defines call integrity as a hyperproperty with an explicit information-flow/non-interference pedigree.
- **Refuted:** "machine-checkable with EXISTING frameworks." Non-interference is a 2-safety hyperproperty; the corpus's verification tools (eThor, VerX, solc-verify — all full text) verify single-trace reachability/temporal-safety properties, the wrong shape. No EVM non-interference verifier exists in the corpus.
- Evidence: `04-evidence/H2-{proponent,falsifier,rebuttal}.md`.
- Red-team: no overturn. Corrected MEV paper status from "full text" to "abstract only."

### V-003 — H3 (return-data chaining is the verification bottleneck; tractable only at bytecode level)
**Verdict: SUPPORTED (reframed) — "necessary but not sufficient."** **State: RATIFIED.** Confidence: moderate (strong on necessity from solc-verify's own feature gap; the insufficiency half is well-grounded but rests on eThor's ⊤-havoc and GASOL's parametric bounds rather than direct chaining-VM experiments).
- **Supported:** bytecode-level semantics are *necessary* — solc-verify (full text, DOI 10.1007/978-3-030-41600-3_11) states it "does not support low-level function calls such as callcode and delegatecall as … would require encoding of the EVM details" and "does not support inline assembly." A Weiroll interpreter decodes call targets/args from a runtime `bytes` array via assembly-level memory/CALL ops — precisely what solc-verify excludes. eThor (full text, DOI 10.1145/3372297.3417250) demonstrates that sound EVM analysis must operate over bytecode small-step semantics because dynamic jumps defeat static CFG recovery.
- **Refuted (the over-claim):** "tractable ONLY at bytecode level." Bytecode tools also hit path explosion — eThor collapses unknown-callee return values to λx.⊤ (full text); GASOL produces parametric bounds for data-dependent flow (full text). Bytecode level **relocates** the hardness, not dissolves it. Drop "tractable"; keep "necessary."
- Evidence: `04-evidence/H3-{proponent,falsifier,rebuttal}.md`.
- Red-team: no overturn. The red-team's Challenge 3 (gas axle overstatement) noted a valid precision issue but does not affect H3's verification-focused verdict.

### V-004 — H4 (unsound analysis beats sound FV per effort; FV has no real-world ROI)
**Verdict: INCONCLUSIVE — SPLITS (collapses to clause 2).** **State: RATIFIED.** Confidence: high on clause 2 (absence across well-searched corpus); scope-bounded — the absence is in this corpus; a dedicated outcome-study search would be needed to establish field-wide absence.
- **Refuted (clause 1):** "more exploitable bugs per unit effort" is a category error — VerX (full text, DOI 10.1109/sp40000.2020.00024) verifies functional/temporal properties unsound scanners (Securify, Osiris) cannot express; the two target different bug populations. "Per unit effort" is unmeasured anywhere in the corpus (systematic review confirms: no effort-normalized comparison of tool classes). Osiris/ZEUS population-scale vulnerability counts conflate pattern-match flags with confirmed exploits (eThor shows ZEUS recall at 11.4%).
- **Supported (clause 2):** FV's own flagship (VerX) concedes "limited adoption" and heavy manual effort (full text). No corpus paper quantifies production exploited-bug reduction attributable to FV. Scope caveat: this absence is established for this corpus; a targeted search for industrial production-outcome studies would confirm whether the absence is field-wide.
- **Surviving form:** FV and unsound static analysis are **complementary, not rank-orderable** on corpus evidence; FV's real-world security ROI is undemonstrated *in this corpus*.
- Evidence: `04-evidence/H4-{proponent,falsifier,rebuttal}.md`.
- Red-team: no overturn. Added scope caveat (corpus-local vs field-wide absence) per Challenge 4; corrected VerX status from "abstract only" to "full text."

---

## Red-team responses (Phase 4 ratification notes)

The red team (06-red-team.md) raised five challenges. None overturns a verdict, but four warranted corrections:
1. **Novelty of coupling insight** — acknowledged as partially present in lit map. RESEARCH.md credits the lit map and distinguishes what the testing *confirmed* vs what it *reframed*.
2. **Missing-evidence risk** — hedging added to V-001, V-002, V-003.
3. **Gas-axis overstatement** — RESEARCH.md qualifies the gas-coupling claim.
4. **Corpus-local vs field-wide scope** — scope caveat added to V-004 and RESEARCH.md.
5. **Positive convergence under-stated** — elevated in RESEARCH.md: the pieces nearly fit; the gap is one well-defined reduction.

---

## Cross-cutting observation (carried forward)

All four verdicts share one shape: **the corpus supplies the building blocks (gas schedule + formal semantics + a non-interference definition + verification tools) but is silent on the assembled artifact** — no peer-reviewed study measures or verifies an actual return-data-chaining interpreter VM. The trade-off the question asks about is **under-determined by the literature**, not resolved by it.

**Correction note (from manifest audit):** V-001 originally listed KEVM as "full text" — corrected to reflect manifest status (failed). V-002 originally listed the MEV Non-interference paper as "full text" — corrected (failed). V-004 originally listed VerX as "abstract only" — corrected (full text). These were status-tagging errors from the earlier session's PI write-up, not evidential errors; the underlying reasoning and citations were consistent with the actual manifest.
