#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════════════
# Seed: LTM Energy / KDM 2.1 MW grid-tied site (Kwadukaza Mall offtaker).
#
#   IPP        LTM Energy        (role ipp_developer)   — owns KDM
#   Offtaker   Kwadukaza Mall    (role offtaker)
#   Lender     DRA               (role lender)
#   Carbon     Envera            (role carbon_fund)
#   Site       KDM  2.1 MW grid-tied solar (KZN)
#   Devices    Huawei inverter 1.10 MW  +  Sungrow inverter 0.75 MW
#   Ingest key one per site → the "api callback" token (revealed once)
#
# Two integration halves (both already implemented in the platform):
#   1. Cloud-PULL — manufacturer_credentials rows the platform polls.
#      iSolarCloud (Sungrow) + FusionSolar (Huawei) adapters live in
#      src/utils/inverter-adapters.ts. Creds are bound to the LOGGED-IN
#      participant, so LTM enters their own iSolarCloud/FusionSolar secrets
#      through the frontend (Esums → Manufacturer Integrations). This script
#      only registers them if you export the creds below (env-var path).
#   2. Push-INGEST — device gateway POSTs telemetry to the public callback
#      with a per-site bearer token. This script issues that token and does a
#      sample POST to prove the loop + feed the ML surfaces.
#
# Idempotent: participants matched by email, creds upserted on
# (participant_id, manufacturer). Re-running mints a NEW ingest key each time
# (tokens are one-shot by design) — revoke stale ones in the UI.
#
# Usage:
#   BASE=http://localhost:8787 scripts/seed-ltm-kdm.sh      # local dev
#   BASE=https://oe.vantax.co.za scripts/seed-ltm-kdm.sh    # prod (real data!)
#
# Optional cloud-pull creds (else the frontend path is used):
#   SUNGROW_USER=... SUNGROW_PASS=... SUNGROW_APPKEY=...     # iSolarCloud
#   HUAWEI_USER=...  HUAWEI_SYSTEMCODE=...                    # FusionSolar
#   LTM_LOGIN_EMAIL=... LTM_LOGIN_PASSWORD=...   # LTM user to bind creds to
# ════════════════════════════════════════════════════════════════════════
set -euo pipefail

BASE="${BASE:-http://localhost:8787}"
export BASE
source "$(dirname "$0")/_login.sh"

ADMIN_TOKEN="$(login_or_cached "admin@openenergy.co.za")"
[ -n "$ADMIN_TOKEN" ] || { echo "admin login failed" >&2; exit 1; }
echo "→ target: $BASE"

# jq-free JSON field pluck via python (matches the repo's existing style).
jget() { python3 -c "import sys,json;d=json.load(sys.stdin);print(eval('d'+sys.argv[1]) if d else '')" "$1" 2>/dev/null || true; }

api() { # api METHOD PATH [JSON_BODY] [TOKEN]
  local method="$1" path="$2" body="${3:-}" token="${4:-$ADMIN_TOKEN}"
  if [ -n "$body" ]; then
    curl -s -X "$method" -H "Authorization: Bearer $token" -H "Content-Type: application/json" -d "$body" "$BASE$path"
  else
    curl -s -X "$method" -H "Authorization: Bearer $token" "$BASE$path"
  fi
}

# ─── Participants (create-or-lookup by email) ───────────────────────────────
ensure_participant() { # ensure_participant EMAIL NAME COMPANY ROLE → echoes id
  local email="$1" name="$2" company="$3" role="$4" id
  id="$(api GET "/api/admin/users?q=$email" | python3 -c "
import sys,json
try:
  d=json.load(sys.stdin); rows=d.get('data',[])
  print(next((r['id'] for r in rows if r.get('email','').lower()=='$email'), ''))
except Exception: print('')")"
  if [ -n "$id" ]; then echo "$id"; return; fi
  local body
  body="$(python3 -c "import json;print(json.dumps({'email':'$email','name':'$name','company_name':'$company','role':'$role'}))")"
  api POST "/api/admin/users" "$body" | jget "['data']['id']"
}

IPP_ID="$(ensure_participant "ops@ltm.energy" "LTM Energy" "LTM Energy (Pty) Ltd" "ipp_developer")"
OFFTAKER_ID="$(ensure_participant "energy@kwadukazamall.co.za" "Kwadukaza Mall" "Kwadukaza Mall" "offtaker")"
LENDER_ID="$(ensure_participant "finance@dra.energy" "DRA" "DRA" "lender")"
CARBON_ID="$(ensure_participant "registry@envera.fund" "Envera" "Envera Carbon Fund" "carbon_fund")"
echo "→ IPP=$IPP_ID  OFFTAKER=$OFFTAKER_ID  LENDER=$LENDER_ID  CARBON=$CARBON_ID"
[ -n "$IPP_ID" ] || { echo "IPP create failed" >&2; exit 1; }

# ─── Site KDM (2.1 MW grid-tied) — admin on-behalf onboarding ────────────────
SITE_ID="$(api GET "/api/esums/sites" | python3 -c "
import sys,json
try:
  d=json.load(sys.stdin); rows=d.get('data',[])
  print(next((r['id'] for r in rows if r.get('name')=='KDM' and r.get('participant_id')=='$IPP_ID'), ''))
except Exception: print('')")"
if [ -z "$SITE_ID" ]; then
  SITE_BODY="$(python3 -c "import json;print(json.dumps({
    'name':'KDM','participant_id':'$IPP_ID','technology':'solar',
    'capacity_mw':2.1,'capacity_kwp':2100,'province':'KwaZulu-Natal',
    'lender_id':'$LENDER_ID','status':'operational',
    'commissioning_date':'2026-07-09'}))")"
  SITE_ID="$(api POST "/api/esums/sites" "$SITE_BODY" | jget "['data']['id']")"
fi
echo "→ SITE KDM=$SITE_ID"
[ -n "$SITE_ID" ] || { echo "site create failed" >&2; exit 1; }

# ─── Devices: Huawei 1.10 MW + Sungrow 0.75 MW (= 1.85 MW instrumented) ──────
ensure_device() { # ensure_device MANUFACTURER MODEL SERIAL RATED_KW → echoes id
  local mfr="$1" model="$2" serial="$3" kw="$4" id
  id="$(api GET "/api/esums/devices?site_id=$SITE_ID" | python3 -c "
import sys,json
try:
  d=json.load(sys.stdin); rows=d.get('data',[])
  print(next((r['id'] for r in rows if r.get('serial_number')=='$serial'), ''))
except Exception: print('')")"
  if [ -n "$id" ]; then echo "$id"; return; fi
  local body
  body="$(python3 -c "import json;print(json.dumps({
    'site_id':'$SITE_ID','device_type':'inverter','manufacturer':'$mfr',
    'model':'$model','serial_number':'$serial','rated_kw':$kw,'status':'online'}))")"
  api POST "/api/esums/devices" "$body" | jget "['data']['id']"
}
HUAWEI_DEV="$(ensure_device "huawei"  "SUN2000-100KTL" "KDM-HW-01" 1100)"
SUNGROW_DEV="$(ensure_device "sungrow" "SG110CX"        "KDM-SG-01" 750)"
echo "→ DEVICE huawei=$HUAWEI_DEV  sungrow=$SUNGROW_DEV"

# ─── Cloud-PULL creds (optional env-var path; else use the frontend) ─────────
# Creds bind to the logged-in participant → we log in AS LTM to register them.
if [ -n "${LTM_LOGIN_EMAIL:-}" ] && [ -n "${LTM_LOGIN_PASSWORD:-}" ]; then
  LTM_TOKEN="$(PASSWORD="$LTM_LOGIN_PASSWORD" do_login "$LTM_LOGIN_EMAIL" || true)"
  if [ -n "$LTM_TOKEN" ]; then
    if [ -n "${SUNGROW_USER:-}" ]; then
      api POST "/api/esums/manufacturers/credentials" "$(python3 -c "import json,os;print(json.dumps({
        'manufacturer':'sungrow','auth_type':'basic','client_id':os.environ['SUNGROW_APPKEY'],
        'username':os.environ['SUNGROW_USER'],'password':os.environ['SUNGROW_PASS'],
        'site_id':'$SITE_ID'}))")" "$LTM_TOKEN" >/dev/null && echo "→ sungrow creds registered"
    fi
    if [ -n "${HUAWEI_USER:-}" ]; then
      api POST "/api/esums/manufacturers/credentials" "$(python3 -c "import json,os;print(json.dumps({
        'manufacturer':'huawei','auth_type':'basic',
        'username':os.environ['HUAWEI_USER'],'password':os.environ['HUAWEI_SYSTEMCODE'],
        'site_id':'$SITE_ID'}))")" "$LTM_TOKEN" >/dev/null && echo "→ huawei creds registered"
    fi
  else
    echo "→ LTM login failed — register cloud creds via the frontend instead" >&2
  fi
else
  echo "→ cloud-pull creds skipped — LTM enters iSolarCloud/FusionSolar secrets"
  echo "  in the frontend: Esums → Manufacturer Integrations (POST /api/esums/manufacturers/credentials)"
fi

# ─── Push-INGEST key = the API CALLBACK (revealed once) ──────────────────────
# Body built in its own var — inlining a {..,..} dict inside nested $() hits
# bash brace-expansion and splits it.
KEY_BODY="$(python3 -c "import json;print(json.dumps({'label':'KDM gateway','scope':'write_telemetry'}))")"
KEY_JSON="$(api POST "/api/esums/sites/$SITE_ID/ingest-keys" "$KEY_BODY")"
INGEST_TOKEN="$(echo "$KEY_JSON" | jget "['data']['token']")"
[ -n "$INGEST_TOKEN" ] || { echo "ingest key issue failed: $KEY_JSON" >&2; exit 1; }

# Sample POST through the callback — proves the loop + gives the ML surfaces data.
SAMPLE="$(python3 -c "import json;print(json.dumps({'readings':[
  {'device_id':'$HUAWEI_DEV','ts':'2026-07-09T10:00:00Z','ac_kw':880,'yield_kwh':4200},
  {'device_id':'$SUNGROW_DEV','ts':'2026-07-09T10:00:00Z','ac_kw':600,'yield_kwh':2900}]}))")"
SAMPLE_RESP="$(curl -s -X POST -H "Authorization: Bearer $INGEST_TOKEN" -H "Content-Type: application/json" \
  -d "$SAMPLE" "$BASE/api/esums-ingest/telemetry")"

cat <<EOF

═══════════════════════════════════════════════════════════════════════════
  KDM SEEDED — API CALLBACKS
═══════════════════════════════════════════════════════════════════════════
  Site id       : $SITE_ID   (LTM Energy, 2.1 MW grid-tied)
  Huawei device : $HUAWEI_DEV   (device_id for 1.10 MW inverter)
  Sungrow device: $SUNGROW_DEV   (device_id for 0.75 MW inverter)

  ── Push telemetry callback (device gateway → platform) ──
  POST $BASE/api/esums-ingest/telemetry
  POST $BASE/api/esums-ingest/telemetry/csv
  Header: Authorization: Bearer $INGEST_TOKEN
  Body  : {"readings":[{"device_id":"$HUAWEI_DEV","ts":"<iso8601>","ac_kw":..,"yield_kwh":..}]}
  ⚠ token shown ONCE — store it in the gateway config now.
  sample POST result: $SAMPLE_RESP

  ── ML / analytics surfaces (read) ──
  GET  $BASE/api/esums/forecast/$SITE_ID
  GET  $BASE/api/esums/performance/$SITE_ID
  GET  $BASE/api/esums/predictions
  GET  $BASE/api/esums/opportunities?site_id=$SITE_ID
  POST $BASE/api/esums/forecast/$SITE_ID/refresh

  ── Cloud-pull (platform → iSolarCloud/FusionSolar) ──
  Frontend: Esums → Manufacturer Integrations → add Sungrow + Huawei creds.
  API     : POST $BASE/api/esums/manufacturers/credentials  (as the LTM login)
═══════════════════════════════════════════════════════════════════════════
EOF
