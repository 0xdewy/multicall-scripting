<!-- agentify: generated 2026-05-31 | score-before: 0 | source: 1.3.0 -->
# Implementation Plans — docs/plans/

Work items that an agent (or developer) can pick up and execute.

## Status lifecycle
`draft → ready → in-progress → blocked → complete`

## File format
Each plan is a markdown file (`<slug>.md`) with at minimum:
- **Status**: one of the lifecycle states above
- **What**: 1-2 sentence description of the work item
- **Why**: rationale — what problem this solves
- **Acceptance criteria**: verifiable outcomes (tests pass, feature works, etc.)
- **Steps**: ordered checklist of implementation steps
- **Dependencies**: which other plans or specs this plan requires

## Example template
```markdown
---
title: Add delegatecall support
status: ready
---

## What
Implement the 0xFD delegatecall path in MulticallScripter.execute().

## Why
Currently DELGATE_CALL_FLAG reverts. Adding it enables proxy-pattern strategies.

## Acceptance criteria
- [ ] MalticallScripter.execute handles 0xFD offsets via delegatecall
- [ ] JS encoder exports DELEGATE_CALL_FLAG
- [ ] Roundtrip test in JsLibrary.t.sol passes
- [ ] Solidity tests for delegatecall behavior pass

## Steps
1. Add dispatch case for 0xFD in execute() assembly
2. Add delegatecall() helper in CallBuilder.sol
3. Add delegatecall encoding in js/index.js
4. Write test_delegatecall in MulticallScripter.t.sol
5. Add roundtrip test in JsLibrary.t.sol
```
