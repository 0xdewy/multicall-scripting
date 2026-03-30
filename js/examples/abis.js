// Contract ABIs for DeFi examples

const ERC20_ABI = [
    {
        type: "function",
        name: "approve",
        inputs: [
            { name: "spender", type: "address" },
            { name: "amount", type: "uint256" }
        ],
        outputs: [{ name: "", type: "bool" }],
        stateMutability: "nonpayable"
    },
    {
        type: "function",
        name: "balanceOf",
        inputs: [{ name: "account", type: "address" }],
        outputs: [{ name: "", type: "uint256" }],
        stateMutability: "view"
    },
    {
        type: "function",
        name: "transfer",
        inputs: [
            { name: "recipient", type: "address" },
            { name: "amount", type: "uint256" }
        ],
        outputs: [{ name: "", type: "bool" }],
        stateMutability: "nonpayable"
    },
    {
        type: "function",
        name: "allowance",
        inputs: [
            { name: "owner", type: "address" },
            { name: "spender", type: "address" }
        ],
        outputs: [{ name: "", type: "uint256" }],
        stateMutability: "view"
    }
];

const WETH_ABI = [
    {
        type: "function",
        name: "deposit",
        inputs: [],
        outputs: [],
        stateMutability: "payable"
    },
    {
        type: "function",
        name: "withdraw",
        inputs: [{ name: "amount", type: "uint256" }],
        outputs: [],
        stateMutability: "nonpayable"
    }
];

const UNISWAP_V2_ROUTER_ABI = [
    {
        type: "function",
        name: "swapExactTokensForTokens",
        inputs: [
            { name: "amountIn", type: "uint256" },
            { name: "amountOutMin", type: "uint256" },
            { name: "path", type: "address[]" },
            { name: "to", type: "address" },
            { name: "deadline", type: "uint256" }
        ],
        outputs: [{ name: "amounts", type: "uint256[]" }],
        stateMutability: "nonpayable"
    }
];

const CURVE_POOL_ABI = [
    {
        type: "function",
        name: "exchange",
        inputs: [
            { name: "i", type: "int128" },
            { name: "j", type: "int128" },
            { name: "dx", type: "uint256" },
            { name: "min_dy", type: "uint256" }
        ],
        outputs: [{ name: "", type: "uint256" }],
        stateMutability: "nonpayable"
    }
];

// Lido and wstETH ABIs
const LIDO_ABI = [
    {
        type: "function",
        name: "submit",
        inputs: [{ name: "_referral", type: "address" }],
        outputs: [{ name: "", type: "uint256" }],
        stateMutability: "payable"
    }
];

const WSTETH_ABI = [
    ...ERC20_ABI,
    {
        type: "function",
        name: "wrap",
        inputs: [{ name: "stETHAmount", type: "uint256" }],
        outputs: [{ name: "", type: "uint256" }],
        stateMutability: "nonpayable"
    },
    {
        type: "function",
        name: "unwrap",
        inputs: [{ name: "wstETHAmount", type: "uint256" }],
        outputs: [{ name: "", type: "uint256" }],
        stateMutability: "nonpayable"
    },
    {
        type: "function",
        name: "getWstETHByStETH",
        inputs: [{ name: "stETHAmount", type: "uint256" }],
        outputs: [{ name: "", type: "uint256" }],
        stateMutability: "view"
    },
    {
        type: "function",
        name: "getStETHByWstETH",
        inputs: [{ name: "wstETHAmount", type: "uint256" }],
        outputs: [{ name: "", type: "uint256" }],
        stateMutability: "view"
    }
];

// Aave V3 Pool ABIs
const AAVE_POOL_ABI = [
    {
        type: "function",
        name: "supply",
        inputs: [
            { name: "asset", type: "address" },
            { name: "amount", type: "uint256" },
            { name: "onBehalfOf", type: "address" },
            { name: "referralCode", type: "uint16" }
        ],
        outputs: [],
        stateMutability: "nonpayable"
    },
    {
        type: "function",
        name: "borrow",
        inputs: [
            { name: "asset", type: "address" },
            { name: "amount", type: "uint256" },
            { name: "interestRateMode", type: "uint256" },
            { name: "referralCode", type: "uint16" },
            { name: "onBehalfOf", type: "address" }
        ],
        outputs: [],
        stateMutability: "nonpayable"
    },
    {
        type: "function",
        name: "setUserUseReserveAsCollateral",
        inputs: [
            { name: "asset", type: "address" },
            { name: "useAsCollateral", type: "bool" }
        ],
        outputs: [],
        stateMutability: "nonpayable"
    }
];

// Uniswap V2 Pair ABI
const UNISWAP_V2_PAIR_ABI = [
    {
        type: "function",
        name: "getReserves",
        inputs: [],
        outputs: [
            { name: "reserve0", type: "uint112" },
            { name: "reserve1", type: "uint112" },
            { name: "blockTimestampLast", type: "uint32" }
        ],
        stateMutability: "view"
    },
    {
        type: "function",
        name: "token0",
        inputs: [],
        outputs: [{ name: "", type: "address" }],
        stateMutability: "view"
    },
    {
        type: "function",
        name: "token1",
        inputs: [],
        outputs: [{ name: "", type: "address" }],
        stateMutability: "view"
    },
    {
        type: "function",
        name: "swap",
        inputs: [
            { name: "amount0Out", type: "uint256" },
            { name: "amount1Out", type: "uint256" },
            { name: "to", type: "address" },
            { name: "data", type: "bytes" }
        ],
        outputs: [],
        stateMutability: "nonpayable"
    }
];

// Struct Test ABI for advanced struct handling (from Structs contract in Helpers.sol)
const STRUCT_TEST_ABI = [
    {
        type: "function",
        name: "getComplexStruct",
        inputs: [],
        outputs: [
            {
                name: "s",
                type: "tuple",
                components: [
                    { name: "a", type: "uint256" },
                    { 
                        name: "nested", 
                        type: "tuple",
                        components: [
                            { name: "nA", type: "uint256" },
                            { name: "nB", type: "uint256" }
                        ]
                    }
                ]
            }
        ],
        stateMutability: "view"
    },
    {
        type: "function",
        name: "getConstantStruct",
        inputs: [],
        outputs: [
            {
                name: "s",
                type: "tuple",
                components: [
                    { name: "a", type: "uint256" },
                    { 
                        name: "nested", 
                        type: "tuple",
                        components: [
                            { name: "nA", type: "uint256" },
                            { name: "nB", type: "uint256" }
                        ]
                    }
                ]
            }
        ],
        stateMutability: "pure"
    },
    {
        type: "function",
        name: "setComplexStruct",
        inputs: [
            {
                name: "s",
                type: "tuple",
                components: [
                    { name: "a", type: "uint256" },
                    { 
                        name: "nested", 
                        type: "tuple",
                        components: [
                            { name: "nA", type: "uint256" },
                            { name: "nB", type: "uint256" }
                        ]
                    }
                ]
            }
        ],
        outputs: [],
        stateMutability: "nonpayable"
    }
];

// Contract addresses (mainnet)
const ADDRESSES = {
    WETH: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
    DAI: "0x6B175474E89094C44Da98b954EedeAC495271d0F",
    USDC: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    UNISWAP_V2_ROUTER: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D",
    CURVE_DAI_USDC_USDT_POOL: "0xbEbc44782C7dB0a1A60Cb6fe97d0b483032FF1C7",
    // Lido
    WSTETH: "0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0",
    STETH: "0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84",
    LIDO: "0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84",
    // Aave V3
    AAVE_POOL: "0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2",
    AAVE_WETH: "0x4d5F47FA6A74757f35C14fD3a6Ef8E3C9BC514E8", // aWETH
    AAVE_WSTETH: "0x0B925eD163218f6662a35e0f0371Ac234f9E9371" // aWSTETH
};

module.exports = {
    ERC20_ABI,
    WETH_ABI,
    UNISWAP_V2_ROUTER_ABI,
    UNISWAP_V2_PAIR_ABI,
    CURVE_POOL_ABI,
    LIDO_ABI,
    WSTETH_ABI,
    AAVE_POOL_ABI,
    STRUCT_TEST_ABI,
    ADDRESSES
};