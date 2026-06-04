-- W184: IPP Annual NERSA Licence Compliance Return
-- ERA 4/2006 s.14-16 annual licence compliance return lifecycle:
-- return_triggered -> data_assembly -> internal_review ->
-- board_approval -> portal_submission -> acknowledgement_pending ->
-- nersa_review -> clarification_requested -> clarification_submitted ->
-- return_accepted / return_rejected / return_lapsed
--
-- 17 columns (id + 16 data columns):
--   id, project_ref, licence_number, financial_year_end,
--   licensed_mw, capacity_tier, return_type,
--   chain_status,
--   sla_due_date, sla_breached, is_reportable,
--   actor_party, reason, notes,
--   created_at, updated_at

CREATE TABLE IF NOT EXISTS oe_ipp_licence_returns (
  id                  TEXT    PRIMARY KEY,
  project_ref         TEXT    NOT NULL,
  licence_number      TEXT,
  financial_year_end  TEXT,
  licensed_mw         REAL    NOT NULL,
  capacity_tier       TEXT    NOT NULL
                              CHECK(capacity_tier IN (
                                'small',
                                'medium',
                                'large',
                                'major',
                                'flagship'
                              )),
  return_type         TEXT    NOT NULL DEFAULT 'annual_standard'
                              CHECK(return_type IN (
                                'annual_standard',
                                'annual_construction',
                                'annual_decommission'
                              )),
  chain_status        TEXT    NOT NULL DEFAULT 'return_triggered'
                              CHECK(chain_status IN (
                                'return_triggered',
                                'data_assembly',
                                'internal_review',
                                'board_approval',
                                'portal_submission',
                                'acknowledgement_pending',
                                'nersa_review',
                                'clarification_requested',
                                'clarification_submitted',
                                'return_accepted',
                                'return_rejected',
                                'return_lapsed'
                              )),
  sla_due_date        TEXT,
  sla_breached        INTEGER DEFAULT 0,
  is_reportable       INTEGER DEFAULT 0,
  actor_party         TEXT,
  reason              TEXT,
  notes               TEXT,
  created_at          TEXT    DEFAULT (datetime('now')),
  updated_at          TEXT    DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_ipp_lcr_status ON oe_ipp_licence_returns(chain_status);
CREATE INDEX IF NOT EXISTS idx_ipp_lcr_sla    ON oe_ipp_licence_returns(sla_due_date, sla_breached);

-- ============================================================
-- Seed data: 12 rows covering all 12 states
-- ============================================================

-- lcr_001: return_triggered (early)
INSERT OR IGNORE INTO oe_ipp_licence_returns
  (id, project_ref, licence_number, financial_year_end,
   licensed_mw, capacity_tier, return_type,
   chain_status,
   sla_due_date, sla_breached, is_reportable,
   actor_party, reason, notes,
   created_at, updated_at)
VALUES
  ('lcr_001', 'WIND-EC-SML-002', 'NERSA-G-2023-041', '2026-03-31',
   3.8, 'small', 'annual_standard',
   'return_triggered',
   '2026-06-30', 0, 0,
   'p_ipp_dev_001', NULL, 'Annual return cycle initiated for Eastern Cape small-wind facility',
   '2026-04-01 07:00:00', '2026-04-01 07:00:00');

-- lcr_002: data_assembly (early, sla_breached)
INSERT OR IGNORE INTO oe_ipp_licence_returns
  (id, project_ref, licence_number, financial_year_end,
   licensed_mw, capacity_tier, return_type,
   chain_status,
   sla_due_date, sla_breached, is_reportable,
   actor_party, reason, notes,
   created_at, updated_at)
VALUES
  ('lcr_002', 'SOLAR-NC-LRG-007', 'NERSA-REIPP-2021-087', '2026-03-31',
   75.0, 'large', 'annual_standard',
   'data_assembly',
   '2026-05-31', 1, 0,
   'p_ipp_dev_002', 'Delayed data feed from inverter SCADA', 'Northern Cape solar PV 75 MW -- metering data retrieval behind schedule',
   '2026-04-03 09:15:00', '2026-05-10 14:22:00');

-- lcr_003: internal_review (early)
INSERT OR IGNORE INTO oe_ipp_licence_returns
  (id, project_ref, licence_number, financial_year_end,
   licensed_mw, capacity_tier, return_type,
   chain_status,
   sla_due_date, sla_breached, is_reportable,
   actor_party, reason, notes,
   created_at, updated_at)
VALUES
  ('lcr_003', 'GAS-KZN-MAJ-003', 'NERSA-G-2020-019', '2026-03-31',
   150.0, 'major', 'annual_standard',
   'internal_review',
   '2026-06-15', 0, 0,
   'p_ipp_dev_003', NULL, 'KwaZulu-Natal gas peaker 150 MW under internal technical review before board submission',
   '2026-04-05 08:30:00', '2026-05-18 11:00:00');

-- lcr_004: board_approval (mid, sla_breached)
INSERT OR IGNORE INTO oe_ipp_licence_returns
  (id, project_ref, licence_number, financial_year_end,
   licensed_mw, capacity_tier, return_type,
   chain_status,
   sla_due_date, sla_breached, is_reportable,
   actor_party, reason, notes,
   created_at, updated_at)
VALUES
  ('lcr_004', 'HYDRO-WC-MED-001', 'NERSA-REIPP-2019-054', '2026-03-31',
   12.5, 'medium', 'annual_standard',
   'board_approval',
   '2026-05-15', 1, 0,
   'p_ipp_dev_004', 'Board quorum not reached at first meeting', 'Western Cape run-of-river hydro 12.5 MW -- board approval delayed due to quorum shortfall',
   '2026-04-08 10:00:00', '2026-05-20 09:45:00');

-- lcr_005: portal_submission (mid)
INSERT OR IGNORE INTO oe_ipp_licence_returns
  (id, project_ref, licence_number, financial_year_end,
   licensed_mw, capacity_tier, return_type,
   chain_status,
   sla_due_date, sla_breached, is_reportable,
   actor_party, reason, notes,
   created_at, updated_at)
VALUES
  ('lcr_005', 'WIND-WC-LRG-004', 'NERSA-REIPP-2022-033', '2026-03-31',
   80.0, 'large', 'annual_standard',
   'portal_submission',
   '2026-06-30', 0, 0,
   'p_ipp_dev_001', NULL, 'Western Cape onshore wind 80 MW submitted via NERSA eServices portal awaiting reference number',
   '2026-04-10 06:50:00', '2026-05-28 15:30:00');

-- lcr_006: acknowledgement_pending (mid)
INSERT OR IGNORE INTO oe_ipp_licence_returns
  (id, project_ref, licence_number, financial_year_end,
   licensed_mw, capacity_tier, return_type,
   chain_status,
   sla_due_date, sla_breached, is_reportable,
   actor_party, reason, notes,
   created_at, updated_at)
VALUES
  ('lcr_006', 'SOLAR-FS-MAJ-011', 'NERSA-REIPP-2020-101', '2026-03-31',
   140.0, 'major', 'annual_construction',
   'acknowledgement_pending',
   '2026-06-30', 0, 0,
   'p_ipp_dev_005', NULL, 'Free State solar PV 140 MW still under construction -- annual construction return submitted, pending NERSA acknowledgement',
   '2026-04-12 08:00:00', '2026-06-01 10:10:00');

-- lcr_007: nersa_review (late)
INSERT OR IGNORE INTO oe_ipp_licence_returns
  (id, project_ref, licence_number, financial_year_end,
   licensed_mw, capacity_tier, return_type,
   chain_status,
   sla_due_date, sla_breached, is_reportable,
   actor_party, reason, notes,
   created_at, updated_at)
VALUES
  ('lcr_007', 'WIND-NC-FLG-001', 'NERSA-REIPP-2018-007', '2026-03-31',
   310.0, 'flagship', 'annual_standard',
   'nersa_review',
   '2026-06-30', 0, 0,
   'p_ipp_dev_002', NULL, 'Northern Cape flagship wind farm 310 MW return under NERSA technical review panel',
   '2026-04-15 07:30:00', '2026-06-02 13:00:00');

-- lcr_008: clarification_requested (late)
INSERT OR IGNORE INTO oe_ipp_licence_returns
  (id, project_ref, licence_number, financial_year_end,
   licensed_mw, capacity_tier, return_type,
   chain_status,
   sla_due_date, sla_breached, is_reportable,
   actor_party, reason, notes,
   created_at, updated_at)
VALUES
  ('lcr_008', 'SOLAR-LP-LRG-009', 'NERSA-G-2021-066', '2026-03-31',
   95.0, 'large', 'annual_standard',
   'clarification_requested',
   '2026-06-30', 0, 0,
   'p_ipp_dev_003', 'NERSA queries on curtailment reporting methodology', 'Limpopo solar PV 95 MW -- NERSA requested clarification on grid curtailment hours classification',
   '2026-04-18 09:00:00', '2026-06-03 11:45:00');

-- lcr_009: clarification_submitted (late)
INSERT OR IGNORE INTO oe_ipp_licence_returns
  (id, project_ref, licence_number, financial_year_end,
   licensed_mw, capacity_tier, return_type,
   chain_status,
   sla_due_date, sla_breached, is_reportable,
   actor_party, reason, notes,
   created_at, updated_at)
VALUES
  ('lcr_009', 'GAS-GP-MED-006', 'NERSA-G-2022-028', '2026-03-31',
   18.0, 'medium', 'annual_standard',
   'clarification_submitted',
   '2026-06-30', 0, 0,
   'p_ipp_dev_004', NULL, 'Gauteng gas-fired medium unit 18 MW -- clarification on emissions data submitted to NERSA reviewer',
   '2026-04-20 10:30:00', '2026-06-03 16:20:00');

-- lcr_010: return_accepted (TERMINAL)
INSERT OR IGNORE INTO oe_ipp_licence_returns
  (id, project_ref, licence_number, financial_year_end,
   licensed_mw, capacity_tier, return_type,
   chain_status,
   sla_due_date, sla_breached, is_reportable,
   actor_party, reason, notes,
   created_at, updated_at)
VALUES
  ('lcr_010', 'WIND-EC-LRG-005', 'NERSA-REIPP-2017-042', '2026-03-31',
   60.0, 'large', 'annual_standard',
   'return_accepted',
   '2026-06-30', 0, 0,
   'p_ipp_dev_001', 'Return meets all ERA ss.14-16 requirements', 'Eastern Cape wind farm 60 MW annual return formally accepted by NERSA; certificate issued',
   '2026-03-28 08:00:00', '2026-05-30 14:00:00');

-- lcr_011: return_rejected (TERMINAL, is_reportable=1)
INSERT OR IGNORE INTO oe_ipp_licence_returns
  (id, project_ref, licence_number, financial_year_end,
   licensed_mw, capacity_tier, return_type,
   chain_status,
   sla_due_date, sla_breached, is_reportable,
   actor_party, reason, notes,
   created_at, updated_at)
VALUES
  ('lcr_011', 'SOLAR-MP-SML-003', 'NERSA-G-2023-055', '2026-03-31',
   4.2, 'small', 'annual_decommission',
   'return_rejected',
   '2026-05-31', 0, 1,
   'p_ipp_dev_005', 'Incomplete decommission evidence -- no site clearance certificate attached', 'Mpumalanga small solar 4.2 MW decommission return rejected; reportable non-compliance flagged to NERSA compliance unit',
   '2026-03-25 08:00:00', '2026-05-22 09:30:00');

-- lcr_012: return_lapsed (TERMINAL)
INSERT OR IGNORE INTO oe_ipp_licence_returns
  (id, project_ref, licence_number, financial_year_end,
   licensed_mw, capacity_tier, return_type,
   chain_status,
   sla_due_date, sla_breached, is_reportable,
   actor_party, reason, notes,
   created_at, updated_at)
VALUES
  ('lcr_012', 'WIND-NW-SML-008', 'NERSA-G-2024-012', '2026-03-31',
   2.5, 'small', 'annual_standard',
   'return_lapsed',
   '2026-04-30', 1, 0,
   'p_ipp_dev_002', 'No submission received before deadline', 'North West small-wind 2.5 MW return lapsed -- facility did not file by 30 April 2026; dunning escalation initiated',
   '2026-03-20 08:00:00', '2026-05-01 00:05:00');
