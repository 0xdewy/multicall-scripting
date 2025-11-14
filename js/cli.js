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

      // Handle numbers - always convert to BigInt
      if (typeof arg === "number") {
        // For numbers, convert to BigInt directly
        return BigInt(arg);
      }
      // Handle numeric strings
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
    // Parse JSON while preserving large numbers as strings
    const calls = JSON.parse(callsJSON, (key, value) => {
      // Keep numbers as numbers for small values, convert large numbers to strings
      if (typeof value === 'number') {
        // If it's a very large number (detected by scientific notation in string representation)
        if (Math.abs(value) >= 1e15 || !Number.isSafeInteger(value)) {
          // Convert to string to preserve precision
          return value.toString();
        }
        return value;
      }
      return value;
    });
    
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
