# H1 Falsifier — Gas cost is in the bytes, not the dispatch

**REFUTATION STRENGTH: partial — H1 as literally worded is false (the corpus shows storage dominates total gas and superoptimizer savings skew toward stack/scheduling, not memory), but the "interpreter-attributable" scoping rescue renders the claim non-falsifiable from this corpus. The falsifier's strongest contribution is exposing that the corpus contains NO direct interpreter-vs-native measurement, making H1 empirically untestable here.**

---

## Hypothesis under test

**H1:** In a chaining interpreter VM, the dominant *interpreter-attributable* gas cost is memory expansion + calldata/returndata copying between sub-calls, **not** opcode dispatch — so `mcopy`/EIP-5656 and memory-layout choices, not dispatch reduction, are where savings live.

---

## Attack 1 — False dichotomy: external CALL + SSTORE dominate, not the memory-vs-dispatch axis

### 1a. Storage dwarfs everything at the whole-transaction level

GASOL states unequivocally: *"the gas consumption is often dominated by the instructions that access the storage"* and demonstrates that in its running example (`fill` function of `ExtraBalToken`), **40,000 of 40,896 gas per loop iteration is storage** — >97% (*GASOL: Gas Analysis and Optimization for Ethereum Smart Contracts*, DOI 10.1007/978-3-030-45237-7_7, full text). An SSTORE costs 5,000–20,000 gas; a PUSH/JUMPI dispatch opcode costs 3–10 gas. If H1 is read as "where the gas in a multicall transaction goes," it is trivially wrong: storage operations are 100–1000× more expensive than dispatch.

"Running on Fumes" independently confirms: storage is *"quite expensive to use"* and persistent across calls, while memory is *"erased between calls"* and charged at 3 gas per byte accessed plus quadratic expansion costs (*Running on Fumes—Preventing Out-of-Gas Vulnerabilities…*, no DOI, full text). If memory is cheap and transient while storage is expensive and persistent, the claim that memory copying *dominates* is false at the whole-transaction level.

### 1b. The superoptimizer evidence points the other way — dispatch-savings > memory-savings in low-level code

The Max-SMT Superoptimizer for EVM reports its gas savings decompose as **51% from the Max-SMT stack scheduler, 34.4% from stack rules, and only 14.6% from memory rules** (*A Max-SMT Superoptimizer for EVM handling Memory and Storage*, DOI 10.1007/978-3-030-99524-9_11, full text). This is the *only* corpus paper that quantifies where savings live in low-level EVM code — and it says the stack/scheduling side is ~85% of the gain, while memory rules contribute a minority share. Moreover, those memory rules eliminate redundant MLOAD/MSTORE, not memory *expansion* costs, which is what H1's `mcopy` argument targets. The one quantitative decomposition in the corpus leans **against** H1.

### 1c. "Running on Fumes" and GASOL describe intra-contract analysis, not inter-contract marshalling

Every gas paper in this corpus analyzes or optimizes one contract's bytecode for whole-function gas bounds — none crosses a CALL boundary to reason about marshalling costs between sub-calls in a chaining VM. The corpus's gas-analysis tools are aimed at *application contracts*, not at the *interpreter glue layer* that H1 hypothesizes about. Applying GASOL's storage-dominance result or the superoptimizer's stack-favoring savings distribution to answer H1's inter-call question is an analogical inference at best, not a direct measurement.

---

## Attack 2 — No direct interpreter-vs-native measurement exists in the corpus

H1's own falsification clause names this explicitly: "the corpus contains a direct head-to-head interpreter-vs-native gas measurement that attributes overhead elsewhere." The corpus does contain *MultiCall: A Transaction-batching Interpreter for Ethereum* (DOI 10.1145/3457337.3457839), which is precisely the paper that could contain such a measurement — but its full text failed to fetch (403; manifest status: `failed`), and no abstract is available. So the one corpus entry that could settle H1 either way is **unavailable**.

The consequence: H1's claim about the interpreter-attributable gas breakdown in a real chaining VM is **empirically untestable** against this corpus. The corpus supplies gas-model primitives (opcode cost tables, memory-expansion cost formula) but contains zero papers that actually measure an interpreter loop's gas profile, compare interpreter overhead to native batching, or decompose inter-contract marshalling costs. H1 is a mechanism-grounded hypothesis whose core empirical question is unanswered.

---

## Attack 3 — Memory expansion cost is conditional and may invert for small payloads

The memory expansion cost described in "Running on Fumes" — *"the memory gas cost … proportional to the distance of the accessed location beyond the current active-memory size"* — is quadratic in the highest accessed address but effectively zero for small/fixed-size data. For a typical multicall chaining scenario with a single `uint256` or `address` return value spliced between calls (~32 bytes), the memory expansion gas is negligible (~3 gas for the word, with zero expansion cost if memory is already allocated). Dispatch overhead (a few JUMPI/PUSH/DUP ops per script iteration, ~3–10 gas each) can genuinely exceed the copy cost in this regime.

The `mcopy`/EIP-5656 argument in H1 is therefore conditional on **data-heavy chaining** — dynamically-sized arrays, structs, variable-length bytes being passed between sub-calls. For the light-chaining use case, dispatch overhead plausibly dominates, and H1's claim does not hold. The proponent's own rebuttal concedes this conditionality (H1-rebuttal, limit-3).

---

## Quality of the counter-evidence

- **Strong / full text:** GASOL (storage-dominance measurement), Max-SMT Superoptimizer (savings decomposition: 51/34.4/14.6), Running on Fumes (memory cost model, storage-vs-memory cost hierarchy). All read in full; quantitative claims extracted directly from the papers.
- **Key gap:** *MultiCall: A Transaction-batching Interpreter for Ethereum* — failed to fetch (403). The single most directly relevant paper is unavailable, making H1's empirical core untestable.
- **Limitation:** No corpus paper studies inter-call marshalling costs; all gas evidence is intra-contract. The entire dispute between H1's proponent and falsifier therefore operates at the level of mechanism and gas-model reasoning from primitives, not direct measurement.

---

## Verdict as falsifier

H1 as literally worded ("dominant cost is memory copying") is **false** at the whole-transaction level — storage dominates by orders of magnitude. The narrower "interpreter-attributable" scoping is a valid rescue but shifts H1 into territory where the corpus provides gas-model primitives but **no measurement**. H1 is therefore not refuted (the falsification clauses aren't satisfied by this corpus) but is also **not confirmed** — it is a design heuristic grounded in the EVM gas schedule, awaiting empirical validation.

The single most damaging fact for H1's credibility is the superoptimizer's 51/34.4/14.6 savings split — the only low-level gas-savings decomposition in the corpus and it favors stack/scheduling over memory. That, combined with the unavailability of the MultiCall paper, leaves H1 as an appealing mechanism-story with no direct experimental support from the literature.

**Refutation strength: moderate (kills the literal reading; relegates the scoped reading to "untested").**

---

## Citations (corpus_focused.json only)

- *GASOL: Gas Analysis and Optimization for Ethereum Smart Contracts* — DOI 10.1007/978-3-030-45237-7_7 (full text). Storage dominance; 40,000/40,896 gas = storage in example.
- *A Max-SMT Superoptimizer for EVM handling Memory and Storage* — DOI 10.1007/978-3-030-99524-9_11 (full text). Savings: 51% Max-SMT stack scheduler, 34.4% stack rules, 14.6% memory rules.
- *Running on Fumes—Preventing Out-of-Gas Vulnerabilities in Ethereum Smart Contracts using Static Resource Analysis* — no DOI (full text). Memory gas cost model; storage vs memory cost hierarchy.
- *MultiCall: A Transaction-batching Interpreter for Ethereum* — DOI 10.1145/3457337.3457839 (in corpus; full text unavailable, 403 — manifest `failed`).
