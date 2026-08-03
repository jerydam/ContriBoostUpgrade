#!/usr/bin/env bash
# Verifies all four deployed contracts using deployments/<chainid>.json,
# written by script/deploy.s.sol.
#
# Usage:
#   ./script/verify.sh                 # uses CHAIN_ID from .env
#   CHAIN_ID=968 ./script/verify.sh
#
# Required env (via .env or exported):
#   CHAIN_ID            numeric chain id
#   VERIFIER_URL        explorer verification API endpoint
#   VERIFIER            "blockscout", "etherscan" or "sourcify" (default: blockscout)
#   ETHERSCAN_API_KEY   API key (any non-empty value for blockscout)
set -euo pipefail

cd "$(dirname "$0")/.."
[ -f .env ] && set -a && . ./.env && set +a

VERIFIER="${VERIFIER:-blockscout}"
ETHERSCAN_API_KEY="${ETHERSCAN_API_KEY:-none}"
: "${CHAIN_ID:?set CHAIN_ID}"
: "${VERIFIER_URL:?set VERIFIER_URL}"

FILE="deployments/${CHAIN_ID}.json"
[ -f "$FILE" ] || { echo "missing $FILE - run the deploy script first"; exit 1; }

read_field() { jq -r ".$1" "$FILE"; }

verify() { # <address> <src:Contract> [encoded-constructor-args]
  local addr="$1" target="$2" args="${3:-}"
  if [ -z "$addr" ] || [ "$addr" = "null" ]; then
    echo "==> skipping $target (not in $FILE)"
    return
  fi
  echo "==> $target @ $addr"
  forge verify-contract "$addr" "$target" \
    --chain-id "$CHAIN_ID" \
    --verifier "$VERIFIER" \
    --verifier-url "$VERIFIER_URL" \
    --etherscan-api-key "$ETHERSCAN_API_KEY" \
    ${args:+--constructor-args "$args"} \
    --watch || echo "!! verification failed for $target"
}

verify "$(read_field NestoraFactory)" "src/NestoraFactory.sol:NestoraFactory"
verify "$(read_field SavingsFactory)" "src/savingsFactory.sol:SavingsFactory"
verify "$(read_field Nestora)"        "src/Nestora.sol:Nestora"          "$(read_field NestoraConstructorArgs)"
verify "$(read_field Savings)"        "src/savings.sol:Savings"          "$(read_field SavingsConstructorArgs)"
verify "$(read_field BillPayment)"    "src/billPayment.sol:BillPayment"  "$(read_field BillPaymentConstructorArgs)"

echo "Done."
