// FFI script for test/JsLibrary.t.sol:test_js_readonly. A pure read chain whose intermediate
// values are all visible in MulticallScripterReadOnly's return: numbers = [100,200,300];
// a = numbers[0] + numbers[1]; b = a + numbers[2]  (numbers[2] is consumed two calls later).
import { TransactionBuilder } from "../index.js";
import { loadABI } from "./common.js";

const target = process.argv[2];
const abi = loadABI(process.argv[3]);
const b = new TransactionBuilder();

const numbers = b.addCall(abi, target, "getConstantNumbers", []);
numbers.with_length(3);
const a = b.addCall(abi, target, "sumTwoNumbers", [numbers[0], numbers[1]]);
b.addCall(abi, target, "sumTwoNumbers", [a, numbers[2]]);

const out = b.build();
console.log(JSON.stringify({
    targets: out.targets,
    offsets: out.offsets.map((o) => o.toString()),
    calldatas: out.calldatas,
    msgValues: out.msgValues.map((v) => v.toString()),
}));
