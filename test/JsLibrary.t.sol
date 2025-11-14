// SPDX-License-Identifier: GPL3
pragma solidity ^0.8.28;

import {Test, console} from "forge-std/Test.sol";
import "forge-std/StdJson.sol";
import {CallBuilder, CallDecoder} from "src/CallBuilder.sol";
import {MulticallScripter} from "src/MulticallScripter.sol";
import {Math, SimpleReturn, DynamicReturn, Fuzzy} from "./Helpers.sol";

contract JsLibrary is Test, CallBuilder, MulticallScripter {
    MulticallScripter multicall;
    CallDecoder callDecoder;

    SimpleReturn simpleReturn;
    DynamicReturn dynamicReturn;
    Math math;
    Fuzzy fuzzy;

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
    }

    // set tuple(max, max, max) -> get_tuple_constants -> (1, 2, 3) -> setTuple(1, max, 3)
    function test_js_partial_return_data() public {
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

        // ==========================Javascript=========================
        string memory targetAddr = vm.toString(address(dynamicReturn));
        uint256 maxUint = type(uint256).max;

        string memory callsJson = string(
            abi.encodePacked(
                "[",
                // Call 0: setTuple(max, max, max)
                '{"abiPath":"out/Helpers.sol/DynamicReturn.json","target":"',
                targetAddr,
                '",',
                '"functionName":"setTuple","args":[',
                '"0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"',
                ",",
                '"0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"',
                ",",
                '"0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"',
                '],"value":0},',
                // Call 1: getTupleConstant() - will return (1, 2, 3)
                '{"abiPath":"out/Helpers.sol/DynamicReturn.json","target":"',
                targetAddr,
                '",',
                '"functionName":"getTupleConstant","args":[],"value":0},',
                // Call 2: setTuple(first_item, max, third_item)
                '{"abiPath":"out/Helpers.sol/DynamicReturn.json","target":"',
                targetAddr,
                '",',
                '"functionName":"setTuple","args":[',
                '{"callIndex":1,"type":"uint256","value":0,"offset":0,"size":32,"requiresSizing":false},', // First item (offset 0)
                '"0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"',
                ",", // max uint
                '{"callIndex":1,"type":"uint256","value":0,"offset":64,"size":32,"requiresSizing":false}', // Third item (offset 64)
                '],"value":0}',
                "]"
            )
        );

        // Call JavaScript builder
        (address[] memory targets, uint256[] memory offsets, bytes[] memory calldatas,) =
            callJavaScriptBuilder(callsJson);
        // ===================execute=================================
        multicall.execute(targets, offsets, calldatas, values);

        (uint256 a, uint256 b, uint256 c) = dynamicReturn.tuple();
        assertEq(a, 1);
        assertEq(b, type(uint256).max);
        assertEq(c, 3);
    }

    function test_twoVariableReturn() public {
        // First, let's create a helper contract that returns a tuple
        // We can use DynamicReturn which already has getTupleConstant() that returns (1, 2, 3)
        
        // ============================================JS=========================================
        string memory callsJson = string(
            abi.encodePacked(
                "[",
                // Call 0: getTupleConstant() returns (1, 2, 3)
                '{"abiPath":"out/Helpers.sol/DynamicReturn.json",',
                '"target":"',
                vm.toString(address(dynamicReturn)),
                '",',
                '"functionName":"getTupleConstant","args":[],"value":0},',
                // Call 1: use the first and third elements from the tuple (1 and 3)
                '{"abiPath":"out/Helpers.sol/DynamicReturn.json",',
                '"target":"',
                vm.toString(address(dynamicReturn)),
                '",',
                '"functionName":"setTuple","args":[',
                '{"callIndex":0,"type":"uint256","value":0,"offset":0,"size":32,"requiresSizing":false},', // First element (1)
                '"0x0",', // Placeholder for second element
                '{"callIndex":0,"type":"uint256","value":0,"offset":64,"size":32,"requiresSizing":false}', // Third element (3)
                '],"value":0}',
                "]"
            )
        );

        (
            address[] memory jsTargets,
            uint256[] memory jsOffsets,
            bytes[] memory jsCalldatas,
            uint256[] memory jsValues
        ) = callJavaScriptBuilder(callsJson);

        // Execute calls
        multicall.execute(jsTargets, jsOffsets, jsCalldatas, jsValues);
        
        // Verify the result: setTuple should have been called with (1, 0, 3)
        (uint256 a, uint256 b, uint256 c) = dynamicReturn.tuple();
        assertEq(a, 1);
        assertEq(b, 0);
        assertEq(c, 3);
    }

    // Helper fn to call the javascript library
    function callJavaScriptBuilder(string memory callsJson)
        internal
        returns (address[] memory targets, uint256[] memory offsets, bytes[] memory calldatas, uint256[] memory values)
    {
        string[] memory inputs = new string[](3);
        inputs[0] = "bun";
        inputs[1] = "js/cli.js";
        inputs[2] = callsJson;

        bytes memory result = vm.ffi(inputs);
        (targets, offsets, calldatas, values) = parseBuilderResult(result);
    }

    function parseBuilderResult(bytes memory result)
        internal
        view
        returns (address[] memory targets, uint256[] memory offsets, bytes[] memory calldatas, uint256[] memory values)
    {
        string memory resultStr = string(result);

        targets = stdJson.readAddressArray(resultStr, ".targets");
        offsets = stdJson.readUintArray(resultStr, ".offsets");
        calldatas = stdJson.readBytesArray(resultStr, ".calldatas");

        // Return empty values array since we're not using ETH transfers
        values = new uint256[](0);
    }
}
