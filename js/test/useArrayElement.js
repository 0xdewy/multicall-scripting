const { TransactionBuilder } = require("../index.js");
const { loadABI } = require("./common.js");
const fs = require("fs");

function main() {
    const targetAddress = process.argv[2];
    const abiPath = process.argv[3];

    const abi = loadABI(abiPath);
    const builder = new TransactionBuilder();

    // First call: setTuple(max, max, max) - state changing
    const retAddresses = builder.addCall(
        abi,
        targetAddress,
        "getConstantAddresses",
        [],
        BigInt(0),
    );

    const addresses = ["0x000000000000000000000000000000000000aaaa", retAddresses.get(1), "0x000000000000000000000000000000000000cccc"];

    builder.addCall(
        abi,
        targetAddress,
        "setAddresses",
        [addresses],
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
