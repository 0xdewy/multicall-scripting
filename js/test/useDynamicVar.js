import { TransactionBuilder } from "../index.js";
import { loadABI } from "./common.js";

function main() {
  const targetAddress = process.argv[2];
  const abiPath = process.argv[3];

  const abi = loadABI(abiPath);
  const builder = new TransactionBuilder();

  const retAddresses = builder.addCall(
    abi,
    targetAddress,
    "getConstantAddresses",
    [],
    BigInt(0),
  );

  retAddresses.with_length(3);

  builder.addCall(
    abi,
    targetAddress,
    "setAddresses",
    [retAddresses],
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
