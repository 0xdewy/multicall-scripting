import type { Chain, Common, GenesisState } from '@ethereumjs/common';
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
export declare function genGenesisStateRoot(genesisState: GenesisState, common: Common): Promise<Uint8Array>;
/**
 * Returns the genesis state root if chain is well known or an empty state's root otherwise
 */
export declare function getGenesisStateRoot(chainId: Chain, common: Common): Promise<Uint8Array>;
//# sourceMappingURL=helpers.d.ts.map