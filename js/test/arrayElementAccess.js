import { TransactionBuilder } from "../index.js";
import { loadABI } from "./common.js";

function main() {
  const targetAddress = process.argv[2];
  const abiPath = process.argv[3];

  const abi = loadABI(abiPath);
  const builder = new TransactionBuilder();

  const numbersArray = builder.addCall(
    abi,
    targetAddress,
    "getConstantNumbers",
    [],
    BigInt(0),
  );

  numbersArray.with_length(3);

  const sum = builder.addCall(
    abi,
    targetAddress,
    "sumTwoNumbers",
    [numbersArray[0], numbersArray[1]],
    BigInt(0),
  );

  builder.addCall(
    abi,
    targetAddress,
    "setNumbers",
    [[sum, 2, 3]],
    BigInt(0),
  );

  const addressesArray = builder.addCall(
    abi,
    targetAddress,
    "getConstantAddresses",
    [],
    BigInt(0),
  );

  addressesArray.with_length(3);

  builder.addCall(
    abi,
    targetAddress,
    "setAddresses",
    [addressesArray],
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
