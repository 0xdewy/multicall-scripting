# H3-proponent — Return-data chaining defeats source-level/static abstractions; sound VM verification is tractable only at bytecode-semantics level

**SUPPORT STRENGTH: moderate — the two enabling premises are each directly and strongly
supported by corpus full text: (a) source-level Solidity verifiers structurally cannot model the
data-dependent low-level dispatch a chaining VM relies on (solc-verify states it outright), and
(b) data-dependent control flow (dynamic jump destinations) and unknown/dynamic call targets are
the named, primary obstacle to sound static/bytecode analysis (eThor, Semantic Framework, Running
on Fumes). The bridge to the *exclusive* conclusion — "sound verification is tractable ONLY at the
bytecode-semantics (KEVM-style) level" — is sound inference rather than a directly stated corpus
claim, and KEVM itself is available to me as abstract only. Hence moderate, not strong: the
"defeats source-level" half is strong; the "only at bytecode level" half is well-motivated
inference with a partially unread keystone (KEVM).**

---

## Provenance / honesty note

- **Read as full text and cited as such:** solc-verify (full text); A Semantic Framework for the
  Security Analysis of Ethereum Smart Contracts (full text); eThor (full text, truncated to 60k
  chars); Running on Fumes (full text); GASOL (full text); the Ethereum Smart Contract Analysis
  Tools systematic review (full text).
- **Cited as abstract only** (full-text fetch failed or corpus marks `abstract_only`): KEVM: A
  Complete Semantics of the Ethereum Virtual Machine (abstract only — the task asked me to read
  KEVM full text, but `data/fulltext/manifest.json` records its download as failed: "Stream has
  ended unexpectedly"; no KEVM `.txt` exists in `data/fulltext/`); A Survey on Formal Verification
  for Solidity Smart Contracts (abstract only); Towards verifying ethereum smart contract bytecode
  in Isabelle/HOL (abstract only).
- I do not paraphrase evidence I could not read. Where KEVM/Isabelle content is used, it is from
  the corpus abstract or from *other papers' characterizations* of those works (e.g. the Semantic
  Framework's description of Hirai's Isabelle/HOL semantics), and tagged accordingly.

---

## What H3 actually requires

H3 has three conjoined claims. I marshal evidence for each and am explicit about which is
inference:

1. **(Mechanism)** Return-data chaining creates *data-dependent* control/data flow — the target of
   a later call, and where its inputs come from, are computed at runtime from earlier return data
   in memory.
2. **(Source-level defeat)** The static abstractions that source-level (Solidity) verifiers rely on
   — known call targets, Solidity-level semantics, no inline assembly/memory model — break under
   (1).
3. **(Bytecode-only tractability)** Sound verification of such a VM is consequently tractable only
   at the bytecode-semantics level (KEVM / Isabelle/HOL-style).

Claims (1)–(2) are directly supported. Claim (3) is supported as the natural consequence, but the
*exclusivity* ("only") is inference.

---

## 1. Bytecode-level semantics handle low-level dynamic dispatch / data-dependent jumps that
source-level verifiers cannot

### 1a. solc-verify concedes the exact structural gap (full text)

solc-verify is the corpus's representative source-level Solidity verifier, and it states its own
boundaries in terms that map almost one-to-one onto a return-data-chaining VM:

- **It reasons at the Solidity source level, by design, and explicitly *abstracts away* EVM memory
  and contract layout.** "Built on top of the Solidity compiler, solc-verify reasons at the level
  of the contract source code, as opposed to the more common approaches that operate at the level
  of Ethereum bytecode" (solc-verify, Abstract). It translates an AST to Boogie; the blockchain is
  modeled as a Burstall–Bornat heap of typed state variables. There is **no EVM word-addressed
  memory model** — precisely the substrate a chaining VM uses to splice return bytes from one call
  into the calldata of the next.
- **It does not support inline assembly.** "solc-verify currently does not support inline assembly
  and creating new contracts from within another contract (`new` expressions)" (solc-verify, §4,
  Statements and expressions). A multicall-scripting VM that `mcopy`s return data into calldata
  regions lives entirely in assembly/low-level memory; it is outside solc-verify's modeled
  language.
- **It does not support `delegatecall`/`callcode` and says why.** "solc-verify does not support
  low-level function calls such as `callcode` and `delegatecall` as it is considered dangerous and
  would require encoding of the EVM details (contract layout, EVM semantics)" (solc-verify, §4,
  Transactions). This is a direct admission that the low-level dispatch primitives require *EVM-level*
  semantics that the source-level tool deliberately does not encode.
- **Unknown/dynamic call targets are over-approximated to "arbitrary computation."** "Since there
  can be an unknown code behind the called address, solc-verify treats such cases as an external
  call that can perform arbitrary computation" (solc-verify, §4). When the call target or its
  behavior is data-dependent — the defining feature of a chaining VM where a return value selects
  or parameterizes the next call — the source-level tool collapses it to top (arbitrary), i.e. it
  cannot reason about the chained data flow at all.

Together these establish claim (2) directly: the abstractions solc-verify relies on (typed state
variables, no word-addressed memory, known Solidity call statements, unknown calls = arbitrary)
are exactly the abstractions a return-data-chaining VM violates.

### 1b. The Semantic Framework argues low-level/bytecode semantics are *required* and that
source/over-approximate models are unsound for this class (full text)

The Grishchenko–Maffei–Schneidewind framework is the strongest corpus support for "you must go to
the bytecode level":

- **Bytecode is where the dynamic behavior lives, and it is hostile to static reasoning.** EVM
  bytecode is "a stack-based low-level code featuring dynamic code creation and invocation and, in
  general, very little static information, which makes it extremely difficult to analyze"
  (Semantic Framework, §1). "Dynamic code creation and invocation" with "very little static
  information" is precisely the regime a data-dependent chaining VM induces.
- **They build the first *complete* small-step EVM bytecode semantics precisely because rigorous
  verification "is of paramount importance ... in particular at the level of the bytecode being
  executed"** (Semantic Framework, Abstract). The CALL rule they give is fully data-dependent: the
  callee `to`, value `va`, and the input region `μ.m[io, io+is−1]` are all read from the machine
  stack/memory at runtime (Semantic Framework, §3.4) — the formal mirror of return-data chaining,
  and a behavior only expressible once memory and stack are modeled at bytecode granularity.
- **Source-level / over-approximating semantics are shown to be *unsound* here.** They report that
  Hirai's Isabelle/HOL semantics is "just a sound over-approximation": "once a contract performs a
  call that is not a self-call, it is assumed that arbitrary code gets executed and consequently
  arbitrary changes ... can be performed," so it "can not serve as a general-purpose basis for
  static analysis techniques that might not rely on the same over-approximation" (Semantic
  Framework, §1, Related Work — this is their characterization of the Isabelle/HOL work, which I
  read only via this paper and via that work's abstract). The same arbitrary-call over-approximation
  is exactly what solc-verify also does (§1a) — confirming the limitation is general to the
  *abstraction*, not to one tool.
- **Properties of a chaining/calling VM need *hyperproperties* over the bytecode semantics, beyond
  what static analyzers express.** Call integrity, effect/code independence, atomicity, and
  miner-independence are defined as hyper- and safety properties over the small-step bytecode
  semantics, and the authors note "existing static analysis techniques for smart contracts rely on
  reachability properties and syntactic conditions" and that "the syntactic conditions employed in
  current analysis techniques are imprecise and, in several cases, unsound" (Semantic Framework,
  §1, Contributions). For a VM whose security/correctness *is* about how return data flows between
  calls, the properties of interest are exactly the call-integrity-style hyperproperties they show
  require bytecode-level semantics.

### 1c. KEVM / Isabelle/HOL as the bytecode-semantics endpoint (abstract only)

The "tractable only at bytecode level" endpoint is occupied in the corpus by KEVM and the
Isabelle/HOL semantics. I can support this only from abstracts and second-hand characterization:

- KEVM is "the first fully executable formal semantics of the EVM, the bytecode language in which
  smart contracts are executed," built in the K framework and passing the 40,683-test EVM stress
  suite (KEVM, Abstract — **abstract only**). It is the canonical bytecode-semantics substrate on
  which a sound VM analysis of data-dependent dispatch would be built.
- solc-verify itself classifies KEVM as the bytecode/theorem-prover alternative to its own
  source-level approach: "Kevm [24] is an executable formal semantics of EVM ... including a
  deductive program verifier" (solc-verify, §6) — corroborating the two-level split H3 asserts
  (source-level tools vs. bytecode-semantics tools).

This is the weakest link: KEVM full text was not available to me, so I cannot quote KEVM
*demonstrating* it handles a chaining VM's dynamic dispatch where source tools fail. The
inference rests on (i) KEVM being a complete executable bytecode semantics and (ii) the
independently-established fact that the obstacle is bytecode-level dynamic dispatch.

---

## 2. Static analyzers rely on CFG/call-target abstractions that data-dependent chaining breaks

This is the second pillar of H3 and it is the most directly and repeatedly supported claim in the
corpus.

### 2a. eThor: dynamic jump destinations are *the* named obstacle, and sound CFG recovery is
"not trivial" (full text)

eThor is a sound static analyzer for EVM bytecode, so its admissions are especially weighty:

- **"Analyzing EVM bytecode is particularly challenging as the underlying execution model allows
  for dynamic jump destinations. Most works ... reconstruct the control flow of a given smart
  contract before the analysis. However, recovering jump destinations is interconnected with the
  contract's execution, and hence, performing such a sound reconstruction is not trivial"** (eThor,
  §"Correct control flow reconstruction"). It even notes a prior tool used "a custom algorithm —
  whose correctness is never discussed." This is the exact phenomenon H3 invokes: when jump/dispatch
  targets are *data-dependent* (a function of values computed at runtime — e.g. chained return
  data), the static CFG abstraction that analyzers presuppose cannot be soundly recovered ahead of
  the analysis.
- **Call instructions are dynamically evaluated and callee code may be unavailable.** CALL/CREATE
  arguments "are dynamically evaluated and the execution environment has to be tracked and properly
  modified across different calls. Furthermore, it can well be that the code of a called function is
  not accessible at analysis time" (eThor, §2). A chaining VM maximizes both: call targets/inputs
  are computed from prior results, and callees are arbitrary external contracts.
- **eThor's response is to abandon the "recover a fixed CFG first" abstraction and reason directly
  over a Horn-clause abstraction of the *bytecode small-step semantics*, proven sound against the
  complete EVM semantics** (eThor, Abstract; §3). That a sound EVM analyzer must operate over
  bytecode semantics — rather than a pre-recovered source/CFG abstraction — is corpus-level support
  for H3's direction of travel: soundness here is bought at the bytecode-semantics level.

### 2b. Running on Fumes / gas analyzers: CFG + jump-address recovery is a known, fragile
prerequisite (full text)

- Gas inference "include[s]: (1) construction of the control-flow graphs (CFGs), (2) decompilation
  from low-level code to a higher-level representation ..." (Running on Fumes). The whole static
  pipeline is *predicated on* recovering a CFG.
- That recovery is known to be unsound out of the box: the Oyente-based framework had to be extended
  "to recover the list of addresses for unconditional blocks with more than one possible jump
  address (as Oyente originally only kept the last processed one)" (Running on Fumes). I.e. when a
  jump has multiple data-dependent targets, the off-the-shelf analyzer silently dropped all but one
  — a soundness hole exactly of the H3 kind.
- GASOL likewise "uses various tools to extract the CFGs and decompile them" (GASOL), and the
  Max-SMT superoptimizer "partitions the bytecode ... into ... blocks of the CFG" as a "standard"
  compiler step (Max-SMT Superoptimizer, full text). These tools *assume* a recoverable static CFG;
  none claims soundness when jump targets are data-dependent. This corroborates that the fixed-CFG
  abstraction is the load-bearing assumption a chaining VM removes.

### 2c. The "unknown environment" abstraction degenerates to top under data dependence (full text)

eThor's own design shows what happens to precision when control/data flow becomes data-dependent on
unknown components: storage, memory, and the stack-top "get abstracted due to influence of unknown
components," and after an unknown call "storage gets over-approximated ... by λx.⊤"; the callstack
is collapsed to a two-level abstraction because "the state of the callstack when reentering is
obscure" (eThor, §3.1–§3.2). A chaining VM threads attacker/return-data-controlled values through
exactly these channels, pushing a sound analyzer toward ⊤ unless it tracks the data flow at
bytecode granularity — which is what eThor does and what source-level tools cannot.

---

## 3. Quality of evidence

| Claim | Best evidence | Type | Strength |
|---|---|---|---|
| Source-level verifiers can't model low-level/dynamic dispatch | solc-verify §4 (no asm, no delegatecall, unknown call = arbitrary) | full text, primary, self-reported | **Strong** |
| Source/over-approx semantics unsound for non-self-calls | Semantic Framework §1 (re Hirai Isabelle/HOL) | full text (characterizing an abstract-only work) | Strong for the claim; second-hand for Isabelle specifics |
| Bytecode-level semantics needed for calling-VM properties | Semantic Framework Abstract, §3.4, §1 Contributions | full text, primary | **Strong** |
| Dynamic jump destinations defeat sound CFG recovery | eThor §"control flow reconstruction"; §2 | full text, primary | **Strong** |
| Static gas/analysis pipelines presuppose a recoverable CFG; multi-target jumps were a real soundness hole | Running on Fumes; GASOL; Max-SMT Superoptimizer | full text, primary | **Strong** (corroborated across 3 papers) |
| Sound EVM analysis is achieved by reasoning over bytecode semantics | eThor (Horn abstraction proven sound vs. complete EVM semantics) | full text, primary | **Strong** |
| KEVM-style bytecode semantics is the (only) tractable level for such a VM | KEVM Abstract; solc-verify §6 | **abstract only** for KEVM + inference | **Moderate / inference** |

**Strengths of the corpus for H3:**
- The two enabling premises are stated *by the tools themselves*, not by critics — solc-verify
  admits its own source-level limits; eThor admits dynamic-jump CFG recovery is hard; multiple gas
  analyzers admit dependence on CFG recovery. Self-reported limitations from the proponents of those
  tools are high-quality, low-bias evidence.
- Convergent evidence: four independent full-text papers (solc-verify, Semantic Framework, eThor,
  Running on Fumes) point the same direction.

**Weaknesses / threats to validity (kept honest):**
- **The keystone is partially unread.** KEVM full text was not retrievable; the "only at bytecode
  level" endpoint is supported by KEVM's abstract plus inference, not by reading KEVM demonstrate the
  chaining case. Same for the Isabelle/HOL paper (abstract only) and the Solidity-FV survey
  (abstract only) — I could not mine them for direct statements.
- **None of these papers analyze a return-data-chaining multicall VM specifically.** The corpus
  contains no full-text study of such a VM. The mapping from "EVM dynamic jumps / dynamic call
  targets" to "this specific multicall-scripting chaining mechanism" is an analogy I assert (a
  strong one — the mechanism *is* implemented in EVM memory + low-level calls), not a result a
  corpus paper proves. MultiCall: A Transaction-batching Interpreter for Ethereum (DOI
  10.1145/3457337.3457839) is in the corpus but failed to download, so I cannot cite its internals.
- **"Defeats" vs. "is imprecise on."** The full-text evidence robustly supports that source-level
  tools *cannot express/model* the construct (solc-verify) and that static analyzers *lose soundness
  or precision* on dynamic jumps/targets (eThor, Running on Fumes). It does *not* prove that *no*
  source-level technique could ever be extended; solc-verify's gaps are engineering-cum-design
  choices, and the Semantic Framework even sketches program-dependence-graph over-approximations.
  So "defeats" is well-supported for existing tools/abstractions; "in principle impossible at source
  level" is stronger than the corpus licenses.

---

## 4. Honest strength assessment

**Moderate, leaning strong on the first two clauses.**

- **Clause 1 (mechanism: data-dependent control/data flow):** strongly supported — the EVM CALL
  semantics is literally data-dependent on stack/memory (Semantic Framework §3.4), and dynamic jump
  destinations are intrinsic to EVM (eThor).
- **Clause 2 (defeats source-level/static abstractions):** strongly supported — solc-verify's own
  unsupported-feature list (no assembly, no delegatecall, unknown-call = arbitrary, no EVM memory
  model) and eThor's "sound CFG recovery is not trivial under dynamic jumps," plus the gas-analyzer
  CFG-dependence, are direct, convergent, primary-source admissions.
- **Clause 3 (tractable *only* at bytecode level):** supported as the natural and well-motivated
  conclusion — the one sound EVM analyzer in the corpus (eThor) reaches soundness precisely by
  reasoning over bytecode semantics rather than a pre-recovered CFG, and the complete-semantics
  works (Semantic Framework; KEVM) sit at the bytecode level by necessity. But the *exclusive*
  "only" rests on inference plus an unread KEVM. A fair statement of what the corpus establishes is:
  **"sound verification of data-dependent dispatch has been achieved at the bytecode-semantics level
  and is structurally out of reach for current source-level Solidity verifiers and CFG-recovery-first
  static analyzers."** That is H3 minus the unqualified "only," and it is strongly supported.

**Bottom line for the strongest honest case:** H3's engine — "return-data chaining is data-dependent
dynamic dispatch, and that breaks the fixed-target/known-semantics abstractions of source-level and
CFG-based tools" — is on firm corpus ground (solc-verify, eThor, Semantic Framework, Running on
Fumes, all full text). The leap to "therefore *only* bytecode-semantics (KEVM-style) verification is
tractable" is the right direction and is where eThor's sound design points, but it is inference
resting on an abstract-only KEVM — hence the overall rating is **moderate**, not strong.

---

## Cited sources (corpus only)

- A. Hajdu, D. Jovanović. *solc-verify: A Modular Verifier for Solidity Smart Contracts.* DOI
  10.1007/978-3-030-41600-3_11. **(full text)**
- I. Grishchenko, M. Maffei, C. Schneidewind. *A Semantic Framework for the Security Analysis of
  Ethereum Smart Contracts.* DOI 10.1007/978-3-319-89722-6_10. **(full text)**
- C. Schneidewind, I. Grishchenko, M. Scherer, M. Maffei. *eThor: Practical and Provably Sound
  Static Analysis of Ethereum Smart Contracts.* DOI 10.1145/3372297.3417250. **(full text,
  truncated)**
- E. Albert et al. *Running on Fumes — Preventing Out-of-Gas Vulnerabilities in Ethereum Smart
  Contracts using Static Resource Analysis.* (corpus key; no DOI) **(full text)**
- E. Albert et al. *GASOL: Gas Analysis and Optimization for Ethereum Smart Contracts.* DOI
  10.1007/978-3-030-45237-7_7. **(full text)**
- E. Albert et al. *A Max-SMT Superoptimizer for EVM handling Memory and Storage.* DOI
  10.1007/978-3-030-99524-9_11. **(full text)**
- E. Hildenbrandt et al. *KEVM: A Complete Semantics of the Ethereum Virtual Machine.* (OpenAlex
  W2741675276; corpus has no DOI) **(abstract only — full-text fetch failed)**
- S. Amani et al. *Towards verifying ethereum smart contract bytecode in Isabelle/HOL.* DOI
  10.1145/3167084 (also 10.1145/3176245.3167084). **(abstract only)**
- *A Survey on Formal Verification for Solidity Smart Contracts.* DOI 10.1145/3437378.3437879.
  **(abstract only)**
