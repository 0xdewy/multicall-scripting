const { TransactionBuilder } = require("../index.js");
const { loadABI } = require("./common.js");

function main() {
    const targetAddress = process.argv[2];
    const abiPath = process.argv[3];
    
    const abi = loadABI(abiPath);
    const builder = new TransactionBuilder();

    // Test 1: Get constant bytes, use it in concatenation
    const constantBytes = builder.addCall(
        abi,
        targetAddress,
        "getConstantBytes",
        [],
        BigInt(0),
    );
    
    constantBytes.with_length(16); // 16 bytes
    
    // Use the retrieved bytes
    const concenatedBytes = builder.addCall(
        abi,
        targetAddress,
        "concatenateBytes",
        [constantBytes, "0x11223344"],
        BigInt(0),
    );

    concenatedBytes.with_length(20);
    

    // Use the retrieved bytes
    builder.addCall(
        abi,
        targetAddress,
        "setDynamicBytes",
        [concenatedBytes],
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
