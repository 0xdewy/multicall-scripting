#!/bin/bash

# simpleValue.sh - Bash script to call the JavaScript binary with test data
# This script simulates what the Solidity FFI test does

# Set the target address (using a valid Ethereum address format)
TARGET_ADDRESS="0xF62849F9A0B5Bf2913b396098F7c7019b51A820a"

# Set the ABI path
ABI_PATH="out/Helpers.sol/SimpleReturn.json"

# Check if bun is available
if ! command -v bun &> /dev/null; then
    echo "Error: bun is not installed or not in PATH"
    exit 1
fi

# Check if the ABI file exists
if [ ! -f "$ABI_PATH" ]; then
    echo "Error: ABI file not found at $ABI_PATH"
    echo "Trying to find it in alternative locations..."
    
    # Try alternative paths
    if [ -f "../$ABI_PATH" ]; then
        ABI_PATH="../$ABI_PATH"
        echo "Found ABI at: $ABI_PATH"
    elif [ -f "../../$ABI_PATH" ]; then
        ABI_PATH="../../$ABI_PATH"
        echo "Found ABI at: $ABI_PATH"
    else
        echo "Error: Could not find ABI file at any of the expected locations"
        exit 1
    fi
fi

# Run the JavaScript file with bun
echo "Running: bun js/test/simpleValue.js \"$TARGET_ADDRESS\" \"$ABI_PATH\""
echo ""

# Execute the command
bun js/test/simpleValue.js "$TARGET_ADDRESS" "$ABI_PATH"

# Capture and display the exit code
EXIT_CODE=$?
echo ""
echo "Exit code: $EXIT_CODE"

exit $EXIT_CODE