"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DBOp = exports.DBTarget = void 0;
const util_1 = require("@ethereumjs/util");
const constants_ts_1 = require("./constants.js");
exports.DBTarget = {
    Heads: 0,
    HeadHeader: 1,
    HeadBlock: 2,
    HashToNumber: 3,
    NumberToHash: 4,
    TotalDifficulty: 5,
    Body: 6,
    Header: 7,
    CliqueSignerStates: 8,
    CliqueVotes: 9,
    CliqueBlockSigners: 10,
};
/**
 * The DBOp class aids creating database operations which is used by `level` using a more high-level interface
 */
class DBOp {
    constructor(operationTarget, key) {
        this.operationTarget = operationTarget;
        this.baseDBOp = {
            key: '',
            keyEncoding: util_1.KeyEncoding.Bytes,
            valueEncoding: util_1.ValueEncoding.Bytes,
        };
        switch (operationTarget) {
            case exports.DBTarget.Heads: {
                this.baseDBOp.key = constants_ts_1.HEADS_KEY;
                this.baseDBOp.valueEncoding = util_1.ValueEncoding.JSON;
                break;
            }
            case exports.DBTarget.HeadHeader: {
                this.baseDBOp.key = constants_ts_1.HEAD_HEADER_KEY;
                this.baseDBOp.keyEncoding = util_1.KeyEncoding.String;
                break;
            }
            case exports.DBTarget.HeadBlock: {
                this.baseDBOp.key = constants_ts_1.HEAD_BLOCK_KEY;
                this.baseDBOp.keyEncoding = util_1.KeyEncoding.String;
                break;
            }
            case exports.DBTarget.HashToNumber: {
                this.baseDBOp.key = (0, constants_ts_1.hashToNumberKey)(key.blockHash);
                this.cacheString = 'hashToNumber';
                break;
            }
            case exports.DBTarget.NumberToHash: {
                this.baseDBOp.key = (0, constants_ts_1.numberToHashKey)(key.blockNumber);
                this.cacheString = 'numberToHash';
                break;
            }
            case exports.DBTarget.TotalDifficulty: {
                this.baseDBOp.key = (0, constants_ts_1.tdKey)(key.blockNumber, key.blockHash);
                this.cacheString = 'td';
                break;
            }
            case exports.DBTarget.Body: {
                this.baseDBOp.key = (0, constants_ts_1.bodyKey)(key.blockNumber, key.blockHash);
                this.cacheString = 'body';
                break;
            }
            case exports.DBTarget.Header: {
                this.baseDBOp.key = (0, constants_ts_1.headerKey)(key.blockNumber, key.blockHash);
                this.cacheString = 'header';
                break;
            }
        }
    }
    static get(operationTarget, key) {
        return new DBOp(operationTarget, key);
    }
    // set operation: note: value/key is not in default order
    static set(operationTarget, value, key) {
        const dbOperation = new DBOp(operationTarget, key);
        dbOperation.baseDBOp.value = value;
        dbOperation.baseDBOp.type = 'put';
        if (operationTarget === exports.DBTarget.Heads) {
            dbOperation.baseDBOp.valueEncoding = util_1.ValueEncoding.JSON;
        }
        else {
            dbOperation.baseDBOp.valueEncoding = util_1.ValueEncoding.Bytes;
        }
        return dbOperation;
    }
    static del(operationTarget, key) {
        const dbOperation = new DBOp(operationTarget, key);
        dbOperation.baseDBOp.type = 'del';
        return dbOperation;
    }
    updateCache(cacheMap) {
        if (this.cacheString !== undefined && cacheMap[this.cacheString] !== undefined) {
            if (this.baseDBOp.type === 'put') {
                this.baseDBOp.value instanceof Uint8Array &&
                    cacheMap[this.cacheString].set(this.baseDBOp.key, this.baseDBOp.value);
            }
            else if (this.baseDBOp.type === 'del') {
                cacheMap[this.cacheString].del(this.baseDBOp.key);
            }
            else {
                throw (0, util_1.EthereumJSErrorWithoutCode)('unsupported db operation on cache');
            }
        }
    }
}
exports.DBOp = DBOp;
//# sourceMappingURL=operation.js.map