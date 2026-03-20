// SPDX-License-Identifier: GPL3
pragma solidity ^0.8.28;

import {Test, console} from "forge-std/Test.sol";
import "forge-std/StdJson.sol";
import {CallBuilder, CallDecoder} from "src/CallBuilder.sol";
import {MulticallScripter} from "src/MulticallScripter.sol";
import {Math, SimpleReturn, DynamicReturn, Fuzzy, Structs} from "./Helpers.sol";

contract JsLibrary is Test, CallBuilder, MulticallScripter {
    MulticallScripter multicall;
    CallDecoder callDecoder;

    SimpleReturn simpleReturn;
    DynamicReturn dynamicReturn;
    Math math;
    Fuzzy fuzzy;
    Structs structs;

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
    }

    function test_js_complex_structs() public {
        Structs.Static memory stat = Structs.Static(2, 3);
        Structs.Complex memory complex = Structs.Complex(1, stat);

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
        bytes[] memory jsCalldatasArray = abi.decode(jsCalldatas, (bytes[]));
        bytes memory jsMsgValues = vm.parseJson(json, ".msgValues");
        uint256[] memory jsMsgValuesArray = abi.decode(jsMsgValues, (uint256[]));

        multicall.execute(jsTargetsArray, jsOffsetsArray, jsCalldatasArray, jsMsgValuesArray);

        assertEq(abi.encode(structs.getComplexStruct()), abi.encode(complex), "Wrong value was set");
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
        bytes[] memory jsCalldatasArray = abi.decode(jsCalldatas, (bytes[]));
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

        assertEq(jsCalldatasArray.length, calldatas.length, "calldata length mismatch");
        for (uint256 i = 0; i < calldatas.length; i++) {
            assertEq(keccak256(jsCalldatasArray[i]), keccak256(calldatas[i]), "calldatas mismatch");
        }

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
        bytes[] memory jsCalldatasArray = abi.decode(jsCalldatas, (bytes[]));
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

        assertEq(jsCalldatasArray.length, calldatas.length, "calldata length mismatch");
        for (uint256 i = 0; i < calldatas.length; i++) {
            assertEq(keccak256(jsCalldatasArray[i]), keccak256(calldatas[i]), "calldatas mismatch");
        }

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
}
