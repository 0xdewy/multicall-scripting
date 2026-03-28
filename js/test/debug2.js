const { TransactionBuilder } = require("../index.js");
const { loadABI } = require("./common.js");

function main() {
    const targetAddress = process.argv[2];
    const abiPath = process.argv[3];
    
    const abi = loadABI(abiPath);
    const builder = new TransactionBuilder();

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
    
    console.log("getElementCall type:", typeof getElementCall);
    console.log("getElementCall keys:", Object.keys(getElementCall || {}));
    if (getElementCall && typeof getElementCall === 'object') {
        console.log("getElementCall.value:", getElementCall.value);
        console.log("getElementCall.value type:", typeof getElementCall.value);
    }
    
    // Use the element in another operation
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