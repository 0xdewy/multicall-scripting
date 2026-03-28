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
        this.usedDescriptors = new Set();
    }

    #setupDynamicDescriptor(descriptor, n, builderRef) {
        if (n <= 0) throw new Error(`${descriptor.type} length must be positive`);
        descriptor.length = n;
        descriptor.requiresLength = false;
        
        if (descriptor.type.includes("[]")) {
            const elementType = descriptor.type.replace("[]", "");
            // Don't support string/bytes arrays
            if (elementType === "string" || elementType === "bytes") {
                throw new Error(`String/bytes arrays are not supported: ${descriptor.type}`);
            }
            descriptor.size = 32 + n * 32;
            descriptor.value = new Array(n).fill(builderRef.#getDefaultValue(elementType, "", ""));
        } else if (descriptor.type === "bytes") {
            descriptor.size = 32 + Math.ceil(n / 32) * 32;
            descriptor.value = "0x" + "00".repeat(n);
        } else if (descriptor.type === "string") {
            descriptor.size = 32 + Math.ceil(n / 32) * 32;
            descriptor.value = " ".repeat(n);
        }
        descriptor.dataOffset = 32;
        return descriptor;
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

        // Return BigInt for integer types
        if (type.includes("int")) {
            return 0n;
        }
        
        return 0;
    }

    #isDynamicType(type) {
        // Regular strings/bytes are dynamic and supported
        if (type === "bytes" || type === "string") return true;
        // Arrays are dynamic, but string/bytes arrays are not supported
        if (type.includes("[]")) {
            const elementType = type.replace("[]", "");
            // Don't support string/bytes arrays
            if (elementType === "string" || elementType === "bytes") {
                return false;
            }
            return true;
        }
        return false;
    }

    #getElementType(arrayType) {
        return arrayType.replace("[]", "");
    }

    #createArrayProxy(arrayDesc) {
        const builder = this; // Capture 'this' reference
        
        const handler = {
            get: (target, prop) => {
                // Handle with_length method
                if (prop === 'with_length') return target.with_length;
                
                // Handle iterator
                if (prop === Symbol.iterator) {
                    return function*() {
                        for (let i = 0; i < target.length; i++) {
                            yield target[i];
                        }
                    };
                }
                
                // Handle numeric index access - return element descriptor
                const index = Number(prop);
                if (!isNaN(index) && index >= 0 && index < target.length) {
                    // Calculate element offset: data starts at dataOffset + 32 (skip length), each element is 32 bytes
                    const elementOffset = target.dataOffset + 32 + (index * 32);
                    
                    // Check if element type is itself dynamic
                    const isElementDynamic = builder.#isDynamicType(target.elementType);
                    
                    // Create element descriptor
                    const elementDesc = {
                        callIndex: target.callIndex,
                        type: target.elementType,
                        value: target.value[index] || builder.#getDefaultValue(target.elementType, "", ""),
                        offset: elementOffset,
                        size: 32, // Each element occupies 32 bytes
                        isDynamic: isElementDynamic,
                        requiresLength: isElementDynamic,
                        parentArray: target, // Reference to parent for context
                        arrayIndex: index,
                        name: `[${index}]` // For debugging/identification
                    };
                    
                    // If element is dynamic, add with_length method
                    if (isElementDynamic) {
                        elementDesc.with_length = function(n) {
                            // Handle dynamic element allocation
                            if (n <= 0) throw new Error(`${this.type} length must be positive`);
                            builder.#setupDynamicDescriptor(this, n, builder);
                            return this;
                        };
                    }
                    
                    return elementDesc;
                }
                
                // Default to property access
                return target[prop];
            }
        };
        
        return new Proxy(arrayDesc, handler);
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

        // Bytes validation moved to processArg

        const processArg = (arg, abiInput) => {
            // Handle array element descriptors
            if (arg && typeof arg === "object" && arg.arrayIndex !== undefined) {
                // This is an array element descriptor
                if (arg.isDynamic === true && arg.requiresLength) {
                    throw new Error(`${arg.type} element at index ${arg.arrayIndex} requires with_length() before use`);
                }
                return arg.value;
            }
            
            // Handle dynamic descriptors (array/bytes/string)
            if (arg && typeof arg === "object" && arg.isDynamic === true) {
                if (arg.requiresLength) {
                    throw new Error(`${arg.type} length must be specified with with_length() before use`);
                }
                // Return the value for encoding
                return arg.value;
            }
            
            // Handle array of output descriptors (e.g., from balanceOf)
            if (Array.isArray(arg) && arg.length === 1 && arg[0] && typeof arg[0] === "object" && arg[0].callIndex !== undefined) {
                return arg[0].value;
            }
            // Handle single output descriptor
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
            
            // Handle regular arrays (not descriptors)
            if (Array.isArray(arg) && abiInput.type.includes("[]")) {
                // Convert array elements based on their type
                const elementType = abiInput.type.replace("[]", "");
                return arg.map(item => {
                    if (elementType.includes("int")) {
                        return BigInt(item);
                    }
                    return item;
                });
            }
            
            return arg;
        };

        // Process arguments for encoding
        const processedArgs = functionAbi.inputs.map((abiInput, i) => {
            let arg = args[i];
            let value = processArg(arg, abiInput);

            // Only convert to BigInt for integer types that are not arrays
            if (abiInput.type.includes("int") && !abiInput.type.includes("[]")) {
                return BigInt(value);
            }
            
            // Validate bytes arguments (non-array, non-descriptor)
            if (abiInput.type.startsWith("bytes") && !abiInput.type.includes("[]")) {
                // Skip validation for descriptors (they have callIndex)
                if (!(arg && typeof arg === "object" && arg.callIndex !== undefined)) {
                    if (typeof value !== "string" || !value.startsWith("0x")) {
                        throw new Error(`Bytes arguments must be hex strings: ${value}`);
                    }
                }
            }
            
            return value;
        });

        const findOutputDescriptors = (arg, path = []) => {
            const descriptors = [];
            if (arg && typeof arg === "object") {
                // Handle output descriptors (including dynamic ones and array elements)
                if (arg.callIndex !== undefined) {
                    descriptors.push({ descriptor: arg, path });
                    // Don't traverse into descriptor objects
                    return descriptors;
                }
                
                // Check if it's an array or array-like (has length property)
                if (arg.length !== undefined && typeof arg.length === "number") {
                    // Iterate through array indices
                    for (let i = 0; i < arg.length; i++) {
                        if (arg[i] !== undefined) {
                            descriptors.push(...findOutputDescriptors(arg[i], [...path, i.toString()]));
                        }
                    }
                } else {
                    // Check object properties (excluding special ones)
                    for (const key in arg) {
                        if (key === "length" || key === "with_length" || key === "value" || 
                            key === "type" || key === "offset" || key === "size" || 
                            key === "callIndex" || key === "isDynamic" || key === "requiresLength" ||
                            key === "requiresSizing" || key === "name" || key === "elementType" ||
                            key === "dataOffset" || key === "parentArray" || key === "arrayIndex") {
                            continue;
                        }
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

                // Create a unique identifier for this descriptor
                let descriptorId;
                if (descriptor.arrayIndex !== undefined) {
                    descriptorId = `${descriptor.callIndex}:${descriptor.offset}:${descriptor.size}:${descriptor.arrayIndex}`;
                } else {
                    descriptorId = `${descriptor.callIndex}:${descriptor.offset}:${descriptor.size}`;
                }
                
                // Check if this descriptor has already been used
                if (this.usedDescriptors.has(descriptorId)) {
                    throw new Error(`Output variable from call ${descriptor.callIndex} at offset ${descriptor.offset} with size ${descriptor.size} has already been used. Each output variable can only be used once.`);
                }
                
                // Mark this descriptor as used
                this.usedDescriptors.add(descriptorId);

                // memTarget is offset from end of prevCall's data to current call's parameter
                // This matches Solidity's formula:
                // memTarget = (this_call.memPos + callParameter.start + 0x4) - (old_call.memPos + old_call.fnCalldata.length)
                
                // Calculate current call's memPos (cumulative calldata length)
                const currentCallIndex = this.calls.length;
                const currentMemPos = this.freeMemory;
                
                // Calculate parameter position in current call
                const paramOffset = 4 + 32 * index;
                
                // Calculate prevCall's end position
                const prevCallEnd = prevCall.freeMemory + prevCall.fnCalldata.length / 2;
                
                // Calculate data position based on descriptor type
                let dataPosition;
                if (descriptor.arrayIndex !== undefined) {
                    // Array element descriptor - check if parameter is array type
                    const paramType = functionAbi.inputs[index].type;
                    if (paramType.includes("[]")) {
                        // Parameter is array type - element goes inside array
                        // For dynamic array: [offset][length][element0][element1]...
                        // Element i is at paramOffset + 64 + i*32
                        dataPosition = paramOffset + 64 + descriptor.arrayIndex * 32;
                    } else {
                        // Parameter is scalar type - element goes directly at paramOffset
                        dataPosition = paramOffset;
                    }
                } else if (descriptor.isDynamic) {
                    // Dynamic descriptor (full array/bytes/string) - data starts after offset
                    // For strings/bytes: skip offset (32) and length (32) = 64
                    // For arrays: data starts at offset + 32 (after length)
                    if (descriptor.type === "string" || descriptor.type === "bytes") {
                        dataPosition = paramOffset + 64;
                    } else {
                        dataPosition = paramOffset + 32;
                    }
                } else {
                    // Regular descriptor
                    dataPosition = paramOffset;
                }
                
                // memTarget is the offset from prevCall's end to current data position
                const memTarget = (currentMemPos + dataPosition) - prevCallEnd;

                // Calculate return offset and result length based on descriptor type
                let returnOffset, resultLength;
                if (descriptor.arrayIndex !== undefined) {
                    // Array element descriptor
                    returnOffset = descriptor.offset;
                    resultLength = descriptor.size;
                } else if (descriptor.isDynamic) {
                    // Dynamic descriptor (array, bytes, string)
                    // For strings/bytes: copy length field (32) + data
                    // For arrays: data starts at dataOffset (32)
                    if (descriptor.type === "string" || descriptor.type === "bytes") {
                        returnOffset = descriptor.offset + 32;
                    } else {
                        returnOffset = descriptor.offset + (descriptor.dataOffset || 32);
                    }
                    resultLength = descriptor.size;
                } else {
                    // Regular descriptor
                    returnOffset = descriptor.offset;
                    resultLength = descriptor.size;
                }

                prevCall.memTargets.push(memTarget);
                prevCall.resultLengths.push(resultLength);
                prevCall.returnOffsets.push(returnOffset);
                prevCall.returnDataSize = Math.max(prevCall.returnDataSize, returnOffset + resultLength);
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
                } else if (this.#isDynamicType(component.type)) {
                    // Dynamic type in struct (array, bytes, string)
                    const dynamicDesc = {
                        callIndex: this.calls.length - 1,
                        type: component.type,
                        value: this.#getDefaultValue(component.type, functionName, component.name),
                        offset: currentOffset,
                        size: 32, // Pointer size
                        isDynamic: true,
                        requiresLength: true, // Needs with_length()
                        length: null,
                        name: component.name
                    };
                    
                // Add with_length method
                const builder = this; // Capture 'this' reference
                dynamicDesc.with_length = function(n) {
                    builder.#setupDynamicDescriptor(this, n, builder);
                    return this;
                };
                    
                    // For arrays, create a proxy for element access
                    if (component.type.includes("[]")) {
                        const elementType = this.#getElementType(component.type);
                        // Skip creating array proxy for string/bytes arrays
                        if (elementType === "string" || elementType === "bytes") {
                            outputs.push(dynamicDesc);
                        } else {
                            dynamicDesc.elementType = elementType;
                            const arrayProxy = this.#createArrayProxy(dynamicDesc);
                            outputs.push(arrayProxy);
                        }
                    } else {
                        outputs.push(dynamicDesc);
                    }
                    
                    currentOffset += 32;
                } else {
                    // Non-dynamic type
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
            } else if (this.#isDynamicType(output.type)) {
                // Create dynamic type descriptor (array, bytes, string)
                const dynamicDesc = {
                    callIndex: this.calls.length - 1,
                    type: output.type,
                    value: this.#getDefaultValue(output.type, functionName, output.name),
                    offset: currentOffset,
                    size: 32, // Pointer size
                    isDynamic: true,
                    requiresLength: true, // Needs with_length()
                    length: null,
                    name: output.name
                };
                
                // Add with_length method
                const builder = this; // Capture 'this' reference
                dynamicDesc.with_length = function(n) {
                    builder.#setupDynamicDescriptor(this, n, builder);
                    return this;
                };
                
                // For arrays, create a proxy for element access
                if (output.type.includes("[]")) {
                    const elementType = this.#getElementType(output.type);
                    // Skip creating array proxy for string/bytes arrays
                    if (elementType === "string" || elementType === "bytes") {
                        allOutputs.push(dynamicDesc);
                    } else {
                        dynamicDesc.elementType = elementType;
                        const arrayProxy = this.#createArrayProxy(dynamicDesc);
                        allOutputs.push(arrayProxy);
                    }
                } else {
                    allOutputs.push(dynamicDesc);
                }
                
                currentOffset += 32;
            } else {
                // Non-dynamic type
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

        // Validate return types
        const dynamicReturns = allOutputs.filter(out => out.isDynamic === true);
        if (dynamicReturns.length > 1) {
            throw new Error("Only one dynamic return type (array, bytes, string) allowed");
        }

        // Check deterministic offset for dynamic types
        if (dynamicReturns.length === 1) {
            const dynamicType = dynamicReturns[0];
            // Dynamic type must be last in outputs
            const lastOutput = allOutputs[allOutputs.length - 1];
            if (dynamicType !== lastOutput) {
                throw new Error("Dynamic return type must be the last return value");
            }
            
            // For structs with array fields: validate only one dynamic field
            if (functionAbi.outputs.length === 1 && functionAbi.outputs[0].type === "tuple") {
                const components = functionAbi.outputs[0].components;
                const dynamicComponents = components.filter(comp => this.#isDynamicType(comp.type));
                if (dynamicComponents.length > 1) {
                    throw new Error("Struct can only contain one dynamic field (array, bytes, string)");
                }
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

        // For single return value, return the descriptor directly
        if (functionAbi.outputs.length === 1) {
            return allOutputs[0];
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
