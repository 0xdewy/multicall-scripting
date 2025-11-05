"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ethashCanonicalDifficulty = ethashCanonicalDifficulty;
/**
 * Returns the canonical difficulty for this block.
 *
 * @param parentBlock - the parent of this `Block`
 */
function ethashCanonicalDifficulty(block, parentBlock) {
    return block.header.ethashCanonicalDifficulty(parentBlock.header);
}
//# sourceMappingURL=ethash.js.map