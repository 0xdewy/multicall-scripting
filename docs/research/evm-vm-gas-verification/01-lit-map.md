# 01 — Literature Map (FROZEN after Phase 1)

**Corpus:** 403 raw / 251 focused papers, 2016–2026. **0 retracted.** No fabricated
entries (an early misread of garbled tool output was disproven: `verify.py` → FLAGGED 0).

## The terrain

The five user themes map onto **four mature-to-thin literatures**:

**1. EVM formal semantics (mature).** A small set of canonical, well-cited works gives the
EVM rigorous meaning: *KEVM: A Complete Semantics of the EVM* (96 cit, 2017,
doi:10.1109/csf.2018.00022) executable in the K framework; *Towards verifying Ethereum
smart contract bytecode in Isabelle/HOL* (262 cit, 2018); *A Semantic Framework for the
Security Analysis of Ethereum Smart Contracts* (192 cit, 2018); *Executable Operational
Semantics of Solidity* (89 cit, 2020); *IELE* (2018), an LLVM-style IR designed *from*
formal semantics. Consensus: EVM bytecode **can** be given complete, machine-checkable
semantics; this is the foundation everything else stands on.

**2. Smart-contract formal verification / static analysis (mature, crowded).** Two waves:
(a) bug-finding static/symbolic tools — *Oyente*-lineage, *ZEUS* (709 cit), *Osiris*
(425), *Securify*-lineage, *Vandal* (123), *eThor* (provably sound, 2020), *Maian*; and
(b) full functional verification — *VerX* (237, automated safety w/ temporal properties),
*solc-verify* (131, modular Solidity verifier), *Scilla* (100, a language designed for
verifiability), Coq/Isabelle developments. Several **surveys** (A Survey on Formal
Verification for Solidity, 2021; Ethereum Smart Contract Analysis Tools: A Systematic
Review, 2022, 165 cit) map the tool zoo and repeatedly note **soundness/completeness
trade-offs, scalability limits, and weak adoption**.

**3. Gas optimization / superoptimization (focused niche).** *MadMax* (344 cit, 2018) —
detecting out-of-gas / unbounded-loop bugs via decompilation; *GASOL* (2020) and *EthIR* —
gas analysis & optimization frameworks; *A Max-SMT Superoptimizer for EVM handling Memory
and Storage* (2022) — provably-optimal bytecode blocks via SMT; *Running on Fumes* (2018) —
static gas-bound enforcement. Consensus: meaningful, *machine-verified* gas savings are
achievable at the **basic-block** level; whole-program optimality is intractable.

**4. Multicall / Weiroll / composability (thin, mostly grey literature).** The single most
on-point peer-reviewed hit is *MultiCall: A Transaction-batching Interpreter for Ethereum*
(2021, doi:10.1145/3464298.3493401). Composability is studied more at the **economic/DeFi**
level: *DeFi Composability as MEV Non-interference* (arXiv:2309.10781), *Measuring Asset
Composability*, *Where do DeFi stablecoins go?*. Adjacent batching theory comes from
databases (*optimistic concurrency control through transaction batching*, 49 cit) and
*Daml* (a contract language for multi-party workflows). **Gap:** almost no peer-reviewed
work on the gas cost *or* formal verification of interpreter-style chaining VMs specifically
(Weiroll itself is unpublished). This is the genuine white space the host project sits in.

## Apparent consensus
- EVM bytecode is formally tractable (semantics exist and are reused).
- Verification tools trade soundness vs. completeness vs. scalability; none dominates.
- Gas optimization is provably effective locally; surveys frame gas both as a cost to
  minimize and as a **security surface** (out-of-gas, griefing).

## Open disagreements / gaps
- Does an **interpreter/dispatch layer** (Weiroll/multicall) cost enough gas to outweigh its
  composability benefits? (almost unstudied directly)
- Are bytecode-level **formal-verification** techniques usable on a *dynamic-dispatch
  interpreter* whose control flow is data-dependent? (hard case for existing tools)
- Is formal verification's real-world payoff (bugs prevented) worth its cost, given
  persistent low adoption noted across surveys? (the adversarial thread)

## Caveats for downstream agents
- Many crossref/openalex/arxiv entries lack abstracts in the metadata; **fetch full text in
  Phase 2.5** before weighting a claim heavily.
- Citation counts skew toward older (2017–2020) papers; recent (2024–2026) work is
  under-cited but may carry the frontier (account abstraction, EIP-5656 `mcopy`, intents).
