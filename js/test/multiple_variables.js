const { TransactionBuilder } = require("../index.js");
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

function main() {
  const targetAddress = process.argv[2];
  const abiPath = process.argv[3];
  
  const abi = loadABI(abiPath);
  const builder = new TransactionBuilder();
  
  // First call: getTupleConstant() returns (1, 2, 3)
  const tupleResult = builder.addCall(
    abi,
    targetAddress,
    "getTupleConstant",
    [],
    BigInt(0),
  );

  // Second call: setTuple using first and third elements from the tuple
  const setTupleCall = builder.addCall(
    abi,
    targetAddress,
    "setTuple",
    [
      { callIndex: 0, offset: 0, size: 32 },  // First element (1)
      "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff", // max uint
      { callIndex: 0, offset: 64, size: 32 }  // Third element (3)
    ],
    BigInt(0),
  );

  const result = builder.build();
  
  // Serialize the result for comparison
  const serializableResult = {
    targets: result.targets,
    offsets: result.offsets.map((offset) => offset.toString()),
    calldatas: result.calldatas,
    msgValues: result.msgValues.map((value) => value.toString()),
  };
  console.log(JSON.stringify(serializableResult));
  return serializeableResult;
}

main();

