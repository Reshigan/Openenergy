# W134 ISO 27001 + SOC 2 — SHIP BRIEF

PHASE E WAVE 4 OF 5. 80% docs/evidence, 15% code patches, 5% admin UI. Compiles auditor-readable evidence over the 134 prior waves; closes 7 ISO/SOC gaps; automates recurrence.

## Inheritance posture
- Cloudflare SOC 2 Type II + ISO 27001 + ISO 27018 + PCI DSS → A.7 Physical, A.8.6/8.12 DC ops, CC6 physical, Availability
- GitHub SOC 2 Type II → source-control integrity
- Anthropic SOC 2 Type II → AI subprocessor
- POPIA already covers SA legal duty via W26 cyber-incident + s.22/s.23 vault traceability

## ISO 27001:2022 Annex A coverage (93 controls)
- **A.5 Organizational (37)**: 27 PASS / 7 GAP / 3 N/A — GAPs: A.5.1/5.2/5.4/5.7/5.10/5.18/5.19/5.20/5.29/5.30/5.35
- **A.6 People (8)**: 5 PASS / 3 GAP — GAPs: A.6.1/6.2/6.3
- **A.7 Physical (14)**: all 14 PASS (inherited Cloudflare SOC 2)
- **A.8 Technological (34)**: 28 PASS / 5 GAP / 1 N/A — GAPs: A.8.13/8.25/8.28/8.32

## SOC 2 TSC mapping
In scope: Security + Availability + Confidentiality + Processing Integrity (Privacy deferred — POPIA covers SA)
- CC1.2 board oversight → quarterly board IS report
- CC1.4 competence → A.6.3 training (GAP)
- CC3.1 risk register top-30 (NEW)
- CC6.3 access removal → quarterly access review (NEW)
- CC7.5 recovery → BCP DR runbook (NEW)
- CC8.1 change auth → `oe_change_records` + GH Actions hook (NEW)
- CC9.2 vendor risk → `oe_vendor_assessments` (NEW)

## Files to create

### Backend routes
- `src/routes/admin/audit-export.ts`:
  - `POST /signed-export` body `{start_date, end_date, framework: iso27001|soc2|both, format: csv|ndjson}` → assembles bundle (NDJSON events + MANIFEST.json sha256 + INTEGRITY.txt re-verifying chain to genesis + MAPPING.csv to control IDs) → R2 `evidence-packs/{request_id}/...` → 1-hour signed URL
  - Requires `requireStepUp('audit.export.high')`, admin role only
  - Emits `audit.evidence_pack_exported` with sha256
- `src/routes/admin/access-review.ts`:
  - `GET /current` — open quarterly review, one row per (user,tenant,role)
  - `POST /:user_id/attest` body `{decision: keep|reduce|revoke, justification, target_role?}` → writes `oe_access_reviews`; revoke calls admin.user_suspended
  - `POST /complete` — closes cycle, requires 100% coverage
  - `GET /history` — paginated past cycles
- `src/middleware/access-review.ts` — writer helper (NOT request gate)

### Migrations
**Next free number is 346** (head is 345, NOT 353). 
- `migrations/346_iso27001_evidence_tables.sql`:
```sql
CREATE TABLE IF NOT EXISTS oe_access_reviews (
  id TEXT PRIMARY KEY, cycle_id TEXT NOT NULL,
  cycle_started_at TEXT NOT NULL, cycle_due_at TEXT NOT NULL, cycle_completed_at TEXT,
  user_id TEXT NOT NULL, tenant_id TEXT NOT NULL, role_at_review TEXT NOT NULL,
  last_login_at TEXT, attestation_decision TEXT,
  attested_by TEXT, attested_at TEXT, justification TEXT, target_role TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_oe_access_reviews_cycle ON oe_access_reviews(cycle_id);
CREATE INDEX IF NOT EXISTS idx_oe_access_reviews_user ON oe_access_reviews(user_id);

CREATE TABLE IF NOT EXISTS oe_change_records (
  id TEXT PRIMARY KEY,
  change_type TEXT NOT NULL,    -- code_deploy|config_change|data_migration|manual_db
  pr_url TEXT, pr_number INTEGER, commit_sha TEXT, branch TEXT,
  reviewer TEXT, tests_passed INTEGER, tests_failed INTEGER, ci_run_url TEXT,
  deploy_started_at TEXT, deploy_completed_at TEXT, deployer TEXT,
  rolled_back INTEGER DEFAULT 0, rollback_reason TEXT,
  rfc_id TEXT,  -- W47 link
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_oe_change_records_sha ON oe_change_records(commit_sha);
CREATE INDEX IF NOT EXISTS idx_oe_change_records_pr ON oe_change_records(pr_number);

CREATE TABLE IF NOT EXISTS oe_vendor_assessments (
  id TEXT PRIMARY KEY, vendor_name TEXT NOT NULL,
  vendor_category TEXT, criticality TEXT NOT NULL,
  data_classification_shared TEXT, soc2_report_url TEXT, soc2_report_received_at TEXT,
  iso27001_cert_url TEXT, dpa_signed_at TEXT, next_review_due_at TEXT,
  assessed_by TEXT, assessment_notes TEXT, status TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE VIEW IF NOT EXISTS oe_iso27001_incident_view AS
  SELECT id, incident_class, severity_tier, triaged_at, contained_at,
         notified_regulator_at, notified_subjects_at, closed_at, root_cause_summary
  FROM oe_cyber_incidents;
```
- `migrations/347_iso27001_evidence_tables_seed.sql` — 4 vendor rows (Cloudflare/Anthropic/GitHub/Entra) + closed 2026-Q1 access-review cycle

### Cascade patch (`src/utils/cascade.ts`)
Add EventType: `access_review.cycle_opened` / `.user_attested` / `.cycle_completed` / `.sla_breached` / `audit.evidence_pack_exported` / `.verified` / `change_record.created` / `.rolled_back` / `vendor_assessment.due` / `.completed`

Extend `fireCascade()` payload (optional): `before_state`, `after_state`, `policy_check_passed: boolean`. Stamp `timestamp_utc`. Audit-export reader tolerates missing fields, flags as "legacy event".

AUDIT_PREFIX_MAP add: `access_review_evt_: 'access_review'`, `change_record_evt_: 'change_record'`, `vendor_assessment_evt_: 'vendor_assessment'`.

### Scripts
- `scripts/iso27001-evidence-collect.sh` — login admin, POST signed-export 90d range, poll, download, verify MANIFEST sha256, exit 0/non-zero
- `scripts/iso27001-soa-render.sh` — regenerates `docs/compliance/ISO27001_SOA.md` from W121 coverage endpoint

### GitHub Actions
- `.github/workflows/change-record.yml` — on push to main, after deploy.yml success, POST `/api/admin/change-records` with PR/sha/reviewer/tests/CI url

### Frontend admin panels (NEW dir `pages/src/components/admin/`)
- `AccessReviewPanel.tsx` — KPI strip, attestation table, drawer with justification, "Complete cycle" gated until 100%
- `EvidencePackPanel.tsx` — framework toggle + date range + format → POST signed-export → polling → "Download signed URL" + sha256 + history panel

### Compliance docs (`docs/compliance/` — NEW dir)
- `ISO27001_SOA.md` — 93 controls × applicable Y/N × evidence × owner × testing frequency
- `SOC2_SYSTEM_DESCRIPTION.md` — AICPA TSP100 system description
- `INFORMATION_SECURITY_POLICY.md` — 12 sections (purpose/scope/roles/classification/access/crypto/incident/BC/supplier/compliance/exceptions/review)
- `ACCEPTABLE_USE_POLICY.md`
- `INCIDENT_RESPONSE_PLAN.md` — cross-refs W26
- `CHANGE_MANAGEMENT_POLICY.md` — `oe_change_records` + W47
- `BUSINESS_CONTINUITY_PLAN.md` — DR runbook (D1 PITR 30d, R2 versioning, RTO 4h/RPO 15min)
- `VENDOR_RISK_MANAGEMENT.md`
- `RISK_REGISTER.md` — top-30 (D1 outage / key compromise / insider / supply-chain / NERSA revocation / R2 loss / DDoS / RBAC misconfig / stale access / audit-chain tamper)
- `W134_AUDIT_READINESS.md` — PASS count, GAP open list, audit start recommendation, sign-off block

## Files to modify
- `src/utils/cascade.ts` — EventType + payload + AUDIT_PREFIX_MAP
- `src/index.ts` — mount 2 new routes
- `pages/src/components/pages/AdminWorkstationPage.tsx` — mount AccessReviewPanel + EvidencePackPanel
- `wrangler.toml` — `EVIDENCE_PACK_PREFIX="evidence-packs/"`, `EVIDENCE_PACK_SIGNED_URL_TTL_SECONDS=3600`, 2 new crons
- `GO_LIVE_READINESS.md` — link SoA + W134_AUDIT_READINESS
- `pages/public/_headers` — verify HSTS max-age ≥31536000 + includeSubDomains + preload

## Cron triggers (`wrangler.toml::[triggers]`)
- `0 6 1 */3 *` — quarterly access-review cycle open (W134.access_review.cycle_opened)
- `0 7 1 1,4,7,10 *` — quarterly evidence-pack assembly

## Verify
1. `npm run check && npm run check:pages && npm test` green
2. W134_AUDIT_READINESS shows ≥85% PASS (ISO27001 ≥80/93, SOC2 CC ≥95%)
3. GAP list ≤15 with owners + target dates
4. `curl -X POST /api/admin/audit-export/signed-export` returns 1-hour signed R2 URL; bundle MANIFEST sha256 verifies locally; INTEGRITY.txt re-derives merkle_root_chain to genesis
5. Quarterly access-review cron dry-runs via `/api/admin/cron/run`
6. GH Actions `change-record.yml` writes row to `oe_change_records` on next push; `commit_sha` matches `git rev-parse HEAD`
7. Admin workstation shows 2 new tabs (cold-load no-store verified)
8. `scripts/iso27001-evidence-collect.sh` runs end-to-end <5min, exits 0
9. `wrangler d1 migrations list --remote` shows 346/347 applied

## Commit message
`feat(w134): ISO 27001:2022 + SOC 2 Type II audit-readiness — SoA, evidence-pack endpoint, access-review cycle, change-record automation`

## Out-of-scope (Phase F)
- External ISO 27001 certification engagement (BSI/SGS/DNV/TÜV) — R-AUD-1
- SOC 2 Type II 6-month observation (post-this-wave-clean)
- Independent CREST pen test
- Bug bounty
- PCI DSS (no cardholder data)
- HIPAA (no PHI)
- GDPR (POPIA covers SA — add light adequacy note if EU customers materialize)
- SOX 404 attestation (W121 framework-supported; deferred to listed-entity readiness)

## Audit start recommendation
- Stage-1 readiness review: 2026-08-01
- SOC 2 Type II observation: 2026-08-01 → 2027-01-31 (6-month minimum)
- ISO 27001 cert: 2026-Q4 stage-1 + 2027-Q1 stage-2

## Gotchas
- **Migration number is 346/347 NOT 353** — 345 is last applied; clean post-051 band
- Protected dirty-tree: focused commit, never `--amend`
- `login_or_cached admin@openenergy.co.za` FULL email
- Demo password `Demo@2024!`
- D1 100-col limit: all 3 new tables comfortably under
- AUDIT_PREFIX_MAP 3 new prefixes — don't reuse existing buckets (per-prefix grouping is auditor read)
- CF edge cache `no-store` on `/*` covers new admin SPA tabs
- Hono mounts flat (`/api/admin/audit-export`, `/api/admin/access-review`) — no collision; curl prod after deploy anyway
- JWT role: `admin` only — verify enum
- Per-wave UX revisit SUSPENDED; don't add ux-alternatives prototype
- Pre-trade guards unchanged; `policy_check_passed` reads post-guard
