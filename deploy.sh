#!/bin/bash
# Open Energy Platform — Cloudflare Worker + static-assets deploy.
#
# This script:
#   1. builds the React SPA into open-energy-platform/pages/dist
#   2. runs a wrangler dry-run to catch binding / config regressions
#   3. deploys as a single Worker (fetch + scheduled + Durable Objects
#      + static-assets binding for the SPA)
#
# Pre-reqs (one-time):
#   npm install -g wrangler
#   wrangler login
#   # Provision backing stores:
#   wrangler d1 create open-energy-db           (if not already created)
#   wrangler kv:namespace create OE_KV          (if not already created)
#   wrangler r2 bucket create open-energy-vault (if not already created)
#   # Apply migrations (idempotent — safe to re-run):
#   cd open-energy-platform && wrangler d1 migrations apply open-energy-db --remote
#   # Secrets:
#   wrangler secret put JWT_SECRET
#   wrangler secret put AZURE_AD_CLIENT_SECRET
#   wrangler secret put BACKUP_TOKEN

set -e
cd "$(dirname "$0")"/open-energy-platform

echo "▸ Building SPA..."
cd pages && npm install --silent --no-audit --no-fund && npm run build
cd ..

echo "▸ Wrangler dry-run (catches config regressions without deploying)..."
npx wrangler deploy --dry-run

echo "▸ Deploying..."
npx wrangler deploy

echo "✓ Deploy complete. Worker is now live."
echo "  Verify /api/health/deep returns 200 across all bindings."
