#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════════════
# smoke-crud.sh — exercise every major write endpoint, report failures.
#
# Usage:
#   ./scripts/smoke-crud.sh                 # hits production (oe.vantax.co.za)
#   BASE=http://localhost:8787 ./scripts/smoke-crud.sh   # local wrangler dev
#
# What it does:
#   • Logs in as admin@openenergy.co.za (Demo@2024!)
#   • For each role, POSTs a minimal-payload row to its key endpoints
#   • For contracts, runs the full POST → GET → PUT → DELETE round-trip
#   • For each call, prints  ✅ 2xx / ❌ 4xx-5xx with the response body head
#   • Exits non-zero if any request failed
# ════════════════════════════════════════════════════════════════════════

set -u
BASE="${BASE:-https://oe.vantax.co.za}"
EMAIL="${EMAIL:-admin@openenergy.co.za}"
PASSWORD="${PASSWORD:-Demo@2024!}"
# Unique tag for this run — used in any field that has a UNIQUE constraint
# (application_ref, complaint_ref, reporting_year) so repeated runs don't
# conflict with rows from prior runs.
TAG="${TAG:-$(date +%s)$RANDOM}"
PASS=0
FAIL=0
FAILURES=()

source "$(dirname "$0")/_login.sh"

login() {
  TOKEN=$(login_or_cached "$EMAIL")
  if [ -z "$TOKEN" ]; then
    echo "❌ Login failed (rate-limited or bad credentials). Try again in 5 min or clear $OE_TOKEN_CACHE."
    exit 1
  fi
  echo "✓ Logged in as $EMAIL (token ${#TOKEN} chars)"
}

# Call: METHOD PATH [JSON_BODY] [EXPECTED_STATUS_PREFIX]
# Prints one line; updates PASS / FAIL counters.
call() {
  local method="$1" path="$2" body="${3:-}" expect="${4:-2}"
  local args=(-s -o /tmp/smoke.out -w "%{http_code}" -X "$method" \
              -H "Authorization: Bearer $TOKEN")
  if [ -n "$body" ]; then
    args+=(-H "Content-Type: application/json" -d "$body")
  fi
  # Truncate the body file first: curl leaves it untouched on a connection
  # failure (HTTP 000), so a stale prior body would otherwise leak into the
  # failure line and masquerade as a wrong response.
  : > /tmp/smoke.out
  local code attempt
  # Retry transient connection failures (000 = no HTTP response: reset/timeout/DNS).
  # CI runs against prod where the edge occasionally drops a connection; a real
  # status (2xx/4xx/5xx) is authoritative and never retried.
  for attempt in 1 2 3; do
    code=$(curl "${args[@]}" "$BASE$path")
    [ "$code" != "000" ] && break
    : > /tmp/smoke.out
    sleep 2
  done
  local head; head=$(head -c 180 /tmp/smoke.out)
  if [[ "$code" =~ ^$expect ]]; then
    printf "  ✅  %-6s %-50s  HTTP %s\n" "$method" "$path" "$code"
    PASS=$((PASS+1))
  else
    printf "  ❌  %-6s %-50s  HTTP %s  %s\n" "$method" "$path" "$code" "$head"
    FAIL=$((FAIL+1))
    FAILURES+=("$method $path → $code  $head")
  fi
}

# Capture last response's `data.id` for chained calls.
last_id() {
  python3 -c "import sys,json; d=json.load(open('/tmp/smoke.out')); print(d.get('data',{}).get('id') or d.get('id') or '')" 2>/dev/null
}

login
echo

echo "── Contracts (full CRUD round-trip) ─────────────────────────────"
call POST /api/contracts '{"title":"smoke contract","phase":"draft","contract_type":"ppa_wheeling"}' 201
CID=$(last_id)
if [ -n "$CID" ]; then
  call GET    "/api/contracts/$CID"  ""                                  2
  call PUT    "/api/contracts/$CID"  '{"title":"smoke contract v2"}'     2
  call DELETE "/api/contracts/$CID"  ""                                  2
fi
echo

echo "── IPP role (migration 046) ─────────────────────────────────────"
call POST /api/roles/ipp/sites               '{"site_name":"smoke site","technology":"solar","ghi_kwh_per_m2_yr":2280,"capex_estimate_zar_per_mw":13000000}'    201
call POST /api/roles/ipp/yield-estimates     '{"capacity_mw":100,"p50_gwh_yr":250}'                                                                          201
call POST /api/roles/ipp/financial-models    '{"model_version":"v1","capacity_mw":100,"capex_zar":1300000000,"ppa_tariff_zar_mwh":900}'                       201
call POST /api/roles/ipp/permits             '{"permit_type":"nersa_generation_licence","authority":"NERSA","applied_at":"2026-01-01"}'                       201
call POST /api/roles/ipp/work-orders         '{"wo_type":"preventive","labour_cost_zar":1000,"parts_cost_zar":500}'                                           201
echo

echo "── Offtaker role (migration 047) ────────────────────────────────"
call POST /api/roles/offtaker/ppa-portfolio  '{"counterparty_name":"smoke gen","technology":"solar","capacity_mw":50}'                                        201
call POST /api/roles/offtaker/btm-designs    '{"site_name":"smoke site","proposed_kwp":250,"capex_zar":3500000,"self_consumption_pct":60}'                   201
call POST /api/roles/offtaker/scope2         "{\"reporting_year\":$((2050 + RANDOM % 900)),\"total_consumption_mwh\":12000,\"location_factor_kg_kwh\":0.95,\"recs_retired_mwh\":2000}"   201
call POST /api/roles/offtaker/cfe-commitments '{"framework":"RE100","target_year":2030,"target_pct":100,"current_pct":42}'                                    201
call POST /api/roles/offtaker/energy-budgets '{"budget_year":2026,"category":"ppa","budget_zar":45000000,"spent_zar":12000000}'                              201
echo

echo "── Lender role (migration 047) ──────────────────────────────────"
call POST /api/roles/lender/pipeline         '{"deal_name":"smoke deal","sponsor_name":"smoke sponsor","ticket_size_zar":500000000,"stage":"qualified"}'      201
call POST /api/roles/lender/credit-risk      '{"as_of_date":"2026-05-12","pd_1yr_pct":2,"lgd_pct":45,"ead_zar":500000000,"risk_weight_pct":100}'             201
call POST /api/roles/lender/ecl              '{"reporting_period":"2026-Q2","ifrs9_stage":2,"stage1_ecl_zar":0,"stage2_ecl_zar":1800000,"stage3_ecl_zar":0}' 201
call POST /api/roles/lender/limits           '{"limit_type":"single_name","limit_dimension":"smoke sponsor","limit_zar":1000000000,"current_zar":500000000}' 201
call POST /api/roles/lender/pricing          '{"pricing_method":"RAROC","proposed_margin_bps":350,"cost_of_credit_pct":0.5,"cost_of_capital_pct":12}'        201
echo

echo "── Carbon Fund role (migration 047) ─────────────────────────────"
call POST /api/roles/carbon/lps              '{"lp_name":"smoke LP","commitment_zar":50000000,"drawn_zar":15000000}'                                          201
call POST /api/roles/carbon/capital-calls    '{"call_date":"2026-05-12","total_called_zar":10000000,"purpose":"smoke"}'                                       201
call POST /api/roles/carbon/nav              "{\"as_of_date\":\"$(date -u +%Y-%m-%d)T$(printf '%02d' $((RANDOM % 24))):$(printf '%02d' $((RANDOM % 60))):00Z\",\"gross_asset_value_zar\":120000000,\"cash_zar\":5000000,\"liabilities_zar\":2000000}"    201
call POST /api/roles/carbon/term-sheets      '{"version":"v1","total_tco2e":50000,"price_zar_per_tco2e":85}'                                                 201
call POST /api/roles/carbon/fees             '{"fee_type":"management","reporting_period":"2026-Q2","base_zar":120000000,"rate_pct":2}'                       201
echo

echo "── Grid Operator role (migration 047) ───────────────────────────"
call POST /api/roles/grid/scada              '{"substation_code":"SMOKE-MV-01","observed_at":"2026-05-12T12:00:00Z","voltage_kv":132,"active_mw":150}'        201
call POST /api/roles/grid/dispatch           '{"schedule_date":"2026-05-13","schedule_type":"day_ahead","hourly_mwh":[0,0,0,0,0,0,30,60,90,100,105,105,100,95,85,70,50,30,10,0,0,0,0,0]}' 201
call POST /api/roles/grid/intraday-balancing '{"trading_hour":"2026-05-12T13:00:00Z","generation_forecast_mw":1500,"load_forecast_mw":1600}'                  201
call POST /api/roles/grid/outages            '{"asset_descr":"smoke breaker","outage_type":"planned","scheduled_start":"2026-05-20T00:00:00Z"}'              201
echo

echo "── Regulator role (migration 047) ───────────────────────────────"
call POST /api/roles/regulator/licence-applications "{\"application_ref\":\"SMOKE/$TAG\",\"applicant_name\":\"smoke applicant\",\"licence_category\":\"REG_LIC_GEN\",\"filed_at\":\"2026-05-12\"}" 201
call POST /api/roles/regulator/inspections   '{"licensee_name":"smoke licensee","inspection_type":"routine"}'                                                201
call POST /api/roles/regulator/complaints    "{\"complaint_ref\":\"SMOKE-CPL-$TAG\",\"complainant_name\":\"smoke complainant\",\"against_licensee\":\"smoke licensee\",\"received_at\":\"2026-05-12\"}" 201
call POST /api/roles/regulator/annual-reports "{\"reporting_year\":$((2050 + RANDOM % 900))}"                                                                201
echo

echo "── Trader role (migration 047) ──────────────────────────────────"
call POST /api/roles/trader/risk-limits      '{"limit_type":"var_1d","limit_zar":10000000,"current_zar":4500000}'                                             201
call POST /api/roles/trader/var              '{"as_of_date":"2026-05-12","method":"historical","horizon_days":1,"confidence_pct":95,"var_zar":3500000}'      201
call POST /api/roles/trader/options          '{"contract_type":"european_call","underlying":"electricity_spot","side":"long","strike_zar_per_mwh":1200,"underlying_price_zar":1300,"volume_mwh":1000}' 201
call POST /api/roles/trader/csa              '{"counterparty_name":"smoke cp","csa_version":"2002 ISDA","threshold_zar":5000000}'                            201
call POST /api/roles/trader/pnl              '{"as_of_date":"2026-05-12","book":"spot","realised_pnl_zar":120000,"unrealised_pnl_zar":-45000}'              201
echo

echo "── Read-only sweeps (GET) ───────────────────────────────────────"
for path in \
  /api/contracts \
  /api/roles/ipp/sites \
  /api/roles/offtaker/ppa-portfolio \
  /api/roles/lender/pipeline \
  /api/roles/carbon/lps \
  /api/roles/grid/scada \
  /api/roles/regulator/licence-applications \
  /api/roles/trader/risk-limits \
  /api/cockpit \
  /api/cockpit/kpis \
  /api/cockpit/actions; do
  call GET "$path" "" 2
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
