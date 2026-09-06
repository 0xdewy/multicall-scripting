// TransactionBuilder — builds the (targets, offsets, calldatas, msgValues) inputs that
// MulticallScripter.execute() expects, wiring return values of earlier calls into the calldata of
// later ones.
//
// Every position the builder emits is derived from the real ABI encoding: return-data offsets from
// the canonical layout of the producing function's outputs, calldata targets by reading the head
// pointers of the encoded calldata. Anything whose position cannot be known before execution
// (a second dynamic value, arrays of dynamic elements) is rejected instead of guessed.

import { encodeFunctionData, getAbiItem } from "viem";
import {
    STATIC_CALL_FLAG,
    CALL_FLAG,
    PARTIAL_RETURN_VARS,
    staticCall,
    stateChangingCall,
    staticCallPartialReturn,
    callPartialReturn,
} from "./encoding.js";

export * from "./encoding.js";

const SELECTOR_SIZE = 4;
const WORD = 32;
const pad32 = (n) => Math.ceil(n / WORD) * WORD;
// bytes a call occupies in the executor's calldata region: [length word][data padded to 32]
const regionSize = (calldataHex) => WORD + pad32((calldataHex.length - 2) / 2);

// =============================== ABI layout ===============================
// `param` is an ABI parameter object: { type, name?, components? }

function arraySuffix(type) {
    const m = /^(.*)\[(\d*)\]$/.exec(type);
    return m ? { base: m[1], count: m[2] === "" ? null : Number(m[2]) } : null;
}

function elementParam(param) {
    return { ...param, type: arraySuffix(param.type).base };
}

export function isDynamic(param) {
    const arr = arraySuffix(param.type);
    if (arr) return arr.count === null || isDynamic(elementParam(param));
    if (param.type === "bytes" || param.type === "string") return true;
    if (param.type === "tuple") return param.components.some(isDynamic);
    return false;
}

// encoded size of a static parameter
function staticSize(param) {
    const arr = arraySuffix(param.type);
    if (arr) return arr.count * staticSize(elementParam(param));
    if (param.type === "tuple") return param.components.reduce((n, c) => n + staticSize(c), 0);
    return WORD;
}

const headSize = (param) => (isDynamic(param) ? WORD : staticSize(param));

// children of a static composite: tuple components, or the k elements of a fixed array
function staticChildren(param) {
    const arr = arraySuffix(param.type);
    if (arr) return Array.from({ length: arr.count }, (_, i) => ({ ...elementParam(param), name: String(i) }));
    return param.components;
}

function defaultValue(param) {
    const arr = arraySuffix(param.type);
    if (arr) return arr.count === null ? [] : Array.from({ length: arr.count }, () => defaultValue(elementParam(param)));
    if (param.type === "tuple") return Object.fromEntries(param.components.map((c, i) => [c.name || i, defaultValue(c)]));
    if (param.type === "address") return "0x0000000000000000000000000000000000000000";
    if (param.type === "bool") return false;
    if (param.type === "string") return "";
    if (param.type === "bytes") return "0x";
    if (param.type.startsWith("bytes")) return "0x" + "00".repeat(Number(param.type.slice(5)));
    return 0n;
}

function readWord(calldata, bytePos) {
    return Number(BigInt("0x" + calldata.slice(2 + bytePos * 2, 2 + bytePos * 2 + 64)));
}

// Byte position, within `calldata`, of the value at `path` inside the tuple `params` whose heads
// start at `base`. Dynamic values resolve to their tail (the length word / first element head).
function locate(params, base, path, calldata) {
    const [key, ...rest] = path;
    let headPos = base;
    for (let i = 0; i < params.length; i++) {
        const p = params[i];
        if (typeof key === "number" ? key === i : p.name === key) return locateIn(p, headPos, base, rest, calldata);
        headPos += headSize(p);
    }
    throw new Error(`cannot locate argument ${key}`);
}

function locateIn(param, headPos, base, rest, calldata) {
    if (!isDynamic(param)) {
        return rest.length === 0 ? headPos : locate(staticChildren(param), headPos, rest, calldata);
    }
    const tail = base + readWord(calldata, headPos);
    if (rest.length === 0) return tail;

    const arr = arraySuffix(param.type);
    if (arr) {
        const elem = elementParam(param);
        const [index, ...rest2] = rest;
        // T[]: [length][element heads...]; T[k] of dynamic T: [element heads...]
        const elemsBase = arr.count === null ? tail + WORD : tail;
        return locateIn(elem, elemsBase + Number(index) * headSize(elem), elemsBase, rest2, calldata);
    }
    if (param.type === "tuple") return locate(param.components, tail, rest, calldata);
    throw new Error(`cannot index into ${param.type}`);
}

// =============================== Descriptors ===============================

const descriptorOwners = new WeakMap();
function bindOwner(value, owner) {
    if (value instanceof Descriptor) descriptorOwners.set(value, owner);
    else if (value && typeof value === "object") Object.values(value).forEach(child => bindOwner(child, owner));
    return value;
}


/** A reference to (a slice of) a previous call's return data. Pass it as an argument to a later addCall. */
export class Descriptor {
    constructor(fields) {
        Object.assign(this, fields);
    }

    /**
     * Declare the runtime length of a dynamic return value: byte length for bytes/string, element
     * count for T[]. It must be exact. This is not a runtime length check: the original
     * length word is copied, so an incorrect declaration can revert or consume adjacent arguments.
     */
    with_length(n) {
        if (this.unsupported) throw new Error(this.unsupported);
        if (!this.isDynamic) throw new Error(`${this.type} is static; with_length() is only for bytes, string and T[] return values`);
        if (!Number.isSafeInteger(n) || n < 0) throw new Error(`${this.type} length must be a non-negative integer`);
        const size = this.elementParam ? WORD + n * staticSize(this.elementParam) : WORD + pad32(n);
        if (size > 0xFFFF) throw new Error("returnDataSize is too large");
        this.length = n;
        this.requiresLength = false;
        this.size = size;
        return this;
    }
}

function abiType(param) {
    return param.type.startsWith("tuple")
        ? `(${param.components.map(abiType).join(",")})${param.type.slice(5)}` : param.type;
}

function leaf(callIndex, param, offset, extra = {}) {
    return new Descriptor({ callIndex, abiType: abiType(param), type: param.type, name: param.name, offset, size: WORD, isDynamic: false, requiresLength: false, unsupported: null, ...extra });
}

// element access on a T[] descriptor after with_length(): arr[i] → element (leaf or struct object)
function arrayProxy(desc) {
    return new Proxy(desc, {
        get(target, prop, receiver) {
            if (prop === Symbol.iterator) {
                return function* () {
                    for (let i = 0; i < (target.length ?? 0); i++) yield receiver[i];
                };
            }
            const index = typeof prop === "string" ? Number(prop) : NaN;
            if (!Number.isInteger(index) || index < 0) return Reflect.get(target, prop, receiver);
            if (target.unsupported) throw new Error(target.unsupported);
            if (target.requiresLength) throw new Error(`${target.type}: call with_length(n) before indexing elements`);
            if (index >= target.length) throw new Error(`${target.type}: index ${index} out of range (length ${target.length})`);
            const elem = target.elementParam;
            const pos = target.offset + WORD + index * staticSize(elem);
            return bindOwner(isDynamic(elem) || arraySuffix(elem.type) || elem.type === "tuple"
                ? outputValue(target.callIndex, elem, pos, null)
                : leaf(target.callIndex, { ...elem, name: `[${index}]` }, pos), descriptorOwners.get(receiver));
        },
    });
}

// Lay out `components` (a tuple whose heads start at `base` in the return data) into descriptors.
function layoutTuple(callIndex, components, base, unsupported) {
    const dynamics = components.filter(isDynamic).length;
    const headsSize = components.reduce((n, c) => n + headSize(c), 0);
    let headPos = base;
    return components.map((c) => {
        let value;
        if (isDynamic(c)) {
            const reason = unsupported ?? (dynamics > 1
                ? `${c.type} return value: more than one dynamic value in the return data, its position depends on runtime lengths`
                : null);
            value = outputValue(callIndex, c, base + headsSize, reason);
        } else {
            value = outputValue(callIndex, c, headPos, unsupported);
        }
        headPos += headSize(c);
        return value;
    });
}

function structObject(components, values) {
    return Object.fromEntries(components.map((c, i) => [c.name || String(i), values[i]]));
}

// descriptor (leaf / array proxy) or struct object for a single output at byte `pos`
function outputValue(callIndex, param, pos, unsupported) {
    const arr = arraySuffix(param.type);
    if (arr && arr.count === null) {
        const elem = elementParam(param);
        const reason = unsupported ?? (isDynamic(elem) ? `${param.type} return value: arrays of dynamic elements are not supported` : null);
        return arrayProxy(leaf(callIndex, param, pos, { isDynamic: true, requiresLength: true, elementParam: elem, length: null, unsupported: reason }));
    }
    if (param.type === "bytes" || param.type === "string") {
        return leaf(callIndex, param, pos, { isDynamic: true, requiresLength: true, length: null, unsupported });
    }
    if (arr || param.type === "tuple") {
        const children = staticChildren(param);
        return structObject(children, layoutTuple(callIndex, children, pos, unsupported));
    }
    return leaf(callIndex, param, pos, { unsupported });
}

function findDescriptors(value, path, out) {
    if (value instanceof Descriptor) out.push({ descriptor: value, path });
    else if (Array.isArray(value)) value.forEach((v, i) => findDescriptors(v, [...path, i], out));
    else if (value && typeof value === "object") {
        for (const key of Object.keys(value)) findDescriptors(value[key], [...path, key], out);
    }
    return out;
}

// placeholder occupying exactly the space the spliced return data will take
function placeholder(descriptor, param) {
    if (descriptor.isDynamic !== isDynamic(param)
        || (descriptor.isDynamic ? descriptor.abiType !== abiType(param) : descriptor.size !== staticSize(param))) {
        throw new Error(`cannot pass a ${descriptor.type} return value as a ${param.type} argument`);
    }
    if (!descriptor.isDynamic) return defaultValue(param);
    const n = descriptor.length;
    if (arraySuffix(param.type)) return Array.from({ length: n }, () => defaultValue(elementParam(param)));
    if (param.type === "bytes") return "0x" + "00".repeat(n);
    if (param.type === "string") return " ".repeat(n);
    throw new Error(`cannot pass a ${descriptor.type} return value as a ${param.type} argument`);
}

// replace descriptors with placeholders and normalise literals for viem
function prepare(value, param) {
    if (value instanceof Descriptor) return placeholder(value, param);
    const arr = arraySuffix(param.type);
    if (arr) {
        if (!Array.isArray(value)) throw new Error(`expected an array for ${param.type}`);
        return value.map((v) => prepare(v, elementParam(param)));
    }
    if (param.type === "tuple") {
        const entries = param.components.map((c, i) => {
            const v = Array.isArray(value) ? value[i] : value[c.name];
            return [c.name || String(i), prepare(v, c)];
        });
        return Array.isArray(value) ? entries.map(([, v]) => v) : Object.fromEntries(entries);
    }
    if (/^u?int\d*$/.test(param.type)) {
        if (typeof value === "number" && !Number.isSafeInteger(value)) throw new Error("Use BigInt or a string for large integers");
        return BigInt(value);
    }
    if (param.type.startsWith("bytes") && (typeof value !== "string" || !value.startsWith("0x"))) {
        throw new Error(`Bytes arguments must be hex strings: ${value}`);
    }
    return value;
}

// =============================== Builder ===============================

export class TransactionBuilder {
    constructor() {
        this.calls = [];
    }

    /**
     * Append a call. Returns descriptor(s) for its return value(s): a single descriptor, an array
     * of them (one per output; a sole tuple output is also exposed by field name), a T[] proxy, or
     * a struct object. Pass descriptors as arguments to later calls to chain them.
     */
    addCall(abi, target, functionName, args, msgValue = 0n) {
        if (abi.filter(item => item.type === "function" && item.name === functionName).length > 1) {
            throw new Error(`Ambiguous function ${functionName}; supply an ABI containing only the intended overload`);
        }
        const fn = getAbiItem({ abi, name: functionName });
        if (!fn || fn.type !== "function") throw new Error(`Function ${functionName} not found in ABI`);
        if (args.length !== fn.inputs.length) {
            throw new Error(`Argument count mismatch: ${args.length} vs ${fn.inputs.length}`);
        }
        const isStatic = fn.stateMutability === "view" || fn.stateMutability === "pure";
        if (!["bigint", "string", "number"].includes(typeof msgValue)
            || (typeof msgValue === "string" && msgValue.trim() === "")) throw new Error("msg.value must fit uint256");
        if (typeof msgValue === "number" && !Number.isSafeInteger(msgValue)) throw new Error("Use BigInt or a string for large integers");
        msgValue = BigInt(msgValue);
        if (msgValue < 0n || msgValue >= (1n << 256n)) throw new Error("msg.value must fit uint256");
        if (isStatic && msgValue > 0n) throw new Error(`${functionName} is ${fn.stateMutability}; it cannot receive msg.value`);

        const refs = [];
        args.forEach((arg, i) => findDescriptors(arg, [i], refs));
        for (const { descriptor } of refs) {
            const owner = descriptorOwners.get(descriptor);
            if (owner && owner !== this) throw new Error("Return reference belongs to another builder");
            if (descriptor.unsupported) throw new Error(descriptor.unsupported);
            if (descriptor.isDynamic && descriptor.requiresLength) {
                throw new Error(`${descriptor.type} return value requires with_length() before use`);
            }
            if (!Number.isInteger(descriptor.callIndex) || descriptor.callIndex < 0 || descriptor.callIndex >= this.calls.length
                || ![descriptor.offset, descriptor.size].every(n => Number.isSafeInteger(n) && n >= 0)) {
                throw new Error("Invalid return reference");
            }
        }

        const fnCalldata = encodeFunctionData({ abi, functionName, args: args.map((arg, i) => prepare(arg, fn.inputs[i])) });

        // Resolve every position before recording any splice, so a failed addCall is retryable.
        const patches = refs.map(({ descriptor, path }) => ({
            descriptor,
            target: this.calls.slice(descriptor.callIndex + 1).reduce((n, c) => n + regionSize(c.fnCalldata), 0)
                + locate(fn.inputs, SELECTOR_SIZE, path, fnCalldata),
        }));
        for (const { descriptor, target: memTarget } of patches) {
            const producer = this.calls[descriptor.callIndex];
            producer.memTargets.push(memTarget);
            producer.resultLengths.push(descriptor.size);
            producer.returnOffsets.push(descriptor.offset);
            producer.returnDataSize = Math.max(producer.returnDataSize, descriptor.offset + descriptor.size);
        }

        this.calls.push({
            target,
            fnCalldata,
            calltype_flag: isStatic ? STATIC_CALL_FLAG : CALL_FLAG,
            memTargets: [],
            resultLengths: [],
            returnOffsets: [],
            returnDataSize: 0,
            msgValue,
            functionName,
        });

        const outputs = bindOwner(layoutTuple(this.calls.length - 1, fn.outputs, 0, null), this);
        if (fn.outputs.length !== 1) return outputs;
        const only = outputs[0];
        if (only instanceof Descriptor) return only;
        // sole struct output: positional array that also answers to field names
        const positional = Object.values(only);
        for (const key of Object.keys(only)) {
            Object.defineProperty(positional, key, { get: () => only[key], enumerable: false });
        }
        return positional;
    }

    /** The four inputs for MulticallScripter.execute(targets, offsets, calldatas, msgValues). */
    build() {
        const targets = [];
        const offsets = [];
        const calldatas = [];
        const msgValues = [];

        this.calls.forEach((call, i) => {
            targets.push(call.target);
            calldatas.push(call.fnCalldata);

            const vars = call.memTargets.length;
            if (vars > PARTIAL_RETURN_VARS) {
                throw new Error(`Call #${i}: Too many variables (${vars}) from one call; at most ${PARTIAL_RETURN_VARS} return-value slices can be used per call`);
            }
            for (let j = 0; j < call.returnOffsets.length; j++) {
                if (Number(call.returnOffsets[j]) + Number(call.resultLengths[j]) > Number(call.returnDataSize)) {
                    throw new Error(`Call #${i} variable ${j}: return data slice exceeds returnDataSize`);
                }
            }

            const flag = Number(call.calltype_flag);
            if (flag === Number(STATIC_CALL_FLAG)) {
                offsets.push(vars > 0
                    ? staticCallPartialReturn(call.memTargets, call.resultLengths, call.returnOffsets, call.returnDataSize)
                    : staticCall(0, 0));
                return;
            }
            if (flag !== Number(CALL_FLAG)) throw new Error(`Call #${i}: Invalid calltype flag: ${call.calltype_flag}`);

            let msgValueIndex = 0;
            if (call.msgValue > 0n) {
                msgValues.push(call.msgValue);
                msgValueIndex = msgValues.length;
            }
            offsets.push(vars > 0
                ? callPartialReturn(msgValueIndex, call.memTargets, call.resultLengths, call.returnOffsets, call.returnDataSize)
                : stateChangingCall(msgValueIndex));
        });

        const packed = "0x" + calldatas.map(data => {
            const length = (data.length - 2) / 2;
            return BigInt(length).toString(16).padStart(64, "0")
                + data.slice(2).padEnd(Math.ceil(length / 32) * 64, "0");
        }).join("");
        return { targets, offsets, calldatas: packed, msgValues };
    }
}
