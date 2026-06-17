# Runbook — Activate the metering D1 shard (`METERING_DB_CURRENT`)

**Status:** staged, NOT activated. The binding is commented out in
[`wrangler.toml`](../../wrangler.toml) and the runtime falls back to the main
`DB` until it is bound. Activation is a **gated remote-infra action** — it
creates a new production D1 database and must be run deliberately by an
operator, not by CI or an agent.

Go-live item #5. This document is the activation procedure; it does **not**
perform the activation.

---

## Why this is safe to land un-activated

The router code is already merged and reads the binding defensively:

- [`src/utils/metering-router.ts`](../../src/utils/metering-router.ts)
  - `writeDbFor(env)` → `return env.METERING_DB_CURRENT || env.DB;`
  - `readDbFor(env, date)` → current-month reads use `env.METERING_DB_CURRENT || env.DB`;
    archive reads use `env[METERING_DB_ARCHIVE_YYYY_MM] || env.METERING_DB_CURRENT || env.DB`.
  - `insertMeteringReading()` reports `target: 'fallback_db'` while no shard is bound.
- [`src/utils/db-adapter.ts`](../../src/utils/db-adapter.ts) documents the same
  tier order (main D1 → D1 shards → Hyperdrive/Postgres).

With no shard bound, **every metering read and write goes to the main `DB`** —
exactly today's behaviour. Binding the shard only changes *where* the
current-month `metering_readings` rows land; the table schema (migration
`001_core.sql`) is identical in both databases, so no data migration is needed
for new rows.

---

## When to activate

Activate when **any** of these is true (see `estimateCapacity()` in
`db-adapter.ts` for the live calculation behind an admin endpoint):

- Main-DB `daysToLimit` for metering ingest drops under ~365 days.
- Metering write contention starts to show up in trade/settlement query
  latency (D1 Analytics → query latency climbing on the listing paths during
  the `*/15` and `5 0 * * *` cron windows).
- Fleet crosses ~40k connections × half-hourly reads (the working-set ceiling
  the router comments are sized against, ≈58M rows/month).

Until then, leave it commented. Premature sharding adds an operational surface
(monthly archive rotation) with no benefit.

---

## Activation procedure (operator, manual)

> Run from `open-energy-platform/`. Requires Cloudflare account access with D1
> create permission. **This creates a billable production database.**

1. **Create the current-month shard.**

   ```bash
   wrangler d1 create open-energy-metering-current
   ```

   Copy the `database_id` it returns.

2. **Uncomment and fill the binding** in `wrangler.toml` (the block already
   exists, commented, under the "Metering shard" comment):

   ```toml
   [[d1_databases]]
   binding = "METERING_DB_CURRENT"
   database_name = "open-energy-metering-current"
   database_id = "<id-returned-by-wrangler-d1-create>"
   ```

3. **Create the `metering_readings` schema in the new shard.** The shard needs
   the same table + indexes as the main DB. Apply just the metering DDL from
   `migrations/001_core.sql` against the new database:

   ```bash
   # Extract the metering_readings table + its indexes from 001_core.sql,
   # or hand-apply them, then:
   wrangler d1 execute open-energy-metering-current --remote --file ./migrations/_metering_shard_schema.sql
   ```

   The router only ever touches `metering_readings` (writes) and
   `metering_readings_daily` (rollup reads) on the shard — create both.

4. **Dry-run, then deploy.**

   ```bash
   wrangler deploy --dry-run    # confirm the new binding resolves
   ./deploy.sh                  # or let CI deploy on merge to main
   ```

5. **Verify the cutover.** After deploy, POST a test reading and confirm the
   ingest handler reports `target: 'current'` (it returns `'fallback_db'` while
   unbound). Watch Workers Analytics for any binding-resolution errors.

---

## Archive-shard rotation (`METERING_DB_ARCHIVE_YYYY_MM`)

`readDbFor()` routes any read older than 31 days to a per-month archive binding
named `METERING_DB_ARCHIVE_<YYYY>_<MM>` when present, else falls back to the
current shard, else the main DB. Writes **never** target an archive — archives
are read-only cold storage.

Monthly operator job (or scheduled runbook), at month rollover:

1. `wrangler d1 create open-energy-metering-archive-<yyyy>-<mm>` for the month
   that just closed.
2. Copy that month's rows out of `METERING_DB_CURRENT` into the new archive DB,
   then delete them from current to keep the hot shard's working set bounded.
3. Add the binding to `wrangler.toml`:

   ```toml
   [[d1_databases]]
   binding = "METERING_DB_ARCHIVE_2026_05"
   database_name = "open-energy-metering-archive-2026-05"
   database_id = "<id>"
   ```

4. Deploy. Reads for that month now resolve to the archive automatically; no
   code change — the binding name is derived from the reading date.

Keep a KV pointer or naming convention so the binding name is always
`METERING_DB_ARCHIVE_${UTCFullYear}_${zero-padded UTCMonth+1}` — that exact
string is what `readDbFor()` looks up.

---

## Rollback

Deactivation is symmetric and safe: comment the `METERING_DB_CURRENT` binding
back out and redeploy. Reads/writes fall back to the main `DB`. Rows already
written to the shard during its active window stay in the shard — if you need
them in the main DB, copy them back before removing the binding, otherwise
recent-month reads will miss them until re-bound.

---

## Next tier (for reference)

When D1 sharding itself runs out (`daysToLimit < 30` in `estimateCapacity()`),
the next step is Hyperdrive → Postgres for the highest-contention tables
(`order_trades`, `settlement_invoices`, telemetry, `metering_readings`). That
procedure lives in the header comment of
[`src/utils/db-adapter.ts`](../../src/utils/db-adapter.ts) and is out of scope
for this runbook.
