# AUDIT.md — Self-Assessment of Security Risks

MulticallScripter has not been audited by an independent third party. This
document provides a self-assessment of the trust model, attack surface, known
risks, and gaps. It is intended to help users and auditors understand the
security boundaries of the system.

See also `docs/plans/security-self-audit.md` for the original plan.

---

## Trust Model

The caller supplies four arrays:

| Array | Content | Controlled by |
|---|---|---|
| `targets[]` | Contract addresses to call | Caller |
| `offsets[]` | 256-bit packed encoding of call type + memory layout | Caller |
| `calldatas[]` | Raw calldata bytes per call | Caller |
| `values[]` | ETH values to forward (only used with 0xFE/0xFB) | Caller |

**The VM does not validate call targets or calldata contents.** It guarantees:
- Atomic execution order (sequential, all-or-nothing via EVM transaction)
- Correct return-data splicing at the offsets specified by the caller

If the caller trusts the callee contracts, the VM output is deterministic for a
given script. The VM's security model is: it faithfully executes the user's
script, splicing return data exactly as the offset encoding dictates. It does not
protect against malicious or buggy callee contracts.

---

## Component Analysis

### MulticallScripter.sol

**Stateless executor.** No storage variables, no Ether balance (rejects direct
ETH via `receive()`), no `selfdestruct`, no `delegatecall`. The contract cannot
hold tokens, be reentered, or modify its own state.

**Assembly-only implementation.** All execution logic in `execute()` is Yul
assembly. Key implications:
- Standard Solidity safety nets (checked arithmetic, out-of-bounds array access)
  do not apply within assembly blocks
- The `mcopy` opcode (Cancun+, EIP-5656) is used for partial-return (0xFC/0xFB)
  data splicing
- Loop logic (`i`, `u`) and pointer arithmetic (`calldataOffset`) are
  hand-managed via Yul locals — no compiler-level protection

**Return-data bounds checking (partial, 0xFC/0xFB only).**
- For partial returns (0xFC/0xFB): `require(gt(add(memTarget, resLength), free_mem))`
  reverts with `InvalidMemoryTarget()` if a variable's memory target exceeds the
  pre-allocated calldata region. This is a bounds check on the `mcopy` destination.
- For regular calls (0xFF/0xFE): the `staticcall`/`call` writes `returnSize`
  bytes to `calldataOffset + 0x20 + memTarget` **without an explicit bounds check**.
  If the caller supplies a `memTarget + resultLength` exceeding the next call's
  calldata region, the write may overflow into subsequent calldata or unallocated
  memory. This is the intended chaining mechanism — return data is written into
  subsequent calldata — but the VM does not guard against misconfiguration.
  *Mitigation: caller controls all inputs; a malformed script will either corrupt
  its own calldata (detectable) or cause a revert in the corrupted call.*

**Invalid offset recovery.** Every call reads its `offset` from the offsets array.
Unknown call types revert with `InvalidCalltype(uint256)`. The `DELEGATE_CALL_FLAG
(0xFD)` is defined in both layers but reverts — it has no implementation path.

**No return-data re-use guard in assembly.** The `execute()` loop reads each
offset independently — there is no assembly-level check that return data is used
only once. However, the JavaScript `TransactionBuilder` enforces this at build
time via `usedDescriptors`.

### 7702Caller.sol

**Stateful EIP-7702 wrapper.** This contract holds ETH, manages authorized signers,
and supports delegatecall. It inherits `MulticallScripter` and wraps `execute()`.

**Auth model:**
- `onlyAuthorized`: caller must be in `authorizedSigners` mapping
- `onlyEntryPointOrAuthorized`: caller must be entry point OR authorized
- `execute()` uses `onlyEntryPointOrAuthorized` — allows EIP-7702 entry point OR
  direct calls from authorized signers
- Signers can add/remove other signers (except themselves)
- Entry point can be updated by any authorized signer

**ETH handling:**
- `receive()` accepts ETH (overrides base contract's rejection)
- `withdrawETH(to, amount)` restricted to `onlyAuthorized`
- `executeCall()` forwards ETH via `call{value: value}` — restricted to
  `onlyAuthorized`
- During `execute()`, the `values[]` array is used to forward ETH to callees;
  the contract must hold sufficient balance

**Delegatecall risk:** `executeDelegateCall()` allows authorized signers to
execute arbitrary code in the contract's storage context. This is a powerful
primitive but a standard one in account abstraction designs. Signers are the
security boundary.

**EIP-712 authorization:** `executeWithAuthorization()` supports gasless
execution via typed signatures. Includes nonce-based replay protection, expiry
validation, and domain separator with chain ID. The signer recovery logic
(`_recoverSigner`) validates signature length, v-value recovery, and non-zero
address.

### JavaScript TransactionBuilder

**Off-chain component.** The `TransactionBuilder` and `encoding.js` produce the
arrays that `execute()` consumes. A bug here produces malformed offsets, which
would cause at worst a revert (InvalidCalltype, InvalidMemoryTarget) or corrupted
calldata in a correctly-named contract call.

**Offset encoding correctness** is validated by:
- `js/test/schemaRoundtrip.test.js` — 14 unit tests covering encode→decode roundtrips
- `js/test/property-tests.test.js` — 8 property-based fuzz tests on random call sequences
- `test/JsLibrary.t.sol` — FFI integration tests comparing JS-generated offsets
  against Solidity-generated equivalents

A single bit-shift error in the JS encoder would produce valid-looking offsets
that decode differently in Solidity. The current defense is exhaustive sampling,
not formal proof.

---

## Findings

| # | Severity | Finding | Component |
|---|---|---|---|
| F1 | Medium | **No bounds check on returnOffset+returnSize for 0xFF/0xFE.** `staticcall`/`call` writes return data to memory without verifying `memTarget + returnSize` fits in the calldata region. 0xFC/0xFB have this check via `InvalidMemoryTarget`. | MulticallScripter |
| F2 | Low | **DELEGATE_CALL_FLAG (0xFD) defined but unimplemented.** Both Solidty and JS define the constant and validate offsets with it, but `execute()` reverts. Dead code that may confuse users. | MulticallScripter + JS |
| F3 | Low | **CALL_PARTIAL_RETURN_FLAG (0xFB) undertested.** Single Solidity test (`CallBuilder.t.sol`) and no JS roundtrip test in the schema test suite. The encoding path has less coverage than 0xFC. | MulticallScripter + JS |
| F4 | Low | **Stateless contract = reentrancy-safe.** No storage to corrupt on classical reentrancy. However, read-only reentrancy (view functions called mid-execution) is not applicable since the contract has no state to read. `7702Caller` introduces state but with auth guards. | MulticallScripter |
| F5 | Info | **Offset encoding correctness not formally verified.** Sampled integration tests only. A single bit-shift error could produce valid-encoding, wrong-semantics offsets silently. | JS encoding |
| F6 | Info | **Return-data write is a memory corruption vector if offsets are malformed.** If `memTarget + returnSize` exceeds the calldata region, data can be written into subsequent calls' calldatas or unallocated memory. Equivalent to calldata corruption: incorrect results but no fund loss (VM does not hold assets). | MulticallScripter |
| F7 | Info | **No bounds on values[] array length relative to value indices.** If a script uses a `valueIndex` exceeding `values.length-1`, the `calldataload(add(values.offset, sub(shl(5, value), 0x20)))` reads garbage from outside the values array. In practice, this reads calldata bytes belonging to other arrays — not an exploit, but a user footgun. | MulticallScripter |

---

## Known Gaps

- `DELEGATE_CALL_FLAG (0xFD)` — defined but unimplemented (see `docs/plans/unimplemented-features.md`)
- `CALL_PARTIAL_RETURN_FLAG (0xFB)` — thin test coverage
- No formal verification of encoding invariants (see `docs/plans/formal-verification.md`)
- No symbolic execution of memory bounds (see `docs/plans/symbolic-execution.md`)
- Gas regression not enforced in CI (see `docs/plans/gas-regression.md`)
- CI runs only `forge test`, not `forge snapshot --check` or `bun test` (see `docs/plans/ci-pipeline.md`)

---

## Recommendations

1. **Independent audit** before any production deployment. This self-assessment
   is a starting point, not a substitute for third-party review.
2. **Add bounds check for 0xFF/0xFE return data writes.** Either document as
   caller responsibility (matching current behavior) or add an explicit
   `require` like the 0xFC/0xFB path already has.
3. **Implement or remove 0xFD.** The dead constant is technical debt. Either
   implement the delegatecall path or remove the flag from both layers.
4. **Add Halmos/hevm symbolic execution** for the offset decoding in `execute()`.
   Proves absence of out-of-bounds memory writes for all valid offset inputs.
5. **Enforce gas regression in CI** via `forge snapshot --check`.
6. **Add invariant fuzzing on the JS builder** (complete — see `js/test/property-tests.test.js`).

---

*Last updated: 2026-06-01*
