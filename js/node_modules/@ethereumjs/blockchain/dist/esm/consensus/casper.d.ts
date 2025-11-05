import { ConsensusAlgorithm } from '@ethereumjs/common';
import type { BlockHeader } from '@ethereumjs/block';
import type { Consensus } from '../types.ts';
/**
 * This class encapsulates Casper-related consensus functionality when used with the Blockchain class.
 */
export declare class CasperConsensus implements Consensus {
    algorithm: ConsensusAlgorithm;
    constructor();
    genesisInit(): Promise<void>;
    setup(): Promise<void>;
    validateConsensus(): Promise<void>;
    validateDifficulty(header: BlockHeader): Promise<void>;
    newBlock(): Promise<void>;
}
//# sourceMappingURL=casper.d.ts.map