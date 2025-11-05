import type { PrefixedHexString } from '@ethereumjs/util';
import type { StemAccessEvent, StemMeta } from './verkleAccessWitness.ts';
export declare class StemCache {
    cache: Map<PrefixedHexString, StemAccessEvent & StemMeta>;
    constructor();
    set(stemKey: PrefixedHexString, accessedStem: StemAccessEvent & StemMeta): void;
    get(stemHex: PrefixedHexString): (StemAccessEvent & StemMeta) | undefined;
    del(stemHex: PrefixedHexString): void;
    commit(): [PrefixedHexString, StemAccessEvent & StemMeta][];
    /**
     * Clear cache
     */
    clear(): void;
    /**
     * Returns the size of the cache
     * @returns
     */
    size(): number;
}
//# sourceMappingURL=stemCache.d.ts.map