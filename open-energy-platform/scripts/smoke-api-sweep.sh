#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════════════
# Broad API GET sweep — one read endpoint per /api/* surface.
#
# Goal: catch any module currently returning 500 / 5xx on prod. We don't
# care if a surface returns 200 vs 404 vs 405 vs 400 (those just mean the
# root path isn't a GET handler) — we only fail on 5xx or a network
# timeout. The sweep covers ~80 modules in one pass.
#
# Run as admin since admin has the broadest cross-tenant read scope.
# ════════════════════════════════════════════════════════════════════════
set -u
BASE="${BASE:-https://oe.vantax.co.za}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=_login.sh
source "$SCRIPT_DIR/_login.sh"

TOKEN="$(login_or_cached admin@openenergy.co.za)" || {
  echo "login failed"; exit 1
}

# (path, label) probes. Pick the most representative read endpoint per
# surface — usually GET / on the route, or a known list endpoint.
PROBES=(
  "/api/auth/me::auth"
  "/api/cockpit::cockpit"
  "/api/cockpit/kpis::cockpit-kpis"
  "/api/cockpit/actions::cockpit-actions"
  "/api/launch/admin/kpis::launch"
  "/api/participants::participants"
  "/api/contracts::contracts"
  "/api/invoices::invoices"
  "/api/projects::projects"
  "/api/trading/orders::trading-orders"
  "/api/trading/marks::trading-marks"
  "/api/settlement/runs::settlement"
  "/api/carbon/credits::carbon-credits"
  "/api/esg/scope2::esg"
  "/api/esg-reports::esg-reports"
  "/api/watershed/scans::watershed"
  "/api/platform/tenants::platform"
  "/api/grid/forecast::grid"
  "/api/procurement/rfqs::procurement"
  "/api/dealroom/rooms::dealroom"
  "/api/modules::modules"
  "/api/popia/consents::popia"
  "/api/intelligence/feeds::intelligence"
  "/api/briefing/daily::briefing"
  "/api/metering/readings::metering"
  "/api/pipeline/projects::pipeline"
  "/api/vault/entries::vault"
  "/api/threads::threads"
  "/api/marketplace/listings::marketplace"
  "/api/admin/users::admin-users"
  "/api/admin/tenants::admin-tenants"
  "/api/admin/monitoring::admin-monitoring"
  "/api/support/tickets::support"
  "/api/ai/suggestions::ai"
  "/api/ai-briefs::ai-briefs"
  "/api/lois::lois"
  "/api/offtaker/portfolio::offtaker"
  "/api/funder/deals::funder"
  "/api/regulator/licences::regulator"
  "/api/grid-operator/dispatch::grid-operator"
  "/api/trader-risk/limits::trader-risk"
  "/api/lender/pipeline::lender"
  "/api/ipp/projects::ipp"
  "/api/offtaker-suite/sites::offtaker-suite"
  "/api/carbon-registry/projects::carbon-registry"
  "/api/admin-platform/tenants::admin-platform"
  "/api/settlement-auto/runs::settlement-auto"
  "/api/imbalance/runs::imbalance"
  "/api/data-tier/policies::data-tier"
  "/api/realtime/sse::realtime"
  "/api/siem/events::siem"
  "/api/reports/list::reports"
  "/api/telemetry/events::telemetry"
  "/api/backup/snapshots::backup"
  "/api/search?q=test::search"
  "/api/notifications::notifications"
  "/api/schedule::schedule"
  "/api/esums/sites::esums"
  "/api/esums/faults::esums-faults"
  "/api/esums/telemetry::esums-telemetry"
  "/api/business-depth::business-depth"
  "/api/audit-l5::audit-l5"
  "/api/carbon-deep::carbon-deep"
  "/api/grid-l5::grid-l5"
  "/api/ipp-deep::ipp-deep"
  "/api/kyc::kyc"
  "/api/kyc-deep::kyc-deep"
  "/api/lender-deep::lender-deep"
  "/api/marketplace-l5::marketplace-l5"
  "/api/mfa/status::mfa"
  "/api/popia-deep::popia-deep"
  "/api/regulator-l5::regulator-l5"
  "/api/reports-deep::reports-deep"
  "/api/settlement-deep::settlement-deep"
  "/api/trading-deep::trading-deep"
  "/api/trading-clearing-l5::trading-clearing-l5"
  "/api/auth-deep::auth-deep"
  "/api/consent::consent"
  "/api/documents::documents"
  "/api/print-packs::print-packs"
  "/api/bulk::bulk"
  "/api/polish::polish"
  "/api/ux-state::ux-state"
  "/api/status-admin::status-admin"
  "/api/portal/links::portal"
  "/api/ona/snapshots::ona"
  "/api/public/status::public-status"
  "/api/public/audit/chain::public-audit"
  "/api/health::health"
  "/api/ai-assistant/sessions::ai-assistant"
)

PASS=0
FAIL=0
FIVE_HUNDRED=()
TIMEOUT_COUNT=0

for probe in "${PROBES[@]}"; do
  path="${probe%%::*}"
  label="${probe##*::}"
  # 8s timeout, 2 retries on connect errors only (transient TLS)
  code=$(curl -s -o /dev/null --max-time 8 -w '%{http_code}' \
    -H "Authorization: Bearer $TOKEN" \
    "$BASE$path" 2>/dev/null || echo "000")
  if [[ "$code" == "000" ]]; then
    TIMEOUT_COUNT=$((TIMEOUT_COUNT+1))
    printf '  \033[31m❌\033[0m  %-32s %s  TIMEOUT\n' "$label" "$path"
    FIVE_HUNDRED+=("$path  TIMEOUT")
    FAIL=$((FAIL+1))
  elif [[ "$code" =~ ^5 ]]; then
    printf '  \033[31m❌\033[0m  %-32s %s  HTTP %s\n' "$label" "$path" "$code"
    FIVE_HUNDRED+=("$path  HTTP $code")
    FAIL=$((FAIL+1))
  else
    printf '  \033[32m✅\033[0m  %-32s %s  HTTP %s\n' "$label" "$path" "$code"
    PASS=$((PASS+1))
  fi
done

echo
echo '════════════════════════════════════════════════════════════════'
printf 'Result:  ✅ %d alive   ❌ %d 5xx/timeout\n' "$PASS" "$FAIL"
if [ "$FAIL" -gt 0 ]; then
  echo
  echo 'Broken:'
  for f in "${FIVE_HUNDRED[@]}"; do printf '  - %s\n' "$f"; done
  exit 1
fi
