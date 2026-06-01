# H4-rebuttal — Formal verification's practical ROI is unproven vs. unsound bug-finding

**REBUTTAL: partially holds (collapses to a narrower claim) — clause 1 ("more exploitable
bugs per unit effort") is conceded as unsupported and over-reaching; clause 2 ("no demonstrated,
quantified real-world exploited-bug reduction for FV") survives the Falsifier's attack intact.
The defensible H4 is clause 2 plus "FV and unsound analysis are complementary, not
rank-orderable on the corpus evidence."**

---

## Provenance note (honesty first)

The task referenced `04-evidence/H4-proponent.md` and `04-evidence/H4-falsifier.md`. Neither file
exists in the workspace at the time of writing (the `04-evidence/` directory was empty; the H4
ticket lives at `03-open-questions/H4.md`). I therefore rebut against (a) the proponent case and the
Falsifier's strongest point **as stated in the task brief**, and (b) the corpus directly. Where I
make a claim, I cite corpus full text. I do not reconstruct or paraphrase evidence I could not read.

---

## 1. Concession: clause 1 does not survive

The Falsifier's strongest point is correct and I concede it without hedging.

**Clause 1 ("fast unsound static analysis catches more exploitable bugs per unit effort than
sound FV") is unsupported by the corpus and is structurally a false dichotomy.**

1. **The two tool classes do not target the same bug population, so "more bugs" is category error.**
   VerX exists precisely *because* the unsound scanners cannot express the properties it checks.
   Its evaluation runs the standard unsound symbolic tools — Mythril, Oyente, Manticore — against a
   functional/temporal property and shows they cannot verify it (VerX, Fig. 4: "Running existing
   symbolic analyzers for verifying ϕR1"). VerX is introduced as "the first automated verifier able
   to prove **functional** properties... all real-world contracts must satisfy custom functional
   specifications" and verifies "temporal properties of infinite-state smart contracts" (VerX,
   Abstract). Generic scanners check "generic security errors such as reentrancy and overflows...
   (e.g., Securify, Slither, and Mythril)" while "deeper, custom functional requirements" are left to
   "manual, best-effort code inspection" (VerX, §I). A tool that finds the only bugs it is built to
   express cannot be ranked "fewer bugs per effort" against a tool built for a disjoint class.
   (VerX — full text.)

2. **"Per unit effort" is nowhere measured in the corpus.** No corpus item normalizes bugs-found
   against analyst-hours, specification-writing cost, or compute. The systematic review
   (*Ethereum Smart Contract Analysis Tools: A Systematic Review*) catalogues tools and notes
   maintenance/availability gaps (e.g., Porosity "is not maintained for a long time" — review,
   tool catalogue) and effectiveness checks via seeded-fault frameworks (SolAnalyzer/MuContract —
   review), but supplies **no effort-normalized comparison** between sound and unsound classes. The
   "per unit effort" quantity in clause 1 is therefore an assertion with no corpus referent.
   (Systematic Review — full text, truncated.)

3. **Soundness buys guarantees unsound tools cannot offer at any effort level.** eThor is "the
   first sound and automated static analyzer for EVM bytecode," supporting reachability properties
   "sufficient for capturing interesting security properties... as well as contract-specific
   functional properties" (eThor, Abstract). A sound "no reentrancy" verdict and an unsound scanner's
   "no pattern matched" are not the same product; counting them on one axis is the dichotomy the
   Falsifier flagged. (eThor — full text, truncated.)

**Verdict on clause 1:** withdrawn. It over-reaches on two counts — an unmeasured "per unit effort"
metric and a false common-currency for "bugs" across non-overlapping property classes.

---

## 2. Defense: clause 2 survives the attack

The Falsifier conceded it could **not** refute clause 2, and the corpus is consistent with that
concession. Clause 2 is: **FV has no demonstrated, quantified reduction in real-world
exploited-bug rate.**

This is a claim about *absence of a specific kind of evidence*, and the absence is real in this
corpus:

1. **The strongest FV result in the corpus is a capability demonstration, not an outcome study.**
   VerX's evaluation is "83 temporal properties and 12 real-world projects... demonstrates that VerX
   is practically effective" (VerX, Abstract). "Practically effective" here means *it can prove the
   properties*, on a 12-project benchmark — not that contracts verified with it suffered fewer
   **exploits in production** than a comparable unverified cohort. There is no deployed-vs-deployed
   exploited-bug-rate comparison. (VerX — full text.)

2. **eThor likewise reports analysis capability, not field exploit reduction.** Its contribution is
   soundness plus automation on a bytecode benchmark (eThor, Abstract). No production exploit-rate
   delta is claimed. (eThor — full text, truncated.)

3. **The survey/review layer documents adoption and tooling friction, not ROI vindication.** The
   systematic review's notes on unmaintained tools and seeded-fault-based effectiveness testing
   describe an ecosystem that validates tools against *synthetic* faults, not against measured
   real-world exploit reduction attributable to verification. (Systematic Review — full text,
   truncated.) The corpus FV survey (*A Survey on Formal Verification for Solidity Smart Contracts*)
   and the Isabelle/HOL bytecode-verification paper are **abstract-only** in this corpus
   (manifest: `status: abstract_only`), so they cannot be cited as supplying a quantified
   production outcome study either — their absence as full text is itself consistent with clause 2,
   not evidence against it.

**The Falsifier's two falsification routes both miss clause 2:**

- *Route A (sound verifiers catch bugs scanners systematically miss):* This is **true** and I have
  conceded it above — but it falsifies *clause 1's ranking*, not *clause 2's outcome claim*.
  Catching a class of bug in a lab benchmark is not a quantified reduction in real-world exploited-bug
  rate. The Falsifier's strongest evidence lands on the clause I already gave up.

- *Route B (a study quantifying production bugs prevented by verification vs comparable unverified
  contracts):* **No such study appears in the corpus.** This is the exact evidence clause 2 says is
  missing, and the Falsifier conceded it could not produce it.

**Verdict on clause 2:** holds on this corpus. It is an honest negative claim — "no demonstrated,
quantified production exploit-rate reduction" — and nothing in the readable corpus demonstrates one.

> Scope/falsifiability caveat: clause 2 is a corpus-bounded absence claim, not a universal truth.
> It is falsified the moment a single deployed-cohort exploit-rate study is brought in (e.g., from
> industrial verification programs outside this corpus). I am asserting it *as supported by the
> evidence available here*, with that boundary stated plainly.

---

## 3. The surviving, defensible form of H4

The strong original H4 — a rank-ordering of unsound over sound on bugs-per-effort *plus* an
ROI-denial — **collapses**. What survives is strictly weaker and has two parts:

1. **(Negative, holds)** On this corpus, formal verification has no demonstrated, quantified
   reduction in real-world exploited-bug rate. The best FV results (VerX, eThor) are capability
   demonstrations on small real-world benchmarks, not production outcome studies; the would-be
   outcome-study sources are abstract-only or absent.

2. **(Structural, replaces the ranking)** Sound FV and unsound static analysis are **complementary,
   not rank-orderable** on the corpus evidence. They target disjoint property classes — generic
   pattern bugs (Securify/Slither/Mythril, per VerX §I) vs. custom functional/temporal properties
   (VerX) and sound reachability guarantees (eThor). No corpus item supplies the effort-normalized,
   common-metric comparison that a ranking claim like clause 1 requires.

This is the honest landing point: **H4 as written does not survive; its null/contrarian core does.**
The project-relevant takeaway for the host VM is unchanged in substance — do not assume FV pays for
itself in *measured field exploit reduction* on the strength of this literature — but the
triumphalist framing ("unsound wins per unit effort") is unsupported and should be dropped.

---

## Corpus citations used

- *VerX: Safety Verification of Smart Contracts* — full text. (Abstract; §I; Fig. 4.)
- *eThor: Practical and Provably Sound Static Analysis of Ethereum Smart Contracts* — full text
  (truncated to 60k). (Abstract.)
- *Ethereum Smart Contract Analysis Tools: A Systematic Review* — full text (truncated to 60k).
  (Tool catalogue: maintenance/availability and seeded-fault effectiveness notes.)
- *A Survey on Formal Verification for Solidity Smart Contracts* — **abstract only** (manifest).
- *Towards verifying Ethereum smart contract bytecode in Isabelle/HOL* — **abstract only** (manifest).

Tags reflect `data/fulltext/manifest.json`. No metric was cited that I could not read in the
available text.
