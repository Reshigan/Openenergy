#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════════════
# Seed the O&M (esums_owner) user for Sungrow iSolarCloud cloud-pull.
#
# What this DOES (idempotent, admin-only):
#   1. create-or-find an esums_owner participant (the "O&M user")
#   2. mint a fresh password-reset link so they can set a password + log in
#
# What this CANNOT do (needs the O&M user + values you don't have here):
#   • register Sungrow credentials — the iSolarCloud "authorized-app" OAuth
#     consent happens in a BROWSER, logged in as the O&M user. The callback
#     writes the manufacturer_credentials row. See runbook printed below.
#   • create the solax_stations row — needs the plant ps_id + inverter serial,
#     and POST /api/esums/stations binds to the LOGGED-IN participant (no
#     admin on-behalf). The O&M user does it after OAuth (curl in runbook).
#
# Usage:
#   BASE=https://oe.vantax.co.za scripts/seed-sungrow-om.sh   # prod
#   BASE=http://localhost:8787   scripts/seed-sungrow-om.sh   # local dev
#
# Optional overrides:
#   OM_EMAIL=... OM_NAME=... OM_COMPANY=...
# ════════════════════════════════════════════════════════════════════════
set -euo pipefail

BASE="${BASE:-http://localhost:8787}"
export BASE
source "$(dirname "$0")/_login.sh"

OM_EMAIL="${OM_EMAIL:-om@openenergy.co.za}"
OM_NAME="${OM_NAME:-Open Energy O&M}"
OM_COMPANY="${OM_COMPANY:-Open Energy O&M}"
# esums_owner is app-level only — the participants.role CHECK admits 'esco'
# (the "O&M Operator (ESCO)" role). The O&M code paths alias esums_owner→esco
# (horizon lanes, onboarding provisioning), and the data pipeline scopes by
# participant_id, so esco is the correct persisted role. See migrations 494/519.
OM_ROLE="${OM_ROLE:-esco}"

ADMIN_TOKEN="$(login_or_cached "admin@openenergy.co.za")"
[ -n "$ADMIN_TOKEN" ] || { echo "admin login failed" >&2; exit 1; }
echo "→ target: $BASE"

jget() { python3 -c "import sys,json;d=json.load(sys.stdin);print(eval('d'+sys.argv[1]) if d else '')" "$1" 2>/dev/null || true; }
api() { # api METHOD PATH [JSON_BODY]
  local method="$1" path="$2" body="${3:-}"
  if [ -n "$body" ]; then
    curl -s -X "$method" -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" -d "$body" "$BASE$path"
  else
    curl -s -X "$method" -H "Authorization: Bearer $ADMIN_TOKEN" "$BASE$path"
  fi
}

# ─── create-or-find the O&M user ─────────────────────────────────────────────
OM_ID="$(api GET "/api/admin/users?q=$OM_EMAIL" | python3 -c "
import sys,json
try:
  d=json.load(sys.stdin); rows=d.get('data',[])
  print(next((r['id'] for r in rows if r.get('email','').lower()=='$OM_EMAIL'), ''))
except Exception: print('')")"

if [ -z "$OM_ID" ]; then
  BODY="$(python3 -c "import json;print(json.dumps({'email':'$OM_EMAIL','name':'$OM_NAME','company_name':'$OM_COMPANY','role':'$OM_ROLE'}))")"
  RESP="$(api POST "/api/admin/users" "$BODY")"
  OM_ID="$(echo "$RESP" | jget "['data']['id']")"
  RESET_URL="$(echo "$RESP" | jget "['data']['reset_url']")"
  [ -n "$OM_ID" ] || { echo "O&M user create failed: $RESP" >&2; exit 1; }
  echo "→ created O&M user $OM_ID ($OM_EMAIL)"
else
  echo "→ O&M user exists: $OM_ID ($OM_EMAIL)"
fi

# Always mint a fresh reset link so the runbook has a usable one.
RESET_URL="$(api POST "/api/admin/users/$OM_ID/password-reset" "" | jget "['data']['reset_url']")"

cat <<EOF

═══════════════════════════════════════════════════════════════════════════
  O&M USER SEEDED — Sungrow cloud-pull runbook
═══════════════════════════════════════════════════════════════════════════
  O&M user   : $OM_ID  ($OM_EMAIL, role $OM_ROLE — O&M Operator)
  Set password (one-shot link, expires):
    $RESET_URL

  ── 1. Connect Sungrow (browser, as the O&M user) ──
  Log into $BASE as $OM_EMAIL, then either:
    • Meridian: /surface/esums_owner:integrations → "Connect Sungrow", OR
    • hit  GET $BASE/api/esums/manufacturers/sungrow/oauth/authorize
           (Authorization: Bearer <O&M token>, optional ?site_id=<ps_id>)
  iSolarCloud consent → redirect back → manufacturer_credentials row written
  (auth_type=token). appkey + x-access-key are baked into the OAuth route.

  ── 2. Register the plant's inverter as a station (as the O&M user) ──
  POST $BASE/api/esums/stations
    Authorization: Bearer <O&M token>
    { "manufacturer":"sungrow", "plant_id":"<ps_id>", "device_sn":"<inverter SN>",
      "plant_name":"<name>", "rated_power_kw":<kW>, "site_id":"<om_site id, optional>" }

  ── 3. Data flows ──
  The 0 * * * * cron (inverter_hourly_record) polls every active non-solax
  station once/hour → writes site_accruals (financial) + om_telemetry (ML).
  The series builds FORWARD from now; there is no pre-connection backfill.

  ── 4. O&M ML / AI surfaces (read, as the O&M user) ──
  GET  $BASE/api/esums/forecast/<site_id>
  GET  $BASE/api/esums/performance/<site_id>
  GET  $BASE/api/esums/predictions
  GET  $BASE/api/esums/opportunities?site_id=<site_id>
  POST $BASE/api/esums/forecast/<site_id>/refresh
═══════════════════════════════════════════════════════════════════════════
EOF
