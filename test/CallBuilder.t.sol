// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.28;

import {Test, console} from "forge-std/Test.sol";
import {Math} from "./helpers/Math.sol";
import {CallBuilder, Scripter, VarLib} from "src/CallBuilder.sol";
import {MulticallScripter} from "src/MulticallScripter.sol";
import {IERC20} from "forge-std/interfaces/IERC20.sol";

interface IUniswapV2Router {
    function swapExactETHForTokens(
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external payable returns (uint256[] memory amounts);
}

interface ILendingPool {
    function deposit(address asset, uint256 amount, address onBehalfOf, uint16 referralCode) external;
}

contract MulticallScriptTest is Test, CallBuilder, MulticallScripter {
    using VarLib for VarLib.Var;

    MulticallScripter multicall;
    Scripter scripter;
    Math math;

    address constant UNISWAP_V2_ROUTER = 0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D;
    address constant WETH = 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2;
    address constant DAI = 0x6B175474E89094C44Da98b954EedeAC495271d0F;
    address constant AAVE_LENDING_POOL = 0x7d2768dE32b0b80b7a3454c06BdAc94A69DDc7A9;

    uint256 constant ETH_AMOUNT = 1 ether;
    uint256 constant MIN_AMOUNT_OUT = 100e18;
    uint256 constant DEADLINE = 2e9;

    function setUp() public {
        vm.createSelectFork(vm.envString("ETH_RPC_URL"), 18_000_000);
        multicall = new MulticallScripter();
        scripter = new Scripter();
        math = new Math();
        vm.deal(address(this), ETH_AMOUNT);
    }

    function test_simple_usage() public {
        uint256 call1 = scripter.call_static(address(math), abi.encodeWithSelector(math.add.selector, 2, 2));
        uint256 call2 = scripter.call_static(address(math), abi.encodeWithSelector(math.add.selector, 2, 0));
        scripter.replaceVar(VarLib.second_parameter_single(call2), VarLib.single(call1));
        uint256 call3 = scripter.call(address(math), abi.encodeWithSelector(math.setNum.selector, 0), 0);
        scripter.replaceVar(VarLib.single(call3), VarLib.single(call2));

        (address[] memory targets, uint256[] memory offsets, bytes[] memory calldatas, uint256[] memory values) =
            scripter.build();
        multicall.execute(targets, offsets, calldatas, values);
        assertEq(math.number(), 6);
    }

    function test_swap_and_deposit() public {
        address[] memory path = new address[](2);
        path[0] = WETH;
        path[1] = DAI;

        bytes memory swapCalldata = abi.encodeWithSelector(
            IUniswapV2Router.swapExactETHForTokens.selector,
            MIN_AMOUNT_OUT,
            path,
            address(this),
            block.timestamp + DEADLINE
        );
        uint256 swapCall = scripter.call(UNISWAP_V2_ROUTER, swapCalldata, ETH_AMOUNT);

        // Corrected: Call newVar directly and chain builder methods
        VarLib.Var memory swapOutput = VarLib.newVar(swapCall).withStart(0x40).withLength(0x20);

        bytes memory approveCalldata = abi.encodeWithSelector(IERC20.approve.selector, AAVE_LENDING_POOL, type(uint256).max);
        uint256 approveCall = scripter.call(DAI, approveCalldata, 0);

        bytes memory depositCalldata = abi.encodeWithSelector(
            ILendingPool.deposit.selector,
            DAI,
            0,
            address(this),
            0
        );
        uint256 depositCall = scripter.call(AAVE_LENDING_POOL, depositCalldata, 0);
        scripter.replaceVar(VarLib.second_parameter_single(depositCall), swapOutput);

        (address[] memory targets, uint256[] memory offsets, bytes[] memory calldatas, uint256[] memory values) =
            scripter.build();
        multicall.execute{value: ETH_AMOUNT}(targets, offsets, calldatas, values);

        IERC20 aDai = IERC20(0x028171bCA77440897B824Ca71D1c56caC55b68A3);
        uint256 aDaiBalance = aDai.balanceOf(address(this));
        assertGt(aDaiBalance, 0, "No aDAI received after deposit");
    }

    receive() external payable {}
}
