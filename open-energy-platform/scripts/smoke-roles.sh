#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════════════
# smoke-roles.sh — log in as each of the 9 demo personas, run a positive
# call (their own data should return 2xx) and a representative read on a
# few endpoints to confirm role-scoped access works for every persona.
#
# Catches:
#   • A persona's account being broken
#   • A role unable to list their own role-completion endpoints
#   • Tenant_id failing to resolve for any participant
#
# Usage:
#   ./scripts/smoke-roles.sh                        # production
#   BASE=http://localhost:8787 ./scripts/smoke-roles.sh
# ════════════════════════════════════════════════════════════════════════

set -u
BASE="${BASE:-https://oe.vantax.co.za}"
PASSWORD="${PASSWORD:-Demo@2024!}"
PASS=0
FAIL=0
FAILURES=()

# Persona email → home endpoints to GET. Each persona should at minimum:
#   - successfully log in
#   - load /api/cockpit
#   - load each of their role-scoped GETs
PERSONAS=(
  "admin@openenergy.co.za:/api/cockpit /api/admin/users /api/admin/tenants"
  "ipp@openenergy.co.za:/api/cockpit /api/roles/ipp/sites /api/roles/ipp/yield-estimates /api/projects"
  "wind@openenergy.co.za:/api/cockpit /api/roles/ipp/sites /api/projects"
  "trader@openenergy.co.za:/api/cockpit /api/roles/trader/risk-limits /api/roles/trader/var /api/trading/orders"
  "carbon@openenergy.co.za:/api/cockpit /api/roles/carbon/lps /api/roles/carbon/nav /api/carbon/credits"
  "offtaker@openenergy.co.za:/api/cockpit /api/roles/offtaker/ppa-portfolio /api/roles/offtaker/scope2"
  "lender@openenergy.co.za:/api/cockpit /api/roles/lender/pipeline /api/roles/lender/credit-risk"
  "grid@openenergy.co.za:/api/cockpit /api/roles/grid/scada /api/roles/grid/dispatch"
  "regulator@openenergy.co.za:/api/cockpit /api/roles/regulator/licence-applications /api/roles/regulator/inspections"
)

source "$(dirname "$0")/_login.sh"

login_as() {
  login_or_cached "$1"
}

# call TOKEN METHOD PATH [EXPECTED_PREFIX]
call() {
  local token="$1" method="$2" path="$3" expect="${4:-2}"
  # Truncate first + retry 000 (connection failure leaves the body file stale).
  : > /tmp/smoke-roles.out
  local code attempt
  for attempt in 1 2 3; do
    code=$(curl -s -o /tmp/smoke-roles.out -w "%{http_code}" \
      -X "$method" -H "Authorization: Bearer $token" "$BASE$path")
    [ "$code" != "000" ] && break
    : > /tmp/smoke-roles.out
    sleep 2
  done
  local head; head=$(head -c 140 /tmp/smoke-roles.out)
  if [[ "$code" =~ ^$expect ]]; then
    printf "      ✅  %-6s %-50s  HTTP %s\n" "$method" "$path" "$code"
    PASS=$((PASS+1))
  else
    printf "      ❌  %-6s %-50s  HTTP %s  %s\n" "$method" "$path" "$code" "$head"
    FAIL=$((FAIL+1))
    FAILURES+=("$method $path → $code  $head")
  fi
}

for spec in "${PERSONAS[@]}"; do
  email="${spec%%:*}"
  paths="${spec#*:}"
  echo "── Persona: $email ──────────────────────────────────────────────"
  # The sensitive-route rate limiter is 10 logins / 5 min / IP. With 9
  # personas plus the admin login burned earlier in the CI pipeline, a
  # 2-second pause is not enough — by persona 5 we trip the limit. 35s
  # between fresh logins keeps the cumulative rate well under budget
  # (and is a no-op when the per-persona cache already has a valid token).
  sleep 35
  TOKEN=$(login_as "$email")
  if [ -z "$TOKEN" ]; then
    echo "      ❌  LOGIN failed for $email"
    FAIL=$((FAIL+1))
    FAILURES+=("login $email → empty token")
    continue
  fi
  echo "      ✅  Logged in (${#TOKEN} char token)"
  PASS=$((PASS+1))
  for p in $paths; do
    call "$TOKEN" GET "$p"
  done
  echo
done

# Cross-role 403 checks — log in as a non-admin and try to call admin endpoints.
echo "── Cross-role 403 (negative checks) ─────────────────────────────"
T_TRADER=$(login_as 'trader@openenergy.co.za')
T_OFFTAKER=$(login_as 'offtaker@openenergy.co.za')
T_IPP=$(login_as 'ipp@openenergy.co.za')

# Admin-only endpoints should reject non-admins (4xx).
call "$T_TRADER"   GET /api/admin/users      4
call "$T_OFFTAKER" GET /api/admin/tenants    4
call "$T_IPP"      GET /api/admin/monitoring 4
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
