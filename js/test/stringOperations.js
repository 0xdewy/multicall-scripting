const { TransactionBuilder } = require("../index.js");
const { loadABI } = require("./common.js");

function main() {
    const targetAddress = process.argv[2];
    const abiPath = process.argv[3];
    
    const abi = loadABI(abiPath);
    const builder = new TransactionBuilder();

    // Test 1: Get constant string and use it in concatenation
    const constantString = builder.addCall(
        abi,
        targetAddress,
        "getConstantString",
        [],
        BigInt(0),
    );
    
    // Strings need with_length() to specify expected length
    constantString.with_length(24); // "Hello, Multicall Scripting!" is 24 chars
    builder.addCall(
        abi,
        targetAddress,
        "setText",
        [constantString],
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
