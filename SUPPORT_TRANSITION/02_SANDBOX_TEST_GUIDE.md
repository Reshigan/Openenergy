# 02 - Sandbox End-to-End Test Guide

This is a hands-on script. Work through it against the DEMO environment
(oe.vantax.co.za), which is the sandbox. By the end you will have exercised
every major subsystem: auth, the Meridian surfaces, chain initiation and
transitions, cross-role cascades, settlement, telemetry, cron, and health.

Do all of this on demo. Never run the destructive steps against live.

## 0. Conventions and setup

Base URL for the sandbox:

```
BASE=https://oe.vantax.co.za
```

Demo personas all use password `Demo@2024!`. Emails are `<role>@openenergy.co.za`
for: `admin trader ipp wind offtaker lender carbon regulator grid support`.

Mind the login limiter: 10 logins / 5 minutes / IP. Get a token once per role
and reuse it. A helper to log in and print a token:

```bash
login() {  # usage: login trader  -> echoes token
  curl -s "$BASE/api/auth/login" -H 'Content-Type: application/json' \
    -d "{\"email\":\"$1@openenergy.co.za\",\"password\":\"Demo@2024!\"}" \
  | python3 -c 'import sys,json;print(json.load(sys.stdin)["data"]["token"])'
}
TRADER=$(login trader); ADMIN=$(login admin)
```

The login response shape is `{"success":true,"data":{"token":...}}` - the token
is at `data.token`.

If you prefer the UI, just open `$BASE` in a browser and click a persona on the
login screen. The browser flow stores the token in `localStorage['token']`.

## 1. Health and bindings

```bash
curl -s "$BASE/api/health"                 # expect {"status":"healthy"} 200
curl -s "$BASE/api/health/deep" -H "Authorization: Bearer $ADMIN"
```

`/api/health` is open and minimal (no token). `/api/health/deep` is admin-only
and probes D1, KV, R2, the OrderBook DO, and the AI binding, returning per-binding
latency. A `binding_absent` code for an optional binding is OK. Anything else
`degraded` (503) means a real binding problem - escalate.

Pass criteria: health 200; deep reports `healthy` for D1, KV, R2, AI.

## 2. The Meridian surfaces (UI walkthrough)

Log in via the browser as `trader`. You should land on `/horizon` (returning) or
`/onboard` (first visit). Verify each surface:

| Step | Do | Expect |
|---|---|---|
| Horizon | Stay on `/horizon` | A role headline KPI band, then lanes of the trader's active (non-terminal) chain cases |
| Atlas | Press Cmd+K (or go to `/atlas`) | The function library: tiles for the trader's domains/features. Every tile is clickable (none dead) |
| Ledger | Click a chain tile, or go to `/ledger/<chainKey>` | A list of that chain's cases plus a "+New" button |
| Thread | Open any case | A two-sided transaction view showing both roles' perspectives |
| Deal Desk | Go to `/deals`, then `/deals/new` | The deal author/tracker; `/new` is the transaction picker |

Repeat the Horizon + Atlas check as each of the other personas (ipp, offtaker,
lender, carbon, regulator, grid, support). Each role gets a different headline,
different lanes, and a different Atlas tile set. Confirm no role sees a blank
Horizon and no Atlas tile 404s.

Pass criteria: all 9 personas load Horizon with content; Atlas tiles all resolve.

## 3. Initiate a chain (create a transaction via API)

`03_CREATE_TRANSACTIONS_WALKTHROUGH.md` covers this per role in depth. As a quick
sandbox smoke, the bundled scripts already do a full round trip:

```bash
cd open-energy-platform
BASE=$BASE scripts/smoke-crud.sh     # POST -> GET -> PUT -> DELETE per role
```

This proves create/read/update/delete works end to end for each role's primary
resource. Watch for all-green. A failure here is usually the login limiter
(wait 5 minutes) before it is a real bug.

## 4. Cross-role roles + isolation

```bash
cd open-energy-platform
BASE=$BASE scripts/smoke-roles.sh    # 9 personas login + cross-role 403 checks
```

This logs in all 9 personas and asserts that a role CANNOT reach another role's
protected routes (expects 403). This is the tenant + RBAC isolation check.

Pass criteria: every cross-role probe returns 403; every own-role probe 200.

Note on role token forms: JWT role values are long forms. `grid` becomes
`grid_operator`, `ipp` becomes `ipp_developer`, `carbon` becomes `carbon_fund`.
If you write your own role assertion, accept both the short and long forms.

## 5. Watch a cascade fan out

Cascades are the cross-role nervous system. To see one:

1. As `offtaker`, open a PPA delivery case and record an under-delivery (or use
   the create walkthrough in `03`).
2. As `ipp` (the generator counterparty), open Horizon. A take-or-pay /
   shortfall claim should now appear in the IPP incoming panel.

The mechanism: the offtaker mutation calls `fireCascade(...)`, a cross-role rule
matches the fired event and pushes an action to the counterparty role. If the
expected item does not appear, check the `cascade_dlq` table (section 8) for a
stuck stage.

Pass criteria: an action initiated by one role surfaces to the correct
counterparty role without a manual refresh of seed data.

## 6. Settlement

Settlement runs nightly by cron, but you can reproduce it on demand as admin:

```bash
# previous-day PPA settlement (the 00:10 daily job)
curl -s -X POST "$BASE/api/admin/cron/run-once?pattern=10%200%20*%20*%20*" \
  -H "Authorization: Bearer $ADMIN"
```

Then open a settled PPA case in the UI and confirm the settlement amounts,
DvP/atomic transfer state, and audit entries are present. The settlement netting
endpoint is guarded by an advisory lock (`withLock(settlement:netting:<id>)`) so
a double-fire returns 409 rather than double-inserting - that guard is a closed
go-live blocker.

Pass criteria: the run completes; a PPA case shows settlement figures and an
audit trail.

## 7. Cron (dry-run every schedule)

```bash
cd open-energy-platform
BASE=$BASE scripts/smoke-cron.sh     # dry-runs every wrangler.toml schedule
```

This hits the admin `cron/run-once` endpoint for each schedule and asserts none
throw. To run one schedule by hand, URL-encode its pattern (space = `%20`):

```bash
curl -s -X POST "$BASE/api/admin/cron/run-once?pattern=*%2F15%20*%20*%20*%20*" \
  -H "Authorization: Bearer $ADMIN"     # the 15-minute surveillance + SLA sweep
```

Pass criteria: every schedule returns without an error payload. Logs may show
`cron_unknown_pattern` for patterns with no handler - that is expected, not a
failure.

## 8. Cascade DLQ console

As `support` (or `admin`), open the cascade-DLQ console. It lists terminal
cascade-stage failures from the `cascade_dlq` table with a retry control. In a
healthy sandbox this is usually empty. If you forced a failure in section 5,
it appears here and can be retried.

Pass criteria: the console loads; a forced failure is visible and retryable.

## 9. Telemetry + predictive (O&M)

On demo there may be little real telemetry (the real SolaX import runs on live).
Still verify the surfaces render:

1. As `support` or `esco` (esums_owner), open the O&M / asset-health surface.
2. Confirm device list, telemetry charts, and the predictive cards (anomaly,
   degradation, remaining-useful-life) render without error, even if sparse.

The data plane behind this is `om_telemetry` -> `om_devices` -> `om_sites`. On
live this is populated by the SolaX backfill (see `06_DATA_FLOWS.md` section 5).

Pass criteria: O&M surfaces render; predictive cards present.

## 10. Browser regression suite (optional, deeper)

```bash
cd open-energy-platform
BASE=https://oe.vantax.co.za npm run test:browser
```

Playwright drives the real UI. It seeds the token into `localStorage` rather
than driving the login form repeatedly, to respect the limiter.

## Sign-off checklist

- [ ] `/api/health` 200; `/api/health/deep` healthy across bindings
- [ ] All 9 personas load Horizon with content; Atlas tiles all resolve
- [ ] `smoke-crud.sh` green (CRUD round trip per role)
- [ ] `smoke-roles.sh` green (cross-role 403, own-role 200)
- [ ] A cascade initiated in one role surfaces to the counterparty role
- [ ] Settlement run reproduces; a PPA case shows figures + audit
- [ ] `smoke-cron.sh` green (no schedule throws)
- [ ] Cascade-DLQ console loads
- [ ] O&M / predictive surfaces render
