// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.28;

interface IMulticall3 {
    struct Call3Value {
        address target;
        bool allowFailure;
        uint256 value;
        bytes callData;
    }

    struct Result {
        bool success;
        bytes returnData;
    }

    function aggregate3Value(Call3Value[] calldata calls) external payable returns (Result[] memory returnData);
}

interface IUniswapV2Pair {
    function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast);
    function token0() external view returns (address);
    function token1() external view returns (address);
    function swap(uint256 amount0Out, uint256 amount1Out, address to, bytes calldata data) external;
}

contract UniV2 {
    address public constant FACTORY = 0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f;

    function getPair(address token0, address token1) public pure returns (address) {
        return address(
            uint160(
                uint256(
                    keccak256(
                        abi.encodePacked(
                            hex"ff",
                            FACTORY,
                            keccak256(
                                abi.encodePacked(token0 < token1 ? token0 : token1, token0 < token1 ? token1 : token0)
                            ),
                            hex"96e8ac4277198ff8b6f785478aa9a39f403cb768dd02cbee326c3e7da348845f"
                        )
                    )
                )
            )
        );
    }

    function getAmountOut(address v2Pair, uint256 amountIn, address tokenIn, address tokenOut)
        public
        view
        returns (uint256 amountOut)
    {
        require(amountIn > 0, "Amount in must be > 0");
        (uint256 reserveIn, uint256 reserveOut,) = IUniswapV2Pair(v2Pair).getReserves();
        (reserveIn, reserveOut) = tokenIn < tokenOut ? (reserveIn, reserveOut) : (reserveOut, reserveIn);
        require(reserveIn > 0 && reserveOut > 0, "Insufficient liquidity");
        uint256 amountInWithFee = amountIn * 997;
        uint256 numerator = amountInWithFee * reserveOut;
        uint256 denominator = reserveIn * 1000 + amountInWithFee;
        amountOut = numerator / denominator;
    }
}
