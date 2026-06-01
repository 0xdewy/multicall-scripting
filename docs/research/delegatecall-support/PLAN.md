# DELEGATE_CALL (0xFD) — Research & Implementation Plan

**Status:** Research / decision pending
**Owner:** TBD
**Last updated:** 2026-06-01
**Related:** AUDIT.md (F2), docs/plans/symbolic-execution.md, docs/plans/formal-verification.md

---

## 0. Current state (what exists today)

`DELEGATE_CALL_FLAG = 0xFD` is **declared but deliberately not executable**:

| Layer | Location | State |
|-------|----------|-------|
| Schema | `js/offset-schema.json:13` | `{ "value": "0xFD", "layout": "regular", "is_readonly": false, "status": "unimplemented" }` |
| Solidity constant | `src/MulticallScripter.sol:10` | `uint256 constant DELEGATE_CALL_FLAG = 0xFD;` |
| Solidity dispatch | `src/MulticallScripter.sol:227-231` | Explicit branch that reverts with `InvalidCalltype(0xFD)` rather than silently skipping |
| JS constant | `js/encoding.js:22`, re-exported `js/index.js:6,20` | Exported, but **no encode helper** (`staticCall`/`stateChangingCall`/`*PartialReturn` have no delegate analogue) |
| JS validation | `validateOffset` (tested at `js/test/schemaRoundtrip.test.js:238-240`) | Throws `"Unimplemented calltype"` |

So 0xFD is a reserved, fully-guarded placeholder: it cannot be built by the JS layer and is rejected at execution. There is **no silent-failure path** — the only cost today is a dead constant and one revert branch.

Separately, the EIP-7702 wallet already exposes a *direct* (non-scripted) delegatecall:
`src/7702Caller.sol:240-244` `executeDelegateCall(address target, bytes data)` under `onlyAuthorized`. This is the existing, narrower way to delegatecall from a user's account — relevant to the "do we even need 0xFD in the generic VM?" question below.

---

## 1. Goal & motivation

What a scripted `DELEGATE_CALL` branch would unlock that `CALL` (0xFE) / `STATIC_CALL_PARTIAL_RETURN` (0xFC) cannot:

- **Execution in the caller's context.** `delegatecall` runs the target's code with the *scripter's* `address(this)`, storage, balance, and the original `msg.sender`. A scripted delegatecall step could invoke library/logic bytecode that reads or mutates the caller's state mid-batch, then chain its return data into later calls via the existing splicing mechanism.
- **Stateful script primitives.** Combined with EIP-7702 (`src/7702Caller.sol`), a user's EOA delegating to the scripter could run a batch where some steps execute logic *as the EOA* (its storage, its balances, its approvals) without per-step external authorization.
- **Gas/UX parity with weiroll-style VMs.** Several comparable execution VMs expose delegatecall as a first-class op; absence is a feature gap for "logic plugin" patterns.

**Key tension:** every one of these benefits is precisely the source of the risk in §2. The motivation is real but narrow, and much of it is *already served* by `7702Caller.executeDelegateCall` for the single-call case. The open question this doc must answer is whether a **batched, return-chained** scripted delegatecall is worth the new attack surface.

---

## 2. Threat model & safety analysis

`delegatecall` is the highest-risk opcode to add here. Each risk below must be resolved before implementation, not after.

### 2.1 Breaks the stateless invariant

The scripter is documented and designed as **stateless** (`src/MulticallScripter.sol:28-32`): no storage variables, `receive()` rejects ETH (`src/7702Caller.sol` is the stateful counterpart). This statelessness is *why* reentrancy is a non-issue (AUDIT F4) and why the contract holding no funds/allowances is safe.

- A `delegatecall` from `execute()` runs target code against the scripter's own (empty) storage and address. If the target writes storage, it writes to the *scripter's* storage slots — turning a stateless contract stateful and potentially poisoning future calls.
- If the target executes `selfdestruct` (or, post-Cancun, behaves destructively) or itself `delegatecall`s further, the blast radius is the scripter contract itself.
- **Decision input:** does adding 0xFD require the scripter to remain genuinely stateless (target must not touch storage — unenforceable in the EVM), or do we accept that 0xFD makes the *generic* scripter unsafe and therefore gate it (see §2.4)?

### 2.2 Storage-collision & untrusted-target risk

`delegatecall` to an arbitrary caller-supplied `target` with caller-supplied calldata is, by construction, "run untrusted code as me." There is no storage layout the scripter can enforce on the target. This is the canonical proxy/delegatecall footgun.

### 2.3 Interaction with the unbounded return-data write (AUDIT F1 / review §1.1)

The regular (0xFF/0xFE) branches write return data to a caller-supplied `returnOffset` **with no bounds check** (`src/MulticallScripter.sol:76-108`), unlike the partial-return branches which guard at `src/MulticallScripter.sol:164`. Since 0xFD is declared `layout: "regular"`, a naive implementation would inherit the same unbounded write. **0xFD must not ship before the §1.1 bounds-check fix lands**, or it compounds memory-corruption risk with arbitrary code execution.

### 2.4 Scope: generic VM vs 7702-gated

Two viable designs:
- **(A) Generic `execute()` support.** Any caller can submit a 0xFD step. Maximum flexibility, maximum risk — anyone can make the scripter delegatecall arbitrary code. Given the scripter holds no state/funds, the *direct* damage is bounded, but it normalizes a dangerous pattern and the storage-write/selfdestruct risks above apply to the shared scripter contract.
- **(B) 7702-only / authorized context.** Expose scripted delegatecall only through the authenticated `7702Caller` path (which already has `onlyAuthorized` + nonce replay protection), not in the bare `MulticallScripter.execute()`. This matches where the benefit actually lives and contains the risk to a per-user wallet.

**Recommendation bias:** design B unless a concrete generic use case is identified.

### 2.5 `msg.value` semantics

`delegatecall` cannot forward `value` (it inherits the calling frame's). The `regular` layout reserves a `valueIndex` field for 0xFE; for 0xFD that field is meaningless and must be rejected (require `valueIndex == 0`) to avoid a misleading API.

---

## 3. Implementation sketch (both layers — per CLAUDE.md bit-alignment rule)

Only pursue if §2 resolves in favor. Order: **schema first, then both layers, then tests.**

### 3.1 Schema (`js/offset-schema.json`)
- Flip `DELEGATE_CALL_FLAG.status` from `"unimplemented"` to implemented; keep `layout: "regular"`.
- Document that `valueIndex` is forbidden (must be 0) for 0xFD.

### 3.2 Solidity (`src/MulticallScripter.sol`)
Replace the revert branch at lines 227-231 with a real dispatch, modeled on the 0xFF branch (lines 76-88) but using `delegatecall` (which has **no value argument**):

```solidity
if eq(callType, DELEGATE_CALL_FLAG) {
    let returnSize := shr(136, shl(136, offset))
    let returnOffset := add(add(calldataOffset, 0x20), shr(136, shl(16, offset)))
    // REQUIRED: bounds-check returnOffset+returnSize (see review §1.1 / AUDIT F1)
    // delegatecall(gas, address, argsOffset, argsSize, retOffset, retSize)
    if iszero(delegatecall(gas(), target, dataStart, calldataLen, returnOffset, returnSize)) {
        returndatacopy(0x00, 0x00, returndatasize())
        revert(0x00, returndatasize())
    }
    continue
}
```
A partial-return analogue (a `0xFA` "DELEGATE_CALL_PARTIAL_RETURN"?) is **out of scope** for v1 — start with the simple regular-layout form only.

### 3.3 Solidity DSL (`src/CallBuilder.sol`)
Add a `delegateCall(uint256 memTarget, uint256 resultLength)` encode helper mirroring `staticCall` (lines 35-41), packing `DELEGATE_CALL_FLAG` into the calltype byte with `valueIndex = 0`.

### 3.4 JS (`js/encoding.js` + `js/index.js`)
- Add a `delegateCall(memTarget, resultLength)` encode helper next to `staticCall`/`stateChangingCall`, reusing the regular-layout packing and validating `valueIndex == 0`.
- Update `validateOffset` to accept 0xFD (remove it from the "Unimplemented calltype" rejection).
- Surface it in the `TransactionBuilder` API (e.g. an `isDelegate` option on `addCall`), respecting the no-`msg.value` constraint.
- `js/examples/helpers.js:76` already references a `'DELEGATECALL'` type string — wire it through.

---

## 4. Test plan (mirror existing 0xFC/0xFB patterns)

- **Solidity unit** (`test/MulticallScripter.t.sol`): a `Logic` mock with a known storage layout; assert that a 0xFD step executes against the *scripter's* context and that return-data splicing into a follow-up call works.
- **Storage-context assertion:** prove `msg.sender`/`address(this)` are the scripter's, distinguishing delegatecall from a plain call (the defining semantic).
- **Bounds-check test:** confirm the §1.1 guard fires (`InvalidMemoryTarget()`) for an out-of-range `returnOffset` on a 0xFD step.
- **JS roundtrip** (`js/test/schemaRoundtrip.test.js`): replace the "delegate call flag (unimplemented) throws" test (lines 238-240) with encode→decode roundtrip coverage.
- **FFI integration** (`test/JsLibrary.t.sol`): JS-built 0xFD batch executed in Solidity, per the cross-layer pattern in `.claude/rules/testing.md`.
- **Negative:** 0xFD with non-zero `valueIndex` must revert/throw in both layers.

---

## 5. Decision

> **To be filled in after the §2 analysis is reviewed.** Pick one and justify:
>
> 1. **Implement, 7702-gated (design B)** — recommended starting position: the benefit (stateful, authorized batch logic) lives in the wallet, and gating contains the §2.1–2.4 risks. Requires §1.1 bounds fix first and symbolic-execution coverage (docs/plans/symbolic-execution.md) of the new branch.
> 2. **Implement, generic (design A)** — only if a concrete generic use case justifies the broader surface.
> 3. **Keep as reverting placeholder** — status quo; zero added risk, preserves the reserved flag for future work. Lowest effort.
> 4. **Remove entirely** — strip 0xFD from schema, both constants, the revert branch, and the JS export, deleting the dead surface (AUDIT F2). Choose this if there is no near-term intent to implement.

**Cross-links:** any "implement" outcome must be covered by `docs/plans/symbolic-execution.md` (memory-bounds proofs over the new branch) and depends on the AUDIT F1 / review §1.1 bounds-check fix landing first.
