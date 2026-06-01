# H3 Falsifier

**REFUTATION STRENGTH: partial — the corpus refutes the strong "ONLY at bytecode level" relief claim (bytecode tools demonstrably struggle with exactly the data-dependent dispatch H3 invokes, and source-level tools DO reason soundly about call composition), but it cannot confirm or deny the narrower premise that return-data chaining is *uniquely* hard, because no paper in the corpus studies a chaining/interpreter VM with empirical results.**

---

## Hypothesis under test

**H3:** Chaining return data between calls creates data-dependent control/data flow that defeats source-level (Solidity) verifiers and static abstractions; sound verification of such a VM is tractable ONLY at the bytecode-semantics (KEVM) level.

The load-bearing word is **ONLY**. H3 makes two separable claims:
- (A) Source-level/static abstractions are *defeated* by data-dependent call chaining.
- (B) Bytecode-semantics (KEVM) is where sound verification *becomes tractable* — i.e., the bytecode level enjoys a special advantage for this problem.

I attack both, since refuting either the "defeats source-level" or the "tractable only at bytecode" half breaks the disjunction-free "ONLY" framing.

---

## Attack 1 — Source-level verifiers DO reason about external calls / call composition (weakens A)

**Decisive disconfirming study for the "source level cannot handle call composition" reading:**

- **solc-verify: A Modular Verifier for Solidity Smart Contracts** — Hajdu & Jovanović, VSTTE 2019. DOI: 10.1007/978-3-030-41600-3_11. *(full text)*

solc-verify "reasons at the level of the contract source code, as opposed to ... bytecode" and **explicitly handles external calls**: "Since there can be an unknown code behind the called address, solc-verify treats such cases as an external call that can perform arbitrary computation" and, crucially for chaining/callback safety, "Contract invariants are also checked before external calls as they can perform a callback to the contract." It uses this to *prove* the corrected SimpleBank (reentrancy) and *find* the DAO-class bug at source level. So a source-level verifier soundly models composition of calls with unknown callees via modular pre/post-conditions and invariant-at-call-boundary reasoning. The "source level is defeated by call composition" reading is therefore **false in general**.

- **A Semantic Framework for the Security Analysis of Ethereum Smart Contracts** — Grishchenko, Maffei & Schneidewind, POST 2018. DOI: 10.1007/978-3-319-89722-6_10. *(full text)*

This paper formalizes **call integrity** — a property *about call composition with attacker-controlled callees* — and gives a proof technique decomposing it into AC-code independence, AC-effect independence, and single-entrancy, "overapproximated by static analysis techniques based on program dependence graphs." This shows data/effect/code dependencies across call boundaries are a studied, tractable abstraction target — not an intractable wall. (Notably this is framed at the *semantic/abstraction* level, not requiring full KEVM execution.)

**However**, this attack does NOT fully rescue source-level tools for *this* VM, and that nuance must be reported honestly:
- solc-verify "currently does not support inline assembly" and "does not support low-level function calls such as callcode and delegatecall ... as it would require encoding of the EVM details." The multicall-scripting `execute()` is **pure Yul assembly with mcopy-based return-data placement at data-dependent offsets** — precisely the inline-assembly / low-level-call territory solc-verify declines.
- So H3's claim that *a Solidity-source verifier* is the wrong level for *this specific VM* survives: a source-level tool that refuses assembly cannot verify an assembly-only dispatcher. The refutation here is of the **over-general** phrasing ("defeats source-level verifiers" as a class statement), not of the modest observation that solc-verify specifically can't touch this contract.

---

## Attack 2 — Bytecode tools ALSO struggle with data-dependent dispatch; no special advantage (refutes B, the relief claim)

This is the strongest line against H3's "ONLY at bytecode level = tractable" framing.

**Decisive disconfirming study:**

- **eThor: Practical and Provably Sound Static Analysis of Ethereum Smart Contracts** — Schneidewind, Grishchenko, Scherer & Maffei, ACM CCS 2020. DOI: 10.1145/3372297.3417250. *(full text)*

eThor is a *sound, bytecode-level* analyzer built on a complete EVM semantics — exactly the "bytecode-semantics" regime H3 anoints. Yet it states plainly: **"Analyzing EVM bytecode is particularly challenging as the underlying execution model allows for dynamic jump destinations ... recovering jump destinations is interconnected with the contract's execution, and hence, performing such a sound reconstruction is not trivial."** It documents that a prior tool's CFG-reconstruction algorithm "yields unsound results, undermining the soundness of the analysis." **Data-dependent control flow is therefore a known hard problem *at the bytecode level*, not something the bytecode level relieves.** H3 asserts the difficulty migrates *down* to where it becomes tractable; eThor shows the difficulty *is* at the bytecode level.

Worse, eThor's own sound abstractions collapse precisely on the operations the multicall VM relies on:
- **MLOAD with a non-concrete offset** pushes ⊤ (top / fully unknown): "either immediately ⊤ is pushed to the stack (in case that the offset ô is not a concrete value and hence the value to be loaded cannot be determined) or the word from the concrete memory offset is extracted." The multicall VM reads return data from **data-dependent memory offsets** (the whole point of chaining), which is the ⊤ case.
- **CALL** abstracts return data and storage to `λx. ⊤` for the unknown callee. So a chained return value, fetched from an attacker/return-dependent offset, is ⊤ at bytecode level too.

Conclusion: the bytecode-semantics level offers **no special tractability advantage** for data-dependent chaining; sound bytecode abstraction *over-approximates the chained value to "unknown,"* losing exactly the information chaining is meant to carry. This directly refutes the "tractable ONLY at bytecode level" relief.

Supporting corroboration that dynamic dispatch is the cross-cutting hard problem (not a source-vs-bytecode distinction):
- **Secure Optimizations on Ethereum Bytecode Jump-Free Sequences** — DOI: 10.1109/TDSC.2025.3536803 *(abstract)*. Its Coq-certified equivalence framework is explicitly scoped to **jump-free** sequences; jumps (dynamic control flow) are carved out as the part that resists the clean formal treatment, even at bytecode level.

---

## Attack 3 — Is return-data chaining *uniquely* hard, or ordinary memory reasoning? (premise probe)

The corpus suggests it is **ordinary memory + unknown-callee reasoning**, with no evidence of a *novel* hardness class:
- eThor's machinery (word-indexed memory abstraction, `getWord`, ⊤ on non-concrete offsets, CALL→⊤) is *generic* memory/call abstraction. Chaining return data is just "store callee return into memory at offset X, later load from offset X" — standard alias/offset reasoning, already modeled (if imprecisely) by existing sound abstractions. Nothing in the corpus identifies return-data-to-input chaining as a *distinct* undecidability or a new abstraction barrier beyond the well-known dynamic-offset/dynamic-jump problem.
- solc-verify handles intra-contract data flow (temporaries, nested calls extracted to fresh variables) at source level routinely. The hard part for *its* applicability is assembly/low-level calls, not "chaining" per se.

So H3's premise that chaining is *uniquely* defeating is **not supported** by the corpus; it reduces to the already-catalogued data-dependent memory/jump problem that affects *both* levels. This weakens H3's distinctiveness but is not a clean refutation (no paper tests a chaining VM to confirm or deny).

---

## Attack 4 — Is H3 even testable from this corpus? (scope / inconclusiveness)

**Partially not.** No corpus paper studies a return-data-chaining VM / batching interpreter with verification results:
- **MultiCall: A Transaction-batching Interpreter for Ethereum** — DOI: 10.1145/3457337.3457839 — is in the corpus *by title only* (no abstract, fetch failed/403). It is the single most on-topic artifact and we cannot read its claims. This is the paper that *would* adjudicate H3's premise; its absence makes the "uniquely hard" sub-claim **inconclusive**.
- **A Survey on Formal Verification for Solidity Smart Contracts** — DOI: 10.1145/3437378.3437879 (ACSW 2021) — is **abstract-only** (no abstract text retrieved), so it cannot be mined for a verdict on chaining VMs.
- **KEVM: A Complete Semantics of the EVM** (OpenAlex W2741675276, *abstract only*) supports H3's *constructive* side — it provides a deductive verifier and "verified ... the correct operation of a token transfer function," and pitches a "semantics-first formal verification approach." But KEVM verifying a token transfer is **not** evidence that bytecode level is the *only* tractable level for *chaining VMs*; it is evidence that bytecode-level verification is *possible*, which H3's "ONLY" does not follow from. KEVM-style symbolic execution is, per eThor, still subject to the dynamic-jump reconstruction problem.

H3 is thus **only partially testable**: the "defeats source / no bytecode advantage" half is testable and refuted (Attacks 1–2); the "return-data chaining is uniquely hard and tractable ONLY at bytecode" half is **not testable** from available full text because the one chaining-VM paper (MultiCall) is unreadable here.

---

## Verdict

- **"ONLY at bytecode-semantics level"** — **refuted (partial→strong on this clause).** eThor (DOI 10.1145/3372297.3417250) shows the bytecode level itself struggles with dynamic dispatch and over-approximates chained values to ⊤; solc-verify (DOI 10.1007/978-3-030-41600-3_11) and the Semantic Framework (DOI 10.1007/978-3-319-89722-6_10) show call composition is soundly reasoned about above the raw-bytecode level. No special bytecode advantage is evidenced; KEVM (W2741675276) shows *possibility*, not *exclusivity*.
- **"chaining uniquely defeats source-level verifiers"** — **not supported but not cleanly refuted.** It collapses into the known dynamic-offset/dynamic-jump problem affecting both levels. The *specific* claim that solc-verify can't verify *this* assembly-only VM is actually **true** (it rejects inline assembly / low-level calls), so H3 retains a kernel of truth in its weakest form.
- **Testability** — **partially inconclusive:** the decisive on-topic paper, **MultiCall (DOI 10.1145/3457337.3457839)**, and the **Survey (DOI 10.1145/3437378.3437879)** are unreadable in this corpus.

**Single most decisive disconfirming study:** *eThor* (Schneidewind et al., CCS 2020, DOI 10.1145/3372297.3417250) — a sound bytecode-level analyzer that openly documents data-dependent dispatch as a hard, sometimes soundness-breaking problem *at the bytecode level*, and whose sound abstractions reduce data-dependent memory loads and call results to ⊤. This removes the bytecode level's claimed "tractability relief" and breaks H3's "ONLY."

**Net:** H3 should be downgraded from "sound verification is tractable ONLY at bytecode level" to the defensible-but-weaker "Solidity-*source* verifiers that reject inline assembly (e.g., solc-verify) cannot verify an assembly-only chaining dispatcher; both source-abstraction and bytecode-semantics levels lose precision on data-dependent dispatch, and no level has demonstrated tractable *sound* verification of a chaining VM in this corpus."

---

### Citations (corpus only)
1. Hajdu, Jovanović. *solc-verify: A Modular Verifier for Solidity Smart Contracts.* VSTTE 2019. DOI: 10.1007/978-3-030-41600-3_11. (full text)
2. Schneidewind, Grishchenko, Scherer, Maffei. *eThor: Practical and Provably Sound Static Analysis of Ethereum Smart Contracts.* ACM CCS 2020. DOI: 10.1145/3372297.3417250. (full text)
3. Grishchenko, Maffei, Schneidewind. *A Semantic Framework for the Security Analysis of Ethereum Smart Contracts.* POST 2018. DOI: 10.1007/978-3-319-89722-6_10. (full text)
4. Hildenbrandt et al. *KEVM: A Complete Semantics of the Ethereum Virtual Machine.* OpenAlex W2741675276. (abstract only)
5. *A Survey on Formal Verification for Solidity Smart Contracts.* ACSW 2021. DOI: 10.1145/3437378.3437879. (abstract only — no text retrieved)
6. *MultiCall: A Transaction-batching Interpreter for Ethereum.* ACM BSCI 2021. DOI: 10.1145/3457337.3457839. (title only — fetch failed; the decisive on-topic paper, unreadable here)
7. *Secure Optimizations on Ethereum Bytecode Jump-Free Sequences.* IEEE TDSC 2025. DOI: 10.1109/TDSC.2025.3536803. (abstract — jump-free scoping corroboration)
