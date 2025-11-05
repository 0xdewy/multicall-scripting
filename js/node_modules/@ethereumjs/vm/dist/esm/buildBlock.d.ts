import type { Block } from '@ethereumjs/block';
import type { TypedTransaction } from '@ethereumjs/tx';
import type { BuildBlockOpts, RunTxResult, SealBlockOpts } from './types.ts';
import type { VM } from './vm.ts';
export type BuildStatus = (typeof BuildStatus)[keyof typeof BuildStatus];
export declare const BuildStatus: {
    readonly Reverted: "reverted";
    readonly Build: "build";
    readonly Pending: "pending";
};
type BlockStatus = {
    status: typeof BuildStatus.Pending | typeof BuildStatus.Reverted;
} | {
    status: typeof BuildStatus.Build;
    block: Block;
};
export declare class BlockBuilder {
    /**
     * The cumulative gas used by the transactions added to the block.
     */
    gasUsed: bigint;
    /**
     *  The cumulative blob gas used by the blobs in a block
     */
    blobGasUsed: bigint;
    /**
     * Value of the block, represented by the final transaction fees
     * accruing to the miner.
     */
    private _minerValue;
    private readonly vm;
    private blockOpts;
    private headerData;
    private transactions;
    private transactionResults;
    private withdrawals?;
    private checkpointed;
    private blockStatus;
    get transactionReceipts(): import("./types.ts").TxReceipt[];
    get minerValue(): bigint;
    constructor(vm: VM, opts: BuildBlockOpts);
    /**
     * Throws if the block has already been built or reverted.
     */
    private checkStatus;
    getStatus(): BlockStatus;
    /**
     * Calculates and returns the transactionsTrie for the block.
     */
    transactionsTrie(): Promise<Uint8Array<ArrayBufferLike>>;
    /**
     * Calculates and returns the logs bloom for the block.
     */
    logsBloom(): Uint8Array<ArrayBufferLike>;
    /**
     * Calculates and returns the receiptTrie for the block.
     */
    receiptTrie(): Promise<Uint8Array<ArrayBufferLike>>;
    /**
     * Adds the block miner reward to the coinbase account.
     */
    private rewardMiner;
    /**
     * Adds the withdrawal amount to the withdrawal address
     */
    private processWithdrawals;
    /**
     * Run and add a transaction to the block being built.
     * Please note that this modifies the state of the VM.
     * Throws if the transaction's gasLimit is greater than
     * the remaining gas in the block.
     */
    addTransaction(tx: TypedTransaction, { skipHardForkValidation, allowNoBlobs, }?: {
        skipHardForkValidation?: boolean;
        allowNoBlobs?: boolean;
    }): Promise<RunTxResult>;
    /**
     * Reverts the checkpoint on the StateManager to reset the state from any transactions that have been run.
     */
    revert(): Promise<void>;
    /**
     * This method constructs the finalized block, including withdrawals and any CLRequests.
     * It also:
     *  - Assigns the reward for miner (PoW)
     *  - Commits the checkpoint on the StateManager
     *  - Sets the tip of the VM's blockchain to this block
     * For PoW, optionally seals the block with params `nonce` and `mixHash`,
     * which is validated along with the block number and difficulty by ethash.
     * For PoA, please pass `blockOption.cliqueSigner` into the buildBlock constructor,
     * as the signer will be awarded the txs amount spent on gas as they are added.
     *
     * Note: we add CLRequests here because they can be generated at any time during the
     * lifecycle of a pending block so need to be provided only when the block is finalized.
     */
    build(sealOpts?: SealBlockOpts): Promise<{
        block: Block;
        requests: import("@ethereumjs/util").CLRequest<import("@ethereumjs/util").CLRequestType>[] | undefined;
    }>;
    initState(): Promise<void>;
}
/**
 * Build a block on top of the current state
 * by adding one transaction at a time.
 *
 * Creates a checkpoint on the StateManager and modifies the state
 * as transactions are run. The checkpoint is committed on {@link BlockBuilder.build}
 * or discarded with {@link BlockBuilder.revert}.
 *
 * @param {VM} vm
 * @param {BuildBlockOpts} opts
 * @returns An instance of {@link BlockBuilder} with methods:
 * - {@link BlockBuilder.addTransaction}
 * - {@link BlockBuilder.build}
 * - {@link BlockBuilder.revert}
 */
export declare function buildBlock(vm: VM, opts: BuildBlockOpts): Promise<BlockBuilder>;
export {};
//# sourceMappingURL=buildBlock.d.ts.map