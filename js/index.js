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

    // Dynamic data safety check
    // TODO: add support in contract to parse dynamic data properly
    functionAbi.inputs.forEach((abiInput, arg) => {
      if (arg.requiresResizing) {
        throw new Error(`Does not support multiple dynamic outputs yet`);
      }
    });

    // Make sure dynamic data has been manually input
    functionAbi.inputs.forEach((abiInput, i) => {
      // Dynamic types must be input properly
      if (isDynamicType(abiInput)) {
          if (!args[i].value) {
            throw new Error(`Must define the value of dynamic arguments. Type: ${abiInput.type} Name: ${abiInput.name}`);
          }
          // TODO: properly parse bytes/string
          // resize argument based on user input
          args[i].size = args[i].value.length / 2;
      }
    });

    // =============================== Process Arg Value ===========================================
    // Extract raw value and parse to BigInt if needed
    const processedArgs = functionAbi.inputs.map((abiInput, i) => {
      let arg = args[i];
      // Extract raw value from argument
      let baseValue = (arg && typeof arg === "object" && "callIndex" in arg) ? arg.value : arg;
      if (abiInput.type.includes("int")) {
        return BigInt(baseValue);
      }
      return baseValue;
    });

    // =============================== Argument Memory Offsets ===========================================
    // Update where the previous call is saving its output if one of the args is from a previous call
    args.forEach((arg, index) => {
      // Check if this argument references a previous call's output
      if (arg && typeof arg === "object" && "callIndex" in arg) {
        const prevCall = this.calls[arg.callIndex];
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
        prevCall.resultLengths.push(arg.size);
        prevCall.returnOffsets.push(arg.offset);
        // Only save return data up until the data we need
        prevCall.returnDataSize = Math.max(prevCall.returnDataSize, (arg.offset + arg.size));
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
    // Create call object (return data gets set when its indicated its being used)
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
    });

    // Update memory pointer (fnCalldata is a hex string, so length / 2 gives byte count)
    this.freeMemory += fnCalldata.length / 2;

    // =============================== Build Outputs ===========================================
    // TODO: need to use special call to handle dynamic data safely
    // Format outputs based on how they will be layed out in calldata
    let formattedOutputs = [];
      functionAbi.outputs.forEach(o => {
      if (o.type == "tuple" && !isDynamicType(o)) {
       formattedOutputs =   [...formattedOutputs, ...o.components];
      } else {
        // If tuple is dynamic it will only use up 1 slot and be placed at an offset
        formattedOutputs.push(o);
      }
    });

    // Determine default value based on type
    const values = formattedOutputs.map(output => {
      if (output.type == "address") {
        return "0x0000000000000000000000000000000000000000";
      } else if (output.type == "bool") {
        return false;
      } else if (output.type == "bytes") {
        return "";
      } else if (output.type == "string") {
        return "";
      } else if (output.type.includes("[]")) {
        return [];
      } else {
        return 0;
      }
    });

    // Start dynamic data after all static slots and add 32 to account for the length slot
    let dynamicOffsetStart = functionAbi.outputs.length * 32 + 32;
    let dynamicOffset = dynamicOffsetStart; // Start dynamic data after all static slots

    const outputs = [];
    let staticOffset = 0;
      
    // TODO: clean this for loop up
    for (let i = 0; i < formattedOutputs.length; i++) {
      const output = formattedOutputs[i];
      // Dynamic types store an offset to the actual start of their data
      let size;
      let offset;
      if (isDynamicType(output)) {
        // For dynamic types, the static part includes the offset to the dynamic data
        offset = dynamicOffset;
        // The actual data will be calculated when the user defines the size
        dynamicOffset += 32; // Move dynamic offset for next dynamic item
      } else {
        // Static types are stored directly in their slot
        offset = staticOffset;
        staticOffset += 32;
      }

      // Does this have a dynamic variable earlier in the output that effects its offset?
      let requiresSizing = dynamicOffset > 32 + dynamicOffsetStart ? true : false;

      // Push the outputs
      outputs.push({
        callIndex: this.calls.length - 1, // store this for easy reference later
        type: output.type,
        value: values[i],
        offset: offset,
        size: 32,  // dynamic types will be resized later
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
      const _call = this.calls[i];
      targets.push(_call.target);
      calldatas.push(_call.fnCalldata);
        
      // Make sure no more than 3 variables are being accessed
      if (_call.memTargets.length > 3) {
        throw Error(`trying to use too many variables from one call. 3 is maximum. used: ${memTargets.length}`);
      }

      // Use multiple output values? 
      if (_call.memTargets.length > 1) {
        offsets.push(staticCallPartialReturn(_call.memTargets, _call.resultLengths, _call.returnOffsets, _call.returnDataSize));
        continue;
      }

      // Get the target memory offset
      let memTarget = _call.memTargets.length > 0 ? _call.memTargets[0] : 0;

      // Get the return data memory offset
      let returnData =
        _call.resultLengths.length > 0 ? _call.resultLengths[0] : 0;

      // Verify calltype flag is valid
      if (_call.calltype_flag != STATIC_CALL_FLAG && _call.calltype_flag != CALL_FLAG) {
        throw Error(`Trying to use invalid calltype flag ${_call.calltype_flag}`);
      }

      // Encode msgvalue and calltype
      if (_call.calltype_flag == STATIC_CALL_FLAG) {
        offsets.push(staticCall(memTarget, returnData));
        continue;
      }

      // State changing call
      if (_call.msgValue > 0) {
        // NOTE: msg.value index is confusing:  0 == no msg.value, 1 == index 0
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
  returnDataSize,
) {
  returnDataSize = BigInt(returnDataSize);

  // Input validation
  if (
    memTargets.length > PARTIAL_RETURN_VARS ||
    resultLengths.length > PARTIAL_RETURN_VARS ||
    returnOffsets.length > PARTIAL_RETURN_VARS
  ) {
    throw new Error("invalid number of params");
  }
  if (returnDataSize > UINT16_MAX) {
    throw new Error("returnDataSize is too large");
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
    if (memTarget > UINT40_MAX) {
      throw new Error("memTarget value too large");
    }
    if (resultLength > UINT16_MAX) {
      throw new Error("resultLength value too large");
    }
    if (returnOffset > UINT16_MAX) {
      throw new Error("returnOffset value too large");
    }

    const varOffset = Number(Number(PARTIAL_RETURN_VARS) - (i + 1));
    encodedMemTargets |= memTarget << BigInt(varOffset * 40);
    encodedResultLengths |= resultLength << BigInt(varOffset * 16);
    encodedOffsets |= returnOffset << BigInt(varOffset * 16);
  }

  // Pack data into offsets
  // <calltype><valueIndex><memTargets><resultLengths><returnOffsets><resultLength><num_vars>
  // calltype (8 bits) | valueIndex (8 bits, 0) | memTargets (120 bits) | resultLengths (48 bits) | returnOffsets (48 bits) | resultLength (16 bits) | num_vars (8 bits)
  const offsets =
    (STATIC_CALL_PARTIAL_RETURN_FLAG << VALUE_OFFSET) |
    (BigInt(0) << BigInt(240)) | // valueIndex = 0
    (encodedMemTargets << BigInt(120)) |
    (encodedResultLengths << BigInt(72)) |
    (encodedOffsets << BigInt(24)) |
    (returnDataSize << BigInt(8)) |
    BigInt(len);

  return offsets;
}

function isDynamicType(abiInput) {
      // TODO: exhaust all ABI options
      if (["string", "bytes"].includes(abiInput.type) || abiInput.type.includes("[]")) {
          return true;
      }

      // TODO: review this and make sure covers all cases
      if (abiInput.type == "tuple") {
        abiInput.components.forEach(c => {
          if (isDynamicType(c)) {
            return true;
          }
        });
      }

      return false;
}
