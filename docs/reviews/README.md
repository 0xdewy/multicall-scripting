<!-- agentify: generated 2026-05-31 | score-before: 0 | source: 1.3.0 -->
# Review Findings — docs/reviews/

Historical record from code reviews, design reviews, and security audits.
Read-only reference for future agents: "what was wrong here before, what was
decided." Filing a review here makes its findings persistent across sessions.

## Status lifecycle
`open → addressed | wont-fix`

## File format
Each review is a markdown file (`<slug>.md`) with at minimum:
- **Status**: one of the lifecycle states above
- **Review type**: code review, design review, security audit, self-audit
- **Date**: when the review was conducted
- **Findings**: numbered list of issues found, each with severity (critical/high/medium/low)
- **Resolution**: per-finding: what was done (fixed, accepted risk, won't fix) and why
- **Related**: links to specs/plans that address these findings

## Example template
```markdown
---
title: Self-audit — mcopy bounds checking
status: addressed
review_type: security audit
date: 2025-12-15
---

## Finding 1: Missing bounds check in call path
**Severity**: Medium
mcopy in the 0xFE call path did not validate memTarget + resultLength
against calldata bounds before the recent fix.

**Resolution**: Fixed. Bounds check added at MulticallScripter.sol:162-165.

## Finding 2: Unvalidated returnDataSize in partial return
**Severity**: Low
The 16-bit returnDataSize field is trusted without upper-bound validation.
Could in theory allocate excessive memory.

**Resolution**: Accepted risk. The 16-bit limit (65535 bytes) is the inherent
bound. Gas costs for copying large amounts would make attacks uneconomical.
```
