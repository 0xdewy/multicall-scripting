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

    function test_simple_usage_js() public {
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

        string memory callsJson = string(
            abi.encodePacked(
                "[",
                '{"abiPath":"out/Math.sol/Math.json",',
                '"target":"',
                vm.toString(address(math)),
                '",',
                '"functionName":"add",',
                '"args":[2,2],',
                '"value":0},',
                '{"abiPath":"out/Math.sol/Math.json",',
                '"target":"',
                vm.toString(address(math)),
                '",',
                '"functionName":"add",',
                '"args":[2,{"callIndex":0,"type":"uint256","value":0,"offset":0,"size":32}],',
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

        // Call JavaScript library using FFI
        string[] memory inputs = new string[](3);
        inputs[0] = "bun";
        inputs[1] = "js/cli.js";
        inputs[2] = callsJson;

        bytes memory result = vm.ffi(inputs);

        // Parse the result from JavaScript
        (
            address[] memory jsTargets,
            uint256[] memory jsOffsets,
            bytes[] memory jsCalldatas,
            uint256[] memory jsValues
        ) = parseBuilderResult(result);

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
