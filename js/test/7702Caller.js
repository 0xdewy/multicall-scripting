const { TransactionBuilder } = require("../index.js");
const { loadABI } = require("./common.js");

function main() {
    const targetAddress = process.argv[2];
    const abiPath = process.argv[3];
    
    const abi = loadABI(abiPath);
    const builder = new TransactionBuilder();
    
    // Example: Create a batch transaction for 7702Caller
    // This would typically be signed by an authorized signer
    
    // First call: setValue(100) on some target
    builder.addCall(
        abi,
        targetAddress,
        "setValue",
        [100],
        BigInt(0),
    );
    
    // Second call: withdrawETH to some address
    const recipient = "0x0000000000000000000000000000000000000000"; // Replace with actual address
    const amount = BigInt("1000000000000000000"); // 1 ETH in wei
    
    builder.addCall(
        abi,
        targetAddress,
        "withdrawETH",
        [recipient, amount],
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

if (require.main === module) {
    main();
}

module.exports = { main };