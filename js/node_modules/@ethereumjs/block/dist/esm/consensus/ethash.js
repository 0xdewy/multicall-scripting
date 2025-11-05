/**
 * Returns the canonical difficulty for this block.
 *
 * @param parentBlock - the parent of this `Block`
 */
export function ethashCanonicalDifficulty(block, parentBlock) {
    return block.header.ethashCanonicalDifficulty(parentBlock.header);
}
//# sourceMappingURL=ethash.js.map