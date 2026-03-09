const { TransactionBuilder } = require("../index.js");
const { loadABI } = require("./common.js");
const fs = require("fs");

function main() {
  const targetAddress = process.argv[2];
  const abiPath = process.argv[3];
  
  const abi = loadABI(abiPath);
  const builder = new TransactionBuilder();

  const complexStruct = {
        a: 1,
        nested: {
            nA: 2,
            nB: 3
        }
   };
  
  // First call: setTuple(max, max, max) - state changing
  const retStruct = builder.addCall(
    abi,
    targetAddress,
    "getConstantStruct",
    [],
    BigInt(0),
  );

  builder.addCall(
    abi,
    targetAddress,
    "setComplexStruct",
    [(retStruct[0], retStruct[1], retStruct[2])],
    BigInt(0),
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
