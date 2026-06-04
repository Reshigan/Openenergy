-- W174: IPP Local Content (LC) Report Lifecycle
-- REIPPPP local-content compliance reporting chain per quarter:
-- period_open → data_collection → internal_verification → report_preparation →
-- report_submitted → completeness_check → clarification_requested →
-- clarification_submitted → technical_assessment →
-- compliant / non_compliant / conditional_compliance.
--
-- 17 columns (18 including updated_at):
--   id, project_ref, report_quarter, lc_commitment_pct, lc_tier,
--   lc_achieved_pct, sed_commitment_zar, sed_achieved_zar, lc_content_type,
--   chain_status, sla_due_date, sla_breached, is_reportable,
--   actor_party, reason, notes,
--   created_at, updated_at

CREATE TABLE IF NOT EXISTS oe_ipp_lc_reports (
  id                  TEXT    PRIMARY KEY,
  project_ref         TEXT    NOT NULL,
  report_quarter      TEXT    NOT NULL,
  lc_commitment_pct   REAL    NOT NULL,
  lc_tier             TEXT    NOT NULL CHECK(lc_tier IN ('low','medium','high','premium')),
  lc_achieved_pct     REAL,
  sed_commitment_zar  REAL,
  sed_achieved_zar    REAL,
  lc_content_type     TEXT    NOT NULL DEFAULT 'goods'
                              CHECK(lc_content_type IN ('goods','services','labour','sed','enterprise_dev','ownership')),
  chain_status        TEXT    NOT NULL DEFAULT 'period_open'
                              CHECK(chain_status IN (
                                'period_open','data_collection','internal_verification',
                                'report_preparation','report_submitted','completeness_check',
                                'clarification_requested','clarification_submitted',
                                'technical_assessment','compliant','non_compliant',
                                'conditional_compliance'
                              )),
  sla_due_date        TEXT,
  sla_breached        INTEGER NOT NULL DEFAULT 0,
  is_reportable       INTEGER NOT NULL DEFAULT 0,
  actor_party         TEXT,
  reason              TEXT,
  notes               TEXT,
  created_at          TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at          TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_ipp_lc_reports_project
  ON oe_ipp_lc_reports(project_ref);

CREATE INDEX IF NOT EXISTS idx_ipp_lc_reports_status
  ON oe_ipp_lc_reports(chain_status);

CREATE INDEX IF NOT EXISTS idx_ipp_lc_reports_sla
  ON oe_ipp_lc_reports(sla_due_date)
  WHERE sla_breached = 0;

-- 12 seed rows, one per state.
-- Column order:
--  1:id  2:project_ref  3:report_quarter  4:lc_commitment_pct  5:lc_tier
--  6:lc_achieved_pct  7:sed_commitment_zar  8:sed_achieved_zar  9:lc_content_type
--  10:chain_status  11:sla_due_date  12:sla_breached  13:is_reportable
--  14:actor_party  15:reason  16:notes
--  17:created_at  18:updated_at

INSERT OR IGNORE INTO oe_ipp_lc_reports VALUES
  (
    -- period_open: low tier goods — quarter just opened, no data yet
    'lc_001',
    'WIND-NCLNG-001',
    'Q2-2026',
    35.0,
    'low',
    NULL,
    75000.0,
    NULL,
    'goods',
    'period_open',
    datetime('now', '+45 days'),
    0,
    0,
    'p_ipp_dev_001',
    NULL,
    'Q2-2026 reporting window opened. Target LC 35% goods supply chain.',
    '2026-06-01T08:00:00Z',
    '2026-06-04T08:00:00Z'
  ),
  (
    -- data_collection: medium tier services — gathering supplier attestations
    'lc_002',
    'SOLAR-PV-NPE-002',
    'Q1-2026',
    48.0,
    'medium',
    NULL,
    120000.0,
    NULL,
    'services',
    'data_collection',
    datetime('now', '+30 days'),
    0,
    0,
    'p_ipp_dev_001',
    NULL,
    'Collecting B-BBEE affidavits and supplier LC certificates from 14 subcontractors.',
    '2026-05-01T08:00:00Z',
    '2026-05-28T14:00:00Z'
  ),
  (
    -- internal_verification: high tier labour — cross-checking payroll vs LC register
    'lc_003',
    'WIND-KAROO-003',
    'Q4-2025',
    58.0,
    'high',
    41.2,
    180000.0,
    165000.0,
    'labour',
    'internal_verification',
    datetime('now', '+21 days'),
    0,
    0,
    'p_ipp_dev_001',
    NULL,
    'Internal audit cross-referencing CIPC registration numbers against LC register.',
    '2026-04-10T08:00:00Z',
    '2026-05-20T11:00:00Z'
  ),
  (
    -- report_preparation: premium tier sed — drafting quarterly LC report for submission
    'lc_004',
    'SOLAR-CSP-LIM-004',
    'Q4-2025',
    68.0,
    'premium',
    53.8,
    650000.0,
    612000.0,
    'sed',
    'report_preparation',
    datetime('now', '+14 days'),
    0,
    0,
    'p_ipp_dev_001',
    NULL,
    'Compiling REIPPPP Annex 9 LC Report. SED spend verified against NPO receipts.',
    '2026-04-01T08:00:00Z',
    '2026-05-15T13:00:00Z'
  ),
  (
    -- report_submitted: medium tier enterprise_dev — awaiting DTIC completeness check
    'lc_005',
    'WIND-NCLNG-005',
    'Q3-2025',
    52.0,
    'medium',
    50.1,
    95000.0,
    91500.0,
    'enterprise_dev',
    'report_submitted',
    datetime('now', '+10 days'),
    0,
    0,
    'p_ipp_dev_001',
    NULL,
    'Report lodged with DTIC LC portal on 2026-05-10. Reference DTIC-LC-2026-00421.',
    '2026-03-15T08:00:00Z',
    '2026-05-10T16:00:00Z'
  ),
  (
    -- completeness_check: low tier ownership — DTIC reviewing submission package
    'lc_006',
    'SOLAR-PV-EC-006',
    'Q3-2025',
    38.0,
    'low',
    36.4,
    55000.0,
    52000.0,
    'ownership',
    'completeness_check',
    datetime('now', '+7 days'),
    0,
    0,
    'p_ipp_dev_002',
    NULL,
    'DTIC completeness check in progress. 48-hour window before clarification or acceptance.',
    '2026-02-20T08:00:00Z',
    '2026-04-28T09:00:00Z'
  ),
  (
    -- clarification_requested: high tier goods — DTIC queried two supplier certificates
    'lc_007',
    'WIND-KAROO-007',
    'Q2-2025',
    60.0,
    'high',
    57.3,
    200000.0,
    188000.0,
    'goods',
    'clarification_requested',
    datetime('now', '+5 days'),
    0,
    1,
    'p_ipp_dev_002',
    'Supplier SABS certificates for tower flanges expired prior to procurement date.',
    'DTIC ref DTIC-CLR-2026-00088. Two supplier SABS certs require current-dated replacements.',
    '2026-01-10T08:00:00Z',
    '2026-04-15T10:00:00Z'
  ),
  (
    -- clarification_submitted: premium tier services — responded to DTIC query
    'lc_008',
    'SOLAR-CSP-LIM-008',
    'Q2-2025',
    70.0,
    'premium',
    67.9,
    720000.0,
    705000.0,
    'services',
    'clarification_submitted',
    datetime('now', '+8 days'),
    0,
    0,
    'p_ipp_dev_002',
    NULL,
    'Reissued SABS certs uploaded. Replacement supplier affidavits notarised and submitted.',
    '2025-12-05T08:00:00Z',
    '2026-03-22T14:00:00Z'
  ),
  (
    -- technical_assessment: medium tier labour — DTIC evaluator conducting site verification
    'lc_009',
    'WIND-NCLNG-009',
    'Q1-2025',
    45.0,
    'medium',
    43.6,
    110000.0,
    107000.0,
    'labour',
    'technical_assessment',
    datetime('now', '+12 days'),
    0,
    1,
    'p_ipp_dev_002',
    NULL,
    'DTIC technical evaluator conducting payroll sampling. Site visit scheduled 2026-06-07.',
    '2025-10-01T08:00:00Z',
    '2026-03-05T11:00:00Z'
  ),
  (
    -- compliant (terminal): high tier enterprise_dev — LC commitment met and certified
    'lc_010',
    'SOLAR-PV-NPE-010',
    'Q4-2024',
    62.0,
    'high',
    64.1,
    195000.0,
    201000.0,
    'enterprise_dev',
    'compliant',
    datetime('now', '+90 days'),
    0,
    0,
    'p_ipp_dev_001',
    'LC commitment met. Achieved 64.1% against 62.0% target.',
    'DTIC Certificate of LC Compliance issued. Ref DTIC-COMP-2025-00312.',
    '2025-07-01T08:00:00Z',
    '2026-01-18T15:00:00Z'
  ),
  (
    -- non_compliant (terminal): low tier ownership — shortfall exceeded cure threshold
    'lc_011',
    'WIND-EC-011',
    'Q3-2024',
    36.0,
    'low',
    28.4,
    60000.0,
    38000.0,
    'ownership',
    'non_compliant',
    datetime('now', '-10 days'),
    1,
    1,
    'p_ipp_dev_003',
    'LC achieved 28.4% — 7.6 percentage points below 36% commitment. SED shortfall R22 000.',
    'Penalty calculation underway per REIPPPP BPA Schedule 4. DMRE notified.',
    '2025-04-15T08:00:00Z',
    '2025-12-10T16:00:00Z'
  ),
  (
    -- conditional_compliance: premium tier sed — compliant subject to make-good plan
    'lc_012',
    'SOLAR-CSP-NC-012',
    'Q2-2024',
    72.0,
    'premium',
    69.3,
    800000.0,
    760000.0,
    'sed',
    'conditional_compliance',
    datetime('now', '+60 days'),
    0,
    1,
    'p_ipp_dev_003',
    'LC achieved 69.3% against 72.0% target. SED shortfall R40 000 to be made good in Q3-2026.',
    'DTIC issued conditional certificate pending make-good plan submission by 2026-08-31.',
    '2025-02-01T08:00:00Z',
    '2025-10-22T13:00:00Z'
  );
