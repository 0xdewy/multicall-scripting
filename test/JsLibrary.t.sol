// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.28;

import {Test, console} from "forge-std/Test.sol";
import "forge-std/StdJson.sol";
import {CallBuilder, CallDecoder} from "./CallBuilder.sol";
import {MulticallScripter} from "src/MulticallScripter.sol";
import {MulticallScripterReadOnly} from "src/MulticallScripterReadOnly.sol";
import {
    Math,
    SimpleReturn,
    DynamicReturn,
    Fuzzy,
    Structs,
    DynamicVar,
    ArrayElementAccess,
    StringAndBytesOperations,
    Layouts
} from "./Helpers.sol";

contract JsLibrary is Test, CallBuilder {
    MulticallScripter multicall;
    CallDecoder callDecoder;

    SimpleReturn simpleReturn;
    DynamicReturn dynamicReturn;
    Math math;
    Fuzzy fuzzy;
    Structs structs;
    DynamicVar dynamicVar;
    ArrayElementAccess arrayElementAccess;
    StringAndBytesOperations stringAndBytesOps;
    Layouts layouts;

    address[] targets;
    uint256[] offsets;
    bytes[] calldatas;
    uint256[] values;

    // partial return types
    uint256[] memTargets;
    uint256[] resultLengths;
    uint256[] returnOffsets;

    function setUp() public {
        multicall = new MulticallScripter();
        simpleReturn = new SimpleReturn();
        dynamicReturn = new DynamicReturn();
        callDecoder = new CallDecoder();
        math = new Math();
        fuzzy = new Fuzzy();
        structs = new Structs();
        dynamicVar = new DynamicVar();
        arrayElementAccess = new ArrayElementAccess();
        stringAndBytesOps = new StringAndBytesOperations();
        layouts = new Layouts();
    }

    function _runJs(string memory script, address target, string memory abiPath) internal {
        string[] memory inputs = new string[](4);
        inputs[0] = "bun";
        inputs[1] = script;
        inputs[2] = vm.toString(target);
        inputs[3] = abiPath;
        string memory json = string(vm.ffi(inputs));
        multicall.execute(
            vm.parseJsonAddressArray(json, ".targets"),
            vm.parseJsonUintArray(json, ".offsets"),
            vm.parseJsonBytes(json, ".calldatas"),
            vm.parseJsonUintArray(json, ".msgValues")
        );
    }

    // the same JS-built batch runs through the read-only executor and returns every result
    function test_js_readonly() public {
        MulticallScripterReadOnly reader = new MulticallScripterReadOnly();
        string[] memory inputs = new string[](4);
        inputs[0] = "bun";
        inputs[1] = "js/test/readonly.js";
        inputs[2] = vm.toString(address(arrayElementAccess));
        inputs[3] = "out/Helpers.sol/ArrayElementAccess.json";
        string memory json = string(vm.ffi(inputs));

        bytes[] memory results = reader.execute(
            vm.parseJsonAddressArray(json, ".targets"),
            vm.parseJsonUintArray(json, ".offsets"),
            vm.parseJsonBytes(json, ".calldatas"),
            vm.parseJsonUintArray(json, ".msgValues")
        );

        assertEq(results.length, 3);
        uint256[] memory numbers = abi.decode(results[0], (uint256[]));
        assertEq(numbers[2], 300);
        assertEq(abi.decode(results[1], (uint256)), 300, "numbers[0] + numbers[1]");
        assertEq(abi.decode(results[2], (uint256)), 600, "a + numbers[2], consumed two calls later");
    }

    // one batch covering every calldata / return-data layout the builder positions (see layouts.js)
    function test_js_layouts() public {
        _runJs("js/test/layouts.js", address(layouts), "out/Helpers.sol/Layouts.json");

        // setStaticThenWord({100, item.id = 7}, getWord() = 0xC0FFEE) then setNums(count = 3, ...)
        assertEq(layouts.x(), 2 * 0xC0FFEE, "one descriptor feeds both tuple fields");
        assertEq(layouts.y(), 0xC0FFEE, "word spliced after a static tuple parameter");
        assertEq(layouts.numsLength(), 3);
        assertEq(layouts.nums(0), 30, "nums[2] spliced into array element 0");
        assertEq(layouts.nums(1), 5);
        assertEq(layouts.nums(2), 10, "nums[0] spliced into array element 2");
        assertEq(layouts.pairsLength(), 2);
        (uint256 a0, uint256 b0) = layouts.pairs(0);
        (uint256 a1, uint256 b1) = layouts.pairs(1);
        assertEq(a0, 4, "pairs[1].nB spliced into a struct inside an array");
        assertEq(b0, 9);
        assertEq(a1, 8);
        assertEq(b1, 1, "pairs[0].nA spliced into a struct inside an array");
        assertEq(layouts.text(), unicode"héllo ✓");
        assertEq(layouts.text2(), "seven", "dynamic tuple field spliced after a non-ASCII literal");
    }

    function test_js_complex_structs() public {
        // Call the JavaScript file using FFI
        string[] memory inputs = new string[](4);
        inputs[0] = "bun";
        inputs[1] = "js/test/complexStructs.js";
        inputs[2] = vm.toString(address(structs));
        // Get the path to the ABI - it's in the out directory
        inputs[3] = "out/Helpers.sol/Structs.json";

        bytes memory res = vm.ffi(inputs);
        string memory json = string(res);

        // Parse the JSON result
        bytes memory jsTargets = vm.parseJson(json, ".targets");
        address[] memory jsTargetsArray = abi.decode(jsTargets, (address[]));
        bytes memory jsOffsets = vm.parseJson(json, ".offsets");
        uint256[] memory jsOffsetsArray = abi.decode(jsOffsets, (uint256[]));
        bytes memory jsCalldatas = vm.parseJson(json, ".calldatas");
        bytes memory jsCalldatasArray = abi.decode(jsCalldatas, (bytes));
        bytes memory jsMsgValues = vm.parseJson(json, ".msgValues");
        uint256[] memory jsMsgValuesArray = abi.decode(jsMsgValues, (uint256[]));

        // Verify we have the expected number of calls
        // The JavaScript test makes:
        // 1. getConstantStruct()
        // 2. setComplexStruct() with modified struct
        // Total: 2 calls
        assertEq(jsTargetsArray.length, 2, "Should have 2 calls");
        assertEq(jsOffsetsArray.length, 2, "Should have 2 offsets");
        assertEq(jsMsgValuesArray.length, 0, "Should have 0 msgValues");

        multicall.execute(jsTargetsArray, jsOffsetsArray, jsCalldatasArray, jsMsgValuesArray);

        // setComplexStruct({a: 1, nested: {nA: 2, nB: getConstantStruct().nested.nB = 300}})
        Structs.Complex memory stored = structs.getComplexStruct();
        assertEq(stored.a, 1);
        assertEq(stored.nested.nA, 2);
        assertEq(stored.nested.nB, 300, "descriptor inside a nested struct argument");
    }

    function test_js_raw_data_simple_value() public {
        calldatas.push(abi.encodeWithSelector(SimpleReturn.setUintValue.selector));
        targets.push(address(simpleReturn));
        offsets.push(stateChangingCall(0x1));
        values.push(0x420);

        // Call the JavaScript file using FFI
        string[] memory inputs = new string[](4);
        inputs[0] = "bun";
        inputs[1] = "js/test/simpleValue.js";
        inputs[2] = vm.toString(address(simpleReturn));
        // Get the path to the ABI - it's in the out directory
        inputs[3] = "out/Helpers.sol/SimpleReturn.json";

        bytes memory res = vm.ffi(inputs);
        string memory json = string(res);

        // Parse the JSON result
        bytes memory jsTargets = vm.parseJson(json, ".targets");
        address[] memory jsTargetsArray = abi.decode(jsTargets, (address[]));
        bytes memory jsOffsets = vm.parseJson(json, ".offsets");
        uint256[] memory jsOffsetsArray = abi.decode(jsOffsets, (uint256[]));
        bytes memory jsCalldatas = vm.parseJson(json, ".calldatas");
        bytes memory jsCalldatasArray = abi.decode(jsCalldatas, (bytes));
        bytes memory jsMsgValues = vm.parseJson(json, ".msgValues");
        uint256[] memory jsMsgValuesArray = abi.decode(jsMsgValues, (uint256[]));

        // Compare with Solidity built values
        assertEq(jsTargetsArray.length, targets.length, "targets length mismatch");
        for (uint256 i = 0; i < targets.length; i++) {
            assertEq(jsTargetsArray[i], targets[i], "targets mismatch");
        }

        assertEq(jsOffsetsArray.length, offsets.length, "offsets length mismatch");
        for (uint256 i = 0; i < offsets.length; i++) {
            assertEq(jsOffsetsArray[i], offsets[i], "offsets mismatch");
        }

        assertEq(jsCalldatasArray, pack(calldatas), "packed calldatas mismatch");

        // The number of msgValues should equal the number of targets
        uint256 totalValue = 0;
        for (uint256 i = 0; i < jsMsgValuesArray.length; i++) {
            console.log(jsMsgValuesArray[i]);
            totalValue += jsMsgValuesArray[i];
            assertEq(jsMsgValuesArray[i], values[i], "msg values do not match");
        }

        multicall.execute{value: totalValue}(jsTargetsArray, jsOffsetsArray, jsCalldatasArray, jsMsgValuesArray);

        assertEq(simpleReturn.getUint(), 0x420, "Wrong value was set");
    }

    // set tuple(max, max, max) -> get_tuple_constants -> (1, 2, 3) -> setTuple(1, max, 3)
    function test_js_partial_return_data() public {
        // Build the transaction using Solidity
        // set_tuple(max, max, max)
        bytes memory set_tuple_first_calldata = abi.encodeWithSelector(
            DynamicReturn.setTuple.selector, type(uint256).max, type(uint256).max, type(uint256).max
        );
        // get tuple constants() -> (1, 2, 3)
        bytes memory partial_return_static_call = abi.encodeWithSelector(DynamicReturn.getTupleConstant.selector);
        // set_tuple(1, max, 3)
        bytes memory set_tuple_second_calldata =
            abi.encodeWithSelector(DynamicReturn.setTuple.selector, uint256(0), type(uint256).max, uint256(0));

        // ===============set_tuple=======================
        calldatas.push(set_tuple_first_calldata);
        targets.push(address(dynamicReturn));
        offsets.push(stateChangingCall());
        // ===============get_tuple_constants=======================
        calldatas.push(partial_return_static_call);
        targets.push(address(dynamicReturn));
        // 3 parameters from the last parameter
        //  <4byte_selector><tuple_data_offset><tuple_length><item0><item1><item2>
        uint256 next_call_data_start = set_tuple_second_calldata.length - 0x60;
        assertEq(next_call_data_start, 0x04);
        // where in next call to use
        memTargets.push(0x04); // pos 1
        memTargets.push(0x04 + 0x40); // pos 3
        // where in current call to fetch data
        returnOffsets.push(0x0); // first item
        returnOffsets.push(0x40); // third item
        resultLengths.push(0x20); // uint256
        resultLengths.push(0x20); // uint256
        offsets.push(staticCallPartialReturn(memTargets, resultLengths, returnOffsets, 0x60));
        // ==================set_tuple=================================
        calldatas.push(set_tuple_second_calldata);
        targets.push(address(dynamicReturn));
        offsets.push(stateChangingCall(0x0));

        // Call the JavaScript file using FFI
        string[] memory inputs = new string[](4);
        inputs[0] = "bun";
        inputs[1] = "js/test/multiple_variables.js";
        inputs[2] = vm.toString(address(dynamicReturn));
        // Get the path to the ABI - it's in the out directory
        inputs[3] = "out/Helpers.sol/DynamicReturn.json";

        bytes memory res = vm.ffi(inputs);
        string memory json = string(res);

        // Parse the JSON result
        bytes memory jsTargets = vm.parseJson(json, ".targets");
        address[] memory jsTargetsArray = abi.decode(jsTargets, (address[]));
        bytes memory jsOffsets = vm.parseJson(json, ".offsets");
        uint256[] memory jsOffsetsArray = abi.decode(jsOffsets, (uint256[]));
        bytes memory jsCalldatas = vm.parseJson(json, ".calldatas");
        bytes memory jsCalldatasArray = abi.decode(jsCalldatas, (bytes));
        bytes memory jsMsgValues = vm.parseJson(json, ".msgValues");
        uint256[] memory jsMsgValuesArray = abi.decode(jsMsgValues, (uint256[]));

        // Compare with Solidity built values
        assertEq(jsTargetsArray.length, targets.length, "targets length mismatch");
        for (uint256 i = 0; i < targets.length; i++) {
            assertEq(jsTargetsArray[i], targets[i], "targets mismatch");
        }

        assertEq(jsOffsetsArray.length, offsets.length, "offsets length mismatch");
        for (uint256 i = 0; i < offsets.length; i++) {
            assertEq(jsOffsetsArray[i], offsets[i], "offsets mismatch");
        }

        assertEq(jsCalldatasArray, pack(calldatas), "packed calldatas mismatch");

        // Since all msgValues are 0, and values is empty, we need to compare against an array of zeros
        // The number of msgValues should equal the number of targets
        for (uint256 i = 0; i < jsMsgValuesArray.length; i++) {
            console.log(jsMsgValuesArray[i]);
            assertEq(jsMsgValuesArray[i], 0);
        }

        multicall.execute(jsTargetsArray, jsOffsetsArray, jsCalldatasArray, jsMsgValuesArray);
        (uint256 a, uint256 b, uint256 c) = dynamicReturn.tuple();
        assertEq(a, 1);
        assertEq(b, type(uint256).max);
        assertEq(c, 3);
    }

    function test_js_calldata_dynamic_var() public {
        // Call the JavaScript file using FFI
        string[] memory inputs = new string[](4);
        inputs[0] = "bun";
        inputs[1] = "js/test/calldataDynamicVar.js";
        inputs[2] = vm.toString(address(dynamicVar));
        // Get the path to the ABI - it's in the out directory
        inputs[3] = "out/Helpers.sol/DynamicVar.json";

        // Execute the JavaScript file
        bytes memory res = vm.ffi(inputs);

        // Parse the JSON output
        string memory json = string(res);

        // Extract arrays from JSON
        address[] memory jsTargetsArray = vm.parseJsonAddressArray(json, ".targets");
        uint256[] memory jsOffsetsArray = vm.parseJsonUintArray(json, ".offsets");
        bytes memory jsCalldatasArray = vm.parseJsonBytes(json, ".calldatas");
        uint256[] memory jsMsgValuesArray = vm.parseJsonUintArray(json, ".msgValues");

        // Verify the arrays have the same length
        assertEq(jsTargetsArray.length, 1);
        assertEq(jsOffsetsArray.length, 1);
        assertEq(jsMsgValuesArray.length, 0); // No msgValues expected

        // Execute the transaction
        multicall.execute(jsTargetsArray, jsOffsetsArray, jsCalldatasArray, jsMsgValuesArray);

        // Verify the addresses were set correctly
        address[] memory storedAddresses = dynamicVar.getAddresses();
        assertEq(storedAddresses.length, 3);
        assertEq(storedAddresses[0], address(0xcafe));
        assertEq(storedAddresses[1], address(0xbeef));
        assertEq(storedAddresses[2], address(0xdead));
    }

    function test_js_dynamic_array() public {
        // Call the JavaScript file using FFI
        string[] memory inputs = new string[](4);
        inputs[0] = "bun";
        inputs[1] = "js/test/dynamicArray.js";
        inputs[2] = vm.toString(address(dynamicVar));
        // Get the path to the ABI - it's in the out directory
        inputs[3] = "out/Helpers.sol/DynamicVar.json";

        // Execute the JavaScript file
        bytes memory res = vm.ffi(inputs);

        // Parse the JSON output
        string memory json = string(res);

        // Extract arrays from JSON
        address[] memory jsTargetsArray = vm.parseJsonAddressArray(json, ".targets");
        uint256[] memory jsOffsetsArray = vm.parseJsonUintArray(json, ".offsets");
        bytes memory jsCalldatasArray = vm.parseJsonBytes(json, ".calldatas");
        uint256[] memory jsMsgValuesArray = vm.parseJsonUintArray(json, ".msgValues");

        // Verify we have 2 calls (setAddresses and getAddresses)
        assertEq(jsTargetsArray.length, 2);
        assertEq(jsOffsetsArray.length, 2);
        // msgValues should be empty since all calls have msgValue = 0
        assertEq(jsMsgValuesArray.length, 0);

        // Execute the transaction
        multicall.execute(jsTargetsArray, jsOffsetsArray, jsCalldatasArray, jsMsgValuesArray);

        // Verify the addresses were set correctly
        // The JavaScript test should have:
        // 1. Called setAddresses() with [0xcafe, 0xbeef, 0xdead]
        // 2. Called getAddresses() to verify
        address[] memory storedAddresses = dynamicVar.getAddresses();
        assertEq(storedAddresses.length, 3);
        assertEq(storedAddresses[0], address(0xcafe));
        assertEq(storedAddresses[1], address(0xbeef));
        assertEq(storedAddresses[2], address(0xdead));
    }

    function test_js_use_dynamic_var() public {
        // Call the JavaScript file using FFI
        string[] memory inputs = new string[](4);
        inputs[0] = "bun";
        inputs[1] = "js/test/useDynamicVar.js";
        inputs[2] = vm.toString(address(dynamicVar));
        // Get the path to the ABI - it's in the out directory
        inputs[3] = "out/Helpers.sol/DynamicVar.json";

        // Execute the JavaScript file
        bytes memory res = vm.ffi(inputs);

        // Parse the JSON output
        string memory json = string(res);

        // Extract arrays from JSON
        address[] memory jsTargetsArray = vm.parseJsonAddressArray(json, ".targets");
        uint256[] memory jsOffsetsArray = vm.parseJsonUintArray(json, ".offsets");
        bytes memory jsCalldatasArray = vm.parseJsonBytes(json, ".calldatas");
        uint256[] memory jsMsgValuesArray = vm.parseJsonUintArray(json, ".msgValues");

        // Verify we have 2 calls (getConstantAddresses and setAddresses)
        assertEq(jsTargetsArray.length, 2);
        assertEq(jsOffsetsArray.length, 2);
        // msgValues should be empty since all calls have msgValue = 0
        assertEq(jsMsgValuesArray.length, 0);

        // Execute the transaction
        multicall.execute(jsTargetsArray, jsOffsetsArray, jsCalldatasArray, jsMsgValuesArray);

        // Verify the addresses were set correctly
        // The JavaScript test should have:
        // 1. Called getConstantAddresses() -> returns [0xCAFE, 0xBEEF, 0xDEAD]
        // 2. Called setAddresses() with the returned array
        address[] memory storedAddresses = dynamicVar.getAddresses();
        assertEq(storedAddresses.length, 3);
        assertEq(storedAddresses[0], address(0xcafe));
        assertEq(storedAddresses[1], address(0xbeef));
        assertEq(storedAddresses[2], address(0xdead));
    }

    function test_js_array_element_access_numbers() public {
        // Call the JavaScript file using FFI
        string[] memory inputs = new string[](4);
        inputs[0] = "bun";
        inputs[1] = "js/test/arrayElementAccess.js";
        inputs[2] = vm.toString(address(arrayElementAccess));
        inputs[3] = "out/Helpers.sol/ArrayElementAccess.json";

        bytes memory res = vm.ffi(inputs);
        string memory json = string(res);

        // Parse the JSON output
        address[] memory jsTargetsArray = vm.parseJsonAddressArray(json, ".targets");
        uint256[] memory jsOffsetsArray = vm.parseJsonUintArray(json, ".offsets");
        bytes memory jsCalldatasArray = vm.parseJsonBytes(json, ".calldatas");
        uint256[] memory jsMsgValuesArray = vm.parseJsonUintArray(json, ".msgValues");
        multicall.execute(jsTargetsArray, jsOffsetsArray, jsCalldatasArray, jsMsgValuesArray);

        assertEq(arrayElementAccess.getNumberAt(0), 300);
        assertEq(arrayElementAccess.getNumberAt(1), 2);
        assertEq(arrayElementAccess.getNumberAt(2), 3);
        assertEq(arrayElementAccess.getAddressAt(0), address(0x1111111111111111111111111111111111111111));
        assertEq(arrayElementAccess.getAddressAt(1), address(0x2222222222222222222222222222222222222222));
        assertEq(arrayElementAccess.getAddressAt(2), address(0x3333333333333333333333333333333333333333));
    }

    function test_js_string_operations() public {
        // Call the JavaScript file using FFI
        string[] memory inputs = new string[](4);
        inputs[0] = "bun";
        inputs[1] = "js/test/stringOperations.js";
        inputs[2] = vm.toString(address(stringAndBytesOps));
        inputs[3] = "out/Helpers.sol/StringAndBytesOperations.json";

        bytes memory res = vm.ffi(inputs);
        string memory json = string(res);

        // Parse the JSON output
        address[] memory jsTargetsArray = vm.parseJsonAddressArray(json, ".targets");
        uint256[] memory jsOffsetsArray = vm.parseJsonUintArray(json, ".offsets");
        bytes memory jsCalldatasArray = vm.parseJsonBytes(json, ".calldatas");
        uint256[] memory jsMsgValuesArray = vm.parseJsonUintArray(json, ".msgValues");

        // Execute the transaction
        multicall.execute(jsTargetsArray, jsOffsetsArray, jsCalldatasArray, jsMsgValuesArray);

        assertEq(stringAndBytesOps.getText(), string("Hello, Multicall Scripting!"));
    }

    function test_js_bytes_operations() public {
        // Call the JavaScript file using FFI
        string[] memory inputs = new string[](4);
        inputs[0] = "bun";
        inputs[1] = "js/test/bytesOperations.js";
        inputs[2] = vm.toString(address(stringAndBytesOps));
        inputs[3] = "out/Helpers.sol/StringAndBytesOperations.json";

        bytes memory res = vm.ffi(inputs);
        string memory json = string(res);

        // Parse the JSON output
        address[] memory jsTargetsArray = vm.parseJsonAddressArray(json, ".targets");
        uint256[] memory jsOffsetsArray = vm.parseJsonUintArray(json, ".offsets");
        bytes memory jsCalldatasArray = vm.parseJsonBytes(json, ".calldatas");
        uint256[] memory jsMsgValuesArray = vm.parseJsonUintArray(json, ".msgValues");
        // Execute the transaction
        multicall.execute(jsTargetsArray, jsOffsetsArray, jsCalldatasArray, jsMsgValuesArray);

        assertEq(stringAndBytesOps.getDynamicBytes(), hex"deadbeefcafebabe1234567890abcdef11223344");
    }

    // Verify that JS-built offsets decode to the expected field values using CallDecoder.
    // This catches any shift-by-1 or bit-packing divergence between the JS and Solidity encoders.
    function test_js_encoding_roundtrip() public {
        string[] memory inputs = new string[](2);
        inputs[0] = "bun";
        inputs[1] = "js/test/encodingRoundtrip.js";

        bytes memory res = vm.ffi(inputs);
        string memory json = string(res);

        // --- staticCall(0x24, 0x20) ---
        uint256 staticCallSimple = vm.parseJsonUint(json, ".staticCallSimple");
        assertEq(callDecoder.getMemTarget(staticCallSimple), 0x24, "staticCall: memTarget mismatch");
        assertEq(callDecoder.getResultLength(staticCallSimple), 0x20, "staticCall: resultLength mismatch");
        assertEq(staticCallSimple >> 248, STATIC_CALL_FLAG, "staticCall: calltype mismatch");

        // --- stateChangingCall(0) ---
        uint256 stateChangingNoValue = vm.parseJsonUint(json, ".stateChangingNoValue");
        assertEq(callDecoder.getValueIndex(stateChangingNoValue), 0, "stateChangingCall(0): valueIndex mismatch");
        assertEq(stateChangingNoValue >> 248, CALL_FLAG, "stateChangingCall(0): calltype mismatch");

        // --- stateChangingCall(2) ---
        uint256 stateChangingWithValue = vm.parseJsonUint(json, ".stateChangingWithValue");
        assertEq(callDecoder.getValueIndex(stateChangingWithValue), 2, "stateChangingCall(2): valueIndex mismatch");
        assertEq(stateChangingWithValue >> 248, CALL_FLAG, "stateChangingCall(2): calltype mismatch");

        // --- staticCallPartialReturn: calltype byte must be 0xFC ---
        uint256 partialReturnOne = vm.parseJsonUint(json, ".partialReturnOne");
        assertEq(partialReturnOne >> 248, STATIC_CALL_PARTIAL_RETURN_FLAG, "partialReturn(1): calltype mismatch");

        uint256 partialReturnTwo = vm.parseJsonUint(json, ".partialReturnTwo");
        assertEq(partialReturnTwo >> 248, STATIC_CALL_PARTIAL_RETURN_FLAG, "partialReturn(2): calltype mismatch");
    }
}
