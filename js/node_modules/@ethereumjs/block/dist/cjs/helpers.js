"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.computeBlobGasPrice = exports.fakeExponential = exports.getNumBlobs = exports.numberToHex = void 0;
exports.valuesArrayToHeaderData = valuesArrayToHeaderData;
exports.getDifficulty = getDifficulty;
exports.genWithdrawalsTrieRoot = genWithdrawalsTrieRoot;
exports.genTransactionsTrieRoot = genTransactionsTrieRoot;
exports.genRequestsRoot = genRequestsRoot;
const mpt_1 = require("@ethereumjs/mpt");
const rlp_1 = require("@ethereumjs/rlp");
const tx_1 = require("@ethereumjs/tx");
const util_1 = require("@ethereumjs/util");
/**
 * Returns a 0x-prefixed hex number string from a hex string or string integer.
 * @param {string} input string to check, convert, and return
 */
const numberToHex = function (input) {
    if (input === undefined)
        return undefined;
    if (!(0, util_1.isHexString)(input)) {
        const regex = new RegExp(/^\d+$/); // test to make sure input contains only digits
        if (!regex.test(input)) {
            const msg = `Cannot convert string to hex string. numberToHex only supports 0x-prefixed hex or integer strings but the given string was: ${input}`;
            throw (0, util_1.EthereumJSErrorWithoutCode)(msg);
        }
        return `0x${parseInt(input, 10).toString(16)}`;
    }
    return input;
};
exports.numberToHex = numberToHex;
function valuesArrayToHeaderData(values) {
    const [parentHash, uncleHash, coinbase, stateRoot, transactionsTrie, receiptTrie, logsBloom, difficulty, number, gasLimit, gasUsed, timestamp, extraData, mixHash, nonce, baseFeePerGas, withdrawalsRoot, blobGasUsed, excessBlobGas, parentBeaconBlockRoot, requestsHash,] = values;
    if (values.length > 21) {
        throw (0, util_1.EthereumJSErrorWithoutCode)(`invalid header. More values than expected were received. Max: 20, got: ${values.length}`);
    }
    if (values.length < 15) {
        throw (0, util_1.EthereumJSErrorWithoutCode)(`invalid header. Less values than expected were received. Min: 15, got: ${values.length}`);
    }
    return {
        parentHash,
        uncleHash,
        coinbase,
        stateRoot,
        transactionsTrie,
        receiptTrie,
        logsBloom,
        difficulty,
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
    };
}
function getDifficulty(headerData) {
    const { difficulty } = headerData;
    if (difficulty !== undefined) {
        return (0, util_1.toType)(difficulty, util_1.TypeOutput.BigInt);
    }
    return null;
}
const getNumBlobs = (transactions) => {
    let numBlobs = 0;
    for (const tx of transactions) {
        if (tx instanceof tx_1.Blob4844Tx) {
            numBlobs += tx.blobVersionedHashes.length;
        }
    }
    return numBlobs;
};
exports.getNumBlobs = getNumBlobs;
/**
 * Approximates `factor * e ** (numerator / denominator)` using Taylor expansion
 */
const fakeExponential = (factor, numerator, denominator) => {
    let i = util_1.BIGINT_1;
    let output = util_1.BIGINT_0;
    let numerator_accumulator = factor * denominator;
    while (numerator_accumulator > util_1.BIGINT_0) {
        output += numerator_accumulator;
        numerator_accumulator = (numerator_accumulator * numerator) / (denominator * i);
        i++;
    }
    return output / denominator;
};
exports.fakeExponential = fakeExponential;
/**
 * Returns the blob gas price depending upon the `excessBlobGas` value
 * @param excessBlobGas
 * @param common
 */
const computeBlobGasPrice = (excessBlobGas, common) => {
    return (0, exports.fakeExponential)(common.param('minBlobGas'), excessBlobGas, common.param('blobGasPriceUpdateFraction'));
};
exports.computeBlobGasPrice = computeBlobGasPrice;
/**
 * Returns the withdrawals trie root for array of Withdrawal.
 * @param wts array of Withdrawal to compute the root of
 * @param optional emptyTrie to use to generate the root
 */
async function genWithdrawalsTrieRoot(wts, emptyTrie) {
    const trie = emptyTrie ?? new mpt_1.MerklePatriciaTrie();
    for (const [i, wt] of wts.entries()) {
        await trie.put(rlp_1.RLP.encode(i), rlp_1.RLP.encode(wt.raw()));
    }
    return trie.root();
}
/**
 * Returns the txs trie root for array of TypedTransaction
 * @param txs array of TypedTransaction to compute the root of
 * @param optional emptyTrie to use to generate the root
 */
async function genTransactionsTrieRoot(txs, emptyTrie) {
    const trie = emptyTrie ?? new mpt_1.MerklePatriciaTrie();
    for (const [i, tx] of txs.entries()) {
        await trie.put(rlp_1.RLP.encode(i), tx.serialize());
    }
    return trie.root();
}
/**
 * Returns the requests trie root for an array of CLRequests
 * @param requests - an array of CLRequests
 * @param emptyTrie optional empty trie used to generate the root
 * @returns a 32 byte Uint8Array representing the requests trie root
 */
function genRequestsRoot(requests, sha256Function) {
    // Requests should be sorted in monotonically ascending order based on type
    // and whatever internal sorting logic is defined by each request type
    if (requests.length > 1) {
        for (let x = 1; x < requests.length; x++) {
            if (requests[x].type < requests[x - 1].type)
                throw (0, util_1.EthereumJSErrorWithoutCode)('requests are not sorted in ascending order');
        }
    }
    // def compute_requests_hash(list):
    //    return keccak256(rlp.encode([rlp.encode(req) for req in list]))
    let flatRequests = new Uint8Array();
    for (const req of requests) {
        if (req.bytes.length > 1) {
            // Only append requests if they have content
            flatRequests = (0, util_1.concatBytes)(flatRequests, sha256Function(req.bytes));
        }
    }
    return sha256Function(flatRequests);
}
//# sourceMappingURL=helpers.js.map