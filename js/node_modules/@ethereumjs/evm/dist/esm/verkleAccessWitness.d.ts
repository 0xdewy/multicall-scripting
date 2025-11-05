import { ChunkCache } from './chunkCache.ts';
import { StemCache } from './stemCache.ts';
import type { AccessEventFlags, RawVerkleAccessedState, VerkleAccessWitnessInterface, VerkleAccessedState, VerkleAccessedStateWithAddress } from '@ethereumjs/common';
import type { StatefulVerkleStateManager } from '@ethereumjs/statemanager';
import type { Address, PrefixedHexString, VerkleCrypto, VerkleExecutionWitness } from '@ethereumjs/util';
export type StemAccessEvent = {
    write?: boolean;
};
export type ChunkAccessEvent = StemAccessEvent & {
    fill?: boolean;
};
export type StemMeta = {
    address: Address;
    treeIndex: number | bigint;
};
export declare function decodeAccessedState(treeIndex: number | bigint, chunkIndex: number): VerkleAccessedState;
export declare class VerkleAccessWitness implements VerkleAccessWitnessInterface {
    stems: Map<PrefixedHexString, StemAccessEvent & StemMeta>;
    chunks: Map<PrefixedHexString, ChunkAccessEvent>;
    stemCache: StemCache;
    chunkCache: ChunkCache;
    verkleCrypto: VerkleCrypto;
    constructor(opts: {
        verkleCrypto: VerkleCrypto;
        stems?: Map<PrefixedHexString, StemAccessEvent & StemMeta>;
        chunks?: Map<PrefixedHexString, ChunkAccessEvent>;
    });
    readAccountBasicData(address: Address): bigint;
    writeAccountBasicData(address: Address): bigint;
    readAccountCodeHash(address: Address): bigint;
    writeAccountCodeHash(address: Address): bigint;
    readAccountHeader(address: Address): bigint;
    writeAccountHeader(address: Address): bigint;
    readAccountCodeChunks(contract: Address, startPc: number, endPc: number): bigint;
    writeAccountCodeChunks(contract: Address, startPc: number, endPc: number): bigint;
    readAccountStorage(address: Address, storageSlot: bigint): bigint;
    writeAccountStorage(address: Address, storageSlot: bigint): bigint;
    touchAddressOnWriteAndComputeGas(address: Address, treeIndex: number | bigint, subIndex: number | Uint8Array): bigint;
    touchAddressOnReadAndComputeGas(address: Address, treeIndex: number | bigint, subIndex: number | Uint8Array): bigint;
    touchAddressAndComputeGas(address: Address, treeIndex: number | bigint, subIndex: number | Uint8Array, { isWrite }: {
        isWrite?: boolean;
    }): bigint;
    touchAddress(address: Address, treeIndex: number | bigint, subIndex: number | Uint8Array, { isWrite }?: {
        isWrite?: boolean;
    }): AccessEventFlags;
    merge(accessWitness: VerkleAccessWitness): void;
    commit(): void;
    revert(): void;
    debugWitnessCost(): void;
    rawAccesses(): Generator<RawVerkleAccessedState>;
    accesses(): Generator<VerkleAccessedStateWithAddress>;
}
/**
 * Generate a {@link VerkleExecutionWitness} from a state manager and an access witness.
 * @param stateManager - The state manager containing the state to generate the witness for.
 * @param accessWitness - The access witness containing the accessed states.
 * @param parentStateRoot - The parent state root (i.e. prestate root) to generate the witness for.
 * @returns The generated verkle execution witness
 *
 * Note: This does not provide the verkle proof, which is not implemented
 */
export declare const generateExecutionWitness: (stateManager: StatefulVerkleStateManager, accessWitness: VerkleAccessWitness, parentStateRoot: Uint8Array) => Promise<VerkleExecutionWitness>;
//# sourceMappingURL=verkleAccessWitness.d.ts.map