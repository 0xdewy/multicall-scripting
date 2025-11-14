const { TransactionBuilder } = require("../index.js");
const fs = require("fs");


function loadABI(path) {
  let content;
  try {
    content = fs.readFileSync(path, "utf8");
  } catch {
    content = fs.readFileSync(`../out/${path}`, "utf8");
  }
  const artifact = JSON.parse(content);
  return Array.isArray(artifact) ? artifact : artifact.abi;
}

function main() {
  const targetAddress = process.argv[2];
  const abiPath = process.argv[3];
  
  const abi = loadABI(abiPath);
  const builder = new TransactionBuilder();
  
  // First call: setTuple(max, max, max) - state changing
  builder.addCall(
    abi,
    targetAddress,
    "setTuple",
    [
      "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
      "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
      "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"
    ],
    BigInt(0),
  );

  // Second call: getTupleConstant() - static call with partial return
  // This needs to use the appropriate offset which matches staticCallPartialReturn
  // For now, we'll add it as a regular static call
  builder.addCall(
    abi,
    targetAddress,
    "getTupleConstant",
    [],
    BigInt(0),
  );

  // Third call: setTuple using first and third elements from the previous static call result
  builder.addCall(
    abi,
    targetAddress,
    "setTuple",
    [
      { callIndex: 1, offset: 0, size: 32 },  // First element (1)
      "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff", // max uint
      { callIndex: 1, offset: 64, size: 32 }  // Third element (3)
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
  return serializableResult;
}

main();

