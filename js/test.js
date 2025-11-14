const { encodeFunctionData, getAbiItem } = require("viem");
const { TransactionBuilder } = require("./index.js");

async function twoVariableReturn() {
  const testAbi = [
    {
      name: "getTuple",
      type: "function",
      inputs: [],
      outputs: [
        { name: "a", type: "uint256" },
        { name: "b", type: "uint256" },
        { name: "c", type: "uint256" }
      ],
      stateMutability: "view",
    },
    {
      name: "useTwoVariables",
      type: "function",
      inputs: [
        { name: "first", type: "uint256" },
        { name: "second", type: "uint256" }
      ],
      outputs: [{ name: "result", type: "uint256" }],
      stateMutability: "nonpayable",
    }
  ];

  const testAddress = "0x1234567890123456789012345678901234567890";

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
  // We need to reference them using their offsets in the return data
  const useTwoVariablesCall = builder.addCall(
    testAbi,
    testAddress,
    "useTwoVariables",
    [
      { callIndex: 0, offset: 0, size: 32 },    // First element 'a' at offset 0
      { callIndex: 0, offset: 64, size: 32 }    // Third element 'c' at offset 64
    ],
    BigInt(0),
  );

  console.log('Use two variables call outputs:', useTwoVariablesCall);

  const result = builder.build();
  console.log('Built transaction:', result);
}

async function erc20Test() {
  // Sample ERC20 ABI
  const erc20Abi = [
    {
      name: "transfer",
      type: "function",
      inputs: [
        { name: "to", type: "address" },
        { name: "value", type: "uint256" },
      ],
      outputs: [{ name: "success", type: "bool" }],
      stateMutability: "nonpayable",
    },
    {
      name: "balanceOf",
      type: "function",
      inputs: [{ name: "account", type: "address" }],
      outputs: [{ name: "balance", type: "uint256" }],
      stateMutability: "view",
    },
  ];


  const erc20Address = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
  const recipientAddress = "0x1234567890123456789012345678901234567890";

  const builder = new TransactionBuilder();
  // Add balanceOf call, using the recipient address from the transfer call
  const balanceCallResult = builder.addCall(
    erc20Abi,
    erc20Address,
    "balanceOf",
    [recipientAddress], // Use the recipient address directly
    BigInt(0),
  );

  console.log(balanceCallResult);

  const transferCall = builder.addCall(
    erc20Abi,
    erc20Address,
    "transfer",
    [recipientAddress, balanceCallResult[0]],
    BigInt(0),
  );

  //console.log('BalanceOf Call Output:', balanceCall);
  //console.log('Transfer Call Output:', transferCall);
  //console.log('Current Calls:', builder.calls);

  const result = builder.build();
  console.log(result);
}

async function main() {
  console.log('Running twoVariableReturn test...');
  await twoVariableReturn();
  console.log('\nRunning erc20Test...');
  await erc20Test();
}

main().catch(console.error);
