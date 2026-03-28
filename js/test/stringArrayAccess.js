const { TransactionBuilder } = require("../index.js");
const { loadABI } = require("./common.js");

function main() {
    const targetAddress = process.argv[2];
    const abiPath = process.argv[3];
    
    const abi = loadABI(abiPath);
    const builder = new TransactionBuilder();

    // Very simple test: Get constant string and use it once
    const constantString = builder.addCall(
        abi,
        targetAddress,
        "getConstantString",
        [],
        BigInt(0),
    );
    
    constantString.with_length(24);
    
    builder.addCall(
        abi,
        targetAddress,
        "concatenateStrings",
        [constantString, " - Test"],
        BigInt(0),
    );
    
    const result = builder.build();
    
    const msgValues = result.msgValues.map(v => Number(v));
    
    const serializableResult = {
        targets: result.targets,
        offsets: result.offsets.map((offset) => offset.toString()),
        calldatas: result.calldatas,
        msgValues: msgValues,
    };
    
    console.log(JSON.stringify(serializableResult));
}

main();