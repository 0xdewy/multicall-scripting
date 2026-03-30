const { TransactionBuilder } = require("../index.js");
const { loadABI } = require("./common.js");

function main() {
  const targetAddress = process.argv[2];
  const abiPath = process.argv[3];
  
  const abi = loadABI(abiPath);
  const builder = new TransactionBuilder();
  
  // Simple test: Create a dynamic array and pass it to setAddresses
  // This tests that we can work with dynamic arrays in the TransactionBuilder
  const addresses = [
    "0x000000000000000000000000000000000000cafe",
    "0x000000000000000000000000000000000000beef",
    "0x000000000000000000000000000000000000dead"
  ];

  builder.addCall(
    abi,
    targetAddress,
    "setAddresses",
    [addresses],
    BigInt(0)
  );

  // Get the addresses back to verify
  builder.addCall(
    abi,
    targetAddress,
    "getAddresses",
    [],
    BigInt(0)
  );

  const result = builder.build();
  
  // Convert BigInts: msgValues to numbers, offsets to strings (to preserve precision)
  const msgValues = result.msgValues.map(v => Number(v));
  
  // Serialize the result for comparison
  const serializableResult = {
    targets: result.targets,
    offsets: result.offsets.map((offset) => offset.toString()),
    calldatas: result.calldatas,
    msgValues: msgValues,
  };
  
  // Only print the JSON to stdout
  console.log(JSON.stringify(serializableResult));
}

main();