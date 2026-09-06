---
name: multicall-scripting
description: Build and execute atomic multi-call transactions with return-value chaining using the multicall-scripter JS library and MulticallScripter executor. Use when a user wants to batch contract calls where a later call needs an earlier call's return value (balance → transfer, reserves → swap, deposit → borrow), when debugging an execute() revert, or when wiring an EOA through the EIP-7702 delegate.
---

# multicall-scripting

Copy this folder into `.claude/skills/` of any project that uses the library.

## Mental model

- `TransactionBuilder.addCall(abi, target, fn, args, msgValue?)` records a call and returns a
  **descriptor** for its return value. A descriptor is a placeholder, not a value.
- Passing a descriptor inside a later call's `args` tells the builder "put the real return data
  here at run time". Descriptors may sit anywhere in the args: top level, struct fields, array
  elements, structs inside arrays.
- `build()` returns `{ targets, offsets, calldatas, msgValues }`. Submit them to
  `MulticallScripter.execute(targets, offsets, calldatas, msgValues)` with
  `value = sum(msgValues)`.
- Calls run **from the executor's address**. Tokens received mid-batch land in the executor;
  `balanceOf(executorAddress)` reads them; the batch must send them onward before it ends.

## Recipe

```javascript
import { TransactionBuilder } from "multicall-scripter";

const b = new TransactionBuilder();

// 1. reads: view/pure functions → static calls; their outputs are descriptors
const bal = b.addCall(ERC20, token, "balanceOf", [EXECUTOR]);
const [r0, r1] = b.addCall(PAIR, pair, "getReserves", []);          // multiple outputs
const acct = b.addCall(AAVE, pool, "getUserAccountData", [me]);       // struct: acct.availableBorrowsBase

// 2. dynamic returns need an exact length before use (elements for T[], bytes for bytes/string)
const owners = b.addCall(SAFE, safe, "getOwners", []);
owners.with_length(3);

// 3. writes: nonpayable/payable functions → calls; last arg is msg.value (bigint)
b.addCall(WETH, weth, "deposit", [], 10n ** 18n);
b.addCall(ERC20, token, "transfer", [owners[0], bal]);
b.addCall(ROUTER, router, "getAmountOut", [1n, r0, r1]);

// 4. build and send
const { targets, offsets, calldatas, msgValues } = b.build();
await wallet.writeContract({ address: EXECUTOR, abi: EXECUTOR_ABI, functionName: "execute",
  args: [targets, offsets, calldatas, msgValues], value: msgValues.reduce((a, v) => a + v, 0n) });
```

Executor ABI fragment:

```json
[{"type":"function","name":"execute","stateMutability":"payable",
  "inputs":[{"name":"targets","type":"address[]"},{"name":"offsets","type":"uint256[]"},
            {"name":"calldatas","type":"bytes"},{"name":"values","type":"uint256[]"}],
  "outputs":[]}]
```

## Reading without a transaction

`MulticallScripterReadOnly.execute(targets, offsets, calldatas, msgValues)` is `view`, takes the
same inputs, runs everything as `staticcall`, and returns `bytes[]` — one entry per call with its
full return data. Use it via `eth_call` / `readContract` for quote pipelines and to inspect every
intermediate value of a batch before sending it to the real executor. Writing callees revert under
it, and `msgValues` is ignored.

## Rules the builder enforces (and the errors it throws)

| Rule | Error text |
|---|---|
| Dynamic values need `with_length(n)` first | `requires with_length() before use` |
| At most 3 slices per producing call | `Too many variables` — read the value again with another call |
| One dynamic value per return | `more than one dynamic value in the return data` |
| No arrays of dynamic elements | `arrays of dynamic elements are not supported` |
| Descriptor kind must match the parameter (static↔static, dynamic↔dynamic) | `cannot pass a X return value as a Y argument` |
| No `msg.value` on view/pure | `cannot receive msg.value` |

`with_length` must be exact: the original length word is copied. An incorrect declaration can
revert or make the consumer read adjacent arguments; it is not a safe truncation operation. Prefer functions whose return length you control.

## Decoding an `execute()` revert

| Selector | Error | Usual cause |
|---|---|---|
| `0xcbce8a22` | `InsufficientReturnData()` | wrong target address (no code), wrong ABI, or `with_length` too large |
| `0xd558ad4e` | `InvalidMemoryTarget()` | hand-built offsets; or a descriptor used by the *last* call's producer with no consumer region |
| `0x6115f2de` | `InvalidOffset(uint256)` | hand-built offsets with a bad calltype byte |
| `0x3b1a9b29` | `InvalidValueIndex()` | `msgValues` array does not match the offsets (rebuild, do not edit arrays by hand) |
| `0xf0c49d44` | `RefundFailed()` | the caller is a contract without `receive()` and overpaid `msg.value` |
| `0x60f8f321` | `EthNotAccepted()` | ETH sent directly to the executor; use `msgValue` on a call instead |
| anything else | callee revert | bubbled unchanged; decode with the callee's ABI |

The batch is atomic: a failing call reverts everything, including earlier transfers.

## Safety checklist before sending

0. The user has **not** approved the executor address for any token (anyone could
   `transferFrom` them). Funds enter a batch via `msg.value`, via transfers made inside the batch
   by the executor itself, or by running the batch from the user's EOA through the 7702 delegate.
1. The last call(s) move every asset the batch received out of the executor.
2. No approvals are left on the executor beyond what the batch consumes (`approve` exactly the
   amount, or approve then spend it fully).
3. `value` on the transaction equals `sum(msgValues)`; surplus is refunded but wastes gas.
4. Simulate first (`eth_call` / `simulateContract`) — the executor is permissionless and the
   transaction is public.
5. Slippage: values read on-chain (reserves, balances) are used as-is; put `amountOutMin`
   literals in the same batch to bound the outcome.

## EIP-7702

If the user wants the calls to come *from their EOA* (its allowances, its `msg.sender`), delegate
the EOA to `SevenSevenZeroTwoCaller` and either:

- send the transaction **to your own address** calling `execute(...)`, or
- sign `hashExecute(targets, offsets, calldatas, values, nonce(), deadline)` (EIP-712, domain
  `MulticallScripter7702`/`2`, verifying contract = the EOA) and let a relayer call
  `executeWithSignature(..., deadline, signature)`.

The delegate has no other functions. `values` are paid from the EOA's balance.

## CLI

`bun cli.js '<calls json>'` where each call is
`{"abiPath","target","functionName","args","value"}` and an argument may be a reference
`{"callIndex":0,"offset":0,"size":32}` (return-data byte offset and size of a static value).
Prints the four inputs as JSON; used by the Foundry FFI tests.

## Limits worth stating to the user up front

- Cancun or later chains only (`mcopy`); the 7702 delegate needs Prague.
- Return data captured per partial-return call is capped at 65535 bytes.
- Fixed-size array outputs are indexable; fixed-size arrays *containing* dynamic types are not.
- The Rust builder supports scalar chaining and one dynamic value; nested references are JS-only.

## Packed ABI migration

The executor and read-only twin take `execute(address[],uint256[],bytes,uint256[])`.
`build().calldatas` is one packed hex string (Rust: `Bytes`), not an array. Each frame is
`[32-byte length][calldata padded to 32 bytes]`; no inner head table. Update ABIs and rebuild
saved batches from older releases. The 7702 signature domain version is `3`.

Consumer input rules: use BigInt/strings for large integers; CLI JSON numbers must be safe
integers. Narrow overloaded ABIs to the desired function. A successful EVM call returning false
is not a revert; the executor does not add ERC-20 success checks. Specify slippage bounds and
check residual balances/allowances. Run `script/rehearse.sh` for the mainnet-fork example.
