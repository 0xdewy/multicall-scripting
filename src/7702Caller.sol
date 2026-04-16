// SPDX-License-Identifier: GPL3
pragma solidity ^0.8.28;

import "./MulticallScripter.sol";

/**
 * @title 7702Caller
 * @dev A general smart wallet contract built with EIP-7702 in mind
 * Inherits from MulticallScripter for efficient batch execution
 * Implements features for account abstraction and gas management
 */
contract SevenSevenZeroTwoCaller is MulticallScripter {
    // EIP-7702 related constants and structures
    bytes32 public constant EIP7702_TYPEHASH =
        keccak256("EIP7702Authorization(address authority,uint256 nonce,uint256 expiry)");

    // Domain separator for EIP-712
    bytes32 public DOMAIN_SEPARATOR;

    // Struct for EIP-7702 authorization
    struct Authorization {
        address authority;
        uint256 nonce;
        uint256 expiry;
        bytes signature;
    }

    // Track nonces for replay protection
    mapping(address => uint256) public nonces;

    // Authorized signers for this wallet
    mapping(address => bool) public authorizedSigners;

    // Entry point for ERC-4337 compatibility
    address public entryPoint;

    // Events
    event SignerAdded(address indexed signer);
    event SignerRemoved(address indexed signer);
    event EntryPointUpdated(address indexed oldEntryPoint, address indexed newEntryPoint);
    event Executed(
        address indexed caller,
        address[] targets,
        uint256[] offsets,
        bytes[] calldatas,
        uint256[] values,
        bytes authorizationData
    );

    /**
     * @dev Constructor sets up the domain separator
     * @param _entryPoint The ERC-4337 entry point address
     */
    constructor(address _entryPoint) {
        entryPoint = _entryPoint;

        // Set up EIP-712 domain separator
        DOMAIN_SEPARATOR = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256("7702Caller"),
                keccak256("1"),
                block.chainid,
                address(this)
            )
        );

        // Owner is initially authorized
        authorizedSigners[msg.sender] = true;
        emit SignerAdded(msg.sender);
    }

    /**
     * @dev Modifier to check if caller is authorized
     */
    modifier onlyAuthorized() {
        require(authorizedSigners[msg.sender], "7702Caller: unauthorized");
        _;
    }

    /**
     * @dev Modifier to check if caller is entry point or authorized
     */
    modifier onlyEntryPointOrAuthorized() {
        require(msg.sender == entryPoint || authorizedSigners[msg.sender], "7702Caller: not entry point or authorized");
        _;
    }

    /**
     * @dev Add an authorized signer
     * @param signer Address to authorize
     */
    function addSigner(address signer) external onlyAuthorized {
        require(signer != address(0), "7702Caller: zero address");
        require(!authorizedSigners[signer], "7702Caller: already authorized");

        authorizedSigners[signer] = true;
        emit SignerAdded(signer);
    }

    /**
     * @dev Remove an authorized signer
     * @param signer Address to remove authorization from
     */
    function removeSigner(address signer) external onlyAuthorized {
        require(authorizedSigners[signer], "7702Caller: not authorized");
        require(signer != msg.sender, "7702Caller: cannot remove self");

        authorizedSigners[signer] = false;
        emit SignerRemoved(signer);
    }

    /**
     * @dev Update the entry point address
     * @param newEntryPoint New entry point address
     */
    function updateEntryPoint(address newEntryPoint) external onlyAuthorized {
        require(newEntryPoint != address(0), "7702Caller: zero address");

        address oldEntryPoint = entryPoint;
        entryPoint = newEntryPoint;
        emit EntryPointUpdated(oldEntryPoint, newEntryPoint);
    }

    /**
     * @dev Verify EIP-7702 authorization signature
     * @param authorization Authorization data
     * @return isValid Whether the authorization is valid
     */
    function verifyAuthorization(Authorization calldata authorization) public view returns (bool) {
        // Check expiry
        if (authorization.expiry < block.timestamp) {
            return false;
        }

        // Check nonce
        if (authorization.nonce != nonces[authorization.authority]) {
            return false;
        }

        // Recover signer
        bytes32 digest = keccak256(
            abi.encodePacked(
                "\x19\x01",
                DOMAIN_SEPARATOR,
                keccak256(
                    abi.encode(EIP7702_TYPEHASH, authorization.authority, authorization.nonce, authorization.expiry)
                )
            )
        );

        address recovered = recover(digest, authorization.signature);
        return recovered == authorization.authority && authorizedSigners[authorization.authority];
    }

    /**
     * @dev Execute a batch of calls with EIP-7702 authorization
     * @param targets Array of target addresses
     * @param offsets Array of encoded call parameters
     * @param calldatas Array of calldata for each call
     * @param values Array of msg.values for each call
     * @param authorization EIP-7702 authorization data
     */
    function executeWithAuthorization(
        address[] calldata targets,
        uint256[] calldata offsets,
        bytes[] calldata calldatas,
        uint256[] calldata values,
        Authorization calldata authorization
    ) external payable {
        // Verify authorization
        require(verifyAuthorization(authorization), "7702Caller: invalid authorization");

        // Increment nonce to prevent replay
        nonces[authorization.authority]++;

        // Execute the batch
        execute(targets, offsets, calldatas, values);

        emit Executed(authorization.authority, targets, offsets, calldatas, values, abi.encode(authorization));
    }

    /**
     * @dev Execute a batch of calls (override from MulticallScripter)
     * Only allowed for authorized callers or entry point
     */
    function execute(
        address[] calldata targets,
        uint256[] calldata offsets,
        bytes[] calldata calldatas,
        uint256[] calldata values
    ) public payable override onlyEntryPointOrAuthorized {
        // Emit event before execution for better gas tracking
        emit Executed(msg.sender, targets, offsets, calldatas, values, "");

        super.execute(targets, offsets, calldatas, values);
    }

    /**
     * @dev ERC-4337 validateUserOp function
     * @param userOp The user operation
     * @param userOpHash Hash of the user operation
     * @param missingAccountFunds Funds needed to be deposited
     * @return validationData Validation data
     */
    function validateUserOp(bytes calldata userOp, bytes32 userOpHash, uint256 missingAccountFunds)
        external
        returns (uint256 validationData)
    {
        require(msg.sender == entryPoint, "7702Caller: not entry point");

        // For simplicity, we accept all user ops from authorized signers
        // In production, you would verify signatures and implement proper validation

        if (missingAccountFunds > 0) {
            // Deposit missing funds to entry point
            (bool success,) = payable(entryPoint).call{value: missingAccountFunds}("");
            require(success, "7702Caller: failed to deposit");
        }

        return 0; // No aggregator, no validAfter/validUntil
    }

    /**
     * @dev Execute a batch from ERC-4337 entry point
     * @param targets Array of target addresses
     * @param offsets Array of encoded call parameters
     * @param calldatas Array of calldata for each call
     * @param values Array of msg.values for each call
     */
    function executeFromEntryPoint(
        address[] calldata targets,
        uint256[] calldata offsets,
        bytes[] calldata calldatas,
        uint256[] calldata values
    ) external payable {
        require(msg.sender == entryPoint, "7702Caller: not entry point");
        execute(targets, offsets, calldatas, values);
    }

    /**
     * @dev Receive function to accept ETH
     */
    receive() external payable {}

    /**
     * @dev Withdraw ETH from the wallet
     * @param to Address to send ETH to
     * @param amount Amount of ETH to withdraw
     */
    function withdrawETH(address payable to, uint256 amount) external onlyAuthorized {
        require(address(this).balance >= amount, "7702Caller: insufficient balance");
        to.transfer(amount);
    }

    /**
     * @dev Execute a single call (convenience function)
     * @param target Target address
     * @param value ETH value to send
     * @param data Calldata
     */
    function executeCall(address target, uint256 value, bytes calldata data)
        external
        onlyAuthorized
        returns (bytes memory)
    {
        (bool success, bytes memory result) = target.call{value: value}(data);
        require(success, "7702Caller: call failed");
        return result;
    }

    /**
     * @dev Execute a delegate call (for upgrading/logic contracts)
     * @param target Target address
     * @param data Calldata
     */
    function executeDelegateCall(address target, bytes calldata data) external onlyAuthorized returns (bytes memory) {
        (bool success, bytes memory result) = target.delegatecall(data);
        require(success, "7702Caller: delegatecall failed");
        return result;
    }

    /**
     * @dev Recover signer from signature
     * @param hash Message hash
     * @param signature Signature
     * @return recovered Recovered address
     */
    function recover(bytes32 hash, bytes memory signature) internal pure returns (address) {
        require(signature.length == 65, "7702Caller: invalid signature length");

        bytes32 r;
        bytes32 s;
        uint8 v;

        assembly {
            r := mload(add(signature, 32))
            s := mload(add(signature, 64))
            v := byte(0, mload(add(signature, 96)))
        }

        if (v < 27) {
            v += 27;
        }

        require(v == 27 || v == 28, "7702Caller: invalid signature v value");

        return ecrecover(hash, v, r, s);
    }

    /**
     * @dev Get the next nonce for an authority
     * @param authority The authority address
     * @return The next nonce
     */
    function getNextNonce(address authority) external view returns (uint256) {
        return nonces[authority];
    }

    /**
     * @dev Check if an address is authorized
     * @param signer Address to check
     * @return Whether the address is authorized
     */
    function isAuthorized(address signer) external view returns (bool) {
        return authorizedSigners[signer];
    }

    /**
     * @dev Get domain separator
     * @return The domain separator
     */
    function getDomainSeparator() external view returns (bytes32) {
        return DOMAIN_SEPARATOR;
    }
}
