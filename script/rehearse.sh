#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
cd "$ROOT_DIR"
FORK_UPSTREAM=${ETH_RPC_URL:-https://ethereum-rpc.publicnode.com}
# Ask the OS for a free port by default; validate explicit ports before starting Anvil.
FORK_PORT=$(bun -e '
  import { createServer } from "node:net";
  const port = process.argv[1];
  if (!/^\d+$/.test(port) || Number(port) > 65535) {
    console.error("FORK_PORT must be an integer from 0 to 65535 (0 selects a free port).");
    process.exit(1);
  }
  const server = createServer();
  server.on("error", error => {
    console.error(`Cannot bind FORK_PORT=${port}: ${error.code}. Unset FORK_PORT to select a free port.`);
    process.exitCode = 1;
  });
  server.listen({ host: "127.0.0.1", port: Number(port), exclusive: true }, () => {
    // Machine-readable output: console.log(number) adds ANSI escapes with FORCE_COLOR.
    process.stdout.write(String(server.address().port));
    server.close();
  });
' "${FORK_PORT:-0}")
FORK_BLOCK=${FORK_BLOCK:-$(cast block-number --rpc-url "$FORK_UPSTREAM")}
FORK_LOCAL="http://127.0.0.1:$FORK_PORT"
FORK_SENDER=0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
FORK_LOG=$(mktemp /tmp/multicall-anvil.XXXXXX.log)
anvil --fork-url "$FORK_UPSTREAM" --fork-block-number "$FORK_BLOCK" \
  --timeout 15000 --retries 2 \
  --chain-id 31337 --host 127.0.0.1 --port "$FORK_PORT" --silent >"$FORK_LOG" 2>&1 &
FORK_PID=$!
trap 'kill "$FORK_PID" 2>/dev/null || true; wait "$FORK_PID" 2>/dev/null || true' EXIT
FORK_READY=false
for ((attempt=0; attempt<60; attempt++)); do
  if ! kill -0 "$FORK_PID" 2>/dev/null; then
    echo "Anvil exited; startup diagnostics ($FORK_LOG):" >&2
    tail -n 20 "$FORK_LOG" >&2
    exit 1
  fi
  if cast chain-id --rpc-url "$FORK_LOCAL" --rpc-timeout 1 >/dev/null 2>&1; then FORK_READY=true; break; fi
  sleep 1
done
if [[ "$FORK_READY" != true ]]; then
  echo "Anvil startup timed out; diagnostics ($FORK_LOG):" >&2
  tail -n 20 "$FORK_LOG" >&2
  exit 1
fi
printf 'Mainnet fork block: %s; local chain: 31337; RPC: %s\n' "$FORK_BLOCK" "$FORK_LOCAL"
# Broadcast only to the Anvil process created above. No mainnet signer or private key is loaded.
echo '[1/5] Deploying and checking release bytecode'
DEPLOY_7702=true script/deploy.sh "$FORK_LOCAL" --rpc-timeout 30 --sender "$FORK_SENDER" --unlocked --broadcast
# Idempotence: the second run must accept the existing exact bytecode and send no deployments.
DEPLOY_7702=true script/deploy.sh "$FORK_LOCAL" --rpc-timeout 30 --sender "$FORK_SENDER" --unlocked --broadcast
echo '[2/5] Running protocol and EIP-7702 rehearsal'
bun js/test/mainnet.js "$FORK_LOCAL"
echo '[3/5] Comparing Enso Weiroll and Scripter on the same command plan'
bun js/test/enso-differential.js "$FORK_LOCAL"
if [[ "${SKIP_ENSO_LIVE:-}" == 1 ]]; then
  echo '[4/5] SKIP Enso live route (SKIP_ENSO_LIVE=1)'
elif [[ -n "${ENSO_API_KEY:-}" ]]; then
  echo '[4/5] Translating live Enso routes and comparing executors'
  bun js/test/enso-mainnet.js "$FORK_LOCAL"
elif [[ -f .env ]]; then
  echo '[4/5] Translating live Enso routes and comparing executors (credentials from .env)'
  bun --env-file=.env js/test/enso-mainnet.js "$FORK_LOCAL"
else
  echo '[4/5] SKIP Enso live route (ENSO_API_KEY is neither exported nor present in .env)'
fi
# Use the upstream directly: nested forking through Anvil can serialize remote storage fetches.
echo '[5/5] Running Solidity fork tests'
ETH_RPC_URL="$FORK_UPSTREAM" FORK_BLOCK="$FORK_BLOCK" forge test --match-contract CallBuilderTest --threads 1 -vv
