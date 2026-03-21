# Multicall Scripting

A library for building and executing complex multi-call transactions on Ethereum, with support for struct returns, dynamic types, and sophisticated DeFi strategies.

## Features

- **Multi-call Transaction Building**: Create complex batched transactions
- **Struct Return Support**: Handle struct returns as objects (property access, not arrays)
- **Dynamic Type Support**: Use dynamic types (arrays, bytes) as direct input
- **DeFi Strategy Examples**: Pre-built leveraged yield strategies
- **EIP-7702 Smart Wallet**: Authorization system with EIP-712 signatures
- **ERC-4337 Compatibility**: Entry point integration for account abstraction

## Quick Start

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd multicall-scripting

# Build contracts
forge build

# Run tests
forge test
```

### JavaScript Library

```javascript
const { TransactionBuilder } = require("./js/index.js");

const builder = new TransactionBuilder();

// Add calls to the transaction
builder.addCall(abi, contractAddress, functionName, args, value);

// Build the transaction
const transaction = builder.build();

// Returns: { targets, offsets, calldatas, msgValues }
```

## Examples

See the `js/examples/` directory for comprehensive DeFi strategy examples:

```bash
# Run a simple strategy demo
node js/examples/runStrategyDemo.js

# Test strategy components
node js/examples/testSimpleStrategy.js

# Run leveraged yield strategy
node js/examples/simpleLeverageExample.js
```

### Leveraged Yield Strategy

The library includes a 7-step leveraged yield strategy:
1. Wrap ETH → WETH
2. Supply WETH to Aave as collateral  
3. Borrow USDC against WETH
4. Swap USDC → WETH on Uniswap V3
5. Repeat leverage loops (2-3x)
6. Stake yield-bearing assets
7. Stake LP tokens for governance rewards

## EIP-7702 Smart Wallet

The `7702Caller.sol` contract provides:
- EIP-7702 authorization with EIP-712 signatures
- Multi-signer management
- Batch execution inheritance from `MulticallScripter`
- ERC-4337 entry point compatibility

See `README-7702CALLER.md` for details.

## Testing

```bash
# Run all tests (41 tests)
forge test

# Run specific test suites
forge test --match-test test_js_complex_structs
forge test --match-contract 7702Caller
```

## Foundry

**Foundry is a blazing fast, portable and modular toolkit for Ethereum application development written in Rust.**

Foundry consists of:

- **Forge**: Ethereum testing framework
- **Cast**: Swiss army knife for EVM interactions
- **Anvil**: Local Ethereum node
- **Chisel**: Solidity REPL

## Documentation

- Foundry: https://book.getfoundry.sh/
- Examples: `js/examples/README.md`
- 7702Caller: `README-7702CALLER.md`

## Usage

### Build

```shell
forge build
```

### Test

```shell
forge test
```

### Run Examples

```shell
node js/examples/runStrategyDemo.js
```
