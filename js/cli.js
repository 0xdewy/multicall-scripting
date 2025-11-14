const { TransactionBuilder } = require("./index.js");
const fs = require("fs");

function loadABI(path) {
  let content;
  try {
    content = fs.readFileSync(path, "utf8");
  } catch {
    content = fs.readFileSync(`./${path}`, "utf8");
  }
  const artifact = JSON.parse(content);
  return Array.isArray(artifact) ? artifact : artifact.abi;
}

module.exports.addCallsAndBuild = function addCallsAndBuild(calls) {
  const transactionBuilder = new TransactionBuilder();
  for (const call of calls) {
    try {
      const abi = loadABI(call.abiPath);
      const functionAbi = abi.find(
        (item) => item.type === "function" && item.name === call.functionName,
      );
      if (!functionAbi) {
        throw new Error(`Function ${call.functionName} not found in ABI`);
      }
      const processedArgs = call.args.map((arg, index) => {
        // Check if this is a partial return reference object
        if (arg && typeof arg === "object" && "callIndex" in arg && "offset" in arg && "size" in arg) {
          // Ensure all required fields are present and are numbers
          if (typeof arg.callIndex !== 'number' || typeof arg.offset !== 'number' || typeof arg.size !== 'number') {
            throw new Error(`Invalid partial return reference object at index ${index}`);
          }
          // Return only the essential fields
          return {
            callIndex: arg.callIndex,
            offset: arg.offset,
            size: arg.size
          };
        }
        const inputType = functionAbi.inputs[index].type;
        if (inputType.includes("int") &&
            typeof arg === "string" && (arg.startsWith("0x") || /^-?\d+$/.test(arg))) {
          try {
            return BigInt(arg);
          } catch {
            throw new Error(`Failed to parse "${arg}" to BigInt`);
          }
        }
        return arg;
      });
      transactionBuilder.addCall(
        abi,
        call.target,
        call.functionName,
        processedArgs,
        call.value ? BigInt(call.value) : 0n,
      );
    } catch (error) {
      throw new Error(`Error processing call ${call.functionName}: ${error.message}`);
    }
  }
  return transactionBuilder.build();
};

function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    process.stderr.write("Usage: node cli.js <callsJSON>\n");
    process.exit(1);
  }
  try {
    const calls = JSON.parse(args[0], (key, value) => typeof value === "number" ? value.toString() : value);
    const result = module.exports.addCallsAndBuild(calls);
    const serializableResult = {
      targets: result.targets,
      offsets: result.offsets.map((offset) => offset.toString()),
      calldatas: result.calldatas,
      msgValues: result.msgValues.map((value) => value.toString()),
    };
    console.log(JSON.stringify(serializableResult));
  } catch (error) {
    process.stderr.write(`Error: ${error.message}\n`);
    process.exit(1);
  }
}

main();
