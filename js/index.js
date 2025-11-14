// Import required functions from viem
const { encodeFunctionData, getAbiItem } = require("viem");

// Constants from the Constants.sol
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
    this.calls = []; // Array to store call objects
    this.freeMemory = 0; // Memory pointer
  }

  // Add a call to the script
  // TODO: support overriding the calltype (static/call)
  addCall(abi, target, functionName, args, msgValue = BigInt(0)) {
    

    // =============================== Load ABI ===========================================
    const functionAbi = getAbiItem({
      abi,
      name: functionName,
    });
    
    // Fail if ABI/function is not found
    if (!functionAbi || functionAbi.type !== "function") {
      throw new Error(`Function ${functionName} not found in ABI`);
    }

    // =============================== CallType ===========================================
    // Determine call type based on function state mutability
    // TODO: allow user to modify calltype
    const callType =
      functionAbi.stateMutability === "view" ||
      functionAbi.stateMutability === "pure"
        ? STATIC_CALL_FLAG
        : CALL_FLAG;


    // =============================== Args Validation ===========================================
    if (args.length != functionAbi.inputs.length) {
      throw new Error(`Number of arguments do not match abi arguments ${args.length} vs ${functionAbi.inputs.length}`);
    }

    functionAbi.inputs.zip(args).forEach((abiInput, arg) => {
      if (arg.requiresResizing) {
        throw new Error(`Does not support multiple dynamic outputs yet`);
      }

      if (["string", "bytes"].contains(abiInput.type) || abiInput.type.contains("[]")) {
          if (!arg.value) {
            throw new Error(`Must define the value of dynamic arguments. Type: ${abiInput.type} Name: ${abiInput.name}`);
          }
          // TODO: properly parse bytes/string
          arg.size = arg.value.length / 2;
      }
    });

    // Resolve arguments for ABI lookup, handling CallOutput objects
    // First, process args to ensure numbers are properly handled
    // Process args to ensure numbers are properly handled
    const processedArgs = args.map((arg) => {
      if (arg && typeof arg === "object" && "callIndex" in arg) {
        // For call output references, we need to handle them specially
        // Convert numeric fields to numbers
        const processedArg = { ...arg };
        if (typeof arg.callIndex === 'string') {
          processedArg.callIndex = parseInt(arg.callIndex);
        }
        if (typeof arg.offset === 'string') {
          processedArg.offset = parseInt(arg.offset);
        }
        if (typeof arg.size === 'string') {
          processedArg.size = parseInt(arg.size);
        }
        return processedArg;
      }
      // If it's already a BigInt, keep it
      if (typeof arg === "bigint") {
        return arg;
      }
      // Handle hex strings (including numbers passed as hex)
      if (typeof arg === "string" && arg.startsWith("0x") && /^0x[0-9a-fA-F]+$/.test(arg)) {
        try {
          return BigInt(arg);
        } catch (e) {
          return arg;
        }
      }
      // Handle regular numbers
      if (typeof arg === "number") {
        return BigInt(arg);
      }
      // Handle numeric strings (without 0x prefix)
      if (typeof arg === "string" && /^-?\d+$/.test(arg)) {
        try {
          return BigInt(arg);
        } catch (e) {
          return arg;
        }
      }
      return arg;
    });
    

    // =============================== Argument Memory Offsets ===========================================
    // Update where the previous call is saving its output if one of the args is from a previous call
    args.forEach((arg, index) => {
      // Check if this argument references a previous call's output
      if (arg && typeof arg === "object" && "callIndex" in arg) {
        const prevCall = this.calls[arg.callIndex];
        // Multiple outputs not yet supported
        if (prevCall.memTargets.length > 0 || prevCall.special) {
          // TODO: doesn't need special multiple output if the return vals can be used in the same order (treat as 1 var)
          throw Error("Multiple return values not implemented");
        }

        // where the previous call output is going to be placed
        // current_offset + 4 byte selector + (32 * index)
        const paramMemoryPosition = this.freeMemory + 4 + 32 * index;
        // memory boundary of previous call
        const sourceMemoryPosition =
          prevCall.freeMemory + (prevCall.fnCalldata.length / 2);
        // offset - how far forward in bits the output needs to be saved
        const returnOffset = paramMemoryPosition - sourceMemoryPosition;

        // Update previous call to return data at the calculated offset
        prevCall.memTargets.push(returnOffset);
        prevCall.returnDataLens.push(arg.size);
        prevCall.returnDataOffsets.push(arg.offset);
      }
    });

    // =============================== Encode Skeleton Calldata===========================================
    // Encode function call data
    const fnCalldata = encodeFunctionData({
      abi,
      functionName,
      args: processedArgs,
    });


    // =============================== Store Call + Update Free Memory ===========================================
    // Create call object
    this.calls.push({
      target,
      fnCalldata,
      calltype_flag: callType,
      freeMemory: this.freeMemory,
      memTargets: [],
      returnDataLens: [],
      returnDataOffsets: [],
      msgValue,
      special: false,
    });
    // Update memory pointer (fnCalldata is a hex string, so length / 2 gives byte count)
    this.freeMemory += fnCalldata.length / 2;


    // =============================== Build Outputs ===========================================
    // Calculate offsets for each output, considering dynamic types
    let staticOffset = 0;
 // Start dynamic data after all static slots and add 32 to account for the length slot
    let dynamicOffsetStart = functionAbi.outputs.length * 32 + 32;
    let dynamicOffset = dynamicOffsetStart; // Start dynamic data after all static slots
    const outputs = [];
  
    for (let i = 0; i < functionAbi.outputs.length; i++) {
      const output = functionAbi.outputs[i];
    
      // Determine default value based on type
      let value;
      if (output.type === "address") {
        value = "0x0000000000000000000000000000000000000000";
      } else if (output.type === "bool") {
        value = false;
      } else {
        value = 0;
      }
      // Dynamic types store an offset to the actual start of their data
      const isDynamic = output.type === "string" || 
                        output.type === "bytes" || 
                        output.type.endsWith("[]");
      let size;
      let offset;
      if (isDynamic) {
        // For dynamic types, the static part contains the offset to the dynamic data
        offset = dynamicOffset;
        size = 32; // The offset value itself is 32 bytes
        // The actual data will be calculated when the user defines the size
        dynamicOffset += 32; // Move dynamic offset for next dynamic item
      } else {
        // Static types are stored directly in their slot
        offset = staticOffset;
        size = 32;
        staticOffset += 32;
      }
      // Does this have a dynamic variable earlier in the output that effects its offset?
      // TODO: need to use special call to handle dynamic data safely
      let requiresSizing = dynamicOffset > 32 + dynamicOffsetStart ? true : false;
      // Push the outputs
      outputs.push({
        callIndex: this.calls.length - 1, // store this for easy reference later
        type: output.type,
        value,
        offset: offset,
        size: size,
        requiresSizing,
      });
    
    }

    return outputs;
  }

  // returns (address[] memory targets, uint256[] memory offsets, bytes[] memory datas, uint256[] memory values)
  build() {
    let targets = [];
    let offsets = [];
    let calldatas = [];
    let msgValues = [];

    for (let i = 0; i < this.calls.length; i++) {
      let _call = this.calls[i];
      targets.push(_call.target);
      calldatas.push(_call.fnCalldata);
      // Use multiple output values
      if (_call.special) {
        throw Error("multiple output usage not yet implemented in js");
      }
      let memTarget = _call.memTargets.length > 0 ? _call.memTargets[0] : 0;
      let returnData =
        _call.returnDataLens.length > 0 ? _call.returnDataLens[0] : 0;
      // Encode msgvalue and calltype
      if (_call.calltype_flag == STATIC_CALL_FLAG) {
        offsets.push(staticCall(memTarget, returnData));
      } else if (_call.calltype_flag == CALL_FLAG) {
        // NOTE: msg.value index is confusing:  0 == no msg.value, 1 == index 0
        if (_call.msgValue > 0) {
          offsets.push(stateChangingCall(msgValues.length + 1));
          msgValues.push(_call.msgValue);
        } else {
          offsets.push(stateChangingCall());
        }
      }
    }
    return { targets, offsets, calldatas, msgValues };
  }
}


// ===========================================Helpers===========================================

// staticCall: Emulates a static call with memory target and result length
// <calltype><valueIndex><memTarget><resultLength>
export function staticCall(memTarget, resultLength) {
  memTarget = BigInt(memTarget);
  resultLength = BigInt(resultLength);
  const calltypePart = STATIC_CALL_FLAG << VALUE_OFFSET;
  const memTargetPart = memTarget << BigInt(120);
  const resultLengthPart = resultLength;
  const offsets = calltypePart | memTargetPart | resultLengthPart;
  return offsets;
}

// stateChangingCall
export function stateChangingCall(msgValueIndex = 0) {
  return _stateChangingCall(msgValueIndex, 0, 0);
}

function _stateChangingCall(msgValueIndex, memTarget, resultLength) {
  msgValueIndex = BigInt(msgValueIndex);
  memTarget = BigInt(memTarget);
  resultLength = BigInt(resultLength);

  // Input validation
  if (msgValueIndex > UINT8_MAX) {
    throw new Error("msgValueIndex too large");
  }
  if (memTarget > UINT120_MAX) {
    throw new Error("memTarget value too large");
  }
  if (resultLength > UINT120_MAX) {
    throw new Error("resultLength value too large");
  }

  // <calltype><valueIndex><memTarget><resultLength>
  // calltype (8 bits) | valueIndex (8 bits) | memTarget (120 bits) | resultLength (120 bits)
  const offsets =
    (CALL_FLAG << VALUE_OFFSET) |
    (msgValueIndex << BigInt(240)) |
    (memTarget << BigInt(120)) |
    resultLength;

  return offsets;
}

// staticCallPartialReturn: To make a static call and use multiple return vars
export function staticCallPartialReturn(
  memTargets,
  resultLengths,
  returnOffsets,
  returnLength,
) {
  returnLength = BigInt(returnLength);

  // Input validation
  if (
    memTargets.length > PARTIAL_RETURN_VARS ||
    resultLengths.length > PARTIAL_RETURN_VARS ||
    returnOffsets.length > PARTIAL_RETURN_VARS
  ) {
    throw new Error("invalid number of params");
  }
  if (returnLength > UINT16_MAX) {
    throw new Error("returnLength is too large");
  }

  const len = memTargets.length;
  let encodedMemTargets = BigInt(0);
  let encodedResultLengths = BigInt(0);
  let encodedOffsets = BigInt(0);

  // Encode arrays into packed data
  for (let i = 0; i < len; i++) {
    const memTarget = BigInt(memTargets[i]);
    const resultLength = BigInt(resultLengths[i]);
    const returnOffset = BigInt(returnOffsets[i]);

    // Validate individual elements
    if (memTarget > PARTIAL_RETURN_MEM_TARGET_FLAG_INDIVIDUAL) {
      throw new Error("memTarget value too large");
    }
    if (resultLength > UINT16_MAX) {
      throw new Error("resultLength value too large");
    }
    if (returnOffset > UINT16_MAX) {
      throw new Error("returnOffset value too large");
    }

    const varOffset = Number(PARTIAL_RETURN_VARS - (i + 1));
    encodedMemTargets |= memTarget << BigInt(varOffset * 40);
    encodedResultLengths |= resultLength << BigInt(varOffset * 16);
    encodedOffsets |= returnOffset << BigInt(varOffset * 16);
  }

  // Pack data into offsets
  // <calltype><valueIndex><memTargets><resultLengths><returnOffsets><resultLength><num_vars>
  // calltype (8 bits) | valueIndex (8 bits, 0) | memTargets (120 bits) | resultLengths (48 bits) | returnOffsets (48 bits) | resultLength (16 bits) | num_vars (8 bits)
  const offsets =
    (STATIC_CALL_PARTIAL_RETURN_FLAG << BigInt(248)) |
    (BigInt(0) << BigInt(240)) | // valueIndex = 0
    (encodedMemTargets << BigInt(120)) |
    (encodedResultLengths << BigInt(72)) |
    (encodedOffsets << BigInt(24)) |
    (returnLength << BigInt(8)) |
    BigInt(len);

  return offsets;
}
