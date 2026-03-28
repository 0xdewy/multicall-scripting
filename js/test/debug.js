const { TransactionBuilder } = require("../index.js");
const { loadABI } = require("./common.js");

function main() {
    const targetAddress = process.argv[2];
    const abiPath = process.argv[3];
    
    const abi = loadABI(abiPath);
    const builder = new TransactionBuilder();

    // Simple test: just sum two numbers
    builder.addCall(
        abi,
        targetAddress,
        "sumTwoNumbers",
        [42, 10],
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