// SPDX-License-Identifier: Unlicense
pragma solidity >=0.8.0 <0.9.0;

import {Test, console2} from "forge-std/Test.sol";
import "weiroll-huff/weiroll/Planner.sol";
import "weiroll-huff/weiroll/Weiroll.sol";
import "weiroll-huff/weiroll/CommandBuilder.sol";
import "./helpers/Events.sol";
import "./helpers/Math.sol";
import "../src/MulticallScripter.sol";
import "../src/CallBuilder.sol";

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

    // call math.add() 30 times
    function testGasCompareAddUints() public {
        uint256 a = 10000;
        uint256 b = 32490283094;

        uint256 gasUsed = 1;
        uint256 gas = 1;

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
        gas = gasleft();
        weiroll.execute(_commands, _state);
        gasUsed = gas - gasleft();
        console2.log("Gas - Weiroll.addUints(): ", gasUsed);

        // encode calls for scripter contract
        for (uint256 i = 0; i < 30; i++) {
            calldatas.push(abi.encodeWithSelector(math.add.selector, a, b));
            targets.push(address(math));
            offsets.push(staticCall(0x4, 0x20));

            calldatas.push(abi.encodeWithSelector(events.logUint.selector, 0x0));
            targets.push(address(events));
            offsets.push(stateChangingCall(0x0));
        }
        gas = gasleft();
        multicall.execute(targets, offsets, calldatas, values);
        gasUsed = gas - gasleft();
        console2.log("Gas - Scripter.addUints(): ", gasUsed);

        // make calls directly for baseline
        gas = gasleft();
        for (uint256 i = 0; i < 30; i++) {
            uint256 val = math.add(a, b);
            events.logUint(val);
        }
        console2.log("Gas - Base cost: ", gas - gasleft());
    }

    /*
    function testAddUints() public {
        uint8 a = 0x69;
        uint16 b = 0x420;
        planner.staticCall(address(math), math.add.selector);
        planner.withRawArg(abi.encode(a), false);
        planner.withRawArg(abi.encode(b), false);
        bytes1 index = planner.saveOutput();
        planner.regularCall(address(events), events.logUint.selector);
        planner.withArg(index);

        (bytes32[] memory _commands, bytes[] memory _state) = planner.encode();

        weiroll.execute(_commands, _state);
    }
    */
}
