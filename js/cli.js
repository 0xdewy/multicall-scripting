const { addCallsAndBuild } = require("./index.js");

function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    // Use stderr for all error messages
    process.stderr.write("Usage: node cli.js <callsJSON>\n");
    process.stderr.write(
      'Example: node cli.js \'[{"abiPath":"out/Math.sol/Math.json","target":"0x...","functionName":"add","args":[1,2]}]\'\n',
    );
    process.exit(1);
  }

  try {
    const callsJSON = args[0];
    const calls = JSON.parse(callsJSON);
    const result = addCallsAndBuild(calls);

    // Convert BigInt values to strings for JSON serialization
    const serializableResult = {
      targets: result.targets,
      offsets: result.offsets.map((offset) => offset.toString()),
      calldatas: result.calldatas,
      msgValues: result.msgValues.map((value) => value.toString()),
    };

    // ONLY output clean JSON to stdout
    console.log(JSON.stringify(serializableResult));
  } catch (error) {
    // Send ALL errors to stderr, not stdout
    process.stderr.write(`Error: ${error.message}\n`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}
