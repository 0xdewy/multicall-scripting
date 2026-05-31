import { TransactionBuilder } from "../index.js";
import { loadABI } from "./common.js";

function main() {
  const targetAddress = process.argv[2];
  const abiPath = process.argv[3];

  const abi = loadABI(abiPath);
  const builder = new TransactionBuilder();

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

  const callResult = builder.addCall(
    abi,
    targetAddress,
    "getTupleConstant",
    [],
    BigInt(0),
  );

  builder.addCall(
    abi,
    targetAddress,
    "setTuple",
    [
      callResult.a,
      BigInt("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"),
      callResult.c,
    ],
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
