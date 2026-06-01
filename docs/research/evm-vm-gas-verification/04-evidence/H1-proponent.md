# H1 Proponent Brief — Where the interpreter-attributable gas lives

**SUPPORT STRENGTH: moderate** — The EVM gas schedule and multiple peer-reviewed gas-analysis/optimization papers converge on the claim that EVM gas concentrates in storage and memory/copy operations, while stack-and-dispatch arithmetic is cheap. The most direct quantitative result (GASOL/SYRUP) shows stack-only optimization yields ~0.58% gas, but adding memory/storage handling lifts gains to 16.42% — i.e., the savings live in memory/storage, not stack/dispatch. The case is downgraded from "strong" because **no paper in the corpus measures a Weiroll/multicall chaining interpreter directly**, and the strongest evidence speaks to storage (SSTORE/SLOAD) at least as much as to the memory-expansion + calldata/returndata-copy mechanism that H1 specifically names. The evidence is therefore strongly directional but partly indirect for the exact mechanism H1 asserts.

---

## H1 (restated)

In a chaining interpreter VM (Weiroll/multicall style), the dominant *interpreter-attributable* gas cost is memory expansion + calldata/returndata copying between sub-calls, **not** opcode dispatch — so `mcopy`/EIP-5656 and memory-layout choices, not dispatch reduction, are where the savings live.

---

## 1. Papers supporting H1 and what each shows about WHERE EVM gas concentrates

### 1a. GASOL: Gas Analysis and Optimization for Ethereum Smart Contracts (full text)
Albert, Correas, Gordillo, Román-Díez, Rubio. TACAS 2020, LNCS 12079, pp. 118–125. DOI: 10.1007/978-3-030-45237-7_7.

The single most quantitatively useful paper for H1's mechanism, because it explicitly contrasts storage cost vs. memory cost using the real EVM gas schedule:

- States plainly: *"the gas consumption is often dominated by the instructions that access the storage"* and *"instructions that use replicated storage are gas-expensive."*
- Measured example (`fill` function of `ExtraBalToken`): the storage-only cost model shows **40,000 of 40,896 gas per loop iteration is storage** — i.e., >97% of per-iteration gas is in SSTORE/SLOAD, with the remaining opcode/arithmetic work a rounding error by comparison.
- Quantifies the gas-schedule gap that is the *engine* of H1's mechanism: *"each write access [SSTORE] costs 20.000 in the worst case and 5.000 in the best case"* whereas *"an access to the local memory costs only 3."* Their optimization replaces repeated storage access with a copy-to-memory + memory access pattern and cuts in-loop gas by **49.45%** (≈20% even using the cheap-SSTORE assumption).

**Relevance to H1:** This is the cleanest demonstration that EVM gas is dominated by data-movement/state opcodes, not by the cheap stack/arithmetic opcodes that constitute "dispatch." It directly establishes the 3-gas memory tier vs. thousands-of-gas storage tier that makes memory-layout choices the lever. *Caveat:* the dominant term here is storage, not the memory-expansion/copy term H1 names — see §4.

### 1b. A Max-SMT Superoptimizer for EVM handling Memory and Storage (full text)
Albert, Gordillo, Hernández-Cerezo, Rubio. TACAS 2022, LNCS 13243, pp. 201–219. DOI: 10.1007/978-3-030-99524-9_11.

The strongest *comparative* evidence that dispatch-level (stack) optimization is near-exhausted while memory/storage is where headroom remains:

- The predecessor stack-only superoptimizer SYRUP, which **deliberately excludes memory operations**, reported only **0.58% global Ethereum gas reduction**; Souper (LLVM, instruction-count) ~4.4% instruction reduction. The paper's framing: *"Leaving out memory operations dismisses optimization opportunities."*
- Extending the same Max-SMT machinery to handle memory and storage yields **16.42% gas gains over SYRUP** on 12,378 blocks from 30 real contracts — a ~28× larger gain, attributable specifically to (a) larger optimizable blocks once memory ops are no longer block-splitters and (b) eliminating redundant memory/storage accesses themselves.
- Phase attribution on the optimized set: of total gas saved, **14.6% came from memory rules, 34.4% from stack rules, 51% from the Max-SMT solver** — note the memory + solver work (the part enabled only by modeling memory) dominates over pure stack simplification.
- Confirms the two-tier model underlying H1: storage is *"persistent... and has a higher gas cost"*; memory is *"temporary... and thus is cheaper."*

**Relevance to H1:** This is the closest the corpus comes to an apples-to-apples "dispatch reduction vs. memory" comparison. Pure stack/dispatch optimization had already been pushed to <1% of global gas; the order-of-magnitude additional savings only appeared once memory/storage were modeled. That is exactly H1's thesis form: dispatch reduction is a dead end; memory-layout is where the savings live.

### 1c. A Semantic Framework for the Security Analysis of Ethereum Smart Contracts (full text)
Grishchenko, Maffei, Schneidewind. POST 2018, LNCS 10804, pp. 243–269. DOI: 10.1007/978-3-319-89722-6_10. (arXiv:1802.08660)

Provides the formal mechanism for the inter-call cost that H1 specifically names. In the small-step semantics of `CALL`, the cost is decomposed as `Cbase + Cmem(μ.i, aw) + ccall`, and the paper notes: *"as the memory needs to be accessed for reading the input value and writing the return value, the number of active words in memory might be increased... As accessing additional words in memory costs gas, this cost needs to be taken into account."* The memory-extension function `M` and cost function `Cmem` are first-class terms in the cost of every CALL.

**Relevance to H1:** This is direct mechanistic support for the "memory expansion + calldata/returndata copying between sub-calls" half of H1. Each sub-call in a chaining interpreter reads inputs from and writes returns into memory; the formal semantics charges `Cmem` for the resulting active-word growth on every such call. The semantics does **not** assign any analogous per-step "dispatch" surcharge — dispatch is ordinary cheap stack/JUMP work.

### 1d. Running on Fumes — Preventing Out-of-Gas Vulnerabilities ... Static Resource Analysis (full text)
Albert, Gordillo, Rubio, Sergey. VECoS 2019, LNCS 11847, pp. 63–78. (arXiv:1811.10403)

Independently corroborates the cost structure H1 relies on:

- The EVM gas of each instruction has *"two parts: (i) the memory gas cost, if the instruction accesses a location in memory which is beyond the previously accessed locations (known as active memory), it pays a gas proportional to the distance of the accessed location; (ii) the opcode gas cost."* This is the explicit statement that **memory expansion is a distinct, position-dependent cost component charged on top of the opcode** — the heart of H1's "memory expansion" term.
- Identifies the parametric-cost opcodes as exactly the copy family: *"CALLDATACOPY, CODECOPY, RETURNDATACOPY..."* — i.e., the data-copy opcodes have input-size-dependent (non-constant) cost, whereas dispatch opcodes are flat and cheap.
- Gives the memory cost function form `Cmem(a) = Gmemory·a + ...` with `Gmemory = 3` (linear term) plus a higher-order term — the standard schedule whose super-linear growth makes large/poorly-laid-out memory regions expensive.

**Relevance to H1:** Confirms, from an independent tool/team-year, that (a) memory expansion is its own cost axis growing with the highest word touched, and (b) the size-dependent opcodes are the copy opcodes — precisely the calldata/returndata copying H1 fingers as dominant in a chaining VM.

### 1e. MadMax: surviving out-of-gas conditions in Ethereum smart contracts (abstract only — full text retrieval 403'd)
Grech, Kong, Jurisevic, Brent, Scholz, Smaragdakis. PACMPL 2(OOPSLA) 2018, 116:1–116:27. DOI: 10.1145/3276486.

Supports H1 only indirectly and weakly: it establishes that gas-exhaustion vulnerabilities cluster around *"dynamic data structure storage"* and unbounded loops over storage — again pointing at storage/data-structure access (not dispatch) as the gas-dominant, even safety-critical, axis. Tagged abstract-only; treat as corroborating context, not primary evidence.

---

## 2. Quality of the evidence

| Paper | Venue / rigor | Tag | Weight for H1 |
|---|---|---|---|
| Max-SMT Superoptimizer (GASOLv2) | TACAS 2022, peer-reviewed; 12,378 blocks / 30 real contracts; quantified phase attribution | full text | **High** — best comparative dispatch-vs-memory result |
| GASOL | TACAS 2020, peer-reviewed; gas-schedule-grounded, real-contract example | full text | **High** — best storage-vs-memory cost contrast |
| Semantic Framework | POST 2018, F*-formalized, validated vs. official test suite | full text | **High for mechanism**, indirect for magnitude |
| Running on Fumes | VECoS 2019, peer-reviewed, gas-schedule formalization | full text | **Moderate–High** — confirms memory-expansion + copy cost structure |
| MadMax | OOPSLA 2018, highly cited (344) | abstract only | **Low** — directional corroboration only |

Strengths of the corpus: three of the four load-bearing papers are full text, peer-reviewed at strong venues (TACAS, POST, VECoS), grounded directly in the Ethereum Yellow Paper gas schedule, and at least two report measurements on real on-chain contracts at scale. The GASOLv2 stack-only-vs-memory comparison is a genuine controlled contrast, not just an assertion.

Weaknesses: all four are gas-*analysis/optimization* or *semantics* papers about generic smart contracts. None instruments a Weiroll/multicall interpreter. The empirical magnitudes (40,000/40,896; 16.42% vs 0.58%) are dominated by **storage**, whereas H1's named mechanism is **memory expansion + calldata/returndata copy**. So the corpus over-proves the weaker claim ("gas lives in data/state movement, not dispatch") and under-proves the exact claim ("specifically in inter-call memory/copy, fixable by mcopy").

---

## 3. The mechanism (EVM gas schedule) making H1 plausible

The gas schedule itself is the strongest a-priori argument, and the corpus papers state its relevant pieces:

1. **Dispatch is cheap and flat.** A Weiroll-style dispatch loop is PUSH/DUP/SWAP/JUMP/arithmetic — the `verylow`/`base`/`mid` families (3, 2, 5–8 gas). GASOL's gas-family cost model and the superoptimizer's stack model both treat these as the low-cost tier; SYRUP optimizing *only* these reached <1% of global gas. There is no per-instruction "interpreter dispatch tax" in the schedule beyond these ordinary opcodes.

2. **Memory expansion is super-linear and per-active-word.** Running on Fumes and the Semantic Framework both encode `Cmem` growing with the highest word touched (linear `Gmemory·a = 3a` plus a higher-order term). A chaining interpreter that lays return buffers high in memory, or copies large returndata blobs, pushes the active-word high-water mark up and pays the super-linear term repeatedly. Memory *layout* (where you place buffers) therefore directly moves cost — exactly H1's "memory-layout choices" lever.

3. **Copy opcodes are size-dependent.** CALLDATACOPY/CODECOPY/RETURNDATACOPY are explicitly flagged (Running on Fumes) as parametric-cost. In a chaining VM, every sub-call's inputs/outputs flow through these copies; their cost scales with payload size, not with instruction count. EIP-5656 `mcopy` exists precisely to make in-memory copying cheaper than load/store loops — so reducing/optimizing copies is a real lever, while reducing dispatch instruction *count* is not.

4. **Per-CALL memory cost is charged for I/O.** The Semantic Framework shows `CALL` cost includes `Cmem` for reading inputs and writing returns. The interpreter-attributable overhead of "one more sub-call" is dominated by this memory/argument plumbing, not by the few dispatch opcodes that decode the next instruction.

Put together: the schedule prices *data movement and state* in the thousands (storage) or super-linearly (memory), and prices *control/dispatch* in single-digit, flat gas. An interpreter's marginal overhead is therefore overwhelmingly data-plumbing, which is what H1 claims.

---

## 4. Honest assessment of how strong the case is

**Where the case is strong:**
- The negative half of H1 ("not opcode dispatch") is well supported: SYRUP's <1% global gas from pure stack/dispatch optimization (Max-SMT paper, full text) is direct evidence that squeezing dispatch yields almost nothing, while modeling memory/storage yields ~28× more.
- The gas-schedule mechanism (§3) is corroborated by two independent full-text formalizations (Semantic Framework, Running on Fumes) and is not in dispute.

**Where the case rests on indirect or adjacent evidence:**
- **No direct measurement of a Weiroll/multicall interpreter exists in the corpus.** The one on-point title — *MultiCall: A Transaction-batching Interpreter for Ethereum* (Çelik et al.-style, ACM ISBSCI 2021, DOI 10.1145/3457337.3457839) — is in the corpus but its abstract is empty and full-text retrieval failed (403). It cannot be cited for any finding. So the leap from "generic EVM gas concentrates in memory/storage" to "the *interpreter-attributable* portion concentrates in inter-call memory/copy" is an inference, not a measured result.
- **Storage vs. memory conflation.** The biggest measured numbers (GASOL's 40,000/40,896; the 16.42% gain) are driven by SSTORE/SLOAD, i.e., *storage*. H1 specifically names *memory expansion + calldata/returndata copy*. These are the same broad category ("data/state movement beats dispatch") but not identical. A chaining interpreter that touches no storage would not exhibit GASOL's 97%-storage profile; its dominant cost would shift toward the memory/copy terms — plausible from the schedule, but not directly measured here. The honest framing: the corpus proves "dispatch is not where gas lives" robustly, and proves "memory expansion/copy is a real, super-linear, layout-sensitive cost" mechanistically, but does not provide a measured decomposition isolating memory-copy as *the* dominant interpreter term over storage in a real VM.
- **`mcopy`/EIP-5656 is not evaluated by any corpus paper.** All full-text papers predate widespread mcopy use. The claim that mcopy specifically is "where the savings live" is supported only transitively: copies are size-dependent and on the hot path (Running on Fumes), and mcopy is the cheaper primitive for them. No paper benchmarks mcopy vs. mload/mstore loops.

**Net:** A reasonable, schedule-grounded, multi-paper case that interpreter VM overhead is data-plumbing (memory/copy/storage), not dispatch — supporting the spirit and the negative claim of H1 firmly. It falls short of *strong* only because the exact positive claim (memory-copy specifically dominant, mcopy specifically the lever, in a Weiroll-style VM specifically) rests on mechanism + analogy rather than a direct measurement, and the one directly-relevant interpreter paper was unretrievable.

---

## Citations (corpus only)

- Albert, Correas, Gordillo, Román-Díez, Rubio. *GASOL: Gas Analysis and Optimization for Ethereum Smart Contracts.* TACAS 2020, LNCS 12079:118–125. DOI: 10.1007/978-3-030-45237-7_7. **(full text)**
- Albert, Gordillo, Hernández-Cerezo, Rubio. *A Max-SMT Superoptimizer for EVM handling Memory and Storage.* TACAS 2022, LNCS 13243:201–219. DOI: 10.1007/978-3-030-99524-9_11. **(full text)**
- Grishchenko, Maffei, Schneidewind. *A Semantic Framework for the Security Analysis of Ethereum Smart Contracts.* POST 2018, LNCS 10804:243–269. DOI: 10.1007/978-3-319-89722-6_10 (arXiv:1802.08660). **(full text)**
- Albert, Gordillo, Rubio, Sergey. *Running on Fumes — Preventing Out-of-Gas Vulnerabilities in Ethereum Smart Contracts using Static Resource Analysis.* VECoS 2019, LNCS 11847:63–78 (arXiv:1811.10403). **(full text)**
- Grech, Kong, Jurisevic, Brent, Scholz, Smaragdakis. *MadMax: surviving out-of-gas conditions in Ethereum smart contracts.* PACMPL 2(OOPSLA) 2018, 116:1–116:27. DOI: 10.1145/3276486. **(abstract only)**

*Noted but NOT citable for findings (no usable text in corpus):* *MultiCall: A Transaction-batching Interpreter for Ethereum*, DOI: 10.1145/3457337.3457839 — the one directly on-topic interpreter paper; abstract empty and full-text retrieval failed.
