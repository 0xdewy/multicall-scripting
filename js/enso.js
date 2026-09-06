import { decodeFunctionData, encodeAbiParameters, getAddress, keccak256, parseAbi } from "viem";
import { callPartialReturn, stateChangingCall, staticCall, staticCallPartialReturn } from "./encoding.js";

const EXECUTE_SHORTCUT_ABI = parseAbi([
    "function executeShortcut(bytes32 accountId, bytes32 requestId, bytes32[] commands, bytes[] state) payable returns (bytes[])",
]);
const CALL = 1, STATICCALL = 2, VALUECALL = 3, CALLTYPE_MASK = 3;
const DATA = 0x20, EXTENDED = 0x40, TUPLE_RETURN = 0x80;
const VARIABLE = 0x80, VALUE_MASK = 0x7f, END = 0xff;
const USE_STATE = 0xfe, ARRAY_START = 0xfd, TUPLE_START = 0xfc, DYNAMIC_END = 0xfb;
const SPECIAL_INDICES = new Set([USE_STATE, ARRAY_START, TUPLE_START, DYNAMIC_END]);
const IDENTITY_PRECOMPILE = "0x0000000000000000000000000000000000000004";
const NATIVE_TOKEN = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
const APPROVE = "0x095ea7b3", INCREASE_ALLOWANCE = "0x39509351", SET_APPROVAL_FOR_ALL = "0xa22cb465";
const APPROVAL_SELECTORS = new Set([APPROVE, INCREASE_ALLOWANCE, SET_APPROVAL_FOR_ALL]);
const UNSUPPORTED_AUTHORIZATION_SELECTORS = new Set(["0xd505accf", "0x8fcbaf0c", "0x87517c45"]);

/** Compatibility boundary reviewed against Enso's Weiroll v1.4.1 deployment. */
export const ENSO_COMPATIBILITY = Object.freeze({
    chainId: 1,
    weirollVersion: "1.4.1",
    weirollCommit: "900250114203727ff236d3f6313673c17c2d90dd",
    eip7702Implementation: "0x0Aeb78D3f961b0394E4A3B94537b543e9E57Bab1",
    eip7702CodeHash: "0x93b2dfa2f4fa04a1b1f2b15652bda0319f96e715a9d55eb91cb360ce7227b7d3",
});
const strip0x = (value) => value.slice(2);
const byteLength = (value) => strip0x(value).length / 2;
const pad32 = (n) => Math.ceil(n / 32) * 32;
const regionSize = (data) => 32 + pad32(byteLength(data));

function hex(value, label) {
    if (typeof value !== "string" || !/^0x(?:[0-9a-fA-F]{2})*$/.test(value)) {
        throw new Error(`Enso ${label} must be an even-length hex string`);
    }
    return value.toLowerCase();
}

function address(value, label) {
    try { return getAddress(value); }
    catch { throw new Error(`Enso ${label} is not a valid address`); }
}

function uint256(value, label) {
    if (!["bigint", "string", "number"].includes(typeof value)
        || (typeof value === "string" && value.trim() === "")
        || (typeof value === "number" && !Number.isSafeInteger(value))) {
        throw new Error(`Enso ${label} must fit uint256`);
    }
    let parsed;
    try { parsed = BigInt(value); }
    catch { throw new Error(`Enso ${label} must fit uint256`); }
    if (parsed < 0n || parsed >= 1n << 256n) throw new Error(`Enso ${label} must fit uint256`);
    return parsed;
}

function word(value, label) {
    value = hex(value, label);
    if (byteLength(value) !== 32) throw new Error(`Enso ${label} must be 32 bytes`);
    return Buffer.from(strip0x(value), "hex");
}

function routeTransaction(entry, label, caller) {
    const tx = label === "tx" ? entry : entry?.tx;
    if (!tx || typeof tx !== "object") throw new Error(`Enso ${label} is missing tx`);
    if (address(tx.from, `${label}.from`) !== caller) {
        throw new Error(`Enso ${label}.from does not match the execution account`);
    }
    return {
        target: address(tx.to, `${label}.to`),
        data: hex(tx.data, `${label}.data`),
        value: uint256(tx.value ?? 0n, `${label}.value`),
    };
}

function readState(slots, index, commandIndex, role) {
    const slot = slots[index & VALUE_MASK];
    if (!slot) throw new Error(`Enso command #${commandIndex} ${role} references missing state slot ${index & VALUE_MASK}`);
    return slot;
}

function buildCalldata(selector, indices, slots, commandIndex) {
    const heads = [], tails = [], dependencies = [];
    for (const index of indices) {
        if (index === END) break;
        if (SPECIAL_INDICES.has(index)) {
            throw new Error(`Enso command #${commandIndex} uses unsupported Weiroll state index 0x${index.toString(16)}`);
        }
        const slot = readState(slots, index, commandIndex, "argument");
        if (index & VARIABLE) {
            if (slot.producer !== undefined) {
                throw new Error(`Enso command #${commandIndex} consumes a dynamic return value; its runtime length cannot be translated safely`);
            }
            const length = byteLength(slot.data);
            if (length === 0 || length % 32 !== 0) {
                throw new Error(`Enso command #${commandIndex} dynamic state slot ${index & VALUE_MASK} is not word-aligned`);
            }
            heads.push(null);
            tails.push(slot.data);
        } else {
            if (slot.producer !== undefined) {
                if (slot.dynamic) {
                    throw new Error(`Enso command #${commandIndex} consumes a dynamic return value as a static argument`);
                }
                dependencies.push({producer: slot.producer, position: 4 + heads.length * 32});
                heads.push("0x" + "00".repeat(32));
            } else {
                if (byteLength(slot.data) !== 32) {
                    throw new Error(`Enso command #${commandIndex} static state slot ${index} is not 32 bytes`);
                }
                heads.push(slot.data);
            }
            tails.push(null);
        }
    }
    let tailOffset = heads.length * 32;
    for (let i = 0; i < heads.length; i++) {
        if (heads[i] === null) {
            heads[i] = `0x${BigInt(tailOffset).toString(16).padStart(64, "0")}`;
            tailOffset += byteLength(tails[i]);
        }
    }
    return {
        data: `0x${selector.toString("hex")}${heads.map(strip0x).join("")}${tails.filter(Boolean).map(strip0x).join("")}`,
        dependencies,
    };
}

function packFrames(calls) {
    return "0x" + calls.map(({data}) => {
        const length = byteLength(data);
        return BigInt(length).toString(16).padStart(64, "0")
            + strip0x(data).padEnd(pad32(length) * 2, "0");
    }).join("");
}

function calldataWord(data, index, label) {
    const start = 10 + index * 64;
    if (data.length < start + 64) throw new Error(`Enso ${label} calldata is truncated`);
    return `0x${data.slice(start, start + 64)}`;
}

function approvalFor(call, index) {
    const selector = call.data.slice(0, 10);
    if (UNSUPPORTED_AUTHORIZATION_SELECTORS.has(selector)) {
        throw new Error(`Enso call #${index} uses unsupported permit or Permit2 authorization ${selector}`);
    }
    if (!APPROVAL_SELECTORS.has(selector)) return null;
    const operator = address(`0x${calldataWord(call.data, 0, `call #${index}`).slice(-40)}`, `call #${index} approval operator`);
    if (selector === SET_APPROVAL_FOR_ALL) {
        const enabled = BigInt(calldataWord(call.data, 1, `call #${index}`));
        if (enabled > 1n) throw new Error(`Enso call #${index} has an invalid setApprovalForAll boolean`);
        return {callIndex: index, token: call.target, operator, amount: enabled === 1n ? null : 0n, kind: "setApprovalForAll"};
    }
    return {callIndex: index, token: call.target, operator,
        amount: BigInt(calldataWord(call.data, 1, `call #${index}`)),
        kind: selector === APPROVE ? "approve" : "increaseAllowance"};
}

function addressEvidence(calls, expected) {
    const needle = expected.slice(2).toLowerCase();
    return calls.some(call => strip0x(call.data).toLowerCase().includes(needle));
}

function normalizeApproval(rule, index) {
    if (!rule || typeof rule !== "object") throw new Error(`Enso policy.allowedApprovals[${index}] must be an object`);
    return {
        token: address(rule.token, `policy.allowedApprovals[${index}].token`),
        operator: address(rule.operator, `policy.allowedApprovals[${index}].operator`),
        maxAmount: uint256(rule.maxAmount, `policy.allowedApprovals[${index}].maxAmount`),
        allowAll: rule.allowAll === true,
    };
}

function enforcePolicy(inspected, policy) {
    if (!policy || typeof policy !== "object") throw new Error("Enso policy is required before building an executable batch");
    const maxEthSpend = uint256(policy.maxEthSpend, "policy.maxEthSpend");
    if (inspected.totalEthSpend > maxEthSpend) {
        throw new Error(`Enso route spends ${inspected.totalEthSpend} wei, above policy.maxEthSpend ${maxEthSpend}`);
    }
    if (!Array.isArray(policy.allowedTargets) || policy.allowedTargets.length === 0) {
        throw new Error("Enso policy.allowedTargets must be a non-empty independent allowlist");
    }
    const allowedTargets = new Set(policy.allowedTargets.map((target, i) =>
        address(target, `policy.allowedTargets[${i}]`).toLowerCase()));
    for (const target of inspected.targets) {
        if (target.toLowerCase() !== IDENTITY_PRECOMPILE && !allowedTargets.has(target.toLowerCase())) {
            throw new Error(`Enso target ${target} is not allowed by policy`);
        }
    }
    const approvals = (policy.allowedApprovals ?? []).map(normalizeApproval);
    for (const approval of inspected.approvals) {
        const rule = approvals.find(candidate => candidate.token === approval.token && candidate.operator === approval.operator);
        if (!rule) throw new Error(`Enso ${approval.kind} from ${approval.token} to ${approval.operator} is not allowed by policy`);
        if (approval.amount === null ? !rule.allowAll : approval.amount > rule.maxAmount) {
            throw new Error(`Enso ${approval.kind} exceeds policy for ${approval.token} and ${approval.operator}`);
        }
    }
    const receiver = address(policy.expectedReceiver, "policy.expectedReceiver");
    if (!addressEvidence(inspected.calls, receiver)) {
        throw new Error(`Enso expected receiver ${receiver} is not present in translated calldata`);
    }
    const inputToken = address(policy.expectedInputToken, "policy.expectedInputToken");
    const outputToken = address(policy.expectedOutputToken, "policy.expectedOutputToken");
    const hasInput = inputToken === NATIVE_TOKEN
        ? inspected.totalEthSpend > 0n
        : inspected.targets.includes(inputToken) || addressEvidence(inspected.calls, inputToken);
    if (!hasInput) throw new Error(`Enso expected input token ${inputToken} is not present in the translated route`);
    if (!inspected.targets.includes(outputToken) && !addressEvidence(inspected.calls, outputToken)) {
        throw new Error(`Enso expected output token ${outputToken} is not present in the translated route`);
    }
}

/** Check that the fork uses the exact Enso EIP-7702 implementation this decoder was reviewed for. */
export async function verifyEnsoCompatibility(client, {chainId = ENSO_COMPATIBILITY.chainId} = {}) {
    if (chainId !== ENSO_COMPATIBILITY.chainId) throw new Error(`Enso compatibility is pinned to chain ${ENSO_COMPATIBILITY.chainId}`);
    const code = await client.getCode({address: ENSO_COMPATIBILITY.eip7702Implementation});
    if (!code || code === "0x") throw new Error("Pinned Enso EIP-7702 implementation is not deployed");
    const codeHash = keccak256(code);
    if (codeHash !== ENSO_COMPATIBILITY.eip7702CodeHash) {
        throw new Error(`Pinned Enso EIP-7702 code hash mismatch: ${codeHash}`);
    }
    return ENSO_COMPATIBILITY;
}

/** Decode the representable subset without authorizing it for execution. */
export function inspectEnsoDelegateRoute(response, {caller, routingStrategy, chainId}) {
    if (routingStrategy !== "delegate") {
        throw new Error("Only Enso delegate responses expose a program for direct Scripter execution");
    }
    if (chainId !== ENSO_COMPATIBILITY.chainId) {
        throw new Error(`Enso compatibility is pinned to chain ${ENSO_COMPATIBILITY.chainId}`);
    }
    if (!response || typeof response !== "object") throw new Error("Enso response must be an object");
    const executionAccount = address(caller, "caller");
    if (response.preTransactions !== undefined && !Array.isArray(response.preTransactions)) {
        throw new Error("Enso preTransactions must be an array");
    }
    const preTransactions = (response.preTransactions ?? []).map((entry, i) =>
        routeTransaction(entry, `preTransactions[${i}]`, executionAccount));
    const main = routeTransaction(response.tx, "tx", executionAccount);
    if (main.target !== executionAccount) {
        throw new Error("Enso delegate tx.to must be the delegated execution account");
    }
    const routeHash = keccak256(encodeAbiParameters([{
        type: "tuple[]", components: [
            {name: "target", type: "address"}, {name: "data", type: "bytes"}, {name: "value", type: "uint256"},
        ],
    }], [[...preTransactions, main].map(({target, data, value}) => ({target, data, value}))]));
    let decoded;
    try { decoded = decodeFunctionData({abi: EXECUTE_SHORTCUT_ABI, data: main.data}); }
    catch { throw new Error("Enso delegate tx.data is not executeShortcut calldata"); }
    const commands = decoded.args[2];
    const slots = decoded.args[3].map((data, i) => ({data: hex(data, `state[${i}]`)}));
    const calls = preTransactions.map(tx => ({...tx, isStatic: false, dependencies: []}));

    for (let cursor = 0, commandIndex = 0; cursor < commands.length; cursor++, commandIndex++) {
        const command = word(commands[cursor], `commands[${cursor}]`);
        const flags = command[4];
        const calltype = flags & CALLTYPE_MASK;
        if (calltype === 0) throw new Error(`Enso command #${commandIndex} is a delegatecall`);
        if (![CALL, STATICCALL, VALUECALL].includes(calltype)) {
            throw new Error(`Enso command #${commandIndex} has invalid call type ${calltype}`);
        }
        let indices;
        if (flags & EXTENDED) {
            cursor++;
            if (cursor >= commands.length) throw new Error(`Enso command #${commandIndex} is missing its extended index word`);
            indices = [...word(commands[cursor], `commands[${cursor}]`)];
        } else {
            indices = [...command.subarray(5, 11)];
        }
        const target = address(`0x${command.subarray(12).toString("hex")}`, `command #${commandIndex} target`);
        let value = 0n;
        if (calltype === VALUECALL) {
            const valueIndex = indices.shift();
            if (valueIndex === undefined || valueIndex === END || valueIndex & VARIABLE || SPECIAL_INDICES.has(valueIndex)) {
                throw new Error(`Enso command #${commandIndex} has an unsupported ETH value reference`);
            }
            const valueSlot = readState(slots, valueIndex, commandIndex, "ETH value");
            if (valueSlot.producer !== undefined || valueSlot.dynamic || byteLength(valueSlot.data) !== 32) {
                throw new Error(`Enso command #${commandIndex} computes its ETH value at runtime`);
            }
            value = BigInt(valueSlot.data);
        }
        let built;
        if (flags & DATA) {
            const dataIndex = indices[0];
            if (dataIndex === undefined || dataIndex === END || SPECIAL_INDICES.has(dataIndex)) {
                throw new Error(`Enso command #${commandIndex} has an unsupported raw calldata reference`);
            }
            const dataSlot = readState(slots, dataIndex, commandIndex, "raw calldata");
            if (dataSlot.producer !== undefined) throw new Error(`Enso command #${commandIndex} computes raw calldata at runtime`);
            built = {data: dataSlot.data, dependencies: []};
        } else {
            built = buildCalldata(command.subarray(0, 4), indices, slots, commandIndex);
        }
        const callIndex = calls.length;
        calls.push({target, data: built.data, value, isStatic: calltype === STATICCALL, dependencies: built.dependencies});
        const output = command[11];
        if (output === END) continue;
        if (output === USE_STATE) throw new Error(`Enso command #${commandIndex} replaces the complete Weiroll state`);
        const outputSlot = output & VALUE_MASK;
        if (outputSlot >= slots.length) throw new Error(`Enso command #${commandIndex} writes missing state slot ${outputSlot}`);
        slots[outputSlot] = {data: "0x", producer: callIndex, dynamic: Boolean((flags & TUPLE_RETURN) || (output & VARIABLE))};
    }

    // A producer can name three destinations in one offset word. For larger fan-out, insert
    // 32-byte identity-precompile relays immediately after it. Each relay consumes one destination
    // and creates three more without changing the value or relying on a deployed helper contract.
    const uses = calls.map(() => []);
    calls.forEach((call, consumer) => {
        for (const dependency of call.dependencies) {
            const producer = calls[dependency.producer];
            if (!producer || dependency.producer >= consumer) throw new Error("Enso command dependency is not produced by an earlier call");
            uses[dependency.producer].push({consumer, position: dependency.position});
        }
    });
    const expanded = [], oldToNew = [], relays = [];
    calls.forEach((call, oldIndex) => {
        oldToNew[oldIndex] = expanded.length;
        expanded.push(call);
        const relayIndexes = [];
        const relayCount = uses[oldIndex].length > 3 ? Math.ceil((uses[oldIndex].length - 3) / 2) : 0;
        for (let i = 0; i < relayCount; i++) {
            relayIndexes.push(expanded.length);
            expanded.push({
                target: IDENTITY_PRECOMPILE, data: "0x" + "00".repeat(32), value: 0n,
                isStatic: true, dependencies: [],
            });
        }
        relays[oldIndex] = relayIndexes;
    });
    const patches = expanded.map(() => []);
    uses.forEach((producerUses, oldProducer) => {
        const sources = [oldToNew[oldProducer], ...relays[oldProducer]];
        let cursor = 0;
        sources.forEach((source, level) => {
            const hasNext = level + 1 < sources.length;
            const directCount = Math.min(hasNext ? 2 : 3, producerUses.length - cursor);
            for (let i = 0; i < directCount; i++, cursor++) {
                const use = producerUses[cursor];
                patches[source].push({consumer: oldToNew[use.consumer], position: use.position});
            }
            if (hasNext) patches[source].push({consumer: sources[level + 1], position: 0});
        });
        if (cursor !== producerUses.length) throw new Error("Could not expand Enso return-value fan-out");
    });
    const memTargets = patches.map((destinations, producer) => destinations.map(destination =>
        expanded.slice(producer + 1, destination.consumer)
            .reduce((sum, item) => sum + regionSize(item.data), 0) + destination.position));
    const targets = expanded.map(call => call.target);
    const msgValues = [];
    const offsets = expanded.map((call, i) => {
        let valueIndex = 0;
        if (call.value > 0n) { msgValues.push(call.value); valueIndex = msgValues.length; }
        const destinations = memTargets[i];
        if (destinations.length > 3) throw new Error("Internal fan-out expansion exceeded three destinations");
        if (destinations.length === 0) return call.isStatic ? staticCall(0, 0) : stateChangingCall(valueIndex);
        if (destinations.length === 1) return call.isStatic
            ? staticCall(destinations[0], 32) : stateChangingCall(valueIndex, destinations[0], 32);
        const lengths = destinations.map(() => 32), sources = destinations.map(() => 0);
        return call.isStatic
            ? staticCallPartialReturn(destinations, lengths, sources, 32)
            : callPartialReturn(valueIndex, destinations, lengths, sources, 32);
    });
    const requiredValue = preTransactions.reduce((sum, tx) => sum + tx.value, main.value);
    const totalEthSpend = msgValues.reduce((sum, value) => sum + value, 0n);
    const approvals = expanded.map(approvalFor).filter(Boolean);
    return {batch: {targets, offsets, calldatas: packFrames(expanded), msgValues}, value: requiredValue,
        commandCount: expanded.length - preTransactions.length,
        relayCount: relays.reduce((sum, indexes) => sum + indexes.length, 0),
        totalEthSpend, targets: [...new Set(targets)], approvals,
        calls: expanded.map(({target, data, value, isStatic}) => ({target, data, value, isStatic})),
        compatibility: ENSO_COMPATIBILITY, routeHash};
}

/** Translate and authorize an Enso route under an explicit wallet policy. */
export function buildEnsoDelegateBatch(response, options) {
    const inspected = inspectEnsoDelegateRoute(response, options);
    enforcePolicy(inspected, options?.policy);
    return inspected;
}

/** Gate signing on an exact differential fork simulation and application-level bounds. */
export function assertEnsoSimulation({routeHash, chainId, forkBlock, enso, scripter, minOutput, maxInput}) {
    if (!enso || !scripter) throw new Error("Both Enso and Scripter simulation results are required");
    if (!/^0x[0-9a-fA-F]{64}$/.test(routeHash ?? "")) throw new Error("A valid translated routeHash is required");
    if (chainId !== ENSO_COMPATIBILITY.chainId) throw new Error(`Simulation must use chain ${ENSO_COMPATIBILITY.chainId}`);
    if (!Number.isSafeInteger(forkBlock) || forkBlock <= 0) throw new Error("Simulation forkBlock must be a positive safe integer");
    if (enso.routeHash?.toLowerCase() !== routeHash.toLowerCase()
        || scripter.routeHash?.toLowerCase() !== routeHash.toLowerCase()) {
        throw new Error("Simulation results do not match the translated routeHash");
    }
    const ensoOutput = uint256(enso.outputDelta, "simulation.enso.outputDelta");
    const scripterOutput = uint256(scripter.outputDelta, "simulation.scripter.outputDelta");
    const ensoInput = uint256(enso.inputDelta, "simulation.enso.inputDelta");
    const scripterInput = uint256(scripter.inputDelta, "simulation.scripter.inputDelta");
    if (ensoOutput !== scripterOutput || ensoInput !== scripterInput) {
        throw new Error("Enso and Scripter fork simulations have different balance deltas");
    }
    if (scripterOutput < uint256(minOutput, "simulation.minOutput")) throw new Error("Scripter simulation output is below minOutput");
    if (scripterInput > uint256(maxInput, "simulation.maxInput")) throw new Error("Scripter simulation input is above maxInput");
    return {inputDelta: scripterInput, outputDelta: scripterOutput};
}
