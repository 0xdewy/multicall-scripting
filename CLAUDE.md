@AGENTS.md

Repo-specific notes for Claude Code sessions:

- Run the full matrix before declaring anything done: `forge test`, `cd js && bun test`,
  `cd rust && cargo test`. The FFI suites in `forge test` need `bun` and `cargo` on PATH.
- Do not add docs directories, plans, or generated context maps. README.md, AGENTS.md,
  SECURITY.md and the skill are the whole documentation set.
- When a builder position rule changes, add a hand-computed case to `js/test/layouts.test.js`
  and an on-chain case to `js/test/layouts.js` / `test/JsLibrary.t.sol` in the same change.
