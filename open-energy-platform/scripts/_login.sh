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

# do_login EMAIL → echoes token on success, prints diagnostic to stderr on
# failure. Used by login_or_cached after a cache miss / corruption.
do_login() {
  local email="$1"
  local password="${PASSWORD:-Demo@2024!}"
  local base="${BASE:-https://oe.vantax.co.za}"
  local resp http_code
  # -w writes the HTTP status code on its own line at the end; we split.
  resp=$(curl -s -w "\nHTTP_STATUS:%{http_code}" -X POST -H "Content-Type: application/json" \
    -d "{\"email\":\"$email\",\"password\":\"$password\"}" \
    "$base/api/auth/login")
  http_code=$(echo "$resp" | awk -F: '/^HTTP_STATUS:/{print $2}')
  local body
  body=$(echo "$resp" | sed '/^HTTP_STATUS:/d')
  local token
  token=$(echo "$body" | python3 -c "import sys,json
try:
  d = json.load(sys.stdin)
  print(d['data']['token'] if d.get('success') else '')
except Exception:
  print('')
" 2>/dev/null)
  if [ -n "$token" ]; then
    echo "$token"
    return 0
  fi
  # Diagnostic for CI logs — surface WHY the login failed (HTTP code + body
  # head). 429 means rate-limit; 401 means bad password; 5xx means the
  # platform itself is unhealthy.
  echo "[_login] login failed for $email: HTTP ${http_code:-?} body=$(echo "$body" | head -c 160)" >&2
  return 1
}

login_or_cached() {
  local email="$1"
  local cache_file="$CACHE_DIR/$(echo "$email" | tr '@/' '__').token"

  # Reuse if cached + non-empty + modified within the last 45 minutes
  # (tokens last 60). `find -mmin -45` is portable across macOS/BSD/GNU
  # whereas `stat`'s flags diverge — the previous arithmetic-substitution
  # form tripped `set -u` on Linux because GNU `stat -f %m` returns the
  # filesystem mount point as a path (e.g. "/tmp"), which the shell then
  # tried to treat as a variable inside `$(( ... ))`.
  if [ -f "$cache_file" ] && [ -s "$cache_file" ] && find "$cache_file" -mmin -45 -type f 2>/dev/null | grep -q .; then
    local cached
    cached=$(cat "$cache_file")
    # JWT shape sanity: must start with "ey" + contain two dots.
    if [[ "$cached" == ey* ]] && [[ "$cached" == *.*.* ]]; then
      echo "$cached"
      return 0
    fi
    echo "[_login] cache file for $email looked corrupt — refreshing" >&2
  fi

  # Cache miss or stale: do a fresh login. Retry once after a 20s pause if
  # the first attempt hits the rate limiter — that's almost always the
  # cause of intermittent CI failures.
  local token
  if token=$(do_login "$email"); then
    echo "$token" > "$cache_file"
    echo "$token"
    return 0
  fi
  echo "[_login] retrying $email after 20s pause" >&2
  sleep 20
  if token=$(do_login "$email"); then
    echo "$token" > "$cache_file"
    echo "$token"
    return 0
  fi
  return 1
}
