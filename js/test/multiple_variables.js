const { TransactionBuilder } = require("../index.js");
const { loadABI } = require("./common.js");
const fs = require("fs");

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
      BigInt("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"),
      BigInt("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"),
      BigInt("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff")
    ],
    BigInt(0),
  );

  // Second call: getTupleConstant() - static call with partial return
  // This needs to use the appropriate offset which matches staticCallPartialReturn
  // For now, we'll add it as a regular static call
  const callResult = builder.addCall(
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
      callResult.a,
      BigInt("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"), // max uint
      callResult.c,
    ],
    BigInt(0),
  );

  const result = builder.build();
  
  // Convert msgValues from BigInt to numbers for JSON serialization
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

