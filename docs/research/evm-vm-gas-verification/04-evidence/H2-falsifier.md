# H2 Falsifier — Composability formalizable as non-interference

**REFUTATION STRENGTH: partial — the formal-definition half of H2 survives (one paper provides it); the "verifiable with existing frameworks" half is decisively refuted. The surviving claim is strictly weaker than H2 as stated.**

---

## Hypothesis under test

**H2:** DeFi composability/MEV-safety can be given a formal, machine-checkable definition as a non-interference / information-flow property, so multicall scripts are verifiable with *existing* security-property frameworks rather than bespoke methods.

---

## Attack 1 — The non-interference definition is abstract-only; we cannot inspect its precision

The single paper providing the non-interference definition — *DeFi Composability as MEV Non-interference* (arXiv:2309.10781) — failed to fetch full text (manifest: `failed`). The abstract states the paper presents a non-interference framing of DeFi composability, but abstracts do not contain the **definition** itself. Without the formal definition text, we cannot assess:

- Whether it is precise enough to be machine-checkable (sufficiently axiomatized, with a formal semantics backing).
- Whether it covers the specific inter-contract return-data-dependency patterns of a Weiroll/multicall chaining VM (arbitrary calldata construction from prior return values, dynamic-type splicing).
- Whether it is practical at the scale of a real multicall script (tens of calls with multi-hop data dependencies).

An abstract saying "we define composability as non-interference" is evidence that a definition was *proposed*, not that it is *verifiable*. H2's "formal, machine-checkable definition" requires the latter. On the evidence available, this paper provides the former.

**Consequence:** The formal-definition half of H2 is weakened — the definition exists, but its precision and fit to the chaining-VM use case is unverified. This is not a refutation (the paper's stated contribution is the definition), but it downgrades the confidence from "supported" to "plausible but uninspected."

---

## Attack 2 — Non-interference is a 2-safety hyperproperty; the corpus's verification tools are single-trace (DECISIVE)

This is the strongest and most decisive counter-evidence in the corpus. It refutes the "verifiable with existing frameworks" clause of H2.

### 2a. The Semantic Framework is single-trace reachability

*A Semantic Framework for the Security Analysis of Ethereum Smart Contracts* (Grishchenko, Maffei, Schneidewind; POST 2018, DOI 10.1007/978-3-319-89722-6_10, full text) formalizes the EVM's small-step semantics and defines security properties — call integrity, single-entrancy, AC-code independence, AC-effect independence — using **single-trace reachability**. A call integrity property, for example, asks: "in every execution trace, does the contract's call behavior satisfy constraints on who can call what and when?" This is a *trace property* — a predicate on individual traces.

Non-interference is fundamentally different. It is a **2-safety hyperproperty**: *"for all pairs of traces differing only in high-security inputs, the low-security outputs are indistinguishable."* It requires reasoning about two traces simultaneously. Single-trace reachability formalisms cannot, in general, encode 2-safety properties without an additional reduction step (e.g., self-composition or product-program construction, neither of which appears in the Semantic Framework or its companion papers).

The gap is not a detail — it is a **category difference** between the property being defined (2-safety non-interference) and the verification machinery in the corpus (single-trace reachability). H2's "existing frameworks" are the wrong shape for the property they would need to verify.

### 2b. Even the closest properties (call integrity, independence) are single-trace

The Semantic Framework does handle several *independence* properties: AC-code independence and AC-effect independence, both of which capture that the contract's behavior or effects are independent of attacker-controlled code. These are the closest cousins to non-interference in the corpus. But they are still formulated as single-trace properties (the contract's internal transitions do not depend on the attacker's code, proven via program-dependence-graph-based overapproximation), not as the 2-trace indistinguishability that non-interference requires for composability security.

### 2c. eThor and solc-verify are likewise single-trace

Both *eThor* (full text) and *solc-verify* (full text) are built on single-trace reachability analysis. eThor's soundness guarantee is "all reachable states satisfy the property" for single-contract analysis; solc-verify's modular verification of external calls uses pre/post-condition reasoning on individual call boundaries, not cross-call-trace indistinguishability. Neither tool offers the relational reasoning infrastructure that non-interference verification would require.

---

## Attack 3 — Even if the definition is formal, no multicall script has been verified with it

The composability paper is a definitional contribution; neither it nor any other corpus paper applies the definition to verify an actual DeFi composition, let alone a chaining-VM script. The gap from "definition exists" to "verification was performed" — let alone "verifiable with existing frameworks" — is the entire practical scientific contribution of H2, and it is absent from this corpus.

---

## Honest assessment

H2 makes two claims:
1. **Composability can be given a formal definition as non-interference** — this half is supported by one paper (abstract only; definition details uninspected). It is the right kind of contribution for this question and is a genuine advance over the purely-economic framing.
2. **The resulting property is verifiable with existing frameworks** — this half is **refuted**. The corpus's verification tools are single-trace reachability analyzers; non-interference is 2-safety. The machinery does not fit the property.

The surviving contribution is: "Composability has a formal definition as a non-interference property (Massacci et al., 2023). Verification of this property for EVM contracts requires bridging the gap from single-trace reachability (Semantic Framework, eThor, solc-verify) to 2-safety hyperproperty checking — a gap that is well-understood in the broader literature (self-composition, relational logics) but unaddressed in this corpus."

**Refutation strength: decisive on the verification clause (Attack 2); the definition clause survives but confidence is downgraded by abstract-only status.**

---

## Citations

- *DeFi Composability as MEV Non-interference* — arXiv:2309.10781 (in corpus; manifest: `failed` — abstract only).
- *A Semantic Framework for the Security Analysis of Ethereum Smart Contracts* — DOI 10.1007/978-3-319-89722-6_10 (full text). Single-trace security properties; call integrity, independence properties via dependence-graph overapproximation.
- *eThor: Practical and Provably Sound Static Analysis of Ethereum Smart Contracts* — DOI 10.1145/3372297.3417250 (full text). Sound single-contract reachability analysis; no relational/2-safety reasoning.
- *solc-verify: A Modular Verifier for Solidity Smart Contracts* — DOI 10.1007/978-3-030-41600-3_11 (full text). Modular source-level verification with per-call pre/post-conditions; single-trace.
- *Measuring Asset Composability as a Proxy for DeFi Integration* — (in corpus; abstract only). Alternative economic/empirical framing.
