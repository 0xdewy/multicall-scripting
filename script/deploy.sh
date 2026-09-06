#!/usr/bin/env bash
set -euo pipefail

# One endpoint per invocation. Dry-run unless --broadcast is explicitly passed to forge.
# Example: script/deploy.sh http://127.0.0.1:8545 --sender ADDRESS --unlocked --broadcast
if [[ $# -lt 1 ]]; then
  echo 'Usage: script/deploy.sh RPC_URL [forge wallet/broadcast/verification options]' >&2
  exit 2
fi
DEPLOY_RPC=$1
shift
ROOT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
cd "$ROOT_DIR"
DEPLOY_CHAIN=$(cast chain-id --rpc-url "$DEPLOY_RPC")
case "$DEPLOY_CHAIN" in
  1|31337) ;;
  *) echo "Expected Ethereum (1) or local fork (31337), got $DEPLOY_CHAIN" >&2; exit 1 ;;
esac
exec forge script script/Deploy.s.sol:Deploy --rpc-url "$DEPLOY_RPC" "$@"
