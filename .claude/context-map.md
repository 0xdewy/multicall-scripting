<!-- agentify: generated 2026-05-31 | score-before: 0 | source: 1.3.0 -->
<!-- Every entry here must point to a file that exists on disk. -->
<!-- Maintained by: /agentify update -->

# Context Map: multicall-scripting

## Architecture and Design

- System architecture, components, data flow → `docs/OVERVIEW.md`
- Solidity contracts internals, patterns, key files → `docs/contracts.md`
- JavaScript library internals, patterns, key files → `docs/javascript.md`
- Testing internals, patterns, key files → `docs/testing.md`
- Examples internals, patterns, key files → `docs/examples.md`

## Coding Conventions

- Solidity conventions (assembly, constants, imports, errors) → `.claude/rules/solidity.md`
- JavaScript conventions (BigInt, descriptors, encoding, private methods) → `.claude/rules/javascript.md`
- Testing conventions (Foundry, Bun, FFI integration, fuzz tests) → `.claude/rules/testing.md`
- Your personal preferences → `CLAUDE.local.md` (gitignored, keep yours)

## Project Operations

- How to build, test, run, lint → `CLAUDE.md` (Commands section)
- How to navigate and update these docs → `docs/NAVIGATION.md`
- Session learnings → `~/.claude/projects/.../memory/MEMORY.md` (auto memory, Claude-managed)

## Finding Specific Things

- Where data enters the system → `docs/OVERVIEW.md` (Data Flow section)
- How to add a new call type flag → `docs/contracts.md` + `docs/javascript.md`
- Where offset encoding is defined → `src/MulticallScripter.sol` (execute()) + `js/index.js` (encoding helpers)
- Where bit alignment is validated → `test/JsLibrary.t.sol` (test_js_encoding_roundtrip)
- All file-pointer cross-references → this file

## Agent Coordination

- Implementation plans for agents to pick up → `docs/plans/`
- Feature and API specifications → `docs/specs/`
- Code and design review findings → `docs/reviews/`

## Subagent Use

This context map is designed to be useful both in the main session and in
subagents. Subagents load their own copy of CLAUDE.md and path-scoped rules.
When spawning a subagent, reference the relevant doc from this map as part
of the subagent's task prompt.

---
*To rebuild this context system: run `/agentify update` in this repo.*
