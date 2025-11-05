// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.28;

import {Test, console2} from "forge-std/Test.sol";
import {CallBuilder, Scripter, VarLib} from "src/CallBuilder.sol";
import {MulticallScripter} from "src/MulticallScripter.sol";
import {IERC20} from "forge-std/interfaces/IERC20.sol";
import {Math} from "./Helpers.sol";
import {UniV2, IUniswapV2Pair, IMulticall3} from "./Ecosystem.sol";

contract MulticallScriptTest is Test, CallBuilder, MulticallScripter, UniV2 {
    using VarLib for VarLib.Var;
    using VarLib for uint256;

    MulticallScripter multicall;
    Scripter scripter;
    Math math;

    address constant WETH = 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2;
    address constant DAI = 0x6B175474E89094C44Da98b954EedeAC495271d0F;

    uint256 constant ETH_AMT = 1e17;
    uint256 constant ETH_START_BALANCE = 100 ether;

    function setUp() public {
        vm.createSelectFork(vm.envString("ETH_RPC_URL"), 18_000_000);
        multicall = new MulticallScripter();
        scripter = new Scripter();
        math = new Math();
        vm.deal(address(this), ETH_START_BALANCE);
        vm.deal(address(scripter), ETH_START_BALANCE);
    }

    // math.add(2, 2) = <4>  --> math.add(2, <4>) = <6> -->  math.setNum(<6>)
    function test_simple_usage() public {
        uint256 call1 = scripter.call_static(address(math), abi.encodeWithSelector(math.add.selector, 2, 2));
        uint256 call2 = scripter.call_static(address(math), abi.encodeWithSelector(math.add.selector, 2, 0));
        // use first return data from call1 as second param of call2
        scripter.useCallOutput(call1.first(), call2.second());

        // use first return data from call2 as first param of call3
        uint256 call3 = scripter.call(address(math), abi.encodeWithSelector(math.setNum.selector, 0), 0);
        scripter.useCallOutput(call2.first(), call3.first());

        (address[] memory targets, uint256[] memory offsets, bytes[] memory calldatas, uint256[] memory values) =
            scripter.build();

        multicall.execute(targets, offsets, calldatas, values);

        assertEq(math.number(), 6);
    }

    // TODO: test partial return

    // swap on v2 directly, using multicall scripter
    // weth.deposit() -> weth.transfer(univ2, amt) -> univ2.swap();
    function test_mint_weth_and_swap() public {
        address pair = getPair(WETH, DAI);
        uint256 amount_out = getAmountOut(pair, ETH_AMT, WETH, DAI);
        (uint256 amount_0, uint256 amount_1) = WETH > DAI ? (amount_out, uint256(0)) : (uint256(0), amount_out);

        // encode calls
        uint256 mint_weth = scripter.call(WETH, abi.encodeWithSignature("deposit()"), ETH_AMT);
        uint256 transfer_to_pool =
            scripter.call(WETH, abi.encodeWithSignature("transfer(address,uint256)", pair, ETH_AMT), 0);
        uint256 swap = scripter.call(
            pair,
            abi.encodeWithSelector(IUniswapV2Pair.swap.selector, amount_0, amount_1, address(scripter), bytes("")),
            0
        );
        (address[] memory targets, uint256[] memory offsets, bytes[] memory calldatas, uint256[] memory values) =
            scripter.build();

        uint256 gasBefore = gasleft();

        multicall.execute{value: ETH_AMT}(targets, offsets, calldatas, values);

        console2.log("gas used: ", gasBefore - gasleft());
    }

    // weth.deposit() -> weth.transfer(univ2, amt) -> univ2.swap();
    // to compare gas against regular multicall
    function test_mint_weth_and_swap_multicall3() public {
        address pair = getPair(WETH, DAI);
        address multicall3 = 0xcA11bde05977b3631167028862bE2a173976CA11;
        uint256 amount_out = getAmountOut(pair, ETH_AMT, WETH, DAI);

        (uint256 amount_0, uint256 amount_1) = WETH > DAI ? (amount_out, uint256(0)) : (uint256(0), amount_out);

        IMulticall3.Call3Value[] memory calls = new IMulticall3.Call3Value[](3);
        calls[0] = IMulticall3.Call3Value(WETH, false, ETH_AMT, abi.encodeWithSignature("deposit()"));
        calls[1] =
            IMulticall3.Call3Value(WETH, false, 0, abi.encodeWithSignature("transfer(address,uint256)", pair, ETH_AMT));
        calls[2] = IMulticall3.Call3Value(
            pair,
            false,
            0,
            abi.encodeWithSelector(IUniswapV2Pair.swap.selector, amount_0, amount_1, address(this), bytes(""))
        );

        uint256 gasBefore = gasleft();
        IMulticall3(multicall3).aggregate3Value{value: ETH_AMT}(calls);
        console2.log("gas used: ", gasBefore - gasleft());
    }

    receive() external payable {}
}

