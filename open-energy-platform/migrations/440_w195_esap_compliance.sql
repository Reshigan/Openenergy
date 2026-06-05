-- Wave 195: ESAP Compliance Monitoring
-- IFC Performance Standards 2012 + Equator Principles 4 + SARB + OHSA s8
-- Environmental and Social Action Plan (ESAP) compliance lifecycle for
-- project finance lending to energy infrastructure in South Africa.

CREATE TABLE IF NOT EXISTS oe_esap_compliance (
  id                     TEXT PRIMARY KEY,
  chain_status           TEXT NOT NULL DEFAULT 'monitoring_period_open',
  sla_deadline           TEXT,
  sla_breached           INTEGER NOT NULL DEFAULT 0,
  regulator_notified     INTEGER NOT NULL DEFAULT 0,
  actor_id               TEXT,
  reason                 TEXT,
  -- Business fields
  project_id             TEXT NOT NULL,
  reporting_period       TEXT NOT NULL,
  commitment_tier        TEXT NOT NULL CHECK (commitment_tier IN ('systemic','major','significant','minor','routine')),
  es_monitor_id          TEXT,
  finding_count_minor    INTEGER NOT NULL DEFAULT 0,
  finding_count_major    INTEGER NOT NULL DEFAULT 0,
  remediation_deadline   TEXT,
  breach_basis           TEXT,
  -- Timestamps
  created_at             TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at             TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_esap_compliance_status     ON oe_esap_compliance(chain_status);
CREATE INDEX IF NOT EXISTS idx_esap_compliance_project    ON oe_esap_compliance(project_id);
CREATE INDEX IF NOT EXISTS idx_esap_compliance_tier       ON oe_esap_compliance(commitment_tier);
CREATE INDEX IF NOT EXISTS idx_esap_compliance_sla        ON oe_esap_compliance(sla_deadline, sla_breached);
CREATE INDEX IF NOT EXISTS idx_esap_compliance_created    ON oe_esap_compliance(created_at);

-- ─── Seed data ────────────────────────────────────────────────────────────────
-- 12 rows covering all 12 states, commitment_tier varied

INSERT INTO oe_esap_compliance
  (id, chain_status, project_id, reporting_period, commitment_tier,
   es_monitor_id, finding_count_minor, finding_count_major,
   remediation_deadline, breach_basis,
   sla_deadline, sla_breached, regulator_notified,
   actor_id, reason, created_at, updated_at)
VALUES

-- 1. monitoring_period_open — systemic tier, just opened
('esap-001',
 'monitoring_period_open',
 'PROJ-WIND-001', '2025-H2', 'systemic',
 'ESM-IFC-001', 0, 0, NULL, NULL,
 '2025-12-31', 0, 0,
 'admin@openenergy.co.za',
 'Semi-annual ESAP monitoring period opened for Goldrush Wind Farm Phase 2',
 '2025-07-01 08:00:00', '2025-07-01 08:00:00'),

-- 2. data_collection — major tier
('esap-002',
 'data_collection',
 'PROJ-SOLAR-002', '2025-Q3', 'major',
 'ESM-EQ4-002', 2, 0, NULL, NULL,
 '2025-09-30', 0, 0,
 'ipp@openenergy.co.za',
 'IPP submitting quarterly E&S performance data — water use, community incidents, H&S stats',
 '2025-07-01 09:00:00', '2025-07-03 10:30:00'),

-- 3. site_verification — significant tier
('esap-003',
 'site_verification',
 'PROJ-STORAGE-003', '2025-Q2', 'significant',
 'ESM-EP4-003', 1, 0, NULL, NULL,
 '2025-08-15', 0, 0,
 'lender@openenergy.co.za',
 'ES Monitor on-site visit scheduled — battery storage facility EP4 Category B audit',
 '2025-07-01 10:00:00', '2025-07-10 14:00:00'),

-- 4. draft_report — major tier
('esap-004',
 'draft_report',
 'PROJ-WIND-004', '2025-H1', 'major',
 'ESM-IFC-004', 3, 1, NULL, NULL,
 '2025-09-01', 0, 0,
 'lender@openenergy.co.za',
 'Draft ESAP monitoring report in preparation — 3 minor, 1 major finding identified during site visit',
 '2025-03-01 08:00:00', '2025-07-15 16:00:00'),

-- 5. lender_review — systemic tier
('esap-005',
 'lender_review',
 'PROJ-SOLAR-005', '2024-H2', 'systemic',
 'ESM-IFC-005', 0, 2, NULL, NULL,
 '2025-03-31', 0, 0,
 'lender@openenergy.co.za',
 'Lender E&S team reviewing draft monitoring report — 2 major findings under IFC PS6 (biodiversity)',
 '2024-07-01 08:00:00', '2025-02-20 11:00:00'),

-- 6. minor_findings — minor tier
('esap-006',
 'minor_findings',
 'PROJ-STORAGE-006', '2025-Q1', 'minor',
 'ESM-LOCAL-006', 4, 0, NULL, NULL,
 '2025-06-30', 0, 0,
 'lender@openenergy.co.za',
 'Four minor OHSA s8 H&S documentation gaps identified — corrective action tracked',
 '2025-01-15 09:00:00', '2025-04-01 10:00:00'),

-- 7. accepted — routine tier (terminal +, clean close)
('esap-007',
 'accepted',
 'PROJ-WIND-007', '2024-Q4', 'routine',
 'ESM-LOCAL-007', 1, 0, NULL, NULL,
 '2025-01-15', 0, 0,
 'lender@openenergy.co.za',
 'Minor documentation gap remediated. Annual ESAP monitoring period closed clean.',
 '2024-10-01 08:00:00', '2025-01-10 14:30:00'),

-- 8. major_findings — major tier
('esap-008',
 'major_findings',
 'PROJ-SOLAR-008', '2024-H2', 'major',
 'ESM-EQ4-008', 2, 3, NULL, NULL,
 '2025-06-01', 0, 1,
 'lender@openenergy.co.za',
 'Major findings: EP4 PS1 management system deficiency + PS2 labour conditions + PS3 pollution prevention. Action plan required.',
 '2024-07-01 09:00:00', '2025-03-15 16:00:00'),

-- 9. action_plan_required — systemic tier (sla_breached due to long-running issue)
('esap-009',
 'action_plan_required',
 'PROJ-WIND-009', '2023-H2', 'systemic',
 'ESM-IFC-009', 1, 5, '2025-09-30', NULL,
 '2024-03-31', 1, 1,
 'lender@openenergy.co.za',
 'Systemic E&S management failures. Action plan required covering PS1 through PS6. Regulator notified under SARB BA 2017-01.',
 '2023-07-01 08:00:00', '2024-04-15 09:00:00'),

-- 10. action_plan_submitted — major tier
('esap-010',
 'action_plan_submitted',
 'PROJ-STORAGE-010', '2024-H1', 'major',
 'ESM-EQ4-010', 0, 2, '2025-08-31', NULL,
 '2024-09-30', 0, 1,
 'ipp@openenergy.co.za',
 'Action plan submitted: PS3 spill response upgrade + PS6 rare-species monitoring programme. Remediation by 31 Aug 2025.',
 '2024-03-01 10:00:00', '2025-01-20 11:30:00'),

-- 11. verified — significant tier (terminal +, post-remediation close)
('esap-011',
 'verified',
 'PROJ-SOLAR-011', '2024-Q2', 'significant',
 'ESM-EP4-011', 0, 1, '2024-12-31', NULL,
 '2024-08-15', 0, 0,
 'lender@openenergy.co.za',
 'All action plan items remediated and verified on-site. ESAP compliance restored. Monitoring period closed.',
 '2024-04-01 09:00:00', '2025-01-05 15:00:00'),

-- 12. breach_declared — systemic tier (terminal -, regulator notified)
('esap-012',
 'breach_declared',
 'PROJ-WIND-012', '2022-H2', 'systemic',
 'ESM-IFC-012', 0, 8, NULL,
 'Persistent PS1 management system failure; failure to implement action plan within agreed timeframe; material PS6 biodiversity offsets not maintained',
 '2023-03-31', 1, 1,
 'lender@openenergy.co.za',
 'ESAP covenant breach declared. Regulator notified: SARB, NERSA, DFFE. Feeding W38 Covenant Certificate and W45 Loan Default chain.',
 '2022-07-01 08:00:00', '2023-07-01 10:00:00');
