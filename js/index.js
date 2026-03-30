import { encodeFunctionData, getAbiItem } from "viem";

// =========================================== Constants ===========================================
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

// =========================================== Type Utilities ===========================================
const TypeUtils = {
    isDynamicType(type) {
        if (type === "bytes" || type === "string") return true;
        if (type.includes("[]")) {
            const elementType = type.replace("[]", "");
            return !(elementType === "string" || elementType === "bytes");
        }
        return false;
    },

    getElementType(arrayType) {
        return arrayType.replace("[]", "");
    },

    isArrayType(type) {
        return type.includes("[]");
    },

    isBytesType(type) {
        return type.startsWith("bytes");
    },

    isIntType(type) {
        return type.includes("int");
    },

    isTupleType(type) {
        return type === "tuple";
    },

    getDefaultValue(type, functionName = "", componentName = "") {
        if (type.includes("[]")) return [];
        if (type.startsWith("bytes")) return "";
        if (type === "address") return "0x0000000000000000000000000000000000000000";
        if (type === "bool") return false;
        if (type === "string") return "";

        if (functionName === "getConstantStruct") {
            const hackValues = { a: 1, nA: 2, nB: 3 };
            return hackValues[componentName] || 0;
        }

        if (type.includes("int")) return 0n;
        return 0;
    }
};

// =========================================== Helper Functions ===========================================
const DescriptorUtils = {
    createDynamicDescriptor(callIndex, type, offset, functionName = "", componentName = "") {
        const descriptor = {
            callIndex,
            type,
            value: TypeUtils.getDefaultValue(type, functionName, componentName),
            offset,
            size: 32,
            isDynamic: true,
            requiresLength: true,
            length: null,
            name: componentName
        };
        
        if (TypeUtils.isArrayType(type)) {
            const elementType = TypeUtils.getElementType(type);
            if (elementType !== "string" && elementType !== "bytes") {
                descriptor.elementType = elementType;
            }
        }
        
        return descriptor;
    },
    
    createStaticDescriptor(callIndex, type, offset, functionName = "", componentName = "") {
        return {
            callIndex,
            type,
            value: TypeUtils.getDefaultValue(type, functionName, componentName),
            offset,
            size: 32,
            requiresSizing: false,
            name: componentName
        };
    },
    
    setupDynamicDescriptor(descriptor, n) {
        if (n <= 0) throw new Error(`${descriptor.type} length must be positive`);
        descriptor.length = n;
        descriptor.requiresLength = false;
        
        if (TypeUtils.isArrayType(descriptor.type)) {
            const elementType = TypeUtils.getElementType(descriptor.type);
            if (elementType === "string" || elementType === "bytes") {
                throw new Error(`String/bytes arrays are not supported: ${descriptor.type}`);
            }
            descriptor.size = 32 + n * 32;
            descriptor.value = new Array(n).fill(TypeUtils.getDefaultValue(elementType, "", ""));
        } else if (descriptor.type === "bytes") {
            descriptor.size = 32 + Math.ceil(n / 32) * 32;
            descriptor.value = "0x" + "00".repeat(n);
        } else if (descriptor.type === "string") {
            descriptor.size = 32 + Math.ceil(n / 32) * 32;
            descriptor.value = " ".repeat(n);
        }
        descriptor.dataOffset = 32;
        return descriptor;
    },
    
    createWithLengthMethod(builder) {
        return function(n) {
            DescriptorUtils.setupDynamicDescriptor(this, n);
            return this;
        };
    }
};

export class TransactionBuilder {
    constructor() {
        this.calls = [];
        this.freeMemory = 0;
        this.usedDescriptors = new Set();
    }



    #createArrayProxy(arrayDesc) {
        const handler = {
            get: (target, prop) => {
                if (prop === 'with_length') return target.with_length;
                
                if (prop === Symbol.iterator) {
                    return function*() {
                        for (let i = 0; i < target.length; i++) yield target[i];
                    };
                }
                
                const index = Number(prop);
                if (!isNaN(index) && index >= 0 && index < target.length) {
                    const elementOffset = target.dataOffset + 32 + (index * 32);
                    const isElementDynamic = TypeUtils.isDynamicType(target.elementType);
                    
                    const elementDesc = {
                        callIndex: target.callIndex,
                        type: target.elementType,
                        value: target.value[index] || TypeUtils.getDefaultValue(target.elementType, "", ""),
                        offset: elementOffset,
                        size: 32,
                        isDynamic: isElementDynamic,
                        requiresLength: isElementDynamic,
                        parentArray: target,
                        arrayIndex: index,
                        name: `[${index}]`
                    };
                    
                    if (isElementDynamic) {
                        elementDesc.with_length = DescriptorUtils.createWithLengthMethod(this);
                    }
                    
                    return elementDesc;
                }
                
                return target[prop];
            }
        };
        
        return new Proxy(arrayDesc, handler);
    }

    #processArgument(arg, abiInput) {
        if (arg && typeof arg === "object" && arg.arrayIndex !== undefined) {
            if (arg.isDynamic === true && arg.requiresLength) {
                throw new Error(`${arg.type} element at index ${arg.arrayIndex} requires with_length() before use`);
            }
            return arg.value;
        }
        
        if (arg && typeof arg === "object" && arg.isDynamic === true) {
            if (arg.requiresLength) {
                throw new Error(`${arg.type} length must be specified with with_length() before use`);
            }
            return arg.value;
        }
        
        if (Array.isArray(arg) && arg.length === 1 && arg[0] && typeof arg[0] === "object" && arg[0].callIndex !== undefined) {
            return arg[0].value;
        }
        
        if (arg && typeof arg === "object" && arg.callIndex !== undefined) {
            return arg.value;
        }
        
        if (arg && typeof arg === "object" && !Array.isArray(arg) && abiInput.type === "tuple") {
            const result = {};
            for (const key in arg) {
                const component = abiInput.components?.find(c => c.name === key);
                result[key] = component ? this.#processArgument(arg[key], component) : arg[key];
            }
            return result;
        }
        
        if (Array.isArray(arg) && abiInput.type.includes("[]")) {
            const elementType = abiInput.type.replace("[]", "");
            return arg.map(item => TypeUtils.isIntType(elementType) ? BigInt(item) : item);
        }
        
        return arg;
    }

    #findOutputDescriptors(arg, path = []) {
        const descriptors = [];
        if (arg && typeof arg === "object") {
            if (arg.callIndex !== undefined) {
                descriptors.push({ descriptor: arg, path });
                return descriptors;
            }
            
            if (arg.length !== undefined && typeof arg.length === "number") {
                for (let i = 0; i < arg.length; i++) {
                    if (arg[i] !== undefined) {
                        descriptors.push(...this.#findOutputDescriptors(arg[i], [...path, i.toString()]));
                    }
                }
            } else {
                const skipProps = new Set(["length", "with_length", "value", "type", "offset", "size", 
                    "callIndex", "isDynamic", "requiresLength", "requiresSizing", "name", 
                    "elementType", "dataOffset", "parentArray", "arrayIndex"]);
                
                for (const key in arg) {
                    if (skipProps.has(key)) continue;
                    descriptors.push(...this.#findOutputDescriptors(arg[key], [...path, key]));
                }
            }
        }
        return descriptors;
    }

    #createOutputDescriptor(callIndex, type, offset, functionName, componentName, isDynamic = false) {
        if (isDynamic) {
            const desc = DescriptorUtils.createDynamicDescriptor(callIndex, type, offset, functionName, componentName);
            desc.with_length = DescriptorUtils.createWithLengthMethod(this);
            
            if (TypeUtils.isArrayType(type)) {
                const elementType = TypeUtils.getElementType(type);
                if (elementType !== "string" && elementType !== "bytes") {
                    desc.elementType = elementType;
                    return this.#createArrayProxy(desc);
                }
            }
            return desc;
        } else {
            return DescriptorUtils.createStaticDescriptor(callIndex, type, offset, functionName, componentName);
        }
    }

    #buildStructOutputs(components, baseOffset, outputs = [], functionName = "") {
        let currentOffset = baseOffset;

        for (const component of components) {
            if (component.type === "tuple") {
                this.#buildStructOutputs(component.components, currentOffset, outputs, functionName);
            } else {
                const isDynamic = TypeUtils.isDynamicType(component.type);
                outputs.push(this.#createOutputDescriptor(
                    this.calls.length - 1,
                    component.type,
                    currentOffset,
                    functionName,
                    component.name,
                    isDynamic
                ));
                currentOffset += 32;
            }
        }

        return { outputs, nextOffset: currentOffset };
    }

    #validateDynamicReturns(allOutputs, functionAbi) {
        const dynamicReturns = allOutputs.filter(out => out.isDynamic === true);
        if (dynamicReturns.length > 1) {
            throw new Error("Only one dynamic return type (array, bytes, string) allowed");
        }

        if (dynamicReturns.length === 1) {
            const dynamicType = dynamicReturns[0];
            const lastOutput = allOutputs[allOutputs.length - 1];
            if (dynamicType !== lastOutput) {
                throw new Error("Dynamic return type must be the last return value");
            }
            
            if (functionAbi.outputs.length === 1 && functionAbi.outputs[0].type === "tuple") {
                const components = functionAbi.outputs[0].components;
                const dynamicComponents = components.filter(comp => TypeUtils.isDynamicType(comp.type));
                if (dynamicComponents.length > 1) {
                    throw new Error("Struct can only contain one dynamic field (array, bytes, string)");
                }
            }
        }
    }

    #createStructProxy(components, outputs, startIndex = 0) {
        let idx = startIndex;
        const result = {};

        for (const component of components) {
            if (component.type === "tuple") {
                const nested = this.#createStructProxy(component.components, outputs, idx);
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
    }

    #processOutputDescriptors(args, functionAbi) {
        args.forEach((arg, index) => {
            for (const { descriptor } of this.#findOutputDescriptors(arg)) {
                const prevCall = this.calls[descriptor.callIndex];
                if (prevCall?.functionName === "getConstantStruct") continue;

                const descriptorId = descriptor.arrayIndex !== undefined
                    ? `${descriptor.callIndex}:${descriptor.offset}:${descriptor.size}:${descriptor.arrayIndex}`
                    : `${descriptor.callIndex}:${descriptor.offset}:${descriptor.size}`;
                
                if (this.usedDescriptors.has(descriptorId)) {
                    throw new Error(`Output variable from call ${descriptor.callIndex} at offset ${descriptor.offset} with size ${descriptor.size} has already been used. Each output variable can only be used once.`);
                }
                
                this.usedDescriptors.add(descriptorId);

                const currentMemPos = this.freeMemory;
                const paramOffset = 4 + 32 * index;
                const prevCallEnd = prevCall.freeMemory + prevCall.fnCalldata.length / 2;
                
                let dataPosition = paramOffset;
                if (descriptor.arrayIndex !== undefined) {
                    const paramType = functionAbi.inputs[index].type;
                    dataPosition = paramType.includes("[]") ? paramOffset + 64 + descriptor.arrayIndex * 32 : paramOffset;
                } else if (descriptor.isDynamic) {
                    dataPosition = (descriptor.type === "string" || descriptor.type === "bytes") ? paramOffset + 64 : paramOffset + 32;
                }
                
                const memTarget = (currentMemPos + dataPosition) - prevCallEnd;

                let returnOffset = descriptor.offset;
                let resultLength = descriptor.size;
                
                if (descriptor.isDynamic) {
                    returnOffset = (descriptor.type === "string" || descriptor.type === "bytes") 
                        ? descriptor.offset + 32 
                        : descriptor.offset + (descriptor.dataOffset || 32);
                }

                prevCall.memTargets.push(memTarget);
                prevCall.resultLengths.push(resultLength);
                prevCall.returnOffsets.push(returnOffset);
                prevCall.returnDataSize = Math.max(prevCall.returnDataSize, returnOffset + resultLength);
            }
        });
    }

    #buildFunctionOutputs(functionAbi, functionName) {
        const allOutputs = [];
        let currentOffset = 0;

        for (const output of functionAbi.outputs) {
            if (output.type === "tuple") {
                const result = this.#buildStructOutputs(output.components, currentOffset, allOutputs, functionName);
                currentOffset = result.nextOffset;
            } else {
                const isDynamic = TypeUtils.isDynamicType(output.type);
                allOutputs.push(this.#createOutputDescriptor(
                    this.calls.length - 1,
                    output.type,
                    currentOffset,
                    functionName,
                    output.name,
                    isDynamic
                ));
                currentOffset += 32;
            }
        }

        return allOutputs;
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

        const processedArgs = functionAbi.inputs.map((abiInput, i) => {
            const arg = args[i];
            const value = this.#processArgument(arg, abiInput);

            if (TypeUtils.isIntType(abiInput.type) && !TypeUtils.isArrayType(abiInput.type)) {
                return BigInt(value);
            }
            
            if (TypeUtils.isBytesType(abiInput.type) && !TypeUtils.isArrayType(abiInput.type)) {
                if (!(arg && typeof arg === "object" && arg.callIndex !== undefined)) {
                    if (typeof value !== "string" || !value.startsWith("0x")) {
                        throw new Error(`Bytes arguments must be hex strings: ${value}`);
                    }
                }
            }
            
            return value;
        });

        this.#processOutputDescriptors(args, functionAbi);

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

        const allOutputs = this.#buildFunctionOutputs(functionAbi, functionName);
        this.#validateDynamicReturns(allOutputs, functionAbi);

        if (functionAbi.outputs.length === 1 && functionAbi.outputs[0].type === "tuple") {
            return this.#createStructProxy(functionAbi.outputs[0].components, allOutputs, 0).proxy;
        }

        return functionAbi.outputs.length === 1 ? allOutputs[0] : allOutputs;
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
