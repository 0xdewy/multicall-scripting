import { ConsensusAlgorithm } from '@ethereumjs/common';
import { BIGINT_0, EthereumJSErrorWithoutCode } from '@ethereumjs/util';
/**
 * This class encapsulates Casper-related consensus functionality when used with the Blockchain class.
 */
export class CasperConsensus {
    constructor() {
        this.algorithm = ConsensusAlgorithm.Casper;
    }
    async genesisInit() { }
    async setup() { }
    async validateConsensus() { }
    async validateDifficulty(header) {
        // TODO: This is not really part of consensus validation and it should be analyzed
        // if it is possible to replace by a more generic hardfork check between block and
        // blockchain along adding new blocks or headers
        if (header.difficulty !== BIGINT_0) {
            const msg = 'invalid difficulty.  PoS blocks must have difficulty 0';
            throw EthereumJSErrorWithoutCode(`${msg} ${header.errorStr()}`);
        }
    }
    async newBlock() { }
}
//# sourceMappingURL=casper.js.map