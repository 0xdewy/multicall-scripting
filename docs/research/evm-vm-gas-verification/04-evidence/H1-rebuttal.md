# H1 — Rebuttal

**REBUTTAL: partially holds — the literal "memory copying is where the gas is" framing is
contradicted by the corpus (GASOL: storage dominates; the superoptimizer: stack/scheduling
rules deliver ~85% of savings, memory rules only 14.6%). But scoping H1 to *interpreter-
attributable* overhead — excluding the called contracts' unavoidable storage/CALL costs —
survives the strongest attacks and is internally coherent. The fatal caveat: that rescuing
move is my own reasoning, NOT in the corpus, and the corpus contains NO direct
interpreter-vs-native measurement to confirm it either way. So H1 survives as a *defensible
design heuristic*, not as a corpus-established fact.**

> Note on provenance: the expected `H1-proponent.md` and `H1-falsifier.md` files do not exist
> in `04-evidence/` at the time of writing. I reconstructed both sides from the ticket
> (`03-open-questions/H1.md`), the hypothesis card (`02-hypotheses.md`), the two attack lines
> named in the assignment, and direct reading of the corpus full texts. Citations below are
> restricted to `corpus_focused.json` per instructions.

---

## Attack 1 (strongest) — False dichotomy: external CALL + SSTORE dominate, not the memory-vs-dispatch axis; and no direct interpreter measurement exists

This is the attack that lands hardest, and parts of it are **fatal to H1 as literally worded.**

### What is fatal — concede it

**(a) On total-transaction gas, storage dominates — the corpus says so directly.**
GASOL states plainly: *"the gas consumption is **often dominated by the instructions that
access the storage**"* — and the whole tool is built to detect under-optimized storage
patterns on that premise (*GASOL: Gas Analysis and Optimization for Ethereum Smart Contracts*,
DOI 10.1007/978-3-030-45237-7_7, full text). "Running on Fumes" independently flags storage as
*"quite expensive to use"* and persistent, vs. memory which is *"erased between calls"*
(*Running on Fumes—Preventing Out-of-Gas Vulnerabilities…*, no DOI, full text). If H1 is read
as a claim about **where the gas in a multicall transaction goes**, it is simply wrong: an
SSTORE is 100–20,000 gas; a few words of `mcopy` is single-digit-to-low-tens of gas. The
falsifier's "memory copy is negligible vs CALL/SSTORE base costs" sub-point is correct at the
whole-transaction level and H1 cannot be defended there.

**(b) The superoptimizer evidence cuts *against* the "memory is where savings live" half of H1,
even at the interpreter/glue layer.** The Max-SMT superoptimizer reports its gas savings
decompose as **51% from the Max-SMT stack scheduler, 34.4% from stack rules, and only 14.6%
from the memory rules** (*A Max-SMT Superoptimizer for EVM handling Memory and Storage*, DOI
10.1007/978-3-030-99524-9_11, full text). Crucially, even those "memory rules" are about
*eliminating redundant MLOAD/MSTORE operations*, not about reducing **memory-expansion** gas
or copy volume — which is the actual lever H1 names (`mcopy`/EIP-5656/layout). So the one
corpus paper that quantifies *where extractable savings actually are* in low-level EVM code
puts ~85% of them on the stack/scheduling side and a minority on memory — and essentially none
on the specific memory-expansion lever H1 points at. This is the single most damaging piece of
in-corpus evidence, and it is damaging precisely because it is *quantitative* and *low-level*,
not whole-contract.

**(c) "No direct interpreter-vs-native measurement exists" is true for this corpus.** I
searched every full text for interpreter/native/overhead/batch/dispatch/delegatecall
comparisons. There is none. The one paper that would have been on-point — *MultiCall: A
Transaction-batching Interpreter for Ethereum* (DOI 10.1145/3457337.3457839) — is in the
corpus list but failed to download (403) and is unavailable as full text or abstract. So H1's
own falsification clause ("the corpus contains a direct head-to-head … measurement") cannot be
*satisfied*, but neither can H1 be *confirmed* by direct measurement. **H1 is, against this
corpus, empirically untested at the level it actually makes a claim about.** That is a real
concession: H1 is a mechanism-plausible heuristic, not a corpus-established finding.

### What survives — the "interpreter-attributable" scoping rescues the comparison, but only as reasoning, not corpus fact

The assignment asks the right question: does scoping to the interpreter's *own* overhead
rescue the memory-vs-dispatch claim? **Yes, partially — and honestly, this is the only thing
that keeps H1 alive.**

The argument: SSTORE and external CALL base costs are **incurred by the called contracts and
are identical whether you invoke them via a native batcher, via Weiroll/MultiCall, or via N
separate EOAs.** They are not *interpreter-attributable*. They are a constant added to every
arm of the comparison, so they cancel. H1, read precisely as written ("dominant *interpreter-
attributable* gas cost"), explicitly excludes them. Attack 1(a)/(b)'s storage-dominance point,
while true, is therefore **answering a different question** than H1 asks: it measures total
gas, not the *delta* between interpreter and native.

Once you subtract the callees' fixed CALL+SSTORE costs, what is left as genuinely
interpreter-attributable is exactly: (i) opcode dispatch / jump logic for the script loop, and
(ii) the marshalling — copying calldata in, copying returndata out, splicing returndata into
the next call's calldata, and the memory expansion that marshalling forces. H1's claim is that
within *that residual*, (ii) > (i). The EVM gas model makes this directionally plausible: each
inter-call marshalling step is a CALLDATACOPY/RETURNDATACOPY/MCOPY whose cost is linear in
bytes plus memory-expansion gas (the "memory gas cost … proportional to the distance of the
accessed location" described in *Running on Fumes*, full text), whereas dispatch in a flat
interpreter loop is a small fixed number of stack/JUMP ops per step. For data-heavy chaining
(the exact Weiroll/multicall use case — dynamic types, arrays, struct splicing), copy+expansion
scales with payload while dispatch does not.

**But I must be honest about three limits on this rescue:**

1. **The scoping is my reasoning, not in the corpus.** No corpus paper isolates "interpreter-
   attributable" gas, defines the native-vs-interpreter delta, or measures it. GASOL/Fumes
   describe the *gas model* (memory cost ∝ distance + opcode cost) but never apply it to an
   interpreter-overhead decomposition. I am supplying the mechanism; the corpus supplies only
   the gas-model primitives it rests on.

2. **The superoptimizer result (1b) still bites even after scoping.** If you grant that the
   residual is dispatch + marshalling, the *one* low-level decomposition we have still found
   ~85% of savings on the stack/scheduling side. That is intra-block straight-line code, not an
   inter-call marshalling loop, so it isn't a clean test of H1 — but it is the closest thing in
   the corpus and it leans *away* from "memory is the lever." Intellectual honesty requires
   flagging that the only quantitative datapoint we have is mildly adverse, not supportive.

3. **The dominance can invert with payload size.** For small/fixed-size return values (a single
   uint256 spliced between calls), the copy is ~3–9 gas and dispatch overhead can genuinely
   exceed it. H1's claim is therefore *conditional on data-heavy chaining*, which is the design
   target here, but it is not unconditionally true. A precise restatement is required (below).

**Verdict on Attack 1:** Fatal to the literal/whole-transaction reading and to the unqualified
"memory is where savings live" claim. Survivable only under the interpreter-attributable
scoping H1 actually invokes — and even then only as a mechanism-grounded design heuristic,
because the corpus neither measures the residual directly nor clearly supports the
memory-over-dispatch direction within it.

---

## Attack 2 (next) — The corpus is about *whole-contract* gas analysis/superoptimization, not VM/interpreter design, so it cannot adjudicate H1 at all

This attack says: every gas paper in the corpus (GASOL, the Max-SMT superoptimizer, Running on
Fumes) analyzes or optimizes *one contract's bytecode* for *whole-function* gas bounds —
none models the inter-contract, return-data-chaining glue layer that H1 is about. Therefore the
corpus is the wrong instrument and H1 is non-falsifiable here.

### What is partly right

It is true that none of these tools targets the chaining-interpreter layer. The superoptimizer
and GASOL operate on intra-block / intra-function bytecode; "Running on Fumes" infers
per-function upper bounds. None of them crosses a CALL boundary to reason about marshalling
between sub-calls. So the corpus cannot *directly* confirm or refute H1's specific
inter-call claim — this reinforces concession 1(c)/limit-1 above.

### Why it does not fully land

This proves too much. If accepted, it would equally bar H1's *antagonist* (null-1: "dispatch
dominates") — neither side can be settled, so it is not a one-sided refutation of H1; it is a
statement that the corpus under-determines the gas axis. That is a fair "downgrade to untested"
verdict, **not** a refutation. And the corpus is not *useless*: it supplies (a) the gas-model
primitives that make H1's mechanism computable (memory cost ∝ access distance; opcode cost
table — *Running on Fumes*, full text), and (b) a transferable empirical signal that *the
extractable savings in low-level EVM code skew toward stack/scheduling, not memory* (the
superoptimizer's 51/34.4/14.6 split). (b) is genuinely relevant evidence — it just happens to
lean against H1, which is why I treat it as a concession, not a defense.

**Verdict on Attack 2:** Not fatal; it establishes "under-determined / untested," which I
accept. It does not single out H1.

---

## Attack 3 — `mcopy`/EIP-5656 savings are marginal because EIP-5656 only replaces an
existing identity-precompile/loop copy that was already cheap

If the falsifier argues the `mcopy` lever specifically is small: EIP-5656 mainly removes the
overhead of doing word-by-word MLOAD/MSTORE loops or the identity-precompile staticcall trick
for memory copies. The corpus does not quantify EIP-5656 (it predates Cancun coverage in these
texts; no full text discusses `mcopy`), so neither side has corpus support. Mechanistically the
saving is real but bounded: it cuts per-word copy cost and one CALL's worth of precompile
overhead, which matters most exactly in the data-heavy regime H1 targets and little otherwise —
consistent with limit-3 above. **Verdict: indeterminate from corpus; consistent with H1 being
a conditional heuristic.**

---

## Honest restatement of H1 that survives

> In a chaining interpreter VM, **for data-heavy scripts** (dynamic types, arrays, struct
> splicing between sub-calls), the *interpreter-attributable* gas — i.e., the gas delta over a
> native batcher, **excluding** the callees' identical and unavoidable CALL + SSTORE costs — is
> dominated by inter-call marshalling: calldata/returndata copying and the memory expansion it
> forces, more than by the script-loop's opcode dispatch. Therefore `mcopy`/EIP-5656 and
> memory-layout choices are the right *first* place to look for interpreter-overhead savings in
> that regime.
>
> This is a **mechanism-grounded design heuristic**, not a corpus-established fact: the corpus
> supplies the gas-model primitives it rests on but contains **no direct interpreter-vs-native
> measurement**, and its one low-level savings decomposition (the Max-SMT superoptimizer) skews
> toward stack/scheduling rather than memory — so the heuristic must be validated empirically in
> the host project (e.g., a `forge` gas snapshot comparing `mcopy` vs loop-copy marshalling, and
> dispatch-only vs marshalling-only microbenchmarks).

## What would actually settle it (since the corpus can't)

1. A `MulticallScripter` gas benchmark: same chained strategy, measure (i) `mcopy` vs
   word-loop marshalling, (ii) script-loop dispatch cost with marshalling stubbed out, across
   small vs large payloads. This is the missing "direct measurement" the corpus lacks and the
   host repo is uniquely positioned to produce.
2. Recover the *MultiCall: A Transaction-batching Interpreter for Ethereum*
   (DOI 10.1145/3457337.3457839) full text — currently 403/unavailable — which is the one
   corpus item plausibly containing an interpreter-overhead figure.

---

## Citations (corpus_focused.json only)

- *A Max-SMT Superoptimizer for EVM handling Memory and Storage* — DOI 10.1007/978-3-030-99524-9_11 (full text). Savings split 51% Max-SMT / 34.4% stack rules / 14.6% memory rules; memory rules eliminate redundant MLOAD/MSTORE, not memory-expansion.
- *GASOL: Gas Analysis and Optimization for Ethereum Smart Contracts* — DOI 10.1007/978-3-030-45237-7_7 (full text). "Gas consumption is often dominated by the instructions that access the storage."
- *Running on Fumes—Preventing Out-of-Gas Vulnerabilities in Ethereum Smart Contracts using Static Resource Analysis* — no DOI (full text). EVM gas = memory gas cost (∝ access distance beyond active memory) + opcode gas cost; storage expensive/persistent, memory erased between calls.
- *MultiCall: A Transaction-batching Interpreter for Ethereum* — DOI 10.1145/3457337.3457839 (in corpus; full text unavailable, 403). Cited as the on-point source that the corpus fails to make available.
