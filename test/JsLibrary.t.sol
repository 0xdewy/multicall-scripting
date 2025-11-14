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
                '"0x', vm.toString(maxUint), '"',
                ",",
                '"0x', vm.toString(maxUint), '"',
                ",",
                '"0x', vm.toString(maxUint), '"',
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
                '{"callIndex":1,"offset":0,"size":32},', // First item (offset 0)
                '"0x', vm.toString(maxUint), '"',
                ",", // max uint
                '{"callIndex":1,"offset":64,"size":32}', // Third item (offset 64)
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

    function test_simple_usage_js() public {
        // ===================================Solidity=========================================
        // x = math.add(2,2)
        calldatas.push(abi.encodeWithSelector(Math.add.selector, 2, 2));
        targets.push(address(math));
        // store output of static call 36 bytes ahead in call chain as second param of following math.add(a,b)
        // <this_call><add_fn_selector><first_param><second_param>
        offsets.push(staticCall(0x24, 0x20));

        // y = math.add(2, x)
        calldatas.push(abi.encodeWithSelector(Math.add.selector, 2, 0));
        targets.push(address(math));
        // next param offset is 4bytes + 32bytes (32==0x20)
        offsets.push(staticCall(0x4, 0x20));

        // math.setNum(y)
        calldatas.push(abi.encodeWithSelector(Math.setNum.selector, 0));
        targets.push(address(math));
        offsets.push(stateChangingCall());

        // ============================================JS=========================================
        string memory callsJson = string(
            abi.encodePacked(
                "[",
                '{"abiPath":"out/Math.sol/Math.json",',
                '"target":"',
                vm.toString(address(math)),
                '",',
                '"functionName":"add",',
                '"args":["0x2","0x2"],',
                '"value":0},',
                '{"abiPath":"out/Math.sol/Math.json",',
                '"target":"',
                vm.toString(address(math)),
                '",',
                '"functionName":"add",',
                '"args":["0x2",{"callIndex":0,"type":"uint256","value":0,"offset":0,"size":32}],',
                '"value":0},',
                '{"abiPath":"out/Math.sol/Math.json",',
                '"target":"',
                vm.toString(address(math)),
                '",',
                '"functionName":"setNum",',
                '"args":[{"callIndex":1,"type":"uint256","value":0,"offset":0,"size":32}],',
                '"value":0}',
                "]"
            )
        );

        (
            address[] memory jsTargets,
            uint256[] memory jsOffsets,
            bytes[] memory jsCalldatas,
            uint256[] memory jsValues
        ) = callJavaScriptBuilder(callsJson);

        for (uint256 i = 0; i < offsets.length; i++) {
            assertEq(offsets[i], jsOffsets[i], "offsets do not match");
            assertEq(targets[i], jsTargets[i], "targets do not match");
            assertEq(calldatas[i], jsCalldatas[i], "calldatas do not match");
        }
        for (uint256 i = 0; i < values.length; i++) {
            assertEq(values[i], jsValues[i]);
        }

        // execute calls
        // multicall.execute(targets, offsets, calldatas, values);
        multicall.execute(jsTargets, jsOffsets, jsCalldatas, jsValues);
        // 2 + 2 => 4 + 2 => 6
        assertEq(math.number(), 6, "failed to add numbers");
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
