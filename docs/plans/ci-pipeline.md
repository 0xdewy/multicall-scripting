<!-- agentify: generated 2026-05-31 | score-before: 0 | source: 1.3.0 -->
---
title: Add CI pipeline
status: ready
---

## What
Add a `.github/workflows/test.yml` that runs `forge test -vv` and
`cd js && bun test` on every PR and push to main.

## Why
Currently there is no CI visible in the repository. Without it, regressions
from PRs go unnoticed until a human runs tests locally.

## Acceptance criteria
- [ ] PRs trigger both `forge test` and `bun test`
- [ ] Push to main triggers both test suites
- [ ] FFI-enabled Foundry tests run (require `ffi = true` in forge config)
- [ ] CI uses a pinned Foundry version (via `foundry-rs/foundry-toolchain` action)
- [ ] CI uses a pinned Bun version (via `oven-sh/setup-bun` action)

## Steps
1. Create `.github/workflows/test.yml`
2. Configure `on: [push, pull_request]` for main branch
3. Set up Foundry job: install foundry, `forge install`, `forge test -vv`
4. Set up Bun job: `cd js && bun install && bun test`
5. Ensure FFI tests work in CI (the `ffi = true` in foundry.toml should suffice)
6. Run CI on this PR to confirm it passes
