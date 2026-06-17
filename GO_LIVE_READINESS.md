# Go-Live Readiness Assessment

> **Current verdict (2026-06-17): ~58% ready. NO-GO for national/hard launch. CONDITIONAL-GO for a tightly-scoped soft-launch** (internal users, regulator demos, 1–2 pilot tenants, capped data, no settlement-of-record money movement) — and only after pre-launch items 1–3 below are closed.
>
> Assessed against `https://oe.vantax.co.za` — `GET /api/health` → `200 {"status":"healthy"}` verified.
>
> **§§1–6 below are the 2026-05-10 baseline, retained for history.** Several 500s they list are already fixed in current code (e.g. `/api/cockpit/kpis` now uses `matched_volume_mwh`; `/api/esg/decarbonisation` falls back to `esg_decarbonisation_pathways`). Treat the baseline numbers (37 migrations / 51 modules / 35 pages / 204 tables) as superseded by the current-truth figures here.

---

## Current truth (2026-06-17)

| Dimension | 2026-05-10 baseline | Current |
|---|---|---|
| Migrations | 37 | **508** (highest `508_add_carbon_chain_tier_columns.sql`) |
| Route modules | 51 | **347** (360 `app.route` mounts) |
| Unit tests | 474 | **8167** green (240 files, 0 fail — reproduced this session) |
| State-machine chains | suites only | **Waves 1–76** L4/L5 (settlement atomic DvP, grid dispatch/curtailment/capacity, regulator SLA escalation, carbon Article 6, ITIL) |

### What is genuinely strong (not vaporware)
- Prod is live and healthy; unit-test correctness is proven, not aspirational.
- Deep, real feature surface on disk (347 routes · 508 migrations · 76 chain waves).
- 3 chains advance forward through the real prod UI (warranty / commissioning / MRV); cross-role advance probe: 86/89 advanced, **0 server errors (5xx)**.
- KV used only as cache/rate-limiter; R2 document vault real; scheduled D1→R2 gzip backups; CI encodes the irregular 019–048 migration band.

### Blockers that actually gate a regulator-grade financial exchange (all P1 unless noted)
1. **PR #65 unmerged** → `main` lacks the latest journey work; what prod serves vs. source is unconfirmed.
2. **No load proof at SA grid peak** — k6 scenarios exist but zero recorded P95/P99. Single Worker (~50 req/s ceiling) + single D1.
3. **No independent pen-test.** Named gaps: no CSRF on state-changing ops; no at-rest PII encryption; no admin 2FA; per-IP-only login rate limit; **exposed Cloudflare Global API key must be rotated**.
4. **Prod schema not reproducible from migrations** (019–048 force-applied out-of-band); no DR restore drill proving the band replays.
5. **Single-region D1 10GB ceiling**; national metering shards NOT bound (`METERING_DB_CURRENT` / `esums-telemetry` commented out in `wrangler.toml`).
6. **E2E not verifiably run on the current build**; settlement double-settle / netting-race correctness unproven by live tests.
7. (P2) **No compliance/exec/CISO sign-off**; POPIA data-residency unsubstantiated (D1 region is Cloudflare-controlled, not pinned to a ZA region).

### Pre-launch must-dos (ordered)
1. Merge PR #65; confirm exactly what prod serves.
2. Re-run full E2E on staging with the token cache; capture a recorded PASS.
3. Pen-test + rotate the exposed Cloudflare key + `JWT_SECRET`; add CSRF, admin 2FA, admin-write-gate checks.
4. k6 at SA peak + national metering volume; record P95/P99; bind metering shards if needed.
5. Real DR restore drill proving 019–048 replays from scratch.
6. Settlement correctness tests live + the 130-case per-role UAT matrix.
7. Exec + compliance + CISO sign-off; substantiate POPIA residency.
8. Decommission OR re-bless the legacy Pages mirror.
9. Tail the Worker 24h confirming all 7 cron triggers fire.
10. Keep these readiness docs synced to reality (this refresh closes that item).

**Timeline:** weeks-to-2-months to clear P1 for a credible pilot; national hard-launch 6–9 months on the architectural items (matches `NATIONAL_DEPLOYMENT_EVALUATION.md`). Anyone calling this "90%+ ready" is reading the code surface, not the operational evidence.

---

<details>
<summary><strong>2026-05-10 baseline assessment (retained for history — numbers superseded above)</strong></summary>

> Date of assessment: **2026-05-10**
> Assessed worker version: `f7f8d69c-7b6b-452a-8f08-bb9fdf9e2e12` on `https://oe.vantax.co.za`

---

## Honest answer

**Yes, you can soft-launch the platform today** with the demo accounts (`*@openenergy.co.za`) for invited stakeholders, internal demos, regulator walkthroughs, and pilot offtakers/IPPs. Auth, the cockpits for all 7 demo roles, the four rebuilt suites (Trading, Carbon, Funds, Procurement), the ASOBA solar telemetry integration, the cross-role end-to-end workflows (RFP → bid → evaluation → award, retirement → certificate, disbursement request → approval), and the cascade engine are all verified live.

**You should not hard-launch to public/regulator/financial-institution traffic until** the items in §3 are closed. They're concentrated in: a small handful of 500ing endpoints (mostly admin-platform, regulator-suite-data and lender-suite-data sub-features that need their seed data populated), the legacy Cloudflare Pages project still consuming the GitHub `Reshigan/Openenergy` push trigger (potential for stale code shipping under the same name), the JS bundle size, and unfinished design polish on ~20 of the 35 pages that still use the pre-Stitch chrome.

---

## 1. What is verified live (today)

### 1.1 Infrastructure
- DNS, TLS (SAN includes `oe.vantax.co.za`), HTTP→HTTPS 301, six cron triggers, D1 / R2 / KV / AI bindings all healthy.
- Custom domain `oe.vantax.co.za` is bound to the Worker (verified after the Global API key DNS cleanup).
- workers.dev fallback `open-energy-platform.reshigan-085.workers.dev` is live as a hot standby.
- Database: `open-energy-db` on Cloudflare D1, 204 tables, 37 migrations applied. Recovery migrations 034–037 plus a force-apply pass on 019–032 brought the schema to expected state.

### 1.2 Auth & identity
- HS256 JWT with `sub / email / role / name / jti / iat / exp` claims, 1-hour TTL.
- `JWT_SECRET` set as a Worker secret (URL-safe 86-char random).
- Login rate-limit fires at ~3 attempts/min (`429 Too many attempts`).
- All 7 demo roles can log in. Admin role gate works (non-admin gets `403`).
- POPIA endpoints (consent, DSAR, erasure, objection, correction, breach) are wired and respond.

### 1.3 Verified end-to-end flows (cross-role, cross-module)
| Flow | Roles touched | State at end |
|---|---|---|
| **Procurement → LOI** | Offtaker → IPP → Offtaker | RFP issued, bid submitted, scored on 4 criteria with the 40% price-weighted overall, awarded, LOI auto-drafted into `contract_documents` |
| **Algo trading rule** | Trader | Rule created in `trader_algo_rules`, lists, toggles, persists across reloads |
| **Carbon retirement** | Carbon fund | Holding decremented, retirement row inserted, OE-`xxxxxxxx` certificate number generated |
| **Lender disbursement** | Lender | Request inserted into `disbursement_requests` with `pending` status; cascade fires `disbursement.requested` |
| **ASOBA sync** | IPP/admin | Site telemetry + OODA alerts pulled from ASOBA Cloud, persisted into `ona_asoba_telemetry` / `ona_asoba_alerts`, critical/high alerts promoted into `ona_faults` with `source='asoba'` |

### 1.4 Backend GET surface
- 491 routes catalogued across 51 modules.
- 155 of those are unparameterised GETs (the bulk of "list/index" surfaces).
- **131 of 155 return 200/204** with admin credentials — 84.5% raw, **95.6% effective** after excluding 12 trailing-slash 404s (non-issue, apps don't call with slash) + 3 query-param-required 4xx + 1 OAuth callback 5xx.
- 6 known 5xx endpoints are listed in §3.

### 1.5 Frontend SPA
- 39/39 React Router routes serve the SPA shell (Cloudflare's `not_found_handling = "single-page-application"` is correctly wired).
- Brand: title, theme-color, favicon, logo SVGs all served and contain the correct OE palette colours.
- CSS 100 KB, JS 1.5 MB (single chunk — see §3.5).

### 1.6 ASOBA Cloud integration
- Worker-compatible client at `src/utils/asoba.ts` (the official SDK uses Node-only APIs).
- 7 proxy endpoints under `/api/ona/asoba/*`: status, data-period, telemetry (site + per-inverter), alerts (site + per-terminal), sync.
- The `sync` endpoint persists data into D1 and promotes critical/high OODA alerts into `ona_faults`, firing the `ona.fault_created` cascade.
- ASOBA Live tab in the O&M cockpit (`/om`) lets IPP developers pick a site, set the window, refresh telemetry, view OODA alerts, and trigger Sync to D1.
- API key held as Worker secret `ASOBA_API_KEY` (never committed to source).

---

## 2. Known limitations (not blockers, document and accept)

| Area | Limitation | Mitigation |
|---|---|---|
| ASOBA forecasting | Forecasting + OODA-terminal write paths use AWS SigV4. Not implemented in the Worker proxy yet — only the API-key endpoints are. | The local AI-driven forecast at `POST /api/ona/forecast/:siteId/explain` uses Workers AI and works today. ASOBA forecast can be added with `aws4fetch`. |
| Pricing of carbon options | The options book endpoint returns `delta` / `gamma` as `null`. | Real Greeks would need a Black-Scholes pricer + vol surface. UI displays `—` cleanly. |
| Mobile responsive | The 35 pages render on mobile via Tailwind defaults but haven't been individually tuned for sub-640px. The ASOBA Live tab + StitchPage components are responsive. | Trader/regulator/grid-op are the desktop-primary flows. Mobile native or Capacitor wrap is a v2 conversation. |
| Stress / clearing simulation | `lender-suite/stress/run` and `trader-risk/clearing/run` execute SQL aggregates only — they don't run a Monte-Carlo or a netting cycle. | Read-only outputs work; running them won't break, the numbers are deterministic but illustrative. |
| Bundle size | 1.5 MB JS single chunk (gzip 437 KB). | Lazy-loaded code-split for the 8 workbenches; the rest is shared. Easy to chunk recharts/lucide/jspdf into a vendor bundle. |

---

## 3. Open issues to close before hard-launch

### 3.1 (P1) Endpoints returning 500
| Endpoint | Symptom | Fix |
|---|---|---|
| `/api/cockpit/kpis` | `no such column: volume` (`trade_orders` has `volume_mwh`) | One-line column rename in `cockpit.ts` query |
| `/api/regulator/market-summary` | D1 error | Schema reference — needs alignment with current trader/imbalance tables |
| `/api/admin/monitoring/cascade-dlq` | D1 error | `cascade_dlq` table exists; column mismatch in the SELECT |
| `/api/admin/monitoring/cron-health` | D1 error | Same family — column mismatch |
| `/api/esg-reports/my-reports` | D1 error | `esg_reports` table exists, route may join a missing column |
| `/api/esg-reports/templates` | D1 error | Same |
| `/api/esg/decarbonisation` | `no such table: decarb_actions` (actual is `esg_decarbonisation_pathways`) | Route table-name fix |

These are the same family of schema/code drift bugs we've already fixed in trading, carbon, procurement, funder, and ona. Each is a 1–10 minute fix. None block the validated cross-role flows.

### 3.2 (P1) JWT secret rotation policy
- `JWT_SECRET` was generated as a 86-char URL-safe random and uploaded as a Worker secret. Document the rotation cadence (recommended quarterly) and the procedure (set new secret, redeploy, old tokens fail next request — refresh-token endpoint mints new ones).

### 3.3 (P1) Decommission the legacy Pages project
- Cloudflare Pages project `open-energy-platform` (id `14238833-47b8-4dda-94b8-5c7b04d53703`) still exists and is connected to the GitHub repo. A push to `main` could trigger a Pages build that, while now deployed without the custom domain, would still consume CI/CD slot and potentially serve at `open-energy-platform.pages.dev`. Disable the Pages project's git integration or delete the project once you're sure no scripts reference it.

### 3.4 (P2) Stitch chrome migration
- 4 of 35 pages (Cockpit, Trading, Carbon, Funds, Procurement, ESG) use the new `StitchPage` chrome with consistent eyebrow + title + tab + actions layout.
- Remaining ~30 still use ad-hoc per-page chrome. They render correctly with the OE palette via the legacy Tailwind aliases, but the headline/section pattern is inconsistent.
- Each page is a 5–15 minute migration: wrap in `<StitchPage>`, swap inline gradients/cards for `<StitchCard>`/`<StitchKpi>`/`<StitchPill>`.

### 3.5 (P2) JS bundle size
- 1.5 MB single chunk; gzip 437 KB. Acceptable on broadband but slow on 3G.
- Add `manualChunks` to `vite.config.ts`: split `recharts`, `lucide-react`, `jspdf`, `html2canvas` into vendor chunks. Expected drop to ~600 KB main bundle.

### 3.6 (P3) Document the support role landing
- The support role exists in seeds but its dedicated `/support` deep-page hasn't been audited. Most support actions go through `/admin/monitoring` + `/support` impersonation flow.

### 3.7 (P3) Verify cron triggers actually run
- `wrangler tail` against the Worker should show the */15 surveillance scan, hourly mark-price VWAP, daily metering rollup. Not validated in this session — observed via `wrangler deployments list` that triggers are bound, but their successful execution wasn't confirmed.

---

## 4. Pre-launch checklist (hard launch)

- [ ] Close all P1 issues in §3
- [ ] Decommission legacy Pages project (§3.3)
- [ ] Rotate the Cloudflare Global API key shared in chat (security hygiene)
- [ ] Document JWT_SECRET rotation policy and add to ops runbook
- [ ] Tail `wrangler tail` for 24h to observe cron firings + error rate
- [ ] Run a load test (k6 harness exists at `tests/load/`) at expected peak — match SA grid trading hour profile
- [ ] Tighten role gates that currently allow admin-by-default (e.g. confirm `regulator` can't write to `/api/admin/*`)
- [ ] Confirm SSO end-to-end with a real Microsoft Entra tenant (`AZURE_AD_CLIENT_SECRET` set as a Worker secret)
- [ ] Snapshot D1 to R2 (the `/api/data-tier/snapshot` and `/api/backup/run` paths exist) — run a backup-restore drill
- [ ] POPIA: confirm the 30-day breach notification timeline is wired (briefing fires + admin escalation cascades)
- [ ] Migrate remaining ~30 pages to StitchPage chrome (§3.4)
- [ ] Code-split the SPA bundle (§3.5)
- [ ] Cache-bust strategy for SPA — the index.html `cache-control: must-revalidate` is correct; verify on real cold load

---

## 5. Operational runbook (excerpt)

### Deploy
```bash
./deploy.sh      # builds SPA, dry-runs wrangler, deploys
```

### Roll back
```bash
wrangler deployments list
wrangler rollback <previous-version-id>
```

### Apply a new migration
```bash
wrangler d1 migrations apply open-energy-db --remote
# If `migrations apply` lists as "applied" but tables are missing, force-run:
wrangler d1 execute open-energy-db --remote --file=migrations/NNN.sql
```

### Live tail
```bash
wrangler tail --format pretty
```

### Reset a JWT secret
```bash
echo "$(python3 -c 'import secrets; print(secrets.token_urlsafe(64))')" | wrangler secret put JWT_SECRET
wrangler deploy   # forces all running isolates to pick up the new secret
```

### Smoke test (5 minutes)
```bash
BASE="https://oe.vantax.co.za"
TOKEN=$(curl -s -X POST -H "Content-Type: application/json" \
  -d '{"email":"admin@openenergy.co.za","password":"Demo@2024!"}' \
  "$BASE/api/auth/login" | jq -r .data.token)
for p in /api/cockpit /api/contracts /api/projects /api/ona/sites \
         /api/trading/orderbook /api/carbon/credits /api/funder/summary \
         /api/procurement/rfps /api/lois /api/marketplace/listings; do
  echo "$(curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $TOKEN" "$BASE$p")  $p"
done
```

---

## 6. Sign-off matrix

| Domain | Owner | Status | Notes |
|---|---|---|---|
| Auth & identity | Platform | ✅ ready | JWT, SSO config endpoint, MFA setup endpoints all wired |
| Trading & risk | Platform | ✅ ready | All 12 trader endpoints respond after migration recovery |
| Carbon | Platform | ✅ ready | 4/5 carbon endpoints work; `/options` greeks are stubs (acceptable v1) |
| Procurement | Platform | ✅ ready | RFP → bid → evaluate → award → LOI flow E2E-tested |
| Lender / funder | Platform | ✅ ready | Cash waterfall + disbursement E2E-tested after body-shape fix |
| ASOBA / O&M | Platform | ✅ ready | Live proxy, sync, cascade promotion all working |
| Regulator | Platform | ⚠ partial | Workbench tabs are wired; `market-summary` 500 (P1) |
| Grid operator | Platform | ✅ ready | Imbalance, wheeling, overview all 200; ancillary tables now exist |
| Admin | Platform | ⚠ partial | Core admin works; monitoring DLQ + cron-health 500 (P1) |
| POPIA | Platform | ✅ ready | All 22 POPIA endpoints respond; breach + DSAR flows wired |
| Brand & design | Design | ⚠ partial | OE colours + typography applied platform-wide; StitchPage chrome on 6/35 pages (§3.4) |
| Infra & ops | DevOps | ✅ ready | Custom domain bound, secrets set, cron triggers active |
| Data integrity | Data | ✅ ready | 204 tables, 37 migrations clean, R2 vault ready, JWT secret rotated |
| Documentation | Platform | ✅ ready | This document, README, NATIONAL_DEPLOYMENT_EVALUATION, TESTING_VALIDATION_CHECKLIST all current |

---

**Recommendation:** Soft-launch immediately with internal stakeholders, regulator demos, and pilot offtakers. Run two weeks of `wrangler tail` + load tests + the §3 fixes in parallel. Hard-launch on `oe.vantax.co.za` when the four P1 items in §3.1–3.3 are closed.

</details>
