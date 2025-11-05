// Import required functions from viem
const { encodeFunctionData, getAbiItem } = require("viem");
const fs = require("fs");

// Constants from the Constants.sol
export const PARTIAL_RETURN_VARS = BigInt(3);
export const STATIC_CALL_FLAG = BigInt(0xff);
export const CALL_FLAG = BigInt(0xfe);
export const DELEGATE_CALL_FLAG = BigInt(0xfd); // Not used in the provided functions but included for completeness
export const STATIC_CALL_PARTIAL_RETURN_FLAG = BigInt(0xfc);
export const PARTIAL_RETURN_MEM_TARGET_FLAG_INDIVIDUAL = BigInt(0xffffffffff); // uint40 max
export const PARTIAL_RETURN_RES_LENGTH_FLAG = BigInt(0xffffffffffff); // uint48 max, though function uses uint16
export const PARTIAL_RETURN_RET_OFFSET_FLAG = BigInt(0xffffffffffff); // uint48 max, though function uses uint16
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
  addCall(abi, target, functionName, args, msgValue = BigInt(0)) {
    // Resolve arguments for ABI lookup, handling CallOutput objects
    const functionAbi = getAbiItem({
      abi,
      name: functionName,
      args: args.map((arg) =>
        arg && typeof arg === "object" && "callIndex" in arg ? arg.value : arg,
      ),
    });

    // Fail if ABI/function is not found
    if (!functionAbi || functionAbi.type !== "function") {
      throw new Error(`Function ${functionName} not found in ABI`);
    }

    // Determine call type based on function state mutability
    const callType =
      functionAbi.stateMutability === "view" ||
      functionAbi.stateMutability === "pure"
        ? STATIC_CALL_FLAG
        : CALL_FLAG;

    // Update where the previous call is saving its output if one of the args is from a previous call
    const resolvedArgs = args.map((arg, index) => {
      // Check if this argument references a previous call's output
      if (
        arg &&
        typeof arg === "object" &&
        "callIndex" in arg &&
        "value" in arg
      ) {
        const prevCall = this.calls[arg.callIndex];

        // Multiple outputs not yet supported
        if (prevCall.memTargets.length > 0 || prevCall.special) {
          throw Error("Multiple return values not implemented");
        }

        // Calculate memory positions and offset
        // TODO: add argumet offset here??
        const paramMemoryPosition = this.freeMemory + 4 + 32 * index;
        const sourceMemoryPosition =
          prevCall.freeMemory + prevCall.fnCalldata.length / 2;
        const returnOffset = paramMemoryPosition - sourceMemoryPosition;

        // Update previous call to return data at the calculated offset
        prevCall.memTargets.push(returnOffset);

        return arg.value;
      }

      return arg;
    });

    // Encode function call data
    const fnCalldata = encodeFunctionData({
      abi,
      functionName,
      args: resolvedArgs,
    });

    // Update memory pointer (fnCalldata is a hex string, so length / 2 gives byte count)
    const freeMemory = this.freeMemory;
    this.freeMemory += fnCalldata.length / 2;

    // TODO: check for special/multiple return values
    // Create call object
    const call = {
      target,
      fnCalldata,
      calltype_flag: callType,
      freeMemory,
      memTargets: [],
      returnDataLens: [],
      returnDataOffsets: [],
      msgValue,
      special: false,
    };
    this.calls.push(call);
    const callIndex = this.calls.length - 1;

    // Generate output object based on function ABI outputs
    let offset = 0;
    const outputs = [];

    for (const output of functionAbi.outputs) {
      let value;
      let offsetAdded = 32; // Most types use 32 bytes

      switch (output.type) {
        case "address":
          value = "0x0000000000000000000000000000000000000000";
          break;
        case "uint256":
        case "int256":
          value = 0;
          break;
        case "bool":
          value = false;
          break;
        case "string":
        case "bytes":
        default:
          throw new Error(`Type not supported: ${output.type}`);
      }

      outputs.push({ callIndex, type: output.type, value, offset });
      offset += offsetAdded;
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

      let memTarget = _call.memTargets.length > 0 ? _call.memTargets[0] : 0;
      let returnData =
        _call.returnDataLens.length > 0 ? _call.returnDataLens[0] : 0;

      // Use multiple output values
      if (_call.special) {
        throw Error("multiple output usage not yet implemented in js");
      }

      // Encode msgvalue and calltype
      if (_call.calltype_flag == STATIC_CALL_FLAG) {
        offsets.push(staticCall(memTarget, returnData));
      } else if (_call.calltype_flag == CALL_FLAG) {
        if (_call.msgValue > 0) {
          // Sending ETH $$
          // NOTE: index starts at 1 instead of 0
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

// staticCall: Emulates a static call with memory target and result length
// <calltype><valueIndex><memTarget><resultLength>
export function staticCall(memTarget, resultLength) {
  memTarget = BigInt(memTarget);
  resultLength = BigInt(resultLength);

  // Input validation
  if (memTarget > UINT120_MAX) {
    throw new Error("memTarget value too large");
  }
  if (resultLength > UINT120_MAX) {
    throw new Error("resultLength value too large");
  }

  // Bitwise operations to pack data
  // calltype (8 bits) | valueIndex (8 bits, 0 for static call) | memTarget (120 bits) | resultLength (120 bits)
  const offsets =
    (STATIC_CALL_FLAG << VALUE_OFFSET) |
    (BigInt(0) << BigInt(240)) | // valueIndex = 0 for static calls
    (memTarget << BigInt(120)) |
    resultLength;

  return offsets;
}

// stateChangingCall: Overload with no parameters (msgValueIndex = 0)
export function stateChangingCall(msgValueIndex = 0) {
  return stateChangingCallWithParams(msgValueIndex, 0, 0);
}

// stateChangingCall: Overload with msgValueIndex, memTarget, and resultLength
export function stateChangingCallWithParams(
  msgValueIndex,
  memTarget,
  resultLength,
) {
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

  // Bitwise operations to pack data
  // <calltype><valueIndex><memTarget><resultLength>
  // calltype (8 bits) | valueIndex (8 bits) | memTarget (120 bits) | resultLength (120 bits)
  const offsets =
    (CALL_FLAG << VALUE_OFFSET) |
    (msgValueIndex << BigInt(240)) |
    (memTarget << BigInt(120)) |
    resultLength;

  return offsets;
}

// staticCallPartialReturn: Handles partial return data with multiple variables
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

export function loadABI(abiPath) {
  try {
    // Simple Bun-compatible file reading - no path module needed
    const abiContent = fs.readFileSync(abiPath, "utf8");
    const artifact = JSON.parse(abiContent);

    // Handle both direct ABI arrays and Foundry artifacts
    if (Array.isArray(artifact)) {
      return artifact; // Direct ABI array
    } else if (artifact.abi) {
      return artifact.abi; // Foundry artifact with ABI property
    } else {
      throw new Error(`Invalid ABI format in ${abiPath}`);
    }
  } catch (error) {
    // If relative path fails, try with ./ prefix
    try {
      const altPath = `./${abiPath}`;
      const abiContent = fs.readFileSync(altPath, "utf8");
      const artifact = JSON.parse(abiContent);

      if (Array.isArray(artifact)) {
        return artifact;
      } else if (artifact.abi) {
        return artifact.abi;
      } else {
        throw new Error(`Invalid ABI format in ${altPath}`);
      }
    } catch (error2) {
      throw new Error(`Failed to load ABI from ${abiPath}: ${error.message}`);
    }
  }
}

export function addCallsAndBuild(calls) {
  const transactionBuilder = new TransactionBuilder();

  for (const call of calls) {
    // Load ABI from file path
    const abi = loadABI(call.abiPath);

    transactionBuilder.addCall(
      abi,
      call.target,
      call.functionName,
      call.args,
      call.value ? BigInt(call.value) : BigInt(0),
    );
  }

  return transactionBuilder.build();
}
