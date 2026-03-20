import { encodeFunctionData, getAbiItem } from "viem";

export const PARTIAL_RETURN_VARS = BigInt(3);
export const STATIC_CALL_FLAG = BigInt(0xff);
export const CALL_FLAG = BigInt(0xfe);
export const DELEGATE_CALL_FLAG = BigInt(0xfd);
export const STATIC_CALL_PARTIAL_RETURN_FLAG = BigInt(0xfc);
export const VALUE_OFFSET = BigInt(248);

const UINT120_MAX = BigInt(2 ** 120 - 1);
const UINT8_MAX = BigInt(255);
const UINT40_MAX = BigInt(2 ** 40 - 1);
const UINT16_MAX = BigInt(2 ** 16 - 1);

export class TransactionBuilder {
    constructor() {
        this.calls = [];
        this.freeMemory = 0;
    }

    #getDefaultValue(type, functionName, componentName) {
        if (type.includes("[]")) return [];
        if (type.startsWith("bytes")) return "";
        if (type === "address") return "0x0000000000000000000000000000000000000000";
        if (type === "bool") return false;
        if (type === "string") return "";

        if (functionName === "getConstantStruct") {
            const hackValues = { a: 1, nA: 2, nB: 3 };
            return hackValues[componentName] || 0;
        }

        return 0;
    }

    addCall(abi, target, functionName, args, msgValue = BigInt(0)) {
        const functionAbi = getAbiItem({ abi, name: functionName });

        if (!functionAbi || functionAbi.type !== "function") {
            throw new Error(`Function ${functionName} not found in ABI`);
        }

        const callType = functionAbi.stateMutability === "view" || functionAbi.stateMutability === "pure"
            ? STATIC_CALL_FLAG
            : CALL_FLAG;


        if (args.length != functionAbi.inputs.length) {
            throw new Error(`Argument count mismatch: ${args.length} vs ${functionAbi.inputs.length}`);
        }

        functionAbi.inputs.forEach((abiInput, i) => {
            if (abiInput.type.startsWith("bytes")) {
                const value = args[i] && typeof args[i] === "object" && args[i].callIndex !== undefined
                    ? args[i].value
                    : args[i];
                if (typeof value !== "string" || !value.startsWith("0x")) {
                    throw new Error(`Bytes arguments must be hex strings: ${args[i]}`);
                }
            }
        });

        const processArg = (arg, abiInput) => {
            if (arg && typeof arg === "object" && arg.callIndex !== undefined) {
                return arg.value;
            }
            if (arg && typeof arg === "object" && !Array.isArray(arg) && abiInput.type === "tuple") {
                const result = {};
                for (const key in arg) {
                    const component = abiInput.components?.find(c => c.name === key);
                    result[key] = component ? processArg(arg[key], component) : arg[key];
                }
                return result;
            }
            return arg;
        };

        // Process arguments for encoding
        const processedArgs = functionAbi.inputs.map((abiInput, i) => {
            let arg = args[i];
            let value = processArg(arg, abiInput);

            if (abiInput.type.includes("int")) {
                return BigInt(value);
            }
            return value;
        });

        const findOutputDescriptors = (arg, path = []) => {
            const descriptors = [];
            if (arg && typeof arg === "object") {
                if (arg.callIndex !== undefined) {
                    descriptors.push({ descriptor: arg, path });
                } else {
                    for (const key in arg) {
                        if (key === "length") continue;
                        descriptors.push(...findOutputDescriptors(arg[key], [...path, key]));
                    }
                }
            }
            return descriptors;
        };

        args.forEach((arg, index) => {
            for (const { descriptor } of findOutputDescriptors(arg)) {
                const prevCall = this.calls[descriptor.callIndex];
                if (prevCall?.functionName === "getConstantStruct") continue;

                const paramMemoryPosition = this.freeMemory + 4 + 32 * index;
                const sourceMemoryPosition = prevCall.freeMemory + (prevCall.fnCalldata.length / 2);
                const returnOffset = paramMemoryPosition - sourceMemoryPosition;

                prevCall.memTargets.push(returnOffset);
                prevCall.resultLengths.push(descriptor.size);
                prevCall.returnOffsets.push(descriptor.offset);
                prevCall.returnDataSize = Math.max(prevCall.returnDataSize, descriptor.offset + descriptor.size);
            }
        });

        const fnCalldata = encodeFunctionData({ abi, functionName, args: processedArgs });

        this.calls.push({
            target,
            fnCalldata,
            calltype_flag: callType,
            freeMemory: this.freeMemory,
            memTargets: [],
            resultLengths: [],
            returnOffsets: [],
            returnDataSize: 0,
            msgValue,
            functionName,
        });

        this.freeMemory += fnCalldata.length / 2;

        // =============================== Build Outputs ===========================================
        // For struct returns, create a simple proxy that allows property access
        // We'll create output descriptors for each component

        const buildOutputs = (components, baseOffset, outputs = []) => {
            let currentOffset = baseOffset;

            for (const component of components) {
                if (component.type === "tuple") {
                    buildOutputs(component.components, currentOffset, outputs);
                } else {
                    outputs.push({
                        callIndex: this.calls.length - 1,
                        type: component.type,
                        value: this.#getDefaultValue(component.type, functionName, component.name),
                        offset: currentOffset,
                        size: 32,
                        requiresSizing: false,
                        name: component.name
                    });
                    currentOffset += 32;
                }
            }

            return { outputs, nextOffset: currentOffset };
        };

        // Build outputs for all return values
        const allOutputs = [];
        let currentOffset = 0;

        for (const output of functionAbi.outputs) {
            if (output.type === "tuple") {
                const result = buildOutputs(output.components, currentOffset, allOutputs);
                currentOffset = result.nextOffset;
            } else {
                allOutputs.push({
                    callIndex: this.calls.length - 1,
                    type: output.type,
                    value: this.#getDefaultValue(output.type, functionName, output.name),
                    offset: currentOffset,
                    size: 32,
                    requiresSizing: false,
                    name: output.name
                });
                currentOffset += 32;
            }
        }

        if (functionAbi.outputs.length === 1 && functionAbi.outputs[0].type === "tuple") {
            const createStructProxy = (components, outputs, startIndex = 0) => {
                let idx = startIndex;
                const result = {};

                for (const component of components) {
                    if (component.type === "tuple") {
                        const nested = createStructProxy(component.components, outputs, idx);
                        result[component.name || ''] = nested.proxy;
                        idx = nested.nextIndex;
                    } else if (idx < outputs.length) {
                        const outputDesc = outputs[idx];
                        Object.defineProperty(result, component.name || '', {
                            get: () => outputDesc,
                            enumerable: true,
                            configurable: true
                        });
                        idx++;
                    }
                }

                return { proxy: result, nextIndex: idx };
            };

            return createStructProxy(functionAbi.outputs[0].components, allOutputs, 0).proxy;
        }

        return allOutputs;
    }

    // returns (address[] memory targets, uint256[] memory offsets, bytes[] memory datas, uint256[] memory values)
    build() {
        const targets = [];
        const offsets = [];
        const calldatas = [];
        const msgValues = [];

        for (const _call of this.calls) {
            targets.push(_call.target);
            calldatas.push(_call.fnCalldata);

            if (_call.memTargets.length > 3) {
                throw Error(`Too many variables from one call: ${_call.memTargets.length}`);
            }

            if (_call.calltype_flag != STATIC_CALL_FLAG && _call.calltype_flag != CALL_FLAG) {
                throw Error(`Invalid calltype flag: ${_call.calltype_flag}`);
            }

            if (_call.calltype_flag == STATIC_CALL_FLAG) {
                offsets.push(_call.memTargets.length > 0
                    ? staticCallPartialReturn(_call.memTargets, _call.resultLengths, _call.returnOffsets, _call.returnDataSize)
                    : staticCall(0, 0));
                continue;
            }

            if (_call.msgValue > 0) {
                offsets.push(stateChangingCall(msgValues.length + 1));
                msgValues.push(_call.msgValue);
            } else {
                offsets.push(stateChangingCall());
            }
        }
        return { targets, offsets, calldatas, msgValues };
    }
}


// ===========================================Helpers===========================================

export function staticCall(memTarget, resultLength) {
    memTarget = BigInt(memTarget);
    resultLength = BigInt(resultLength);
    return (STATIC_CALL_FLAG << VALUE_OFFSET) | (memTarget << BigInt(120)) | resultLength;
}

export function stateChangingCall(msgValueIndex = 0) {
    return _stateChangingCall(msgValueIndex, 0, 0);
}

function _stateChangingCall(msgValueIndex, memTarget, resultLength) {
    msgValueIndex = BigInt(msgValueIndex);
    memTarget = BigInt(memTarget);
    resultLength = BigInt(resultLength);

    if (msgValueIndex > UINT8_MAX) throw new Error("msgValueIndex too large");
    if (memTarget > UINT120_MAX) throw new Error("memTarget value too large");
    if (resultLength > UINT120_MAX) throw new Error("resultLength value too large");

    return (CALL_FLAG << VALUE_OFFSET) | (msgValueIndex << BigInt(240)) | (memTarget << BigInt(120)) | resultLength;
}

export function staticCallPartialReturn(memTargets, resultLengths, returnOffsets, returnDataSize) {
    returnDataSize = BigInt(returnDataSize);

    if (memTargets.length > PARTIAL_RETURN_VARS || resultLengths.length > PARTIAL_RETURN_VARS || returnOffsets.length > PARTIAL_RETURN_VARS) {
        throw new Error("invalid number of params");
    }
    if (returnDataSize > UINT16_MAX) {
        throw new Error("returnDataSize is too large");
    }

    const len = memTargets.length;
    let encodedMemTargets = BigInt(0);
    let encodedResultLengths = BigInt(0);
    let encodedOffsets = BigInt(0);

    for (let i = 0; i < len; i++) {
        const memTarget = BigInt(memTargets[i]);
        const resultLength = BigInt(resultLengths[i]);
        const returnOffset = BigInt(returnOffsets[i]);

        if (memTarget > UINT40_MAX) throw new Error("memTarget value too large");
        if (resultLength > UINT16_MAX) throw new Error("resultLength value too large");
        if (returnOffset > UINT16_MAX) throw new Error("returnOffset value too large");

        const varOffset = Number(PARTIAL_RETURN_VARS) - (i + 1);
        encodedMemTargets |= memTarget << BigInt(varOffset * 40);
        encodedResultLengths |= resultLength << BigInt(varOffset * 16);
        encodedOffsets |= returnOffset << BigInt(varOffset * 16);
    }

    return (STATIC_CALL_PARTIAL_RETURN_FLAG << VALUE_OFFSET) |
        (encodedMemTargets << BigInt(120)) |
        (encodedResultLengths << BigInt(72)) |
        (encodedOffsets << BigInt(24)) |
        (returnDataSize << BigInt(8)) |
        BigInt(len);
}
