# Multicall Scripting

A library for building and executing complex multi-call transactions on Ethereum, with support for struct returns, dynamic types, and sophisticated DeFi strategies.

## Features

- **Multi-call Transaction Building**: Create complex batched transactions
- **Struct Return Support**: Handle struct returns as objects (property access, not arrays)
- **Dynamic Type Support**: Use dynamic types (arrays, bytes) as direct input
- **DeFi Strategy Examples**: Pre-built leveraged yield strategies
- **EIP-7702 Smart Wallet**: Authorization system with EIP-712 signatures
- **ERC-4337 Compatibility**: Entry point integration for account abstraction
- **Dual Interface**: Build transactions in JavaScript or Solidity
- **Direct Contract Interaction**: Bypass routers, interact with core contracts directly

## Quick Start

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd multicall-scripting

# Install dependencies
npm install

# Build contracts
forge build

# Run tests
forge test
```

## Building Complex Transactions

MulticallScripting provides two ways to build complex transactions:

### 1. JavaScript Interface (`TransactionBuilder`)

Build transactions programmatically in JavaScript:

```javascript
const { TransactionBuilder } = require("./js/index.js");

const builder = new TransactionBuilder();

// Add individual calls
builder.addCall(abi, contractAddress, functionName, args, value);

// Build the complete transaction
const { targets, offsets, calldatas, msgValues } = builder.build();

// Execute via MulticallScripter
await multicallScripter.execute(targets, offsets, calldatas, msgValues);
```

### 2. Solidity Interface (`CallBuilder.sol` and `Scripter`)

Build transactions directly in Solidity using the integrated `CallBuilder` and `Scripter` system:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {CallBuilder, Scripter, VarLib} from "src/CallBuilder.sol";
import {MulticallScripter} from "src/MulticallScripter.sol";

contract MyStrategy is CallBuilder, Scripter {
    using VarLib for uint256;
    
    MulticallScripter public multicallScripter;
    
    function executeComplexStrategy() external payable {
        // Clear any previous calls
        delete calls;
        free_mem = 0;
        
        // 1. Call WETH.deposit() with msg.value
        uint256 depositCallIndex = call(address(weth), abi.encodeCall(IWETH.deposit, ()), msg.value);
        
        // 2. Static call to get WETH balance
        uint256 balanceCallIndex = call_static(address(weth), abi.encodeCall(IERC20.balanceOf, (address(this))));
        
        // 3. Use balance from previous call as input to transfer
        uint256 transferCallIndex = call(
            address(weth), 
            abi.encodeCall(IERC20.transfer, (msg.sender, 0)), // 0 will be replaced
            0
        );
        
        // Replace the 0 in transfer call with balance from balanceOf call
        useCallOutput(balanceCallIndex.first(), transferCallIndex.withMemRange(0x4, 0x20, 0x20));
        
        // Build the transaction
        (address[] memory targets, uint256[] memory offsets, bytes[] memory calldatas, uint256[] memory values) = 
            build();
        
        // Execute via MulticallScripter
        multicallScripter.execute{value: msg.value}(targets, offsets, calldatas, values);
    }
}
```

## Advanced Usage Examples

### Example 1: Direct Uniswap Swap (No Router)

```javascript
// Instead of: User → Router → Pair
// We do: User → MulticallScripter → Pair

const builder = new TransactionBuilder();

// 1. Wrap ETH to WETH
builder.addCall(WETH_ABI, WETH_ADDRESS, "deposit", [], parseEther("0.01"));

// 2. Transfer WETH to Uniswap pair directly
builder.addCall(ERC20_ABI, WETH_ADDRESS, "transfer", [PAIR_ADDRESS, parseEther("0.01")], 0n);

// 3. Call pair.swap() directly (bypassing router)
builder.addCall(PAIR_ABI, PAIR_ADDRESS, "swap", [0n, parseEther("15"), userAddress, "0x"], 0n);

// Execute atomically
const transaction = builder.build();
await multicallScripter.execute(...transaction);
```

### Example 2: Lido Staking + Uniswap Strategy

```javascript
// 5-step atomic strategy: ETH → stETH → wstETH → DAI
const builder = new TransactionBuilder();

// Step 1: Stake ETH with Lido
builder.addCall(LIDO_ABI, LIDO_ADDRESS, "submit", [ZERO_ADDRESS], parseEther("0.01"));

// Step 2: Approve stETH for wrapping
builder.addCall(ERC20_ABI, STETH_ADDRESS, "approve", [WSTETH_ADDRESS, parseEther("0.01")], 0n);

// Step 3: Wrap stETH → wstETH
builder.addCall(WSTETH_ABI, WSTETH_ADDRESS, "wrap", [parseEther("0.01")], 0n);

// Step 4: Approve wstETH for Uniswap
builder.addCall(ERC20_ABI, WSTETH_ADDRESS, "approve", [UNISWAP_ROUTER, parseEther("0.008")], 0n);

// Step 5: Swap wstETH → DAI
const path = [WSTETH_ADDRESS, WETH_ADDRESS, DAI_ADDRESS];
const deadline = Math.floor(Date.now() / 1000) + 1200;
builder.addCall(
    UNISWAP_ROUTER_ABI,
    UNISWAP_ROUTER,
    "swapExactTokensForTokens",
    [parseEther("0.008"), parseEther("5"), path, userAddress, deadline],
    0n
);

// All 5 steps execute atomically in one transaction
```

### Example 3: Solidity CallBuilder for Complex Strategies

```solidity
// ComplexStrategy.sol
contract ComplexStrategy is CallBuilder, Scripter {
    using VarLib for uint256;
    
    IWETH public constant WETH = IWETH(0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2);
    IERC20 public constant DAI = IERC20(0x6B175474E89094C44Da98b954EedeAC495271d0F);
    address public constant UNISWAP_PAIR = 0xA478c2975Ab1Ea89e8196811F51A7B7Ade33eB11;
    
    MulticallScripter public multicallScripter;
    
    function executeDirectSwap(uint256 ethAmount, uint256 minDaiOut) external payable {
        // Clear any previous calls
        delete calls;
        free_mem = 0;
        
        // 1. Wrap ETH (call with msg.value)
        uint256 depositCallIndex = call(address(WETH), abi.encodeCall(IWETH.deposit, ()), ethAmount);
        
        // 2. Get WETH balance after deposit
        uint256 balanceCallIndex = call_static(address(WETH), abi.encodeCall(IERC20.balanceOf, (address(this))));
        
        // 3. Transfer WETH to pair (using balance from previous call)
        uint256 transferCallIndex = call(
            address(WETH), 
            abi.encodeCall(IERC20.transfer, (UNISWAP_PAIR, 0)), // 0 will be replaced
            0
        );
        
        // 4. Direct swap (WETH → DAI)
        uint256 swapCallIndex = call(
            UNISWAP_PAIR,
            abi.encodeCall(IUniswapV2Pair.swap, (0, minDaiOut, msg.sender, "")),
            0
        );
        
        // Connect calls: use balance from balanceOf as input to transfer
        useCallOutput(balanceCallIndex.first(), transferCallIndex.withMemRange(0x4, 0x20, 0x20));
        
        // Build and execute
        (address[] memory targets, uint256[] memory offsets, bytes[] memory calldatas, uint256[] memory values) = 
            build();
        
        multicallScripter.execute{value: msg.value}(targets, offsets, calldatas, values);
    }
}
```

## Architecture: How It Works

### Traditional Approach
```
User → Router → Protocol A → Protocol B → Protocol C
      (each step is separate transaction)
```

### MulticallScripter Approach
```
User → MulticallScripter → [Protocol A → Protocol B → Protocol C]
                    (atomic execution with data flow)
```

### Key Innovation: Return Value Chaining
The system allows using return values from one call as inputs to subsequent calls, enabling complex dependency chains:

```solidity
// Call 1: Get balance
uint256 balance = IERC20(token).balanceOf(address(this));

// Call 2: Use balance as input (impossible in traditional multicall)
IERC20(token).transfer(recipient, balance);

// Both execute atomically in one transaction with MulticallScripter
```

### Key Benefits:
1. **Atomic Execution**: All steps succeed or fail together
2. **Return Value Chaining**: Use outputs as inputs in same transaction
3. **Gas Efficiency**: Single transaction, reduced overhead
4. **No Intermediate States**: No risk of partial execution
5. **Direct Contract Access**: Bypass routers, interact with core contracts
6. **Composable Strategies**: Combine any protocols in any order

## Comparison: Traditional vs MulticallScripter

| Feature | Traditional Multicall | MulticallScripter |
|---------|----------------------|-------------------|
| **Return Value Usage** | ❌ Not possible | ✅ Full support |
| **Atomic Execution** | ✅ Yes | ✅ Yes |
| **Gas Cost** | Medium | Optimized |
| **Complexity** | Simple calls only | Complex dependency chains |
| **Router Bypass** | ❌ Needs router | ✅ Direct contract access |
| **Error Handling** | All or nothing | All or nothing |
| **Use Case** | Simple batching | Complex DeFi strategies |

## Real-World Use Cases

### 1. **DeFi Strategy Execution**
- **Leveraged yield farming**: Deposit → Borrow → Swap → Repeat
- **Arbitrage opportunities**: Spot price differences across protocols
- **Portfolio rebalancing**: Multiple token swaps in one transaction
- **Liquidity provision strategies**: Add/remove liquidity across pools

### 2. **Return Value Dependent Operations**
- **Dynamic amount transfers**: Transfer exact balance after swap
- **Conditional execution**: Execute based on previous call results
- **Multi-step calculations**: Chain multiple calculations together
- **Oracle-dependent trades**: Use oracle price as input to trade

### 3. **MEV Protection**
- **Sandwich-resistant swaps**: Atomic execution prevents front-running
- **Batch auction execution**: Multiple trades in single block
- **Privacy-preserving trades**: Hide intermediate steps

### 4. **Protocol Integration**
- **Cross-protocol composability**: Lido → Aave → Uniswap in one tx
- **Custom routing logic**: Bypass standard routers
- **Gas-optimized execution paths**: Direct contract interactions

### 5. **Smart Wallet Operations**
- **Batch approvals and transfers**: Multiple tokens in one transaction
- **Account management**: Complex setup operations
- **Recovery operations**: Multi-step recovery procedures

## Examples Directory

### JavaScript Examples

```bash
# Simple Uniswap swap (using router)
bun run js/examples/uniswap_example.js

# Lido + Uniswap strategy (5-step atomic execution)
bun run js/examples/lido_uniswap.js

# Direct contract interaction (no router)
bun run js/examples/uniswap_direct.js

# Return value chaining concept
bun run js/examples/return_chaining.js

# Advanced struct handling and output chaining
bun run js/examples/advanced_structs.js

# Test Aave integration
bun run js/examples/test_aave.js
```

### Solidity Examples

See `js/examples/solidity_scripter_example.sol` for comprehensive Scripter usage:

```solidity
// Deploy and test
forge create js/examples/solidity_scripter_example.sol:ScripterDeployer

// Test specific strategies
cast send <deployed_address> "testBalanceTransfer(uint256)" 1000000000000000000 --value 1ether
cast send <deployed_address> "testDirectSwap(uint256,uint256)" 1000000000000000000 1500000000000000000000 --value 1ether
```

## Advanced Features

### 1. Struct Handling in JavaScript

The JavaScript `TransactionBuilder` provides type-safe struct field access:

```javascript
// Call returns a struct: { a: uint256, nested: { nA: uint256, nB: uint256 } }
const structResult = builder.addCall(STRUCT_ABI, contractAddress, "getComplexStruct", [], 0n);

// Access nested struct fields
builder.addCall(
    OTHER_ABI, 
    otherAddress, 
    "someFunction", 
    [
        structResult.a,           // Top-level field
        structResult.nested.nA,   // Nested struct field
        structResult.nested.nB    // Nested struct field
    ], 
    0n
);
```

### 2. Scripter Return Value Chaining in Solidity

The key innovation that makes MulticallScripter unique:

```solidity
// Step 1: Get balance (static call returns value)
uint256 balanceCallIndex = scripter.call_static(
    token,
    abi.encodeCall(IERC20.balanceOf, (address(this)))
);

// Step 2: Transfer exact balance (uses return value as input)
uint256 transferCallIndex = scripter.call(
    token,
    abi.encodeCall(IERC20.transfer, (recipient, 0)), // 0 will be replaced
    0
);

// 🔥 Connect calls: Use balance from call 1 as input to call 2
scripter.useCallOutput(
    balanceCallIndex.first(),          // Return data from balanceOf
    transferCallIndex.withMemRange(0x4, 0x20, 0x20) // Second param of transfer
);
```

### 3. Multiple Return Value Extraction

Extract multiple values from a single call:

```solidity
// getReserves() returns (reserve0, reserve1, blockTimestampLast)
uint256 reservesCallIndex = scripter.call_static(
    pair,
    abi.encodeCall(IUniswapV2Pair.getReserves, ())
);

// Use first return value
scripter.useCallOutput(
    reservesCallIndex.first(),    // reserve0
    someCall.withMemRange(...)
);

// Use second return value  
scripter.useCallOutput(
    reservesCallIndex.second(),   // reserve1
    anotherCall.withMemRange(...)
);
```

## API Reference

### JavaScript `TransactionBuilder`

```javascript
class TransactionBuilder {
    // Add a call to the transaction, returns struct/object for return value access
    addCall(abi: any[], target: string, functionName: string, args: any[], value: bigint): object
    
    // Build the complete transaction
    build(): {
        targets: string[]
        offsets: bigint[]
        calldatas: string[]
        msgValues: bigint[]
    }
    
    // Clear all calls
    clear(): void
    
    // Get number of calls
    getCallCount(): number
}
```

### Solidity `CallBuilder` and `Scripter` System

The system consists of three main components:

1. **`CallBuilder`** - Core building functions
2. **`Scripter`** - Call management and dependency resolution  
3. **`VarLib`** - Variable handling for return data

```solidity
// Core building functions
contract CallBuilder {
    // Create a static call with return data storage
    function staticCall(uint256 memTarget, uint256 resultLength) internal pure returns (uint256 offsets)
    
    // Create a state-changing call
    function stateChangingCall() internal pure returns (uint256)
    function stateChangingCall(uint256 msgValueIndex) internal pure returns (uint256)
    function stateChangingCall(uint256 msgValueIndex, uint256 memTarget, uint256 resultLength) internal pure returns (uint256)
}

// Call management
contract Scripter is CallBuilder {
    using VarLib for uint256;
    
    // Add a call with msg.value
    function call(address target, bytes memory callData, uint256 value) external returns (uint256 callIndex)
    
    // Add a static call (no msg.value)
    function call_static(address target, bytes memory callData) external returns (uint256 callIndex)
    
    // Connect calls: use output from one call as input to another
    function useCallOutput(VarLib.Var memory returnData, VarLib.Var memory callParameter) public
    
    // Build the complete transaction
    function build() external returns (
        address[] memory targets,
        uint256[] memory offsets,
        bytes[] memory datas,
        uint256[] memory values
    )
}

// Variable handling
library VarLib {
    struct Var {
        uint256 callIndex;
        uint256 start;
        uint256 length;
    }
    
    // Helper functions for common positions
    function first(uint256 callIndex) internal pure returns (Var memory)
    function second(uint256 callIndex) internal pure returns (Var memory)
    function third(uint256 callIndex) internal pure returns (Var memory)
    function withMemRange(uint256 callIndex, uint256 _start, uint256 _length) internal pure returns (Var memory)
}
```

## Testing

```bash
# Run all tests
forge test

# Run JavaScript interface tests
forge test --match-test test_js_complex_structs

# Run CallBuilder tests
forge test --match-test test_CallBuilder

# Run integration tests
forge test --match-test test_integration
```

## Development

### Project Structure
```
multicall-scripting/
├── src/                    # Solidity contracts
│   ├── MulticallScripter.sol  # Core multicall executor
│   ├── CallBuilder.sol        # Solidity transaction builder
│   ├── Scripter.sol           # Call management system
│   └── 7702Caller.sol         # EIP-7702 smart wallet
├── js/                     # JavaScript library
│   ├── index.js           # TransactionBuilder class
│   ├── examples/          # Working examples
│   │   ├── uniswap_example.js    # Simple router-based swap
│   │   ├── lido_uniswap.js       # Complex multi-protocol strategy
│   │   ├── uniswap_direct.js     # Direct contract interaction
│   │   └── abis.js              # Protocol ABIs and addresses
│   └── test/              # JavaScript tests
├── test/                  # Solidity tests
│   ├── MulticallScripter.t.sol
│   ├── CallBuilder.t.sol
│   └── JsLibrary.t.sol
└── script/               # Deployment scripts
```

### Adding New Protocols

1. **Add ABIs** to `js/examples/abis.js`
2. **Create example scripts** in `js/examples/`
3. **Write integration tests** in `test/`
4. **Update documentation** with new examples

## Troubleshooting

### Common Issues

1. **Transaction fails with "ReserveInactive"**
   - Issue: Aave/Morpho reserves not initialized on fork
   - Solution: Use Uniswap examples or different RPC endpoint

2. **Nonce too low errors**
   - Issue: Multiple transactions from same account
   - Solution: Kill existing Anvil processes: `pkill -f "anvil"`

3. **Script hangs on execution**
   - Issue: RPC connection or contract deployment issues
   - Solution: Check Anvil is running: `curl http://localhost:8545`

4. **Return value chaining not working**
   - Issue: Incorrect memory offsets or lengths
   - Solution: Use `VarLib` helpers (`first()`, `second()`, `third()`)

### Testing Tips

```bash
# Start fresh Anvil instance
pkill -f "anvil"
anvil --port 8545 --fork-url https://eth.drpc.org

# Run examples in separate terminal
bun run js/examples/uniswap_example.js

# Debug transaction failures
cast run <tx_hash> --rpc-url http://localhost:8545
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Add tests for new functionality
4. Submit a pull request

## License

MIT
