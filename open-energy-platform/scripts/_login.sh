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
  # Expose the retryAfter value so callers can wait the exact right amount.
  local retry_after
  retry_after=$(echo "$body" | python3 -c "import sys,json
try:
  d = json.load(sys.stdin)
  print(d.get('retryAfter', 0))
except Exception:
  print(0)
" 2>/dev/null)
  echo "__RETRY_AFTER__:${retry_after:-0}" >&2
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

  # Cache miss or stale: do a fresh login. On rate-limit (429) the server
  # returns a retryAfter field (seconds). Wait exactly that long plus a 5s
  # buffer before retrying so we don't burn another request while the window
  # is still full. Fall back to 30s if the field is missing or zero.
  local token err_out retry_after wait_s
  if token=$(do_login "$email" 2>/tmp/oe_login_err); then
    echo "$token" > "$cache_file"
    echo "$token"
    return 0
  fi
  cat /tmp/oe_login_err >&2
  retry_after=$(grep '__RETRY_AFTER__:' /tmp/oe_login_err | sed 's/.*__RETRY_AFTER__://')
  wait_s=$(( ${retry_after:-0} > 0 ? retry_after + 5 : 30 ))
  echo "[_login] retrying $email after ${wait_s}s (retryAfter=${retry_after:-?})" >&2
  sleep "$wait_s"
  if token=$(do_login "$email"); then
    echo "$token" > "$cache_file"
    echo "$token"
    return 0
  fi
  return 1
}
