import type { PrefixedHexString } from '@ethereumjs/util';
import type { ChunkAccessEvent } from './verkleAccessWitness.ts';
export declare class ChunkCache {
    cache: Map<PrefixedHexString, ChunkAccessEvent>;
    constructor();
    set(stemKey: PrefixedHexString, accessedStem: ChunkAccessEvent): void;
    get(stemHex: PrefixedHexString): ChunkAccessEvent | undefined;
    del(stemHex: PrefixedHexString): void;
    commit(): [PrefixedHexString, ChunkAccessEvent][];
    clear(): void;
    size(): number;
}
//# sourceMappingURL=chunkCache.d.ts.map