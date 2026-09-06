import { fileURLToPath } from "url";
import { TransactionBuilder, Descriptor } from "./index.js";
import { loadABI } from "./abi.js";

export function addCallsAndBuild(calls) {
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
        // a reference to an earlier call's return data: { callIndex, offset, size }
        if (arg && typeof arg === "object" && !Array.isArray(arg) && "callIndex" in arg) {
          const [callIndex, offset, size] = [arg.callIndex, arg.offset, arg.size].map(Number);
          if (![callIndex, offset, size].every(Number.isInteger)) {
            throw new Error(`Invalid partial return reference object at index ${index}`);
          }
          return new Descriptor({ callIndex, offset, size, type: "ref", isDynamic: false, requiresLength: false, unsupported: null });
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
        call.value == null ? 0n : call.value,
      );
    } catch (error) {
      throw new Error(`Error processing call ${call.functionName}: ${error.message}`, { cause: error });
    }
  }
  return transactionBuilder.build();
}

function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    process.stderr.write("Usage: node cli.js <callsJSON>\n");
    process.exit(1);
  }
  try {
    const calls = JSON.parse(args[0], (_key, value) => {
      if (typeof value !== "number") return value;
      if (!Number.isSafeInteger(value)) throw new Error("JSON numbers must be safe integers; quote large integers");
      return value.toString();
    });
    const result = addCallsAndBuild(calls);
    const serializableResult = {
      targets: result.targets,
      offsets: result.offsets.map((offset) => offset.toString()),
      calldatas: result.calldatas,
      msgValues: result.msgValues.map((value) => value.toString()),
    };
    console.log(JSON.stringify(serializableResult));
  } catch (error) {
    process.stderr.write(`Error: ${error.message}\n`);
    if (error.cause) process.stderr.write(`Caused by: ${error.cause.message}\n`);
    process.exit(1);
  }
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) main();
