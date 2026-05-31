import { fileURLToPath } from "url";
import { TransactionBuilder } from "../index.js";
import { loadABI } from "./common.js";

function main() {
  const targetAddress = process.argv[2];
  const abiPath = process.argv[3];

  const abi = loadABI(abiPath);
  const builder = new TransactionBuilder();

  builder.addCall(abi, targetAddress, "setValue", [100], BigInt(0));

  const recipient = "0x0000000000000000000000000000000000000000";
  const amount = BigInt("1000000000000000000");

  builder.addCall(
    abi,
    targetAddress,
    "withdrawETH",
    [recipient, amount],
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

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) main();

export { main };
