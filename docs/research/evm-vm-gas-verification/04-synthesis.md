# 04 — Synthesis (Synthesizer output)

**Produced from:** 05-decision-log.md (4 proposed verdicts), 01-lit-map.md, 04-evidence/ files (8 proponent/falsifier + 4 rebuttals), data/corpus_focused.json (251 papers), data/fulltext/manifest.json (8 full_text, 2 abstract_only, 6 failed).

---

## What the Evidence Supports (calibrated findings)

### 1. Gas: the interpreter-attributable overhead is under-determined by the literature

**Verdict: Inconclusive.** The EVM gas-schedule primitives that would govern a chaining interpreter's overhead are well-characterized. GASOL demonstrates that storage dominates total-transaction gas (>97% per-iteration in its running example; DOI 10.1007/978-3-030-45237-7_7, full text). Running on Fumes provides the memory-cost model — linear opcode cost + quadratic expansion cost — and documents that memory is transient between calls while storage is persistent (no DOI; full text). The Max-SMT Superoptimizer decomposes low-level EVM savings as 51% stack scheduler + 34.4% stack rules + 14.6% memory rules (DOI 10.1007/978-3-030-99524-9_11, full text).

But no corpus paper *measures* an interpreter VM's gas profile. *MultiCall: A Transaction-batching Interpreter for Ethereum* (DOI 10.1145/3457337.3457839) — the single most on-point corpus entry — failed to fetch (manifest: failed). The corpus therefore supplies the gas-model building blocks but is **silent on the assembled artifact**: whether dispatch or marshalling dominates interpreter-attributable overhead is an empirically open question, not a settled finding. The rebuttal's "interpreter-attributable delta" scoping rescue is sound engineering reasoning but is not itself in the corpus. **Confidence: moderate on mechanism; low on the specific dispatch-vs-bytes claim.**

### 2. Composability is formalizable as non-interference, but not verifiable with existing frameworks

**Verdict: Splits — supported on formalizability; refuted on existing-framework verifiability.** *DeFi Composability as MEV Non-interference* (arXiv:2309.10781, abstract only) provides a formal non-interference definition of composability, refuting the purely-economic framing in *Measuring Asset Composability as a Proxy for DeFi Integration* (abstract only). Independently, *A Semantic Framework for the Security Analysis of Ethereum Smart Contracts* (DOI 10.1007/978-3-319-89722-6_10, full text) defines call integrity as a hyperproperty with a soundness theorem and an explicit information-flow pedigree (PDG-based non-interference "as done by Joana to verify non-interference in Java").

But non-interference is a 2-safety hyperproperty (requiring reasoning about *pairs* of traces), while the corpus's verification tools — eThor (DOI 10.1145/3372297.3417250, full text), VerX (DOI 10.1109/sp40000.2020.00024, full text), solc-verify (DOI 10.1007/978-3-030-41600-3_11, full text) — all verify single-trace reachability or temporal-safety properties. The machinery does not fit the property. A verifier for EVM non-interference composability does not exist in this corpus. The gap is well-understood (self-composition, relational program logics) but unbridged here. **Confidence: high on the split; tentative on each half due to the MEV paper's abstract-only status.**

### 3. Return-data chaining is a verification bottleneck — bytecode-level semantics are necessary, not sufficient

**Verdict: Supported (reframed).** Source-level Solidity verifiers structurally cannot express data-dependent dispatch on returndata: solc-verify "does not support low-level function calls such as callcode and delegatecall as … would require encoding of the EVM details" and "does not support inline assembly" (DOI 10.1007/978-3-030-41600-3_11, full text). eThor demonstrates that sound EVM analysis requires abandoning the "recover a fixed CFG first" abstraction and reasoning over bytecode small-step semantics, because "dynamic jump destinations" make sound CFG reconstruction "not trivial" (DOI 10.1145/3372297.3417250, full text). Running on Fumes reports a real soundness hole in Oyente's CFG recovery: multi-target jumps silently dropped all but one target (no DOI; full text).

But bytecode-level analysis does *not* make the problem tractable — it relocates it. eThor's sound analysis of unknown-callee return values collapses to λx.⊤ (full text). GASOL's data-dependent flow produces parametric bounds, not constants (DOI 10.1007/978-3-030-45237-7_7, full text). The defensible finding is: **bytecode-level EVM semantics are necessary to *state* the problem soundly but not sufficient to make it easy.** Source-level tools are structurally excluded. **Confidence: moderate — the necessity claim is directly cited from solc-verify's own feature list and eThor's own soundness rationale; the insufficiency claim is supported by eThor's ⊤-havoc and GASOL's parametric bounds; the entirety rests on adjacent constructs (delegatecall, assembly, dynamic jumps) rather than a direct experiment on chaining-VM verification (MultiCall paper unavailable).**

### 4. Formal verification's practical ROI is undemonstrated; FV and unsound analysis are complementary

**Verdict: Splits — clause 1 refuted; clause 2 supported.** The claim that "unsound analysis catches more exploitable bugs per unit effort than sound FV" is a category error. VerX verifies custom functional/temporal properties that generic scanners (Mythril, Oyente, Manticore) cannot express — its evaluation runs these scanners against a functional property and shows they fail (DOI 10.1109/sp40000.2020.00024, full text). "Per unit effort" is measured nowhere in the corpus (*Ethereum Smart Contract Analysis Tools: A Systematic Review*, DOI 10.1109/access.2022.3169902, full text, reviews 86 tools with no effort-normalized comparison). The huge population-scale vulnerability counts (Osiris: 42,108 flagged out of 1.2M, abstract only; ZEUS: 94.6% of 22.4K, abstract only) conflate pattern-match flags with confirmed exploits — eThor empirically shows ZEUS recall at 11.4% (DOI 10.1145/3372297.3417250, full text).

However, **FV's real-world security ROI is genuinely undemonstrated in this corpus.** VerX's own introduction concedes "only a handful of smart contract projects … have been formally verified," with "heavyweight interactive-theorem provers" requiring "non-trivial manual effort and expertise, making the audit process expensive and time-consuming, resulting in limited adoption" (full text). No corpus paper presents a controlled comparison of exploited-bug rates for verified vs. unverified contracts. The surviving finding: FV and unsound static analysis are **complementary, not rank-orderable** on this evidence — they target disjoint property classes with different guarantee strengths and different effort profiles. **Confidence: high on the refutation of clause 1 (category error, directly cited); high on clause 2 (absence argument across a well-searched corpus of surveys and systematic reviews).**

---

## Cross-Cutting Observation (feeds the novel insight)

All four findings share a single structural shape: the corpus supplies the **building blocks** — the EVM gas schedule, a complete bytecode formal semantics, a hyperproperty definition of composability, sound bytecode analyzers, population-scale unsound scanners, and a mature survey layer — but is **silent on the assembled artifact**: a return-data-chaining interpreter VM. No peer-reviewed paper measures its gas profile, verifies a property of its scripts, or compares it to a native batching alternative. The trade-off the research question asks about is **under-determined by the literature, not resolved by it.**

This is not a weakness of the inquiry — it is the finding. The corpus tells you what *can* be built (the primitives exist) and where the *known-hard* terrain lies (data-dependent dispatch, 2-safety hyperproperty verification, interpreter-overhead measurement). It does not tell you how to build it or whether the result is worth building.

---

## The Novel Insight

The inquiry surfaced an asymmetry that no single corpus paper states but that the evidence collectively demands:

> **The three axes of the trade-off — gas, expressiveness, and verifiability — are not independent tuning knobs but are coupled through a single underlying choice: whether the VM operates at the EVM-bytecode level or at a higher abstraction.** 

Specifically:

- **Expressiveness requires the bytecode level.** Return-data chaining with dynamic types, struct access, and computed call targets is inherently an EVM-memory-and-low-level-call operation — solc-verify's own feature gap (no inline assembly, no delegatecall, no EVM memory model) proves that a source-level VM would have to *re-implement* exactly what the host project already does in assembly, defeating the purpose.

- **Gas efficiency is *decided* at the bytecode level.** The gas model lives there (memory expansion cost, `mcopy`/EIP-5656 vs loop-copy tradeoffs, call cost vs dispatch cost), and no meaningful optimization of a chaining VM can bypass it. The corpus's gas analysis tools (GASOL, Max-SMT Superoptimizer, Running on Fumes) all operate on bytecode.

- **Verifiability *requires* the bytecode level but *suffers* there too.** Source-level verifiers cannot express the VM's semantics (solc-verify's gap). Bytecode-level semantics (KEVM, eThor, Semantic Framework) can *state* the problem soundly, but the problem is harder at that level — dynamic dispatch defeats CFG-based abstraction, and the composability property of interest (non-interference) is a 2-safety hyperproperty that no existing EVM bytecode verifier targets.

The coupling is directional: the **expressive** design point (return-data chaining, dynamic types, arbitrary callee composition) **forces** the VM to the bytecode level, which in turn **forces** both gas optimization and formal verification to operate at that level. The trade-off is not a three-way balance — it is a binary choice (source-level abstraction vs. EVM-native) where expressiveness pushes you one way and the corpus warns you that gas measurement and sound verification become harder (though not impossible) on that path.

For the host project (`multicall-scripting`), this means: the project has already chosen the expressive/bytecode-level design point — correctly, because the value proposition *is* expressiveness — and the corpus evidence says that (a) gas optimization can draw on a mature bytecode-oriented literature but needs the project's own measurements, since no interpreter-specific figures exist; and (b) formal-verification ambition should target bytecode-level models (KEVM/KEVM-adjacent) from the start, because source-level tooling is structurally incapable of expressing the VM's semantics, and the composability property of interest — non-interference safety of chained scripts — maps naturally onto existing hyperproperty formalisms in the corpus but requires bridging single-trace verifiers into 2-safety territory, a gap that is well-understood but currently unbridged.

This reframes the research question from "what is the optimal trade-off?" to **"given that expressiveness forces the bytecode design point, how should the bytecode-level VM be structured to make gas profiling tractable and verification of non-interference composability decidable?"** — a sharper, more productive question that the corpus helps ask but cannot yet answer.

---

## Single Most Valuable Open Question

**Can the non-interference composability property defined in the corpus (Semantic Framework + DeFi Composability as MEV Non-interference) be reduced to a reachability/safety property that existing bytecode verifiers (eThor, KEVM's deductive verifier) can discharge, using self-composition or product-program techniques?** 

This matters because it is the bottleneck that makes H2's formal-definition half a theoretical promise rather than an engineering reality. The corpus supplies the definition and the bytecode semantics; it lacks the bridge. Answering it would directly determine whether the host project's formal-verification ambition can draw on existing tooling or requires building a bespoke 2-safety verifier from scratch. The gap is narrow and well-defined; it is not a "we need a whole new field" gap — it is a "we need one well-chosen reduction" gap.

---

## References

All citations trace to `data/corpus_focused.json` and `data/fulltext/manifest.json`. Full-text status per entry:

1. *GASOL: Gas Analysis and Optimization for Ethereum Smart Contracts* — DOI 10.1007/978-3-030-45237-7_7 **[full text]**
2. *A Max-SMT Superoptimizer for EVM handling Memory and Storage* — DOI 10.1007/978-3-030-99524-9_11 **[full text]**
3. *Running on Fumes—Preventing Out-of-Gas Vulnerabilities…* — no DOI **[full text]**
4. *MultiCall: A Transaction-batching Interpreter for Ethereum* — DOI 10.1145/3457337.3457839 **[failed]**
5. *DeFi Composability as MEV Non-interference* — arXiv:2309.10781 **[failed]**
6. *A Semantic Framework for the Security Analysis of Ethereum Smart Contracts* — DOI 10.1007/978-3-319-89722-6_10 **[full text]**
7. *eThor: Practical and Provably Sound Static Analysis of Ethereum Smart Contracts* — DOI 10.1145/3372297.3417250 **[full text]**
8. *VerX: Safety Verification of Smart Contracts* — DOI 10.1109/sp40000.2020.00024 **[full text]**
9. *solc-verify: A Modular Verifier for Solidity Smart Contracts* — DOI 10.1007/978-3-030-41600-3_11 **[full text]**
10. *Ethereum Smart Contract Analysis Tools: A Systematic Review* — DOI 10.1109/access.2022.3169902 **[full text]**
11. *Osiris: Hunting for Integer Bugs in Ethereum Smart Contracts* — DOI 10.1145/3274694.3274737 **[abstract only]**
12. *ZEUS: Analyzing Safety of Smart Contracts* — DOI 10.14722/ndss.2018.23082 **[abstract only]**
13. *A Survey on Formal Verification for Solidity Smart Contracts* — DOI 10.1145/3437378.3437879 **[abstract only]**
14. *Towards verifying ethereum smart contract bytecode in Isabelle/HOL* — DOI 10.1145/3167084 **[abstract only]**
15. *KEVM: A Complete Semantics of the Ethereum Virtual Machine* — corpus #33 **[failed]**
16. *Measuring Asset Composability as a Proxy for DeFi Integration* — **[abstract only]**
