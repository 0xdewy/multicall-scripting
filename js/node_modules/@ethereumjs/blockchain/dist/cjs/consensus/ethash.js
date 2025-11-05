"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EthashConsensus = void 0;
const common_1 = require("@ethereumjs/common");
const util_1 = require("@ethereumjs/util");
const debug_1 = require("debug");
/**
 * This class encapsulates Ethash-related consensus functionality when used with the Blockchain class.
 */
class EthashConsensus {
    constructor(ethash) {
        this.DEBUG =
            typeof window === 'undefined' ? (process?.env?.DEBUG?.includes('ethjs') ?? false) : false;
        this._debug = (0, debug_1.default)('blockchain:ethash');
        this.algorithm = common_1.ConsensusAlgorithm.Ethash;
        this._ethash = ethash;
    }
    async validateConsensus(block) {
        const valid = await this._ethash.verifyPOW(block);
        if (!valid) {
            throw (0, util_1.EthereumJSErrorWithoutCode)('invalid POW');
        }
        this.DEBUG &&
            this._debug(`valid PoW consensus block: number ${block.header.number} hash ${(0, util_1.bytesToHex)(block.hash())}`);
    }
    /**
     * Checks that the block's `difficulty` matches the canonical difficulty of the parent header.
     * @param header - header of block to be checked
     */
    async validateDifficulty(header) {
        if (!this.blockchain) {
            throw (0, util_1.EthereumJSErrorWithoutCode)('blockchain not provided');
        }
        const parentHeader = await this.blockchain['_getHeader'](header.parentHash);
        if (header.ethashCanonicalDifficulty(parentHeader) !== header.difficulty) {
            throw (0, util_1.EthereumJSErrorWithoutCode)(`invalid difficulty ${header.errorStr()}`);
        }
        this.DEBUG &&
            this._debug(`valid difficulty header: number ${header.number} difficulty ${header.difficulty} parentHash ${(0, util_1.bytesToHex)(header.parentHash)}`);
    }
    async genesisInit() { }
    async setup({ blockchain }) {
        this.blockchain = blockchain;
        this._ethash.cacheDB = this.blockchain.db;
    }
    async newBlock() { }
}
exports.EthashConsensus = EthashConsensus;
//# sourceMappingURL=ethash.js.map