# Multicall Scripting: Atomic Execution with Return Value Chaining

[![License: GPL3](https://img.shields.io/badge/License-GPL3-blue.svg)](LICENSE)
[![Solidity](https://img.shields.io/badge/Solidity-^0.8.28-363636?logo=solidity)](https://soliditylang.org/)
[![JavaScript](https://img.shields.io/badge/JavaScript-ES6+-F7DF1E?logo=javascript)](https://developer.mozilla.org/en-US/docs/Web/JavaScript)
[![Foundry](https://img.shields.io/badge/Built%20with-Foundry-FF6C37?logo=ethereum)](https://getfoundry.sh/)

**Execute complex multi-contract strategies in a single atomic transaction with full return value chaining between calls.**

## 🚀 The Problem: Beyond Basic Multicall

Regular multicall solutions (like Multicall3) only batch independent calls. They can't use return values from one call as inputs to another within the same transaction. This forces developers to either:

**Multicall Scripting solves this** by enabling true return value chaining within a single atomic execution.

## 🏗️ Technical Architecture

### How It Works: Memory-Based Return Value Chaining

Adds scripting to multicall by precalculating memory offsets offchain. The contract executes calls with return data automatically placed for future calls, enabling chaining with minimal overhead.

### Core Components

1. **`MulticallScripter.sol`**: Core contract that executes chained calls with memory copying
2. **`CallBuilder.sol`**: Solidity DSL for building chained calls in tests  
3. **`TransactionBuilder` (JavaScript)**: Type-safe builder for complex transactions
4. **Descriptors**: Proxy objects that represent future return values

### Offset Data Layout

The system uses compact 256-bit offset encoding to specify how return data should be handled:

#### Regular Calls (StaticCall and StateChangingCall)

| Bits | Field | Description |
|------|-------|-------------|
| 8 | `calltype` | `0xFF` for static call, `0xFE` for regular call |
| 120 | `memTarget/returnOffset` | Memory offset where return data should be stored |
| 120 | `resultLength/returnSize` | Size of return data to copy |

#### Partial Return Calls (`STATIC_CALL_PARTIAL_RETURN_FLAG = 0xFC`)

| Bits | Field | Description |
|------|-------|-------------|
| 8 | `calltype` | `0xFC` for static call with partial return |
| 8 | `valueIndex` | Index into values array for msg.value (0 if no value) |
| 120 | `memTargets` (40×3) | Array of 3 memory targets where variables should be copied |
| 48 | `resultLengths` (16×3) | Array of 3 lengths of variables to copy |
| 48 | `returnOffsets` (16×3) | Array of 3 offsets from beginning of return data |
| 16 | `returnDataSize` | Total length of return data (max 65535 bytes) |
| 8 | `num_vars` | Number of variable segments to use (0-3) |

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

Basic dynamic type support with length specification:

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

## ⚠️ Limitations & Considerations

### Technical Constraints

1. **Maximum 3 variables per call** due to 256-bit encoding space
2. **Dynamic types require length specification** via `.with_length()` before use
3. **No return data reuse** - each return value can only be used once
4. **Memory offset limits** - `memTargets` are 40-bit offsets, `resultLengths` and `returnOffsets` are 16-bit values
5. **Return data size limit** - `returnDataSize` supports up to 65535 bytes

### ⚠️ Security Warning
This repository has not been audited and prioritizes efficiency over safety. For experimental use only. Reach out if you want to collaborate on an audit.

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

Contributions are welcome!

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

## 📄 License

GPL-3.0 - See [LICENSE](LICENSE) for details.

---

**Multicall Scripting** enables truly atomic multi-contract execution. Whether you're building complex DeFi strategies, NFT minting pipelines, or cross-protocol integrations, it provides the foundation for gas-efficient composability.

*Made with ❤️ by [0xdewy](https://github.com/0xdewy) *
