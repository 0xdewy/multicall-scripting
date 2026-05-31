import { TransactionBuilder } from "../index.js";
import { loadABI } from "./common.js";

function main() {
  const targetAddress = process.argv[2];
  const abiPath = process.argv[3];

  const abi = loadABI(abiPath);
  const builder = new TransactionBuilder();

  const constantBytes = builder.addCall(
    abi,
    targetAddress,
    "getConstantBytes",
    [],
    BigInt(0),
  );

  constantBytes.with_length(16);

  const concatenatedBytes = builder.addCall(
    abi,
    targetAddress,
    "concatenateBytes",
    [constantBytes, "0x11223344"],
    BigInt(0),
  );

  concatenatedBytes.with_length(20);

  builder.addCall(
    abi,
    targetAddress,
    "setDynamicBytes",
    [concatenatedBytes],
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
