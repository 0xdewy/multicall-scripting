---
title: Symbolic execution of the offset encoding layer
status: ready
---

## What
Use Halmos or hevm to symbolically execute the offset decoding paths in
`MulticallScripter.execute()` and prove absence of out-of-bounds memory
writes for all valid offset inputs.

## Why
The offset encoding layer is the highest-value verification target. A single
bit-shift error in the 256-bit offset packing corrupts memory layout across every
call in the batch. The current defense is sampled integration tests (JsLibrary.t.sol
FFI roundtrips) — a symbolic execution pass would prove the property for *all*
inputs within valid ranges, covering the infinite case.

Research (251 papers; `research/evm-vm-gas-verification/RESEARCH.md`) establishes
that sound verification of this VM **must** target bytecode level — source-level
tools (solc-verify, Slither) structurally cannot express the assembly/memory
constructs the VM is built from. Halmos and hevm both operate directly on EVM
bytecode, making them the correct tool class.

## Acceptance criteria
- [ ] Symbolic execution proves: for all valid offset encodings (within schema
  `offset-schema.json` constraints), `execute()` never produces out-of-bounds
  memory accesses (no `InvalidMemoryTarget` revert reachable with valid offsets)
- [ ] Memory write invariant: `memTarget + resultLength ≤ calldata_region_end`
  for all paths through `execute()`
- [ ] Partial return layout invariant: the 3×40 + 3×16 + 3×16 + 16 + 8 bit
  decomposition never produces an out-of-bounds field value
- [ ] Value index invariant: `valueIndex < values.length` for 0xFE and 0xFB
  calltypes (no out-of-bounds array access)
- [ ] Tool output committed as proof artifact in `docs/reviews/`

## Steps
1. Choose tool: Halmos (simpler — runs as `forge test` with symbolic backend)
   or hevm (more powerful, steeper setup). Recommend Halmos for initial pass.
2. Install: `pip install halmos` or equivalent
3. Write symbolic test: `test_encoding_symbolic_halmos.t.sol` using Halmos
   directives to declare inputs as symbolic
4. Assert: for all symbolic offset inputs, no revert path is reachable
   (or all reverts are expected)
5. Extend to: symbolic calldata sizes, value array lengths
6. Integrate into CI: `halmos --function check_memory_bounds` or similar
7. Document results: which properties proved, which require additional
   refinement

## Dependencies
- `docs/plans/formal-verification.md` — bytecode-level-only constraint
- `js/offset-schema.json` — canonical encoding spec (field sizes, valid ranges)
- `src/MulticallScripter.sol` — the decoding logic in `execute()`
- `src/CallBuilder.sol` — `CallDecoder` with pure decode functions (testable
  independently from the main executor)

## Research grounding
- eThor (DOI 10.1145/3372297.3417250, full text): demonstrated that sound
  bytecode analysis with Horn-clause abstraction achieves 100% recall on
  reachability properties — proves this approach is viable for EVM bytecode
- Semantic Framework (DOI 10.1007/978-3-319-89722-6_10, full text): the
  small-step EVM semantics that sound tools must reason over
- solc-verify (DOI 10.1007/978-3-030-41600-3_11, full text): the negative
  result — source-level verifiers cannot express inline assembly and low-level
  CALLs, confirming that bytecode-level tools are the only viable path

## References
- `docs/plans/formal-verification.md`
- `docs/plans/composability-verification.md`
- `research/evm-vm-gas-verification/RESEARCH.md` — H3 finding (bytecode semantics
  necessary but not sufficient)
