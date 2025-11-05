import { KeyEncoding, ValueEncoding } from '@ethereumjs/util';
import type { CacheMap } from './manager.ts';
export type DBTarget = (typeof DBTarget)[keyof typeof DBTarget];
export declare const DBTarget: {
    readonly Heads: 0;
    readonly HeadHeader: 1;
    readonly HeadBlock: 2;
    readonly HashToNumber: 3;
    readonly NumberToHash: 4;
    readonly TotalDifficulty: 5;
    readonly Body: 6;
    readonly Header: 7;
    readonly CliqueSignerStates: 8;
    readonly CliqueVotes: 9;
    readonly CliqueBlockSigners: 10;
};
/**
 * DBOpData is a type which has the purpose of holding the actual data of the Database Operation.
 * @hidden
 */
export interface DBOpData {
    type?: 'put' | 'del';
    key: Uint8Array | string;
    keyEncoding: KeyEncoding;
    valueEncoding?: ValueEncoding;
    value?: Uint8Array | object;
}
export type DatabaseKey = {
    blockNumber?: bigint;
    blockHash?: Uint8Array;
};
/**
 * The DBOp class aids creating database operations which is used by `level` using a more high-level interface
 */
export declare class DBOp {
    operationTarget: DBTarget;
    baseDBOp: DBOpData;
    cacheString: string | undefined;
    private constructor();
    static get(operationTarget: DBTarget, key?: DatabaseKey): DBOp;
    static set(operationTarget: DBTarget, value: Uint8Array | object, key?: DatabaseKey): DBOp;
    static del(operationTarget: DBTarget, key?: DatabaseKey): DBOp;
    updateCache(cacheMap: CacheMap): void;
}
//# sourceMappingURL=operation.d.ts.map