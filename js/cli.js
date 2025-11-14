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

      // For very large numbers (like type(uint256).max), keep them as strings
      // viem's encodeFunctionData can handle numeric strings directly
      if (typeof arg === "string" && /^-?\d+$/.test(arg) && arg.length > 15) {
        // Keep very large numbers as strings to avoid BigInt parsing issues
        return arg;
      }
      // Handle regular numbers
      if (typeof arg === "number") {
        return BigInt(arg);
      }
      // Handle smaller numeric strings
      if (typeof arg === "string" && /^-?\d+$/.test(arg)) {
        try {
          return BigInt(arg);
        } catch (e) {
          return arg;
        }
      }
      // Handle hex strings
      if (typeof arg === "string" && arg.startsWith("0x") && /^0x[0-9a-fA-F]+$/.test(arg)) {
        try {
          return BigInt(arg);
        } catch (e) {
          return arg;
        }
      }
      // Handle BigInt directly
      if (typeof arg === "bigint") {
        return arg;
      }

      // For addresses and other strings, keep as strings
      return arg;
    });


    transactionBuilder.addCall(
      abi,
      call.target,
      call.functionName,
      processedArgs, // Use processed arguments
      call.value ? BigInt(call.value) : 0n,
    );
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
    
    const result = addCallsAndBuild(calls);

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
