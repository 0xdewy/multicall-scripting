"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DBOp = void 0;
exports.DBSaveLookups = DBSaveLookups;
exports.DBSetBlockOrHeader = DBSetBlockOrHeader;
exports.DBSetHashToNumber = DBSetHashToNumber;
exports.DBSetTD = DBSetTD;
const block_1 = require("@ethereumjs/block");
const rlp_1 = require("@ethereumjs/rlp");
const util_1 = require("@ethereumjs/util");
const constants_ts_1 = require("./constants.js");
const operation_ts_1 = require("./operation.js");
Object.defineProperty(exports, "DBOp", { enumerable: true, get: function () { return operation_ts_1.DBOp; } });
/*
 * This extra helper file serves as an interface between the blockchain API functionality
 * and the DB operations from `db/operation.ts` and also handles the right encoding of the keys
 */
function DBSetTD(TD, blockNumber, blockHash) {
    return operation_ts_1.DBOp.set(operation_ts_1.DBTarget.TotalDifficulty, rlp_1.RLP.encode(TD), {
        blockNumber,
        blockHash,
    });
}
/*
 * This method accepts either a BlockHeader or a Block and returns a list of DatabaseOperation instances
 *
 * - A "Set Header Operation" is always added
 * - A "Set Body Operation" is only added if the body is not empty (it has transactions/uncles) or if the block is the genesis block
 * (if there is a header but no block saved the DB will implicitly assume the block to be empty)
 */
function DBSetBlockOrHeader(blockBody) {
    const header = blockBody instanceof block_1.Block ? blockBody.header : blockBody;
    const dbOps = [];
    const blockNumber = header.number;
    const blockHash = header.hash();
    const headerValue = header.serialize();
    dbOps.push(operation_ts_1.DBOp.set(operation_ts_1.DBTarget.Header, headerValue, {
        blockNumber,
        blockHash,
    }));
    const isGenesis = header.number === util_1.BIGINT_0;
    if (isGenesis || blockBody instanceof block_1.Block) {
        const bodyValue = rlp_1.RLP.encode(blockBody.raw().slice(1));
        dbOps.push(operation_ts_1.DBOp.set(operation_ts_1.DBTarget.Body, bodyValue, {
            blockNumber,
            blockHash,
        }));
    }
    return dbOps;
}
function DBSetHashToNumber(blockHash, blockNumber) {
    const blockNumber8Byte = (0, constants_ts_1.bytesBE8)(blockNumber);
    return operation_ts_1.DBOp.set(operation_ts_1.DBTarget.HashToNumber, blockNumber8Byte, {
        blockHash,
    });
}
function DBSaveLookups(blockHash, blockNumber, skipNumIndex) {
    const ops = [];
    if (skipNumIndex !== true) {
        ops.push(operation_ts_1.DBOp.set(operation_ts_1.DBTarget.NumberToHash, blockHash, { blockNumber }));
    }
    const blockNumber8Bytes = (0, constants_ts_1.bytesBE8)(blockNumber);
    ops.push(operation_ts_1.DBOp.set(operation_ts_1.DBTarget.HashToNumber, blockNumber8Bytes, {
        blockHash,
    }));
    return ops;
}
//# sourceMappingURL=helpers.js.map