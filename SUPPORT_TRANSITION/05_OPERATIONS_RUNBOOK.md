# 05 - Operations Runbook

Operational reference for the support team. Everything here is grounded in the
actual `wrangler.toml`, `src/index.ts`, `deploy.sh`, `deploy-live.sh`, and
`CLAUDE.md` in the repo. If something is ambiguous it is flagged inline.

All commands run from `open-energy-platform/` unless stated otherwise. The repo
root is a thin wrapper; the real code lives under `open-energy-platform/`.

---

## 1. Environments

There are two completely separate runtime environments. They share the same
source code and the same SPA bundle, but nothing else. Do not assume a change in
one is visible in the other.

### Demo - oe.vantax.co.za

| Thing | Value |
|---|---|
| Worker name | `open-energy-platform` |
| Custom domain | `oe.vantax.co.za` |
| D1 database | `open-energy-db` (`e0665a44-...`) |
| KV namespace | `aa6172248d...` |
| Cascade queue | `open-energy-cascade` |
| `ENVIRONMENT` var | `production` |
| `PLATFORM_NAME` | `Open Energy` |
| Demo personas | seeded and visible on the login screen |
| Deploy trigger | push to `main` (CI/CD workflow) or `./deploy.sh` |

This is the demo and showcase environment. The 9 demo personas exist here and
the one-click demo password hint shows on the login page.

### Live - cec.vantax.co.za (CEC, Consolidated Energy Cockpit)

| Thing | Value |
|---|---|
| Worker name | `cec-energy-platform` |
| Custom domain | `cec.vantax.co.za` |
| D1 database | `cec-energy-db` (`ec72fd09-...`) |
| KV namespace | `35ec13fb...` |
| Cascade queue | `cec-energy-cascade` |
| `ENVIRONMENT` var | `live` |
| `PLATFORM_NAME` | `CEC` |
| `DEMO_MODE` | `off` (no demo personas, no demo password hint) |
| `PLATFORM_TZ` | `Africa/Johannesburg` (UTC+2, no DST) |
| `SOLAX_BASE_URL` | `https://openapi.solaxcloud.com` (GLOBAL base, not EU) |
| Deploy trigger | manual only: `./deploy-live.sh` |

This is the real-org environment (Goldrush, GoNXT, Envera, Growvest). It is
defined by the `[env.live]` block in `wrangler.toml`.

Critical differences to remember:

- It is a separate Worker against a separate D1. A demo login will not work on
  live, and live org data never appears on demo.
- `DEMO_MODE=off` hides the persona buttons and the `Demo@2024!` hint at
  runtime. Real-org login only.
- The SolaX base URL is the GLOBAL endpoint. The SA Goldrush plants are
  registered on the global base. (The EU base returned 0 plants for
  `businessType=4`, which was the original sync bug.) Per-org stored
  credentials can still override this via `manufacturer_credentials.base_url`.
- R2 is shared between demo and live (the deploy token has no `r2:write` scope
  to create a new bucket). Isolation is by tenant-prefixed keys
  (`t_<slug>/...`), not by separate bucket.
- Named environments in wrangler do NOT inherit bindings, vars, routes, or
  triggers, so every binding is redeclared in the `[env.live]` block. If you add
  a binding to demo, you must add it to `[env.live]` too or live will not have it.

---

## 2. Deploy procedures

### Demo deploy

Two ways, both produce the same result:

1. Push to `main`. The "CI/CD - Build and Deploy" GitHub Actions workflow runs
   automatically: build SPA, run vitest, apply migrations (with the 049/050/051+
   band logic in section 5), `wrangler deploy`, then mirror to the legacy Pages
   project.
2. Manual: from the repo root run `./deploy.sh`. It:
   - builds the SPA into `pages/dist`
   - runs `npx wrangler deploy --dry-run` (catches binding/config regressions
     without shipping)
   - runs `npx wrangler deploy`
   - reminds you to verify `/api/health/deep` returns 200 across all bindings.

### Live deploy

Manual only. From the repo root run `./deploy-live.sh`. It targets the wrangler
`live` env (`--env live` on every command). Steps:

1. Build the SPA (shared bundle; `DEMO_MODE=off` hides demo personas at runtime).
2. `npx wrangler deploy --dry-run --env live` to catch config regressions.
3. Reconcile additive migrations BY HAND. The script runs a fixed list of
   `wrangler d1 execute cec-energy-db --env live --remote --file migrations/<n>.sql`
   for the additive migrations (currently `510`, `513`, `514`, `515`). Each is
   piped through `| tail -2 || true` so a benign `duplicate column name` on
   re-run does not abort the deploy. See section 5 for why this is hand-done.
4. Run `scripts/live/live-bootstrap.sql` via `wrangler d1 execute` to disable
   demo logins and seed the platform admin.
5. `npx wrangler deploy --env live`.
6. Verify `/api/health` returns 200, then onboard the orgs.

Note: `cec-energy-db` was seeded from a full demo schema dump, so its
`d1_migrations` ledger is frozen (the script comment says frozen at 011 while
the schema is current). Running `wrangler d1 migrations apply` against it would
wrongly replay old migrations and explode on already-existing tables. That is
why additive migrations are applied by hand and guarded for idempotency.

### One-time live pre-reqs (already done, listed for reference)

Secrets must be set with `--env live` and are SEPARATE from demo secrets:

```
wrangler secret put JWT_SECRET --env live          # fresh, NOT the demo key
wrangler secret put SOLAX_CLIENT_SECRET --env live
wrangler secret put AZURE_AD_CLIENT_SECRET --env live
wrangler secret put BACKUP_TOKEN --env live
```

---

## 3. Health checks

- `GET /api/health` - always returns `{"status":"healthy"}` with 200. Safe for
  uptime monitors. Intentionally minimal (no version, no flags) to avoid info
  disclosure. This is the first thing to curl after any deploy.
- `GET /api/health/deep` - admin-only. Probes D1 (main + metering shard if
  bound), KV, R2, the OrderBook Durable Object, and the AI binding. Returns
  `healthy` or `degraded` (503) with per-binding latency. A `binding_absent`
  code for an optional binding (e.g. the metering shard) is treated as OK.

---

## 4. Cron schedules

The Worker exports `scheduled()` in `src/index.ts`. Cloudflare fires it per cron
pattern from `wrangler.toml [triggers]`, and `runCron(env, pattern)` dispatches
by matching the cron string. Live runs the identical schedule list to demo.

There are many cron entries in `wrangler.toml`, but the `runCron` switch only
has explicit handlers for the seven below. Other patterns fall through to the
`default` branch which just logs `cron_unknown_pattern` - that is, their
listed work is either a no-op in the dispatcher or handled elsewhere. Flag:
several `wrangler.toml` cron comments (W112-W131, ML drift, statutory sweeps)
describe jobs that do NOT have a matching `case` in `runCron` as read today.
Treat the seven handled patterns below as the authoritative cron behaviour.

### The seven handled schedules

| Cron | Cadence | What runs (from `runCron`) |
|---|---|---|
| `*/15 * * * *` | every 15 min | surveillance scan, trading surveillance scan, SIEM forwarder dispatch, all 145+ SLA sweeps (parallel, isolated), cross-role deal sweep (expire stale offers, auto-clear timer auctions) |
| `0 * * * *` | hourly | VWAP mark-price run - comment says it feeds margin + surveillance; the handler body is currently empty (no-op as read) |
| `5 0 * * *` | 00:05 daily | Esums accruals for all active SolaX stations, fault engine, late-payment fees, metrics rollup (for yesterday), audit-chain daily reconcile, regulator-export daily refresh, reconciliation-attestation monthly pack, control-environment nightly evidence coverage, NTT-comparison nightly cycle, telemetry rollup+purge, daily Merkle root publish, cascade DLQ purge (resolved/abandoned older than 90 days) |
| `10 0 * * *` | 00:10 daily | previous-day PPA settlement run (`executeSettlementRun` for `ppa_energy`, yesterday) |
| `30 0 * * *` | 00:30 daily | imbalance/usage run (yesterday→today), audit chain verify, daily Merkle roots |
| `45 0 * * *` | 00:45 daily | watershed anomaly scan + maturity refresh - handler body is currently empty (no-op as read) |
| `0 2 1 * *` | 02:00 on day 1 of month | monthly platform invoice run: regulator-export monthly rollup, control-environment annual cycle opener, NTT-comparison monthly ledger reconciliation, audit-chain quarterly export |

Each job inside a handler is wrapped in `safe(label, fn)` which logs
`cron_job_failed` and returns null on error, so one failing job never aborts the
rest of that schedule.

### Dry-run / manual-run a cron

There is an admin-only endpoint to run a schedule once on demand:

```
POST /api/admin/cron/run-once?pattern=<cron expression>
```

It requires an admin JWT and the exact `pattern` query param (e.g.
`pattern=5 0 * * *`). It calls the same `runCron`. Use this to reproduce a
nightly job during the day.

`scripts/smoke-cron.sh` dry-runs each `wrangler.toml` schedule against this
endpoint (gated on admin role). The full prod smoke run inserts mandatory ~120s
pauses between scripts to drain the auth rate-limit window, which is why it
takes about 10 minutes.

---

## 5. Auth and rate limits

### JWT

- HS256, 1-hour TTL.
- Token travels in `Authorization: Bearer <token>` and, for the SPA, in
  `localStorage['token']` (read/written by `pages/src/lib/api.ts`).
- `JWT_SECRET` is a wrangler secret and is DIFFERENT per environment. Demo and
  live do not share it.

### The login rate limiter (the #1 cause of test/CI flake)

There is a sensitive-route limiter of **10 logins per 5 minutes per IP** on
`POST /api/auth/login`. When you blow past it you get throttled and subsequent
logins fail, which looks like a broken environment but is not.

Rules of thumb for support:

- Any script that logs in multiple times MUST use the token cache helper in
  `scripts/_login.sh` (`login_or_cached`). It logs in once and reuses the token
  instead of burning a fresh login each call.
- `login_or_cached` needs the FULL email (e.g. `ipp@openenergy.co.za`), not the
  short prefix `ipp`. A short prefix returns `400 Invalid email format` and
  still costs you a request against the limit.
- Browser/Playwright tests should log in via the API once and seed the token
  directly into `localStorage` with `page.addInitScript(...)` rather than
  driving the login form repeatedly. See `tests/browser/workstations.spec.ts`.

### Demo personas (demo env only)

All demo personas use password `Demo@2024!`. Emails are
`admin / trader / ipp / wind / offtaker / lender / carbon / regulator / grid /
support @openenergy.co.za`.

Note on role token suffixes: the JWT role values are the long forms, not the
short login prefix. `grid` becomes `grid_operator`, `ipp` becomes
`ipp_developer`, `carbon` becomes `carbon_fund`. When checking role membership
include BOTH forms.

On live, `DEMO_MODE=off` means none of these exist and there is no password
hint. Live uses real-org logins seeded by `live-bootstrap.sql` (admin
`reshigan@vantax.co.za`, rotate password after first login).

---

## 6. Migration discipline (do NOT "fix" the ledger)

This is non-obvious and load-bearing. There are 508 numbered migrations in
`migrations/`. The migration ledger on the demo prod DB is deliberately
irregular. Do not try to make `wrangler d1 migrations list` come out clean.

Demo prod DB (`open-energy-db`) band rules:

- `001-018` - clean and idempotent. Apply normally.
- `019-048` - were force-applied out-of-band on prod; their `d1_migrations`
  ledger rows are missing. The CI deploy workflow SKIPS them when applying.
- `049` - `CREATE TABLE IF NOT EXISTS`, safe to land.
- `050` - had a `CREATE INDEX` referencing columns that `020` was supposed to
  add but did not. CI reconciles `050` column-by-column with
  `ALTER TABLE ADD COLUMN`, treating `duplicate column name` as a benign
  already-applied signal.
- `051+` - apply normally and are idempotent.

Because of this, `wrangler d1 migrations list ... --remote` will ALWAYS show
`049-508` as "to be applied". That is expected. The deploy uses
`wrangler d1 execute --file` for the irregular band, not `migrations apply`.
This is intentional. Do not "repair" the ledger.

Live DB (`cec-energy-db`): it was seeded from a full schema dump, so its ledger
is frozen while the schema is current. `migrations apply` would replay old
migrations and explode on existing tables. New additive migrations are applied
by hand inside `deploy-live.sh`, each guarded for idempotency
(`CREATE TABLE IF NOT EXISTS`, `INSERT OR IGNORE`, and swallowed
`duplicate column name`). When you add a migration that must reach live, add its
`wrangler d1 execute ... --file` line to `deploy-live.sh`.

---

## 7. Smoke scripts

All under `scripts/`. They hit real endpoints, so respect the login limiter.

- `scripts/smoke-crud.sh` - POST then GET then PUT then DELETE round-trip per
  role. Verifies basic create/read/update/delete works end to end.
- `scripts/smoke-roles.sh` - logs in 9 personas and runs cross-role 403 checks.
  Verifies that a role cannot reach another role's protected routes.
- `scripts/smoke-cron.sh` - dry-runs every `wrangler.toml` schedule via the
  admin `cron/run-once` endpoint. Verifies the scheduled handlers do not throw.

The nightly "Smoke - full test suite" workflow (03:17 UTC) runs all of these
against prod plus Playwright. Per-contributor PR runs only do unit + SPA build
to protect the prod login limiter; the full prod smoke is gated on
`schedule || workflow_dispatch`. Manual trigger: `gh workflow run smoke.yml`.

---

## 8. Common incidents and first response

### Logins suddenly failing across the board

Most likely the 10/5min/IP login limiter, not an outage. Confirm
`GET /api/health` is still 200 (it does not need a token). Wait out the 5-minute
window, then use cached tokens (`login_or_cached`, full email) instead of fresh
logins. If a script is the cause, point it at `scripts/_login.sh`.

### New SPA bundle not showing for returning users

The Cloudflare edge caches the SPA shell. `max-age=0` is not enough; repeat
visitors keep getting the stale shell. Ensure `Cache-Control: no-store` is set
on `/*` (in `_headers` or for new bundles) so the new build becomes visible.
First test: hard-reload / incognito will show the new bundle while a normal
repeat visit shows the old one - that pattern confirms an edge-cache stale shell.

### A route returns the wrong handler or 404 after a deploy

Hono `basePath` param collisions are silent. Sub-routers must be mounted with
the full param basePath, and CI being green does not prove wire-up. Always curl
the actual prod route after the first deploy of a new mount. The same applies to
role checks: include both the short and suffixed role token forms.

### A cron job did not run / threw

Check logs for `cron_job_failed` (a single job inside a schedule failed but the
rest ran) or `cron_unknown_pattern` (the pattern has no handler in `runCron`).
Reproduce on demand with `POST /api/admin/cron/run-once?pattern=<cron>` using an
admin token.

### A cascade side-effect (notification / webhook / fee) did not fire

Terminal cascade-stage failures persist to the `cascade_dlq` table for
inspection and retry from the support cascade-DLQ console. See `06_DATA_FLOWS.md`
section 4 for how the cascade fans out and where each stage can fail.
