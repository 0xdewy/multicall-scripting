import { MerklePatriciaTrie } from '@ethereumjs/mpt';
import type { Common } from '@ethereumjs/common';
import type { TypedTransaction } from '@ethereumjs/tx';
import type { CLRequest, CLRequestType, PrefixedHexString, Withdrawal } from '@ethereumjs/util';
import type { BlockHeaderBytes, HeaderData } from './types.ts';
/**
 * Returns a 0x-prefixed hex number string from a hex string or string integer.
 * @param {string} input string to check, convert, and return
 */
export declare const numberToHex: (input?: string) => PrefixedHexString | undefined;
export declare function valuesArrayToHeaderData(values: BlockHeaderBytes): HeaderData;
export declare function getDifficulty(headerData: HeaderData): bigint | null;
export declare const getNumBlobs: (transactions: TypedTransaction[]) => number;
/**
 * Approximates `factor * e ** (numerator / denominator)` using Taylor expansion
 */
export declare const fakeExponential: (factor: bigint, numerator: bigint, denominator: bigint) => bigint;
/**
 * Returns the blob gas price depending upon the `excessBlobGas` value
 * @param excessBlobGas
 * @param common
 */
export declare const computeBlobGasPrice: (excessBlobGas: bigint, common: Common) => bigint;
/**
 * Returns the withdrawals trie root for array of Withdrawal.
 * @param wts array of Withdrawal to compute the root of
 * @param optional emptyTrie to use to generate the root
 */
export declare function genWithdrawalsTrieRoot(wts: Withdrawal[], emptyTrie?: MerklePatriciaTrie): Promise<Uint8Array<ArrayBufferLike>>;
/**
 * Returns the txs trie root for array of TypedTransaction
 * @param txs array of TypedTransaction to compute the root of
 * @param optional emptyTrie to use to generate the root
 */
export declare function genTransactionsTrieRoot(txs: TypedTransaction[], emptyTrie?: MerklePatriciaTrie): Promise<Uint8Array<ArrayBufferLike>>;
/**
 * Returns the requests trie root for an array of CLRequests
 * @param requests - an array of CLRequests
 * @param emptyTrie optional empty trie used to generate the root
 * @returns a 32 byte Uint8Array representing the requests trie root
 */
export declare function genRequestsRoot(requests: CLRequest<CLRequestType>[], sha256Function: (msg: Uint8Array) => Uint8Array): Uint8Array<ArrayBufferLike>;
//# sourceMappingURL=helpers.d.ts.map