// SPDX-License-Identifier: GPL3
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {MulticallScripter} from "src/MulticallScripter.sol";
import {Math, SimpleReturn} from "./Helpers.sol";

// Authoritative Rust <-> Solidity parity: builds a return-value-chaining transaction with the Rust
// CLI (crates/cli, the js/cli.js analogue) over FFI, executes it through the real contract, and
// asserts the resulting on-chain state. This is the end-to-end check that Rust-built offsets are
// decoded and spliced correctly by execute(). Requires `cargo` on PATH and ffi=true (foundry.toml).
contract RustLibrary is Test {
    MulticallScripter multicall;
    Math math;
    SimpleReturn simpleReturn;

    function setUp() public {
        multicall = new MulticallScripter();
        math = new Math();
        simpleReturn = new SimpleReturn();
    }

    function test_rust_cli_chain_executes() public {
        string memory addr = vm.toString(address(math));
        string memory abiPath = "out/Helpers.sol/Math.json";

        // x = add(2, 2); y = add(2, x); setNum(y)  -> number() == 6
        string memory calls = string.concat(
            "[",
            _call(abiPath, addr, "add", '["2","2"]'),
            ",",
            _call(abiPath, addr, "add", '["2",{"callIndex":0,"offset":0,"size":32}]'),
            ",",
            _call(abiPath, addr, "setNum", '[{"callIndex":1,"offset":0,"size":32}]'),
            "]"
        );

        string[] memory inputs = new string[](9);
        inputs[0] = "cargo";
        inputs[1] = "run";
        inputs[2] = "--manifest-path";
        inputs[3] = "rust/Cargo.toml";
        inputs[4] = "-q";
        inputs[5] = "-p";
        inputs[6] = "multicall-scripter-cli";
        inputs[7] = "--";
        inputs[8] = calls;

        bytes memory res = vm.ffi(inputs);
        string memory json = string(res);

        address[] memory targets = vm.parseJsonAddressArray(json, ".targets");
        uint256[] memory offsets = vm.parseJsonUintArray(json, ".offsets");
        bytes[] memory calldatas = vm.parseJsonBytesArray(json, ".calldatas");
        uint256[] memory msgValues = vm.parseJsonUintArray(json, ".msgValues");

        multicall.execute(targets, offsets, calldatas, msgValues);

        // 2 + 2 => 4 ; 2 + 4 => 6 ; setNum(6)
        assertEq(math.number(), 6, "rust-built chain did not execute correctly");
    }

    // On-chain proof of the msg.value branch (which the CLI ref contract can express): build a
    // payable call carrying value via the Rust CLI, forward that value through execute(), and check
    // it landed. setUintValue() sets `a = msg.value`.
    function test_rust_cli_value_call() public {
        uint256 sendValue = 0.5 ether;
        string memory addr = vm.toString(address(simpleReturn));

        string memory calls = string.concat(
            "[",
            _callV("out/Helpers.sol/SimpleReturn.json", addr, "setUintValue", "[]", "500000000000000000"),
            "]"
        );

        string[] memory inputs = new string[](9);
        inputs[0] = "cargo";
        inputs[1] = "run";
        inputs[2] = "--manifest-path";
        inputs[3] = "rust/Cargo.toml";
        inputs[4] = "-q";
        inputs[5] = "-p";
        inputs[6] = "multicall-scripter-cli";
        inputs[7] = "--";
        inputs[8] = calls;

        string memory json = string(vm.ffi(inputs));
        address[] memory targets = vm.parseJsonAddressArray(json, ".targets");
        uint256[] memory offsets = vm.parseJsonUintArray(json, ".offsets");
        bytes[] memory calldatas = vm.parseJsonBytesArray(json, ".calldatas");
        uint256[] memory msgValues = vm.parseJsonUintArray(json, ".msgValues");

        assertEq(msgValues.length, 1, "one indexed value expected");
        assertEq(msgValues[0], sendValue, "value not carried by the Rust builder");

        vm.deal(address(this), sendValue);
        multicall.execute{value: sendValue}(targets, offsets, calldatas, msgValues);

        assertEq(simpleReturn.a(), sendValue, "msg.value did not reach the payable call");
    }

    function _callV(
        string memory abiPath,
        string memory target,
        string memory fn,
        string memory args,
        string memory value
    ) internal pure returns (string memory) {
        return string.concat(
            '{"abiPath":"', abiPath, '","target":"', target, '","functionName":"', fn, '","args":', args, ',"value":"', value, '"}'
        );
    }

    function _call(string memory abiPath, string memory target, string memory fn, string memory args)
        internal
        pure
        returns (string memory)
    {
        return string.concat(
            '{"abiPath":"', abiPath, '","target":"', target, '","functionName":"', fn, '","args":', args, ',"value":"0"}'
        );
    }
}
