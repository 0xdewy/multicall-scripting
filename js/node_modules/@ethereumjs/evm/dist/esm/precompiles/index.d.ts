import { type Address } from '@ethereumjs/util';
import { MCLBLS, NobleBLS } from './bls12_381/index.ts';
import { NobleBN254, RustBN254 } from './bn254/index.ts';
import type { Common } from '@ethereumjs/common';
import type { PrecompileFunc, PrecompileInput } from './types.ts';
interface PrecompileEntry {
    address: string;
    check: PrecompileAvailabilityCheckType;
    precompile: PrecompileFunc;
    name: string;
}
interface Precompiles {
    [key: string]: PrecompileFunc;
}
type PrecompileAvailabilityCheckType = PrecompileAvailabilityCheckTypeHardfork | PrecompileAvailabilityCheckTypeEIP;
export type PrecompileAvailabilityCheck = (typeof PrecompileAvailabilityCheck)[keyof typeof PrecompileAvailabilityCheck];
export declare const PrecompileAvailabilityCheck: {
    readonly EIP: "eip";
    readonly Hardfork: "hardfork";
};
interface PrecompileAvailabilityCheckTypeHardfork {
    type: typeof PrecompileAvailabilityCheck.Hardfork;
    param: string;
}
interface PrecompileAvailabilityCheckTypeEIP {
    type: typeof PrecompileAvailabilityCheck.EIP;
    param: number;
}
declare const ripemdPrecompileAddress: string;
declare const precompileEntries: PrecompileEntry[];
declare const precompiles: Precompiles;
type DeletePrecompile = {
    address: Address;
};
type AddPrecompile = {
    address: Address;
    function: PrecompileFunc;
};
type CustomPrecompile = AddPrecompile | DeletePrecompile;
declare function getActivePrecompiles(common: Common, customPrecompiles?: CustomPrecompile[]): Map<string, PrecompileFunc>;
declare function getPrecompileName(addressUnprefixedStr: string): string;
export { getActivePrecompiles, getPrecompileName, MCLBLS, NobleBLS, NobleBN254, precompileEntries, precompiles, ripemdPrecompileAddress, RustBN254, };
export type { AddPrecompile, CustomPrecompile, DeletePrecompile, PrecompileFunc, PrecompileInput };
//# sourceMappingURL=index.d.ts.map