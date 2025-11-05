import { ConsensusAlgorithm } from '@ethereumjs/common';
import { EthereumJSErrorWithoutCode, bytesToHex } from '@ethereumjs/util';
import debugDefault from 'debug';
/**
 * This class encapsulates Ethash-related consensus functionality when used with the Blockchain class.
 */
export class EthashConsensus {
    constructor(ethash) {
        this.DEBUG =
            typeof window === 'undefined' ? (process?.env?.DEBUG?.includes('ethjs') ?? false) : false;
        this._debug = debugDefault('blockchain:ethash');
        this.algorithm = ConsensusAlgorithm.Ethash;
        this._ethash = ethash;
    }
    async validateConsensus(block) {
        const valid = await this._ethash.verifyPOW(block);
        if (!valid) {
            throw EthereumJSErrorWithoutCode('invalid POW');
        }
        this.DEBUG &&
            this._debug(`valid PoW consensus block: number ${block.header.number} hash ${bytesToHex(block.hash())}`);
    }
    /**
     * Checks that the block's `difficulty` matches the canonical difficulty of the parent header.
     * @param header - header of block to be checked
     */
    async validateDifficulty(header) {
        if (!this.blockchain) {
            throw EthereumJSErrorWithoutCode('blockchain not provided');
        }
        const parentHeader = await this.blockchain['_getHeader'](header.parentHash);
        if (header.ethashCanonicalDifficulty(parentHeader) !== header.difficulty) {
            throw EthereumJSErrorWithoutCode(`invalid difficulty ${header.errorStr()}`);
        }
        this.DEBUG &&
            this._debug(`valid difficulty header: number ${header.number} difficulty ${header.difficulty} parentHash ${bytesToHex(header.parentHash)}`);
    }
    async genesisInit() { }
    async setup({ blockchain }) {
        this.blockchain = blockchain;
        this._ethash.cacheDB = this.blockchain.db;
    }
    async newBlock() { }
}
//# sourceMappingURL=ethash.js.map