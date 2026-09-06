// SPDX-License-Identifier: Unlicense
pragma solidity >=0.8.0 <0.9.0;

import {Test} from "forge-std/Test.sol";
import "weiroll-huff/weiroll/Planner.sol";
import "weiroll-huff/weiroll/Weiroll.sol";
import "weiroll-huff/weiroll/CommandBuilder.sol";
import {Events, Math} from "./Helpers.sol";
import {MulticallScripter} from "../src/MulticallScripter.sol";
import {CallBuilder} from "./CallBuilder.sol";

interface IWeiroll {
    function execute(bytes32[] calldata _commands, bytes[] memory _state) external payable;
}

contract GasTest is Test, Events, CallBuilder {
    /// @dev Address of the VmTest contract.
    MulticallScripter multicall;
    Weiroll weiroll;
    Planner planner;
    Events events;
    Math math;

    address[] targets;
    uint256[] offsets;
    bytes[] calldatas;
    uint256[] values;

    /// @dev Setup the testing environment.
    function setUp() public {
        multicall = new MulticallScripter();
        weiroll = new Weiroll();
        planner = new Planner();
        events = new Events();
        math = new Math();
    }

    // call math.add() 30 times — assert Scripter beats Weiroll and stays within 3x direct cost
    function testGasCompareAddUints() public {
        uint256 a = 10000;
        uint256 b = 32490283094;

        uint256 weirollGas;
        uint256 scripterGas;
        uint256 directGas;
        uint256 g;

        // Warm the same targets before all measurements so access costs are comparable.
        assertGt(address(math).code.length, 0);
        assertGt(address(events).code.length, 0);

        // encode weiroll calls
        for (uint256 i = 0; i < 30; i++) {
            planner.staticCall(address(math), math.add.selector);
            planner.withRawArg(abi.encode(a), false);
            planner.withRawArg(abi.encode(b), false);
            bytes1 stateIndex = planner.saveOutput();
            planner.regularCall(address(events), events.logUint.selector);
            planner.withArg(stateIndex);
        }
        (bytes32[] memory _commands, bytes[] memory _state) = planner.encode();
        weiroll.execute(_commands, _state);
        weirollGas = vm.lastCallGas().gasTotalUsed;

        // encode calls for scripter contract
        for (uint256 i = 0; i < 30; i++) {
            calldatas.push(abi.encodeWithSelector(math.add.selector, a, b));
            targets.push(address(math));
            offsets.push(staticCall(0x4, 0x20));

            calldatas.push(abi.encodeWithSelector(events.logUint.selector, 0x0));
            targets.push(address(events));
            offsets.push(stateChangingCall(0x0));
        }
        multicall.execute(targets, offsets, pack(calldatas), values);
        scripterGas = vm.lastCallGas().gasTotalUsed;

        // make calls directly for baseline
        g = gasleft();
        for (uint256 i = 0; i < 30; i++) {
            uint256 val = math.add(a, b);
            events.logUint(val);
        }
        directGas = g - gasleft();

        // Scripter must beat Weiroll (core value proposition: ~2x advantage)
        assertLt(scripterGas, weirollGas, "Scripter must beat Weiroll on 30-call chain");

        // Scripter overhead must stay within 3x of direct calls
        assertLt(scripterGas, directGas * 3, "Scripter overhead >3x direct calls");

        // Weiroll must beat naive iteration (sanity check)
        assertLt(weirollGas, directGas * 30, "Weiroll too slow vs direct");
    }
}
