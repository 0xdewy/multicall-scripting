// FFI script for test/JsLibrary.t.sol:test_js_layouts. Builds one batch that exercises every
// calldata/return-data layout the builder positions: descriptors inside struct and array arguments,
// static tuple parameters before a descriptor, dynamic tuple outputs, dynamic arrays as a
// non-first output, arrays of structs, and non-ASCII string literals next to a dynamic descriptor.
import { TransactionBuilder } from "../index.js";
import { loadABI } from "./common.js";

const target = process.argv[2];
const abi = loadABI(process.argv[3]);
const b = new TransactionBuilder();

// 1. dynamic tuple output: item.id sits behind the outer pointer word; item.name is its tail
const item = b.addCall(abi, target, "getItem", []);
item.name.with_length(5);

// 2. descriptor inside a struct argument, static tuple before a scalar descriptor
//    setStaticThenWord({nA: 100, nB: item.id}, word) -> x = 107, y = 0xC0FFEE
const word = b.addCall(abi, target, "getWord", []);
b.addCall(abi, target, "setStaticThenWord", [{ nA: 100n, nB: item.id }, word]);

// 3. dynamic array as second output; element access; descriptor inside an array argument
//    setNums(count, [nums[2], 5, nums[0]]) -> x = 3, nums = [30, 5, 10]
const [count, nums] = b.addCall(abi, target, "getCountAndNums", []);
nums.with_length(3);
b.addCall(abi, target, "setNums", [count, [nums[2], 5n, nums[0]]]);

// 4. array of structs: element field access, and a descriptor inside a struct inside an array arg
//    setPairs([{nA: pairs[1].nB, nB: 9}, {nA: 8, nB: pairs[0].nA}]) -> [(4, 9), (8, 1)]
const pairs = b.addCall(abi, target, "getPairs", []);
pairs.with_length(2);
b.addCall(abi, target, "setPairs", [[{ nA: pairs[1].nB, nB: 9n }, { nA: 8n, nB: pairs[0].nA }]]);

// 5. non-ASCII literal before a dynamic descriptor: setTexts("héllo ✓", item.name) -> text2 = "seven"
b.addCall(abi, target, "setTexts", ["héllo ✓", item.name]);

// 6. Reuse one return value twice in a single consumer and once in a later consumer.
const repeated = b.addCall(abi, target, "getWord", []);
b.addCall(abi, target, "setStaticThenWord", [{ nA: repeated, nB: repeated }, repeated]);

const out = b.build();
console.log(JSON.stringify({
    targets: out.targets,
    offsets: out.offsets.map((o) => o.toString()),
    calldatas: out.calldatas,
    msgValues: out.msgValues.map((v) => v.toString()),
}));
