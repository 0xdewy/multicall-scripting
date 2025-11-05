"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.genGenesisStateRoot = genGenesisStateRoot;
exports.getGenesisStateRoot = getGenesisStateRoot;
const common_1 = require("@ethereumjs/common");
const mpt_1 = require("@ethereumjs/mpt");
/**
 * Safe creation of a new Blockchain object awaiting the initialization function,
 * encouraged method to use when creating a blockchain object.
 *
 * @param opts Constructor options, see {@link BlockchainOptions}
 */
/**
 * Verkle or Merkle genesis root
 * @param genesisState
 * @param common
 * @returns
 */
async function genGenesisStateRoot(genesisState, common) {
    const genCommon = common.copy();
    genCommon.setHardforkBy({
        blockNumber: 0,
        timestamp: genCommon.genesis().timestamp,
    });
    if (genCommon.isActivatedEIP(6800)) {
        throw Error(`Verkle tree state not yet supported`);
    }
    else {
        return (0, mpt_1.genesisMPTStateRoot)(genesisState);
    }
}
/**
 * Returns the genesis state root if chain is well known or an empty state's root otherwise
 */
async function getGenesisStateRoot(chainId, common) {
    const chainGenesis = common_1.ChainGenesis[chainId];
    return chainGenesis !== undefined ? chainGenesis.stateRoot : genGenesisStateRoot({}, common);
}
//# sourceMappingURL=helpers.js.map