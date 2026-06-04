-- W175: IPP Milestone Certification Lifecycle
-- REIPPPP/NERSA milestone certification chain per project milestone event:
-- milestone_triggered → documentation_preparation → ie_pre_review →
-- documentation_submitted → ipp_office_acknowledgment → technical_verification →
-- clarification_requested → clarification_submitted → final_review →
-- milestone_certified / milestone_rejected / milestone_lapsed.
--
-- 17 columns (18 including updated_at):
--   id, project_ref, milestone_type, project_mw, project_tier,
--   energy_type, scheduled_date, ie_report_ref, chain_status,
--   sla_due_date, sla_breached, is_reportable,
--   actor_party, reason, notes,
--   created_at, updated_at

CREATE TABLE IF NOT EXISTS oe_ipp_milestone_certifications (
  id                  TEXT    PRIMARY KEY,
  project_ref         TEXT    NOT NULL,
  milestone_type      TEXT    NOT NULL
                              CHECK(milestone_type IN (
                                'financial_close','construction_start','test_cod','cod',
                                'grid_connection','commissioning_complete','performance_test_complete'
                              )),
  project_mw          REAL    NOT NULL,
  project_tier        TEXT    NOT NULL
                              CHECK(project_tier IN ('small','medium','large','utility','strategic')),
  energy_type         TEXT    NOT NULL DEFAULT 'solar_pv'
                              CHECK(energy_type IN (
                                'solar_pv','wind_onshore','wind_offshore','biomass',
                                'small_hydro','csp','battery_storage'
                              )),
  scheduled_date      TEXT,
  ie_report_ref       TEXT,
  chain_status        TEXT    NOT NULL DEFAULT 'milestone_triggered'
                              CHECK(chain_status IN (
                                'milestone_triggered','documentation_preparation','ie_pre_review',
                                'documentation_submitted','ipp_office_acknowledgment',
                                'technical_verification','clarification_requested',
                                'clarification_submitted','final_review',
                                'milestone_certified','milestone_rejected','milestone_lapsed'
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

CREATE INDEX IF NOT EXISTS idx_ipp_mc_project
  ON oe_ipp_milestone_certifications(project_ref);

CREATE INDEX IF NOT EXISTS idx_ipp_mc_status
  ON oe_ipp_milestone_certifications(chain_status);

CREATE INDEX IF NOT EXISTS idx_ipp_mc_sla
  ON oe_ipp_milestone_certifications(sla_due_date)
  WHERE sla_breached = 0;

-- 12 seed rows, one per state.
-- Column order:
--  1:id  2:project_ref  3:milestone_type  4:project_mw  5:project_tier
--  6:energy_type  7:scheduled_date  8:ie_report_ref  9:chain_status
--  10:sla_due_date  11:sla_breached  12:is_reportable
--  13:actor_party  14:reason  15:notes
--  16:created_at  17:updated_at

INSERT OR IGNORE INTO oe_ipp_milestone_certifications VALUES
  (
    -- milestone_triggered: small solar_pv — financial close milestone just fired
    'mc_001',
    'SOLAR-KZN-003',
    'financial_close',
    35.0,
    'small',
    'solar_pv',
    '2026-07-01',
    NULL,
    'milestone_triggered',
    datetime('now', '+30 days'),
    0,
    0,
    'p_ipp_dev_001',
    NULL,
    'Financial close milestone triggered after DBSA and IDC facility agreements executed. Documentation checklist issued.',
    '2026-06-01T08:00:00Z',
    '2026-06-04T08:00:00Z'
  ),
  (
    -- ipp_office_acknowledgment: medium wind_onshore — IPP Office acknowledged construction_start submission
    'mc_002',
    'SOLAR-PV-NPE-001',
    'construction_start',
    75.0,
    'medium',
    'wind_onshore',
    '2026-08-15',
    NULL,
    'ipp_office_acknowledgment',
    datetime('now', '+25 days'),
    0,
    0,
    'p_ipp_dev_001',
    NULL,
    'IPP Office acknowledged construction-start submission. Ref IPPO-ACK-2026-00187. EPC contract and NEC3 baseline received. Technical verification team assigned within 5 business days.',
    '2026-05-20T08:00:00Z',
    '2026-06-02T11:00:00Z'
  ),
  (
    -- milestone_lapsed: utility wind_offshore — grid_connection milestone lapsed after SLA expiry
    'mc_003',
    'WIND-NCLNG-002',
    'grid_connection',
    140.0,
    'utility',
    'wind_offshore',
    '2025-06-30',
    'IE-PRE-2025-00314',
    'milestone_lapsed',
    datetime('now', '-30 days'),
    1,
    1,
    'p_ipp_dev_001',
    'Grid connection milestone lapsed. NTCSA connection agreement not executed within PPA schedule. SLA expired 2025-09-28 without certified submission.',
    'Milestone lapse notice issued. Ref IPPO-LAPSE-2025-00041. Developer must notify DMRE and NERSA within 5 business days. REIPPPP BPA Schedule 3 penalties may apply.',
    '2025-03-01T08:00:00Z',
    '2025-10-05T09:00:00Z'
  ),
  (
    -- documentation_submitted: utility battery_storage — full pack lodged with IPP Office
    'mc_004',
    'WIND-WC-004',
    'test_cod',
    350.0,
    'utility',
    'battery_storage',
    '2026-11-30',
    'IE-PRE-2026-00441',
    'documentation_submitted',
    datetime('now', '+18 days'),
    0,
    0,
    'p_ipp_dev_002',
    NULL,
    'Test COD documentation pack lodged via IPP Office portal. Reference IPPO-SUBMIT-2026-00189. Pack includes IE pre-review sign-off, commissioning test report, grid code compliance letter.',
    '2026-03-10T08:00:00Z',
    '2026-05-15T16:00:00Z'
  ),
  (
    -- ie_pre_review: large csp — IE conducting preliminary document review of COD evidence
    'mc_005',
    'CSP-LIM-LRG-005',
    'cod',
    130.0,
    'large',
    'csp',
    '2026-09-30',
    'IE-PRE-2026-00502',
    'ie_pre_review',
    datetime('now', '+14 days'),
    0,
    0,
    'p_ipp_dev_002',
    NULL,
    'Independent Engineer SRK Consulting conducting pre-review of COD documentation. Reviewing NERSA generation licence, grid code compliance letter, and commissioning test protocol results.',
    '2026-02-01T08:00:00Z',
    '2026-04-20T09:30:00Z'
  ),
  (
    -- technical_verification: small biomass — IPP Office verifying commissioning evidence
    'mc_006',
    'BIO-MASS-LP-006',
    'commissioning_complete',
    28.0,
    'small',
    'biomass',
    '2026-05-30',
    'IE-PRE-2026-00188',
    'technical_verification',
    datetime('now', '+10 days'),
    0,
    0,
    'p_ipp_dev_002',
    NULL,
    'IPP Office technical team reviewing commissioning test records, NERSA generation licence, and NRS 048 power-quality results.',
    '2026-01-15T08:00:00Z',
    '2026-04-05T11:00:00Z'
  ),
  (
    -- clarification_requested: medium small_hydro — IPP Office queried capacity test data
    'mc_007',
    'HYDRO-MPN-007',
    'performance_test_complete',
    80.0,
    'medium',
    'small_hydro',
    '2026-04-30',
    'IE-PRE-2025-00812',
    'clarification_requested',
    datetime('now', '+7 days'),
    0,
    1,
    'p_ipp_dev_003',
    'Performance test data shows P50 yield 4.2% below PPA schedule baseline. IE reconciliation required.',
    'IPP Office ref IPPO-CLR-2026-00067. Developer has 10 business days to submit IE reconciliation report.',
    '2025-11-10T08:00:00Z',
    '2026-03-18T10:00:00Z'
  ),
  (
    -- documentation_preparation: large solar_pv — assembling construction_start evidence pack
    'mc_008',
    'SOLAR-GRT-008',
    'construction_start',
    165.0,
    'large',
    'solar_pv',
    '2026-03-01',
    NULL,
    'documentation_preparation',
    datetime('now', '+9 days'),
    0,
    0,
    'p_ipp_dev_001',
    NULL,
    'Compiling construction-start evidence pack: EPC contract executed, environmental authorisation and water-use licence confirmed, NEC3 programme baseline reviewed by IE.',
    '2025-09-05T08:00:00Z',
    '2026-02-25T14:30:00Z'
  ),
  (
    -- final_review: utility wind_onshore — IPP Office conducting final certification check
    'mc_009',
    'WIND-NC-UTIL-009',
    'cod',
    280.0,
    'utility',
    'wind_onshore',
    '2026-02-28',
    'IE-PRE-2025-00633',
    'final_review',
    datetime('now', '+5 days'),
    0,
    1,
    'p_ipp_dev_002',
    NULL,
    'Final review in progress. Grid code compliance certificate from NTCSA received. NERSA Generation Licence valid. IE final COD sign-off dated 2026-05-30.',
    '2025-08-01T08:00:00Z',
    '2026-05-31T15:00:00Z'
  ),
  (
    -- milestone_certified (terminal 1): utility battery_storage — COD certified
    'mc_010',
    'BESS-KZN-UTIL-010',
    'cod',
    220.0,
    'utility',
    'battery_storage',
    '2025-12-15',
    'IE-PRE-2025-00511',
    'milestone_certified',
    datetime('now', '+180 days'),
    0,
    1,
    'p_ipp_dev_003',
    'COD milestone certified. All 14 hold-points cleared. IE final certificate issued.',
    'IPP Office Certificate of COD Milestone Compliance issued. Ref IPPO-CERT-2026-00044. PPA commercial operation date confirmed 2025-12-15. NERSA notified.',
    '2025-06-01T08:00:00Z',
    '2026-01-20T16:00:00Z'
  ),
  (
    -- milestone_certified (terminal 2): strategic csp — financial close certified
    'mc_011',
    'CSP-NW-STRAT-011',
    'financial_close',
    520.0,
    'strategic',
    'csp',
    '2025-09-30',
    'IE-PRE-2025-00398',
    'milestone_certified',
    datetime('now', '+365 days'),
    0,
    1,
    'p_ipp_dev_001',
    'Financial close milestone certified. R14.2bn project finance package confirmed. Senior debt: DBSA R5.8bn, IDC R3.1bn, DFI consortium R5.3bn.',
    'IPP Office Certificate of Financial Close issued. Ref IPPO-CERT-2025-00312. DMRE notified. Construction programme commencement authorised.',
    '2024-12-01T08:00:00Z',
    '2025-10-08T11:30:00Z'
  ),
  (
    -- milestone_rejected (terminal): medium wind_onshore — sla_breached, all tiers reportable
    'mc_012',
    'WIND-EC-MED-012',
    'commissioning_complete',
    95.0,
    'medium',
    'wind_onshore',
    '2025-11-30',
    'IE-PRE-2025-00281',
    'milestone_rejected',
    datetime('now', '-15 days'),
    1,
    1,
    'p_ipp_dev_003',
    'Commissioning milestone rejected. NRS 097-2-1 grid-code reactive power compliance not demonstrated. SCADA integration incomplete at time of submission.',
    'Rejection notice IPPO-REJ-2026-00019 issued. Developer may resubmit within 60 days after rectification. SLA breached by 18 days. NERSA notified per ERA s34.',
    '2025-07-10T08:00:00Z',
    '2026-04-02T14:00:00Z'
  );
