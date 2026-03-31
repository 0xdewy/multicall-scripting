const { TransactionBuilder } = require("../index.js");
const { loadABI } = require("./common.js");

function main() {
    const targetAddress = process.argv[2];
    const abiPath = process.argv[3];
    
    const abi = loadABI(abiPath);
    const builder = new TransactionBuilder();

    // Test 1: Get number array, access elements, use them in sumTwoNumbers
    const numbersArray = builder.addCall(
        abi,
        targetAddress,
        "getConstantNumbers",
        [],
        BigInt(0),
    );
    
    // Set array length
    numbersArray.with_length(3);
    
    // Use array elements in subsequent call
    const sum = builder.addCall(
        abi,
        targetAddress,
        "sumTwoNumbers",
        [numbersArray[0], numbersArray[1]],
        BigInt(0),
    );

    builder.addCall(
        abi,
        targetAddress,
        "setNumbers",
        [[sum, 2, 3]],
        BigInt(0),
    );
    
    // Test 2: Get address array, access elements
    const addressesArray = builder.addCall(
        abi,
        targetAddress,
        "getConstantAddresses",
        [],
        BigInt(0),
    );
    
    addressesArray.with_length(3);
    
    builder.addCall(
        abi,
        targetAddress,
        "setAddresses",
        [addressesArray],
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
