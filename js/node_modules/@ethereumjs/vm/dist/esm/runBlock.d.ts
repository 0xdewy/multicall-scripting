import { type EVMInterface } from '@ethereumjs/evm';
import { TransactionType } from '@ethereumjs/tx';
import { Account, Address } from '@ethereumjs/util';
import type { Common } from '@ethereumjs/common';
import type { RunBlockOpts, RunBlockResult, TxReceipt } from './types.ts';
import type { VM } from './vm.ts';
/**
 * Processes the `block` running all of the transactions it contains and updating the miner's account
 *
 * vm method modifies the state. If `generate` is `true`, the state modifications will be
 * reverted if an exception is raised. If it's `false`, it won't revert if the block's header is
 * invalid. If an error is thrown from an event handler, the state may or may not be reverted.
 *
 * @param {VM} vm
 * @param {RunBlockOpts} opts - Default values for options:
 *  - `generate`: false
 */
export declare function runBlock(vm: VM, opts: RunBlockOpts): Promise<RunBlockResult>;
/**
 * vm method runs the logic of EIP 2935 (save blockhashes to state)
 * It will put the `parentHash` of the block to the storage slot of `block.number - 1` of the history storage contract.
 * vm contract is used to retrieve BLOCKHASHes in EVM if EIP 2935 is activated.
 * In case that the previous block of `block` is pre-EIP-2935 (so we are on the EIP 2935 fork block), additionally
 * also add the currently available past blockhashes which are available by BLOCKHASH (so, the past 256 block hashes)
 * @param vm The VM to run on
 * @param block The current block to save the parent block hash of
 */
export declare function accumulateParentBlockHash(vm: VM, currentBlockNumber: bigint, parentHash: Uint8Array): Promise<void>;
export declare function accumulateParentBeaconBlockRoot(vm: VM, root: Uint8Array, timestamp: bigint): Promise<void>;
export declare function calculateMinerReward(minerReward: bigint, ommersNum: number): bigint;
export declare function rewardAccount(evm: EVMInterface, address: Address, reward: bigint, common: Common): Promise<Account>;
/**
 * Returns the encoded tx receipt.
 */
export declare function encodeReceipt(receipt: TxReceipt, txType: (typeof TransactionType)[keyof typeof TransactionType]): Uint8Array<ArrayBufferLike>;
//# sourceMappingURL=runBlock.d.ts.map