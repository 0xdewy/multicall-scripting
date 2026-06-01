# On-chain multicall/Weiroll VMs — gas, composability, verifiability trade-offs

> **TL;DR:** The literature supplies all the building blocks — a mature EVM gas-optimization tradition, bytecode-level formal semantics, a hyperproperty definition of composability, and sound automated analysis tools — but is silent on the assembled artifact: no peer-reviewed study measures the gas, or formally verifies a property, of a return-data-chaining interpreter VM. The trade-off is **under-determined by the literature, not resolved by it.** Expressiveness forces the bytecode design point, which couples gas and verification to that level; the corpus confirms that source-level tooling is structurally excluded and that the verification gap is one well-defined reduction (single-trace → 2-safety), not a missing foundation. Confidence: moderate — 8 of 16 key papers read in full; the two most on-point papers (MultiCall, MEV Non-interference) failed to fetch.

*251 papers (focused) · 8 read in full · 4 hypotheses tested · 2026-05-31*

---

## What We Found

### 1. Gas: the interpreter-overhead breakdown is empirically open

The EVM gas model is well-characterized. GASOL demonstrates storage dominates total-transaction gas (>97% per-iteration in its example; DOI 10.1007/978-3-030-45237-7_7, full text). Running on Fumes provides the memory-cost model — linear opcode cost + quadratic expansion — and documents storage as persistent while memory is transient between calls (no DOI; full text). The Max-SMT Superoptimizer decomposes low-level EVM savings as 51% stack scheduler + 34.4% stack rules + 14.6% memory rules (DOI 10.1007/978-3-030-99524-9_11, full text).

But no corpus paper measures an interpreter VM's overhead. The rebuttal's "interpreter-attributable delta" framing — subtract the callees' unavoidable CALL+SSTORE costs and compare dispatch vs marshalling on the residual — is sound engineering but is not itself in the literature. *MultiCall: A Transaction-batching Interpreter for Ethereum* (DOI 10.1145/3457337.3457839), the single most on-point paper, failed to fetch. Whether dispatch or inter-call marshalling dominates interpreter overhead is an open empirical question for the host project to measure directly (e.g., gas snapshots comparing `mcopy` vs loop-copy marshalling at varying payload sizes).

### 2. Composability is formalizable as non-interference, but not machine-checkable with existing frameworks

The formal definition exists. *DeFi Composability as MEV Non-interference* (arXiv:2309.10781, abstract only — full text failed) defines composability as a non-interference property. Independently, *A Semantic Framework for the Security Analysis of Ethereum Smart Contracts* (DOI 10.1007/978-3-319-89722-6_10, full text) defines call integrity — "no matter how the attacker can schedule c … the calls of c cannot be controlled by the attacker" — as a hyperproperty, decomposes it into value-dependency properties, proves that the independence properties plus single-entrancy entail call integrity (Theorem 1), and explicitly names the information-flow pedigree: these independence properties "can be overapproximated by static analysis techniques based on program dependence graphs, as done by Joana to verify non-interference in Java."

The gap: non-interference is a **2-safety hyperproperty** (reasoning about pairs of traces). The corpus's verification tools — eThor (DOI 10.1145/3372297.3417250, full text), VerX (DOI 10.1109/sp40000.2020.00024, full text), solc-verify (DOI 10.1007/978-3-030-41600-3_11, full text) — all verify **single-trace reachability** or temporal-safety properties. The machinery exists but does not yet target non-interference. The pieces are closer than the lit map initially suggested: the definition exists, the bytecode semantics exist, and sound automated bytecode analysis exists. What is missing is the bridge — a reduction from 2-safety non-interference to single-trace reachability applied to the data-dependent dispatch of a chaining VM.

### 3. Source-level verifiers are structurally excluded; bytecode semantics are necessary but not sufficient

solc-verify "does not support low-level function calls such as callcode and delegatecall as … would require encoding of the EVM details" and "does not support inline assembly" (DOI 10.1007/978-3-030-41600-3_11, full text). A return-data-chaining VM is implemented in precisely these excluded constructs: low-level CALL/STATICCALL + assembly-level memory manipulation. eThor demonstrates that sound EVM analysis must abandon the "recover a fixed CFG first" abstraction — dynamic jump destinations make "such a sound reconstruction … not trivial" (DOI 10.1145/3372297.3417250, full text). Running on Fumes reports a real soundness hole in Oyente's CFG recovery: multi-target jumps silently dropped all but one target (no DOI; full text).

But bytecode-level analysis does not make the problem tractable — it relocates it. eThor's sound analysis of unknown-callee return values collapses to λx.⊤ (full text). GASOL's data-dependent flow produces parametric bounds, not constants (DOI 10.1007/978-3-030-45237-7_7, full text). The finding is: **bytecode-level EVM semantics are necessary to state the problem soundly; not sufficient to make it easy.** The one paper that could shift this — *MultiCall* (DOI 10.1145/3457337.3457839) — is unavailable.

### 4. Formal verification and unsound analysis are complementary; FV's production ROI is undemonstrated in this corpus

The claim that "unsound analysis catches more exploitable bugs per unit effort than sound FV" is refuted as a category error. VerX verifies custom functional/temporal properties that generic scanners (Mythril, Oyente, Manticore) cannot express — its evaluation runs these scanners against a functional property and shows they fail (DOI 10.1109/sp40000.2020.00024, full text). "Per unit effort" is unmeasured anywhere in the corpus (*Ethereum Smart Contract Analysis Tools: A Systematic Review*, DOI 10.1109/access.2022.3169902, full text, reviews 86 tools with no effort-normalized comparison). Population-scale vulnerability counts (Osiris: 42,108 out of 1.2M, abstract only; ZEUS: 94.6% of 22.4K, abstract only) conflate pattern-match flags with confirmed exploits — eThor shows ZEUS recall at 11.4% (full text).

FV's production exploit-prevention rate is genuinely undemonstrated in this corpus. VerX's introduction concedes "only a handful of smart contract projects … have been formally verified," with "heavyweight interactive-theorem provers" requiring "non-trivial manual effort and expertise, resulting in limited adoption" (full text). No corpus paper presents a controlled comparison of exploited-bug rates for verified vs. unverified contracts. **Scope caveat:** this absence is established for this corpus; a dedicated search for industrial production-outcome studies would be needed to determine whether the absence is field-wide.

The defensible surviving finding: sound FV and unsound static analysis are **complementary, not rank-orderable** on this evidence — they target disjoint property classes with different guarantee strengths and different effort profiles.

### 5. Cross-cutting: the pieces fit more closely than expected

The inquiry found that the verification challenge is not whether the building blocks exist but whether they can be composed. The corpus provides: complete EVM bytecode semantics (KEVM, Semantic Framework), a hyperproperty definition of composability-safety (Semantic Framework Theorem 1 + MEV Non-interference paper), sound automated bytecode analysis (eThor), and a mature survey layer mapping the tool landscape. The gap is one well-defined reduction: reducing 2-safety non-interference to single-trace reachability, applied to the data-dependent dispatch of a chaining VM — not a missing foundation. This is a more optimistic reading than the lit map's "hard case for existing tools," and it is available in the same evidence.

---

## The Novel Insight

The lit map identified three open questions about the gas-expressiveness-verifiability trade-off. The testing found that these questions are not independent — they are coupled through a single underlying choice: **whether the VM operates at the EVM-bytecode level or at a higher abstraction.**

Specifically, the expressive design point (return-data chaining, dynamic types, arbitrary callee composition) **forces** the VM to the bytecode level — solc-verify's own feature gap (no inline assembly, no low-level calls, no EVM memory model) proves that source-level tooling cannot express the VM's core semantics. This in turn means both gas optimization and formal verification must operate at the bytecode level too: the gas model lives there, and sound verification of data-dependent dispatch is only expressible there. The coupling is directional: expressiveness → bytecode → gas-at-bytecode + verification-at-bytecode.

This reframes the research question from "what is the optimal trade-off among three independent dimensions?" to **"given that expressiveness forces the bytecode design point, how should the bytecode-level VM be structured to make gas profiling tractable and verification of non-interference composability decidable?"** — a sharper question that the corpus helps ask but cannot yet answer.

A qualification: the lit map deserves credit — it pre-identified the coupling as "interpreter/dispatch layer vs. native calls" and "bytecode-level formal-verification techniques usable on a dynamic-dispatch interpreter." The testing sharpened this from a plausible hypothesis to a confirmed structural constraint, anchored in solc-verify's explicitly stated design boundaries and eThor's sound dynamic-jump handling.

---

## Hypotheses Tested

| Hypothesis | Verdict | Key evidence |
|---|---|---|
| H1: Gas cost is in bytes (memory copy), not dispatch | **Inconclusive** | GASOL, Max-SMT Superoptimizer, Running on Fumes (full text) support the mechanism; no interpreter measurement exists (MultiCall unavailable) |
| H2: Composability formalizable as non-interference | **Splits** — formalizability supported; existing-framework verifiability refuted | Semantic Framework Theorem 1 (full text) + MEV Non-interference (abstract only) provide definition; eThor/VerX/solc-verify (full text) are single-trace, wrong shape for 2-safety |
| H3: Return-data chaining defeats source-level, tractable only at bytecode | **Supported (reframed)** — bytecode semantics necessary but not sufficient | solc-verify feature gap + eThor dynamic-jump CFG difficulty (full text) prove necessity; eThor ⊤-havoc + GASOL parametric bounds (full text) prove insufficiency |
| H4: Unsound analysis beats FV per effort; FV has no production ROI | **Splits** — clause 1 refuted; clause 2 supported | VerX/eThor (full text) prove complementarity, not rank-ordering; systematic review + FV surveys confirm no production exploit-reduction study exists in this corpus |

---

## Open Questions

**The single most valuable open question:** Can the non-interference composability property defined in the corpus (Semantic Framework + MEV Non-interference paper) be reduced to a reachability/safety property that existing bytecode verifiers (eThor, KEVM's deductive verifier) can discharge, using self-composition or product-program techniques?

This matters because it is the bottleneck that makes H2's formal-definition half a theoretical promise rather than an engineering reality. The corpus supplies the definition and the bytecode semantics; it lacks the bridge. Answering it would determine whether the host project's formal-verification ambition can draw on existing tooling or requires building a bespoke 2-safety verifier. The gap is narrow and well-defined — the right size for a focused follow-up project.

**Secondary open question (empirical):** What is the actual gas breakdown of a chaining interpreter VM? The host project is uniquely positioned to answer this — gas snapshots comparing `mcopy` vs. loop-copy marshalling, and dispatch-only vs. marshalling-only microbenchmarks at varying payload sizes, would produce the direct interpreter-vs-native measurement the corpus lacks.

---

## References

All citations trace to `data/corpus_focused.json` and `data/fulltext/manifest.json`.

1. Albert, Correas, Gordillo, Román-Díez, Rubio (2020). *GASOL: Gas Analysis and Optimization for Ethereum Smart Contracts*. TACAS 2020, LNCS 12079, pp. 118–125. DOI 10.1007/978-3-030-45237-7_7 **[full text]**
2. Albert, Gordillo, Hernández-Cerezo, Rubio (2022). *A Max-SMT Superoptimizer for EVM handling Memory and Storage*. TACAS 2022, LNCS 13243, pp. 201–219. DOI 10.1007/978-3-030-99524-9_11 **[full text]**
3. Albert et al. *Running on Fumes — Preventing Out-of-Gas Vulnerabilities in Ethereum Smart Contracts using Static Resource Analysis*. No DOI. **[full text]**
4. *MultiCall: A Transaction-batching Interpreter for Ethereum* (2021). DOI 10.1145/3457337.3457839 **[failed — unavailable]**
5. Massacci, Ngo, Nie, Venturi, Williams (2023). *DeFi Composability as MEV Non-interference*. arXiv:2309.10781. **[failed — abstract only]**
6. Grishchenko, Maffei, Schneidewind (2018). *A Semantic Framework for the Security Analysis of Ethereum Smart Contracts*. POST 2018. DOI 10.1007/978-3-319-89722-6_10 **[full text]**
7. Schneidewind, Grishchenko, Scherer, Maffei (2020). *eThor: Practical and Provably Sound Static Analysis of Ethereum Smart Contracts*. ACM CCS 2020. DOI 10.1145/3372297.3417250 **[full text]**
8. Permenev, Dimitrov, Tsankov, Drachsler-Cohen, Vechev (2020). *VerX: Safety Verification of Smart Contracts*. IEEE S&P 2020. DOI 10.1109/sp40000.2020.00024 **[full text]**
9. Hajdu, Jovanović (2019). *solc-verify: A Modular Verifier for Solidity Smart Contracts*. VSTTE 2019. DOI 10.1007/978-3-030-41600-3_11 **[full text]**
10. Kushwaha, Joshi, Singh, Kaur, Lee (2022). *Ethereum Smart Contract Analysis Tools: A Systematic Review*. IEEE Access 2022. DOI 10.1109/access.2022.3169902 **[full text]**
11. Torres, Schütte, State (2018). *Osiris: Hunting for Integer Bugs in Ethereum Smart Contracts*. ACSAC 2018. DOI 10.1145/3274694.3274737 **[abstract only]**
12. Kalra, Goel, Dhawan, Sharma (2018). *ZEUS: Analyzing Safety of Smart Contracts*. NDSS 2018. DOI 10.14722/ndss.2018.23082 **[abstract only]**
13. *A Survey on Formal Verification for Solidity Smart Contracts* (2021). DOI 10.1145/3437378.3437879 **[abstract only]**
14. Amani et al. (2018). *Towards verifying ethereum smart contract bytecode in Isabelle/HOL*. DOI 10.1145/3167084 **[abstract only]**
15. Hildenbrandt et al. (2017). *KEVM: A Complete Semantics of the Ethereum Virtual Machine*. **[failed — full text unavailable]**
16. *Measuring Asset Composability as a Proxy for DeFi Integration*. **[abstract only]**
