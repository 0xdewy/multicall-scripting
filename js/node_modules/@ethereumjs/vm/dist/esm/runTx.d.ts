import type { TypedTransaction } from '@ethereumjs/tx';
import type { RunTxOpts, RunTxResult, TxReceipt } from './types.ts';
import type { VM } from './vm.ts';
/**
 * @ignore
 */
export declare function runTx(vm: VM, opts: RunTxOpts): Promise<RunTxResult>;
/**
 * Returns the tx receipt.
 * @param vm The vm instance
 * @param tx The transaction
 * @param txResult The tx result
 * @param cumulativeGasUsed The gas used in the block including vm tx
 * @param blobGasUsed The blob gas used in the tx
 * @param blobGasPrice The blob gas price for the block including vm tx
 */
export declare function generateTxReceipt(vm: VM, tx: TypedTransaction, txResult: RunTxResult, cumulativeGasUsed: bigint, blobGasUsed?: bigint, blobGasPrice?: bigint): Promise<TxReceipt>;
//# sourceMappingURL=runTx.d.ts.map