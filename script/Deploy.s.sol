// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {MulticallScripter} from "../src/MulticallScripter.sol";
import {MulticallScripterReadOnly} from "../src/MulticallScripterReadOnly.sol";
import {SevenSevenZeroTwoCaller} from "../src/7702Caller.sol";

/// @dev Ethereum deployment and local fork rehearsal. Wallet selection is left to forge's CLI.
/// Re-running checks existing runtime bytecode rather than failing on CREATE2 collisions.
contract Deploy is Script {
    bytes32 public constant SALT = bytes32(uint256(0x4d756c746963616c6c5363726970746572));
    address public constant FACTORY = 0x4e59b44847b379578588920cA78FbF26c0B4956C;

    function run() external returns (address writer, address reader, address delegate) {
        require(block.chainid == 1 || block.chainid == 31337, "Expected Ethereum or local fork");
        require(FACTORY.code.length != 0, "CREATE2 factory missing");
        vm.startBroadcast();
        writer = predicted(type(MulticallScripter).creationCode);
        if (writer.code.length == 0) require(address(new MulticallScripter{salt: SALT}()) == writer);
        checkCode(writer, keccak256(type(MulticallScripter).runtimeCode));
        console.log("MulticallScripter:", writer);
        reader = predicted(type(MulticallScripterReadOnly).creationCode);
        if (reader.code.length == 0) require(address(new MulticallScripterReadOnly{salt: SALT}()) == reader);
        checkCode(reader, keccak256(type(MulticallScripterReadOnly).runtimeCode));
        console.log("MulticallScripterReadOnly:", reader);
        if (vm.envOr("DEPLOY_7702", false)) {
            delegate = predicted(type(SevenSevenZeroTwoCaller).creationCode);
            if (delegate.code.length == 0) require(address(new SevenSevenZeroTwoCaller{salt: SALT}()) == delegate);
            checkCode(delegate, keccak256(type(SevenSevenZeroTwoCaller).runtimeCode));
            console.log("SevenSevenZeroTwoCaller:", delegate);
        }
        vm.stopBroadcast();
        console.log("Chain ID:", block.chainid);
    }

    function predicted(bytes memory creationCode) public pure returns (address) {
        return
            address(uint160(uint256(keccak256(abi.encodePacked(bytes1(0xff), FACTORY, SALT, keccak256(creationCode))))));
    }

    function checkCode(address deployed, bytes32 expected) private view {
        require(deployed.codehash == expected, "Deployed runtime does not match release build");
        console.log("Runtime code hash:");
        console.logBytes32(expected);
    }
}
