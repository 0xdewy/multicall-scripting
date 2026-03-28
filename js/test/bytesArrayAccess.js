const { TransactionBuilder } = require("../index.js");
const { loadABI } = require("./common.js");

function main() {
    const targetAddress = process.argv[2];
    const abiPath = process.argv[3];
    
    const abi = loadABI(abiPath);
    const builder = new TransactionBuilder();

    // Very simple test: Get constant bytes and use it once
    const constantBytes = builder.addCall(
        abi,
        targetAddress,
        "getConstantBytes",
        [],
        BigInt(0),
    );
    
    constantBytes.with_length(16);
    
    builder.addCall(
        abi,
        targetAddress,
        "concatenateBytes",
        [constantBytes, "0x12345678"],
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