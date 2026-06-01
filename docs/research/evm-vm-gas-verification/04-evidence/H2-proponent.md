# H2 Proponent — Composability is formalizable as non-interference

**SUPPORT STRENGTH: split — the "formalizability" half is strongly supported (exactly one corpus paper provides a formal non-interference definition of composability); the "machine-checkable with existing frameworks" half is refuted (non-interference requires 2-safety hyperproperties; the corpus's verification machinery is single-trace). The honest strength is that composability *has* a crisp formal definition — a genuine contribution from this literature — but no existing tool can verify it.**

---

## Hypothesis restated

**H2:** DeFi composability/MEV-safety can be given a formal, machine-checkable definition as a non-interference / information-flow property, so multicall scripts are verifiable with *existing* security-property frameworks rather than bespoke methods.

---

## 1. Formal definition exists — DeFi Composability as MEV Non-interference

The singular paper that settles the first half of H2 is *DeFi Composability as MEV Non-interference* (Massacci, Ngo, Nie, Venturi, Williams; arXiv:2309.10781, 2023). This is the **only** corpus entry that defines composability formally rather than empirically.

The paper frames DeFi composability as an information-flow security property: a composed set of DeFi actions is "MEV-safe" if an adversary observing or reordering them cannot learn or profit from information that would violate a non-interference condition. This directly refutes the alternative framing found in *Measuring Asset Composability as a Proxy for DeFi Integration* (abstract only), which treats composability as a purely economic/empirical measure (asset connectivity graphs). The non-interference definition provides exactly what H2 claims: a formal, property-based definition of the security dimension of composability.

**Strength:** The paper is recent (2023) and directly on-point for the formal-definition half. **Weakness:** The full text failed to fetch (manifest: `failed`), so the proponent case rests on the abstract and title alone. The abstract-level claim that the paper provides a *definition* is reliable (it is the paper's stated contribution), but the *details* of the definition — whether it is precise enough to be machine-checkable, what formalism it uses, whether it covers the inter-contract data-dependency patterns of a chaining VM — cannot be verified from the abstract.

---

## 2. The "existing frameworks" half: the Semantic Framework is single-trace, not 2-safety

*A Semantic Framework for the Security Analysis of Ethereum Smart Contracts* (Grishchenko, Maffei, Schneidewind; POST 2018, DOI 10.1007/978-3-319-89722-6_10, full text) formalizes security properties of EVM contracts — call integrity, single-entrancy, and several independence properties — but at the level of **single-trace reachability properties**. These are invariants on individual execution traces ("does this contract ever reach state S?"), expressed in the paper's EtherTrust framework.

Non-interference, in contrast, is a **2-safety hyperproperty**: it requires reasoning about *pairs* of traces (the "high-security" trace and the "low-security" trace must produce indistinguishable observable outputs). The distinction is fundamental: single-trace reachability cannot, in general, encode 2-trace non-interference. The Semantic Framework gives a decomposition technique for call integrity (AC-code independence, AC-effect independence, single-entrancy) proved "overapproximated by static analysis techniques based on program dependence graphs," but these are single-trace independence properties, not the full 2-safety non-interference the composability paper proposes.

The practical implication: the corpus provides *one* paper defining composability as non-interference, and another set of papers providing single-trace verification machinery, but **there is a gap between them**: the definition is 2-safety, the machinery is single-trace, and no corpus paper bridges them.

---

## 3. The strongest supporting nexus: composability *is* definable; the framework gap is narrowing

The proponent's best honest argument is:

1. **Definability (supported):** The non-interference definition exists (Massacci et al., 2023). This refutes the skepticism implicit in null-3 — composability is not an inherently vague or purely-empirical concept.

2. **Framework progress (partial):** The Semantic Framework (full text) and its companion (*Foundations and Tools for the Static Analysis of Ethereum Smart Contracts*, CAV 2018, abstract only) demonstrate that call-level security properties of EVM contracts *can* be given formal semantics and automated analysis. The gap is a technical one (single-trace → 2-safety), not a conceptual one — and there is a well-known path: relational program logics, product-program constructions, and self-composition techniques for reducing 2-safety to single-trace. None of these appear in this corpus applied to the EVM, but they are standard in the broader programming-languages literature.

3. **The field is young:** The non-interference composability paper is from 2023; the verification framework is from 2018. The gap between them reflects a field that has defined the problem but not yet built the tooling — consistent with the lit map's observation that the multicall/composability literature is thin and fast-moving.

---

## Honest assessment

- **The definition half is supported** — one corpus paper provides it, and it is the right kind of definition (formal, property-based, security-grounded). The *Measuring Asset Composability* alternative framing reinforces that this definition is non-trivial and not previously settled.
- **The verification half is NOT supported.** No corpus paper demonstrates machine-checkable verification of a non-interference property for EVM contracts. The gap between the single-trace Semantic Framework and the 2-safety non-interference definition is real, acknowledged, and unbridged in this corpus.
- **The claim as written ("verifiable with existing frameworks") is refuted.** The "existing" here means corpus-available, and the corpus-available verification machinery is the wrong shape. H2 survives only in its weaker form: composability *has* a formal definition; machine-checkable verification requires new bridging work.

**Support strength: moderate for formalizability; refuted for existing-framework verificability.**

---

## Citations

- *DeFi Composability as MEV Non-interference* — arXiv:2309.10781 (in corpus; manifest: `failed` — abstract only). Provides formal non-interference definition of composability.
- *A Semantic Framework for the Security Analysis of Ethereum Smart Contracts* — DOI 10.1007/978-3-319-89722-6_10 (full text). Single-trace reachability security properties; call integrity, independence properties.
- *Measuring Asset Composability as a Proxy for DeFi Integration* — (in corpus; abstract only). Economic/empirical composability measure; serves as the alternative framing H2 improves upon.
- *Foundations and Tools for the Static Analysis of Ethereum Smart Contracts* — DOI 10.1007/978-3-319-96145-3_4 (in corpus; abstract only). Companion to the Semantic Framework.
