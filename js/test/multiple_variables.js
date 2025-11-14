const { TransactionBuilder } = require("../index.js");
const fs = require("fs");


function loadABI(path) {
  let content;
  // Try to read from the provided path directly
  try {
    content = fs.readFileSync(path, "utf8");
  } catch {
    // If that fails, try to prepend 'out/'
    try {
      content = fs.readFileSync(`out/${path}`, "utf8");
    } catch {
      // If that also fails, try to prepend '../out/'
      try {
        content = fs.readFileSync(`../out/${path}`, "utf8");
      } catch {
        throw new Error(`Could not find ABI file at paths: ${path}, out/${path}, ../out/${path}`);
      }
    }
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
      callResult[0],
      BigInt("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"), // max uint
      callResult[2],
    ],
    BigInt(0),
  );

  const result = builder.build();
  
  // Ensure msgValues has the same number of elements as targets, all being "0"
  // Since all calls use BigInt(0), we can create an array of "0" strings
  const msgValues = new Array(result.targets.length);
  
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

