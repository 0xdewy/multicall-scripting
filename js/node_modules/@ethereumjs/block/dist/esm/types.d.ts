import type { Common, ParamsDict } from '@ethereumjs/common';
import type { JSONRPCTx, JSONTx, TransactionType, TxData } from '@ethereumjs/tx';
import type { AddressLike, BigIntLike, BytesLike, JSONRPCWithdrawal, NumericString, PrefixedHexString, VerkleExecutionWitness, WithdrawalBytes, WithdrawalData } from '@ethereumjs/util';
import type { BlockHeader } from './index.ts';
/**
 * An object to set to which blockchain the blocks and their headers belong. This could be specified
 * using a {@link Common} object, or `chain` and `hardfork`. Defaults to mainnet without specifying a
 * hardfork.
 */
export interface BlockOptions {
    /**
     * A {@link Common} object defining the chain and the hardfork a block/block header belongs to.
     *
     * Object will be internally copied so that tx behavior don't incidentally
     * change on future HF changes.
     *
     * Default: {@link Common} object set to `mainnet` and the HF currently defined as the default
     * hardfork in the {@link Common} class.
     *
     * Current default hardfork: `merge`
     */
    common?: Common;
    /**
     * Set the hardfork either by timestamp (for HFs from Shanghai onwards) or by block number
     * for older Hfs.
     *
     * Default: `false` (HF is set to whatever default HF is set by the {@link Common} instance)
     */
    setHardfork?: boolean;
    /**
     * Block parameters sorted by EIP can be found in the exported `paramsBlock` dictionary,
     * which is internally passed to the associated `@ethereumjs/common` instance which
     * manages parameter selection based on the hardfork and EIP settings.
     *
     * This option allows providing a custom set of parameters. Note that parameters
     * get fully overwritten, so you need to extend the default parameter dict
     * to provide the full parameter set.
     *
     * It is recommended to deep-clone the params object for this to avoid side effects:
     *
     * ```ts
     * const params = JSON.parse(JSON.stringify(paramsBlock))
     * params['1']['minGasLimit'] = 3000 // 5000
     * ```
     */
    params?: ParamsDict;
    /**
     * If a preceding {@link BlockHeader} (usually the parent header) is given the preceding
     * header will be used to calculate the difficulty for this block and the calculated
     * difficulty takes precedence over a provided static `difficulty` value.
     *
     * Note that this option has no effect on networks other than PoW/Ethash networks
     * (respectively also deactivates on the Merge HF switching to PoS/Casper).
     */
    calcDifficultyFromHeader?: BlockHeader;
    /**
     * A block object by default gets frozen along initialization. This gives you
     * strong additional security guarantees on the consistency of the block parameters.
     * It also enables block hash caching when the `hash()` method is called multiple times.
     *
     * If you need to deactivate the block freeze - e.g. because you want to subclass block and
     * add additional properties - it is strongly encouraged that you do the freeze yourself
     * within your code instead.
     *
     * Default: true
     */
    freeze?: boolean;
    /**
     *  Skip consensus format validation checks on header if set. Defaults to false.
     */
    skipConsensusFormatValidation?: boolean;
    executionWitness?: VerkleExecutionWitness;
}
/**
 * A block header's data.
 */
export interface HeaderData {
    parentHash?: BytesLike;
    uncleHash?: BytesLike;
    coinbase?: AddressLike;
    stateRoot?: BytesLike;
    transactionsTrie?: BytesLike;
    receiptTrie?: BytesLike;
    logsBloom?: BytesLike;
    difficulty?: BigIntLike;
    number?: BigIntLike;
    gasLimit?: BigIntLike;
    gasUsed?: BigIntLike;
    timestamp?: BigIntLike;
    extraData?: BytesLike;
    mixHash?: BytesLike;
    nonce?: BytesLike;
    baseFeePerGas?: BigIntLike;
    withdrawalsRoot?: BytesLike;
    blobGasUsed?: BigIntLike;
    excessBlobGas?: BigIntLike;
    parentBeaconBlockRoot?: BytesLike;
    requestsHash?: BytesLike;
}
/**
 * A block's data.
 */
export interface BlockData {
    /**
     * Header data for the block
     */
    header?: HeaderData;
    transactions?: Array<TxData[TransactionType]>;
    uncleHeaders?: Array<HeaderData>;
    withdrawals?: Array<WithdrawalData>;
    /**
     * EIP-6800: Verkle Proof Data (experimental)
     */
    executionWitness?: VerkleExecutionWitness | null;
}
export type WithdrawalsBytes = WithdrawalBytes[];
export type ExecutionWitnessBytes = Uint8Array;
export type BlockBytes = [BlockHeaderBytes, TransactionsBytes, UncleHeadersBytes] | [BlockHeaderBytes, TransactionsBytes, UncleHeadersBytes, WithdrawalsBytes] | [
    BlockHeaderBytes,
    TransactionsBytes,
    UncleHeadersBytes,
    WithdrawalsBytes,
    ExecutionWitnessBytes
];
/**
 * BlockHeaderBuffer is a Buffer array, except for the Verkle PreState which is an array of prestate arrays.
 */
export type BlockHeaderBytes = Uint8Array[];
export type BlockBodyBytes = [TransactionsBytes, UncleHeadersBytes, WithdrawalsBytes?];
/**
 * TransactionsBytes can be an array of serialized txs for Typed Transactions or an array of Uint8Array Arrays for legacy transactions.
 */
export type TransactionsBytes = Uint8Array[][] | Uint8Array[];
export type UncleHeadersBytes = Uint8Array[][];
/**
 * An object with the block's data represented as strings.
 */
export interface JSONBlock {
    /**
     * Header data for the block
     */
    header?: JSONHeader;
    transactions?: JSONTx[];
    uncleHeaders?: JSONHeader[];
    withdrawals?: JSONRPCWithdrawal[];
    executionWitness?: VerkleExecutionWitness | null;
}
/**
 * An object with the block header's data represented as 0x-prefixed hex strings.
 */
export interface JSONHeader {
    parentHash?: PrefixedHexString;
    uncleHash?: PrefixedHexString;
    coinbase?: PrefixedHexString;
    stateRoot?: PrefixedHexString;
    transactionsTrie?: PrefixedHexString;
    receiptTrie?: PrefixedHexString;
    logsBloom?: PrefixedHexString;
    difficulty?: PrefixedHexString;
    number?: PrefixedHexString;
    gasLimit?: PrefixedHexString;
    gasUsed?: PrefixedHexString;
    timestamp?: PrefixedHexString;
    extraData?: PrefixedHexString;
    mixHash?: PrefixedHexString;
    nonce?: PrefixedHexString;
    baseFeePerGas?: PrefixedHexString;
    withdrawalsRoot?: PrefixedHexString;
    blobGasUsed?: PrefixedHexString;
    excessBlobGas?: PrefixedHexString;
    parentBeaconBlockRoot?: PrefixedHexString;
    requestsHash?: PrefixedHexString;
}
export interface JSONRPCBlock {
    number: PrefixedHexString;
    hash: PrefixedHexString;
    parentHash: PrefixedHexString;
    mixHash?: PrefixedHexString;
    nonce: PrefixedHexString;
    sha3Uncles: PrefixedHexString;
    logsBloom: PrefixedHexString;
    transactionsRoot: PrefixedHexString;
    stateRoot: PrefixedHexString;
    receiptsRoot: PrefixedHexString;
    miner: PrefixedHexString;
    difficulty: PrefixedHexString | NumericString;
    totalDifficulty?: PrefixedHexString;
    extraData: PrefixedHexString;
    size: PrefixedHexString;
    gasLimit: PrefixedHexString;
    gasUsed: PrefixedHexString;
    timestamp: PrefixedHexString;
    transactions: Array<JSONRPCTx | PrefixedHexString>;
    uncles: PrefixedHexString[];
    baseFeePerGas?: PrefixedHexString;
    withdrawals?: Array<JSONRPCWithdrawal>;
    withdrawalsRoot?: PrefixedHexString;
    blobGasUsed?: PrefixedHexString;
    excessBlobGas?: PrefixedHexString;
    parentBeaconBlockRoot?: PrefixedHexString;
    executionWitness?: VerkleExecutionWitness | null;
    requestsHash?: PrefixedHexString;
}
export type WithdrawalV1 = {
    index: PrefixedHexString;
    validatorIndex: PrefixedHexString;
    address: PrefixedHexString;
    amount: PrefixedHexString;
};
export type ExecutionPayload = {
    parentHash: PrefixedHexString;
    feeRecipient: PrefixedHexString;
    stateRoot: PrefixedHexString;
    receiptsRoot: PrefixedHexString;
    logsBloom: PrefixedHexString;
    prevRandao: PrefixedHexString;
    blockNumber: PrefixedHexString;
    gasLimit: PrefixedHexString;
    gasUsed: PrefixedHexString;
    timestamp: PrefixedHexString;
    extraData: PrefixedHexString;
    baseFeePerGas: PrefixedHexString;
    blockHash: PrefixedHexString;
    transactions: PrefixedHexString[];
    withdrawals?: WithdrawalV1[];
    blobGasUsed?: PrefixedHexString;
    excessBlobGas?: PrefixedHexString;
    parentBeaconBlockRoot?: PrefixedHexString;
    requestsHash?: PrefixedHexString;
    executionWitness?: VerkleExecutionWitness | null;
};
//# sourceMappingURL=types.d.ts.map