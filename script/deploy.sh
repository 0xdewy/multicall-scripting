#!/usr/bin/env bash
set -euo pipefail

# Deploy MulticallScripter to all configured EVM chains.
# Requires a .env file with PRIVATE_KEY and at least one *_RPC_URL set.
# Set DEPLOY_7702=true to also deploy SevenSevenZeroTwoCaller.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

ENV_FILE="$ROOT_DIR/.env"
if [[ -f "$ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  source "$ENV_FILE"
fi

if [[ -z "${PRIVATE_KEY:-}" ]]; then
  echo "Error: PRIVATE_KEY is not set" >&2
  exit 1
fi

# Chain name → RPC URL env var
declare -A CHAINS=(
  ["Ethereum (1)"]="ETH_RPC_URL"
  ["Arbitrum One (42161)"]="ARBITRUM_RPC_URL"
  ["Optimism (10)"]="OPTIMISM_RPC_URL"
  ["Base (8453)"]="BASE_RPC_URL"
  ["Polygon (137)"]="POLYGON_RPC_URL"
  ["Blast (81457)"]="BLAST_RPC_URL"
  ["Linea (59144)"]="LINEA_RPC_URL"
  ["Scroll (534352)"]="SCROLL_RPC_URL"
  ["Zora (7777777)"]="ZORA_RPC_URL"
)

BROADCAST="${BROADCAST:-false}"
DEPLOY_7702="${DEPLOY_7702:-false}"
ENTRY_POINT="${ENTRY_POINT:-0x0000000071727De22E5E9d8BAf0edAc6f37da032}"

echo ""
echo "MulticallScripter deployment"
echo "  Broadcast: $BROADCAST"
echo "  Deploy 7702Caller: $DEPLOY_7702"
echo "  EntryPoint: $ENTRY_POINT"
echo ""

DEPLOYED=()
SKIPPED=()

for CHAIN_NAME in "${!CHAINS[@]}"; do
  RPC_VAR="${CHAINS[$CHAIN_NAME]}"
  RPC_URL="${!RPC_VAR:-}"

  if [[ -z "$RPC_URL" ]]; then
    SKIPPED+=("$CHAIN_NAME (${RPC_VAR} not set)")
    continue
  fi

  echo "Deploying to $CHAIN_NAME ..."

  FORGE_ARGS=(
    forge script script/Deploy.s.sol
    --rpc-url "$RPC_URL"
    --private-key "$PRIVATE_KEY"
  )

  if [[ "$BROADCAST" == "true" ]]; then
    FORGE_ARGS+=(--broadcast --verify)
  fi

  DEPLOY_7702="$DEPLOY_7702" ENTRY_POINT="$ENTRY_POINT" \
    "${FORGE_ARGS[@]}" 2>&1 | grep -E "(deployed at|Chain ID|Error)" || true

  DEPLOYED+=("$CHAIN_NAME")
  echo ""
done

echo "========================================"
echo "Summary"
echo "========================================"

if [[ ${#DEPLOYED[@]} -gt 0 ]]; then
  echo "Deployed to:"
  for C in "${DEPLOYED[@]}"; do echo "  $C"; done
fi

if [[ ${#SKIPPED[@]} -gt 0 ]]; then
  echo "Skipped (no RPC URL):"
  for C in "${SKIPPED[@]}"; do echo "  $C"; done
fi

echo ""
if [[ "$BROADCAST" != "true" ]]; then
  echo "Dry-run complete. Set BROADCAST=true to broadcast transactions."
fi
