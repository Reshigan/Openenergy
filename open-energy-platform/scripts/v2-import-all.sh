#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════════════
# v2-import-all.sh — drive POST /api/v2/import/:chain_key across every
# chain in IMPORTABLE_CHAINS, paging each to exhaustion, and print a
# per-chain v1→v2 reconciliation.
#
# This is the data half of the v2 cutover: the v2 engine's tables
# (v2_txns/v2_events/v2_parties/v2_timers) start empty, and until every
# legacy row has a corresponding `<chain>.imported` seq-1 event the v2
# surfaces show nothing. The import is idempotent (rows already carrying
# an `import:<chain>:<id>` idempotency key are skipped), so re-running is
# safe and is the intended way to catch up after a partial run.
#
# Because we page with an id cursor to exhaustion, the totals ARE the
# reconciliation for a FRESH run: imported + skipped + quarantined == the v1
# row count. On a re-run the identity does not hold — the server filters rows
# it has already imported before counting, so `fetched` (and therefore the
# printed v1 total) shrinks to the not-yet-imported remainder. Read a re-run's
# totals as "what was left", not as the v1 table size.
# A non-zero quarantine count means rows the v2 engine could
# not accept (unmapped status, missing id, or an id already owned by
# another chain) — those are the cutover's real gaps.
#
# Usage:
#   ./scripts/v2-import-all.sh                              # prod, live write
#   DRY_RUN=1 ./scripts/v2-import-all.sh                    # count only, no writes
#   BASE=http://localhost:8787 ./scripts/v2-import-all.sh
#   CHAINS="ppa_execution kyc_onboarding" ./scripts/v2-import-all.sh
# ════════════════════════════════════════════════════════════════════════

set -u
cd "$(dirname "$0")/.."

BASE="${BASE:-https://oe.vantax.co.za}"
EMAIL="${EMAIL:-admin@openenergy.co.za}"
LIMIT="${LIMIT:-500}"
DRY_RUN="${DRY_RUN:-0}"
# Guard against a paging bug turning into an infinite loop. 500 pages x 500
# rows is 250k rows per chain — far above any real v1 table.
MAX_PAGES="${MAX_PAGES:-500}"

source "$(dirname "$0")/_login.sh"

# Chain list comes from the IMPORTABLE_CHAINS literal itself so this script
# can never drift from the allow-list the server enforces.
if [ -n "${CHAINS:-}" ]; then
  CHAIN_LIST="$CHAINS"
else
  CHAIN_LIST=$(sed -n '/^export const IMPORTABLE_CHAINS/,/^};/p' src/v2/import/legacy.ts \
    | grep -oE "^  '?[a-z0-9_]+'?:" | tr -d " ':")
fi
CHAIN_COUNT=$(echo "$CHAIN_LIST" | wc -w | tr -d ' ')

echo "═══ v2 legacy import — $CHAIN_COUNT chains against $BASE (dry_run=$DRY_RUN) ═══"

TOKEN=$(login_or_cached "$EMAIL") || { echo "login failed"; exit 1; }

T_IMPORTED=0; T_SKIPPED=0; T_QUAR=0; T_CHAINS_WITH_GAPS=0
GAP_LINES=()

for chain in $CHAIN_LIST; do
  after=""
  imported=0; skipped=0; quar=0; page=0; retries=0
  while [ "$page" -lt "$MAX_PAGES" ]; do
    page=$((page + 1))
    resp=$(curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
      -d "{\"limit\":$LIMIT,\"after_id\":\"$after\",\"dry_run\":$([ "$DRY_RUN" = "1" ] && echo true || echo false)}" \
      "$BASE/api/v2/import/$chain")

    # Parse into a single '|'-separated line: fetched, imported, skipped,
    # quarantined, last_id, retry_after, error. The separator must NOT be
    # whitespace — bash `read` collapses runs of IFS *whitespace* into one
    # delimiter, so a tab-separated line with an empty last_id silently
    # shifts the error into the last_id slot and every failure reads as a
    # clean empty page. Anything unparseable surfaces as an error.
    parsed=$(echo "$resp" | python3 -c "
import sys, json
def emit(*f): print('|'.join(str(x) for x in f)); raise SystemExit
try:
    d = json.load(sys.stdin)
except Exception:
    emit(0,0,0,0,'',0,'unparseable response')
if not d.get('success'):
    emit(0,0,0,0,'', int(d.get('retryAfter') or 0), str(d.get('error','?'))[:120])
r = d['data']
emit(r.get('fetched',0), r.get('imported',0), r.get('skipped_existing',0),
     len(r.get('quarantined',[])), r.get('last_id') or '', 0, '')
" 2>/dev/null)
    [ -z "$parsed" ] && parsed=$(printf '0|0|0|0||0|bad response: %s' "$(echo "$resp" | head -c 100)")

    IFS='|' read -r p_fetched p_imported p_skipped p_quar p_last p_retry p_err <<< "$parsed"

    # 429: the platform's global limiter (100/min/IP) will fire partway
    # through a 122-chain sweep. Sleep out the window and re-read the SAME
    # page — the cursor has not moved, so nothing is skipped.
    if [ -n "${p_err:-}" ] && [ "${p_retry:-0}" -gt 0 ] && [ "$retries" -lt 20 ]; then
      retries=$((retries + 1))
      sleep $((p_retry + 2))
      page=$((page - 1))
      continue
    fi
    if [ -n "${p_err:-}" ]; then
      GAP_LINES+=("$chain: ERROR $p_err")
      break
    fi
    imported=$((imported + p_imported)); skipped=$((skipped + p_skipped)); quar=$((quar + p_quar))
    # Exhausted: the cursor page came back empty. Progress is guaranteed
    # because `after` always advances to the last id of the page just read,
    # even when every row in it was quarantined.
    [ "$p_fetched" -eq 0 ] && break
    after="$p_last"
  done

  if [ "$page" -ge "$MAX_PAGES" ]; then
    GAP_LINES+=("$chain: hit MAX_PAGES=$MAX_PAGES — paging did not terminate")
  fi

  total=$((imported + skipped + quar))
  if [ "$total" -gt 0 ] || [ "$quar" -gt 0 ]; then
    printf '  %-42s v1=%-6s imported=%-6s skipped=%-6s quarantined=%s\n' \
      "$chain" "$total" "$imported" "$skipped" "$quar"
  fi
  if [ "$quar" -gt 0 ]; then
    T_CHAINS_WITH_GAPS=$((T_CHAINS_WITH_GAPS + 1))
    GAP_LINES+=("$chain: $quar of $total rows quarantined")
  fi
  T_IMPORTED=$((T_IMPORTED + imported)); T_SKIPPED=$((T_SKIPPED + skipped)); T_QUAR=$((T_QUAR + quar))
done

echo
echo "═══ reconciliation ═══"
echo "  v1 rows seen : $((T_IMPORTED + T_SKIPPED + T_QUAR))"
echo "  imported     : $T_IMPORTED"
echo "  already in v2: $T_SKIPPED"
echo "  quarantined  : $T_QUAR   (across $T_CHAINS_WITH_GAPS chains)"

if [ ${#GAP_LINES[@]} -gt 0 ]; then
  echo
  echo "═══ gaps — these rows are NOT in v2 ═══"
  for l in "${GAP_LINES[@]}"; do echo "  $l"; done
  exit 1
fi
echo
echo "clean — every v1 row in every importable chain is represented in v2."
