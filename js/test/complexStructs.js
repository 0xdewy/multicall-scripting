import { TransactionBuilder } from "../index.js";
import { loadABI } from "./common.js";

function main() {
  const targetAddress = process.argv[2];
  const abiPath = process.argv[3];

  const abi = loadABI(abiPath);
  const builder = new TransactionBuilder();

  const complexStruct = {
    a: 1,
    nested: {
      nA: 2,
      nB: 3,
    },
  };

  const retStruct = builder.addCall(
    abi,
    targetAddress,
    "getConstantStruct",
    [],
    BigInt(0),
  );

  complexStruct.nested.nB = retStruct.nested.nB;

  builder.addCall(
    abi,
    targetAddress,
    "setComplexStruct",
    [complexStruct],
    BigInt(0),
  );

  const result = builder.build();

  const serializableResult = {
    targets: result.targets,
    offsets: result.offsets.map((offset) => offset.toString()),
    calldatas: result.calldatas,
    msgValues: result.msgValues.map(v => Number(v)),
  };

  console.log(JSON.stringify(serializableResult));
}

main();
