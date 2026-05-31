<!-- agentify: generated 2026-05-31 | score-before: 0 | source: 1.3.0 -->
---
paths:
  - "test/**/*.sol"
  - "js/test/**"
  - "js/**/*.test.*"
---

## Conventions

### Solidity tests (Foundry)
- All test contracts inherit `Test` from forge-std: `contract MyTest is Test { }`
- Setup in `setUp()`: deploy fresh contract instances before each test (Foundry isolates storage)
- Use `assertEq()`, `assertGt()`, `assertLt()` for assertions — `assertEq` with 3 args includes a revert message
- Fuzz tests: declare function parameters without explicit input ranges (Foundry generates values):
  ```solidity
  function test_fuzz_simple_set_and_get(uint256 set) public { ... }
  ```
- Use `vm.expectRevert(bytes)` to match error selectors: `vm.expectRevert(abi.encodeWithSelector(InvalidCalltype.selector, 0x00));`

### JavaScript tests (Bun)
- One test file per feature under `js/test/`
- Import `common.js` helpers: `loadABI()` for loading ABI files
- Use `describe`/`test` from Bun's test runner
- JSON output from test scripts is parsed by Solidity tests via `vm.ffi()`

## Patterns

### Cross-layer integration tests (JsLibrary.t.sol)
The pattern for verifying JavaScript-built data against Solidity:
```solidity
string[] memory inputs = new string[](4);
inputs[0] = "bun";
inputs[1] = "js/test/featureName.js";
inputs[2] = vm.toString(address(contractInstance));
inputs[3] = "out/Helpers.sol/ContractName.json";
bytes memory res = vm.ffi(inputs);
string memory json = string(res);
address[] memory jsTargets = vm.parseJsonAddressArray(json, ".targets");
uint256[] memory jsOffsets = vm.parseJsonUintArray(json, ".offsets");
bytes[] memory jsCalldatas = vm.parseJsonBytesArray(json, ".calldatas");
uint256[] memory jsMsgValues = vm.parseJsonUintArray(json, ".msgValues");
multicall.execute(jsTargets, jsOffsets, jsCalldatas, jsMsgValues);
```

### Encoding roundtrip tests
`test_js_encoding_roundtrip()` validates that JS-built offsets decode correctly in Solidity using `CallDecoder`. Always add a roundtrip test when adding new call types or modifying offset encoding.

### Gas comparison tests
`GasComparisons.t.sol` compares MulticallScripter against Weiroll for equivalent operations. Follow the pattern: deploy both, build equivalent call sets in both systems, compare gas usage.

## Pitfalls

- FFI requires `ffi = true` in `foundry.toml` — already enabled
- The ABI file path for FFI tests uses `out/Helpers.sol/ContractName.json` (Foundry's output directory)
- Don't forget to `forge build` before running tests that depend on `out/` ABIs
- In msgValue comparison tests, the `values` array must be the same length as `targets` — use `stateChangingCall(0x0)` (valueIndex=0) for calls with no value

## See Also

- Test helper contracts → test/Helpers.sol
- JS test structure → docs/javascript.md
- Integration test patterns → docs/testing.md
