-- W177: IPP Independent Engineer Annual Review (IEAR) Lifecycle
-- REIPPPP Schedule 5 / lender-covenant IE annual review cycle per project year:
-- review_triggered → scope_definition → data_submission → ie_field_inspection →
-- ie_analysis → draft_report_issued → ipp_response → ie_final_review →
-- report_issued → review_closed / remediation_required / escalated_to_lenders.
--
-- 17 columns (18 including updated_at):
--   id, project_ref, review_year, project_mw, project_tier,
--   ie_firm, focus_area, finding_severity, chain_status,
--   sla_due_date, sla_breached, is_reportable,
--   actor_party, reason, notes,
--   created_at, updated_at

CREATE TABLE IF NOT EXISTS oe_ipp_ie_annual_reviews (
  id                  TEXT    PRIMARY KEY,
  project_ref         TEXT    NOT NULL,
  review_year         INTEGER NOT NULL,
  project_mw          REAL    NOT NULL,
  project_tier        TEXT    NOT NULL
                              CHECK(project_tier IN ('small','medium','large','utility','strategic')),
  ie_firm             TEXT,
  focus_area          TEXT    NOT NULL DEFAULT 'comprehensive'
                              CHECK(focus_area IN (
                                'technical_performance','financial_model',
                                'om_compliance','grid_code',
                                'insurance_bonds','comprehensive'
                              )),
  finding_severity    TEXT
                              CHECK(finding_severity IN (
                                'none','minor','moderate','material','critical'
                              ) OR finding_severity IS NULL),
  chain_status        TEXT    NOT NULL DEFAULT 'review_triggered'
                              CHECK(chain_status IN (
                                'review_triggered','scope_definition',
                                'data_submission','ie_field_inspection',
                                'ie_analysis','draft_report_issued',
                                'ipp_response','ie_final_review',
                                'report_issued','review_closed',
                                'remediation_required','escalated_to_lenders'
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

CREATE INDEX IF NOT EXISTS idx_ipp_iear_project
  ON oe_ipp_ie_annual_reviews(project_ref);

CREATE INDEX IF NOT EXISTS idx_ipp_iear_status
  ON oe_ipp_ie_annual_reviews(chain_status);

CREATE INDEX IF NOT EXISTS idx_ipp_iear_sla
  ON oe_ipp_ie_annual_reviews(sla_due_date)
  WHERE sla_breached = 0;

-- 12 seed rows, one per state.
-- Column order:
--  1:id  2:project_ref  3:review_year  4:project_mw  5:project_tier
--  6:ie_firm  7:focus_area  8:finding_severity  9:chain_status
--  10:sla_due_date  11:sla_breached  12:is_reportable
--  13:actor_party  14:reason  15:notes
--  16:created_at  17:updated_at

INSERT OR IGNORE INTO oe_ipp_ie_annual_reviews VALUES
  (
    -- review_triggered: small community solar — 2026 annual IE review cycle opened
    'iear_001',
    'SOLAR-COM-EC-001',
    2026,
    32.5,
    'small',
    'WSP',
    'technical_performance',
    NULL,
    'review_triggered',
    datetime('now', '+90 days'),
    0,
    0,
    'p_ipp_dev_001',
    NULL,
    '2026 annual IE review cycle triggered per REIPPPP Schedule 5 covenant. WSP appointed as IE firm. Review scope to focus on technical performance against PASA/SASA PR targets and inverter degradation trend. Site access confirmation letter dispatched to facility manager.',
    '2026-06-01T08:00:00Z',
    '2026-06-01T08:00:00Z'
  ),
  (
    -- scope_definition: medium wind farm — 2026 IE and IPP agreeing review ToR
    'iear_002',
    'WIND-NPE-MED-002',
    2026,
    78.0,
    'medium',
    'SLR Consulting',
    'om_compliance',
    NULL,
    'scope_definition',
    datetime('now', '+80 days'),
    0,
    0,
    'p_ipp_dev_002',
    NULL,
    '2026 IE review scope definition under way. SLR Consulting Terms of Reference circulated to IPP and lender. O&M compliance focus agreed: REBCO maintenance log review, corrective-work closure rates, spare-parts inventory audit, and HSSEQ incident register verification. IPP sign-off on scope pending.',
    '2026-05-15T08:00:00Z',
    '2026-05-28T10:00:00Z'
  ),
  (
    -- data_submission: large solar park — 2025 review year, IPP submitting data pack to IE
    'iear_003',
    'SOLAR-GAU-LRG-003',
    2025,
    145.0,
    'large',
    'Aurecon',
    'financial_model',
    NULL,
    'data_submission',
    datetime('now', '+65 days'),
    0,
    0,
    'p_ipp_dev_001',
    NULL,
    '2025 annual IE data submission in progress. Aurecon data request checklist issued 2025-11-10. IPP submitting: 12-month generation actuals, audited financial statements, updated base-case financial model (rev 7), O&M cost ledger, and insurance certificate package. Submission portal reference IEP-2025-GAU-003.',
    '2025-11-10T08:00:00Z',
    '2026-05-20T14:00:00Z'
  ),
  (
    -- ie_field_inspection: utility solar park — 2025 review, Arup on-site inspection week
    'iear_004',
    'SOLAR-KZN-UTL-004',
    2025,
    250.0,
    'utility',
    'Arup',
    'grid_code',
    NULL,
    'ie_field_inspection',
    datetime('now', '+55 days'),
    0,
    0,
    'p_ipp_dev_002',
    NULL,
    '2025 IE field inspection under way. Arup team on-site 2026-05-26 to 2026-05-30. Grid Code compliance focus: protection relay settings audit, SCADA telemetry accuracy verification against Eskom POC metering, reactive power capability test, and grid disturbance recorder data retrieval. Provisional inspection findings to be issued within 10 business days.',
    '2025-10-01T08:00:00Z',
    '2026-05-26T07:00:00Z'
  ),
  (
    -- ie_analysis: strategic wind farm — 2025 review, KPMG Technical Advisory analysing data
    'iear_005',
    'WIND-WC-STR-005',
    2025,
    560.0,
    'strategic',
    'KPMG Technical Advisory',
    'insurance_bonds',
    NULL,
    'ie_analysis',
    datetime('now', '+45 days'),
    0,
    0,
    'p_ipp_dev_003',
    NULL,
    '2025 IE analysis phase. KPMG Technical Advisory reviewing insurance and performance bond package for this 560 MW strategic offshore wind project. Verifying: material damage sum insured vs current replacement cost, business interruption indemnity period adequacy, performance bond quantum vs O&M obligations, and insurer credit rating compliance with lender minimum BBB+. Actuarial gap analysis under preparation.',
    '2025-09-15T08:00:00Z',
    '2026-04-10T11:00:00Z'
  ),
  (
    -- draft_report_issued: small community wind — 2024 review, draft IE report issued for comment
    'iear_006',
    'WIND-COM-NW-006',
    2024,
    28.0,
    'small',
    'WSP',
    'technical_performance',
    NULL,
    'draft_report_issued',
    datetime('now', '+35 days'),
    0,
    0,
    'p_ipp_dev_001',
    NULL,
    '2024 draft IE annual review report issued by WSP on 2026-05-12. Reference WSP-IEAR-2024-NW-006-D1. Preliminary finding: two inverter string combiner faults unresolved for >90 days represent a minor O&M compliance gap. PR ratio trending 1.8% below P50 over trailing 12 months. IPP has 15 business days to submit written response. Lender technical advisor copy-distributed.',
    '2024-06-01T08:00:00Z',
    '2026-05-12T09:30:00Z'
  ),
  (
    -- ipp_response: medium solar farm — 2025 review, IPP responding to IE draft findings
    'iear_007',
    'SOLAR-LIM-MED-007',
    2025,
    92.0,
    'medium',
    'SLR Consulting',
    'om_compliance',
    NULL,
    'ipp_response',
    datetime('now', '+25 days'),
    0,
    0,
    'p_ipp_dev_002',
    NULL,
    '2025 IPP response to SLR Consulting draft IE report submitted 2026-05-18. Reference SLR-IEAR-2025-LIM-007-IPP-R1. IPP contesting O&M compliance finding relating to corrective work backlog; attaching updated CMMS work order closure report demonstrating 94% on-time close rate as at 2026-05-15. Requesting SLR revise draft rating from moderate to minor. SLR reviewing response.',
    '2025-10-10T08:00:00Z',
    '2026-05-18T10:00:00Z'
  ),
  (
    -- ie_final_review: large wind farm — 2025 review, IE conducting final review after IPP response
    'iear_008',
    'WIND-EC-LRG-008',
    2025,
    180.0,
    'large',
    'Aurecon',
    'financial_model',
    NULL,
    'ie_final_review',
    datetime('now', '+18 days'),
    0,
    0,
    'p_ipp_dev_003',
    NULL,
    '2025 IE final review in progress. Aurecon assessing IPP counter-arguments to draft financial model findings (revenue downside scenario sensitivity and DSCR cushion adequacy). Updated financial model rev 8 submitted by IPP on 2026-05-20. Aurecon quantitative review to be completed within 8 business days before final report sign-off.',
    '2025-09-01T08:00:00Z',
    '2026-05-20T14:00:00Z'
  ),
  (
    -- report_issued: utility solar park — 2024 review, final IE report issued with moderate finding
    'iear_009',
    'SOLAR-FS-UTL-009',
    2024,
    320.0,
    'utility',
    'Arup',
    'grid_code',
    'moderate',
    'report_issued',
    datetime('now', '+10 days'),
    0,
    0,
    'p_ipp_dev_001',
    'Moderate finding: SCADA telemetry latency averaging 4.2 seconds against Grid Code requirement of <2 seconds for 99.5% of readings. Remediation plan required within 60 days.',
    '2024 IE annual review final report issued. Reference ARUP-IEAR-2024-FS-UTL-009-FINAL. Grid Code compliance finding rated moderate: SCADA telemetry latency non-conformance documented with telemetry logs annexed. Remediation deadline set at 2026-07-31. Lender technical advisor and NERSA grid compliance desk notified. Finding does not trigger loan covenant breach at this severity level.',
    '2024-06-01T08:00:00Z',
    '2026-05-30T11:00:00Z'
  ),
  (
    -- review_closed: utility solar park — 2023 review, no material findings, closed clean
    'iear_010',
    'SOLAR-NC-UTL-010',
    2023,
    210.0,
    'utility',
    'KPMG Technical Advisory',
    'comprehensive',
    'none',
    'review_closed',
    datetime('now', '+365 days'),
    0,
    1,
    'p_ipp_dev_002',
    '2023 comprehensive IE annual review closed with no findings. All technical, financial, O&M, grid code, and insurance/bond categories rated satisfactory.',
    '2023 KPMG Technical Advisory comprehensive annual IE review closed. Reference KPMG-IEAR-2023-NC-UTL-010-FINAL. All six review categories rated satisfactory. No corrective actions required. Lender covenant compliance certificate issued concurrently by DBSA. Next annual review cycle opens 2024-06-01. Regulator and lender notified per is_reportable flag (utility tier threshold).',
    '2023-06-01T08:00:00Z',
    '2024-03-15T14:00:00Z'
  ),
  (
    -- remediation_required: large wind farm — 2024 review, material finding triggering remediation plan
    'iear_011',
    'WIND-KZN-LRG-011',
    2024,
    155.0,
    'large',
    'WSP',
    'om_compliance',
    'material',
    'remediation_required',
    datetime('now', '-5 days'),
    0,
    1,
    'p_ipp_dev_003',
    'Material finding: O&M contractor corrective-work backlog at 38% overdue beyond 60 days; gearbox vibration signature on two turbines not actioned for 4 months despite early-warning alerts. Remediation plan required within 30 days.',
    '2024 WSP IE annual review concluded with material O&M compliance finding. Reference WSP-IEAR-2024-KZN-LRG-011-FINAL. Material finding: systemic corrective-work backlog and two unresolved gearbox fault signatures constitute an O&M covenant breach trigger. IPP directed to submit a 30-day remediation plan including O&M contractor performance improvement notice and independent structural assessment of affected turbines. DBSA lender technical advisor and NERSA generation licence desk notified. is_reportable=1 (large tier material finding).',
    '2024-06-01T08:00:00Z',
    '2025-04-10T09:00:00Z'
  ),
  (
    -- escalated_to_lenders: strategic wind farm — 2024 review, critical finding, SLA breached, escalated
    'iear_012',
    'WIND-WC-STR-012',
    2024,
    520.0,
    'strategic',
    'SLR Consulting',
    'comprehensive',
    'critical',
    'escalated_to_lenders',
    datetime('now', '-15 days'),
    1,
    1,
    'p_ipp_dev_001',
    'Critical finding: structural integrity defects identified on 6 of 52 turbine foundations; geotechnical reassessment not completed within remediation deadline. Escalated to lender steering committee per loan covenant clause 22.1(c).',
    '2024 SLR Consulting comprehensive IE annual review escalated to lender steering committee. Reference SLR-IEAR-2024-WC-STR-012-FINAL-ESC. Critical structural finding: foundation defects on 6 turbines discovered during geotechnical inspection; IPP failed to deliver independent structural engineering remediation assessment within 45-day deadline set at draft report stage. SLA breached by 15 days. Lender steering committee (DBSA, IFC, DEG, KfW) convened 2026-05-20. Step-in rights under loan agreement clause 22.1(c) under consideration. NERSA, DMRE, and DFFE notified. Independent structural engineering firm to be jointly appointed by lenders within 10 business days.',
    '2024-06-01T08:00:00Z',
    '2026-05-20T16:00:00Z'
  );
