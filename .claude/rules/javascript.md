<!-- agentify: generated 2026-05-31 | score-before: 0 | source: 1.3.0 -->
---
paths:
  - "js/**/*.js"
  - "js/**/*.ts"
---

## Conventions

- ES modules only: use `import`/`export`, never `require()` or `module.exports`
- Use `BigInt` for all 256-bit numeric values (offsets, masks, bit shifts) — JavaScript `Number` loses precision above 2^53
- Private methods use `#methodName` syntax
- Error handling: `throw new Error("message", { cause: originalError })` for error chaining
- Single dependency: `viem` (v2.x) for `encodeFunctionData` and `getAbiItem`; do not add new runtime deps without discussion

## Patterns

### Descriptor system
Return values from `addCall()` are proxy objects carrying metadata (`callIndex`, `offset`, `size`, `type`). Pass them as arguments to subsequent `addCall()` calls to wire return values:
```javascript
const balance = builder.addCall(ERC20_ABI, token, "balanceOf", [user]);
builder.addCall(ERC20_ABI, token, "transfer", [recipient, balance]);
```

### Dynamic type sizing
Dynamic return types (bytes, string, arrays) require `.with_length(n)` before use:
```javascript
const text = builder.addCall(abi, target, "getName", []);
text.with_length(24); // byte length of the return data
builder.addCall(abi, target, "setName", [text]);
```

### Offset encoding
Encoding helpers (`staticCall`, `staticCallPartialReturn`, `stateChangingCall`, `callPartialReturn`) pack fields into a 256-bit BigInt. The bit layout must match `MulticallScripter.sol` exactly:
```
Partial return: [8:calltype][8:valueIndex][120:memTargets(40×3)][48:resultLengths(16×3)][48:returnOffsets(16×3)][16:returnDataSize][8:num_vars]
```

### File structure
- `js/index.js` — TransactionBuilder class + encoding helpers + type utilities
- `js/cli.js` — CLI wrapper invoked as `tx-builder` (declared in package.json `bin`)
- `js/abi.js` — ABI loading helper
- `js/test/` — Bun test files (one per feature)
- `js/examples/` — Runnable strategy scripts

## Pitfalls

- Don't reuse descriptors: each return value can only be wired once — `usedDescriptors` Set enforces this
- Don't chain return values from state-changing calls in the current implementation — only static calls support partial return
- At most one dynamic return type per function, and it must be the last return value
- Maximum 3 variables per call (`PARTIAL_RETURN_VARS = 3`)
- When adding new call type flags, add the constant, the encode helper, and tests in both layers

## See Also

- TransactionBuilder API → docs/javascript.md
- Bit layout reference → docs/contracts.md
- Example usage patterns → docs/examples.md
