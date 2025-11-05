import { BlockHeader } from '../index.ts';
import type { BlockHeaderBytes, BlockOptions, HeaderData, JSONRPCBlock } from '../types.ts';
/**
 * Static constructor to create a block header from a header data dictionary
 *
 * @param headerData
 * @param opts
 */
export declare function createBlockHeader(headerData?: HeaderData, opts?: BlockOptions): BlockHeader;
/**
 * Static constructor to create a block header from an array of bytes values
 *
 * @param values
 * @param opts
 */
export declare function createBlockHeaderFromBytesArray(values: BlockHeaderBytes, opts?: BlockOptions): BlockHeader;
/**
 * Static constructor to create a block header from a RLP-serialized header
 *
 * @param serializedHeaderData
 * @param opts
 */
export declare function createBlockHeaderFromRLP(serializedHeaderData: Uint8Array, opts?: BlockOptions): BlockHeader;
export declare function createSealedCliqueBlockHeader(headerData: HeaderData | undefined, cliqueSigner: Uint8Array, opts?: BlockOptions): BlockHeader;
/**
 * Creates a new block header object from Ethereum JSON RPC.
 *
 * @param blockParams - Ethereum JSON RPC of block (eth_getBlockByNumber)
 * @param options - An object describing the blockchain
 */
export declare function createBlockHeaderFromRPC(blockParams: JSONRPCBlock, options?: BlockOptions): BlockHeader;
//# sourceMappingURL=constructors.d.ts.map