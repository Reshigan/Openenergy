#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════════════
# Shared login helper for smoke scripts.
#
# Usage (inside another script):
#   source "$(dirname "$0")/_login.sh"
#   TOKEN=$(login_or_cached "admin@openenergy.co.za")
#
# Why: each script doing its own login burns the sensitive-rate-limit
# budget (10 / 5 min per IP). Tokens live ~1 hour, so caching across
# scripts lets the whole smoke suite run inside one rate-limit window.
# ════════════════════════════════════════════════════════════════════════

CACHE_DIR="${OE_TOKEN_CACHE:-/tmp/oe-smoke-tokens}"
mkdir -p "$CACHE_DIR"

login_or_cached() {
  local email="$1"
  local password="${PASSWORD:-Demo@2024!}"
  local base="${BASE:-https://oe.vantax.co.za}"
  local cache_file="$CACHE_DIR/$(echo "$email" | tr '@/' '__').token"

  # Reuse if cached and less than 45 minutes old (tokens last 60).
  if [ -f "$cache_file" ]; then
    local age=$(( $(date +%s) - $(stat -f %m "$cache_file" 2>/dev/null || stat -c %Y "$cache_file") ))
    if [ "$age" -lt 2700 ]; then
      cat "$cache_file"
      return 0
    fi
  fi

  local resp
  resp=$(curl -s -X POST -H "Content-Type: application/json" \
    -d "{\"email\":\"$email\",\"password\":\"$password\"}" \
    "$base/api/auth/login")
  local token
  token=$(echo "$resp" | python3 -c "import sys,json
try:
  d = json.load(sys.stdin)
  print(d['data']['token'] if d.get('success') else '')
except Exception:
  print('')
" 2>/dev/null)
  if [ -n "$token" ]; then
    echo "$token" > "$cache_file"
    echo "$token"
  fi
}
