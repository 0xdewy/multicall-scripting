import { type VerkleCrypto } from '@ethereumjs/util';
import type { InternalVerkleNode } from './internalNode.ts';
import type { LeafVerkleNode } from './leafNode.ts';
export type VerkleNodeType = (typeof VerkleNodeType)[keyof typeof VerkleNodeType];
export declare const VerkleNodeType: {
    readonly Internal: 0;
    readonly Leaf: 1;
};
export interface ChildNode {
    commitment: Uint8Array;
    path: Uint8Array;
}
export interface TypedVerkleNode {
    [VerkleNodeType.Internal]: InternalVerkleNode;
    [VerkleNodeType.Leaf]: LeafVerkleNode;
}
export type VerkleNode = TypedVerkleNode[VerkleNodeType];
export interface VerkleNodeInterface {
    hash(): Uint8Array;
    serialize(): Uint8Array;
}
interface BaseVerkleNodeOptions {
    commitment: Uint8Array;
    verkleCrypto: VerkleCrypto;
}
interface InternalVerkleNodeOptions extends BaseVerkleNodeOptions {
    children?: (ChildNode | null)[];
}
export type LeafVerkleNodeValue = (typeof LeafVerkleNodeValue)[keyof typeof LeafVerkleNodeValue];
export declare const LeafVerkleNodeValue: {
    readonly Untouched: 0;
    readonly Deleted: 1;
};
interface LeafVerkleNodeOptions extends BaseVerkleNodeOptions {
    stem: Uint8Array;
    values?: (Uint8Array | LeafVerkleNodeValue)[];
    c1?: Uint8Array;
    c2?: Uint8Array;
}
export interface VerkleNodeOptions {
    [VerkleNodeType.Internal]: InternalVerkleNodeOptions;
    [VerkleNodeType.Leaf]: LeafVerkleNodeOptions;
}
export declare const NODE_WIDTH = 256;
export {};
//# sourceMappingURL=types.d.ts.map