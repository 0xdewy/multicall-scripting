# 02 — Surviving Hypotheses (PI is sole writer)

Culled from 12 drafts (mechanistic / contrarian / null / frontier) to 4 strongest —
most testable against the corpus, most consequential for the host project, least redundant.
Each pairs a claim with its natural antagonist so Phase 3 is a real contest.

---

### H1 — Gas: the cost is in the bytes, not the dispatch
**Claim:** In a chaining interpreter VM, the dominant *interpreter-attributable* gas cost is
memory expansion + calldata/returndata copying between sub-calls, **not** opcode dispatch —
so `mcopy`/EIP-5656 and memory-layout choices, not dispatch reduction, are where savings
live. (merges mechanistic-1; null-1 supplies the falsifier's main weapon.)
- **Falsified if:** profiling/superoptimization evidence shows dispatch/jump logic dominates,
  OR memory copy is negligible vs CALL base costs, OR the corpus contains a *direct* head-to-head
  interpreter-vs-native gas measurement that attributes overhead elsewhere.
- **State:** tested → RATIFIED (V-001: INCONCLUSIVE)
- Papers: *A Max-SMT Superoptimizer for EVM handling Memory and Storage*; *GASOL*; *MadMax*;
  *MultiCall: A Transaction-batching Interpreter for Ethereum*.

### H2 — Composability is formalizable as non-interference
**Claim:** DeFi composability/MEV-safety can be given a formal, machine-checkable definition
as a non-interference / information-flow property, so multicall scripts are verifiable with
*existing* security-property frameworks rather than bespoke methods. (frontier-2 vs null-3.)
- **Falsified if:** no corpus paper provides a formal, verifiable definition of composability;
  OR the MEV-non-interference framing is shown not to be machine-checkable / not applied to
  contract composition.
- **State:** tested → RATIFIED (V-002: SPLITS — formalizability supported; verifiability refuted)
- Papers: *DeFi Composability as MEV Non-interference*; *A Semantic Framework for the Security
  Analysis of Ethereum Smart Contracts*; *Measuring Asset Composability as a Proxy for DeFi Integration*.

### H3 — Return-data chaining is the verification bottleneck, tractable only at bytecode level
**Claim:** The defining multicall feature — chaining return data between calls — creates
data-dependent control/data flow that defeats the static abstractions sound analyzers and
source-level (Solidity) verifiers rely on; sound verification of such a VM is tractable only
at the bytecode-semantics level (KEVM-style). (merges mechanistic-2, mechanistic-3, frontier-3.)
- **Falsified if:** source-level verifiers (solc-verify) are shown to handle data-dependent
  dispatch precisely, OR sound bytecode analyzers (eThor) already model inter-call data-dependent
  memory flow precisely, OR bytecode-level tools fail on it just as badly (no advantage).
- **State:** tested → RATIFIED (V-003: SUPPORTED reframed as "necessary but not sufficient")
- Papers: *KEVM*; *Towards verifying Ethereum smart contract bytecode in Isabelle/HOL*;
  *solc-verify*; *eThor: Practical and Provably Sound Static Analysis of Ethereum Smart Contracts*;
  *A Semantic Framework for the Security Analysis of Ethereum Smart Contracts*.

### H4 — Formal verification's practical ROI is unproven vs. unsound bug-finding
**Claim:** For real contracts, fast *unsound* static analysis catches more exploitable bugs
per unit effort than sound formal verification, and FV has **no demonstrated, quantified**
reduction in real-world exploited-bug rate. (merges contrarian-2 + null-2.)
- **Falsified if:** corpus evidence shows sound verifiers (VerX/eThor/solc-verify) catch
  exploitable bugs static analyzers systematically miss, OR a study quantifies bugs prevented
  in production by verification vs comparable unverified contracts.
- **State:** tested → RATIFIED (V-004: SPLITS — clause 1 refuted; clause 2 supported)
- Papers: *VerX*; *eThor*; *Securify*; *A Survey on Formal Verification for Solidity Smart
  Contracts*; *Ethereum Smart Contract Analysis Tools: A Systematic Review*.

---

## Deferred (not tested this round)
- **H5 (atomic-batching security):** atomic batching removes intermediate-state vuln classes
  (frontrunning/partial-execution), making batched execution more secure than separate txs
  (contrarian-3). Distinct and project-relevant but tangential to the core gas/verifiability
  trade-off; revisit if budget allows.
