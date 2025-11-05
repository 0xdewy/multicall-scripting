import type { PrefixedHexString } from '@ethereumjs/util';
import type { VerkleTree } from './verkleTree.ts';
/**
 * Recursively walks down the tree from a given starting node and returns all the leaf values
 * @param tree - The verkle tree
 * @param startingNode - The starting node
 * @returns An array of key-value pairs containing the tree keys and associated values
 */
export declare const dumpLeafValues: (tree: VerkleTree, startingNode: Uint8Array) => Promise<[PrefixedHexString, PrefixedHexString][] | undefined>;
/**
 * Recursively walks down the tree from a given starting node and returns all the node paths and hashes
 * @param tree - The verkle tree
 * @param startingNode - The starting node
 * @returns An array of key-value pairs containing the tree paths and associated hashes
 */
export declare const dumpNodeHashes: (tree: VerkleTree, startingNode: Uint8Array) => Promise<[PrefixedHexString, PrefixedHexString][] | undefined>;
//# sourceMappingURL=util.d.ts.map