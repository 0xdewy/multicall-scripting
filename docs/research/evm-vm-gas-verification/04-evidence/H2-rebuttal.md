# H2 Rebuttal

**REBUTTAL: partially holds — the corpus supports that composability/MEV-safety is *formalizable* as non-interference (a hyperproperty), but does NOT support that it is *machine-checkable today with existing frameworks*. The first clause survives; the second is an over-claim and is conceded.**

---

## What H2 actually claimed

H2 bundles three sub-claims:

- **(a) Formalizable:** composability/MEV-safety has a formal definition as non-interference / information-flow.
- **(b) Machine-checkable:** that definition is mechanically verifiable.
- **(c) With EXISTING frameworks:** verification reuses off-the-shelf security-property tooling rather than bespoke methods.

The Falsifier's strongest blow lands on (b)+(c). I concede it. The salvage is (a), which the corpus does support — and it is not trivial.

---

## Concession (the Falsifier is right where it counts)

The keystone paper for H2 — Bartoletti, Marchesin & Zunino, *DeFi Composability as MEV Non-interference* (arXiv:2309.10781, 2023; LNCS 10.1007/978-3-031-78679-2_20, 2025) — is **abstract-only in our corpus**. Both fetch attempts failed (manifest: LNCS `403 Forbidden`; the arXiv OA PDF locator exists but no full text was retrieved). The only text we can cite is its abstract, which says it "introduce[s] a new notion of secure composability of smart contracts, which ensures that adversaries cannot economically harm the compound contract by interfering with its dependencies" (corpus: *DeFi composability as MEV non-interference*, abstract only).

From that abstract alone, three things the Falsifier needs are **absent from the corpus**:

1. **No verifier or tool.** The abstract describes a *notion/definition*, not an implementation, decision procedure, or experimental verification. We have no full text to claim otherwise.
2. **No bridge to existing frameworks.** Nothing in the corpus shows this MEV-non-interference definition being discharged by an existing model checker, type system, or static analyzer. The bridge sub-claim (c) is simply not in evidence.
3. **"MEV-safety" is economic.** The abstract frames harm as *economic* ("economically harm," "economically damage"), i.e., a quantitative/value-sensitive property, which is strictly harder to reduce to plain qualitative non-interference than the proponent implied.

So the strong reading of H2 — "multicall scripts are verifiable today with existing security-property frameworks" — **collapses on this evidence.** I do not defend it.

---

## What genuinely holds: composability-style safety *is* formalizable as non-interference

The weaker, still-consequential claim (a) is well supported — not by the MEV paper (which we can't read) but by an independent full-text paper that establishes the *technique*:

Grishchenko, Maffei & Schneidewind, *A Semantic Framework for the Security Analysis of Ethereum Smart Contracts* (corpus, **full text**, 10.1007/978-3-319-89722-6_10):

- It defines **call integrity** — "no matter how the attacker can schedule c ... the calls of c cannot be controlled by the attacker, even if c hands over the control to the attacker" — and states explicitly: "We capture this intuition through a **hyperproperty**, which we name call integrity" (Def. 2). This is exactly a composability property: *the compound contract's behavior must not be controllable by the untrusted dependencies it calls into.*
- It decomposes call integrity into **value-dependency properties** that "can be **formalized as hyperproperties**" (AC-effect independence, Def. 3; code independence) plus a single-entrancy safety property, and **proves soundness**: "the two independence properties and the single-entrancy property together entail call integrity" (Thm. 1).
- It names the **information-flow lineage directly**: these independence properties "can be overapproximated by static analysis techniques based on **program dependence graphs**, as done by Joana to verify **non-interference in Java**" (full text).

That is the load-bearing result for H2(a): a composability/interference notion ("untrusted dependencies cannot steer the compound contract") is given a **machine-formal, hyperproperty / non-interference definition with a soundness theorem** — exactly the kind of "existing security-property framework" (2-safety / information-flow) the hypothesis invokes, applied to EVM contracts. The conceptual bridge the proponent asserted is real *at the definitional level*.

---

## Why this is "partially holds," not "holds"

The gap between "formalizable" and "machine-checkable with existing tools today" is exactly where the evidence thins:

1. **It is call integrity, not MEV-safety.** The full-text hyperproperty result is about *control-flow / reentrancy* non-interference, not *economic* (value-quantitative) harm. MEV-safety is a quantitative refinement the corpus formalizes only in an abstract we cannot read. So "composability has a non-interference definition" holds for the reentrancy-style notion; for the *MEV/economic* notion it rests on an abstract-only citation.

2. **"Can be overapproximated" ≠ "has been machine-checked."** The Semantic Framework paper says the independence properties *can be* handled by PDG-based static analysis "as done by Joana ... in Java" — a **gestured-at**, cross-domain technique, **not a demonstrated EVM verifier** within the corpus. No full-text paper here runs an existing information-flow tool on EVM bytecode and discharges a non-interference obligation.

3. **The available EVM verifiers in the corpus target the wrong property class.** eThor (corpus, full text) is "the first **sound and automated** ... static analysis" but supports **reachability properties** — "our static analysis supports reachability properties, which we show to be sufficient for capturing interesting security properties" (eThor, full text). Reachability is a trace property, not a hyperproperty; it does not natively express non-interference. VerX (corpus, full text) automates **temporal *safety*** verification via reduction to reachability ("temporal safety verification to that of reachability checking") — again trace properties, not 2-safety/non-interference. solc-verify and the systematic-review survey (corpus, full text) contain **no** mention of non-interference, information-flow, or hyperproperties at all (grep: 0 hits). So the corpus's *operational, existing-framework* verifiers do not currently check the non-interference notion H2 needs.

In short: the corpus gives us a **formal definition** (hyperproperty, with soundness theorem and an information-flow pedigree) but, for the MEV/composability target specifically, **no end-to-end machine-checked instance using existing frameworks.**

---

## Net assessment

- **H2(a) Formalizable as non-interference:** **HOLDS.** Composability-style interference is definable as a hyperproperty in the non-interference family, with a soundness theorem, in full-text corpus (Semantic Framework). The MEV-specific instantiation exists (Bartoletti et al.) but is abstract-only here.
- **H2(b) Machine-checkable:** **NOT SHOWN.** No corpus full text demonstrates mechanical verification of the non-interference/composability property; the closest sound, automated EVM tools (eThor, VerX) verify reachability/temporal *trace* properties, not hyperproperties.
- **H2(c) With EXISTING frameworks:** **CONCEDED / unmet in corpus.** The only pointer is "overapproximable by PDG techniques as in Joana for Java" — an aspiration, not an EVM result. The bridge the proponent needed is not in the corpus.

**Honest verdict: H2 partially holds.** Reframed accurately, the defensible thesis is: *"DeFi composability / interference-safety admits a formal, hyperproperty-based (non-interference-family) definition, and the building blocks for verifying it draw on existing information-flow techniques — but as of this corpus the machine-checked, tool-supported instance for the MEV/economic notion is not yet demonstrated."* The proponent's "verifiable with EXISTING frameworks rather than bespoke methods" is an over-claim on current evidence; the existing sound EVM verifiers here target a different (trace-property) class, and the MEV-non-interference definition itself is, in our corpus, a definition without an accompanying verifier.

---

### Citations (corpus only)
- *DeFi composability as MEV non-interference* — Bartoletti, Marchesin, Zunino (arXiv:2309.10781, 2023; LNCS 10.1007/978-3-031-78679-2_20, 2025). **Abstract only** — full text fetch failed (manifest: 403 / not retrieved).
- *A Semantic Framework for the Security Analysis of Ethereum Smart Contracts* — Grishchenko, Maffei, Schneidewind (10.1007/978-3-319-89722-6_10). **Full text.** [call integrity hyperproperty Def. 2; AC-effect independence Def. 3; Thm. 1 soundness; PDG/Joana non-interference reference]
- *eThor: Practical and Provably Sound Static Analysis of Ethereum Smart Contracts* (10.1145/3372297.3417250). **Full text (truncated).** [sound, automated; reachability properties]
- *VerX: Safety Verification of Smart Contracts* (10.1109/sp40000.2020.00024). **Full text (truncated).** [temporal safety reduced to reachability]
- *solc-verify: A Modular Verifier for Solidity Smart Contracts* (10.1007/978-3-030-41600-3_11). **Full text.** [no non-interference/hyperproperty content — 0 grep hits]
- *Ethereum Smart Contract Analysis Tools: A Systematic Review* (10.1109/access.2022.3169902). **Full text (truncated).** [no information-flow/non-interference content — 0 grep hits]
