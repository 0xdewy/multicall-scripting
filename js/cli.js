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

      // Handle all numbers as BigInt
      // Check if it's a numeric string
      if (typeof arg === "string" && /^-?\d+$/.test(arg)) {
        try {
          const bigIntValue = BigInt(arg);
          console.error(`Processing numeric string: ${arg} -> ${bigIntValue}`);
          return bigIntValue;
        } catch (e) {
          // If conversion fails, keep as string
          console.error(`Failed to convert ${arg} to BigInt: ${e.message}`);
          return arg;
        }
      }
      // Handle hex strings
      if (typeof arg === "string" && arg.startsWith("0x") && /^0x[0-9a-fA-F]+$/.test(arg)) {
        try {
          const bigIntValue = BigInt(arg);
          console.error(`Processing hex string: ${arg} -> ${bigIntValue}`);
          return bigIntValue;
        } catch (e) {
          console.error(`Failed to convert ${arg} to BigInt: ${e.message}`);
          return arg;
        }
      }
      // Handle regular numbers
      if (typeof arg === "number") {
        const bigIntValue = BigInt(Math.floor(arg));
        console.error(`Processing number: ${arg} -> ${bigIntValue}`);
        return bigIntValue;
      }
      // Handle BigInt directly
      if (typeof arg === "bigint") {
        console.error(`Processing BigInt: ${arg}`);
        return arg;
      }

      // For addresses and other strings, keep as strings
      console.error(`Processing as string: ${arg}`);
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
    console.error(`Raw JSON input: ${callsJSON}`);
    // Use a custom reviver to parse numbers as BigInt when they're very large
    const calls = JSON.parse(callsJSON, (key, value) => {
      // If the value is a number in string form, parse it as BigInt
      if (typeof value === 'string' && /^-?\d+$/.test(value)) {
        try {
          const bigIntValue = BigInt(value);
          console.error(`JSON reviver: ${key}: ${value} -> ${bigIntValue}`);
          return bigIntValue;
        } catch (e) {
          // If conversion fails, keep as string
          console.error(`JSON reviver failed for ${value}: ${e.message}`);
          return value;
        }
      }
      return value;
    });
    console.error(`Parsed calls: ${JSON.stringify(calls, null, 2)}`);
    const result = addCallsAndBuild(calls);

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
