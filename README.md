# Multicall Scripting

Execute multiple contract calls atomically with return value chaining. Build complex DeFi strategies in a single transaction.

## Quick Start

```bash
git clone <repository-url>
cd multicall-scripting
cd js && npm install
cd .. && forge build
```

## JavaScript Examples with Return Value Chaining

### Basic Return Value Usage

```javascript
const { TransactionBuilder } = require("./js/index.js");
const { ERC20_ABI } = require("./abis.js");

const builder = new TransactionBuilder();

// Get token balance (returns descriptor)
const balance = builder.addCall(
  ERC20_ABI,
  tokenAddress,
  "balanceOf",
  [userAddress],
  0n
);

// Transfer exact balance using return value
builder.addCall(
  ERC20_ABI,
  tokenAddress,
  "transfer",
  [recipientAddress, balance], // balance descriptor used as input
  0n
);

const tx = builder.build();
await multicallScripter.execute(tx.targets, tx.offsets, tx.calldatas, tx.msgValues);
```

### Struct Return Values

```javascript
const { STRUCT_ABI } = require("./abis.js");

const builder = new TransactionBuilder();

// Function returns: { amount: uint256, recipient: address }
const swapResult = builder.addCall(
  STRUCT_ABI,
  swapContract,
  "executeSwap",
  [tokenIn, tokenOut, amountIn],
  0n
);

// Access struct fields from return value
builder.addCall(
  ERC20_ABI,
  tokenOut,
  "transfer",
  [swapResult.recipient, swapResult.amount], // Struct field descriptors
  0n
);

const tx = builder.build();
await multicallScripter.execute(tx.targets, tx.offsets, tx.calldatas, tx.msgValues);

```
## Solidity Interface (Forge Tests)

The Solidity `CallBuilder` system provides full return value chaining for testing complex strategies in foundry:

```solidity
// test/MyStrategy.t.sol - Use in Forge tests
import {CallBuilder, Scripter, VarLib} from "src/CallBuilder.sol";

contract MyStrategyTest is CallBuilder, Scripter {
    using VarLib for uint256;
    
    function testReturnValueChain() public {
        // Get balance
        uint256 balanceCall = call_static(
            token,
            abi.encodeCall(IERC20.balanceOf, (address(this)))
        );
        
        // Transfer exact balance using return value
        uint256 transferCall = call(
            token,
            abi.encodeCall(IERC20.transfer, (recipient, 0)), // 0 = placeholder
            0
        );
        
        // Chain: balance → transfer amount parameter
        useCallOutput(
            balanceCall.first(),          // balanceOf return value
            transferCall.second()// transfer amount param
        );
        
        // Build and execute
        (address[] memory targets, uint256[] memory offsets, 
         bytes[] memory calldatas, uint256[] memory values) = build();
        multicallScripter.execute(targets, offsets, calldatas, values);
    }
}
```

## Technical Details

### Return Value Types

`TransactionBuilder.addCall()` returns descriptors based on function signature:

| Return Type | JavaScript Return | Usage |
|-------------|-------------------|-------|
| `uint256` | Single descriptor | `balance` |
| `(uint256, address)` | Array `[desc1, desc2]` | `results[0]`, `results[1]` |
| `struct Person` | Struct proxy `{name, age}` | `person.name`, `person.age` |
| `uint256[]` | Array descriptor | `array.with_length(n)[i]` |

### Memory Offsets

The system uses precise memory offsets for return value chaining:

```javascript
// Static call stores return data at memory location
const call1 = builder.addCall(/* ... */); // Returns stored at offset 0x00

// Subsequent calls can reference this memory
const call2 = builder.addCall(/* ... */, [call1]); // Uses data from offset 0x00
```

### Constraints

- **Struct field descriptors** as function arguments may produce incorrect offsets
- **Complex nested chaining** has implementation limitations
- **Use literal values** for reliable argument passing
- **Solidity interface** provides more robust chaining for complex strategies

## API Reference

### `TransactionBuilder`

```javascript
class TransactionBuilder {
    // Add call, returns descriptor(s) for return values
    addCall(abi, target, functionName, args, msgValue = 0n): object | array
    
    // Build transaction for MulticallScripter.execute()
    build(): { targets, offsets, calldatas, msgValues }
}
```

### `CallBuilder` System (Solidity)

```solidity
// Core chaining mechanism
function useCallOutput(VarLib.Var memory returnData, VarLib.Var memory callParameter)

// Helper for common positions
function first(uint256 callIndex) returns (Var memory)  // First return value
function second(uint256 callIndex) returns (Var memory) // Second return value
function withMemRange(uint256 callIndex, uint256 start, uint256 length) returns (Var memory)
```

## Testing

```bash
# Run examples
cd js/examples
./run_anvil.sh
bun run univ2_router.js

# Run Solidity tests
forge test --match-test test_return_value_chaining
forge test --match-test test_js_interface
```

## Examples Directory

- `js/examples/univ2_router.js` - Direct Uniswap swap with return value usage
- `js/examples/multiple_swaps.js` - Multi-swap strategy
- `js/examples/weth_aave.js` - Aave integration
- `test/CallBuilder.t.sol` - Solidity return value chaining tests
