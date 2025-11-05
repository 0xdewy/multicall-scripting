"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createBlockchain = createBlockchain;
exports.createBlockchainFromBlocksData = createBlockchainFromBlocksData;
const block_1 = require("@ethereumjs/block");
const util_1 = require("@ethereumjs/util");
const debug_1 = require("debug");
const index_ts_1 = require("./index.js");
const DEBUG = typeof window === 'undefined' ? (process?.env?.DEBUG?.includes('ethjs') ?? false) : false;
const debug = (0, debug_1.default)('blockchain:#');
async function createBlockchain(opts = {}) {
    const blockchain = new index_ts_1.Blockchain(opts);
    await blockchain.consensus?.setup({ blockchain });
    let stateRoot = opts.genesisBlock?.header.stateRoot ?? opts.genesisStateRoot;
    if (stateRoot === undefined) {
        if (blockchain['_customGenesisState'] !== undefined) {
            stateRoot = await (0, index_ts_1.genGenesisStateRoot)(blockchain['_customGenesisState'], blockchain.common);
        }
        else {
            stateRoot = await (0, index_ts_1.getGenesisStateRoot)(Number(blockchain.common.chainId()), blockchain.common);
        }
    }
    const genesisBlock = opts.genesisBlock ?? blockchain.createGenesisBlock(stateRoot);
    let genesisHash = await blockchain.dbManager.numberToHash(util_1.BIGINT_0);
    const dbGenesisBlock = genesisHash !== undefined ? await blockchain.dbManager.getBlock(genesisHash) : undefined;
    // If the DB has a genesis block, then verify that the genesis block in the
    // DB is indeed the Genesis block generated or assigned.
    if (dbGenesisBlock !== undefined && !(0, util_1.equalsBytes)(genesisBlock.hash(), dbGenesisBlock.hash())) {
        throw (0, util_1.EthereumJSErrorWithoutCode)('The genesis block in the DB has a different hash than the provided genesis block.');
    }
    genesisHash = genesisBlock.hash();
    if (!dbGenesisBlock) {
        // If there is no genesis block put the genesis block in the DB.
        // For that TD, the BlockOrHeader, and the Lookups have to be saved.
        const dbOps = [];
        dbOps.push((0, index_ts_1.DBSetTD)(genesisBlock.header.difficulty, util_1.BIGINT_0, genesisHash));
        (0, index_ts_1.DBSetBlockOrHeader)(genesisBlock).map((op) => dbOps.push(op));
        (0, index_ts_1.DBSaveLookups)(genesisHash, util_1.BIGINT_0).map((op) => dbOps.push(op));
        await blockchain.dbManager.batch(dbOps);
        await blockchain.consensus?.genesisInit(genesisBlock);
    }
    // At this point, we can safely set the genesis:
    // it is either the one we put in the DB, or it is equal to the one
    // which we read from the DB.
    blockchain['_genesisBlock'] = genesisBlock;
    // load verified iterator heads
    const heads = await blockchain.dbManager.getHeads();
    blockchain['_heads'] = heads ?? {};
    // load headerchain head
    let hash = await blockchain.dbManager.getHeadHeader();
    blockchain['_headHeaderHash'] = hash ?? genesisHash;
    // load blockchain head
    hash = await blockchain.dbManager.getHeadBlock();
    blockchain['_headBlockHash'] = hash ?? genesisHash;
    if (blockchain['_hardforkByHeadBlockNumber']) {
        const latestHeader = await blockchain['_getHeader'](blockchain['_headHeaderHash']);
        await blockchain.checkAndTransitionHardForkByNumber(latestHeader.number, latestHeader.timestamp);
    }
    DEBUG && debug(`genesis block initialized with hash ${(0, util_1.bytesToHex)(genesisHash)}`);
    return blockchain;
}
/**
 * Creates a blockchain from a list of block objects,
 * objects must be readable by {@link createBlock}
 *
 * @param blockData List of block objects
 * @param opts Constructor options, see {@link BlockchainOptions}
 */
async function createBlockchainFromBlocksData(blocksData, opts = {}) {
    const blockchain = await createBlockchain(opts);
    for (const blockData of blocksData) {
        const block = (0, block_1.createBlock)(blockData, {
            common: blockchain.common,
            setHardfork: true,
        });
        await blockchain.putBlock(block);
    }
    return blockchain;
}
//# sourceMappingURL=constructors.js.map