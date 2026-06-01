# H4 Falsifier — Unsound analysis beats sound FV per effort; FV has no real-world ROI

**REFUTATION STRENGTH: partial — refutes clause 1 (category error + unmeasured metric); concedes clause 2 (no corpus study quantifies production exploit reduction). The surviving H4 is "FV and unsound analysis are complementary, not rank-orderable; FV's field ROI is undemonstrated."**

---

## Hypothesis under test

**H4:** For real contracts, fast unsound static analysis catches more exploitable bugs per unit effort than sound formal verification, AND FV has no demonstrated, quantified reduction in real-world exploited-bug rate.

---

## Attack 1 — "More exploitable bugs per unit effort" is a category error (DECISIVE)

### 1a. The two tool classes target different bug populations

VerX (full text) was introduced *because* generic scanners cannot express the properties it checks. Its evaluation explicitly runs Mythril, Oyente, and Manticore against a functional/temporal property and shows they cannot verify it (VerX, Fig. 4: "Running existing symbolic analyzers for verifying ϕR1"). The paper states (full text): generic analyzers check "generic security errors such as reentrancy and overflows... (e.g., Securify, Slither, and Mythril)" while "deeper, custom functional requirements" are left to "manual, best-effort code inspection" (VerX, §I). VerX verifies properties the unsound tools cannot even *express* — comparing counts across non-overlapping property classes is comparing apples to abstract syntax trees.

(*VerX: Safety Verification of Smart Contracts*, DOI 10.1109/sp40000.2020.00024, full text.)

### 1b. "Per unit effort" is measured nowhere in the corpus

No corpus paper normalizes bugs found against analyst-hours, specification-writing cost, compute time, or any shared effort metric. The systematic review (*Ethereum Smart Contract Analysis Tools: A Systematic Review*, DOI 10.1109/access.2022.3169902, full text) reviews 86 tools and discusses capabilities, seeded-fault benchmarks (SolAnalyzer/MuContract), and maintenance status, but nowhere supplies an effort-normalized comparison between sound and unsound tool classes. The "per unit effort" quantity in clause 1 is an **assertion with no corpus referent** — it cannot be supported or refuted from this literature because nobody measured it.

### 1c. "Exploitable bugs" vs "flagged candidates" — the scale numbers conflate precision and recall

Osiris reports 42,108 contracts with integer bugs out of 1.2M analyzed (*Osiris*, DOI 10.1145/3274694.3274737, abstract only). ZEUS reports ~94.6% of 22.4K contracts flagged vulnerable (*ZEUS*, DOI 10.14722/ndss.2018.23082, abstract only). These are **flagged pattern matches** — not confirmed exploitable bugs. eThor (full text) empirically refutes this equivalence: *"eThor clearly outperforms ZEUS in terms of recall (i.e., soundness) — 100% vs. 11.4% — which empirically refutes ZEUS' soundness claim"* and documents Securify false positives and false negatives. When a tool with 11.4% recall reports 94.6% vulnerability rate, the "bugs found" figure is dominated by false negatives on true vulnerabilities AND false positives on benign code. The huge population-scale numbers are a measure of *throughput*, not *exploitable-bug yield*.

(*eThor: Practical and Provably Sound Static Analysis of Ethereum Smart Contracts*, DOI 10.1145/3372297.3417250, full text.)

### 1d. Soundness buys irreplaceable guarantees

eThor itself demonstrates that a sound automated analyzer for bytecode is achievable and outperforms the unsound ZEUS on F-measure (88.9% vs 20.4%) and recall (100% vs 11.4%) (eThor, full text). A sound "no reentrancy" verdict means the verified property *holds for all reachable states*; an unsound scanner's "no pattern matched" means the scanner's heuristics didn't fire. These are not the same product, and confidence in the first is qualitatively different from confidence in the second — a difference that cannot be captured by "bugs per effort" counting.

**Verdict on clause 1:** **Refuted.** The comparison rests on a false equivalence of bug populations, an unmeasured effort metric, and conflated flagging rates with exploit detection.

---

## Attack 2 — Clause 2 (no demonstrated production exploit-reduction) cannot be refuted on this corpus

The falsifier must be honest: clause 2 is an absence claim, and the absence is real. No corpus paper presents a controlled or observational comparison of real-world exploited-bug rates for formally verified contracts versus comparable unverified contracts. The surveys and systematic review catalog techniques, tools, and seeded-fault benchmarks — they do not measure field exploit outcomes.

The two falsification routes named in the hypothesis card:

- **Route A (sound verifiers catch bugs scanners miss):** VerX catches functional/temporal properties scanners cannot express — this is true (Attack 1a) and is a genuine advantage of FV. But this demonstrates *capability*, not *production exploit reduction*. It falsifies "unsound catches more bugs" (clause 1's ranking) without touching clause 2's outcome claim.

- **Route B (quantified production bug-reduction study):** No such study exists in the corpus. The falsifier searched the full text of the systematic review, VerX, eThor, and the available FV survey materials — none reports a deployed-cohort exploit-rate delta attributable to verification. The simplest explanation: such a study is genuinely absent from the corpus, not overlooked.

**Verdict on clause 2:** **Conceded — cannot be refuted.** The corpus positively supports it (FV's own authors document limited adoption and heavy manual effort; no outcome study exists), and the falsifier cannot produce disconfirming evidence. This is an honest negative claim that survives attack.

---

## The surviving, defensible form

H4 as written over-reaches and collapses on clause 1. What survives is narrower and more defensible:

1. Sound FV and unsound static analysis are **complementary** on this corpus evidence — they target different property classes (custom functional/temporal vs. generic pattern bugs) with different guarantee strengths (provable soundness vs. heuristics). They cannot be ranked on bugs-per-effort because nobody measured it and they're not competing for the same bugs.
2. Formal verification **has no demonstrated, quantified reduction in real-world exploited-bug rate** in this corpus — an honest negative finding that the field should address.

This is not a failure of the falsification attempt; it is the finding the corpus supports. The falsifier's job is to kill unsupported claims, and clause 1 of H4 is one.

---

## Citations

- *VerX: Safety Verification of Smart Contracts* — DOI 10.1109/sp40000.2020.00024 (full text). §I on generic-vs-custom properties; Fig. 4 on scanner incapability for functional properties; "limited adoption" admission.
- *eThor: Practical and Provably Sound Static Analysis of Ethereum Smart Contracts* — DOI 10.1145/3372297.3417250 (full text). ZEUS recall 11.4% vs eThor 100%; Securify false positives/negatives; F-measure 88.9% vs 20.4%.
- *Ethereum Smart Contract Analysis Tools: A Systematic Review* — DOI 10.1109/access.2022.3169902 (full text, truncated). 86-tool catalog; seeded-fault benchmarks; no effort-normalized or outcome comparison.
- *Osiris: Hunting for Integer Bugs in Ethereum Smart Contracts* — DOI 10.1145/3274694.3274737 (abstract only). 1.2M contracts; 42,108 flagged.
- *ZEUS: Analyzing Safety of Smart Contracts* — DOI 10.14722/ndss.2018.23082 (abstract only). 22.4K contracts; 94.6% flagged.
- *A Survey on Formal Verification for Solidity Smart Contracts* — DOI 10.1145/3437378.3437879 (in corpus; abstract only — manifest). Methods survey; no outcome study.
