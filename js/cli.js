const { TransactionBuilder } = require("./index.js");
const fs = require("fs");

// =====================================Cli Helpers===========================================
function loadABI(abiPath) {
  const readABI = (path) => {
    const content = fs.readFileSync(path, "utf8");
    const artifact = JSON.parse(content);
    return Array.isArray(artifact) ? artifact : artifact.abi;
  };

  try {
    return readABI(abiPath);
  } catch {
    return readABI(`./${abiPath}`);
  }
}

export function addCallsAndBuild(calls) {
  const transactionBuilder = new TransactionBuilder();

  for (const call of calls) {
    try {
      // Load ABI from file path
      const abi = loadABI(call.abiPath);

      // Get the function ABI to determine parameter types
      const functionAbi = abi.find(
        (item) => item.type === "function" && item.name === call.functionName,
      );

      if (!functionAbi) {
        throw new Error(`Function ${call.functionName} not found in ABI`);
      }

      // Process arguments using ABI types
      const processedArgs = call.args.map((arg, index) => {
        // If argument is referencing other output return as is
        if (arg && typeof arg === "object" && "callIndex" in arg) {
          return arg; // Return output reference objects as-is
        }

        // Get the expected type from the ABI
        const inputType = functionAbi.inputs[index].type;
        
        // Handle numeric types (uint, int, bool)
        if (inputType.startsWith('uint') || inputType.startsWith('int') || inputType === 'bool') {
          // Handle hex strings
          if (typeof arg === "string" && arg.startsWith("0x")) {
            try {
              return BigInt(arg);
            } catch (e) {
              console.error(`Failed to parse "${arg}" to BigInt: ${e.message}`);
              throw new Error(`Failed to parse String to BigInt`);
            }
          }
          // Handle regular numbers
          if (typeof arg === "number") {
            return BigInt(arg);
          }
          // Handle BigInt directly
          if (typeof arg === "bigint") {
            return arg;
          }
          // Handle numeric strings (without 0x prefix)
          if (typeof arg === "string" && /^-?\d+$/.test(arg)) {
            try {
              return BigInt(arg);
            } catch (e) {
              console.error(`Failed to parse "${arg}" to BigInt: ${e.message}`);
              throw new Error(`Failed to parse String to BigInt`);
            }
          }
        }
        
        // For addresses, keep as strings (viem can handle them)
        if (inputType === 'address') {
          return arg;
        }
        
        // For other types (string, bytes, arrays), keep as is
        return arg;
      });

      console.error(`Processing call ${call.functionName} with args:`, processedArgs);
      const outputs = transactionBuilder.addCall(
        abi,
        call.target,
        call.functionName,
        processedArgs, // Use processed arguments
        call.value ? BigInt(call.value) : 0n,
      );
      console.error(`Call ${call.functionName} added successfully`);
    } catch (error) {
      throw new Error(`Error processing call ${call.functionName}: ${error.message}`);
    }
  }

  return transactionBuilder.build();
}

// Helper function to check if a type is numeric
function isNumericType(type) {
  return type.includes("uint") || type.includes("int") || type === "bool";
}

function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    process.stderr.write("Usage: node cli.js <callsJSON>\n");
    process.exit(1);
  }

  try {
    const callsJSON = args[0];
    // Parse JSON while treating all numbers as strings to preserve precision
    // This ensures very large numbers don't lose precision
    const calls = JSON.parse(callsJSON, (key, value) => {
      // Convert all numbers to strings to avoid precision loss
      if (typeof value === 'number') {
        return value.toString();
      }
      return value;
    });
    
    // Debug: log the types of the first argument in the first call
    if (calls && calls.length > 0 && calls[0].args && calls[0].args.length > 0) {
      console.error(`First arg type: ${typeof calls[0].args[0]}, value: ${calls[0].args[0]}`);
    }
    
    let result;
    try {
        result = addCallsAndBuild(calls);
    } catch (error) {
        console.error(`Error in addCallsAndBuild: ${error.message}`);
        console.error(`Stack: ${error.stack}`);
        throw error;
    }

    // Convert BigInt values to strings for JSON serialization
    const serializableResult = {
      targets: result.targets,
      offsets: result.offsets.map((offset) => offset.toString()),
      calldatas: result.calldatas,
      msgValues: result.msgValues.map((value) => value.toString()),
    };
    
    // Output the result as JSON to stdout
    console.log(JSON.stringify(serializableResult));
  } catch (error) {
    process.stderr.write(`Error: ${error.message}\n`);
    process.exit(1);
  }
}

main();
