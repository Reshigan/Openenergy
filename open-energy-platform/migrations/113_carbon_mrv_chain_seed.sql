-- ═══════════════════════════════════════════════════════════════════════════
-- Wave 11 — Carbon Article 6 / UNFCCC MRV chain demo seed.
--
-- One demo submission per chain state against existing carbon_projects
-- (cp_001 Klerksdorp Solar, cp_002 Mookgopong Wind, cp_003 Cookstoves,
-- cp_004 Biomass). Each carries an oe_mrv_chain_events trail so the UI
-- timeline + drill-down renders content from launch.
--
-- Idempotent: INSERT OR IGNORE on PK; per-row date stamps so cron sweep
-- sees a stable cohort.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1) draft (no DOE yet) ──────────────────────────────────────────────────
INSERT OR IGNORE INTO mrv_submissions (
  id, project_id, reporting_period_start, reporting_period_end,
  claimed_reductions_tco2e, monitoring_methodology, status,
  chain_status, created_at
) VALUES
('mrv_chain_001','cp_001','2026-01-01','2026-03-31',7200,'ACM0002 v19 monitoring plan','draft','draft','2026-04-05 09:00:00');

INSERT OR IGNORE INTO oe_mrv_chain_events (id, submission_id, event_type, from_status, to_status, actor_id, notes, created_at) VALUES
('mrv_evt_001_a','mrv_chain_001','submitted',NULL,'draft','demo_ipp_001','Draft opened for Q1 2026','2026-04-05 09:00:00');

-- ─── 2) submitted (awaiting DOE assignment) ─────────────────────────────────
INSERT OR IGNORE INTO mrv_submissions (
  id, project_id, reporting_period_start, reporting_period_end,
  claimed_reductions_tco2e, monitoring_methodology, status,
  chain_status, submitted_at, created_at
) VALUES
('mrv_chain_002','cp_002','2025-10-01','2025-12-31',5400,'ACM0002 v19 monitoring plan','submitted','submitted','2026-05-15 11:00:00','2026-05-10 09:00:00');

INSERT OR IGNORE INTO oe_mrv_chain_events (id, submission_id, event_type, from_status, to_status, actor_id, notes, created_at) VALUES
('mrv_evt_002_a','mrv_chain_002','submitted','draft','submitted','demo_ipp_002','Q4 2025 submission lodged','2026-05-15 11:00:00');

-- ─── 3) doe_assigned (90d SLA running) ──────────────────────────────────────
INSERT OR IGNORE INTO mrv_submissions (
  id, project_id, reporting_period_start, reporting_period_end,
  claimed_reductions_tco2e, monitoring_methodology, status,
  chain_status, submitted_at, doe_assignee_id, doe_assigned_at, doe_due_at, created_at
) VALUES
('mrv_chain_003','cp_001','2025-07-01','2025-09-30',7100,'ACM0002 v19 monitoring plan','submitted','doe_assigned',
  '2026-05-01 09:00:00','demo_regulator_001','2026-05-08 09:00:00','2026-08-06 09:00:00','2026-04-25 09:00:00');

INSERT OR IGNORE INTO oe_mrv_chain_events (id, submission_id, event_type, from_status, to_status, actor_id, notes, created_at) VALUES
('mrv_evt_003_a','mrv_chain_003','submitted','draft','submitted','demo_ipp_001','Q3 2025 submission lodged','2026-05-01 09:00:00'),
('mrv_evt_003_b','mrv_chain_003','doe_assigned','submitted','doe_assigned','demo_regulator_001','DOE assigned; 90d clock running','2026-05-08 09:00:00');

-- ─── 4) doe_review (DOE actively reviewing) ─────────────────────────────────
INSERT OR IGNORE INTO mrv_submissions (
  id, project_id, reporting_period_start, reporting_period_end,
  claimed_reductions_tco2e, monitoring_methodology, status,
  chain_status, submitted_at, doe_assignee_id, doe_assigned_at, doe_due_at, created_at
) VALUES
('mrv_chain_004','cp_003','2025-07-01','2025-12-31',3200,'VM0042 v3.2 monitoring plan','submitted','doe_review',
  '2026-02-15 09:00:00','demo_carbon_001','2026-02-22 09:00:00','2026-05-23 09:00:00','2026-02-10 09:00:00');

INSERT OR IGNORE INTO oe_mrv_chain_events (id, submission_id, event_type, from_status, to_status, actor_id, notes, created_at) VALUES
('mrv_evt_004_a','mrv_chain_004','submitted','draft','submitted','demo_carbon_001','H2 2025 cookstove submission','2026-02-15 09:00:00'),
('mrv_evt_004_b','mrv_chain_004','doe_assigned','submitted','doe_assigned','demo_regulator_001','DOE assigned','2026-02-22 09:00:00'),
('mrv_evt_004_c','mrv_chain_004','doe_review_started','doe_assigned','doe_review','demo_carbon_001','Desk review opened','2026-03-05 10:00:00');

-- ─── 5) doe_opinion_positive (ready for CRA) ────────────────────────────────
INSERT OR IGNORE INTO mrv_submissions (
  id, project_id, reporting_period_start, reporting_period_end,
  claimed_reductions_tco2e, monitoring_methodology, status,
  chain_status, submitted_at, doe_assignee_id, doe_assigned_at, doe_due_at,
  doe_opinion, doe_opinion_at, created_at
) VALUES
('mrv_chain_005','cp_001','2025-04-01','2025-06-30',7050,'ACM0002 v19 monitoring plan','verified','doe_opinion_positive',
  '2026-01-15 09:00:00','demo_regulator_001','2026-01-22 09:00:00','2026-04-22 09:00:00',
  'positive','2026-04-10 14:00:00','2026-01-10 09:00:00');

INSERT OR IGNORE INTO oe_mrv_chain_events (id, submission_id, event_type, from_status, to_status, actor_id, notes, created_at) VALUES
('mrv_evt_005_a','mrv_chain_005','submitted','draft','submitted','demo_ipp_001','Q2 2025 lodged','2026-01-15 09:00:00'),
('mrv_evt_005_b','mrv_chain_005','doe_assigned','submitted','doe_assigned','demo_regulator_001','DOE assigned','2026-01-22 09:00:00'),
('mrv_evt_005_c','mrv_chain_005','doe_review_started','doe_assigned','doe_review','demo_regulator_001','Review opened','2026-02-05 10:00:00'),
('mrv_evt_005_d','mrv_chain_005','doe_opinion_recorded','doe_review','doe_opinion_positive','demo_regulator_001','Positive opinion; no qualifications','2026-04-10 14:00:00');

-- ─── 6) doe_opinion_qualified ───────────────────────────────────────────────
INSERT OR IGNORE INTO mrv_submissions (
  id, project_id, reporting_period_start, reporting_period_end,
  claimed_reductions_tco2e, monitoring_methodology, status,
  chain_status, submitted_at, doe_assignee_id, doe_assigned_at, doe_due_at,
  doe_opinion, doe_opinion_at, created_at
) VALUES
('mrv_chain_006','cp_002','2025-04-01','2025-06-30',5320,'ACM0002 v19 monitoring plan','verified','doe_opinion_qualified',
  '2026-01-20 09:00:00','demo_regulator_001','2026-01-28 09:00:00','2026-04-28 09:00:00',
  'qualified','2026-04-15 11:00:00','2026-01-15 09:00:00');

INSERT OR IGNORE INTO oe_mrv_chain_events (id, submission_id, event_type, from_status, to_status, actor_id, notes, created_at) VALUES
('mrv_evt_006_a','mrv_chain_006','submitted','draft','submitted','demo_ipp_002','Q2 2025 wind lodged','2026-01-20 09:00:00'),
('mrv_evt_006_b','mrv_chain_006','doe_assigned','submitted','doe_assigned','demo_regulator_001','DOE assigned','2026-01-28 09:00:00'),
('mrv_evt_006_c','mrv_chain_006','doe_review_started','doe_assigned','doe_review','demo_regulator_001','Review opened','2026-02-10 10:00:00'),
('mrv_evt_006_d','mrv_chain_006','doe_opinion_recorded','doe_review','doe_opinion_qualified','demo_regulator_001','Qualified: anemometer recalibration gap, minor','2026-04-15 11:00:00');

-- ─── 7) doe_opinion_adverse (terminal; regulator inbox critical) ────────────
INSERT OR IGNORE INTO mrv_submissions (
  id, project_id, reporting_period_start, reporting_period_end,
  claimed_reductions_tco2e, monitoring_methodology, status,
  chain_status, submitted_at, doe_assignee_id, doe_assigned_at, doe_due_at,
  doe_opinion, doe_opinion_at, created_at
) VALUES
('mrv_chain_007','cp_004','2024-07-01','2024-12-31',12500,'ACM0009 v6 monitoring plan','rejected','doe_opinion_adverse',
  '2025-09-15 09:00:00','demo_regulator_001','2025-09-22 09:00:00','2025-12-21 09:00:00',
  'adverse','2025-12-10 16:00:00','2025-09-10 09:00:00');

INSERT OR IGNORE INTO oe_mrv_chain_events (id, submission_id, event_type, from_status, to_status, actor_id, notes, created_at) VALUES
('mrv_evt_007_a','mrv_chain_007','submitted','draft','submitted','demo_ipp_001','H2 2024 biomass lodged','2025-09-15 09:00:00'),
('mrv_evt_007_b','mrv_chain_007','doe_assigned','submitted','doe_assigned','demo_regulator_001','DOE assigned','2025-09-22 09:00:00'),
('mrv_evt_007_c','mrv_chain_007','doe_review_started','doe_assigned','doe_review','demo_regulator_001','Review opened','2025-10-05 10:00:00'),
('mrv_evt_007_d','mrv_chain_007','doe_opinion_recorded','doe_review','doe_opinion_adverse','demo_regulator_001','Adverse: feedstock-tonnage gap > 15%, leakage understated','2025-12-10 16:00:00');

-- ─── 8) cra_review (CRA actively reviewing; 30d SLA running) ────────────────
INSERT OR IGNORE INTO mrv_submissions (
  id, project_id, reporting_period_start, reporting_period_end,
  claimed_reductions_tco2e, monitoring_methodology, status,
  chain_status, submitted_at, doe_assignee_id, doe_assigned_at, doe_due_at,
  doe_opinion, doe_opinion_at, cra_submitted_at, cra_due_at, created_at
) VALUES
('mrv_chain_008','cp_001','2025-01-01','2025-03-31',7000,'ACM0002 v19 monitoring plan','verified','cra_review',
  '2025-10-15 09:00:00','demo_regulator_001','2025-10-22 09:00:00','2026-01-20 09:00:00',
  'positive','2025-12-15 14:00:00','2026-05-12 09:00:00','2026-06-11 09:00:00','2025-10-10 09:00:00');

INSERT OR IGNORE INTO oe_mrv_chain_events (id, submission_id, event_type, from_status, to_status, actor_id, notes, created_at) VALUES
('mrv_evt_008_a','mrv_chain_008','submitted','draft','submitted','demo_ipp_001','Q1 2025 lodged','2025-10-15 09:00:00'),
('mrv_evt_008_b','mrv_chain_008','doe_assigned','submitted','doe_assigned','demo_regulator_001','DOE assigned','2025-10-22 09:00:00'),
('mrv_evt_008_c','mrv_chain_008','doe_review_started','doe_assigned','doe_review','demo_regulator_001','Review opened','2025-11-05 10:00:00'),
('mrv_evt_008_d','mrv_chain_008','doe_opinion_recorded','doe_review','doe_opinion_positive','demo_regulator_001','Positive opinion','2025-12-15 14:00:00'),
('mrv_evt_008_e','mrv_chain_008','cra_submitted','doe_opinion_positive','cra_review','demo_ipp_001','Submitted to CRA; 30d clock','2026-05-12 09:00:00');

-- ─── 9) cra_approved (ready for issuance authorization) ─────────────────────
INSERT OR IGNORE INTO mrv_submissions (
  id, project_id, reporting_period_start, reporting_period_end,
  claimed_reductions_tco2e, monitoring_methodology, status,
  chain_status, submitted_at, doe_assignee_id, doe_assigned_at, doe_due_at,
  doe_opinion, doe_opinion_at, cra_submitted_at, cra_due_at,
  cra_decision, cra_decision_at, cra_decision_by, created_at
) VALUES
('mrv_chain_009','cp_001','2024-10-01','2024-12-31',6950,'ACM0002 v19 monitoring plan','verified','cra_approved',
  '2025-07-15 09:00:00','demo_regulator_001','2025-07-22 09:00:00','2025-10-20 09:00:00',
  'positive','2025-09-25 14:00:00','2025-11-10 09:00:00','2025-12-10 09:00:00',
  'approved','2025-12-05 11:00:00','demo_regulator_001','2025-07-10 09:00:00');

INSERT OR IGNORE INTO oe_mrv_chain_events (id, submission_id, event_type, from_status, to_status, actor_id, notes, created_at) VALUES
('mrv_evt_009_a','mrv_chain_009','submitted','draft','submitted','demo_ipp_001','Q4 2024 lodged','2025-07-15 09:00:00'),
('mrv_evt_009_b','mrv_chain_009','doe_assigned','submitted','doe_assigned','demo_regulator_001','DOE assigned','2025-07-22 09:00:00'),
('mrv_evt_009_c','mrv_chain_009','doe_review_started','doe_assigned','doe_review','demo_regulator_001','Review opened','2025-08-08 10:00:00'),
('mrv_evt_009_d','mrv_chain_009','doe_opinion_recorded','doe_review','doe_opinion_positive','demo_regulator_001','Positive opinion','2025-09-25 14:00:00'),
('mrv_evt_009_e','mrv_chain_009','cra_submitted','doe_opinion_positive','cra_review','demo_ipp_001','To CRA','2025-11-10 09:00:00'),
('mrv_evt_009_f','mrv_chain_009','cra_approved','cra_review','cra_approved','demo_regulator_001','CRA approved; ready for authorization','2025-12-05 11:00:00');

-- ─── 10) cra_rejected (terminal; regulator inbox high) ─────────────────────
INSERT OR IGNORE INTO mrv_submissions (
  id, project_id, reporting_period_start, reporting_period_end,
  claimed_reductions_tco2e, monitoring_methodology, status,
  chain_status, submitted_at, doe_assignee_id, doe_assigned_at, doe_due_at,
  doe_opinion, doe_opinion_at, cra_submitted_at, cra_due_at,
  cra_decision, cra_decision_at, cra_decision_by, cra_rejection_reason, created_at
) VALUES
('mrv_chain_010','cp_002','2024-07-01','2024-09-30',5280,'ACM0002 v19 monitoring plan','rejected','cra_rejected',
  '2025-05-15 09:00:00','demo_regulator_001','2025-05-22 09:00:00','2025-08-20 09:00:00',
  'qualified','2025-08-10 14:00:00','2025-09-15 09:00:00','2025-10-15 09:00:00',
  'rejected','2025-10-08 11:00:00','demo_regulator_001','Corresponding-adjustment letter from Botswana not yet on file','2025-05-10 09:00:00');

INSERT OR IGNORE INTO oe_mrv_chain_events (id, submission_id, event_type, from_status, to_status, actor_id, notes, created_at) VALUES
('mrv_evt_010_a','mrv_chain_010','submitted','draft','submitted','demo_ipp_002','Q3 2024 wind lodged','2025-05-15 09:00:00'),
('mrv_evt_010_b','mrv_chain_010','doe_assigned','submitted','doe_assigned','demo_regulator_001','DOE assigned','2025-05-22 09:00:00'),
('mrv_evt_010_c','mrv_chain_010','doe_review_started','doe_assigned','doe_review','demo_regulator_001','Review opened','2025-06-05 10:00:00'),
('mrv_evt_010_d','mrv_chain_010','doe_opinion_recorded','doe_review','doe_opinion_qualified','demo_regulator_001','Qualified opinion','2025-08-10 14:00:00'),
('mrv_evt_010_e','mrv_chain_010','cra_submitted','doe_opinion_qualified','cra_review','demo_ipp_002','To CRA','2025-09-15 09:00:00'),
('mrv_evt_010_f','mrv_chain_010','cra_rejected','cra_review','cra_rejected','demo_regulator_001','Rejected: corresponding-adjustment letter missing','2025-10-08 11:00:00');

-- ─── 11) issuance_authorized (about to be issued) ──────────────────────────
INSERT OR IGNORE INTO mrv_submissions (
  id, project_id, reporting_period_start, reporting_period_end,
  claimed_reductions_tco2e, monitoring_methodology, status,
  chain_status, submitted_at, doe_assignee_id, doe_assigned_at, doe_due_at,
  doe_opinion, doe_opinion_at, cra_submitted_at, cra_due_at,
  cra_decision, cra_decision_at, cra_decision_by,
  issuance_authorized_at, issuance_authorized_by, created_at
) VALUES
('mrv_chain_011','cp_001','2024-07-01','2024-09-30',7150,'ACM0002 v19 monitoring plan','verified','issuance_authorized',
  '2025-04-15 09:00:00','demo_regulator_001','2025-04-22 09:00:00','2025-07-20 09:00:00',
  'positive','2025-06-25 14:00:00','2025-07-10 09:00:00','2025-08-10 09:00:00',
  'approved','2025-08-05 11:00:00','demo_regulator_001',
  '2025-08-12 09:00:00','demo_regulator_001','2025-04-10 09:00:00');

INSERT OR IGNORE INTO oe_mrv_chain_events (id, submission_id, event_type, from_status, to_status, actor_id, notes, created_at) VALUES
('mrv_evt_011_a','mrv_chain_011','submitted','draft','submitted','demo_ipp_001','Q3 2024 lodged','2025-04-15 09:00:00'),
('mrv_evt_011_b','mrv_chain_011','doe_assigned','submitted','doe_assigned','demo_regulator_001','DOE assigned','2025-04-22 09:00:00'),
('mrv_evt_011_c','mrv_chain_011','doe_review_started','doe_assigned','doe_review','demo_regulator_001','Review opened','2025-05-08 10:00:00'),
('mrv_evt_011_d','mrv_chain_011','doe_opinion_recorded','doe_review','doe_opinion_positive','demo_regulator_001','Positive','2025-06-25 14:00:00'),
('mrv_evt_011_e','mrv_chain_011','cra_submitted','doe_opinion_positive','cra_review','demo_ipp_001','To CRA','2025-07-10 09:00:00'),
('mrv_evt_011_f','mrv_chain_011','cra_approved','cra_review','cra_approved','demo_regulator_001','CRA approved','2025-08-05 11:00:00'),
('mrv_evt_011_g','mrv_chain_011','issuance_authorized','cra_approved','issuance_authorized','demo_regulator_001','Issuance authorized; pending serial mint','2025-08-12 09:00:00');

-- ─── 12) issued (terminal happy path) ──────────────────────────────────────
INSERT OR IGNORE INTO mrv_submissions (
  id, project_id, reporting_period_start, reporting_period_end,
  claimed_reductions_tco2e, monitoring_methodology, status,
  chain_status, submitted_at, doe_assignee_id, doe_assigned_at, doe_due_at,
  doe_opinion, doe_opinion_at, cra_submitted_at, cra_due_at,
  cra_decision, cra_decision_at, cra_decision_by,
  issuance_authorized_at, issuance_authorized_by, created_at
) VALUES
('mrv_chain_012','cp_001','2024-04-01','2024-06-30',6900,'ACM0002 v19 monitoring plan','issued','issued',
  '2025-01-15 09:00:00','demo_regulator_001','2025-01-22 09:00:00','2025-04-22 09:00:00',
  'positive','2025-03-20 14:00:00','2025-04-05 09:00:00','2025-05-05 09:00:00',
  'approved','2025-04-30 11:00:00','demo_regulator_001',
  '2025-05-10 09:00:00','demo_regulator_001','2025-01-10 09:00:00');

INSERT OR IGNORE INTO oe_mrv_chain_events (id, submission_id, event_type, from_status, to_status, actor_id, notes, created_at) VALUES
('mrv_evt_012_a','mrv_chain_012','submitted','draft','submitted','demo_ipp_001','Q2 2024 lodged','2025-01-15 09:00:00'),
('mrv_evt_012_b','mrv_chain_012','doe_assigned','submitted','doe_assigned','demo_regulator_001','DOE assigned','2025-01-22 09:00:00'),
('mrv_evt_012_c','mrv_chain_012','doe_review_started','doe_assigned','doe_review','demo_regulator_001','Review opened','2025-02-10 10:00:00'),
('mrv_evt_012_d','mrv_chain_012','doe_opinion_recorded','doe_review','doe_opinion_positive','demo_regulator_001','Positive','2025-03-20 14:00:00'),
('mrv_evt_012_e','mrv_chain_012','cra_submitted','doe_opinion_positive','cra_review','demo_ipp_001','To CRA','2025-04-05 09:00:00'),
('mrv_evt_012_f','mrv_chain_012','cra_approved','cra_review','cra_approved','demo_regulator_001','CRA approved','2025-04-30 11:00:00'),
('mrv_evt_012_g','mrv_chain_012','issuance_authorized','cra_approved','issuance_authorized','demo_regulator_001','Issuance authorized','2025-05-10 09:00:00'),
('mrv_evt_012_h','mrv_chain_012','issuance_authorized','issuance_authorized','issued','demo_regulator_001','6900 tCO2e serials minted','2025-05-15 09:00:00');
