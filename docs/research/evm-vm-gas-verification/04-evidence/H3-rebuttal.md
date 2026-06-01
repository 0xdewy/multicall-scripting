# H3 Rebuttal (Proponent's honest reply to the Falsifier)

**REBUTTAL: partially holds — the "necessary" half of H3 is solidly supported by the corpus; the "tractable...only" half is an over-claim and is conceded. H3 should be reframed as "bytecode-level semantics are NECESSARY but not SUFFICIENT" for return-data-chaining verification.**

---

## 1. What the Falsifier got right (conceded, without hedging)

The Falsifier's strongest point lands: the words **"tractable"** and **"only"** are over-claims, and the corpus actively contradicts them.

- **Bytecode level relocates the hardness, it does not remove it.** eThor — the corpus's flagship *provably sound* bytecode analyzer — handles the unknown callee's effect on the caller by **havocing it to top**: "storage gets over-approximated in this case by λx. ⊤. The same applies to the local memory and stack top value since those are affected by the result of the computation of the unknown contract" (eThor, lines 780–782, *full text*). That is exactly the return value a chained call would consume. So a sound bytecode tool *can represent* the CALL/return-data mechanics but *cannot precisely track* the chained value — it collapses it to ⊤ and loses precision. "Tractable" is the wrong word; "expressible" is the right one.

- **Dynamic dispatch is hard at bytecode level too — by the proponent's own cited authority.** eThor concedes that "the underlying execution model allows for dynamic jump destinations... recovering jump destinations is interconnected with the contract's execution, and hence, performing such a sound reconstruction is not trivial" and that prior bytecode tools (Securify et al.) produce "unsound results" on exactly this (eThor, lines 148–160, *full text*). The data-dependent-dispatch difficulty H3 named is *present at the bytecode layer*, not dissolved by it. This is a direct concession to the Falsifier: the bytecode level is where you can *state the problem soundly*, not where it becomes *easy*.

- **The gas axis shows the same relocation.** GASOL cannot collapse data-dependent flow to a constant; when the flow depends on inputs the bound becomes **parametric** rather than constant (GASOL, line 76, *full text*). Parametric/symbolic bounds are the hardness surviving the lift to bytecode, not vanishing at it.

So: any reading of H3 as "go to KEVM and the data-dependent chaining problem becomes tractable" **collapses**. I do not defend it.

---

## 2. The directional core that survives: NECESSITY

Strip "tractable...only" and ask the narrower, sharper question the ticket actually poses: *can source-level tools even **express** data-dependent dispatch and return-data chaining, or must you drop to EVM-level semantics to do so soundly at all?* On this the corpus is unusually decisive — and it favors the proponent.

- **The canonical source-level verifier literally cannot express the constructs return-data chaining is built from.** solc-verify "currently does not support inline assembly and creating new contracts" (solc-verify, line 363, *full text*) and, crucially, "does not support low-level function calls such as callcode and delegatecall as it is considered dangerous and **would require encoding of the EVM details (contract layout, EVM semantics)**" (solc-verify, lines 436–438, *full text*). Return-data chaining in this project is *implemented in inline assembly around low-level CALL/STATICCALL with manual mcopy of returndata* — precisely the three things solc-verify drops. The source-level tool does not under-approximate this flow; it cannot represent it, and it tells you so, naming the reason as "would require encoding of EVM semantics."

- **The expressibility gap is structural, not incidental.** solc-verify's own authors state the source-level bet: "we are working on the source code directly. This has the advantage that the... transformation (from model to source) is eliminated" (solc-verify, line 773–775). The flip side, which eThor states, is that **there is no complete formal semantics of Solidity at all** — ZEUS's Solidity→IR translation "[makes] it impossible to prove the performed translation to be semantics-preserving and consequently to derive formal guarantees" (eThor, lines 113–119, *full text*). So a *sound* account of data-dependent, returndata-driven control/data flow has nowhere to live except a formal EVM-bytecode semantics, because that flow is defined in terms of memory regions, returndatasize, and computed jumps — objects that only exist at the EVM level. eThor's CALL abstraction is defined in exactly those terms ("memory addresses specifying the location of the input and the return data," line 744).

- **The corpus's own taxonomy confirms the source/bytecode split is the relevant axis.** The systematic review classifies tools by granularity and locates the soundness-bearing semantic tools (KEVM, the Isabelle/HOL and Semantic-Framework line) at the bytecode/operational-semantics level (review, KEVM entry lines 905–912; MadMax lifting "low-level EVM bytecode into high-level IR," lines 913–920, *full text*), while source-level tools are explicitly tied to Solidity AST/source parsing (review, lines 255, 637, *full text*). The semantic framework itself frames its EVM-bytecode model as "a sound over-approximation of the original semantics" (Semantic Framework, line 78, *full text*) — i.e., soundness is anchored to the bytecode semantics, not the source.

Net: **"source-level abstractions cannot even express data-dependent dispatch / low-level returndata chaining" is solidly supported.** Necessity holds.

---

## 3. Reframed hypothesis

> **H3′ (revised):** Return-data chaining creates control/data flow defined over EVM-level objects (returndata regions, computed jump destinations, raw memory) that source-level verifiers cannot express and therefore cannot soundly verify; a bytecode/operational EVM semantics (KEVM-class) is **necessary** to *state* the problem soundly. It is **not sufficient**: the same data-dependent dispatch reappears at the bytecode layer as path explosion, ⊤-havoced return values, and parametric gas bounds, so necessity does not imply tractability.

Does the corpus support H3′? **Yes, on both clauses:**

- Necessity: solc-verify's explicit non-support for inline assembly + low-level calls (lines 363, 436–438), plus the absence of a complete Solidity semantics (eThor 113–119) → source level cannot express it. **Supported.**
- Insufficiency: eThor's λx.⊤ havoc of return values (780–782), its concession that sound dynamic-jump reconstruction "is not trivial" (152–160), and GASOL's parametric (non-constant) data-dependent bounds (line 76) → bytecode level relocates rather than removes the hardness. **Supported.**

---

## 4. Honest residual weaknesses (limits of even the reframed claim)

1. **No corpus paper tests return-data chaining *specifically*.** The strongest source — `MultiCall: A Transaction-batching Interpreter for Ethereum` (corpus #124) — is *failed / abstract-only* (manifest: 403), so the artifact closest to this project's mechanism is uncited-able in full. The necessity argument is assembled from adjacent constructs (delegatecall, inline assembly, unknown-callee returndata), which are the right primitives but not a direct experiment on chaining. This is an *inference*, well-grounded, not a measurement.

2. **KEVM full text was not retrieved** (manifest: "Stream has ended unexpectedly," *abstract only*). The claim that KEVM-class semantics are the *right* sufficient-machinery level rests on the review's secondhand description (lines 905–912) and on eThor/Semantic-Framework as KEVM-adjacent operational semantics, not on KEVM's own text. The "necessary" claim survives this gap (it only needs the source-level *failure*, which is directly cited); the prescription of *which* bytecode formalism does not.

3. **"Necessary" is about soundness, not bug-finding.** Heuristic source-level or symbolic tools can still *find* chaining bugs unsoundly. H3′ is a claim about *sound verification*, and should be stated as such; it does not say source-level tooling is useless.

---

## 5. Verdict

The Falsifier kills "tractable" and "only" — conceded. But the load-bearing, non-trivial half of H3 — that **sound verification of return-data chaining requires dropping to EVM-bytecode semantics because source-level verifiers provably cannot express the underlying low-level call/returndata/computed-dispatch flow** — stands on direct corpus quotations (solc-verify lines 363 + 436–438; eThor 113–119, 152–160, 780–782; GASOL 76). H3 **partially holds**, and is strongest restated as *necessary but not sufficient*.

---

### Citations (corpus_focused.json / fulltext manifest)

- eThor: Practical and Provably Sound Static Analysis of Ethereum Smart Contracts — DOI 10.1145/3372297.3417250 — *full text* (lines 113–119, 148–160, 744, 780–782).
- solc-verify: A Modular Verifier for Solidity Smart Contracts — DOI 10.1007/978-3-030-41600-3_11 — *full text* (lines 363, 436–438, 773–775).
- GASOL: Gas Analysis and Optimization for Ethereum Smart Contracts — DOI 10.1007/978-3-030-45237-7_7 — *full text* (line 76).
- A Semantic Framework for the Security Analysis of Ethereum Smart Contracts — DOI 10.1007/978-3-319-89722-6_10 — *full text* (line 78).
- Ethereum Smart Contract Analysis Tools: A Systematic Review — DOI 10.1109/access.2022.3169902 — *full text* (lines 255, 637, 905–920).
- KEVM: A Complete Semantics of the Ethereum Virtual Machine — corpus #33 — *abstract only* (full text retrieval failed, manifest).
- MultiCall: A Transaction-batching Interpreter for Ethereum — corpus #124 — *abstract only* (403, manifest).
