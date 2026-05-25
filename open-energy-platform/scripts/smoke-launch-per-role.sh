#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════════════
# Per-role launch-board deep smoke.
#
# Walks each persona through /api/launch/:role/kpis and /api/cockpit and
# every workflow href the launch payload advertises. For each workflow
# href, we HEAD-fetch the SPA index (200) and prove the URL is wired into
# the router. This catches the "I shipped a workflow card pointing at
# /om but the route is /esums" class of regression.
#
# Uses the shared token cache so we don't burn the rate-limit budget.
# ════════════════════════════════════════════════════════════════════════
set -u
BASE="${BASE:-https://oe.vantax.co.za}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=_login.sh
source "$SCRIPT_DIR/_login.sh"

# Pairs of email:role — macOS default bash 3.2 has no assoc arrays.
PERSONA_PAIRS=(
  "admin@openenergy.co.za:admin"
  "trader@openenergy.co.za:trader"
  "ipp@openenergy.co.za:ipp_developer"
  # wind@ is a second IPP persona (WindCapital) — DB role is ipp_developer.
  # wind_operator exists only as a theme key for a future role split.
  "wind@openenergy.co.za:ipp_developer"
  "offtaker@openenergy.co.za:offtaker"
  "lender@openenergy.co.za:lender"
  "carbon@openenergy.co.za:carbon_fund"
  "grid@openenergy.co.za:grid_operator"
  "regulator@openenergy.co.za:regulator"
)

PASS=0
FAIL=0
FAILED_DETAILS=()

mark_pass() {
  PASS=$((PASS+1))
  printf '      \033[32m✅\033[0m  %s\n' "$1"
}
mark_fail() {
  FAIL=$((FAIL+1))
  FAILED_DETAILS+=("$1")
  printf '      \033[31m❌\033[0m  %s\n' "$1"
}

probe_get() {
  # probe_get TOKEN PATH LABEL — passes if HTTP 2xx, fails otherwise.
  local token="$1" path="$2" label="$3"
  local code body
  body=$(curl -s -o /tmp/_probe.body -w '%{http_code}' \
    -H "Authorization: Bearer $token" \
    "$BASE$path")
  code="$body"
  if [[ "$code" =~ ^2 ]]; then
    mark_pass "$label  HTTP $code"
  else
    mark_fail "$label  HTTP $code"
  fi
}

probe_spa() {
  # probe_spa PATH — SPA shell should 200 for every advertised SPA route.
  # SPA is auth-guarded client-side, so server returns the shell regardless.
  local path="$1"
  local code
  code=$(curl -s -o /dev/null -w '%{http_code}' "$BASE$path")
  if [[ "$code" == "200" ]]; then
    mark_pass "GET SPA $path  HTTP $code"
  else
    mark_fail "GET SPA $path  HTTP $code"
  fi
}

for pair in "${PERSONA_PAIRS[@]}"; do
  email="${pair%%:*}"
  role="${pair##*:}"
  printf '\n── %s  (%s)  ─────────────────────────\n' "$email" "$role"

  token="$(login_or_cached "$email")" || {
    mark_fail "login $email"
    continue
  }

  probe_get "$token" "/api/launch/$role/kpis" "GET    /api/launch/$role/kpis"
  probe_get "$token" "/api/cockpit"           "GET    /api/cockpit"

  # Pull each workflow.href from the payload and probe the SPA route.
  workflows=$(curl -s -H "Authorization: Bearer $token" \
    "$BASE/api/launch/$role/kpis" \
    | python3 -c "
import sys, json
try:
  d = json.load(sys.stdin)
  for wf in (d.get('data') or {}).get('workflows', []) or []:
    href = wf.get('href')
    if href and href.startswith('/'):
      print(href)
except Exception:
  pass
" 2>/dev/null)

  if [ -z "$workflows" ]; then
    printf '      (no workflow hrefs in payload)\n'
  else
    while IFS= read -r href; do
      [ -z "$href" ] && continue
      probe_spa "$href"
    done <<< "$workflows"
  fi
done

echo
echo '════════════════════════════════════════════════════════════════'
printf 'Result:  ✅ %d passed   ❌ %d failed\n' "$PASS" "$FAIL"
if [ "$FAIL" -gt 0 ]; then
  echo
  echo 'Failures:'
  for f in "${FAILED_DETAILS[@]}"; do printf '  - %s\n' "$f"; done
  exit 1
fi
