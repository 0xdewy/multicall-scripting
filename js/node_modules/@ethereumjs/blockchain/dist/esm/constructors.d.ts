import { Blockchain } from './index.ts';
import type { BlockData } from '@ethereumjs/block';
import type { BlockchainOptions } from './index.ts';
export declare function createBlockchain(opts?: BlockchainOptions): Promise<Blockchain>;
/**
 * Creates a blockchain from a list of block objects,
 * objects must be readable by {@link createBlock}
 *
 * @param blockData List of block objects
 * @param opts Constructor options, see {@link BlockchainOptions}
 */
export declare function createBlockchainFromBlocksData(blocksData: BlockData[], opts?: BlockchainOptions): Promise<Blockchain>;
//# sourceMappingURL=constructors.d.ts.map