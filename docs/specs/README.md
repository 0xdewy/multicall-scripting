<!-- agentify: generated 2026-05-31 | score-before: 0 | source: 1.3.0 -->
# Specifications — docs/specs/

Source-of-truth contracts before implementation. An agent working from a spec
must not deviate without updating the spec first.

## Status lifecycle
`draft → review → approved → implemented → deprecated`

## File format
Each spec is a markdown file (`<slug>.md`) with at minimum:
- **Status**: one of the lifecycle states above
- **Overview**: what the feature/change does, in precise terms
- **Public interface**: Solidity function signatures or JS API surface — the contract with consumers
- **Constraints**: limits, invariants, edge cases the implementation must respect
- **Open questions**: unknowns to resolve before implementation begins
- **References**: links to related plans, review findings, or external docs

## Example template
```markdown
---
title: Maximum Variables Per Call Increase
status: draft
---

## Overview
Increase the partial return variable limit from 3 to 4 by changing
the encoding layout.

## Public interface
No API changes. The current 120-bit memTargets field would change
to fit 4×30-bit entries instead of 3×40-bit.

## Constraints
- Total encoding must still fit in 256 bits
- Memory targets cannot exceed 30 bits (1GB calldata limit)
- Backward compatibility: existing 3-variable encoding must still work

## Open questions
- Is the 30-bit memTarget limit acceptable?
- Should we add a version byte?
- Can existing partial return tests be adapted or do we need a new flag?

## References
- Current layout: docs/contracts.md (Offset encoding section)
- Plan: docs/plans/increase-variable-limit.md
```
