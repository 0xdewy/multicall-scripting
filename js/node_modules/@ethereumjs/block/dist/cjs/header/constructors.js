"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createBlockHeader = createBlockHeader;
exports.createBlockHeaderFromBytesArray = createBlockHeaderFromBytesArray;
exports.createBlockHeaderFromRLP = createBlockHeaderFromRLP;
exports.createSealedCliqueBlockHeader = createSealedCliqueBlockHeader;
exports.createBlockHeaderFromRPC = createBlockHeaderFromRPC;
const rlp_1 = require("@ethereumjs/rlp");
const util_1 = require("@ethereumjs/util");
const clique_ts_1 = require("../consensus/clique.js");
const helpers_ts_1 = require("../helpers.js");
const index_ts_1 = require("../index.js");
/**
 * Static constructor to create a block header from a header data dictionary
 *
 * @param headerData
 * @param opts
 */
function createBlockHeader(headerData = {}, opts = {}) {
    return new index_ts_1.BlockHeader(headerData, opts);
}
/**
 * Static constructor to create a block header from an array of bytes values
 *
 * @param values
 * @param opts
 */
function createBlockHeaderFromBytesArray(values, opts = {}) {
    const headerData = (0, helpers_ts_1.valuesArrayToHeaderData)(values);
    const { number, baseFeePerGas, excessBlobGas, blobGasUsed, parentBeaconBlockRoot, requestsHash } = headerData;
    const header = createBlockHeader(headerData, opts);
    if (header.common.isActivatedEIP(1559) && baseFeePerGas === undefined) {
        const eip1559ActivationBlock = (0, util_1.bigIntToBytes)(header.common.eipBlock(1559));
        if (eip1559ActivationBlock !== undefined &&
            (0, util_1.equalsBytes)(eip1559ActivationBlock, number)) {
            throw (0, util_1.EthereumJSErrorWithoutCode)('invalid header. baseFeePerGas should be provided');
        }
    }
    if (header.common.isActivatedEIP(4844)) {
        if (excessBlobGas === undefined) {
            throw (0, util_1.EthereumJSErrorWithoutCode)('invalid header. excessBlobGas should be provided');
        }
        else if (blobGasUsed === undefined) {
            throw (0, util_1.EthereumJSErrorWithoutCode)('invalid header. blobGasUsed should be provided');
        }
    }
    if (header.common.isActivatedEIP(4788) && parentBeaconBlockRoot === undefined) {
        throw (0, util_1.EthereumJSErrorWithoutCode)('invalid header. parentBeaconBlockRoot should be provided');
    }
    if (header.common.isActivatedEIP(7685) && requestsHash === undefined) {
        throw (0, util_1.EthereumJSErrorWithoutCode)('invalid header. requestsHash should be provided');
    }
    return header;
}
/**
 * Static constructor to create a block header from a RLP-serialized header
 *
 * @param serializedHeaderData
 * @param opts
 */
function createBlockHeaderFromRLP(serializedHeaderData, opts = {}) {
    const values = rlp_1.RLP.decode(serializedHeaderData);
    if (!Array.isArray(values)) {
        throw (0, util_1.EthereumJSErrorWithoutCode)('Invalid serialized header input. Must be array');
    }
    return createBlockHeaderFromBytesArray(values, opts);
}
function createSealedCliqueBlockHeader(headerData = {}, cliqueSigner, opts = {}) {
    const sealedCliqueBlockHeader = new index_ts_1.BlockHeader(headerData, {
        ...opts,
        ...{ skipConsensusFormatValidation: true },
    });
    sealedCliqueBlockHeader.extraData = (0, clique_ts_1.generateCliqueBlockExtraData)(sealedCliqueBlockHeader, cliqueSigner);
    if (opts.skipConsensusFormatValidation === false)
        // We need to validate the consensus format here since we skipped it when constructing the block header
        sealedCliqueBlockHeader['_consensusFormatValidation']();
    return sealedCliqueBlockHeader;
}
/**
 * Creates a new block header object from Ethereum JSON RPC.
 *
 * @param blockParams - Ethereum JSON RPC of block (eth_getBlockByNumber)
 * @param options - An object describing the blockchain
 */
function createBlockHeaderFromRPC(blockParams, options) {
    const { parentHash, sha3Uncles, miner, stateRoot, transactionsRoot, receiptsRoot, logsBloom, difficulty, number, gasLimit, gasUsed, timestamp, extraData, mixHash, nonce, baseFeePerGas, withdrawalsRoot, blobGasUsed, excessBlobGas, parentBeaconBlockRoot, requestsHash, } = blockParams;
    const blockHeader = new index_ts_1.BlockHeader({
        parentHash,
        uncleHash: sha3Uncles,
        coinbase: miner,
        stateRoot,
        transactionsTrie: transactionsRoot,
        receiptTrie: receiptsRoot,
        logsBloom,
        difficulty: (0, helpers_ts_1.numberToHex)(difficulty),
        number,
        gasLimit,
        gasUsed,
        timestamp,
        extraData,
        mixHash,
        nonce,
        baseFeePerGas,
        withdrawalsRoot,
        blobGasUsed,
        excessBlobGas,
        parentBeaconBlockRoot,
        requestsHash,
    }, options);
    return blockHeader;
}
//# sourceMappingURL=constructors.js.map