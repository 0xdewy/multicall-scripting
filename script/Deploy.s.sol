// SPDX-License-Identifier: GPL3
pragma solidity ^0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {MulticallScripter} from "../src/MulticallScripter.sol";
import {SevenSevenZeroTwoCaller} from "../src/7702Caller.sol";

contract Deploy is Script {
    // Default ERC-4337 EntryPoint v0.7 address (same on all chains)
    address constant DEFAULT_ENTRY_POINT = 0x0000000071727De22E5E9d8BAf0edAc6f37da032;

    // CREATE2 salt — change to redeploy at a different address
    bytes32 constant SALT = bytes32(uint256(0x4d756c746963616c6c5363726970746572)); // "MulticallScripter"

    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        bool deploy7702 = vm.envOr("DEPLOY_7702", false);
        address entryPoint = vm.envOr("ENTRY_POINT", DEFAULT_ENTRY_POINT);

        vm.startBroadcast(deployerKey);

        // Deploy MulticallScripter via CREATE2 for a deterministic address
        MulticallScripter scripter = new MulticallScripter{salt: SALT}();
        console.log("MulticallScripter deployed at:", address(scripter));
        console.log("Chain ID:", block.chainid);

        if (deploy7702) {
            SevenSevenZeroTwoCaller caller = new SevenSevenZeroTwoCaller{salt: SALT}(entryPoint);
            console.log("SevenSevenZeroTwoCaller deployed at:", address(caller));
            console.log("EntryPoint:", entryPoint);
        }

        vm.stopBroadcast();
    }
}
