# W135 PRODUCTION READINESS — SHIP BRIEF

PHASE E WAVE 5 OF 5 — TERMINAL WAVE OF WORLD-CLASS ARC. Bakes oe.vantax.co.za into something an on-call human can run at 03:00 SAST with a runbook in hand. 80% docs/evidence, 15% gap-fill code, 5% admin UI for attestation cycle. After W135 commits, wave grind closes; pivot to W136+ UX direction pick from `ux-alternatives/`.

## Six workstreams

### A. Observability
- `src/utils/observability.ts` — `emit({kind,route,status,latency_ms,...tags})` writes AE + buffered KV counter (5min bucket → `oe_metrics_5min` rolled hourly)
- `src/routes/admin/metrics.ts` — GET `/summary` (5m/1h/24h counters), `/route/:route` (p50/p95/p99), `/cascade` (DLQ depth), `/cron` (drift)
- `pages/src/components/admin/ObservabilityDashboard.tsx` — live counters auto-refresh 15s, 24h sparklines (recharts), SLO traffic-light row
- `wrangler.toml`: `[[analytics_engine_datasets]] binding="AE" dataset="oe_metrics"`
- `src/index.ts`: AE-emission middleware after `requestLogger`; hook `fireCascade` + `runCron`
- `docs/ops/SLOs.md`: availability 99.9%/mo, p50<200ms, p95<800ms, p99<1500ms, error<0.5%, DLQ<100 sustained, cron drift <2×, no W118 integrity-fail/24h

### B. Alerting
- `src/utils/alerting.ts` — `evaluateThresholds(env): Promise<Alert[]>`
- `src/routes/admin/alerts.ts` — GET list, POST `/:id/ack`, POST `/:id/resolve`, POST `/test`
- `scripts/alert-check.ts` — invoked `*/5 * * * *` cron, INSERTs into `oe_alerts`, posts to Slack `SLACK_WEBHOOK_URL` + email `OPS_EMAIL_TO`
- `pages/src/components/admin/AlertConsole.tsx`
- 8 initial rules: `error_rate_5xx_high` P1 (>1%/5m), `cascade_dlq_deep` P1 (>500), `jwt_auth_fail_burst` P2 (>10/min), `regulator_inbox_stale` P2 (>24h), `cron_skip` P2 (>2× interval), `audit_chain_integrity_fail` P1, `latency_p99_degraded` P3 (>1500ms/15m), `d1_quota_warning` P2 (>80% daily quota)

### C. Runbooks (10 files in `docs/ops/runbooks/`)
Template per file: Symptom → Diagnose (commands) → Decision tree → Recover (commands) → Verify (commands) → Postmortem template.
1. D1_RECOVERY.md (D1 5xx burst / audit-chain integrity fail)
2. R2_VAULT_RECOVERY.md (vault read fail, bucket versioning restore)
3. KV_CORRUPTION_RECOVERY.md (namespace `aa6172248d474199a39c5f6aeafb2ec2`, `wrangler kv:bulk` restore)
4. WORKER_ROLLBACK.md (`wrangler deployments list`, `wrangler rollback`, dual-deploy)
5. AUDIT_CHAIN_INTEGRITY_FAIL.md (call verifyChain(), freeze chain via admin, replay-vs-restore)
6. CASCADE_DLQ_DRAIN.md (replay via `/api/admin/cascade/dlq/replay`, batch ≤50/min)
7. JWT_SECRET_ROTATION.md (quarterly, `wrangler secret put`, watch 401 burst dissipate)
8. RATE_LIMIT_TUNING.md (when to bump 10/5min/IP, per-tenant exception via KV)
9. REGULATOR_INBOX_BACKLOG.md (per-chain inbox surface map, NERSA service-incident upstream)
10. INCIDENT_COMMS.md (P1 protocol, POPIA 72h clock, customer email template, comms every 30m)

### D. DR drill (executed against staging)
1. Pre-flight snapshot (`wrangler d1 export`, note Worker version, audit-chain head)
2. Force read-only (`OE_READ_ONLY=1` secret, redeploy, verify writes 503)
3. Worker rollback (`wrangler rollback <prev>`, verify `/health/deep` 200)
4. Cascade replay from R2 archive
5. Audit chain integrity post-recovery
6. Restore writes
7. RTO/RPO measurement (target RTO<1h, RPO<5min)

Files:
- `docs/ops/DR_DRILL_2026_06.md` — honest writeup
- `scripts/dr-drill.sh` — automates steps, prompts at destructive
- `pages/src/components/admin/DrDrillConsole.tsx`
- Cron `0 9 1 */3 *` quarterly DR drill against shadow

### E. Feature flags + gradual rollout
Migration 355 `feature_flags.sql`:
```sql
CREATE TABLE IF NOT EXISTS oe_feature_flags (
  id TEXT PRIMARY KEY, description TEXT,
  default_state TEXT NOT NULL DEFAULT 'off',
  rollout_percent INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, updated_by TEXT
);
CREATE TABLE IF NOT EXISTS oe_feature_flag_overrides (
  id TEXT PRIMARY KEY, flag_id TEXT NOT NULL,
  scope_kind TEXT NOT NULL,    -- tenant|persona|user
  scope_value TEXT NOT NULL, state TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
```
- `src/utils/flags.ts` — `isEnabled(env, flagId, {tenantId, persona, userId})` KV-cached 30s, D1 fallback, hash-bucket userId for `percent`
- `src/routes/admin/feature-flags.ts` — list, PUT default/percent, POST/DELETE overrides
- `pages/src/components/admin/FeatureFlagPanel.tsx` — % slider + persona/tenant override + emergency-off
- Proof-of-flag: gate W127 ML serving behind `w127_ml_anomaly_v2` (fall back to W71 heuristic when off)
- Rollout: D0 1% → D1 10% → D3 50% → D7 100% if no SLO breach; auto-rollback if `slo_breach_post_rollout` correlated with flag promotion

### F. Go-live ledger (honest rewrite)
Full rewrite of `/Users/reshigan/Openenergy/GO_LIVE_READINESS.md`:
1. Verdict header — "PRODUCTION-READY for tiered rollout. Trader+IPP+Lender+Regulator T+0; Carbon+Grid+Offtaker+Wind+Support T+30/T+60/T+90"
2. Wave ledger W1-W134 — table per wave: SHIPPED+PROD-VERIFIED / SHIPPED+QUEUED / FLAGGED / OUT-OF-SCOPE
3. Per-persona launch matrix (readiness, launch wave, gating)
4. Top-30 caveats — known limits, owner, ETA, mitigation, linked runbook
5. Operational readiness checklist (post-W135): observability ✅, 8 alert rules ✅, 10 runbooks ✅, DR drill RTO<1h/RPO<5min ✅, flag store + W127 proof ✅, capacity plan ✅, on-call rotation ✅, JWT rotation ✅, quarterly DR cron ✅
6. Sign-off matrix per-domain
7. Final declaration: world-class achieved, pivoting to W136+ UX direction pick

## Files to create
**Backend:**
- `src/routes/admin/{metrics,alerts,feature-flags}.ts`
- `src/utils/{observability,alerting,flags}.ts`

**Migrations (next free: 354/355/356 — 345 was last head):**
- `migrations/354_observability_alerts.sql` — `oe_alerts` + `oe_alert_subscriptions`
- `migrations/355_feature_flags.sql` — `oe_feature_flags` + `oe_feature_flag_overrides`
- `migrations/356_metrics_aggregates.sql` — `oe_metrics_5min` + `oe_metrics_24h`

**SPA admin panels (new dir `pages/src/components/admin/`):**
- `ObservabilityDashboard.tsx`, `AlertConsole.tsx`, `FeatureFlagPanel.tsx`, `DrDrillConsole.tsx`

**Runbooks (10):** see workstream C

**Ops docs:**
- `docs/ops/SLOs.md`, `DR_DRILL_2026_06.md`, `CAPACITY_PLAN.md`, `ON_CALL_ROTATION.md`

**Scripts:**
- `scripts/alert-check.ts` (Worker cron), `dr-drill.sh`, `capacity-snapshot.sh`

## Files to modify
- `wrangler.toml`: AE binding, crons `*/5 * * * *` (alerts) + `0 9 1 */3 *` (DR drill)
- `src/index.ts`: mount 3 admin routes, AE-emission middleware, hook `runCron`+`fireCascade`, dispatch 2 new crons
- `src/utils/cascade.ts`: `emit(env, {kind:'cascade',...})` at fan-out boundaries
- `pages/src/components/pages/AdminWorkstationPage.tsx`: mount 4 new tabs
- `/Users/reshigan/Openenergy/GO_LIVE_READINESS.md`: full honest rewrite

## Verify
```bash
cd open-energy-platform
npm run check && npm run check:pages
npm test
# Manual: 5xx burst staging → Slack ping <5min
# Manual: toggle w127 flag → round-trip <30s globally
# Manual: DR drill staging → RTO<1h / RPO<5min
# Manual: GO_LIVE_READINESS ≥95% PASS

TOKEN=$(login_or_cached admin@openenergy.co.za Demo@2024!)
for p in /api/admin/metrics/summary /api/admin/alerts /api/admin/flags; do
  curl -s -o /dev/null -w "%{http_code}  $p\n" -H "Authorization: Bearer $TOKEN" "https://oe.vantax.co.za$p"
done
```

## Commit message
`feat(w135): production-readiness — observability, alerts, 10 runbooks, DR drill (RTO<1h/RPO<5min), feature flags, gradual rollout, honest go-live ledger; closes Phase E 5/5 — world-class achieved`

## Out-of-scope (Phase F+)
- Multi-region active/active
- Chaos-engineering automation
- SLA-backed customer contracts
- 24/7 staffed NOC
- Custom SIEM beyond existing forwarders
- Per-customer dedicated D1 shards

## Gotchas
- Protected dirty-tree skip list — target `git add` only on W135 files
- `login_or_cached admin@openenergy.co.za` FULL email
- Demo password `Demo@2024!`
- D1 migrations 354/355/356 idempotent (`CREATE TABLE IF NOT EXISTS`) — post-051 normal band
- JWT role: `role === 'admin'` matches existing cron precedent
- AUDIT_PREFIX_MAP: alerts/flags stay in their own tables, no chain emit
- CF edge cache: 4 new SPA tabs covered by existing `_headers no-store on /*`
- Hono basePath: flat mounts, no `:param` collisions
