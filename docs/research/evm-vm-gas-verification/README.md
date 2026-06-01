# Research: On-chain multicall/Weiroll VMs — gas, composability, verifiability trade-offs

Inquiry into the gas-efficiency / expressiveness / formal-verifiability trade-offs of
Weiroll-class transaction-scripting VMs, grounded in the EVM gas-optimization, formal-
semantics, and smart-contract-verification literatures.

**Workflow:** `0 Framing → 1 Recon → 2 Hypotheses → 3 Testing → 4 Synthesis → 5 Report`
**Mode:** FULL · **Agents read:** `data/corpus_focused.json` (251 papers) · cite by title + DOI/URL only.

## Status board
| Item | Owner | State |
|---|---|---|
| 00 Question (frozen) | PI | ✅ done |
| Corpus build (403 raw / 251 focused) | script | ✅ done |
| 01 Lit map (frozen) | PI | ✅ done |
| 02 Hypotheses (4 culled from 12) | PI | ✅ done |
| 03 Open-question tickets (H1–H4) | PI | ✅ done |
| 2.5 Full-text fetch (9/16 full) | script | ✅ done |
| 03 Adversarial testing (proponent/falsifier/rebuttal) | sub-agents | ✅ done |
| 05 Decision log (V-001…V-004 PROPOSED) | PI | ✅ done |
| 04 Synthesis | sub-agent → PI | ✅ done |
| 06 Red team (5 challenges) | sub-agent → PI | ✅ done |
| 05 Decision log (V-001…V-004 RATIFIED) | PI | ✅ done |
| RESEARCH.md | PI | ✅ done |
| **INQUIRY COMPLETE** | — | ✅ |

## Integrity note
An early-session alarm about "planted" Weiroll/multicall papers was a **false alarm** from
misread, garbled tool output. Re-verified with clean output: corpus contains no fabricated
entries (`verify.py` → FLAGGED 0; the one arXiv ID spot-checked was never a corpus entry).
The corpus is ordinary real literature. No poisoning.
