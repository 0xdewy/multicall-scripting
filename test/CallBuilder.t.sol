// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.28;

import {Test, console2} from "forge-std/Test.sol";
import {CallBuilder, Scripter, VarLib} from "./CallBuilder.sol";
import {MulticallScripter} from "src/MulticallScripter.sol";
import {IERC20} from "forge-std/interfaces/IERC20.sol";
import {Math, DynamicReturn, SimpleReturn} from "./Helpers.sol";
import {UniV2, IUniswapV2Pair, IMulticall3} from "./Ecosystem.sol";

contract CallBuilderTest is Test, CallBuilder, UniV2 {
    using VarLib for VarLib.Var;
    using VarLib for uint256;

    MulticallScripter multicall;
    Scripter scripter;
    Math math;
    DynamicReturn dynamicReturn;
    SimpleReturn simpleReturn;

    address constant WETH = 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2;
    address constant DAI = 0x6B175474E89094C44Da98b954EedeAC495271d0F;

    uint256 constant ETH_AMT = 1e17;
    uint256 constant ETH_START_BALANCE = 100 ether;

    bool forked;

    receive() external payable {}

    // Fork-dependent tests run only when ETH_RPC_URL is set (they are skipped otherwise).
    function setUp() public {
        string memory rpc = vm.envOr("ETH_RPC_URL", string(""));
        if (bytes(rpc).length > 0) {
            uint256 forkBlock = vm.envOr("FORK_BLOCK", uint256(0));
            if (forkBlock == 0) vm.createSelectFork(rpc);
            else vm.createSelectFork(rpc, forkBlock);
            forked = true;
        }
        multicall = new MulticallScripter();
        scripter = new Scripter();
        math = new Math();
        dynamicReturn = new DynamicReturn();
        simpleReturn = new SimpleReturn();
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

        multicall.execute(targets, offsets, pack(calldatas), values);

        assertEq(math.number(), 6);
    }

    // getTupleConstant() -> (1, 2, 3); use the SECOND element (start=0x20) to set math number
    // This exercises the staticCallPartialReturn path (non-zero returnData.start).
    function test_partial_return_second_var() public {
        uint256 get_call = scripter.call_static(
            address(dynamicReturn), abi.encodeWithSelector(DynamicReturn.getTupleConstant.selector)
        );
        uint256 set_call = scripter.call(address(math), abi.encodeWithSelector(Math.setNum.selector, 0), 0);
        // take the second tuple element (offset 0x20) and put it at the first param of setNum
        scripter.useCallOutput(get_call.second(), set_call.first());

        (address[] memory targets, uint256[] memory offsets, bytes[] memory calldatas, uint256[] memory values) =
            scripter.build();
        multicall.execute(targets, offsets, pack(calldatas), values);

        assertEq(math.number(), 2);
    }

    // getTupleConstant() -> (1, 2, 3); use elements 1 and 3 (skip 2) to set a tuple
    // Two non-contiguous vars triggers staticCallPartialReturn with multiple variables.
    function test_partial_return_multiple_vars() public {
        // setTuple(max, max, max)
        scripter.call(
            address(dynamicReturn),
            abi.encodeWithSelector(
                DynamicReturn.setTuple.selector, type(uint256).max, type(uint256).max, type(uint256).max
            ),
            0
        );

        // getTupleConstant() -> (1, 2, 3); select elements at offsets 0 and 0x40
        uint256 get_call = scripter.call_static(
            address(dynamicReturn), abi.encodeWithSelector(DynamicReturn.getTupleConstant.selector)
        );

        // setTuple(0, max, 0) — placeholders for elements 1 and 3
        uint256 set_call = scripter.call(
            address(dynamicReturn),
            abi.encodeWithSelector(DynamicReturn.setTuple.selector, uint256(0), type(uint256).max, uint256(0)),
            0
        );

        scripter.useCallOutput(get_call.first(), set_call.first()); // element 1 -> param 1
        scripter.useCallOutput(get_call.third(), set_call.third()); // element 3 -> param 3

        (address[] memory targets, uint256[] memory offsets, bytes[] memory calldatas, uint256[] memory values) =
            scripter.build();
        multicall.execute(targets, offsets, pack(calldatas), values);

        (uint256 a, uint256 b, uint256 c) = dynamicReturn.tuple();
        assertEq(a, 1);
        assertEq(b, type(uint256).max);
        assertEq(c, 3);
    }

    // simpleReturn.setUint(42) → returns 42 (state-changing, 0xFB path) → math.setNum(<42>)
    function test_state_changing_partial_return() public {
        uint256 set_call =
            scripter.call(address(simpleReturn), abi.encodeWithSelector(SimpleReturn.setUint.selector, uint256(42)), 0);
        uint256 use_call = scripter.call(address(math), abi.encodeWithSelector(Math.setNum.selector, uint256(0)), 0);
        scripter.useCallOutput(set_call.first(), use_call.first());

        (address[] memory targets, uint256[] memory offsets, bytes[] memory calldatas, uint256[] memory values) =
            scripter.build();
        multicall.execute(targets, offsets, pack(calldatas), values);

        assertEq(math.number(), 42);
    }

    // swap on v2 directly, using multicall scripter
    // weth.deposit() -> weth.transfer(univ2, amt) -> univ2.swap();
    function test_mint_weth_and_swap() public {
        vm.skip(!forked);
        address pair = getPair(WETH, DAI);
        uint256 amount_out = getAmountOut(pair, ETH_AMT, WETH, DAI);
        (uint256 amount_0, uint256 amount_1) = WETH > DAI ? (amount_out, uint256(0)) : (uint256(0), amount_out);

        // encode calls
        scripter.call(WETH, abi.encodeWithSignature("deposit()"), ETH_AMT);
        scripter.call(WETH, abi.encodeWithSignature("transfer(address,uint256)", pair, ETH_AMT), 0);
        scripter.call(
            pair, abi.encodeWithSelector(IUniswapV2Pair.swap.selector, amount_0, amount_1, address(this), bytes("")), 0
        );
        (address[] memory targets, uint256[] memory offsets, bytes[] memory calldatas, uint256[] memory values) =
            scripter.build();

        // The deterministic test address already has ETH on mainnet. This batch must not
        // retain any new ETH; pre-existing funds are outside the msg.value refund accounting.
        uint256 executorEthBefore = address(multicall).balance;
        uint256 daiBefore = IERC20(DAI).balanceOf(address(this));
        uint256 gasBefore = gasleft();

        multicall.execute{value: ETH_AMT}(targets, offsets, pack(calldatas), values);

        console2.log("gas used: ", gasBefore - gasleft());
        assertEq(IERC20(DAI).balanceOf(address(this)) - daiBefore, amount_out);
        assertEq(IERC20(WETH).balanceOf(address(multicall)), 0);
        assertEq(IERC20(DAI).balanceOf(address(multicall)), 0);
        assertEq(address(multicall).balance, executorEthBefore);
    }

    // weth.deposit() -> weth.transfer(univ2, amt) -> univ2.swap();
    // to compare gas against regular multicall
    function test_mint_weth_and_swap_multicall3() public {
        vm.skip(!forked);
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

        uint256 daiBefore = IERC20(DAI).balanceOf(address(this));
        uint256 gasBefore = gasleft();
        IMulticall3(multicall3).aggregate3Value{value: ETH_AMT}(calls);
        console2.log("gas used: ", gasBefore - gasleft());
        assertEq(IERC20(DAI).balanceOf(address(this)) - daiBefore, amount_out);
        assertEq(IERC20(WETH).balanceOf(multicall3), 0);
    }
}

