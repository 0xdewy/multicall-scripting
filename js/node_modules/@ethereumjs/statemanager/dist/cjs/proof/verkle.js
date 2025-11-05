"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getVerkleStateProof = getVerkleStateProof;
exports.verifyVerkleStateProof = verifyVerkleStateProof;
const util_1 = require("@ethereumjs/util");
function getVerkleStateProof(sm, _, __ = []) {
    throw (0, util_1.EthereumJSErrorWithoutCode)('Not implemented yet');
}
/**
 * Verifies whether the execution witness matches the stateRoot
 * @param {Uint8Array} stateRoot - The stateRoot to verify the executionWitness against
 * @returns {boolean} - Returns true if the executionWitness matches the provided stateRoot, otherwise false
 */
function verifyVerkleStateProof(sm) {
    if (sm['_executionWitness'] === undefined) {
        sm['DEBUG'] && sm['_debug']('Missing executionWitness');
        return false;
    }
    return (0, util_1.verifyVerkleProof)(sm.verkleCrypto, sm['_executionWitness']);
}
//# sourceMappingURL=verkle.js.map