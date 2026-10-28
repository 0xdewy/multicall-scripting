// Versioned live-query corpus. The manual mainnet-fork job resolves these definitions against
// Enso's current API, then differentially executes every supported response.
export const ETH = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
export const TOKENS = Object.freeze({
    WETH: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
    USDC: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    DAI: "0x6B175474E89094C44Da98b954EedeAC495271d0F",
    USDT: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
    FRAX: "0x853d955aCEf822Db058eb8505911ED77F175b99e",
    yvWETH: "0xa258C4606Ca8206D8aA700cE2143D7db854D168c",
    threeCRV: "0x6c3F90f043a72FA612cbac8115EE7e52BDe6E490",
});

export const LIVE_ENSO_CORPUS = Object.freeze([
    {label: "ETH → USDC", kind: "route", path: [ETH, TOKENS.USDC], required: true},
    {label: "ETH → yvWETH vault", kind: "route", path: [ETH, TOKENS.yvWETH]},
    {label: "ETH → 3CRV LP", kind: "route", path: [ETH, TOKENS.threeCRV]},
    {label: "2-leg ETH → USDC → DAI", kind: "bundle", path: [ETH, TOKENS.USDC, TOKENS.DAI]},
    {label: "4-leg ETH → USDC → DAI → WETH → USDT", kind: "bundle",
        path: [ETH, TOKENS.USDC, TOKENS.DAI, TOKENS.WETH, TOKENS.USDT]},
    {label: "8-leg swap chain", kind: "bundle",
        path: [ETH, TOKENS.USDC, TOKENS.DAI, TOKENS.WETH, TOKENS.USDT, TOKENS.FRAX,
            TOKENS.WETH, TOKENS.DAI, TOKENS.USDC]},
]);
