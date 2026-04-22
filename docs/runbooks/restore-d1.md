# Restore D1 from Backup

This runbook covers restoring `open-energy-db` from a nightly R2 backup
created by `.github/workflows/backup.yml` calling
`POST /api/admin/backup/run`.

## 1. Pre-flight

Prerequisites:

- Cloudflare API token scoped to the Openenergy account with `D1: Edit`
  and `R2 Storage: Read` permissions (store in your local env as
  `CLOUDFLARE_API_TOKEN`).
- `wrangler@4` installed (`npx wrangler@4 --version` works).
- You have decided **which backup to restore**. List them via one of:
  - `GET https://oe.vantax.co.za/api/admin/backup/list` (admin JWT, shows
    size + row count + generated_at).
  - Cloudflare dashboard → R2 → `open-energy-vault` → `backups/` prefix.
  - `npx wrangler@4 r2 object get open-energy-vault/backups/YYYY-MM-DD/d1-….sql.gz --file=./restore.sql.gz`

## 2. Quarantine live traffic (optional but recommended)

If the outage is data-corruption rather than disaster-loss:

1. In the Cloudflare dashboard, set the Pages project's "Production Branch"
   to a maintenance branch that serves a static "Maintenance in progress"
   page. (If no such branch exists, rename `main` → `main-corrupt` and
   create a fresh `main` with a single commit containing `public/index.html`
   that reads "Maintenance".)
2. Alternatively, add a Cloudflare WAF rule that returns 503 for `/api/*`
   to prevent further writes.

Skip this step if you are restoring to a completely empty D1 (disaster
recovery).

## 3. Download the backup

```bash
# Authenticate the CLI
export CLOUDFLARE_API_TOKEN=<token>
export CLOUDFLARE_ACCOUNT_ID=<account_id>

# Pick a backup key from the list endpoint
BACKUP_KEY="backups/2026-04-21/d1-2026-04-21T02-17-00-000Z.sql.gz"

# Download from R2
npx wrangler@4 r2 object get "open-energy-vault/$BACKUP_KEY" \
  --file=./restore.sql.gz

# Decompress — backup is gzipped SQL
gunzip -k ./restore.sql.gz
ls -la restore.sql
```

## 4. (Optional) Restore to a staging DB first

Strongly recommended for production restores — prove the dump is clean
before clobbering live.

```bash
# Create a scratch DB
npx wrangler@4 d1 create open-energy-db-restore-staging

# Replay the dump
npx wrangler@4 d1 execute open-energy-db-restore-staging \
  --remote --file=./restore.sql

# Spot-check expected row counts
npx wrangler@4 d1 execute open-energy-db-restore-staging --remote \
  --command "SELECT COUNT(*) FROM participants;"
npx wrangler@4 d1 execute open-energy-db-restore-staging --remote \
  --command "SELECT COUNT(*) FROM contracts;"
```

If the counts look wrong, **stop and investigate** — do not proceed to
step 5. Every backup includes a `-- generated_at:` header and the REST
endpoint returns `total_rows` + per-table row counts, so you always have
a baseline to compare against.

## 5. Restore to production D1

The backup dump starts with `DROP TABLE IF EXISTS` + `BEGIN TRANSACTION`,
so replaying it on the live DB is idempotent and atomic (per table
migration order). **There is no undo after this step.**

```bash
npx wrangler@4 d1 execute open-energy-db --remote \
  --file=./restore.sql
```

Expected runtime: 30–120 seconds depending on DB size. Watch for
`ERROR` output — any error will roll back the transaction, leaving the
DB in its previous state. If that happens, capture the log and
investigate before retrying.

## 6. Re-apply post-restore migrations (if any)

If the restore is older than the latest migration, replay the diff:

```bash
# Example: if restoring a dump from before migration 014 landed
npx wrangler@4 d1 execute open-energy-db --remote \
  --file=open-energy-platform/migrations/014_monitoring.sql
npx wrangler@4 d1 execute open-energy-db --remote \
  --file=open-energy-platform/migrations/015_backup_log.sql
```

The deploy workflow (`.github/workflows/deploy.yml`) contains the
canonical migration order — replay any migrations whose number is
**greater than** the latest one present in the restored dump.

## 7. Invalidate sessions + tokens (security)

A restored DB may contain old password hashes / refresh tokens that an
attacker could have compromised. Rotate aggressively:

```bash
# Revoke every non-admin session
npx wrangler@4 d1 execute open-energy-db --remote \
  --command "UPDATE sessions SET revoked_at = datetime('now') WHERE revoked_at IS NULL AND participant_id NOT IN (SELECT id FROM participants WHERE role = 'admin');"

# Expire refresh tokens
npx wrangler@4 d1 execute open-energy-db --remote \
  --command "UPDATE refresh_tokens SET revoked_at = datetime('now') WHERE revoked_at IS NULL;"
```

## 8. Lift maintenance + verify

1. Revert the Pages project's Production Branch (or remove the WAF 503
   rule) from step 2.
2. Log in as each of: `admin`, `trader`, `regulator`, `support` (per
   role credentials in the Admin README). Smoke-test the cockpit +
   whichever page was most affected by the corruption.
3. Confirm `GET /api/admin/monitoring/errors?since=<ISO>&source=server`
   is not spiking 500s post-restore.

## 9. File the incident

- Record the backup key used, the restore start/end time, and which
  steps above were taken.
- Push a short post-mortem to this runbook as a new Markdown file
  under `docs/runbooks/incidents/YYYY-MM-DD.md`.

## Appendix A — One-time setup (first time only)

### A.1 Create the `BACKUP_TOKEN` shared secret

```bash
# Generate a random 32-byte token
BACKUP_TOKEN=$(openssl rand -hex 32)

# Push it to the Worker
echo "$BACKUP_TOKEN" | npx wrangler@4 secret put BACKUP_TOKEN \
  --name open-energy-platform

# Add the same value to GitHub → Settings → Secrets → Actions as BACKUP_TOKEN
```

### A.2 Verify the R2 bucket has versioning on (belt-and-braces)

Cloudflare R2 offers object lifecycle + version retention. Enable a
30-day retention on the `open-energy-vault` bucket so even a
catastrophic delete of backups is recoverable for 30 days:

Cloudflare dashboard → R2 → `open-energy-vault` → Settings → Object
Lifecycle → Add rule → Keep all non-current versions for 30 days.

### A.3 First smoke test

Dispatch the backup workflow manually and confirm a new object lands
under `backups/YYYY-MM-DD/`:

```
GitHub → Actions → "Scheduled D1 Backup" → Run workflow
```
