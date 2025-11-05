import type { BinaryTreeAccessWitnessInterface, VerkleAccessWitnessInterface } from '@ethereumjs/common';
import type { Address, PrefixedHexString } from '@ethereumjs/util';
import type { PrecompileFunc } from './precompiles/index.ts';
import type { EOFEnv } from './types.ts';
interface MessageOpts {
    to?: Address;
    value?: bigint;
    caller?: Address;
    gasLimit: bigint;
    data?: Uint8Array;
    eofCallData?: Uint8Array;
    depth?: number;
    code?: Uint8Array | PrecompileFunc;
    codeAddress?: Address;
    isStatic?: boolean;
    isCompiled?: boolean;
    salt?: Uint8Array;
    /**
     * A set of addresses to selfdestruct, see {@link Message.selfdestruct}
     */
    selfdestruct?: Set<PrefixedHexString>;
    /**
     * Map of addresses which were created (used in EIP 6780)
     */
    createdAddresses?: Set<PrefixedHexString>;
    delegatecall?: boolean;
    gasRefund?: bigint;
    blobVersionedHashes?: PrefixedHexString[];
    accessWitness?: VerkleAccessWitnessInterface | BinaryTreeAccessWitnessInterface;
}
export declare class Message {
    to?: Address;
    value: bigint;
    caller: Address;
    gasLimit: bigint;
    data: Uint8Array;
    eofCallData?: Uint8Array;
    isCreate?: boolean;
    depth: number;
    code?: Uint8Array | PrecompileFunc;
    _codeAddress?: Address;
    isStatic: boolean;
    isCompiled: boolean;
    salt?: Uint8Array;
    eof?: EOFEnv;
    chargeCodeAccesses?: boolean;
    /**
     * Set of addresses to selfdestruct. Key is the unprefixed address.
     */
    selfdestruct?: Set<PrefixedHexString>;
    /**
     * Map of addresses which were created (used in EIP 6780)
     */
    createdAddresses?: Set<PrefixedHexString>;
    delegatecall: boolean;
    gasRefund: bigint;
    /**
     * List of versioned hashes if message is a blob transaction in the outer VM
     */
    blobVersionedHashes?: PrefixedHexString[];
    accessWitness?: VerkleAccessWitnessInterface | BinaryTreeAccessWitnessInterface;
    constructor(opts: MessageOpts);
    /**
     * Note: should only be called in instances where `_codeAddress` or `to` is defined.
     */
    get codeAddress(): Address;
}
export type MessageWithTo = Message & Pick<Required<MessageOpts>, 'to'>;
export {};
//# sourceMappingURL=message.d.ts.map