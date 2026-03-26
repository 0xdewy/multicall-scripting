// Helper functions for DeFi examples

const fs = require('fs');
const path = require('path');

// Get MulticallScripter ABI from build artifacts
function getMulticallScripterABI() {
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

// Analyze return values from transaction trace
function analyzeReturnValues(trace, transaction) {
    if (!trace || !trace.calls) {
        console.log('No trace available for analysis');
        return;
    }

    console.log('\n📊 Transaction Trace Analysis:');
    console.log('='.repeat(50));

    let totalCalls = 0;
    let ourCalls = 0;
    
    // Helper function to decode hex to decimal
    const hexToDecimal = (hex) => {
        try {
            return BigInt(hex).toString();
        } catch {
            return hex;
        }
    };
    
    // Helper function to decode address
    const hexToAddress = (hex) => {
        if (hex.length === 66) { // 32 bytes with 0x prefix
            return '0x' + hex.substring(26); // Last 20 bytes
        }
        return hex;
    };
    
    const analyzeCalls = (calls, depth = 0) => {
        if (!calls || !Array.isArray(calls)) return;

        for (const call of calls) {
            totalCalls++;
            const indent = '  '.repeat(depth);
            
            if (call.type === 'CALL' || call.type === 'STATICCALL' || call.type === 'DELEGATECALL') {
                // Check if this is one of our transaction calls
                let isOurCall = false;
                let callIndex = -1;
                
                if (transaction && transaction.targets) {
                    callIndex = transaction.targets.findIndex(target =>
                        target.toLowerCase() === call.to.toLowerCase()
                    );
                    isOurCall = callIndex !== -1;
                }

                if (isOurCall) {
                    ourCalls++;
                    console.log(`${indent}Our Call #${callIndex + 1}: ${call.to}`);
                    
                    // Decode function signature and arguments
                    if (call.input && call.input.startsWith('0x')) {
                        const functionSig = call.input.substring(0, 10);
                        const calldata = call.input.substring(10);
                        
                        if (functionSig === '0xd0e30db0') {
                            console.log(`${indent}  Function: WETH.deposit()`);
                            // No arguments for deposit()
                            
                        } else if (functionSig === '0x095ea7b3') {
                            console.log(`${indent}  Function: ERC20.approve()`);
                            // approve(spender, amount)
                            if (calldata.length >= 128) {
                                const spender = hexToAddress('0x' + calldata.substring(0, 64));
                                const amount = hexToDecimal('0x' + calldata.substring(64, 128));
                                console.log(`${indent}  Spender: ${spender}`);
                                console.log(`${indent}  Amount: ${amount}`);
                            }
                            
                        } else if (functionSig === '0x38ed1739') {
                            console.log(`${indent}  Function: Uniswap.swapExactTokensForTokens()`);
                            // swapExactTokensForTokens(amountIn, amountOutMin, path, to, deadline)
                            if (calldata.length >= 320) {
                                const amountIn = hexToDecimal('0x' + calldata.substring(0, 64));
                                const amountOutMin = hexToDecimal('0x' + calldata.substring(64, 128));
                                const pathOffset = parseInt(calldata.substring(128, 192), 16);
                                const to = hexToAddress('0x' + calldata.substring(192, 256));
                                const deadline = hexToDecimal('0x' + calldata.substring(256, 320));
                                
                                console.log(`${indent}  Amount In: ${amountIn}`);
                                console.log(`${indent}  Amount Out Min: ${amountOutMin}`);
                                console.log(`${indent}  To: ${to}`);
                                console.log(`${indent}  Deadline: ${deadline}`);
                                
                                // Decode path array (starts at offset)
                                const pathStart = pathOffset * 2;
                                if (calldata.length >= pathStart + 64) {
                                    const pathLength = parseInt(calldata.substring(pathStart, pathStart + 64), 16);
                                    console.log(`${indent}  Path length: ${pathLength}`);
                                    
                                    for (let i = 0; i < pathLength; i++) {
                                        const addrStart = pathStart + 64 + (i * 64);
                                        if (calldata.length >= addrStart + 64) {
                                            const addr = hexToAddress('0x' + calldata.substring(addrStart, addrStart + 64));
                                            console.log(`${indent}  Path[${i}]: ${addr}`);
                                        }
                                    }
                                }
                            }
                            
                        } else if (functionSig === '0x70a08231') {
                            console.log(`${indent}  Function: ERC20.balanceOf()`);
                            // balanceOf(account)
                            if (calldata.length >= 64) {
                                const account = hexToAddress('0x' + calldata.substring(0, 64));
                                console.log(`${indent}  Account: ${account}`);
                            }
                            
                        } else if (functionSig === '0x3df02124') {
                            console.log(`${indent}  Function: Curve.exchange()`);
                            // exchange(i, j, dx, min_dy)
                            if (calldata.length >= 256) {
                                // int128 i (signed 128-bit integer)
                                const iHex = calldata.substring(0, 64);
                                const i = BigInt('0x' + iHex);
                                // Convert from two's complement if negative
                                const iValue = (i & (1n << 127n)) ? -(~i + 1n) : i;
                                
                                // int128 j (signed 128-bit integer)
                                const jHex = calldata.substring(64, 128);
                                const j = BigInt('0x' + jHex);
                                const jValue = (j & (1n << 127n)) ? -(~j + 1n) : j;
                                
                                const dx = hexToDecimal('0x' + calldata.substring(128, 192));
                                const minDy = hexToDecimal('0x' + calldata.substring(192, 256));
                                
                                console.log(`${indent}  i (input token): ${iValue}`);
                                console.log(`${indent}  j (output token): ${jValue}`);
                                console.log(`${indent}  dx (amount in): ${dx}`);
                                console.log(`${indent}  min_dy (min amount out): ${minDy}`);
                                
                                // Map token indices to names for Curve 3pool
                                const tokenNames = ['DAI', 'USDC', 'USDT'];
                                const inputToken = iValue >= 0 && iValue < 3 ? tokenNames[Number(iValue)] : `Token ${iValue}`;
                                const outputToken = jValue >= 0 && jValue < 3 ? tokenNames[Number(jValue)] : `Token ${jValue}`;
                                console.log(`${indent}  Exchange: ${inputToken} → ${outputToken}`);
                            }
                            
                        } else if (functionSig === '0xa9059cbb') {
                            console.log(`${indent}  Function: ERC20.transfer()`);
                            // transfer(recipient, amount)
                            if (calldata.length >= 128) {
                                const recipient = hexToAddress('0x' + calldata.substring(0, 64));
                                const amount = hexToDecimal('0x' + calldata.substring(64, 128));
                                console.log(`${indent}  Recipient: ${recipient}`);
                                console.log(`${indent}  Amount: ${amount}`);
                            }
                        } else {
                            console.log(`${indent}  Unknown function: ${functionSig}`);
                        }
                    }

                    // Show gas usage
                    if (call.gasUsed) {
                        console.log(`${indent}  Gas used: ${parseInt(call.gasUsed, 16)}`);
                    }

                    // Show error if any
                    if (call.error) {
                        console.log(`${indent}  ❌ Error: ${call.error}`);
                    }

                    // Show return value
                    if (call.output && call.output !== '0x') {
                        if (call.output.length >= 66) {
                            const returnValue = BigInt(call.output);
                            console.log(`${indent}  Return value: ${returnValue.toString()}`);
                        } else {
                            console.log(`${indent}  Return data: ${call.output}`);
                        }
                    }
                    
                    console.log(); // Blank line for readability
                }
            }

            // Recursively analyze nested calls
            if (call.calls && call.calls.length > 0) {
                analyzeCalls(call.calls, depth + 1);
            }
        }
    };

    analyzeCalls([trace]);
    
    console.log('='.repeat(50));
    console.log(`Total calls in trace: ${totalCalls}`);
    console.log(`Our contract calls: ${ourCalls}`);
    console.log('='.repeat(50));
}

// Get transaction trace for debugging
async function getTransactionTrace(publicClient, transactionHash) {
    try {
        console.log('\n🔍 Getting transaction trace...');
        const trace = await publicClient.request({
            method: 'debug_traceTransaction',
            params: [transactionHash, { 
                tracer: 'callTracer',
                timeout: '30s'
            }],
        });
        return trace;
    } catch (traceError) {
        console.log(`Could not get trace: ${traceError.message}`);
        console.log('To enable transaction tracing, run Anvil with --steps-tracing flag');
        return null;
    }
}

// Print transaction receipt
function printReceipt(receipt) {
    console.log('='.repeat(50));
    console.log('📄 TRANSACTION RECEIPT');
    console.log('='.repeat(50));
    console.log(`Block: ${receipt.blockNumber}`);
    console.log(`Gas used: ${receipt.gasUsed}`);
    console.log(`Status: ${receipt.status === 'success' ? '✅ Success' : '❌ Failed'}`);
    console.log(`Hash: ${receipt.transactionHash}`);
    console.log('='.repeat(50));
}

// Print strategy steps
function printStrategy(ethAmount, formatEther) {
    console.log(`Strategy: ${formatEther(ethAmount)} ETH → WETH → DAI → USDC → User`);
    console.log('Steps:');
    console.log(`1. Wrap ${formatEther(ethAmount)} ETH → WETH`);
    console.log(`2. Approve WETH for Uniswap V2`);
    console.log(`3. Swap WETH → DAI on Uniswap V2`);
    console.log(`4. Get DAI balance`);
    console.log(`5. Approve DAI for Curve`);
    console.log(`6. Swap DAI → USDC on Curve 3pool`);
    console.log(`7. Get USDC balance`);
    console.log(`8. Transfer USDC to user`);
}

module.exports = {
    getMulticallScripterABI,
    createContract,
    analyzeReturnValues,
    getTransactionTrace,
    printReceipt,
    printStrategy
};