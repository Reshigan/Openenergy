-- W176: IPP Environmental & Social Management Report (ESMR) Lifecycle
-- IFC Performance Standards / Equator Principles / DFI covenants semi-annual
-- ESMR chain per project reporting period:
-- reporting_period_open → data_collection → monitoring_compilation →
-- lender_ta_review → ta_report_preparation → report_submitted →
-- lender_review → clarification_requested → clarification_submitted →
-- certificate_issued / certificate_withheld / material_breach_declared.
--
-- 17 columns (18 including updated_at):
--   id, project_ref, reporting_period, loan_size_zar, loan_tier,
--   dfi_names, lender_ta_ref, breach_category, chain_status,
--   sla_due_date, sla_breached, is_reportable,
--   actor_party, reason, notes,
--   created_at, updated_at

CREATE TABLE IF NOT EXISTS oe_ipp_esmr (
  id                  TEXT    PRIMARY KEY,
  project_ref         TEXT    NOT NULL,
  reporting_period    TEXT    NOT NULL,
  loan_size_zar       REAL    NOT NULL,
  loan_tier           TEXT    NOT NULL
                              CHECK(loan_tier IN ('small','medium','large','major','flagship')),
  dfi_names           TEXT,
  lender_ta_ref       TEXT,
  breach_category     TEXT
                              CHECK(breach_category IN (
                                'ps1_assessment','ps2_labour','ps3_pollution',
                                'ps4_community_health','ps5_land_acquisition',
                                'ps6_biodiversity','ps7_indigenous','ps8_cultural'
                              ) OR breach_category IS NULL),
  chain_status        TEXT    NOT NULL DEFAULT 'reporting_period_open'
                              CHECK(chain_status IN (
                                'reporting_period_open','data_collection',
                                'monitoring_compilation','lender_ta_review',
                                'ta_report_preparation','report_submitted',
                                'lender_review','clarification_requested',
                                'clarification_submitted','certificate_issued',
                                'certificate_withheld','material_breach_declared'
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

CREATE INDEX IF NOT EXISTS idx_ipp_esmr_project
  ON oe_ipp_esmr(project_ref);

CREATE INDEX IF NOT EXISTS idx_ipp_esmr_status
  ON oe_ipp_esmr(chain_status);

CREATE INDEX IF NOT EXISTS idx_ipp_esmr_sla
  ON oe_ipp_esmr(sla_due_date)
  WHERE sla_breached = 0;

-- 12 seed rows, one per state.
-- Column order:
--  1:id  2:project_ref  3:reporting_period  4:loan_size_zar  5:loan_tier
--  6:dfi_names  7:lender_ta_ref  8:breach_category  9:chain_status
--  10:sla_due_date  11:sla_breached  12:is_reportable
--  13:actor_party  14:reason  15:notes
--  16:created_at  17:updated_at

INSERT OR IGNORE INTO oe_ipp_esmr VALUES
  (
    -- reporting_period_open: small community wind — H1-2026 period just opened
    'esmr_001',
    'WIND-COM-NW-001',
    'H1-2026',
    120000000.0,
    'small',
    'DBSA',
    'TA-2026-001',
    NULL,
    'reporting_period_open',
    datetime('now', '+60 days'),
    0,
    0,
    'p_ipp_dev_001',
    NULL,
    'H1-2026 ESMR reporting period opened. DBSA covenant requires semi-annual submission within 60 days of period close. Environmental Officer nominated. Monitoring plan checklist distributed to site teams.',
    '2026-06-01T08:00:00Z',
    '2026-06-01T08:00:00Z'
  ),
  (
    -- data_collection: medium solar farm — H2-2025 period, on-site monitoring data being gathered
    'esmr_002',
    'SOLAR-NPE-MED-002',
    'H2-2025',
    380000000.0,
    'medium',
    'IFC',
    'TA-2026-002',
    NULL,
    'data_collection',
    datetime('now', '+45 days'),
    0,
    0,
    'p_ipp_dev_002',
    NULL,
    'H2-2025 data collection under way. IFC PS3 ambient air quality and PS2 labour grievance log extracted from site HSSE system. Water-use data from DWS monitoring stations collated. Community liaison officer monthly reports compiled.',
    '2025-12-15T08:00:00Z',
    '2026-05-10T09:00:00Z'
  ),
  (
    -- monitoring_compilation: large wind farm — FY2026 compilation of quarterly monitoring data
    'esmr_003',
    'WIND-WC-LRG-003',
    'FY2026',
    750000000.0,
    'large',
    'DBSA,IFC',
    'TA-2026-003',
    NULL,
    'monitoring_compilation',
    datetime('now', '+35 days'),
    0,
    0,
    'p_ipp_dev_001',
    NULL,
    'FY2026 annual monitoring data being compiled. DBSA and IFC joint TA engaged. Four quarterly environmental monitoring reports, noise surveys, and biodiversity offset scorecard aggregated into draft ESMP compliance matrix.',
    '2026-01-10T08:00:00Z',
    '2026-05-20T11:00:00Z'
  ),
  (
    -- lender_ta_review: major solar park — H1-2025 TA reviewing compiled monitoring data
    'esmr_004',
    'SOLAR-GAU-MAJ-004',
    'H1-2025',
    2200000000.0,
    'major',
    'DBSA,IFC,DEG',
    'TA-2026-004',
    NULL,
    'lender_ta_review',
    datetime('now', '+28 days'),
    0,
    0,
    'p_ipp_dev_002',
    NULL,
    'Lender Technical Advisor (ERM South Africa) conducting PS1–PS8 compliance review of compiled H1-2025 data. Reviewing grievance register, indigenous community engagement log, and biodiversity management plan implementation status.',
    '2025-07-15T08:00:00Z',
    '2026-04-05T14:00:00Z'
  ),
  (
    -- ta_report_preparation: flagship offshore wind — H2-2026 TA drafting formal ESMR report
    'esmr_005',
    'WIND-OFF-KZN-005',
    'H2-2026',
    4500000000.0,
    'flagship',
    'DBSA,AfDB,KfW,DEG',
    'TA-2026-005',
    NULL,
    'ta_report_preparation',
    datetime('now', '+21 days'),
    0,
    0,
    'p_ipp_dev_003',
    NULL,
    'TA consortium (SRK/ERM joint venture) preparing formal ESMR for H2-2026. Offshore PS6 marine biodiversity chapter and PS7 coastal community engagement annex under technical sign-off. Multi-DFI reporting template (DBSA/AfDB/KfW/DEG) being reconciled.',
    '2026-04-01T08:00:00Z',
    '2026-06-01T15:00:00Z'
  ),
  (
    -- report_submitted: small community wind — H1-2025 formal ESMR submitted to lender portal
    'esmr_006',
    'WIND-COM-EC-006',
    'H1-2025',
    150000000.0,
    'small',
    'DBSA',
    'TA-2026-006',
    NULL,
    'report_submitted',
    datetime('now', '+18 days'),
    0,
    0,
    'p_ipp_dev_001',
    NULL,
    'H1-2025 ESMR submitted via DBSA lending portal. Reference DBSA-ESMR-2025-00143. Report covers PS1 assessment update, PS2 labour audit, and community grievance register. IE cover letter attached. Submission confirmed on 2026-03-15.',
    '2025-08-01T08:00:00Z',
    '2026-03-15T10:30:00Z'
  ),
  (
    -- lender_review: medium solar farm — H2-2025 report under lender credit team review
    'esmr_007',
    'SOLAR-LIM-MED-007',
    'H2-2025',
    420000000.0,
    'medium',
    'IFC',
    'TA-2026-007',
    NULL,
    'lender_review',
    datetime('now', '+14 days'),
    0,
    0,
    'p_ipp_dev_002',
    NULL,
    'IFC Environmental and Social specialist team reviewing submitted H2-2025 ESMR. Checking PS3 pollution monitoring data against baseline, PS4 occupational health incident register, and worker accommodation standards compliance. Review window is 15 business days.',
    '2025-12-20T08:00:00Z',
    '2026-04-22T09:00:00Z'
  ),
  (
    -- clarification_requested: large wind farm — FY2025 lender requested PS6 biodiversity clarification
    'esmr_008',
    'WIND-NC-LRG-008',
    'FY2025',
    820000000.0,
    'large',
    'DBSA,IFC',
    'TA-2026-008',
    NULL,
    'clarification_requested',
    datetime('now', '+10 days'),
    0,
    1,
    'p_ipp_dev_003',
    'PS6 biodiversity offset scorecard shows raptor mortality count 23% above ESMP threshold. Independent ornithologist reconciliation required.',
    'Lender clarification request ref DBSA-CLR-2025-00412. Developer has 15 business days to submit ornithologist reconciliation report and updated curtailment protocol. Joint TA engaged.',
    '2025-02-10T08:00:00Z',
    '2026-02-18T11:00:00Z'
  ),
  (
    -- certificate_withheld (terminal): medium solar farm — H2-2024 ESMR non-compliant on PS5 land acquisition
    'esmr_009',
    'SOLAR-FS-MED-009',
    'H2-2024',
    480000000.0,
    'medium',
    'DBSA,IFC',
    'TA-2026-009',
    NULL,
    'certificate_withheld',
    datetime('now', '-8 days'),
    1,
    1,
    'p_ipp_dev_002',
    'H2-2024 ESMR certificate withheld. PS5 land acquisition non-conformance: 12 households in resettlement action plan not yet compensated at time of submission.',
    'DBSA withholding notice DBSA-ESMR-WITH-2025-00019 issued. Developer must complete outstanding RAP compensation and submit updated PS5 compliance evidence within 45 days. IFC co-lender notified. DMRE and DFFE informed per REIPPPP covenant. SLA breached by 8 days.',
    '2024-07-20T08:00:00Z',
    '2025-03-12T10:00:00Z'
  ),
  (
    -- certificate_issued (terminal 1): major solar park — H2-2025 fully compliant, certificate issued
    'esmr_010',
    'SOLAR-NC-MAJ-010',
    'H2-2025',
    2500000000.0,
    'major',
    'DBSA,IFC,DEG',
    'TA-2026-010',
    NULL,
    'certificate_issued',
    datetime('now', '+365 days'),
    0,
    1,
    'p_ipp_dev_002',
    'H2-2025 ESMR certified compliant. All PS1–PS8 categories rated satisfactory. No material non-conformances identified.',
    'ESMR Compliance Certificate DBSA-ESMR-CERT-2026-00031 issued jointly by DBSA and IFC. Certificate valid until H1-2026 ESMR due date. Copy filed with DMRE project register and DEG covenant tracker. IFC Environmental and Social Review Summary updated.',
    '2024-12-01T08:00:00Z',
    '2026-03-28T14:00:00Z'
  ),
  (
    -- certificate_issued (terminal 2): flagship offshore wind — FY2025 certificate issued after multi-DFI sign-off
    'esmr_011',
    'WIND-OFF-EC-011',
    'FY2025',
    5200000000.0,
    'flagship',
    'DBSA,AfDB,KfW,DEG',
    'TA-2026-011',
    NULL,
    'certificate_issued',
    datetime('now', '+365 days'),
    0,
    1,
    'p_ipp_dev_003',
    'FY2025 ESMR certified compliant by all four DFIs. PS7 indigenous community engagement rated exemplary; PS6 marine mammal mitigation plan validated by DFFE.',
    'Multi-DFI ESMR Compliance Certificate DBSA-ESMR-CERT-2026-00044 executed. DBSA lead lender coordination note distributed to AfDB, KfW, and DEG co-lenders. Equator Principles reporting submitted to EP Association secretariat. Next reporting period FY2026 opens 2026-07-01.',
    '2025-01-15T08:00:00Z',
    '2026-05-02T11:30:00Z'
  ),
  (
    -- material_breach_declared (terminal): large wind farm — FY2024 material PS3 pollution breach declared
    'esmr_012',
    'WIND-EC-LRG-012',
    'FY2024',
    890000000.0,
    'large',
    'DBSA,IFC',
    'TA-2026-012',
    'ps3_pollution',
    'material_breach_declared',
    datetime('now', '-12 days'),
    1,
    1,
    'p_ipp_dev_003',
    'Material breach declared. PS3 pollution non-conformance: groundwater TDS exceedance at four off-site monitoring boreholes for six consecutive quarters. Remediation plan submitted 90 days late and assessed as inadequate by joint DBSA/IFC TA.',
    'DBSA/IFC Material Breach Notice DBSA-ESMR-BREACH-2025-00003 served. Lenders reserving right to call event of default under Loan Agreement Clause 18.4(b). NERSA and DFFE notified per NEMA s30. Developer directed to appoint independent remediation specialist within 15 business days. SLA breached by 12 days. Regulator inbox flagged.',
    '2024-01-10T08:00:00Z',
    '2025-09-15T14:30:00Z'
  );
