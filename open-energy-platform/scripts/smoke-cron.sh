#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════════════
# smoke-cron.sh — fire every wrangler.toml cron pattern through the
# admin run-once endpoint and assert each completes without a 500.
#
# Each schedule corresponds to a maintenance job — surveillance scan,
# mark-price VWAP, settlement run, imbalance, anomalies, maturity refresh,
# monthly backup — and a silent failure here means an unattended job
# stopped writing rows. Bug a cron, bug the platform.
#
# Usage:
#   ./scripts/smoke-cron.sh                        # production
#   BASE=http://localhost:8787 ./scripts/smoke-cron.sh
# ════════════════════════════════════════════════════════════════════════

set -u
BASE="${BASE:-https://oe.vantax.co.za}"
EMAIL="${EMAIL:-admin@openenergy.co.za}"
PASSWORD="${PASSWORD:-Demo@2024!}"
PASS=0
FAIL=0
FAILURES=()

# Patterns as declared in wrangler.toml. Names are for human-readable
# output; they map onto cases in runCron() in src/index.ts.
PATTERNS=(
  '*/15 * * * *:every-15-min:surveillance+siem+depth'
  '0 * * * *:hourly:mark_price_vwap'
  '5 0 * * *:daily-0005:cdr_anomaly_scan'
  '10 0 * * *:daily-0010:maturity_refresh'
  '30 0 * * *:daily-0030:settlement_run'
  '45 0 * * *:daily-0045:imbalance_run'
  '0 2 1 * *:monthly-0200:tenant_invoicing'
)

source "$(dirname "$0")/_login.sh"
TOKEN=$(login_or_cached "$EMAIL")
if [ -z "$TOKEN" ]; then echo "❌ Login failed (rate-limited or bad credentials)"; exit 1; fi
echo "✓ Logged in as $EMAIL"
echo

for entry in "${PATTERNS[@]}"; do
  pattern="${entry%%:*}"
  rest="${entry#*:}"
  name="${rest%%:*}"
  desc="${rest#*:}"
  encoded=$(python3 -c "import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1]))" "$pattern")
  # Truncate first + retry 000 (connection failure leaves the body file stale).
  : > /tmp/smoke-cron.out
  for attempt in 1 2 3; do
    code=$(curl -s -o /tmp/smoke-cron.out -w "%{http_code}" \
      -X POST -H "Authorization: Bearer $TOKEN" \
      "$BASE/api/admin/cron/run-once?pattern=$encoded")
    [ "$code" != "000" ] && break
    : > /tmp/smoke-cron.out
    sleep 2
  done
  head=$(head -c 200 /tmp/smoke-cron.out)
  if [[ "$code" =~ ^2 ]]; then
    printf "  ✅  %-22s  [%s]  %s\n" "$pattern" "$name" "$desc"
    PASS=$((PASS+1))
  else
    printf "  ❌  %-22s  [%s]  HTTP %s  %s\n" "$pattern" "$name" "$code" "$head"
    FAIL=$((FAIL+1))
    FAILURES+=("$pattern → $code  $head")
  fi
done

echo
echo "═════════════════════════════════════════════════════════════════"
echo "Result:  ✅ $PASS passed   ❌ $FAIL failed"
if [ "$FAIL" -gt 0 ]; then
  echo
  echo "Failures:"
  for f in "${FAILURES[@]}"; do
    echo "  • $f"
  done
  exit 1
fi
