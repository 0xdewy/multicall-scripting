import { fileURLToPath } from "url";
import { keccak256, toBytes } from "viem";
import { TransactionBuilder, STATIC_CALL_FLAG, VALUE_OFFSET } from "../index.js";

const ABIS = {
  NESTED_STRUCT: [
    {
      type: "function",
      name: "getNestedStruct",
      inputs: [],
      outputs: [
        {
          name: "",
          type: "tuple",
          components: [
            { name: "outerValue", type: "uint256" },
            {
              name: "inner",
              type: "tuple",
              components: [
                { name: "innerValue", type: "uint256" },
                { name: "innerString", type: "string" },
              ],
            },
          ],
        },
      ],
      stateMutability: "pure",
    },
  ],

  ARRAY_OF_STRUCTS: [
    {
      type: "function",
      name: "getStructArray",
      inputs: [],
      outputs: [
        {
          name: "",
          type: "tuple[]",
          components: [
            { name: "id", type: "uint256" },
            { name: "name", type: "string" },
            { name: "value", type: "uint256" },
          ],
        },
      ],
      stateMutability: "pure",
    },
  ],

  STRUCT_WITH_ARRAY: [
    {
      type: "function",
      name: "getStructWithArray",
      inputs: [],
      outputs: [
        {
          name: "",
          type: "tuple",
          components: [
            { name: "count", type: "uint256" },
            { name: "values", type: "uint256[]" },
            { name: "names", type: "string[]" },
          ],
        },
      ],
      stateMutability: "pure",
    },
  ],

  MULTIPLE_STRUCTS: [
    {
      type: "function",
      name: "getMultipleStructs",
      inputs: [],
      outputs: [
        {
          name: "first",
          type: "tuple",
          components: [
            { name: "a", type: "uint256" },
            { name: "b", type: "uint256" },
          ],
        },
        {
          name: "second",
          type: "tuple",
          components: [
            { name: "x", type: "string" },
            { name: "y", type: "uint256" },
          ],
        },
      ],
      stateMutability: "pure",
    },
  ],

  EMPTY_STRUCT: [
    {
      type: "function",
      name: "getEmptyStruct",
      inputs: [],
      outputs: [{ name: "", type: "tuple", components: [] }],
      stateMutability: "pure",
    },
  ],

  MIXED_TYPES: [
    {
      type: "function",
      name: "getMixedStruct",
      inputs: [],
      outputs: [
        {
          name: "",
          type: "tuple",
          components: [
            { name: "uintValue", type: "uint256" },
            { name: "intValue", type: "int256" },
            { name: "boolValue", type: "bool" },
            { name: "addressValue", type: "address" },
            { name: "bytesValue", type: "bytes32" },
            { name: "stringValue", type: "string" },
          ],
        },
      ],
      stateMutability: "pure",
    },
  ],
};

const MOCK_ADDRESSES = {
  NESTED_STRUCT: "0x0000000000000000000000000000000000000001",
  ARRAY_OF_STRUCTS: "0x0000000000000000000000000000000000000002",
  STRUCT_WITH_ARRAY: "0x0000000000000000000000000000000000000003",
  MULTIPLE_STRUCTS: "0x0000000000000000000000000000000000000004",
  EMPTY_STRUCT: "0x0000000000000000000000000000000000000005",
  MIXED_TYPES: "0x0000000000000000000000000000000000000006",
};

// Cases supported by the current implementation (single or last-field dynamic types only)
const SUPPORTED_CASES = {
  NESTED_STRUCT: "getNestedStruct",
  ARRAY_OF_STRUCTS: "getStructArray",
  EMPTY_STRUCT: "getEmptyStruct",
  MIXED_TYPES: "getMixedStruct",
};

// Cases that are known-unsupported: dynamic fields not in last position when flattened.
// These should fail with a descriptive error rather than silently producing wrong output.
const UNSUPPORTED_CASES = {
  STRUCT_WITH_ARRAY: {
    name: "getStructWithArray",
    expectedError: "Dynamic return type must be the last return value",
  },
  // second tuple has {x: string, y: uint256} — flattened: [..., string, uint256], string is not last
  MULTIPLE_STRUCTS: {
    name: "getMultipleStructs",
    expectedError: "Dynamic return type must be the last return value",
  },
};

function selector(abi) {
  const fn = abi[0];
  const sig = `${fn.name}(${fn.inputs.map(i => i.type).join(",")})`;
  return keccak256(toBytes(sig)).slice(0, 10);
}

export function testStructEdgeCases() {
  const results = [];
  let allPassed = true;

  // --- supported cases: must build without error and encode correctly ---
  const builder = new TransactionBuilder();
  const expectedSelectors = [];

  for (const [key, fnName] of Object.entries(SUPPORTED_CASES)) {
    const abi = ABIS[key];
    expectedSelectors.push(selector(abi));
    try {
      builder.addCall(abi, MOCK_ADDRESSES[key], fnName, []);
      results.push({ test: `${key}: addCall succeeds`, passed: true });
    } catch (e) {
      results.push({ test: `${key}: addCall succeeds`, passed: false, error: e.message });
      allPassed = false;
    }
  }

  try {
    const tx = builder.build();
    const n = Object.keys(SUPPORTED_CASES).length;

    const checks = [
      ["supported: call count", tx.targets.length === n],
      ["supported: offset count", tx.offsets.length === n],
      ["supported: msgValues empty", tx.msgValues.length === 0],
      ["supported: targets valid", tx.targets.every(t => typeof t === "string" && t.startsWith("0x") && t.length === 42)],
      // Each calldata must start with the expected 4-byte function selector
      ["supported: calldatas match selectors", tx.calldatas.every((c, i) => c.startsWith(expectedSelectors[i]))],
      // All functions are pure → top byte of every offset must be STATIC_CALL_FLAG (0xFF)
      ["supported: offsets have static calltype", tx.offsets.every(o => (o >> VALUE_OFFSET) === STATIC_CALL_FLAG)],
    ];

    for (const [name, passed] of checks) {
      results.push({ test: name, passed });
      if (!passed) allPassed = false;
    }
  } catch (e) {
    results.push({ test: "supported: build() succeeds", passed: false, error: e.message });
    allPassed = false;
  }

  // --- unsupported cases: must throw the expected error, not silently produce wrong output ---
  for (const [key, { name, expectedError }] of Object.entries(UNSUPPORTED_CASES)) {
    try {
      const b = new TransactionBuilder();
      b.addCall(ABIS[key], MOCK_ADDRESSES[key], name, []);
      results.push({ test: `${key}: rejects unsupported layout`, passed: false, error: "expected error but none thrown" });
      allPassed = false;
    } catch (e) {
      const passed = e.message.includes(expectedError);
      results.push({ test: `${key}: rejects unsupported layout`, passed, error: passed ? undefined : `wrong error: ${e.message}` });
      if (!passed) allPassed = false;
    }
  }

  return { success: allPassed, results };
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  const result = testStructEdgeCases();
  if (result.success) {
    console.log("struct edge cases: all passed");
    process.exit(0);
  } else {
    const failed = result.results?.filter(r => !r.passed);
    console.error("struct edge cases: failed", failed);
    process.exit(1);
  }
}
