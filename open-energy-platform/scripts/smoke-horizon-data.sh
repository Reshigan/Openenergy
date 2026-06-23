#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════════════
# Per-role Horizon data-presence smoke.
#
# The single most finite "does the user see anything when they log in"
# assertion: for every persona, GET /api/horizon/:role and FAIL when the
# workspace lands empty (data.counts.total == 0). A green run proves every
# role has live, non-terminal chain cases to act on at login — the
# "make sure we have data on horizon for all roles" guarantee.
#
# Uses the shared token cache so the whole loop fits one rate-limit window.
# Runs against BASE (demo by default). Point BASE at live to verify the
# four live participants:
#   BASE=https://cec.vantax.co.za PASSWORD=... scripts/smoke-horizon-data.sh
# ════════════════════════════════════════════════════════════════════════
set -u
BASE="${BASE:-https://oe.vantax.co.za}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=_login.sh
source "$SCRIPT_DIR/_login.sh"

# email:role pairs — role must match the JWT role the login mints, since
# /api/horizon/:role 403s unless caller role == :role (or admin).
PERSONA_PAIRS=(
  "trader@openenergy.co.za:trader"
  "ipp@openenergy.co.za:ipp_developer"
  "offtaker@openenergy.co.za:offtaker"
  "lender@openenergy.co.za:lender"
  "carbon@openenergy.co.za:carbon_fund"
  "grid@openenergy.co.za:grid_operator"
  "regulator@openenergy.co.za:regulator"
  "support@openenergy.co.za:support"
)

PASS=0; FAIL=0; FAILED=()

for pair in "${PERSONA_PAIRS[@]}"; do
  email="${pair%%:*}"; role="${pair##*:}"
  token=$(login_or_cached "$email") || { FAIL=$((FAIL+1)); FAILED+=("$role login"); printf '  \033[31m❌\033[0m %-14s login failed\n' "$role"; continue; }
  total=$(curl -s -H "Authorization: Bearer $token" "$BASE/api/horizon/$role" \
    | python3 -c "import sys,json
try:
  d=json.load(sys.stdin); print(d.get('data',{}).get('counts',{}).get('total',0))
except Exception: print(0)" 2>/dev/null)
  if [ "${total:-0}" -gt 0 ] 2>/dev/null; then
    PASS=$((PASS+1)); printf '  \033[32m✅\033[0m %-14s %s live cases\n' "$role" "$total"
  else
    FAIL=$((FAIL+1)); FAILED+=("$role empty"); printf '  \033[31m❌\033[0m %-14s EMPTY workspace\n' "$role"
  fi
done

printf '\n  %d pass · %d fail\n' "$PASS" "$FAIL"
if [ "$FAIL" -gt 0 ]; then printf '  failed: %s\n' "${FAILED[*]}"; exit 1; fi
