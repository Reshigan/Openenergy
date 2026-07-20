#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════════════
# Provision LTM Energy per-role login accounts (idempotent, admin-only).
#
# One account per platform role, all branded @ltm.energy, all set to a
# single known password so the accounts can be handed to LTM in a PDF.
# The ipp_developer role reuses LTM's EXISTING account (ops@ltm.energy,
# owner of the KDM site) — we only reset its password.
#
# Writes a credential manifest to scratchpad for the PDF build.
#
# Usage:
#   BASE=https://oe.vantax.co.za scripts/provision-ltm-roles.sh
#   BASE=http://localhost:8787   scripts/provision-ltm-roles.sh
# ════════════════════════════════════════════════════════════════════════
set -euo pipefail
BASE="${BASE:-http://localhost:8787}"; export BASE
source "$(dirname "$0")/_login.sh"

PW="${LTM_PASSWORD:-LTMenergy2026!}"
OUT="${OUT:-/private/tmp/claude-501/-Users-reshigan-Openenergy/8bc554c7-2699-419c-85c6-87ad90ba904f/scratchpad/ltm-credentials.json}"
mkdir -p "$(dirname "$OUT")"

ADMIN_TOKEN="$(login_or_cached "admin@openenergy.co.za")"
[ -n "$ADMIN_TOKEN" ] || { echo "admin login failed" >&2; exit 1; }
echo "→ target: $BASE  (password: $PW)"

api() { local m="$1" p="$2" b="${3:-}"
  if [ -n "$b" ]; then curl -s -X "$m" -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" -d "$b" "$BASE$p"
  else curl -s -X "$m" -H "Authorization: Bearer $ADMIN_TOKEN" "$BASE$p"; fi; }
jget() { python3 -c "import sys,json;d=json.load(sys.stdin);print(eval('d'+sys.argv[1]) if d else '')" "$1" 2>/dev/null || true; }

# email | role | display name
ACCOUNTS=(
  "ops@ltm.energy|ipp_developer|LTM Energy - IPP Developer (KDM owner)"
  "ltm-esco@ltm.energy|esco|LTM Energy - O&M Operator"
  "ltm-offtaker@ltm.energy|offtaker|LTM Energy - Offtaker"
  "ltm-lender@ltm.energy|lender|LTM Energy - Lender"
  "ltm-grid@ltm.energy|grid_operator|LTM Energy - Grid Operator"
  "ltm-regulator@ltm.energy|regulator|LTM Energy - Regulator"
  "ltm-carbon@ltm.energy|carbon_fund|LTM Energy - Carbon Fund"
  "ltm-trader@ltm.energy|trader|LTM Energy - Trader"
  "ltm-epc@ltm.energy|epc_contractor|LTM Energy - EPC Contractor"
  "ltm-support@ltm.energy|support|LTM Energy - Support"
  # admin intentionally OMITTED: tenant=default is shared, so an LTM admin would
  # see every other participant's data. Provision separately only if LTM asks.
)

echo "[" > "$OUT"; first=1
for row in "${ACCOUNTS[@]}"; do
  IFS='|' read -r EMAIL ROLE DISPLAY <<< "$row"
  ID="$(api GET "/api/admin/users?q=$EMAIL" | python3 -c "
import sys,json
try:
  d=json.load(sys.stdin); rows=d.get('data',[])
  print(next((r['id'] for r in rows if r.get('email','').lower()=='$EMAIL'), ''))
except Exception: print('')")"
  if [ -z "$ID" ]; then
    BODY="$(python3 -c 'import json,sys;print(json.dumps({"email":sys.argv[1],"name":sys.argv[2],"company_name":"LTM Energy (Pty) Ltd","role":sys.argv[3]}))' "$EMAIL" "$DISPLAY" "$ROLE")"
    RESP="$(api POST "/api/admin/users" "$BODY")"
    ID="$(echo "$RESP" | jget "['data']['id']")"
    [ -n "$ID" ] || { echo "  ✗ create failed $EMAIL: $RESP" >&2; continue; }
    echo "  + created $EMAIL ($ROLE) $ID"
  else
    echo "  = exists  $EMAIL ($ROLE) $ID"
  fi
  # mint reset link, extract token, consume → set known password
  RURL="$(api POST "/api/admin/users/$ID/password-reset" "" | jget "['data']['reset_url']")"
  TOK="$(python3 -c "import sys,urllib.parse as u;q=u.urlparse('$RURL').query;print(u.parse_qs(q).get('token',[''])[0])")"
  if [ -n "$TOK" ]; then
    R="$(curl -s -X POST -H 'Content-Type: application/json' -d "$(python3 -c 'import json,sys;print(json.dumps({"token":sys.argv[1],"new_password":sys.argv[2]}))' "$TOK" "$PW")" "$BASE/api/auth/reset-password")"
    echo "$R" | grep -q '"success":true' && echo "    ↳ password set" || echo "    ✗ pw reset failed: $R" >&2
  else
    echo "    ✗ no reset token for $EMAIL" >&2
  fi
  [ $first -eq 1 ] || echo "," >> "$OUT"; first=0
  python3 -c 'import json,sys;print(json.dumps({"email":sys.argv[1],"role":sys.argv[2],"display":sys.argv[3],"id":sys.argv[4],"password":sys.argv[5]}))' "$EMAIL" "$ROLE" "$DISPLAY" "$ID" "$PW" >> "$OUT"
done
echo "]" >> "$OUT"
echo "→ credential manifest: $OUT"
python3 -c "import json;d=json.load(open('$OUT'));print('provisioned',len(d),'accounts')"
