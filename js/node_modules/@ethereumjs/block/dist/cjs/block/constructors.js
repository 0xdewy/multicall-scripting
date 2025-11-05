"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createBlockFromJSONRPCProvider = void 0;
exports.createBlock = createBlock;
exports.createEmptyBlock = createEmptyBlock;
exports.createBlockFromBytesArray = createBlockFromBytesArray;
exports.createBlockFromRLP = createBlockFromRLP;
exports.createBlockFromRPC = createBlockFromRPC;
exports.createBlockFromExecutionPayload = createBlockFromExecutionPayload;
exports.createBlockFromBeaconPayloadJSON = createBlockFromBeaconPayloadJSON;
exports.createSealedCliqueBlock = createSealedCliqueBlock;
const mpt_1 = require("@ethereumjs/mpt");
const rlp_1 = require("@ethereumjs/rlp");
const tx_1 = require("@ethereumjs/tx");
const util_1 = require("@ethereumjs/util");
const clique_ts_1 = require("../consensus/clique.js");
const helpers_ts_1 = require("../helpers.js");
const index_ts_1 = require("../index.js");
/**
 * Static constructor to create a block from a block data dictionary
 *
 * @param blockData
 * @param opts
 */
function createBlock(blockData = {}, opts) {
    const { header: headerData, transactions: txsData, uncleHeaders: uhsData, withdrawals: withdrawalsData, executionWitness: executionWitnessData, } = blockData;
    const header = (0, index_ts_1.createBlockHeader)(headerData, opts);
    // parse transactions
    const transactions = [];
    for (const txData of txsData ?? []) {
        const tx = (0, tx_1.createTx)(txData, {
            ...opts,
            // Use header common in case of setHardfork being activated
            common: header.common,
        });
        transactions.push(tx);
    }
    // parse uncle headers
    const uncleHeaders = [];
    const uncleOpts = {
        ...opts,
        // Use header common in case of setHardfork being activated
        common: header.common,
        // Disable this option here (all other options carried over), since this overwrites the provided Difficulty to an incorrect value
        calcDifficultyFromHeader: undefined,
    };
    // Uncles are obsolete post-merge, any hardfork by option implies setHardfork
    if (opts?.setHardfork !== undefined) {
        uncleOpts.setHardfork = true;
    }
    for (const uhData of uhsData ?? []) {
        const uh = (0, index_ts_1.createBlockHeader)(uhData, uncleOpts);
        uncleHeaders.push(uh);
    }
    const withdrawals = withdrawalsData?.map(util_1.createWithdrawal);
    // The witness data is planned to come in rlp serialized bytes so leave this
    // stub till that time
    const executionWitness = executionWitnessData;
    return new index_ts_1.Block(header, transactions, uncleHeaders, withdrawals, opts, executionWitness);
}
/**
 * Simple static constructor if only an empty block is needed
 * (tree shaking advantages since it does not draw all the tx constructors in)
 *
 * @param headerData
 * @param opts
 */
function createEmptyBlock(headerData, opts) {
    const header = (0, index_ts_1.createBlockHeader)(headerData, opts);
    return new index_ts_1.Block(header);
}
/**
 * Static constructor to create a block from an array of Bytes values
 *
 * @param values
 * @param opts
 */
function createBlockFromBytesArray(values, opts) {
    if (values.length > 5) {
        throw (0, util_1.EthereumJSErrorWithoutCode)(`invalid  More values=${values.length} than expected were received (at most 5)`);
    }
    // First try to load header so that we can use its common (in case of setHardfork being activated)
    // to correctly make checks on the hardforks
    const [headerData, txsData, uhsData, ...valuesTail] = values;
    const header = (0, index_ts_1.createBlockHeaderFromBytesArray)(headerData, opts);
    // conditional assignment of rest of values and splicing them out from the valuesTail
    const withdrawalBytes = header.common.isActivatedEIP(4895)
        ? valuesTail.splice(0, 1)[0]
        : undefined;
    // if witness bytes are not present that we should assume that witness has not been provided
    // in that scenario pass null as undefined is used for default witness assignment
    const executionWitnessBytes = header.common.isActivatedEIP(6800)
        ? valuesTail.splice(0, 1)[0]
        : null;
    if (header.common.isActivatedEIP(4895) &&
        (withdrawalBytes === undefined || !Array.isArray(withdrawalBytes))) {
        throw (0, util_1.EthereumJSErrorWithoutCode)('Invalid serialized block input: EIP-4895 is active, and no withdrawals were provided as array');
    }
    if (header.common.isActivatedEIP(6800) && executionWitnessBytes === undefined) {
        throw (0, util_1.EthereumJSErrorWithoutCode)('Invalid serialized block input: EIP-6800 is active, and execution witness is undefined');
    }
    // parse transactions
    const transactions = [];
    for (const txData of txsData ?? []) {
        transactions.push((0, tx_1.createTxFromBlockBodyData)(txData, {
            ...opts,
            // Use header common in case of setHardfork being activated
            common: header.common,
        }));
    }
    // parse uncle headers
    const uncleHeaders = [];
    const uncleOpts = {
        ...opts,
        // Use header common in case of setHardfork being activated
        common: header.common,
        // Disable this option here (all other options carried over), since this overwrites the provided Difficulty to an incorrect value
        calcDifficultyFromHeader: undefined,
    };
    // Uncles are obsolete post-merge, any hardfork by option implies setHardfork
    if (opts?.setHardfork !== undefined) {
        uncleOpts.setHardfork = true;
    }
    for (const uncleHeaderData of uhsData ?? []) {
        uncleHeaders.push((0, index_ts_1.createBlockHeaderFromBytesArray)(uncleHeaderData, uncleOpts));
    }
    const withdrawals = withdrawalBytes
        ?.map(([index, validatorIndex, address, amount]) => ({
        index,
        validatorIndex,
        address,
        amount,
    }))
        ?.map(util_1.createWithdrawal);
    // executionWitness are not part of the EL fetched blocks via eth_ bodies method
    // they are currently only available via the engine api constructed blocks
    let executionWitness;
    if (header.common.isActivatedEIP(6800)) {
        if (executionWitnessBytes !== undefined) {
            executionWitness = JSON.parse((0, util_1.bytesToUtf8)(rlp_1.RLP.decode(executionWitnessBytes)));
        }
        else if (opts?.executionWitness !== undefined) {
            executionWitness = opts.executionWitness;
        }
        else {
            // don't assign default witness if eip 6800 is implemented as it leads to incorrect
            // assumptions while executing the  if not present in input implies its unavailable
            executionWitness = null;
        }
    }
    return new index_ts_1.Block(header, transactions, uncleHeaders, withdrawals, opts, executionWitness);
}
/**
 * Static constructor to create a block from a RLP-serialized block
 *
 * @param serialized
 * @param opts
 */
function createBlockFromRLP(serialized, opts) {
    const values = rlp_1.RLP.decode(Uint8Array.from(serialized));
    if (!Array.isArray(values)) {
        throw (0, util_1.EthereumJSErrorWithoutCode)('Invalid serialized block input. Must be array');
    }
    return createBlockFromBytesArray(values, opts);
}
/**
 * Creates a new block object from Ethereum JSON RPC.
 *
 * @param blockParams - Ethereum JSON RPC of block (eth_getBlockByNumber)
 * @param uncles - Optional list of Ethereum JSON RPC of uncles (eth_getUncleByBlockHashAndIndex)
 * @param opts - An object describing the blockchain
 */
function createBlockFromRPC(blockParams, uncles = [], options) {
    const header = (0, index_ts_1.createBlockHeaderFromRPC)(blockParams, options);
    const transactions = [];
    const opts = { common: header.common };
    for (const _txParams of blockParams.transactions ?? []) {
        const txParams = (0, tx_1.normalizeTxParams)(_txParams);
        const tx = (0, tx_1.createTx)(txParams, opts);
        transactions.push(tx);
    }
    const uncleHeaders = uncles.map((uh) => (0, index_ts_1.createBlockHeaderFromRPC)(uh, options));
    return createBlock({ header, transactions, uncleHeaders, withdrawals: blockParams.withdrawals }, options);
}
/**
 *  Method to retrieve a block from a JSON-RPC provider and format as a {@link Block}
 * @param provider either a url for a remote provider or an Ethers JSONRPCProvider object
 * @param blockTag block hash or block number to be run
 * @param opts {@link BlockOptions}
 * @returns the block specified by `blockTag`
 */
const createBlockFromJSONRPCProvider = async (provider, blockTag, opts) => {
    let blockData;
    const providerUrl = (0, util_1.getProvider)(provider);
    if (typeof blockTag === 'string' && blockTag.length === 66) {
        blockData = await (0, util_1.fetchFromProvider)(providerUrl, {
            method: 'eth_getBlockByHash',
            params: [blockTag, true],
        });
    }
    else if (typeof blockTag === 'bigint') {
        blockData = await (0, util_1.fetchFromProvider)(providerUrl, {
            method: 'eth_getBlockByNumber',
            params: [(0, util_1.bigIntToHex)(blockTag), true],
        });
    }
    else if ((0, util_1.isHexString)(blockTag) ||
        blockTag === 'latest' ||
        blockTag === 'earliest' ||
        blockTag === 'pending' ||
        blockTag === 'finalized' ||
        blockTag === 'safe') {
        blockData = await (0, util_1.fetchFromProvider)(providerUrl, {
            method: 'eth_getBlockByNumber',
            params: [blockTag, true],
        });
    }
    else {
        throw (0, util_1.EthereumJSErrorWithoutCode)(`expected blockTag to be block hash, bigint, hex prefixed string, or earliest/latest/pending; got ${blockTag}`);
    }
    if (blockData === null) {
        throw (0, util_1.EthereumJSErrorWithoutCode)('No block data returned from provider');
    }
    const uncleHeaders = [];
    if (blockData.uncles.length > 0) {
        for (let x = 0; x < blockData.uncles.length; x++) {
            const headerData = await (0, util_1.fetchFromProvider)(providerUrl, {
                method: 'eth_getUncleByBlockHashAndIndex',
                params: [blockData.hash, (0, util_1.intToHex)(x)],
            });
            uncleHeaders.push(headerData);
        }
    }
    return createBlockFromRPC(blockData, uncleHeaders, opts);
};
exports.createBlockFromJSONRPCProvider = createBlockFromJSONRPCProvider;
/**
 *  Method to retrieve a block from an execution payload
 * @param execution payload constructed from beacon payload
 * @param opts {@link BlockOptions}
 * @returns the block constructed block
 */
async function createBlockFromExecutionPayload(payload, opts) {
    const { blockNumber: number, receiptsRoot: receiptTrie, prevRandao: mixHash, feeRecipient: coinbase, transactions, withdrawals: withdrawalsData, executionWitness, } = payload;
    const txs = [];
    for (const [index, serializedTx] of transactions.entries()) {
        try {
            const tx = (0, tx_1.createTxFromRLP)((0, util_1.hexToBytes)(serializedTx), {
                common: opts?.common,
            });
            txs.push(tx);
        }
        catch (error) {
            const validationError = `Invalid tx at index ${index}: ${error}`;
            throw validationError;
        }
    }
    const transactionsTrie = await (0, helpers_ts_1.genTransactionsTrieRoot)(txs, new mpt_1.MerklePatriciaTrie({ common: opts?.common }));
    const withdrawals = withdrawalsData?.map((wData) => (0, util_1.createWithdrawal)(wData));
    const withdrawalsRoot = withdrawals
        ? await (0, helpers_ts_1.genWithdrawalsTrieRoot)(withdrawals, new mpt_1.MerklePatriciaTrie({ common: opts?.common }))
        : undefined;
    const header = {
        ...payload,
        number,
        receiptTrie,
        transactionsTrie,
        withdrawalsRoot,
        mixHash,
        coinbase,
    };
    // we are not setting setHardfork as common is already set to the correct hf
    const block = createBlock({ header, transactions: txs, withdrawals, executionWitness }, opts);
    if (block.common.isActivatedEIP(6800) &&
        (executionWitness === undefined || executionWitness === null)) {
        throw Error('Missing executionWitness for EIP-6800 activated executionPayload');
    }
    // Verify blockHash matches payload
    if (!(0, util_1.equalsBytes)(block.hash(), (0, util_1.hexToBytes)(payload.blockHash))) {
        const validationError = `Invalid blockHash, expected: ${payload.blockHash}, received: ${(0, util_1.bytesToHex)(block.hash())}`;
        throw Error(validationError);
    }
    return block;
}
/**
 *  Method to retrieve a block from a beacon payload JSON
 * @param payload JSON of a beacon beacon fetched from beacon apis
 * @param opts {@link BlockOptions}
 * @returns the block constructed block
 */
async function createBlockFromBeaconPayloadJSON(payload, opts) {
    const executionPayload = (0, index_ts_1.executionPayloadFromBeaconPayload)(payload);
    return createBlockFromExecutionPayload(executionPayload, opts);
}
function createSealedCliqueBlock(blockData = {}, cliqueSigner, opts = {}) {
    const sealedCliqueBlock = createBlock(blockData, {
        ...opts,
        ...{ freeze: false, skipConsensusFormatValidation: true },
    });
    sealedCliqueBlock.header.extraData = (0, clique_ts_1.generateCliqueBlockExtraData)(sealedCliqueBlock.header, cliqueSigner);
    if (opts?.freeze === true) {
        // We have to freeze here since we can't freeze the block when constructing it since we are overwriting `extraData`
        Object.freeze(sealedCliqueBlock);
    }
    if (opts?.skipConsensusFormatValidation === false) {
        // We need to validate the consensus format here since we skipped it when constructing the block
        sealedCliqueBlock.header['_consensusFormatValidation']();
    }
    return sealedCliqueBlock;
}
//# sourceMappingURL=constructors.js.map