# AGENTS.md - Multicall Scripting Guide for LLMs

This document provides essential information for LLMs (Large Language Models) working with the Multicall Scripting codebase. It covers architecture, key files, development workflows, and common patterns.

## 🏗️ Project Overview

**Multicall Scripting** enables atomic execution of multi-contract strategies with return value chaining between calls. Unlike basic multicall solutions, it allows using return values from one call as inputs to another within the same transaction.

### Core Components
- **Solidity Layer**: Smart contracts for on-chain execution
- **JavaScript Layer**: Offchain transaction builder and utilities
- **Descriptor System**: Proxy objects representing future return values

## 📁 Key Files & Their Purposes

### Solidity Contracts (`src/`)
| File | Purpose | Key Functions |
|------|---------|---------------|
| `MulticallScripter.sol` | Core execution contract | `execute()` - runs chained calls |
| `CallBuilder.sol` | Solidity DSL for tests | `call_static()`, `useCallOutput()` |
| `7702Caller.sol` | EIP-7702 compatibility | Account abstraction support |

### JavaScript Library (`js/`)
| File | Purpose | Key Components |
|------|---------|---------------|
| `index.js` | Main TransactionBuilder class | `addCall()`, `build()`, offset encoding |
| `cli.js` | Command-line interface | Transaction building utility |
| `test/` | JavaScript test suite | Individual feature tests |

### Test Suite (`test/`)
| File | Purpose | Coverage |
|------|---------|----------|
| `MulticallScripter.t.sol` | Core contract tests | Execution logic, edge cases |
| `CallBuilder.t.sol` | DSL functionality tests | Chaining patterns, error cases |
| `JsLibrary.t.sol` | JavaScript integration tests | Cross-layer compatibility |

## 🧠 Architecture Guide for LLMs

### Memory Offset System
The system uses compact 256-bit offset encoding to specify how return data should be handled:

#### Regular Calls (StaticCall and StateChangingCall)
```
Bits: [8:calltype][120:memTarget/returnOffset][120:resultLength/returnSize]
- calltype: 0xFF (static), 0xFE (regular)
- memTarget: Memory offset for return data storage
- resultLength: Size of return data to copy
```

#### Partial Return Calls (STATIC_CALL_PARTIAL_RETURN_FLAG = 0xFC)
```
Bits: [8:calltype][8:valueIndex][120:memTargets(40×3)][48:resultLengths(16×3)][48:returnOffsets(16×3)][16:returnDataSize][8:num_vars]
- calltype: 0xFC (partial return)
- memTargets: Array of 3 memory targets (40 bits each)
- resultLengths: Array of 3 variable lengths (16 bits each)
- returnOffsets: Array of 3 return data offsets (16 bits each)
```

### Descriptor System (JavaScript)
- **Proxy objects** represent future return values
- **Dynamic types** require `.with_length()` specification
- **Struct access** uses dot notation: `result.fieldName`
- **Array elements** use bracket notation: `result[0]`

### Key Constants
```javascript
// JavaScript (js/index.js)
STATIC_CALL_FLAG = 0xFF
CALL_FLAG = 0xFE
STATIC_CALL_PARTIAL_RETURN_FLAG = 0xFC
VALUE_OFFSET = 248

// Solidity (src/MulticallScripter.sol)
uint256 constant STATIC_CALL_FLAG = 0xFF;
uint256 constant CALL_FLAG = 0xFE;
uint256 constant STATIC_CALL_PARTIAL_RETURN_FLAG = 0xFC;
uint256 constant VALUE_OFFSET = 248;
```

## 🛠️ Development Workflows

### Setup Commands
```bash
# Install JavaScript dependencies
cd js && bun install

# Install Foundry dependencies
forge install

# Update Foundry
foundryup
```

### Testing Commands
```bash
# Run all Solidity tests (verbose)
forge test -vv

# Run specific test file
forge test --match-test test_partial_return_data

# Run JavaScript tests
cd js && bun test

# Run specific JavaScript test
cd js && bun test/test/simpleValue.js
```

### Build & Example Execution
```bash
# Build transaction via CLI
cd js && node cli.js <target> <abi_path>

# Run example strategy
cd js/examples && bun run multiple_swaps.js
```

## 📝 Common Tasks for LLMs

### Adding New Features
1. **Modify both layers**: Solidity contract + JavaScript builder
2. **Update offset encoding**: Ensure bit alignment matches between layers
3. **Add tests**: Include both Foundry and JavaScript test cases
4. **Update documentation**: README.md and code comments

### Fixing Bugs
1. **Check offset consistency**: Verify JavaScript encoding matches Solidity decoding
2. **Test edge cases**: Use existing test patterns as reference
3. **Run full test suite**: Both `forge test` and `bun test`
4. **Verify bit operations**: Pay attention to shift/mask operations

### Writing Tests
**Solidity Tests (Foundry):**
```solidity
// Follow pattern from test/MulticallScripter.t.sol
function test_NewFeature() public {
    // Setup
    bytes memory calldata = abi.encodeWithSelector(...);
    
    // Execution
    uint256 callIndex = call_static(target, calldata);
    
    // Assertions
    assertEq(result, expected);
}
```

**JavaScript Tests:**
```javascript
// Follow pattern from js/test/simpleValue.js
const builder = new TransactionBuilder();
const result = builder.addCall(abi, target, "function", args);
const built = builder.build();

// Verify offset encoding
assert(built.offsets[0].toString().includes(expected));
```

## ⚠️ Important Constraints

### Technical Limits
1. **Maximum 3 variables per call** due to 256-bit encoding space
2. **Dynamic arrays require `.with_length()`** before use
3. **No return data reuse** - each value can only be used once
4. **Memory offset limits**: 
   - `memTargets`: 40-bit offsets
   - `resultLengths`/`returnOffsets`: 16-bit values
   - `returnDataSize`: max 65535 bytes

### Consistency Requirements
1. **Bit alignment must match** across Solidity, JavaScript, and Rust (`rust/`)
2. **Constants must be identical** in all three layers — `schema/offset-schema.json` is the single
   source of truth (JS reads it, Rust codegen's from it via `rust/crates/codec/build.rs`, Solidity
   mirrors it by hand). Edit the schema first, then regenerate golden vectors
   (`bun js/scripts/gen-test-vectors.js`).
3. **Test coverage should be parallel** across layers (incl. `cargo test` and the `RustLibrary`
   FFI test)
4. **Error handling should be consistent** across interfaces
5. **See `docs/rust.md`** for the Rust layer's crate map, parity model, and current scope/limits

## 🔍 Troubleshooting Guide

### Common Issues & Solutions

#### Offset Encoding Errors
```
Problem: "Invalid offset encoding" or memory corruption
Check:
1. Bit shift operations in JavaScript match Solidity
2. Constants (VALUE_OFFSET, etc.) are identical
3. Field sizes (8, 120, 48, 16 bits) align correctly
```

#### Test Failures
```
Problem: Tests pass in one layer but fail in another
Action:
1. Run both test suites: `forge test` AND `bun test`
2. Check cross-layer integration tests (JsLibrary.t.sol)
3. Verify example scripts still work
```

#### Build Errors
```
Problem: Dependency or compilation issues
Fix:
1. Update dependencies: `bun install` and `forge install`
2. Clear cache: `forge clean`
3. Check Solidity version: Must be ^0.8.28
```

### Debugging Tips
- **Use `-vv` flag**: `forge test -vv` for verbose output
- **Check assembly**: Pay attention to inline assembly in Solidity
- **Verify bit masks**: Ensure AND operations use correct masks
- **Test incrementally**: Add small changes and test frequently

## 📚 Code Conventions

### Solidity Style
- **License**: GPL3
- **Version**: `^0.8.28`
- **Assembly**: Used for gas efficiency with detailed comments
- **Constants**: UPPER_SNAKE_CASE in separate contract
- **Errors**: Custom error types with descriptive names

### JavaScript Style
- **Imports**: Use `viem` for ABI encoding
- **BigInt**: Use for 256-bit values (not Number)
- **Classes**: TransactionBuilder as main interface
- **Utilities**: TypeUtils for dynamic type detection
- **Exports**: Named exports for constants and functions

### Naming Patterns
- **Offsets**: Descriptive names like `memTarget`, `returnOffset`
- **Functions**: `call_static()`, `useCallOutput()`, `addCall()`
- **Variables**: `callIndex`, `resultLength`, `num_vars`
- **Tests**: `test_` prefix with descriptive names

## 🔗 Integration Points

### EIP-7702 Compatibility
- See `7702Caller.sol` for account abstraction support
- Follows EIP-7702 standard for external ownership
- Integrates with MulticallScripter execution model

### Related Projects
- **Multicall3**: Basic batching (this project adds chaining)
- **Weiroll**: Different approach to VM scripting
- **Comparison**: Documented in README.md "Related Projects"

### External Dependencies
- **Foundry**: Development and testing framework
- **Viem**: Ethereum TypeScript/JavaScript library
- **Bun**: JavaScript runtime for tests and examples

## 🎯 Quick Reference Tables

### Offset Bit Layouts
| Call Type | Total Bits | Field Breakdown |
|-----------|------------|-----------------|
| Regular | 256 | 8 + 120 + 120 |
| Partial Return | 256 | 8 + 8 + 120 + 48 + 48 + 16 + 8 |

### Type Utilities (JavaScript)
| Function | Purpose | Example |
|----------|---------|---------|
| `isDynamicType()` | Check if type is dynamic | `isDynamicType("string") → true` |
| `getElementType()` | Get array element type | `getElementType("address[]") → "address"` |
| `isArrayType()` | Check if type is array | `isArrayType("uint256[]") → true` |

### Test Helpers (`js/test/common.js`)
| Function | Purpose |
|----------|---------|
| `loadABI()` | Load ABI from file path |
| Test utilities | Common setup for JavaScript tests |

## 🤖 LLM-Specific Guidance

### When Modifying Code
1. **Always update both layers**: Solidity changes need JavaScript updates
2. **Check offset encoding**: Use test files as reference for bit operations
3. **Run full test suite**: Don't rely on partial test results
4. **Verify examples**: Ensure example scripts still work

### When Adding Features
1. **Start with tests**: Write tests first to define expected behavior
2. **Follow existing patterns**: Use similar code structure to existing features
3. **Document changes**: Update README.md and code comments
4. **Consider constraints**: Remember 3-variable limit and bit encoding limits

### When Debugging
1. **Use verbose output**: `-vv` flag in Foundry tests
2. **Check both test suites**: Solidity and JavaScript tests may fail differently
3. **Examine bit operations**: Most bugs are in shift/mask calculations
4. **Compare with working code**: Use existing features as reference implementation

### Best Practices
1. **Keep constants synchronized**: Update both Solidity and JavaScript
2. **Maintain test parity**: Features should have tests in both layers
3. **Document edge cases**: Especially for bit manipulation code
4. **Use descriptive names**: Especially for offset-related variables

---

*This AGENTS.md file is maintained to help LLMs understand and contribute to the Multicall Scripting project effectively. Update it when adding significant new features or changing architecture patterns.*