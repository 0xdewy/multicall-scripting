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

function main() {
  const [callsJSON] = process.argv.slice(2);

  if (!callsJSON) {
    process.stderr.write("Usage: node cli.js <callsJSON>\n");
    process.stderr.write(
      'Example: node cli.js \'[{"abiPath":"out/Math.sol/Math.json","target":"0x...","functionName":"add","args":[1,2]}]\'\n',
    );
    process.exit(1);
  }

  try {
    const result = addCallsAndBuild(JSON.parse(callsJSON));
    const serializable = {
      targets: result.targets,
      offsets: result.offsets.map((o) => o.toString()),
      calldatas: result.calldatas,
      msgValues: result.msgValues.map((v) => v.toString()),
    };
    console.log(JSON.stringify(serializable));
  } catch (error) {
    process.stderr.write(`Error: ${error.message}\n`);
    process.exit(1);
  }
}

main();
