# Go-Live Final Actions — Gated Runbook

Companion to [GO_LIVE_READINESS.md](GO_LIVE_READINESS.md). That doc is the
honest ledger (**NO-GO national, CONDITIONAL-GO capped soft-launch**). This doc
is the **execution runbook for the actions an agent must not fire
autonomously** — each one is outward-facing, irreversible, billable, or requires
a human signer. They are teed up here with exact steps so an operator can run
them deliberately.

**2026-06-17 update:** PR #65 (journey work) and PR #66 (step-up security
repair) are now **both merged to `main`**, the prod deploy workflow shipped
them, and `GET /api/health` is healthy on the deployed SHA. §1 below is
therefore **closed**. The remaining gated actions are §§2–7.

---

## What this session already closed (no action needed)

| Must-do (readiness §) | Status after this session | Evidence |
|---|---|---|
| #6 settlement correctness tests live | **Done** — 5 money-safety invariant tests (idempotency, concurrent-run race, double-pay reject, DvP leg atomicity, netting value-conservation) + 2 real prod defect fixes (Hono auth-glob 500s, TZ-dependent step-up gate) | commit `abb31c22`; 8167 vitest green, tsc clean |
| #4 k6 harness ready to run | **Staged** — 3 SA-peak scenarios mint persona tokens once in `setup()` so a 200-VU run holds `auth_429==0` against the prod limiter; thresholds recorded in scenarios + `tests/load/README.md` | commit `f921d712` |
| #5 metering shard activation | **Documented** — binding stays commented (additive; routers fall back to main `DB`); full activation procedure written | commit `b7d9d4f4`, [runbook](open-energy-platform/docs/runbooks/metering-shard-activation.md) |
| #10 readiness docs synced | **Done** | commit `02229c8f` |

The remaining must-dos below require a gated action. They map to readiness
blockers 1–7.

---

## 1. Merge PR #65 + #66 → confirm prod (readiness must-do #1, blocker #1) — ✅ CLOSED

**Status (2026-06-17): DONE.** PR #65 (journey work) and PR #66 (step-up
security repair, `HIGH_RISK_GRACE_SECONDS=120`) are both merged to `main`.
`deploy.yml` ran (SPA build → vitest → migration band → `wrangler deploy` →
Pages mirror) and `GET /api/health` returns `{"status":"healthy"}` on the
deployed SHA. No action remaining here.

Verification commands (for the record / future merges):

```bash
gh run list --workflow deploy.yml --limit 3 --json headSha,status,conclusion
curl -s https://oe.vantax.co.za/api/health    # expect {"status":"healthy"}
```

---

## 2. Run k6 at SA peak + record P95/P99 (must-do #4, blocker #2)

**Gate:** drives real load at prod; coordinate timing (off-peak window) and
warn anyone watching dashboards. The harness is staged — this is the *run*.

```bash
export BASE=https://oe.vantax.co.za
export DEMO_PASSWORD='Demo@2024!'

# Read-only dry run first (no writes left behind):
MUTATE=0 k6 run open-energy-platform/tests/load/scenario-settlement-burst.js

# Then the recorded runs — capture summary JSON for the ledger:
k6 run --summary-export=load-trading-peak.json   open-energy-platform/tests/load/scenario-trading-peak.js
k6 run --summary-export=load-read-heavy.json     open-energy-platform/tests/load/scenario-read-heavy.js
k6 run --summary-export=load-settlement-burst.json open-energy-platform/tests/load/scenario-settlement-burst.js
```

**Record P95/P99 + `auth_429` (must be 0) into GO_LIVE_READINESS.md.** A non-zero
`http_req_failed` means the run found a real ceiling — single Worker (~50 req/s)
or single D1. If breached at national volume, activate the metering shard
([runbook](open-energy-platform/docs/runbooks/metering-shard-activation.md)).

---

## 3. Security: rotate keys + pen-test (must-do #3, blocker #3) — HIGHEST PRIORITY

**Gate:** key rotation is irreversible and will break any client using the old
secret; pen-test is an external engagement. **The exposed Cloudflare Global API
key must be rotated regardless of launch timing** — treat as already-compromised.

```bash
# 3a. Cloudflare Global API key — rotate in the dashboard
#     (My Profile → API Tokens → Roll). Then update CI/CD secrets:
gh secret set CLOUDFLARE_API_TOKEN   # paste the new scoped token (NOT a global key)
# Prefer a scoped Workers/D1 token over the global key going forward.

# 3b. JWT_SECRET — rotate the signing secret (invalidates all live sessions):
wrangler secret put JWT_SECRET       # paste a fresh 256-bit random value
# Coordinate: every issued token dies at rotation. Do this in a maintenance
# window or accept a forced re-login for all users.
```

**Pen-test scope to commission.** A 2026-06-17 code audit corrected the
earlier "named gaps" list — several listed controls are in fact **already
present**, so the pen-test should _validate_ them rather than assume they are
missing:
- **CSRF** — auth is Bearer-token from JS memory (`api.ts`), not an ambient
  cookie credential, so classic cross-origin CSRF does not apply to state-change
  endpoints. The httpOnly cookie is a fallback only. _Pen-test task:_ confirm
  `SameSite` on that fallback cookie and that no state-change path is satisfiable
  by cookie alone.
- **Admin 2FA** — present: `oe_mfa_policies` seeds `admin`/`regulator`
  `required=1` (`migrations/061_depth.sql`); step-up gate repaired in PR #66.
  _Pen-test task:_ confirm enforcement end-to-end.
- **Login rate limiting** — present at two layers: per-IP 10/5min **and**
  per-account lockout 5-fails/15min → 15min (`auth.ts:95-103`). _Pen-test task:_
  confirm lockout cannot be bypassed by IP rotation.
- **At-rest PII encryption** — **genuinely open**; still to be added.

Do not soft-launch with money movement until **3a (Cloudflare key rotation)** is
done. The CSRF / admin-2FA / rate-limit controls the earlier draft flagged are
already in code; the residual security work is key rotation + at-rest PII
encryption + the independent pen-test.

---

## 4. DR restore drill — prove 019–048 replays (must-do #5, blocker #4)

**Gate:** spins up a fresh remote D1 (billable). Proves prod schema is
reproducible despite the out-of-band band.

```bash
# Against a SCRATCH database, not prod:
wrangler d1 create open-energy-dr-drill
# Apply the full migration sequence with the same band logic CI uses
# (see .github/workflows/deploy.yml for the 019-048 / 050 reconciliation),
# then diff the resulting schema against a prod schema dump.
wrangler d1 execute open-energy-db --remote --command "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name" > prod-tables.txt
# ... apply to dr-drill, dump its tables, diff. Zero drift = pass.
wrangler d1 delete open-energy-dr-drill   # clean up the scratch DB
```

Record PASS/FAIL in the readiness doc. This is also the moment to reconcile the
`d1_migrations` ledger truth (per CLAUDE.md migration discipline — do **not**
"fix" the ledger on prod; just prove the band replays clean elsewhere).

---

## 5. Full E2E recorded PASS on staging (must-do #2, #6 UAT matrix)

**Gate:** hits real endpoints; respect the 10/5min/IP login limiter via the
token cache.

```bash
# Against staging (or prod off-peak), seeded token, not per-test login:
BASE=https://oe.vantax.co.za npm --prefix open-energy-platform run test:browser
# Plus the 130-case per-role UAT matrix in TESTING_VALIDATION_CHECKLIST.md.
```

Capture the recorded PASS artifact and link it from the readiness doc.

---

## 6. Sign-off + residency (must-do #7, blocker #7) — human gate

Cannot be automated. Obtain written **exec + compliance + CISO** sign-off, and
substantiate POPIA data-residency (D1 region is Cloudflare-controlled, not
pinned to a ZA region — get the residency story in writing or pin the region).

---

## 7. Housekeeping (must-dos #8, #9)

- **#8** Decommission OR re-bless the legacy Cloudflare Pages mirror
  (deploy.yml ships to it today as a mirror — confirm it is wanted).
- **#9** `wrangler tail` the Worker for 24h; confirm all 7 cron triggers in
  `wrangler.toml::[triggers]` fire (`scripts/smoke-cron.sh` dry-runs each).

---

## Suggested order

`3a (rotate Cloudflare key — do now, independent of launch)` →
~~`1 (merge #65, confirm prod)` — ✅ done~~ →
`5 (E2E PASS)` → `2 (k6 record)` → `4 (DR drill)` →
`3 (pen-test + remaining security)` → `6 (sign-off)` → `7 (housekeeping)`.

Soft-launch gate per readiness doc = items 1–3 closed (1 done; 2–3 remain).
National hard-launch
remains 6–9 months on the architectural items (single-region D1, single Worker)
per [NATIONAL_DEPLOYMENT_EVALUATION.md](NATIONAL_DEPLOYMENT_EVALUATION.md).
