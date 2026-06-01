# H4 — Proponent Case

**SUPPORT STRENGTH: moderate** — The literature strongly supports the *second clause* (no study quantifies a real-world exploited-bug reduction attributable to formal verification, and even FV's own authors concede heavy manual effort, scalability limits, and "limited adoption"). It also strongly supports that scalable *unsound* analyzers ran across 10^5–10^6 contracts at seconds-per-contract and flagged tens of thousands of vulnerabilities, demonstrating high *throughput*. But the *first clause* — "more exploitable bugs per unit effort" — is supported only **indirectly**: no paper in the corpus measures *exploitable* bugs caught per unit of human effort for either method, and the high "vulnerability" counts from fast tools are dominated by *flagged candidates* with substantial false-positive rates, not confirmed exploits. Hence moderate, not strong.

---

## Hypothesis restated

For real contracts, fast UNSOUND static analysis catches more exploitable bugs per unit effort than sound formal verification, AND formal verification has no demonstrated, quantified reduction in real-world exploited-bug rate.

Two clauses, evaluated separately because the evidence differs sharply between them.

---

## Clause 2 first (the stronger clause): FV is effort-heavy, poorly adopted, and has no ROI/exploit-reduction study

### 2.1 FV's own flagship paper concedes heavy manual effort, expertise burden, and "limited adoption"

The single best piece of supporting evidence comes from a leading FV paper itself — *VerX*, presented as "the first automated verifier able to prove functional properties of Ethereum smart contracts." Its introduction frames the entire problem precisely as H4 does (full text):

> "only a handful of smart contract projects (e.g., MakerDAO) have been formally verified so far. Current verification efforts are conducted using heavyweight interactive-theorem provers, such as Isabelle/HOL and Coq. These require non-trivial manual effort and expertise, making the audit process expensive and time-consuming, resulting in limited adoption by the developer and audit communities."

This is an FV-proponent paper stipulating, in 2020, that (a) FV adoption in production was essentially nil ("a handful," exemplar MakerDAO), and (b) the dominant FV technique (interactive theorem proving) is manual-effort-intensive and expertise-gated. That is direct support for the "heavy manual effort / adoption problem" portion of Clause 2.

Even VerX's own "push-button" pitch is qualified: a human must still *write the formal specification*. Its evaluation covers **12 real-world projects (138 contracts) and 83 manually formalized temporal properties**, of which 77/83 verified automatically but **6 still required the user to hand-provide abstraction predicates** (full text). So even the "automated" verifier requires (i) manual property formalization for every contract and (ii) occasional manual predicate engineering — i.e., per-contract human effort that does not appear in the throughput-oriented unsound-tool pipeline.

- *VerX: Safety Verification of Smart Contracts* (Permenev, Dimitrov, Tsankov, Drachsler-Cohen, Vechev), IEEE S&P 2020. DOI: 10.1109/sp40000.2020.00024 — **(full text)**

### 2.2 FV/sound tools carry a restricted-fragment cost that limits coverage of *real* contracts

VerX achieves its scalability only by *excluding* a large part of real-world EVM behavior. It forbids `DELEGATECALL`/`CALLCODE`, `CREATE`/`SUICIDE`, and **inline assembly**, and only handles "effectively external callback free" (EECF) contracts (full text). Real DeFi contracts routinely use delegatecall (proxies), assembly, and external callbacks — exactly the constructs excluded. This supports the "scalability/applicability problem" prong: sound/heavyweight verification buys tractability by narrowing the verifiable fragment, so its effective coverage of production contracts is narrower than the unsound scanners that run on raw bytecode of arbitrary contracts.

- VerX (above) **(full text)**.

### 2.3 "Sound" is harder than advertised — soundness claims have been empirically refuted

*eThor* (the first formally-proven-sound EVM bytecode analyzer) directly tested ZEUS, a widely-cited tool that "claims to provide soundness guarantees," and found (full text):

> "eThor clearly outperforms ZEUS in terms of recall (i.e., soundness) — 100% vs. 11.4% — which empirically refutes ZEUS' soundness claim."

eThor likewise documents that Securify "does not come with any formal semantics or proof of soundness, which leads to both false positives and false negatives," and finds counterexamples for "the majority of" Securify's patterns. This supports Clause 2's spirit: claimed-sound tools in this space frequently were not sound, so the *practical* benefit of the "soundness" property in production was not realized — and certainly never tied to a measured drop in exploited bugs.

- *eThor: Practical and Provably Sound Static Analysis of Ethereum Smart Contracts* (Schneidewind, Grishchenko, Scherer, Maffei), ACM CCS 2020. DOI: 10.1145/3372297.3417250 — **(full text)**

### 2.4 The argument-from-absence: no corpus study quantifies production exploit reduction from FV

This is the load-bearing point for Clause 2 and it is honestly an **argument from absence**. Across the corpus — including the surveys/SoKs most likely to report such a result —no paper presents a controlled or even observational comparison of *real-world exploited-bug rates* for formally-verified contracts versus comparable unverified contracts. The surveys catalog *techniques and tools*, not field outcomes:

- *Ethereum Smart Contract Analysis Tools: A Systematic Review* (Kushwaha, Joshi, Singh, Kaur, Lee), IEEE Access 2022. DOI: 10.1109/access.2022.3169902 — **(full text)**. Reviews **86 analysis tools**, categorizes them by static/dynamic and by technique (taint, symbolic execution, fuzzing), and discusses tool capabilities/limitations. It does **not** report any measurement of post-deployment exploits prevented, for FV or any other category.
- *A Survey on Security Verification of Blockchain Smart Contracts* (2019). DOI: 10.1109/access.2019.2921624 — **(abstract only)**. Selects 53 papers, 33 of which "focus on the correctness verification"; presents a taxonomy and pros/cons — i.e., a methods survey, not a field-outcome study.
- *Verification of smart contracts: A survey* (2020). DOI: 10.1016/j.pmcj.2020.101227 — **(abstract only)** (abstract field empty in corpus); included as a verification survey, again technique-oriented.
- *A Survey on Formal Verification for Solidity Smart Contracts* (2021). DOI: 10.1145/3437378.3437879 — **(abstract only)** — the survey named in the brief is *abstract_only* in the manifest with an empty abstract in the corpus, so I cannot quote its text. Its existence as a methods survey (rather than an outcome study) is consistent with the pattern above, but **I am explicitly not attributing any specific adoption/ROI claim to it**, because the full text was not available to me.
- *A Survey on Ethereum Systems Security* (Chen, Pendleton, Njilla, Xu), 2020. DOI: 10.1145/3391195 — **(abstract only)**. Systematizes vulnerabilities/attacks/defenses; a defenses taxonomy, not an exploit-reduction measurement of FV.

**Net for Clause 2:** Strongly supported. FV's own proponents document heavy manual effort, expertise gating, restricted contract fragments, and "limited adoption"; claimed soundness has been empirically refuted; and not one corpus paper quantifies a real-world exploited-bug reduction attributable to FV. The absence is broad and includes the venues where such a result would be reported.

---

## Clause 1: unsound scalable analyzers found vulnerabilities at massive scale, cheaply

The "effort efficiency" side of H4 rests on the Oyente→Securify→Osiris→Vandal lineage of fast, unsound, push-button analyzers that ran across the entire deployed contract population with negligible per-contract human cost.

### 3.1 Throughput evidence (machine effort per contract is seconds; human effort per contract is ~zero)

- *Vandal: A Scalable Security Analysis Framework for Smart Contracts* (Brent, Jurisevic, Kong, Liu, Gauthier, Gramoli, Holz, Scholz), 2018. DOI: 10.48550/arxiv.1809.03981 — **(full text available; figures cited from abstract)**. Vandal "successfully analysing over 95% of all **141k unique contracts** with an average runtime of **4.15 seconds**; outperforming the current state of the art tools — Oyente, EthIR, Mythril, and Rattle — under equivalent conditions." Security analyses are written once as declarative Soufflé/Datalog logic specs and then applied to the whole population — the marginal human effort per additional contract is essentially zero.

- *Osiris* (Torres, Schütte, State), ACSAC 2018. DOI: 10.1145/3274694.3274737 — **(abstract only)**. Evaluated on "more than **1.2 million smart contracts**"; "found that **42,108 contracts contain integer bugs**," and reproduced several previously-reported real vulnerabilities. Million-contract scale with no per-contract specification effort.

- *ZEUS: Analyzing Safety of Smart Contracts* (Kalra, Goel, Dhawan, Sharma), NDSS 2018. DOI: 10.14722/ndss.2018.23082 — **(abstract only)**. Evaluated **22.4K contracts**; reports ~**94.6%** flagged as vulnerable, "with an order of magnitude improvement in analysis time as compared to prior art." (Note: eThor later showed ZEUS's *recall* was 11.4%, so the 94.6% headline is a flagging rate, not a confirmed-exploit rate — see honest assessment below.)

- *SmartCheck* (Tikhomirov et al.), 2018. DOI: 10.1145/3194113.3194115 — **(abstract only)**. A fast syntactic/lint-style static analyzer positioned for everyday developer use, illustrating the low-effort end of the unsound spectrum.

- Background lineage: *A Semantic Framework for the Security Analysis of Ethereum Smart Contracts* (Grishchenko, Maffei, Schneidewind), POST 2018. DOI: 10.1007/978-3-319-89722-6_10 — **(full text)** — and *Foundations and Tools for the Static Analysis of Ethereum Smart Contracts* (Grishchenko, Maffei, Schneidewind), CAV 2018. DOI: 10.1007/978-3-319-96145-3_4 — **(abstract only)** — document that the early popular tools (Oyente, Securify, Mythril) lacked formal soundness, situating the whole "fast but unsound" category.

### 3.2 The efficiency contrast

Put the two sides side by side:

| Method | Human effort per contract | Population reached (per paper) | Per-contract machine time |
|---|---|---|---|
| Unsound scalable (Vandal) | ~0 (write rules once) | 141k contracts | 4.15 s avg |
| Unsound scalable (Osiris) | ~0 | 1.2M contracts | n/a (large-scale) |
| Sound/FV (VerX) | Hand-write spec (83 props for 12 projects); sometimes manual predicates | 12 projects / 138 contracts | n/a |

The structural difference is real and well-documented: unsound tools amortize a one-time analysis spec across the *entire* deployed population, whereas FV/VerX requires per-project human specification work and only scales to a curated handful of projects. On *bugs flagged per human-hour*, the unsound lineage is overwhelmingly ahead, simply because the human-hour denominator for the unsound tools at population scale is near zero.

---

## Quality of the evidence

- **Strong / directly relevant, full text:** VerX (2.1–2.2), eThor (2.3), the systematic review (2.4) — all read in full and quoted verbatim. These carry the Clause-2 argument.
- **Strong figures but abstract-only:** Osiris (1.2M / 42,108), ZEUS (22.4K / 94.6%) — the headline scale numbers come from abstracts, not from full-text methodology I could audit. Vandal's 141k / 4.15s figures are from its abstract though its full text is in the corpus. I did not independently verify these counts against the papers' result tables.
- **Citation weight:** ZEUS (709 cites), SmartCheck (647), Osiris (425), Survey on Ethereum Systems Security (467) — heavily-cited, reflecting community acceptance of the *scale* claims, though citation count is not validity.
- **Key limitation of the unsound-tool evidence:** "vulnerabilities found" in these papers means *contracts matching a vulnerability pattern*, not *confirmed exploitable* bugs. eThor's empirical result (ZEUS recall 11.4%; Securify false positives and false negatives) shows these flagging counts can be badly miscalibrated in both directions. So the large numbers establish *throughput*, not *exploitable-bug yield*.

---

## Honest assessment (where the case is weak)

1. **Clause 1 is supported only indirectly.** No corpus paper measures "*exploitable* bugs caught per unit effort" for either method, and none runs a head-to-head FV-vs-unsound comparison on the same contracts with exploitability adjudicated. The proponent inference — high throughput + near-zero human effort ⇒ more bugs per unit effort — is plausible and structurally sound, but it substitutes *flagged candidates* for *exploitable bugs*. Given eThor's evidence that an unsound tool (ZEUS) missed 88.6% of true positives, the per-effort *exploitable*-bug advantage of unsound tools is not actually quantified; their false-negative rates could be high.

2. **The strongest sub-claim is an argument from absence.** "FV has no demonstrated, quantified reduction in real-world exploited-bug rate" is supported by the *non-existence* of such a study in the corpus, not by a study showing FV fails to reduce exploits. Absence of evidence here is fairly strong because the relevant surveys/SoKs were searched, but it remains an absence argument, not a positive disconfirmation of FV's value.

3. **The soundness-refutation cuts both ways.** eThor refuting ZEUS's soundness (2.3) helps deflate "sound tool" marketing, but eThor *also* demonstrates that a genuinely sound analyzer is achievable and outperforms the unsound ZEUS on F-measure (88.9% vs 20.4%) and on recall (100% vs 11.4%). A falsifier will note this is a sound tool beating an unsound one on bug-catching quality — tension with the spirit of Clause 1. The proponent reply is narrow: eThor is itself a fast, automated, push-button bytecode analyzer (terminates on 95% of contracts), i.e., it belongs to the scalable static-analysis family rather than the heavyweight theorem-proving FV that VerX criticizes; it does not require per-contract manual specifications the way interactive FV does. So eThor supports "scalable static analysis wins on effort" more than it supports "unsoundness specifically wins."

4. **Selection/era caveat.** Most scale evidence is 2018–2020. It predates wide industrial adoption of FV-adjacent tooling (e.g., Certora-style specification checking) and predates the modern exploit landscape (flash-loan/economic exploits) that *neither* category in this corpus was designed to catch. The corpus does not let me speak to post-2022 production practice.

---

## One-line verdict

Clause 2 (FV is effort-heavy, narrowly adopted, and has no quantified production exploit-reduction study) is strongly supported, partly by FV's own authors and partly by a well-searched absence. Clause 1 (unsound tools catch *more exploitable bugs per unit effort*) is supported on the *effort/throughput* axis (population-scale runs at seconds and near-zero marginal human cost) but only indirectly on the *exploitable-bug yield* axis, because the corpus measures flagged candidates rather than confirmed exploits and even shows an unsound tool with 11.4% recall. **Overall: moderate.**
