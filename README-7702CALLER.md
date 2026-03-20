# 7702Caller: EIP-7702 Smart Wallet

`7702Caller` is a general smart wallet contract built with EIP-7702 in mind, inheriting from `MulticallScripter` for efficient batch execution.

## Features

### 1. **EIP-7702 Authorization**
- Supports EIP-712 signed authorizations for transaction execution
- Replay protection with nonces per authority
- Expiry timestamps for authorizations

### 2. **ERC-4337 Compatibility**
- Entry point integration for ERC-4337 account abstraction
- `validateUserOp` function for user operation validation
- Gas management and deposit handling

### 3. **Multi-signer Support**
- Multiple authorized signers can execute transactions
- Dynamic signer management (add/remove)
- Owner-controlled authorization

### 4. **Batch Execution**
- Inherits `MulticallScripter`'s efficient batch execution
- Supports return data usage between calls
- Static calls, regular calls, and partial return data handling

### 5. **Security Features**
- Signature verification for EIP-7702 authorizations
- Replay protection
- Authorization expiry
- Entry point validation

## Contract Interface

### Core Functions

```solidity
// Execute with EIP-7702 authorization
function executeWithAuthorization(
    address[] calldata targets,
    uint256[] calldata offsets,
    bytes[] calldatas,
    uint256[] calldata values,
    Authorization calldata authorization
) external payable

// Regular batch execution (authorized callers only)
function execute(
    address[] calldata targets,
    uint256[] calldata offsets,
    bytes[] calldatas,
    uint256[] calldata values
) public payable override onlyEntryPointOrAuthorized

// Single call convenience function
function executeCall(
    address target,
    uint256 value,
    bytes calldata data
) external onlyAuthorized returns (bytes memory)

// ERC-4337 user operation validation
function validateUserOp(
    bytes calldata userOp,
    bytes32 userOpHash,
    uint256 missingAccountFunds
) external returns (uint256 validationData)
```

### Authorization Management

```solidity
// Add/remove authorized signers
function addSigner(address signer) external onlyAuthorized
function removeSigner(address signer) external onlyAuthorized

// Check authorization status
function isAuthorized(address signer) external view returns (bool)

// Get next nonce for an authority
function getNextNonce(address authority) external view returns (uint256)
```

## Usage Examples

### 1. Deploying the Contract

```solidity
// Deploy with an ERC-4337 entry point
address entryPoint = 0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789; // Mainnet entry point
SevenSevenZeroTwoCaller wallet = new SevenSevenZeroTwoCaller(entryPoint);
```

### 2. Adding Authorized Signers

```solidity
// Owner adds additional signers
wallet.addSigner(0x123...);
wallet.addSigner(0x456...);
```

### 3. Executing a Batch with Authorization

```javascript
// JavaScript example using the TransactionBuilder
const { TransactionBuilder } = require("./js/index.js");

const builder = new TransactionBuilder();

// Create a batch of calls
builder.addCall(abi, target1, "function1", [arg1], 0);
builder.addCall(abi, target2, "function2", [arg2], 0);

const { targets, offsets, calldatas, values } = builder.build();

// In a real scenario, you would:
// 1. Create EIP-712 signature for the authorization
// 2. Call executeWithAuthorization with the signature
```

### 4. ERC-4337 Integration

```solidity
// The contract can be used as an ERC-4337 smart account
// User operations are validated through the entry point
// Batch executions can be sponsored by paymasters
```

## EIP-7702 Authorization Flow

1. **User creates authorization**:
   - Specifies authority address, nonce, expiry
   - Signs EIP-712 structured data

2. **Authorization verification**:
   - Contract checks signature validity
   - Verifies nonce and expiry
   - Ensures authority is authorized

3. **Transaction execution**:
   - Batch is executed atomically
   - Nonce is incremented (replay protection)
   - Events are emitted for tracking

## Security Considerations

### 1. **Signer Management**
- Only authorized signers can add/remove other signers
- Signers cannot remove themselves (requires another signer)
- Regular review of authorized signers recommended

### 2. **Authorization Expiry**
- Authorizations have expiry timestamps
- Prevents stale authorizations from being used
- Recommended to use short expiry periods for sensitive operations

### 3. **Nonce Management**
- Each authority has its own nonce sequence
- Nonces increment after each authorization use
- Prevents replay attacks across different authorities

### 4. **Entry Point Security**
- Only the designated entry point can call `validateUserOp`
- Entry point can be updated by authorized signers
- Use trusted, audited entry point implementations

## Integration with JavaScript Library

The `7702Caller` works seamlessly with the existing JavaScript library:

```javascript
// Building transactions for 7702Caller
const builder = new TransactionBuilder();

// The library handles:
// - Struct/tuple return value access
// - Return data usage between calls  
// - Proper offset encoding for MulticallScripter
// - Complex transaction construction

// Example: Using return values in subsequent calls
const retStruct = builder.addCall(abi, target, "getStruct", [], 0);
builder.addCall(abi, target2, "useValue", [retStruct.field], 0);
```

## Testing

The contract includes comprehensive tests:

```bash
# Run 7702Caller tests
forge test --match-contract SevenSevenZeroTwoCallerTest

# Run all tests
forge test
```

## Deployment

1. **Compile the contract**:
   ```bash
   forge compile
   ```

2. **Deploy with constructor arguments**:
   ```solidity
   // Need an ERC-4337 entry point address
   constructor(address _entryPoint)
   ```

3. **Initialize**:
   - Add authorized signers
   - Fund the contract if needed
   - Configure entry point if using ERC-4337

## Gas Optimization

The contract inherits `MulticallScripter`'s gas-efficient batch execution:
- Single transaction for multiple calls
- Minimal overhead for batch processing
- Assembly-optimized execution loop
- Memory-efficient calldata handling

## Future Extensions

Potential enhancements:
1. **Social recovery** - Allow signer recovery through social consensus
2. **Spending limits** - Per-signer or per-transaction limits
3. **Time locks** - Delay sensitive operations
4. **Module system** - Plug-in functionality through delegate calls
5. **Cross-chain** - Support for cross-chain authorizations

## References

- [EIP-7702: Account Abstraction with Externally Owned Accounts](https://eips.ethereum.org/EIPS/eip-7702)
- [ERC-4337: Account Abstraction Using Alt Mempool](https://eips.ethereum.org/EIPS/eip-4337)
- [MulticallScripter Documentation](./README.md)
- [JavaScript Library Documentation](./js/README.md)