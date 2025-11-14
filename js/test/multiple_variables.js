const { encodeFunctionData, getAbiItem } = require("viem");
const { TransactionBuilder } = require("./index.js");


  // TODO: parse args 
  //  args: [abi_path, targetAddress]

  const builder = new TransactionBuilder();
  
  // First call: get tuple which returns (a, b, c)
  const tupleResult = builder.addCall(
    testAbi,
    testAddress,
    "getTuple",
    [],
    BigInt(0),
  );

  console.log('Tuple result outputs:', tupleResult);

  // Second call: use the first and third elements of the tuple (a and c)
  // Use the output objects directly
  const useTwoVariablesCall = builder.addCall(
    testAbi,
    testAddress,
    "useTwoVariables",
    [
      tupleResult[0],  // First element 'a' (from index 0)
      tupleResult[2]   // Third element 'c' (from index 2)
    ],
    BigInt(0),
  );

  console.log('Use two variables call outputs:', useTwoVariablesCall);

  const result = builder.build();
  console.log('Built transaction:', result);
}

