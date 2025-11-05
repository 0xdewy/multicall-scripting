import { ConsensusAlgorithm } from '@ethereumjs/common';
import type { Block, BlockHeader } from '@ethereumjs/block';
import type { Blockchain } from '../index.ts';
import type { Consensus, ConsensusOptions } from '../types.ts';
export type MinimalEthashInterface = {
    cacheDB?: any;
    verifyPOW(block: Block): Promise<boolean>;
};
/**
 * This class encapsulates Ethash-related consensus functionality when used with the Blockchain class.
 */
export declare class EthashConsensus implements Consensus {
    blockchain: Blockchain | undefined;
    algorithm: ConsensusAlgorithm;
    _ethash: MinimalEthashInterface;
    private DEBUG;
    private _debug;
    constructor(ethash: MinimalEthashInterface);
    validateConsensus(block: Block): Promise<void>;
    /**
     * Checks that the block's `difficulty` matches the canonical difficulty of the parent header.
     * @param header - header of block to be checked
     */
    validateDifficulty(header: BlockHeader): Promise<void>;
    genesisInit(): Promise<void>;
    setup({ blockchain }: ConsensusOptions): Promise<void>;
    newBlock(): Promise<void>;
}
//# sourceMappingURL=ethash.d.ts.map