"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BlockBuilder = exports.BuildStatus = void 0;
exports.buildBlock = buildBlock;
const block_1 = require("@ethereumjs/block");
const common_1 = require("@ethereumjs/common");
const mpt_1 = require("@ethereumjs/mpt");
const rlp_1 = require("@ethereumjs/rlp");
const tx_1 = require("@ethereumjs/tx");
const util_1 = require("@ethereumjs/util");
const sha256_js_1 = require("ethereum-cryptography/sha256.js");
const index_ts_1 = require("./bloom/index.js");
const index_ts_2 = require("./index.js");
const requests_ts_1 = require("./requests.js");
const runBlock_ts_1 = require("./runBlock.js");
exports.BuildStatus = {
    Reverted: 'reverted',
    Build: 'build',
    Pending: 'pending',
};
class BlockBuilder {
    get transactionReceipts() {
        return this.transactionResults.map((result) => result.receipt);
    }
    get minerValue() {
        return this._minerValue;
    }
    constructor(vm, opts) {
        /**
         * The cumulative gas used by the transactions added to the block.
         */
        this.gasUsed = util_1.BIGINT_0;
        /**
         *  The cumulative blob gas used by the blobs in a block
         */
        this.blobGasUsed = util_1.BIGINT_0;
        /**
         * Value of the block, represented by the final transaction fees
         * accruing to the miner.
         */
        this._minerValue = util_1.BIGINT_0;
        this.transactions = [];
        this.transactionResults = [];
        this.checkpointed = false;
        this.blockStatus = { status: exports.BuildStatus.Pending };
        this.vm = vm;
        this.blockOpts = { putBlockIntoBlockchain: true, ...opts.blockOpts, common: this.vm.common };
        this.headerData = {
            ...opts.headerData,
            parentHash: opts.headerData?.parentHash ?? opts.parentBlock.hash(),
            number: opts.headerData?.number ?? opts.parentBlock.header.number + util_1.BIGINT_1,
            gasLimit: opts.headerData?.gasLimit ?? opts.parentBlock.header.gasLimit,
            timestamp: opts.headerData?.timestamp ?? Math.round(Date.now() / 1000),
        };
        this.withdrawals = opts.withdrawals?.map(util_1.createWithdrawal);
        if (this.vm.common.isActivatedEIP(1559) &&
            typeof this.headerData.baseFeePerGas === 'undefined') {
            if (this.headerData.number === vm.common.hardforkBlock(common_1.Hardfork.London)) {
                this.headerData.baseFeePerGas = vm.common.param('initialBaseFee');
            }
            else {
                this.headerData.baseFeePerGas = opts.parentBlock.header.calcNextBaseFee();
            }
        }
        if (typeof this.headerData.gasLimit === 'undefined') {
            if (this.headerData.number === vm.common.hardforkBlock(common_1.Hardfork.London)) {
                this.headerData.gasLimit = opts.parentBlock.header.gasLimit * util_1.BIGINT_2;
            }
            else {
                this.headerData.gasLimit = opts.parentBlock.header.gasLimit;
            }
        }
        if (this.vm.common.isActivatedEIP(4844) &&
            typeof this.headerData.excessBlobGas === 'undefined') {
            this.headerData.excessBlobGas = opts.parentBlock.header.calcNextExcessBlobGas(this.vm.common);
        }
    }
    /**
     * Throws if the block has already been built or reverted.
     */
    checkStatus() {
        if (this.blockStatus.status === exports.BuildStatus.Build) {
            throw (0, util_1.EthereumJSErrorWithoutCode)('Block has already been built');
        }
        if (this.blockStatus.status === exports.BuildStatus.Reverted) {
            throw (0, util_1.EthereumJSErrorWithoutCode)('State has already been reverted');
        }
    }
    getStatus() {
        return this.blockStatus;
    }
    /**
     * Calculates and returns the transactionsTrie for the block.
     */
    async transactionsTrie() {
        return (0, block_1.genTransactionsTrieRoot)(this.transactions, new mpt_1.MerklePatriciaTrie({ common: this.vm.common }));
    }
    /**
     * Calculates and returns the logs bloom for the block.
     */
    logsBloom() {
        const bloom = new index_ts_1.Bloom(undefined, this.vm.common);
        for (const txResult of this.transactionResults) {
            // Combine blooms via bitwise OR
            bloom.or(txResult.bloom);
        }
        return bloom.bitvector;
    }
    /**
     * Calculates and returns the receiptTrie for the block.
     */
    async receiptTrie() {
        if (this.transactionResults.length === 0) {
            return util_1.KECCAK256_RLP;
        }
        const receiptTrie = new mpt_1.MerklePatriciaTrie({ common: this.vm.common });
        for (const [i, txResult] of this.transactionResults.entries()) {
            const tx = this.transactions[i];
            const encodedReceipt = (0, runBlock_ts_1.encodeReceipt)(txResult.receipt, tx.type);
            await receiptTrie.put(rlp_1.RLP.encode(i), encodedReceipt);
        }
        return receiptTrie.root();
    }
    /**
     * Adds the block miner reward to the coinbase account.
     */
    async rewardMiner() {
        const minerReward = this.vm.common.param('minerReward');
        const reward = (0, runBlock_ts_1.calculateMinerReward)(minerReward, 0);
        const coinbase = this.headerData.coinbase !== undefined
            ? new util_1.Address((0, util_1.toBytes)(this.headerData.coinbase))
            : (0, util_1.createZeroAddress)();
        await (0, runBlock_ts_1.rewardAccount)(this.vm.evm, coinbase, reward, this.vm.common);
    }
    /**
     * Adds the withdrawal amount to the withdrawal address
     */
    async processWithdrawals() {
        for (const withdrawal of this.withdrawals ?? []) {
            const { address, amount } = withdrawal;
            // If there is no amount to add, skip touching the account
            // as per the implementation of other clients geth/nethermind
            // although this should never happen as no withdrawals with 0
            // amount should ever land up here.
            if (amount === 0n)
                continue;
            // Withdrawal amount is represented in Gwei so needs to be
            // converted to wei
            await (0, runBlock_ts_1.rewardAccount)(this.vm.evm, address, amount * util_1.GWEI_TO_WEI, this.vm.common);
        }
    }
    /**
     * Run and add a transaction to the block being built.
     * Please note that this modifies the state of the VM.
     * Throws if the transaction's gasLimit is greater than
     * the remaining gas in the block.
     */
    async addTransaction(tx, { skipHardForkValidation, allowNoBlobs, } = {}) {
        this.checkStatus();
        if (!this.checkpointed) {
            await this.vm.evm.journal.checkpoint();
            this.checkpointed = true;
        }
        // According to the Yellow Paper, a transaction's gas limit
        // cannot be greater than the remaining gas in the block
        const blockGasLimit = (0, util_1.toType)(this.headerData.gasLimit, util_1.TypeOutput.BigInt);
        const blobGasLimit = this.vm.common.param('maxBlobGasPerBlock');
        const blobGasPerBlob = this.vm.common.param('blobGasPerBlob');
        const blockGasRemaining = blockGasLimit - this.gasUsed;
        if (tx.gasLimit > blockGasRemaining) {
            throw (0, util_1.EthereumJSErrorWithoutCode)('tx has a higher gas limit than the remaining gas in the block');
        }
        let blobGasUsed = undefined;
        if (tx instanceof tx_1.Blob4844Tx) {
            if (this.blockOpts.common?.isActivatedEIP(4844) === false) {
                throw Error('eip4844 not activated yet for adding a blob transaction');
            }
            const blobTx = tx;
            // Guard against the case if a tx came into the pool without blobs i.e. network wrapper payload
            if (blobTx.blobs === undefined) {
                // TODO: verify if we want this, do we want to allow the block builder to accept blob txs without the actual blobs?
                // (these must have at least one `blobVersionedHashes`, this is verified at tx-level)
                if (allowNoBlobs !== true) {
                    throw (0, util_1.EthereumJSErrorWithoutCode)('blobs missing for 4844 transaction');
                }
            }
            if (this.blobGasUsed + BigInt(blobTx.numBlobs()) * blobGasPerBlob > blobGasLimit) {
                throw (0, util_1.EthereumJSErrorWithoutCode)('block blob gas limit reached');
            }
            blobGasUsed = this.blobGasUsed;
        }
        const header = {
            ...this.headerData,
            gasUsed: this.gasUsed,
            // correct excessBlobGas should already part of headerData used above
            blobGasUsed,
        };
        const blockData = { header, transactions: this.transactions };
        const block = (0, block_1.createBlock)(blockData, this.blockOpts);
        const result = await (0, index_ts_2.runTx)(this.vm, { tx, block, skipHardForkValidation });
        // If tx is a blob transaction, remove blobs/kzg commitments before adding to block per EIP-4844
        if (tx instanceof tx_1.Blob4844Tx) {
            const txData = tx;
            this.blobGasUsed += BigInt(txData.blobVersionedHashes.length) * blobGasPerBlob;
            tx = (0, tx_1.createMinimal4844TxFromNetworkWrapper)(txData, {
                common: this.blockOpts.common,
            });
        }
        this.transactions.push(tx);
        this.transactionResults.push(result);
        this.gasUsed += result.totalGasSpent;
        this._minerValue += result.minerValue;
        return result;
    }
    /**
     * Reverts the checkpoint on the StateManager to reset the state from any transactions that have been run.
     */
    async revert() {
        if (this.checkpointed) {
            await this.vm.evm.journal.revert();
            this.checkpointed = false;
        }
        this.blockStatus = { status: exports.BuildStatus.Reverted };
    }
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
    async build(sealOpts) {
        this.checkStatus();
        const blockOpts = this.blockOpts;
        const consensusType = this.vm.common.consensusType();
        if (consensusType === common_1.ConsensusType.ProofOfWork) {
            await this.rewardMiner();
        }
        await this.processWithdrawals();
        const transactionsTrie = await this.transactionsTrie();
        const withdrawalsRoot = this.withdrawals
            ? await (0, block_1.genWithdrawalsTrieRoot)(this.withdrawals, new mpt_1.MerklePatriciaTrie({ common: this.vm.common }))
            : undefined;
        const receiptTrie = await this.receiptTrie();
        const logsBloom = this.logsBloom();
        const gasUsed = this.gasUsed;
        // timestamp should already be set in constructor
        const timestamp = this.headerData.timestamp ?? util_1.BIGINT_0;
        let blobGasUsed = undefined;
        if (this.vm.common.isActivatedEIP(4844)) {
            blobGasUsed = this.blobGasUsed;
        }
        let requests;
        let requestsHash;
        if (this.vm.common.isActivatedEIP(7685)) {
            const sha256Function = this.vm.common.customCrypto.sha256 ?? sha256_js_1.sha256;
            requests = await (0, requests_ts_1.accumulateRequests)(this.vm, this.transactionResults);
            requestsHash = (0, block_1.genRequestsRoot)(requests, sha256Function);
        }
        // get stateRoot after all the accumulateRequests etc have been done
        const stateRoot = await this.vm.stateManager.getStateRoot();
        const headerData = {
            ...this.headerData,
            stateRoot,
            transactionsTrie,
            withdrawalsRoot,
            receiptTrie,
            logsBloom,
            gasUsed,
            timestamp,
            // correct excessBlobGas should already be part of headerData used above
            blobGasUsed,
            requestsHash,
        };
        if (consensusType === common_1.ConsensusType.ProofOfWork) {
            headerData.nonce = sealOpts?.nonce ?? headerData.nonce;
            headerData.mixHash = sealOpts?.mixHash ?? headerData.mixHash;
        }
        const blockData = {
            header: headerData,
            transactions: this.transactions,
            withdrawals: this.withdrawals,
        };
        let block;
        const cs = this.blockOpts.cliqueSigner;
        if (cs !== undefined) {
            block = (0, block_1.createSealedCliqueBlock)(blockData, cs, this.blockOpts);
        }
        else {
            block = (0, block_1.createBlock)(blockData, blockOpts);
        }
        if (this.blockOpts.putBlockIntoBlockchain === true) {
            await this.vm.blockchain.putBlock(block);
        }
        this.blockStatus = { status: exports.BuildStatus.Build, block };
        if (this.checkpointed) {
            await this.vm.evm.journal.commit();
            this.checkpointed = false;
        }
        return { block, requests };
    }
    async initState() {
        if (this.vm.common.isActivatedEIP(4788)) {
            if (!this.checkpointed) {
                await this.vm.evm.journal.checkpoint();
                this.checkpointed = true;
            }
            const { parentBeaconBlockRoot, timestamp } = this.headerData;
            // timestamp should already be set in constructor
            const timestampBigInt = (0, util_1.toType)(timestamp ?? 0, util_1.TypeOutput.BigInt);
            const parentBeaconBlockRootBuf = (0, util_1.toType)(parentBeaconBlockRoot, util_1.TypeOutput.Uint8Array) ?? new Uint8Array(32);
            await (0, runBlock_ts_1.accumulateParentBeaconBlockRoot)(this.vm, parentBeaconBlockRootBuf, timestampBigInt);
        }
        if (this.vm.common.isActivatedEIP(2935)) {
            if (!this.checkpointed) {
                await this.vm.evm.journal.checkpoint();
                this.checkpointed = true;
            }
            const { parentHash, number } = this.headerData;
            // timestamp should already be set in constructor
            const numberBigInt = (0, util_1.toType)(number ?? 0, util_1.TypeOutput.BigInt);
            const parentHashSanitized = (0, util_1.toType)(parentHash, util_1.TypeOutput.Uint8Array) ?? new Uint8Array(32);
            await (0, runBlock_ts_1.accumulateParentBlockHash)(this.vm, numberBigInt, parentHashSanitized);
        }
    }
}
exports.BlockBuilder = BlockBuilder;
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
async function buildBlock(vm, opts) {
    const blockBuilder = new BlockBuilder(vm, opts);
    await blockBuilder.initState();
    return blockBuilder;
}
//# sourceMappingURL=buildBlock.js.map