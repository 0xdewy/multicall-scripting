# 00 — Research Question (FROZEN INPUT)

## User topic
"multicall, weiroll, smart contract virtual machines, gas optimizations, formal verification"

## Sharp research question
For **on-chain transaction-scripting / multicall virtual machines** — Weiroll-class
interpreters that batch multiple calls atomically and chain return data between them —
what does the literature establish about the three-way trade-off among:

1. **Gas efficiency** (cost of an interpreter/dispatch layer vs. native calls),
2. **Expressiveness / composability** (chaining outputs to inputs, dynamic types, DeFi composition),
3. **Formal verifiability** (whether the VM and the scripts it runs can be machine-verified safe)?

…and which concrete design choices the evidence actually supports.

## Narrowing decisions
- "Multicall/Weiroll" are **practitioner artifacts** with thin peer-reviewed coverage. They
  are treated as the *applied lens*; the load-bearing evidence comes from the mature
  literatures on **EVM gas optimization/superoptimization**, **EVM formal semantics**, and
  **smart-contract formal verification / static analysis**.
- Scope is **EVM/Ethereum** (Cancun+ where relevant, e.g. `mcopy`/EIP-5656), not Bitcoin
  script or non-EVM chains except as contrast.
- Excludes pure application-domain blockchain papers (supply chain, healthcare, IoT, CBDC) —
  filtered out into `corpus_focused.json`.

## Search queries used (Phase 1)
1. `smart contract gas optimization EVM bytecode Ethereum`
2. `formal verification smart contracts EVM bytecode theorem proving`
3. `EVM semantics smart contract virtual machine interpreter formalization`
4. `transaction batching multicall composability on-chain interpreter scripting DeFi`
5. (adversarial) `limitations formal verification smart contracts adoption gas optimization ineffective`

`--since 2016 --limit 30` across openalex, arxiv, crossref, europepmc, semanticscholar.

## Corpus
- `data/corpus.json` — 403 unique papers (raw, 0 retracted).
- `data/corpus_focused.json` — **251 papers** after dropping application-domain noise.
  **Agents read `corpus_focused.json`.**

## Mode
**FULL** — broad, multi-thread, and directly informs the host project's design
(`multicall-scripting`: a Weiroll-class chaining VM with gas-optimized assembly and a
formal-verification plan).
