import { bytesToHex, concatBytes, equalsBytes } from '@ethereumjs/util';
import { InternalVerkleNode, LeafVerkleNode, LeafVerkleNodeValue, decodeVerkleNode, } from "./node/index.js";
/**
 * Recursively walks down the tree from a given starting node and returns all the leaf values
 * @param tree - The verkle tree
 * @param startingNode - The starting node
 * @returns An array of key-value pairs containing the tree keys and associated values
 */
export const dumpLeafValues = async (tree, startingNode) => {
    if (equalsBytes(startingNode, tree.EMPTY_TREE_ROOT) === true)
        return;
    // Retrieve starting node from DB
    const rawNode = await tree['_db'].get(startingNode);
    if (rawNode === undefined)
        return;
    const node = decodeVerkleNode(rawNode, tree['verkleCrypto']);
    const entries = [];
    if (node instanceof LeafVerkleNode) {
        for (const [idx, val] of node.values.entries()) {
            if (val !== LeafVerkleNodeValue.Untouched) {
                entries.push([
                    bytesToHex(concatBytes(node.stem, Uint8Array.from([idx]))),
                    bytesToHex(val === LeafVerkleNodeValue.Deleted ? new Uint8Array(32) : val),
                ]);
            }
        }
        return entries;
    }
    else {
        const childPaths = node.children
            .filter((value) => value !== null)
            .map((value) => dumpLeafValues(tree, tree['verkleCrypto'].hashCommitment(value.commitment)));
        const res = (await Promise.all(childPaths)).filter((val) => val !== undefined);
        return res.flat(1);
    }
};
/**
 * Recursively walks down the tree from a given starting node and returns all the node paths and hashes
 * @param tree - The verkle tree
 * @param startingNode - The starting node
 * @returns An array of key-value pairs containing the tree paths and associated hashes
 */
export const dumpNodeHashes = async (tree, startingNode) => {
    let entries = [];
    // Retrieve starting node from DB
    const rawNode = await tree['_db'].get(startingNode);
    if (rawNode === undefined)
        return;
    const node = decodeVerkleNode(rawNode, tree['verkleCrypto']);
    // If current node is root, push '0x' for path and node hash for commitment
    equalsBytes(startingNode, tree.root()) && entries.push(['0x', bytesToHex(startingNode)]);
    if (node instanceof InternalVerkleNode) {
        const children = node.children.filter((value) => value !== null);
        // Push non-null children paths and hashes
        for (const child of children) {
            entries.push([
                bytesToHex(child.path),
                bytesToHex(tree['verkleCrypto'].hashCommitment(child.commitment)),
            ]);
        }
        // Recursively call dumpNodeHashes on each child node
        const childPaths = (await Promise.all(children.map((value) => dumpNodeHashes(tree, tree['verkleCrypto'].hashCommitment(value.commitment)))))
            .filter((val) => val !== undefined)
            .flat(1);
        // Add all child paths and hashes to entries
        entries = [...entries, ...childPaths];
    }
    return entries;
};
//# sourceMappingURL=util.js.map