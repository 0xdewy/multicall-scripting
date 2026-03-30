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
    
    // Access array elements as descriptors
    const firstNumber = numbersArray[0];
    const secondNumber = numbersArray[1];
    
    // Use array elements in subsequent call
    builder.addCall(
        abi,
        targetAddress,
        "sumTwoNumbers",
        [firstNumber, secondNumber],
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
    
    const firstAddress = addressesArray[0];
    const secondAddress = addressesArray[1];
    
    builder.addCall(
        abi,
        targetAddress,
        "combineAddresses",
        [firstAddress, secondAddress],
        BigInt(0),
    );
    
    // Test 3: Chain operations - get array, update element, use updated element
    // First set some numbers
    const initialNumbers = [42, 84, 126];
    builder.addCall(
        abi,
        targetAddress,
        "setNumbers",
        [initialNumbers],
        BigInt(0),
    );
    
    // Get a specific element
    const getElementCall = builder.addCall(
        abi,
        targetAddress,
        "getNumberAt",
        [1], // Get element at index 1 (value 84)
        BigInt(0),
    );
    
    // Use the element in another operation
    // Note: getNumberAt returns a single uint256, not an array
    // So we use it directly as a descriptor
    builder.addCall(
        abi,
        targetAddress,
        "sumTwoNumbers",
        [getElementCall, 10], // 84 + 10 = 94
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