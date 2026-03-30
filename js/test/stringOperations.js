const { TransactionBuilder } = require("../index.js");
const { loadABI } = require("./common.js");

function main() {
    const targetAddress = process.argv[2];
    const abiPath = process.argv[3];
    
    const abi = loadABI(abiPath);
    const builder = new TransactionBuilder();

    // Test 1: Get constant string, use it in concatenation
    const constantString = builder.addCall(
        abi,
        targetAddress,
        "getConstantString",
        [],
        BigInt(0),
    );
    
    // Strings need with_length() to specify expected length
    constantString.with_length(24); // "Hello, Multicall Scripting!" is 24 chars
    
    // Use the string in concatenation
    builder.addCall(
        abi,
        targetAddress,
        "concatenateStrings",
        [constantString, " - Test"],
        BigInt(0),
    );
    
    // Test 2: Set a string, then get and use it
    builder.addCall(
        abi,
        targetAddress,
        "setText",
        ["Initial String"],
        BigInt(0),
    );
    
    const getStringCall = builder.addCall(
        abi,
        targetAddress,
        "getText",
        [],
        BigInt(0),
    );
    
    getStringCall.with_length(14); // "Initial String" is 14 chars
    
    // Use the retrieved string
    builder.addCall(
        abi,
        targetAddress,
        "concatenateStrings",
        [getStringCall, " - Modified"],
        BigInt(0),
    );
    
    // Test 3: Get string length
    const lengthCall = builder.addCall(
        abi,
        targetAddress,
        "getTextLength",
        [],
        BigInt(0),
    );
    
    // Note: getTextLength returns uint256, not a string
    // We could use it in other operations if needed
    
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