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
    
    // Bytes need with_length() to specify expected length
    constantBytes.with_length(16); // hex"deadbeefcafebabe1234567890abcdef" is 16 bytes
    
    // Use the bytes in concatenation
    const additionalBytes = "0xffeeddcc";
    builder.addCall(
        abi,
        targetAddress,
        "concatenateBytes",
        [constantBytes, additionalBytes],
        BigInt(0),
    );
    
    // Test 2: Set bytes, then get and use them
    const testBytes = "0x0102030405060708090a0b0c0d0e0f10";
    builder.addCall(
        abi,
        targetAddress,
        "setDynamicBytes",
        [testBytes],
        BigInt(0),
    );
    
    const getBytesCall = builder.addCall(
        abi,
        targetAddress,
        "getDynamicBytes",
        [],
        BigInt(0),
    );
    
    getBytesCall.with_length(16); // 16 bytes
    
    // Use the retrieved bytes
    builder.addCall(
        abi,
        targetAddress,
        "concatenateBytes",
        [getBytesCall, "0x11223344"],
        BigInt(0),
    );
    
    // Test 3: Get bytes length
    const lengthCall = builder.addCall(
        abi,
        targetAddress,
        "getBytesLength",
        [],
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