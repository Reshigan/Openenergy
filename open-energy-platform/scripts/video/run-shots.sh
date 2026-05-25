#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════════════
# Phase 3 driver — run the Playwright recording suite, then promote
# per-shot webm captures to media/shots/<key>.webm so the composite step
# (Phase 5) can sequence them.
#
# Each test in tests/video/<role>.spec.ts is one shot. Playwright writes
# the recording to test-results/video/<role>-<test-title>/video.webm. We
# rename to <key>.webm using the test title as the shot key.
#
# Defaults to BASE=http://localhost:8787 (local wrangler dev). If you want
# to record against prod, set BASE=https://oe.vantax.co.za — but every
# role login then counts against the 10 / 5 min /api/auth/login rate
# limiter, so the suite paces itself with serial workers + cached tokens.
#
# Usage:
#   scripts/video/run-shots.sh                       # all roles
#   scripts/video/run-shots.sh tests/video/trader.spec.ts  # just one
# ════════════════════════════════════════════════════════════════════════

set -euo pipefail

cd "$(dirname "$0")/../.."

BASE="${BASE:-http://localhost:8787}"
PLAYWRIGHT_CONFIG=playwright.config.video.ts
OUT_DIR="media/shots"

mkdir -p "$OUT_DIR"

echo "▶ Recording shots against BASE=$BASE"
echo "▶ Playwright config: $PLAYWRIGHT_CONFIG"
echo "▶ Per-shot webm output: $OUT_DIR/"
echo

# Allow argv override of which spec(s) to run.
if [[ $# -gt 0 ]]; then
  SPECS=("$@")
else
  SPECS=(tests/video/)
fi

BASE="$BASE" npx playwright test \
  --config="$PLAYWRIGHT_CONFIG" \
  "${SPECS[@]}"

echo
echo "▶ Promoting webm captures into $OUT_DIR/"
# Playwright per-test output dir is test-results/video/<spec>-<test>/video.webm
# The test title is the shot key (e.g. "trading-order-book-energy").
find test-results/video -type f -name 'video.webm' | while read -r src; do
  test_dir=$(dirname "$src")
  base=$(basename "$test_dir")
  # base looks like "trader-trading-order-book-energy" — strip the role prefix
  # by taking everything after the first dash so we land on the shot key.
  # Some keys (e.g. "trading-order-book-energy") happen to start with the role
  # prefix already; that's fine — we strip exactly the first hyphen-separated
  # segment.
  key="${base#*-}"
  cp "$src" "$OUT_DIR/${key}.webm"
  echo "  · $key"
done

echo
echo "▶ Done. $(ls -1 "$OUT_DIR" | wc -l | tr -d ' ') shots in $OUT_DIR/"
