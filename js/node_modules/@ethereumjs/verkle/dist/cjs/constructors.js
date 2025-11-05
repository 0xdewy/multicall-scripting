"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createVerkleTree = createVerkleTree;
const util_1 = require("@ethereumjs/util");
const verkle = require("micro-eth-signer/verkle");
const types_ts_1 = require("./types.js");
const verkleTree_ts_1 = require("./verkleTree.js");
async function createVerkleTree(opts) {
    const key = types_ts_1.ROOT_DB_KEY;
    // Provide sensible default options
    const parsedOptions = {
        ...opts,
        db: opts?.db ?? new util_1.MapDB(),
        verkleCrypto: opts?.verkleCrypto ?? verkle,
        useRootPersistence: opts?.useRootPersistence ?? false,
        cacheSize: opts?.cacheSize ?? 0,
    };
    if (parsedOptions.useRootPersistence === true) {
        if (parsedOptions.root === undefined) {
            parsedOptions.root = await parsedOptions.db.get(key, {
                keyEncoding: util_1.KeyEncoding.Bytes,
                valueEncoding: util_1.ValueEncoding.Bytes,
            });
        }
        else {
            await parsedOptions.db.put(key, parsedOptions.root, {
                keyEncoding: util_1.KeyEncoding.Bytes,
                valueEncoding: util_1.ValueEncoding.Bytes,
            });
        }
    }
    const trie = new verkleTree_ts_1.VerkleTree(parsedOptions);
    // If the root node does not exist, initialize the empty root node
    if (parsedOptions.root === undefined)
        await trie.createRootNode();
    return trie;
}
//# sourceMappingURL=constructors.js.map