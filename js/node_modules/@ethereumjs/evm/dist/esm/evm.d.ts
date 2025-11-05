import { Account, Address } from '@ethereumjs/util';
import { EventEmitter } from 'eventemitter3';
import { EVMError } from './errors.ts';
import { Journal } from './journal.ts';
import { EVMPerformanceLogger } from './logger.ts';
import { Message } from './message.ts';
import { TransientStorage } from './transientStorage.ts';
import { type Block, type CustomOpcode, type EVMBLSInterface, type EVMEvent, type EVMInterface, type EVMMockBlockchainInterface, type EVMOpts, type EVMResult, type EVMRunCallOpts, type EVMRunCodeOpts, type ExecResult } from './types.ts';
import type { Common, StateManagerInterface } from '@ethereumjs/common';
import type { BinaryTreeAccessWitness } from './binaryTreeAccessWitness.ts';
import type { InterpreterOpts } from './interpreter.ts';
import type { MessageWithTo } from './message.ts';
import type { AsyncDynamicGasHandler, SyncDynamicGasHandler } from './opcodes/gas.ts';
import type { OpHandler, OpcodeList, OpcodeMap } from './opcodes/index.ts';
import type { CustomPrecompile, PrecompileFunc } from './precompiles/index.ts';
import type { VerkleAccessWitness } from './verkleAccessWitness.ts';
export declare function OOGResult(gasLimit: bigint): ExecResult;
export declare function COOGResult(gasUsedCreateCode: bigint): ExecResult;
export declare function INVALID_BYTECODE_RESULT(gasLimit: bigint): ExecResult;
export declare function INVALID_EOF_RESULT(gasLimit: bigint): ExecResult;
export declare function CodesizeExceedsMaximumError(gasUsed: bigint): ExecResult;
export declare function EVMErrorResult(error: EVMError, gasUsed: bigint): ExecResult;
export declare function defaultBlock(): Block;
/**
 * EVM is responsible for executing an EVM message fully
 * (including any nested calls and creates), processing the results
 * and storing them to state (or discarding changes in case of exceptions).
 * @ignore
 */
export declare class EVM implements EVMInterface {
    protected static supportedHardforks: ("chainstart" | "homestead" | "dao" | "tangerineWhistle" | "spuriousDragon" | "byzantium" | "constantinople" | "petersburg" | "istanbul" | "muirGlacier" | "berlin" | "london" | "arrowGlacier" | "grayGlacier" | "mergeNetsplitBlock" | "paris" | "shanghai" | "cancun" | "prague" | "osaka" | "verkle")[];
    protected _tx?: {
        gasPrice: bigint;
        origin: Address;
    };
    protected _block?: Block;
    readonly common: Common;
    readonly events: EventEmitter<EVMEvent>;
    stateManager: StateManagerInterface;
    blockchain: EVMMockBlockchainInterface;
    journal: Journal;
    verkleAccessWitness?: VerkleAccessWitness;
    systemVerkleAccessWitness?: VerkleAccessWitness;
    binaryAccessWitness?: BinaryTreeAccessWitness;
    systemBinaryAccessWitness?: BinaryTreeAccessWitness;
    readonly transientStorage: TransientStorage;
    protected _opcodes: OpcodeList;
    readonly allowUnlimitedContractSize: boolean;
    readonly allowUnlimitedInitCodeSize: boolean;
    protected readonly _customOpcodes?: CustomOpcode[];
    protected readonly _customPrecompiles?: CustomPrecompile[];
    protected _handlers: Map<number, OpHandler>;
    protected _dynamicGasHandlers: Map<number, AsyncDynamicGasHandler | SyncDynamicGasHandler>;
    protected _opcodeMap: OpcodeMap;
    protected _precompiles: Map<string, PrecompileFunc>;
    protected readonly _optsCached: EVMOpts;
    protected performanceLogger: EVMPerformanceLogger;
    get precompiles(): Map<string, PrecompileFunc>;
    get opcodes(): OpcodeList;
    protected readonly _bls?: EVMBLSInterface;
    /**
     * EVM is run in DEBUG mode (default: false)
     * Taken from DEBUG environment variable
     *
     * Safeguards on debug() calls are added for
     * performance reasons to avoid string literal evaluation
     * @hidden
     */
    readonly DEBUG: boolean;
    protected readonly _emit: (topic: string, data: any) => Promise<void>;
    private _bn254;
    /**
     *
     * Creates new EVM object
     *
     * @deprecated The direct usage of this constructor is replaced since
     * non-finalized async initialization lead to side effects. Please
     * use the async {@link createEVM} constructor instead (same API).
     *
     * @param opts The EVM options
     * @param bn128 Initialized bn128 WASM object for precompile usage (internal)
     */
    constructor(opts: EVMOpts);
    /**
     * Returns a list with the currently activated opcodes
     * available for EVM execution
     */
    getActiveOpcodes(): OpcodeList;
    protected _executeCall(message: MessageWithTo): Promise<EVMResult>;
    protected _executeCreate(message: Message): Promise<EVMResult>;
    /**
     * Starts the actual bytecode processing for a CALL or CREATE
     */
    protected runInterpreter(message: Message, opts?: InterpreterOpts): Promise<ExecResult>;
    /**
     * Executes an EVM message, determining whether it's a call or create
     * based on the `to` address. It checkpoints the state and reverts changes
     * if an exception happens during the message execution.
     */
    runCall(opts: EVMRunCallOpts): Promise<EVMResult>;
    /**
     * Bound to the global VM and therefore
     * shouldn't be used directly from the evm class
     */
    runCode(opts: EVMRunCodeOpts): Promise<ExecResult>;
    /**
     * Returns code for precompile at the given address, or undefined
     * if no such precompile exists.
     */
    getPrecompile(address: Address): PrecompileFunc | undefined;
    /**
     * Executes a precompiled contract with given data and gas limit.
     */
    protected runPrecompile(code: PrecompileFunc, data: Uint8Array, gasLimit: bigint): Promise<ExecResult> | ExecResult;
    protected _loadCode(message: Message): Promise<void>;
    protected _generateAddress(message: Message): Promise<Address>;
    protected _reduceSenderBalance(account: Account, message: Message): Promise<void>;
    protected _addToBalance(toAccount: Account, message: MessageWithTo): Promise<void>;
    /**
     * Once the interpreter has finished depth 0, a post-message cleanup should be done
     */
    private postMessageCleanup;
    /**
     * This method copies the EVM, current HF and EIP settings
     * and returns a new EVM instance.
     *
     * Note: this is only a shallow copy and both EVM instances
     * will point to the same underlying state DB.
     *
     * @returns EVM
     */
    shallowCopy(): EVM;
    getPerformanceLogs(): {
        opcodes: import("./logger.ts").EVMPerformanceLogOutput[];
        precompiles: import("./logger.ts").EVMPerformanceLogOutput[];
    };
    clearPerformanceLogs(): void;
}
//# sourceMappingURL=evm.d.ts.map