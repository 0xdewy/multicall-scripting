// Import required functions from viem
const { encodeFunctionData, getAbiItem } = require("viem");

// Constants
const PARTIAL_RETURN_VARS = 3n;
const STATIC_CALL_FLAG = 0xffn;
const CALL_FLAG = 0xfen;
const DELEGATE_CALL_FLAG = 0xfdn;
const STATIC_CALL_PARTIAL_RETURN_FLAG = 0xfcn;
const VALUE_OFFSET = 248n;

const UINT120_MAX = (2n ** 120n) - 1n;
const UINT8_MAX = 255n;
const UINT40_MAX = (2n ** 40n) - 1n;
const UINT16_MAX = (2n ** 16n) - 1n;

class TransactionBuilder {
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

    // Process arguments to handle types and dynamic data
    const processedArgs = [];
    for (let i = 0; i < functionAbi.inputs.length; i++) {
      const abiInput = functionAbi.inputs[i];
      const arg = args[i];
      
      // Check if the type is dynamic
      const isDynamic = abiInput.type === "string" || 
                        abiInput.type === "bytes" || 
                        abiInput.type.endsWith("[]");
      
      // For call output references (objects with callIndex), we need to handle them specially
      // They will be processed in the Argument Memory Offsets section
      if (arg && typeof arg === "object" && "callIndex" in arg) {
        // For now, we can push a placeholder value
        // The actual value will be filled in during execution
        processedArgs.push(0n);
        continue;
      }
      
      // Validate dynamic types
      if (isDynamic) {
        if (!arg) {
          throw new Error(`Must define the value of dynamic arguments. Type: ${abiInput.type} Name: ${abiInput.name}`);
        }
      }
      
      // Process the argument value
      let processedValue = arg;
      
      // Convert to BigInt for integer types and addresses
      if (abiInput.type.includes("int") || abiInput.type === "address") {
        // Handle hex strings
        if (typeof processedValue === "string" && processedValue.startsWith("0x")) {
          processedValue = BigInt(processedValue);
        } else if (typeof processedValue === "string" && /^\d+$/.test(processedValue)) {
          processedValue = BigInt(processedValue);
        } else if (typeof processedValue === "number") {
          processedValue = BigInt(processedValue);
        }
        // Ensure it's a BigInt
        if (typeof processedValue !== "bigint") {
          processedValue = BigInt(processedValue);
        }
      }
      
      processedArgs.push(processedValue);
    }

    // =============================== Argument Memory Offsets ===========================================
    // Update where the previous call is saving its output if one of the args is from a previous call
    for (let index = 0; index < args.length; index++) {
      const arg = args[index];
      // Check if this argument references a previous call's output
      if (arg && typeof arg === "object" && "callIndex" in arg) {
        // Parse numeric fields
        const callIndex = Number(arg.callIndex);
        const offset = Number(arg.offset || 0);
        const size = Number(arg.size || 32);
        
        const prevCall = this.calls[callIndex];
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
        prevCall.returnDataLens.push(size);
        prevCall.returnDataOffsets.push(offset);
      }
    }

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
    // Start dynamic data after all static slots
    let dynamicOffset = functionAbi.outputs.length * 32;
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
      // Check if the type is dynamic
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
      // Check if sizing is required
      let requiresSizing = isDynamic;
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


// Helper functions
function staticCall(memTarget, resultLength) {
  const m = BigInt(memTarget);
  const r = BigInt(resultLength);
  if (m > UINT120_MAX) throw new Error("memTarget value too large");
  if (r > UINT120_MAX) throw new Error("resultLength value too large");
  return (STATIC_CALL_FLAG << VALUE_OFFSET) | (m << 120n) | r;
}

function stateChangingCall(msgValueIndex = 0) {
  const mvi = BigInt(msgValueIndex);
  if (mvi > UINT8_MAX) throw new Error("msgValueIndex too large");
  return (CALL_FLAG << VALUE_OFFSET) | (mvi << 240n);
}

// Export the class and functions
module.exports = { TransactionBuilder, staticCall, stateChangingCall };
