import { TransactionBuilder } from "../index.js";
import { loadABI } from "./common.js";

function main() {
  const targetAddress = process.argv[2];
  const abiPath = process.argv[3];

  const abi = loadABI(abiPath);
  const builder = new TransactionBuilder();

  const addresses = [
    "0x000000000000000000000000000000000000cafe",
    "0x000000000000000000000000000000000000beef",
    "0x000000000000000000000000000000000000dead",
  ];

  builder.addCall(abi, targetAddress, "setAddresses", [addresses], BigInt(0));
  builder.addCall(abi, targetAddress, "getAddresses", [], BigInt(0));

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
