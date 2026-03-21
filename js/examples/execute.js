#!/usr/bin/env node

/**
 * execute_clean.js - REAL DEFI EXAMPLE WITH CURVE
 * 
 * Real DeFi example that actually executes on mainnet fork:
 * 1. Wrap ETH → WETH
 * 2. Approve WETH for Uniswap
 * 3. Swap WETH → DAI on Uniswap V2
 * 4. Approve DAI for Curve
 * 5. Swap DAI → USDC on Curve 3pool
 * 
 * This demonstrates atomic execution of multiple DeFi steps across protocols.
 * 
 * Run: node js/examples/execute_clean.js
 */

const { TransactionBuilder } = require("../index.js");
const { parseEther, formatEther } = require("viem");
const { createWalletClient, createPublicClient, http } = require("viem");
const { privateKeyToAccount } = require("viem/accounts");
const { startAnvil, stopAnvil } = require("./anvilFork.js");

// Contract addresses (mainnet)
const ADDRESSES = {
    WETH: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
    DAI: "0x6B175474E89094C44Da98b954EedeAC495271d0F",
    USDC: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    UNISWAP_V2_ROUTER: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D",
    CURVE_DAI_USDC_USDT_POOL: "0xbEbc44782C7dB0a1A60Cb6fe97d0b483032FF1C7"
};

// Contract ABIs
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
    }
];

const WETH_ABI = [
    {
        type: "function",
        name: "deposit",
        inputs: [],
        outputs: [],
        stateMutability: "payable"
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

// MulticallScripter ABI (from build artifacts)
function getMulticallScripterABI() {
    const fs = require('fs');
    const path = require('path');
    const abiPath = path.join(__dirname, '../../out/MulticallScripter.sol/MulticallScripter.json');
    const data = JSON.parse(fs.readFileSync(abiPath, 'utf8'));
    return data.abi;
}

// Wagmi-style contract instance
function createContract(client, address, abi) {
    return {
        address,
        abi,
        read: async (functionName, args = [], options = {}) => {
            return await client.readContract({
                address,
                abi,
                functionName,
                args,
                ...options
            });
        },
        write: async (functionName, args = [], options = {}) => {
            return await client.writeContract({
                address,
                abi,
                functionName,
                args,
                ...options
            });
        }
    };
}

async function main() {
    console.log('🚀 Real DeFi Example: ETH → WETH → Uniswap → Curve\n');

    let anvil;

    try {
        // Start Anvil
        anvil = await startAnvil({ port: 8545 });

        // Create clients
        const publicClient = createPublicClient({
            transport: http(`http://localhost:${anvil.port}`)
        });

        const walletClient = createWalletClient({
            transport: http(`http://localhost:${anvil.port}`),
            account: privateKeyToAccount("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80")
        });

        const account = walletClient.account;

        console.log(`👤 Account: ${account.address}`);
        const initialBalance = await publicClient.getBalance({ address: account.address });
        console.log(`💰 Initial ETH balance: ${formatEther(initialBalance)} ETH\n`);

        // 1. Deploy MulticallScripter
        console.log('1. Deploying MulticallScripter...');
        const { execSync } = require('child_process');
        const bytecode = execSync('forge inspect MulticallScripter bytecode', { cwd: process.cwd() }).toString().trim();

        const deployHash = await walletClient.deployContract({
            abi: [{ type: "constructor", inputs: [], stateMutability: "nonpayable" }],
            bytecode,
            account,
        });

        const deployReceipt = await publicClient.waitForTransactionReceipt({ hash: deployHash });
        const multicallAddress = deployReceipt.contractAddress;
        console.log(`   Contract: ${multicallAddress}\n`);

        // Create wagmi-style contract instance
        const multicallScripter = createContract(walletClient, multicallAddress, getMulticallScripterABI());

        // 2. Build DeFi transaction
        console.log('2. Building DeFi transaction...');
        const builder = new TransactionBuilder();

        const initialEth = parseEther("0.01"); // 0.01 ETH

        console.log(`   Strategy: ${formatEther(initialEth)} ETH → WETH → DAI → USDC`);
        console.log('   Steps:');

        // Step 1: Wrap ETH → WETH
        console.log(`   1. Wrap ${formatEther(initialEth)} ETH → WETH`);
        builder.addCall(
            WETH_ABI,
            ADDRESSES.WETH,
            "deposit",
            [],
            initialEth
        );

        // Step 2: Approve WETH for Uniswap swap
        console.log(`   2. Approve WETH for Uniswap`);
        builder.addCall(
            ERC20_ABI,
            ADDRESSES.WETH,
            "approve",
            [ADDRESSES.UNISWAP_V2_ROUTER, initialEth],
            0n
        );

        // Step 3: Swap WETH → DAI on Uniswap V2
        console.log(`   3. Swap WETH → DAI on Uniswap`);
        const swapPath = [ADDRESSES.WETH, ADDRESSES.DAI];
        const deadline = Math.floor(Date.now() / 1000) + 3600;
        const minOut = 0n;

        builder.addCall(
            UNISWAP_V2_ROUTER_ABI,
            ADDRESSES.UNISWAP_V2_ROUTER,
            "swapExactTokensForTokens",
            [initialEth, minOut, swapPath, multicallAddress, deadline],
            0n
        );

        // Step 4: Approve DAI for Curve swap
        console.log(`   4. Approve DAI for Curve swap`);
        // Swap 10 DAI (minimum for reasonable rate)
        const daiForCurveSwap = parseEther("10"); // 10 DAI
        builder.addCall(
            ERC20_ABI,
            ADDRESSES.DAI,
            "approve",
            [ADDRESSES.CURVE_DAI_USDC_USDT_POOL, daiForCurveSwap],
            0n
        );

        // Step 5: Swap DAI → USDC on Curve 3pool
        console.log(`   5. Swap ${formatEther(daiForCurveSwap)} DAI → USDC on Curve`);
        const curveMinOut = 0n;
        const usdcOut = builder.addCall(
            CURVE_POOL_ABI,
            ADDRESSES.CURVE_DAI_USDC_USDT_POOL,
            "exchange",
            [0, 1, daiForCurveSwap, curveMinOut],
            0n
        );

        const transaction = builder.build();
        console.log(`\n✅ Strategy built with ${transaction.targets.length} calls\n`);

        // 3. Execute the atomic transaction
        console.log('3. Executing atomic transaction...');

        const executeHash = await multicallScripter.write(
            'execute',
            [
                transaction.targets,
                transaction.offsets,
                transaction.calldatas,
                transaction.msgValues.map(v => BigInt(v))
            ],
            {
                account,
                value: initialEth
            }
        );

        console.log(`   Transaction hash: ${executeHash}\n`);

        // 4. Get receipt
        console.log('4. Getting receipt...');
        const receipt = await publicClient.waitForTransactionReceipt({ hash: executeHash });

        console.log('='.repeat(70));
        console.log('📄 DEFI TRANSACTION RECEIPT');
        console.log('='.repeat(70));
        console.log(`Block: ${receipt.blockNumber}`);
        console.log(`Gas used: ${receipt.gasUsed}`);
        console.log(`Status: ${receipt.status === 'success' ? '✅ Success' : '❌ Failed'}`);
        console.log(`Hash: ${receipt.transactionHash}`);
        console.log('='.repeat(70));

        // 5. Verify results
        console.log('\n5. Verifying results...');

        // Create contract instances for reading
        const wethContract = createContract(publicClient, ADDRESSES.WETH, ERC20_ABI);
        const daiContract = createContract(publicClient, ADDRESSES.DAI, ERC20_ABI);
        const usdcContract = createContract(publicClient, ADDRESSES.USDC, ERC20_ABI);

        // Check user balances
        const finalBalance = await publicClient.getBalance({ address: account.address });
        const userWethBalance = await wethContract.read('balanceOf', [account.address]);
        const userDaiBalance = await daiContract.read('balanceOf', [account.address]);
        const userUsdcBalance = await usdcContract.read('balanceOf', [account.address]);

        // Check contract balances (where tokens actually end up)
        const contractWethBalance = await wethContract.read('balanceOf', [multicallAddress]);
        const contractDaiBalance = await daiContract.read('balanceOf', [multicallAddress]);
        const contractUsdcBalance = await usdcContract.read('balanceOf', [multicallAddress]);

        console.log(`   Final ETH balance: ${formatEther(finalBalance)}`);
        console.log(`   ETH used: ${formatEther(initialBalance - finalBalance)}`);

        console.log('\n   User Account Balances:');
        console.log(`     • WETH: ${formatEther(userWethBalance)}`);
        console.log(`     • DAI: ${formatEther(userDaiBalance)}`);
        console.log(`     • USDC: ${userUsdcBalance / 10n ** 6n} USDC`);

        console.log('\n   MulticallScripter Contract Balances:');
        console.log(`     • WETH: ${formatEther(contractWethBalance)}`);
        console.log(`     • DAI: ${formatEther(contractDaiBalance)}`);
        console.log(`     • USDC: ${contractUsdcBalance / 10n ** 6n} USDC`);

        console.log('\n' + '='.repeat(70));
        if (receipt.status === 'success') {
            console.log('🎯 SUCCESS! Real DeFi example executed atomically.');
            console.log(`   Executed ${transaction.targets.length} DeFi steps`);
            console.log(`   Wrapped ${formatEther(initialEth)} ETH → WETH`);
            console.log(`   Approved WETH for Uniswap`);
            console.log(`   Swapped WETH → DAI on Uniswap V2`);
            console.log(`   Approved DAI for Curve`);
            console.log(`   Swapped ${formatEther(daiForCurveSwap)} DAI → USDC on Curve 3pool`);
            console.log(`   Generated ${contractUsdcBalance / 10n ** 6n} USDC in contract`);
            console.log(`   Gas used: ${receipt.gasUsed}`);
            console.log('\n💡 Real DeFi example executed!');
            console.log('   • ETH → WETH wrap');
            console.log('   • WETH approval for Uniswap');
            console.log('   • WETH → DAI swap on Uniswap V2');
            console.log('   • DAI approval for Curve');
            console.log('   • DAI → USDC swap on Curve 3pool');
            console.log('   • All steps executed atomically in one transaction');
            console.log('\n📝 Note: USDC is in the MulticallScripter contract.');
            console.log('   Add a transfer call to send USDC to user account.');
        } else {
            console.log('❌ Transaction failed');
            console.log('\n🔍 Possible issues:');
            console.log('   • Curve pool may have insufficient liquidity on fork');
            console.log('   • Minimum swap amount not met');
            console.log('   • Try with even smaller amounts');
        }
        console.log('='.repeat(70));

        return {
            success: receipt.status === 'success',
            receipt,
            wethBalance: formatEther(userWethBalance),
            daiBalance: formatEther(userDaiBalance),
            usdcBalance: userUsdcBalance / 10n ** 6n
        };

    } catch (error) {
        console.error('\n❌ Error:', error.message);
        if (error.details) console.error('Details:', error.details);

        console.log('\n💡 Debug tips:');
        console.log('   1. Try with smaller amounts');
        console.log('   2. Check if Curve pool has liquidity on fork');
        console.log('   3. Verify all contract addresses are correct');

        return { success: false, error: error.message };
    } finally {
        // Clean up
        if (anvil) {
            await stopAnvil(anvil.process);
        }
    }
}

// Run it
if (require.main === module) {
    main().then(result => {
        if (result.success) {
            console.log('\n✅ Real DeFi strategy executed successfully!');
            console.log('   ETH → WETH → Uniswap → Curve executed atomically.');
            process.exit(0);
        } else {
            console.error('\n❌ DeFi strategy failed.');
            process.exit(1);
        }
    });
}

module.exports = { main };
