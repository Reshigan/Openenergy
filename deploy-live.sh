#!/bin/bash
# CEC live deploy — cec.vantax.co.za (real orgs: Goldrush, GoNXT, Envera, Growvest).
#
# Mirrors deploy.sh but targets the wrangler `live` env (separate Worker
# cec-energy-platform + separate D1 cec-energy-db + separate KV/queue). The
# SPA bundle is shared; DEMO_MODE=off (set in [env.live].vars) hides the
# demo personas at runtime.
#
# cec-energy-db is a FRESH database, so migrations apply cleanly 001→508 in
# order via the native tool — none of the prod 019-048 ledger reconcile from
# .github/workflows/deploy.yml is needed (that exists only because the demo
# prod DB's ledger rows are missing; a fresh DB has no such irregularity).
#
# Pre-reqs (one-time, all --env live):
#   wrangler secret put JWT_SECRET --env live            # fresh, NOT the demo one
#   wrangler secret put SOLAX_CLIENT_SECRET --env live   # live Solax token secret
#   wrangler secret put AZURE_AD_CLIENT_SECRET --env live
#   wrangler secret put BACKUP_TOKEN --env live

set -e
cd "$(dirname "$0")"/open-energy-platform

echo "▸ Building SPA..."
cd pages && npm install --silent --no-audit --no-fund && npm run build
cd ..

echo "▸ Wrangler dry-run (live bindings)..."
npx wrangler deploy --dry-run --env live

# cec-energy-db schema was seeded by a full demo schema dump (todo 3), so its
# d1_migrations ledger is frozen at 011 while the schema is current. Running
# `migrations apply` would wrongly replay 012->latest and explode on existing
# tables / FK seeds (same drift as demo prod, see CLAUDE.md migration band).
# New additive migrations are applied by hand, guarded for idempotency:
echo "▸ Reconciling additive schema (idempotent; dup/exists = benign)..."
npx wrangler d1 execute cec-energy-db --env live --remote \
  --file migrations/510_email_outbox.sql 2>&1 | tail -2 || true
# 513: resumable SolaX backfill jobs + per-station tariff step. The two raw
# ADD COLUMNs error "duplicate column name" on re-run after the first land —
# benign (table/index/columns already present), so swallow it.
npx wrangler d1 execute cec-energy-db --env live --remote \
  --file migrations/513_solax_backfill_jobs.sql 2>&1 | tail -2 || true

echo "▸ Live bootstrap: disable demo logins + seed platform admin..."
npx wrangler d1 execute cec-energy-db --env live --remote \
  --file scripts/live/live-bootstrap.sql

echo "▸ Deploying live Worker..."
npx wrangler deploy --env live

echo "✓ Live deploy complete: https://cec.vantax.co.za"
echo "  Admin: reshigan@vantax.co.za (rotate password after first login)"
echo "  Verify /api/health returns 200, then onboard the four orgs."
