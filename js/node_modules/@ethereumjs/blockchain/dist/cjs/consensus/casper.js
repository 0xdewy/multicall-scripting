"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CasperConsensus = void 0;
const common_1 = require("@ethereumjs/common");
const util_1 = require("@ethereumjs/util");
/**
 * This class encapsulates Casper-related consensus functionality when used with the Blockchain class.
 */
class CasperConsensus {
    constructor() {
        this.algorithm = common_1.ConsensusAlgorithm.Casper;
    }
    async genesisInit() { }
    async setup() { }
    async validateConsensus() { }
    async validateDifficulty(header) {
        // TODO: This is not really part of consensus validation and it should be analyzed
        // if it is possible to replace by a more generic hardfork check between block and
        // blockchain along adding new blocks or headers
        if (header.difficulty !== util_1.BIGINT_0) {
            const msg = 'invalid difficulty.  PoS blocks must have difficulty 0';
            throw (0, util_1.EthereumJSErrorWithoutCode)(`${msg} ${header.errorStr()}`);
        }
    }
    async newBlock() { }
}
exports.CasperConsensus = CasperConsensus;
//# sourceMappingURL=casper.js.map