#!/usr/bin/env bash
# goldrush-full-backfill.sh — backfill 12 months of hourly accruals for all 10 GoldRush stations
#
# Usage:
#   ./scripts/goldrush-full-backfill.sh
#   ./scripts/goldrush-full-backfill.sh ssx_ff8c11bcb035dbcf7d5bab5dc0b26913   # single station
#
# Each 7-day chunk takes ~60s. Full 12-month run = ~52 chunks per station = ~9h total.
# Safe to re-run at any time — ON CONFLICT DO UPDATE makes all inserts idempotent.
# Resume: start with the station where you left off by passing its ID as $1.

set -euo pipefail

PROD="https://oe.vantax.co.za"
WEEK_MS=$((7 * 24 * 3600 * 1000))
PARTICIPANT_ID="id_7c352b86da89907a85266a250e15db95"

# All 10 GoldRush station IDs (name → SN for reference only)
STATIONS=(
  ssx_9273339b718b2257cc36292ce9d9126e   # Chatsworth  X3F100J6779008
  ssx_a9f17c32c1894e5cc64e442f9b551e22   # Chatsworth  X3F100J7017005
  ssx_c0af7afc350c4700327b623afb146d2b   # Ladysmith   X3F120J9218002
  ssx_285085eb300cf51617d42f9fe388c011   # Wonderpark  X3F100J7017002
  ssx_406fabc54aeb72353781500be287f0ae   # West Street X3F100J6779009
  ssx_ac1e87a8e3a7b4936460153014477dac   # PMB         X3G060J6567028
  ssx_ff8c11bcb035dbcf7d5bab5dc0b26913   # Stanger     X3F100J7017004  (first 7d already done)
  ssx_343f4d88b936057a053caed6036ec523   # Malvern     X3F100J7017059
  ssx_9faa08e2558f2c3ce49c4f08e93b2320   # Bela Bela   X3F100J7017003
  ssx_f4adc5dcfbc7c5de496aa40cefa7cb27   # HQ          X3G060J6567025
)

# If a station ID is passed as argument, start from that station (skip earlier ones)
START_FROM="${1:-}"

# ─── Auth ──────────────────────────────────────────────────────────────────────

TOKEN=""
TOKEN_TIME=0

get_token() {
  local t
  t=$(curl -s -X POST "$PROD/api/auth/login" \
    -H 'Content-Type: application/json' \
    -d '{"email":"admin@openenergy.co.za","password":"Demo@2024!"}' \
    | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['data']['token'])")
  echo "$t"
}

refresh_token_if_needed() {
  local now
  now=$(date +%s)
  if (( now - TOKEN_TIME > 2700 )); then   # refresh every 45 min (token TTL = 60 min)
    echo "[$(date -u '+%H:%M:%SZ')] Refreshing auth token..."
    TOKEN=$(get_token)
    TOKEN_TIME=$(date +%s)
    if [[ -z "$TOKEN" ]]; then
      echo "ERROR: Could not obtain auth token. Aborting."
      exit 1
    fi
    echo "[$(date -u '+%H:%M:%SZ')] Token refreshed."
  fi
}

# ─── Backfill single chunk ──────────────────────────────────────────────────────

backfill_chunk() {
  local station_id="$1"
  local chunk_start_ms="$2"   # empty string = use server default (last 7d)
  local chunk_end_ms="$3"     # empty string = use server default

  local body
  if [[ -z "$chunk_start_ms" ]]; then
    body="{\"participant_id\":\"$PARTICIPANT_ID\",\"station_id\":\"$station_id\"}"
  else
    body="{\"participant_id\":\"$PARTICIPANT_ID\",\"station_id\":\"$station_id\",\"chunk_start_ms\":$chunk_start_ms,\"chunk_end_ms\":$chunk_end_ms}"
  fi

  curl -s -X POST "$PROD/api/esums/accruals/backfill" \
    -H "Authorization: Bearer $TOKEN" \
    -H 'Content-Type: application/json' \
    -d "$body" \
    --max-time 90
}

# ─── Parse JSON fields ──────────────────────────────────────────────────────────

json_field() {
  local json="$1"
  local field="$2"
  echo "$json" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    v = d['results'][0].get('$field')
    print(v if v is not None else '')
except Exception as e:
    print('')
" 2>/dev/null
}

# ─── Main loop ─────────────────────────────────────────────────────────────────

TOKEN=$(get_token)
TOKEN_TIME=$(date +%s)

GRAND_TOTAL_HOURS=0
GRAND_TOTAL_KWH="0"
SKIP=false
if [[ -n "$START_FROM" ]]; then SKIP=true; fi

for station in "${STATIONS[@]}"; do
  # Skip comment tokens (lines starting with #)
  [[ "$station" == \#* ]] && continue

  # Handle "start from" argument
  if $SKIP; then
    if [[ "$station" == "$START_FROM" ]]; then
      SKIP=false
    else
      echo "Skipping $station (before start-from)"
      continue
    fi
  fi

  echo ""
  echo "╔══════════════════════════════════════════════════════════════╗"
  echo "  Station: $station"
  echo "╚══════════════════════════════════════════════════════════════╝"

  chunk_num=0
  next_start=""
  next_end=""
  station_hours=0
  station_kwh="0"
  consecutive_empty=0

  while true; do
    refresh_token_if_needed

    chunk_num=$((chunk_num + 1))
    echo -n "[$(date -u '+%H:%M:%SZ')] chunk #$chunk_num ... "

    response=$(backfill_chunk "$station" "$next_start" "$next_end" 2>&1 || true)

    if [[ -z "$response" ]]; then
      echo "TIMEOUT/EMPTY — retrying once in 10s"
      sleep 10
      response=$(backfill_chunk "$station" "$next_start" "$next_end" 2>&1 || true)
      if [[ -z "$response" ]]; then
        echo "RETRY FAILED — skipping chunk and continuing"
        # Advance the cursor manually by one week
        if [[ -n "$next_start" ]]; then
          next_end="$next_start"
          next_start=$((next_start - WEEK_MS))
        fi
        consecutive_empty=$((consecutive_empty + 1))
        if (( consecutive_empty >= 5 )); then
          echo "5 consecutive failures — aborting station"
          break
        fi
        continue
      fi
    fi

    # Check for JSON parse error
    if ! echo "$response" | python3 -c "import sys,json; json.load(sys.stdin)" 2>/dev/null; then
      echo "INVALID JSON: $response"
      sleep 5
      consecutive_empty=$((consecutive_empty + 1))
      if (( consecutive_empty >= 3 )); then break; fi
      continue
    fi

    more_available=$(json_field "$response" "more_available")
    next_from_ms=$(json_field "$response" "next_from_ms")
    hours=$(json_field "$response" "hours_backfilled")
    kwh=$(json_field "$response" "kwh_total")
    error_field=$(echo "$response" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['results'][0].get('error',''))" 2>/dev/null || true)

    if [[ -n "$error_field" ]]; then
      echo "ERROR from server: $error_field"
      sleep 5
      consecutive_empty=$((consecutive_empty + 1))
      if (( consecutive_empty >= 3 )); then break; fi
      continue
    fi

    consecutive_empty=0
    station_hours=$((station_hours + ${hours:-0}))
    echo "hours=${hours:-0} kwh=${kwh:-0} more=$more_available next_ms=${next_from_ms:-none}"

    if [[ "$more_available" != "True" ]] || [[ -z "$next_from_ms" ]] || [[ "$next_from_ms" == "None" ]]; then
      echo "[$(date -u '+%H:%M:%SZ')] Station $station done: $station_hours hours in $chunk_num chunks"
      break
    fi

    next_start="$next_from_ms"
    next_end=$((next_from_ms + WEEK_MS))
  done

  GRAND_TOTAL_HOURS=$((GRAND_TOTAL_HOURS + station_hours))
done

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "  12-MONTH BACKFILL COMPLETE"
echo "  Total hours written: $GRAND_TOTAL_HOURS"
echo "╚══════════════════════════════════════════════════════════════╝"
