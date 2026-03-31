# Multicall Scripting: Atomic Execution with Return Value Chaining

[![License: GPL3](https://img.shields.io/badge/License-GPL3-blue.svg)](LICENSE)
[![Solidity](https://img.shields.io/badge/Solidity-^0.8.28-363636?logo=solidity)](https://soliditylang.org/)
[![JavaScript](https://img.shields.io/badge/JavaScript-ES6+-F7DF1E?logo=javascript)](https://developer.mozilla.org/en-US/docs/Web/JavaScript)
[![Foundry](https://img.shields.io/badge/Built%20with-Foundry-FF6C37?logo=ethereum)](https://getfoundry.sh/)

**Execute complex multi-contract strategies in a single atomic transaction with full return value chaining between calls.**

## 🚀 The Problem: Beyond Basic Multicall

Regular multicall solutions (like Multicall3) only batch independent calls. They can't use return values from one call as inputs to another within the same transaction. This forces developers to either:

**Multicall Scripting solves this** by enabling true return value chaining within a single atomic execution.


### Core Components

1. **`MulticallScripter.sol`**: Core contract that executes chained calls with memory copying
2. **`CallBuilder.sol`**: Solidity DSL for building chained calls in tests
3. **`TransactionBuilder` (JavaScript)**: Type-safe builder for complex transactions
4. **Descriptors**: Proxy objects that represent future return values

## ⚡ Quick Start

### Installation

```bash
# Clone the repository
git clone https://github.com/0xdewy/multicall-scripting/
cd multicall-scripting

# Install JavaScript library
cd js && bun install

# Install Foundry (for Solidity development)
curl -L https://foundry.paradigm.xyz | bash
foundryup
```

### Basic Example: ERC20 Balance → Transfer

```javascript
const { TransactionBuilder } = require("./js/index.js");

const builder = new TransactionBuilder();

// Get token balance - returns a virtual output for the return value
const balance = builder.addCall(
  ERC20_ABI,
  tokenAddress,
  "balanceOf",
  [userAddress],
  0n  // msg.value
);

// Transfer exact balance using the virtual output as input
builder.addCall(
  ERC20_ABI,
  tokenAddress,
  "transfer",
  [recipientAddress, balance],  // balance descriptor used as amount
  0n
);

// Build and execute
const { targets, offsets, calldatas, msgValues } = builder.build();
await multicallScripter.execute(targets, offsets, calldatas, msgValues);
```

## 🎯 Real-World Use Cases

### DeFi Strategy: Cross-Protocol Yield Farming

```javascript
// 1. Check Curve LP token balance
const curveLpBalance = builder.addCall(CURVE_ABI, curvePool, "balanceOf", [user]);

// 2. Withdraw from Curve
const withdrawnTokens = builder.addCall(
  CURVE_ABI, 
  curvePool, 
  "remove_liquidity_one_coin",
  [curveLpBalance, 0, 0] // 0 = min amount placeholder
);

// 3. Deposit to Aave
builder.addCall(
  AAVE_ABI,
  aavePool,
  "deposit",
  [usdcAddress, withdrawnTokens, user, 0]
);

// 4. Borrow against collateral
const borrowable = builder.addCall(
  AAVE_ABI,
  aavePool,
  "getUserAccountData",
  [user]
);

builder.addCall(
  AAVE_ABI,
  aavePool,
  "borrow",
  [daiAddress, borrowable.availableBorrowsETH, 2, 0, user]
);
```

## 🔧 API Reference

### JavaScript: `TransactionBuilder`

```javascript
class TransactionBuilder {
  /**
   * Add a call to the sequence
   * @param {Array} abi - Contract ABI
   * @param {string} target - Contract address
   * @param {string} functionName - Function to call
   * @param {Array} args - Arguments (can include descriptors)
   * @param {bigint} msgValue - Ether to send (0n for static calls)
   * @returns {object|Array} - Descriptor(s) for return values
   */
  addCall(abi, target, functionName, args, msgValue = 0n)
  
  /**
   * Build the transaction for execution
   * @returns {object} - { targets, offsets, calldatas, msgValues }
   */
  build()
}

// Structs: You can use the struct as you normally would in future calls.
const result = builder.addCall(abi, target, "getStruct", []);
result.fieldName;

// Arrays: You must tell the library the length of dynamic arrays to use them
const result = builder.addCall(abi, target, "getStruct", []);
result.with_length(n);
// you can use specific elements from the array, or use the whole array
result[0];

```

### Solidity: `CallBuilder` System

```solidity
// Core chaining functions
function useCallOutput(VarLib.Var memory returnData, VarLib.Var memory callParameter)
function useCallOutput(uint256 returnCallIndex, uint256 callParameterIndex)

// Position helpers: For simple types
function first(uint256 callIndex) returns (Var memory)   // First return value
function second(uint256 callIndex) returns (Var memory)  // Second return value  
function third(uint256 callIndex) returns (Var memory)   // Third return value
function withMemRange(uint256 callIndex, uint256 start, uint256 length) returns (Var memory)

// Call creation
function call_static(address target, bytes memory data) returns (uint256 callIndex)
function call(address target, bytes memory data, uint256 value) returns (uint256 callIndex)
function call(address target, bytes memory data) returns (uint256 callIndex)
```

## 🧠 Advanced Features

### Dynamic Type Support

Multicall Scripting supports basic dynamic types:

```javascript
// Strings
const text = builder.addCall(abi, target, "getString", []);
text.with_length(24); // Must specify expected length
builder.addCall(abi, target, "setText", [text]);

// Bytes
const data = builder.addCall(abi, target, "getBytes", []);
data.with_length(32);
builder.addCall(abi, target, "processData", [data]);

// Arrays
const addresses = builder.addCall(abi, target, "getAddresses", []);
addresses.with_length(3);
builder.addCall(abi, target, "processList", [addresses]);

// Structs
const userData = builder.addCall(abi, target, "getUser", []);
builder.addCall(abi, target, "updateUser", [
  userData.balance,    // Access struct fields
  userData.timestamp,
]);
```

Note: The library needs to be able to predetermine memory locations for all data so it cannot handle dynamic types that also have dynamic memory offsets. 

## 🏗️ Technical Architecture

### How It Works: Memory-Based Return Value Chaining
The contract adds basic scripting abilities on top of a regular multicall contract by allowing the user to define where the returndata is going to be saved for each call. It's highly efficient as the offsets are precalculated offchain and encoded in a way that the smart-contract can just make the calls and the required returndata is automatically encoded into the correct position for future calls. For this reason it can utilize returndata and complex sequences with almost no overhead. The tradeoffs with this technique is that it requires more off-chain verification and simulation as well as having limits into how complex the return data can be. If you are using returndata that contains a dynamic array you need to specify the length of this array so the contract can automatically encode it into a future call. This was a deliberate decision to favor efficiency over supporting 100% of the situations people may want to use it for.

### Offset Data Layout

The system uses compact 256-bit offset encoding to specify how return data should be handled. There are two distinct layouts:

#### Regular Calls (StaticCall and StateChangingCall)

For standard calls that copy entire return data segments:

```
Bit layout (256 bits total):
┌────────────┬──────────────────────────────┬──────────────────────────────┐
│ 8 bits     │ 120 bits                     │ 120 bits                     │
├────────────┼──────────────────────────────┼──────────────────────────────┤
│ calltype   │ memTarget/returnOffset       │ resultLength/returnSize      │
└────────────┴──────────────────────────────┴──────────────────────────────┘
```

- **calltype**: `0xFF` for static call, `0xFE` for regular call
- **memTarget/returnOffset**: Memory offset where return data should be stored (120 bits, ~1.3×10³⁶ possible values)
- **resultLength/returnSize**: Size of return data to copy (120 bits, supports up to ~1.3×10³⁶ bytes)

#### Partial Return Calls (STATIC_CALL_PARTIAL_RETURN_FLAG = 0xFC)

For calls that extract specific segments from return data:

```
Bit layout (256 bits total):
┌────────────┬────────────┬──────────────────────────────┬──────────────────┬──────────────────┬────────────────┬────────────┐
│ 8 bits     │ 8 bits     │ 120 bits                     │ 48 bits          │ 48 bits          │ 16 bits        │ 8 bits     │
├────────────┼────────────┼──────────────────────────────┼──────────────────┼──────────────────┼────────────────┼────────────┤
│ calltype   │ valueIndex │ memTargets (40×3)            │ resultLengths    │ returnOffsets    │ returnDataSize │ num_vars   │
│            │            │                              │ (16×3)           │ (16×3)           │                │            │
└────────────┴────────────┴──────────────────────────────┴──────────────────┴──────────────────┴────────────────┴────────────┘
```

- **calltype**: `0xFC` for static call with partial return
- **valueIndex**: Index into values array for msg.value (0 if no value)
- **memTargets**: Array of 3 memory targets (40 bits each) where variables should be copied
- **resultLengths**: Array of 3 lengths (16 bits each) of variables to copy
- **returnOffsets**: Array of 3 offsets (16 bits each) from beginning of return data  
- **returnDataSize**: Total length of return data (max 65535 bytes)
- **num_vars**: Number of variable segments to use (0-3)

#### Key Constraints
- Maximum 3 variables per call due to encoding space constraints
- `memTargets` are 40-bit offsets relative to calldata start
- `resultLengths` and `returnOffsets` are 16-bit values supporting up to 65535 bytes
- Regular calls copy entire return data segments in one operation
- Partial return calls extract specific segments for precise memory placement


## ⚠️ Limitations & Considerations

### Technical Constraints

1. **Maximum 3 variables per call** can be chained (due to encoding space)
2. **Dynamic arrays require `.with_length()`** before use
3. **No Variable Reuse** return data can only be used once


## 📚 Further Reading

### Architecture Deep Dive
- [Memory Copy Mechanism](./src/MulticallScripter.sol#L134-L156) - How `mcopy` enables chaining
- [Descriptor System](./js/index.js#L60-L116) - JavaScript proxy implementation
- [ABI Encoding Handling](./js/index.js#L333-R397) - Dynamic type support

### Example Implementations
- [DeFi Strategy Examples](./js/examples/multiple_swaps.js) - Complete DeFi workflows
- [Foundry Test Suite](./test/) - Comprehensive test patterns
- [JavaScript Library](./js/index.js) - Full API implementation

### Related Projects
- [Multicall3](https://github.com/mds1/multicall) - Basic call batching
- [Weiroll](https://github.com/weiroll/weiroll) - Advanced VM scripting

## 🤝 Contributing

We welcome contributions!

### Development Setup

```bash
# 1. Clone and install
git clone https://github.com/0xdewy/multicall-scripting
cd multicall-scripting

# 2. Set up development environment
cd js && bun install
cd .. && forge install

# 3. Run tests
forge test -vv
cd js && bun test

# 4. Build examples
cd js/examples && bun run multiple_swaps.js
```

### Roadmap
- [ ] Version that returns data for static call support
- [ ] Additional DSLs (Python, Rust)
- [ ] Formal verification of memory safety

### Warning
This repo has not been audited and generally focuses on efficiency over safety. For degens only. Reach out if you want to collaborate on an audit.

## 📄 License

GPL-3.0 - See [LICENSE](LICENSE) for details.

---

**Multicall Scripting** enables truly atomic multi-contract execution. Whether you're building complex DeFi strategies, NFT minting pipelines, or cross-protocol integrations, it provides the foundation for gas-efficient composability.

*Made with ❤️ by [0xdewy](https://github.com/0xdewy) *
