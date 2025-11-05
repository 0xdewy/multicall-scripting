import { Block } from '../index.ts';
import type { EthersProvider } from '@ethereumjs/util';
import type { BeaconPayloadJSON } from '../from-beacon-payload.ts';
import type { BlockBytes, BlockData, BlockOptions, ExecutionPayload, HeaderData, JSONRPCBlock } from '../types.ts';
/**
 * Static constructor to create a block from a block data dictionary
 *
 * @param blockData
 * @param opts
 */
export declare function createBlock(blockData?: BlockData, opts?: BlockOptions): Block;
/**
 * Simple static constructor if only an empty block is needed
 * (tree shaking advantages since it does not draw all the tx constructors in)
 *
 * @param headerData
 * @param opts
 */
export declare function createEmptyBlock(headerData: HeaderData, opts?: BlockOptions): Block;
/**
 * Static constructor to create a block from an array of Bytes values
 *
 * @param values
 * @param opts
 */
export declare function createBlockFromBytesArray(values: BlockBytes, opts?: BlockOptions): Block;
/**
 * Static constructor to create a block from a RLP-serialized block
 *
 * @param serialized
 * @param opts
 */
export declare function createBlockFromRLP(serialized: Uint8Array, opts?: BlockOptions): Block;
/**
 * Creates a new block object from Ethereum JSON RPC.
 *
 * @param blockParams - Ethereum JSON RPC of block (eth_getBlockByNumber)
 * @param uncles - Optional list of Ethereum JSON RPC of uncles (eth_getUncleByBlockHashAndIndex)
 * @param opts - An object describing the blockchain
 */
export declare function createBlockFromRPC(blockParams: JSONRPCBlock, uncles?: any[], options?: BlockOptions): Block;
/**
 *  Method to retrieve a block from a JSON-RPC provider and format as a {@link Block}
 * @param provider either a url for a remote provider or an Ethers JSONRPCProvider object
 * @param blockTag block hash or block number to be run
 * @param opts {@link BlockOptions}
 * @returns the block specified by `blockTag`
 */
export declare const createBlockFromJSONRPCProvider: (provider: string | EthersProvider, blockTag: string | bigint, opts: BlockOptions) => Promise<Block>;
/**
 *  Method to retrieve a block from an execution payload
 * @param execution payload constructed from beacon payload
 * @param opts {@link BlockOptions}
 * @returns the block constructed block
 */
export declare function createBlockFromExecutionPayload(payload: ExecutionPayload, opts?: BlockOptions): Promise<Block>;
/**
 *  Method to retrieve a block from a beacon payload JSON
 * @param payload JSON of a beacon beacon fetched from beacon apis
 * @param opts {@link BlockOptions}
 * @returns the block constructed block
 */
export declare function createBlockFromBeaconPayloadJSON(payload: BeaconPayloadJSON, opts?: BlockOptions): Promise<Block>;
export declare function createSealedCliqueBlock(blockData: BlockData | undefined, cliqueSigner: Uint8Array, opts?: BlockOptions): Block;
//# sourceMappingURL=constructors.d.ts.map