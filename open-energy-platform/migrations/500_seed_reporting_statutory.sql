-- ═══════════════════════════════════════════════════════════════════════
-- 500_seed_reporting_statutory.sql
-- Demo seed: statutory reports for all roles (NERSA, FSCA, SARS, IPP, Lender, ESG)
-- Safe to re-run (INSERT OR IGNORE throughout)
-- ═══════════════════════════════════════════════════════════════════════

-- ════════════════════════════════════════════════════════════════════════
-- 500_seed_reporting_statutory.sql
--
-- Statutory reporting seed data for Open Energy Platform demo environment.
-- SA fiscal year: April–March.  NERSA licence prefix: L/NR/001/...
-- Participant IDs match demo accounts provisioned by onboarding migrations.
-- All statements are INSERT OR IGNORE — safe to re-apply.
--
-- Tables seeded:
--   1.  oe_report_submissions       (6 rows)
--   2.  oe_nersa_reports            (3 rows)
--   3.  oe_ipp_annual_reports       (1 row)
--   4.  oe_ipp_quarterly_gen_reports(3 rows)
--   5.  oe_ipp_reipppp_reports      (1 row)
--   6.  oe_ipp_lender_reporting     (2 rows)
--   7.  oe_green_bond_reports       (1 row)
--   8.  oe_construction_cost_reports(1 row)
--   9.  oe_capital_adequacy_reports (1 row)
--   10. oe_regulator_export_pack    (2 rows)
--   11. oe_esg_disclosure           (2 rows)
-- ════════════════════════════════════════════════════════════════════════

-- ─── 1. oe_report_submissions ────────────────────────────────────────────
-- 6 submissions: NERSA quarterly, FSCA conduct, SARS carbon tax,
-- DMRE generation, JSE trade-repository, ESG annual.

INSERT OR IGNORE INTO oe_report_submissions
  (id, report_kind, report_id, submitted_to, submitted_by,
   submission_envelope_r2_key, acknowledgment_id,
   acknowledgment_received_at, status, rejection_reason,
   resubmission_of_id, submitted_at, created_at)
VALUES
  (
    'rsub_nersa_q1_2025',
    'nersa_quarterly',
    'nersa_rpt_q1_2025',
    'NERSA',
    'demo_admin_001',
    'reports/nersa/2025/Q1/envelope.xml',
    'NERSA-ACK-2025-Q1-00142',
    '2025-04-08T10:15:00Z',
    'accepted',
    NULL,
    NULL,
    '2025-04-05T09:00:00Z',
    '2025-04-05T09:00:00Z'
  );

INSERT OR IGNORE INTO oe_report_submissions
  (id, report_kind, report_id, submitted_to, submitted_by,
   submission_envelope_r2_key, acknowledgment_id,
   acknowledgment_received_at, status, rejection_reason,
   resubmission_of_id, submitted_at, created_at)
VALUES
  (
    'rsub_nersa_q2_2025',
    'nersa_quarterly',
    'nersa_rpt_q2_2025',
    'NERSA',
    'demo_admin_001',
    'reports/nersa/2025/Q2/envelope.xml',
    'NERSA-ACK-2025-Q2-00278',
    '2025-07-07T11:30:00Z',
    'accepted',
    NULL,
    NULL,
    '2025-07-04T09:00:00Z',
    '2025-07-04T09:00:00Z'
  );

INSERT OR IGNORE INTO oe_report_submissions
  (id, report_kind, report_id, submitted_to, submitted_by,
   submission_envelope_r2_key, acknowledgment_id,
   acknowledgment_received_at, status, rejection_reason,
   resubmission_of_id, submitted_at, created_at)
VALUES
  (
    'rsub_fsca_conduct_2025',
    'sars_irp6',
    'fsca_cmp_rpt_2025',
    'FSCA_efiling',
    'demo_admin_001',
    'reports/fsca/2025/annual-compliance/envelope.xml',
    'FSCA-CO-2025-00891',
    '2025-09-12T14:00:00Z',
    'accepted',
    NULL,
    NULL,
    '2025-09-10T08:30:00Z',
    '2025-09-10T08:30:00Z'
  );

INSERT OR IGNORE INTO oe_report_submissions
  (id, report_kind, report_id, submitted_to, submitted_by,
   submission_envelope_r2_key, acknowledgment_id,
   acknowledgment_received_at, status, rejection_reason,
   resubmission_of_id, submitted_at, created_at)
VALUES
  (
    'rsub_sars_carbon_2025',
    'sars_carbon_tax',
    'sars_carbon_rpt_2025',
    'SARS_efiling',
    'demo_admin_001',
    'reports/sars/2025/carbon-tax/envelope.xml',
    'SARS-CT-2025-LP-00412',
    '2025-08-20T09:45:00Z',
    'acknowledged',
    NULL,
    NULL,
    '2025-08-15T10:00:00Z',
    '2025-08-15T10:00:00Z'
  );

INSERT OR IGNORE INTO oe_report_submissions
  (id, report_kind, report_id, submitted_to, submitted_by,
   submission_envelope_r2_key, acknowledgment_id,
   acknowledgment_received_at, status, rejection_reason,
   resubmission_of_id, submitted_at, created_at)
VALUES
  (
    'rsub_dmre_gen_q3_2025',
    'nersa_quarterly',
    'nersa_rpt_q3_2025',
    'NERSA',
    'demo_admin_001',
    'reports/dmre/2025/Q3/generation-envelope.xml',
    NULL,
    NULL,
    'queued',
    NULL,
    NULL,
    NULL,
    '2026-01-10T08:00:00Z'
  );

INSERT OR IGNORE INTO oe_report_submissions
  (id, report_kind, report_id, submitted_to, submitted_by,
   submission_envelope_r2_key, acknowledgment_id,
   acknowledgment_received_at, status, rejection_reason,
   resubmission_of_id, submitted_at, created_at)
VALUES
  (
    'rsub_jse_trade_2025',
    'sars_irp6',
    'jse_trade_rpt_2025',
    'JSE_SRL',
    'demo_admin_001',
    'reports/jse/2025/trade-repository/envelope.xml',
    'JSE-TR-2025-00334',
    '2025-11-05T16:00:00Z',
    'accepted',
    NULL,
    NULL,
    '2025-11-03T09:00:00Z',
    '2025-11-03T09:00:00Z'
  );

-- ─── 2. oe_nersa_reports ─────────────────────────────────────────────────
-- 3 NERSA quarterly generation reports: Q1–Q3 of FY2025-2026 (Apr-Mar).
-- NERSA quarter numbering follows SA fiscal year (Q1 = Apr-Jun).

INSERT OR IGNORE INTO oe_nersa_reports
  (id, year, quarter, status, r2_key, summary_json,
   generated_at, submitted_at, generated_by)
VALUES
  (
    'nersa_rpt_q1_2025',
    2025,
    1,
    'accepted',
    'reports/nersa/2025/Q1/nersa-qrpt-2025-q1.pdf',
    '{"period":"Q1 FY2025","generation_mwh":42180,"availability_pct":94.2,"capacity_factor_pct":23.1,"licence_ref":"L/NR/001/0012/2022","project":"Limpopo Solar Park"}',
    '2025-04-03T07:00:00Z',
    '2025-04-05T09:00:00Z',
    'demo_admin_001'
  );

INSERT OR IGNORE INTO oe_nersa_reports
  (id, year, quarter, status, r2_key, summary_json,
   generated_at, submitted_at, generated_by)
VALUES
  (
    'nersa_rpt_q2_2025',
    2025,
    2,
    'accepted',
    'reports/nersa/2025/Q2/nersa-qrpt-2025-q2.pdf',
    '{"period":"Q2 FY2025","generation_mwh":39640,"availability_pct":93.8,"capacity_factor_pct":21.7,"licence_ref":"L/NR/001/0012/2022","project":"Limpopo Solar Park"}',
    '2025-07-02T07:00:00Z',
    '2025-07-04T09:00:00Z',
    'demo_admin_001'
  );

INSERT OR IGNORE INTO oe_nersa_reports
  (id, year, quarter, status, r2_key, summary_json,
   generated_at, submitted_at, generated_by)
VALUES
  (
    'nersa_rpt_q3_2025',
    2025,
    3,
    'generated',
    'reports/nersa/2025/Q3/nersa-qrpt-2025-q3.pdf',
    '{"period":"Q3 FY2025","generation_mwh":38920,"availability_pct":92.6,"capacity_factor_pct":21.2,"licence_ref":"L/NR/001/0012/2022","project":"Limpopo Solar Park"}',
    '2026-01-08T07:00:00Z',
    NULL,
    'demo_admin_001'
  );

-- ─── 3. oe_ipp_annual_reports ─────────────────────────────────────────────
-- 1 annual report: FY 2024/25 (reporting_year=2024, SA fiscal Apr 2024 – Mar 2025)
-- for demo_ipp_001 / seed_proj_001 (Limpopo Solar Park, 100 MW utility-scale).

INSERT OR IGNORE INTO oe_ipp_annual_reports
  (id, participant_id, project_id,
   reporting_year, capacity_mw, capacity_tier,
   report_category, description,
   chain_status, sla_due_at, sla_breached,
   submitted_at, accepted_at, rejected_at,
   appeal_lodged_at, appeal_determined_at,
   created_at, updated_at)
VALUES
  (
    'ipp_anr_seed_proj_001_2024',
    'demo_ipp_001',
    'seed_proj_001',
    2024,
    100.0,
    'utility',
    'annual_returns',
    'ERA 4/2006 §11(1)(h) annual returns for Limpopo Solar Park (100 MW) covering FY2024/25 (April 2024 – March 2025). Submission includes NERSA licence L/NR/001/0012/2022 condition adherence, REIPPPP Round 4 local content 58.3%, generation 160,740 MWh (availability 94.2%), ED spend R12.4M, SED spend R6.2M, and NERSA Grid Code §B4 power-quality audit confirmation.',
    'accepted',
    '2025-06-30T23:59:59Z',
    0,
    '2025-06-15T10:00:00Z',
    '2025-07-10T14:00:00Z',
    NULL,
    NULL,
    NULL,
    '2025-04-01T08:00:00Z',
    '2025-07-10T14:00:00Z'
  );

-- ─── 4. oe_ipp_quarterly_gen_reports ──────────────────────────────────────
-- 3 DMRE quarterly generation reports: Q1, Q2, Q3 FY2025-2026 for demo_ipp_001.
-- SA fiscal Q1 = Apr–Jun 2025, Q2 = Jul–Sep 2025, Q3 = Oct–Dec 2025.

INSERT OR IGNORE INTO oe_ipp_quarterly_gen_reports
  (id, participant_id, project_id, quarter,
   report_period_start, report_period_end,
   project_mw, mwh_contracted, mwh_actual,
   availability_pct, capacity_factor_pct,
   ed_spend_qtd_zar, sed_spend_qtd_zar,
   project_tier, chain_status,
   sla_days, sla_deadline, sla_breached,
   actor_id, actor_party, notes,
   created_at, updated_at)
VALUES
  (
    'seed_qgr_001_q1_fy2025',
    'demo_ipp_001',
    'seed_proj_001',
    'Q1_FY2025',
    '2025-04-01',
    '2025-06-30',
    100.0,
    162000,
    152840,
    94.2,
    23.1,
    3100000,
    1550000,
    'major',
    'report_accepted',
    45,
    '2025-08-14',
    0,
    'demo_ipp_001',
    'ipp_developer',
    'Q1 FY2025 quarterly generation report for Limpopo Solar Park accepted by DMRE IPP Office. Reference IPO-2025-Q1-00441. Generation 152,840 MWh vs contracted 162,000 MWh (94.3% attainment); availability 94.2%; curtailment 4,280 MWh (Eskom load-shedding Stage 4, May 2025). ED and SED spend on track per REIPPPP Schedule 3.',
    '2025-04-01T08:00:00Z',
    '2025-08-28T14:00:00Z'
  );

INSERT OR IGNORE INTO oe_ipp_quarterly_gen_reports
  (id, participant_id, project_id, quarter,
   report_period_start, report_period_end,
   project_mw, mwh_contracted, mwh_actual,
   availability_pct, capacity_factor_pct,
   ed_spend_qtd_zar, sed_spend_qtd_zar,
   project_tier, chain_status,
   sla_days, sla_deadline, sla_breached,
   actor_id, actor_party, notes,
   created_at, updated_at)
VALUES
  (
    'seed_qgr_002_q2_fy2025',
    'demo_ipp_001',
    'seed_proj_001',
    'Q2_FY2025',
    '2025-07-01',
    '2025-09-30',
    100.0,
    162000,
    147200,
    92.6,
    21.7,
    3050000,
    1525000,
    'major',
    'report_accepted',
    45,
    '2025-11-14',
    0,
    'demo_ipp_001',
    'ipp_developer',
    'Q2 FY2025 quarterly generation report for Limpopo Solar Park accepted by DMRE IPP Office. Reference IPO-2025-Q2-00609. Generation 147,200 MWh vs contracted 162,000 MWh (90.9% attainment); availability 92.6%; Q2 includes winter low-irradiation season. ED quarterly spend cumulative YTD R6.15M (on track for annual R12.4M target). SED cumulative YTD R3.075M.',
    '2025-07-01T08:00:00Z',
    '2025-11-20T11:00:00Z'
  );

INSERT OR IGNORE INTO oe_ipp_quarterly_gen_reports
  (id, participant_id, project_id, quarter,
   report_period_start, report_period_end,
   project_mw, mwh_contracted, mwh_actual,
   availability_pct, capacity_factor_pct,
   ed_spend_qtd_zar, sed_spend_qtd_zar,
   project_tier, chain_status,
   sla_days, sla_deadline, sla_breached,
   actor_id, actor_party, notes,
   created_at, updated_at)
VALUES
  (
    'seed_qgr_003_q3_fy2025',
    'demo_ipp_001',
    'seed_proj_001',
    'Q3_FY2025',
    '2025-10-01',
    '2025-12-31',
    100.0,
    162000,
    151480,
    93.5,
    22.4,
    3250000,
    1625000,
    'major',
    'ipp_office_submission',
    45,
    '2026-02-14',
    0,
    'demo_ipp_001',
    'ipp_developer',
    'Q3 FY2025 quarterly generation report submitted to DMRE IPP Office portal. Reference IPO-2026-Q3-00042; acknowledgement awaited. Generation 151,480 MWh; availability 93.5%; spring irradiation recovery. REIPPPP ED cumulative YTD R9.4M; SED cumulative YTD R4.7M. SCADA data certified by independent engineer Aurecon (IE-Q3-2025-LP-001).',
    '2025-10-01T08:00:00Z',
    '2026-01-28T09:00:00Z'
  );

-- ─── 5. oe_ipp_reipppp_reports ────────────────────────────────────────────
-- 1 REIPPPP annual operational compliance report for demo_ipp_001 / seed_proj_001
-- Bid window: REIPPPP Round 4.  Report period: FY2024-2025.

INSERT OR IGNORE INTO oe_ipp_reipppp_reports
  (id, project_ref, reipppp_bid_ref, report_period,
   project_mw, project_tier, report_type,
   local_content_pct, ed_spend_zar, jobs_direct,
   chain_status, sla_due_date, sla_breached, is_reportable,
   actor_party, reason, notes,
   created_at, updated_at)
VALUES
  (
    'seed_rpr_001_proj_001_fy2025',
    'SOLAR-LP-UTIL-001',
    'REIPPPP-BW-4-2019-LP-007',
    '2024-2025',
    100.0,
    'major',
    'annual_operational',
    58.3,
    12400000.0,
    187,
    'report_accepted',
    '2025-08-31',
    0,
    0,
    'ipp_developer',
    NULL,
    'REIPPPP Round 4 annual operational report for Limpopo Solar Park (100 MW) FY2024-2025 accepted by IPP Office. Reference IPO-ANR-2025-LP-007. Local content 58.3% (above 40% minimum); ED spend R12.4M (on target R12.4M); direct jobs 187 (above 150 minimum commitment). No remediation items. Compliance certificate signed by CEO and CFO.',
    '2025-04-01T08:00:00Z',
    '2025-09-15T11:00:00Z'
  );

-- ─── 6. oe_ipp_lender_reporting ──────────────────────────────────────────
-- 2 lender reports for demo_lender_001:
--   Q1 FY2025 (package_acknowledged) and Q2 FY2025 (lender_distribution).

INSERT OR IGNORE INTO oe_ipp_lender_reporting
  (id, project_ref, report_period,
   lender_count, lender_tier, report_type,
   agent_bank, due_date, chain_status,
   sla_due_date, sla_breached, is_reportable,
   actor_party, reason, notes,
   created_at, updated_at)
VALUES
  (
    'seed_lrep_001_q1_fy2025',
    'SOLAR-LP-UTIL-001',
    'Q1 FY2025',
    3,
    'club',
    'quarterly_report',
    'Standard Bank CIB (Agent Bank)',
    '2025-08-14',
    'package_acknowledged',
    '2026-08-14',
    0,
    1,
    'ipp_developer',
    'All 3 club lenders (DBSA R450M + IDC R300M + Standard Bank R450M = R1.2B) acknowledged Q1 FY2025 quarterly compliance package via Standard Bank CIB agent bank portal on 2025-08-22. DSCR Q1 FY2025 1.48x (covenant minimum 1.20x); DSRA fully funded R72M; no covenant breach. is_reportable=1: annual acknowledgement milestone required under REIPPPP IA clause 12.4.',
    'Q1 FY2025 quarterly lender report for Limpopo Solar Park (100 MW, R1.2B club facility: DBSA R450M + IDC R300M + Standard Bank R450M). CTA-2019-LP-001. Standard Bank CIB agent bank. Report package submitted 2025-08-10 (4 days ahead of SFA Schedule 7 45-day due date of 2025-08-14). Contents: compliance certificate (CEO + CFO co-signed confirming no EoD), Q1 FY2025 management accounts (revenue R41.8M, EBITDA R37.6M, DSCR 1.48x), updated financial model (base case DSCR 1.44x–1.55x remaining tenor), IE quarterly report (Aurecon: generation 152,840 MWh, availability 94.2%, P50 performance 94.3%), DSRA statement R72M (6-month reserve fully funded), insurance certificates (ISR + BI + TPL via Santam), E&S Q1 monitoring report. All 3 lenders acknowledged by 2025-08-22. DSCR well above covenant; no distribution lock-up triggered. Next semi-annual report due 2025-11-14.',
    '2025-04-01T08:00:00Z',
    '2025-08-22T16:00:00Z'
  );

INSERT OR IGNORE INTO oe_ipp_lender_reporting
  (id, project_ref, report_period,
   lender_count, lender_tier, report_type,
   agent_bank, due_date, chain_status,
   sla_due_date, sla_breached, is_reportable,
   actor_party, reason, notes,
   created_at, updated_at)
VALUES
  (
    'seed_lrep_002_q2_fy2025',
    'SOLAR-LP-UTIL-001',
    'Q2 FY2025',
    3,
    'club',
    'quarterly_report',
    'Standard Bank CIB (Agent Bank)',
    '2025-11-14',
    'lender_distribution',
    '2025-11-30',
    0,
    0,
    'ipp_developer',
    NULL,
    'Q2 FY2025 quarterly lender report for Limpopo Solar Park distributed to all 3 club lenders by Standard Bank CIB agent bank on 2025-11-12 (2 days ahead of SFA due date 2025-11-14). Distribution reference SBI-DIST-Q2FY2025-LP-001. Report package submitted to agent bank 2025-11-10. Contents: compliance certificate (DSCR 1.42x; above 1.20x covenant minimum; availability 92.6%; winter season Q2 as expected), Q2 FY2025 management accounts (revenue R39.4M, EBITDA R35.2M), IE Aurecon report (generation 147,200 MWh, P90 performance confirmed), DSRA balance R70.8M (5-month reserve; to be topped up from Q3 revenue per waterfall), MRA balance R18.4M. Lender acknowledgement window open per CTA clause 18.6 (5 business days from distribution). Acknowledgement deadline 2025-11-20. Lenders yet to confirm.',
    '2025-07-01T08:00:00Z',
    '2025-11-12T15:00:00Z'
  );

-- ─── 7. oe_green_bond_reports ─────────────────────────────────────────────
-- 1 green bond allocation & impact report for demo_lender_001 (JSE-listed green bond).
-- Bond: Limpopo Solar Park project bond, ISIN ZAG000174821.
-- FY2025 impact report, chain_status = published.

INSERT OR IGNORE INTO oe_green_bond_reports
  (id, participant_id, bond_isin, bond_class,
   report_year,
   issuance_size_zar,
   reporting_period_start, reporting_period_end,
   chain_status,
   kwh_generated, carbon_avoided_tco2e,
   green_capex_deployed_zar, eligible_projects_count,
   external_reviewer, review_type,
   review_completed_at, review_ref,
   board_approved_at, board_resolution_ref,
   jse_submission_ref, jse_approved_at, published_at,
   query_count, last_query_at, last_response_at,
   deficiency_description, rejection_reason,
   sla_deadline, sla_breached, regulator_notified,
   actor_id, reason,
   created_at, updated_at)
VALUES
  (
    'seed_gbr_001_fy2025',
    'demo_lender_001',
    'ZAG000174821',
    'project',
    2025,
    1200000000.0,
    '2025-04-01',
    '2026-03-31',
    'published',
    160740000.0,
    152703.0,
    1200000000.0,
    1,
    'Deloitte Sustainability Assurance (SA)',
    'second_party',
    '2025-10-15T14:00:00Z',
    'DSA-GBR-2025-LP-001',
    '2025-10-28T10:00:00Z',
    'BR-2025-Q3-008',
    'JSE-GBR-2025-00142',
    '2025-11-10T09:00:00Z',
    '2025-11-15T12:00:00Z',
    0,
    NULL,
    NULL,
    NULL,
    NULL,
    '2025-12-31',
    0,
    0,
    'demo_lender_001',
    'Green bond FY2025 impact report published to JSE and bond investor portal. ICMA GBP 2021 compliant. Deloitte second-party opinion confirms use-of-proceeds allocation 100% to Limpopo Solar Park (eligible renewable energy project per CBI Climate Bonds Standard v3.0 Solar Criteria). Generation 160,740 MWh FY2025; carbon avoided 152,703 tCO2e (CSIR SA grid emission factor 0.950 kgCO2e/kWh). All R1.2B bond proceeds deployed.',
    '2025-04-01T08:00:00Z',
    '2025-11-15T12:00:00Z'
  );

-- ─── 8. oe_construction_cost_reports ─────────────────────────────────────
-- 1 construction cost IE report for demo_ipp_001 / seed_proj_002 (Eastern Cape Wind).
-- Under construction; budget_tier=large; chain_status=ie_certified.

INSERT OR IGNORE INTO oe_construction_cost_reports
  (id, project_id, lender_id, ipp_id,
   report_month, budget_tier,
   total_project_budget_zar, actual_spend_to_date_zar,
   cost_to_complete_estimate_zar, projected_final_cost_zar,
   contingency_budget_zar, contingency_spent_zar,
   physical_completion_percentage,
   scheduled_completion_date, revised_completion_date,
   ie_name, ie_certification_ref, ie_certified_at,
   overrun_zar, overrun_percentage,
   equity_injection_required_zar, standby_facility_amount_zar,
   chain_status,
   sla_deadline, sla_breached, regulator_notified,
   actor_id, reason,
   created_at, updated_at)
VALUES
  (
    'seed_ccr_001_proj002_2026_01',
    'seed_proj_002',
    'demo_lender_001',
    'demo_ipp_001',
    '2026-01',
    'large',
    6800000000.0,
    3978000000.0,
    2754000000.0,
    6732000000.0,
    680000000.0,
    124000000.0,
    58.5,
    '2026-09-30',
    NULL,
    'WSP South Africa (Pty) Ltd',
    'WSP-IE-CCR-2026-01-EC-002',
    '2026-01-28T15:00:00Z',
    -68000000.0,
    -1.0,
    0.0,
    0.0,
    'ie_certified',
    '2026-02-05',
    0,
    0,
    'demo_lender_001',
    'IE WSP certified January 2026 cost-to-complete for Eastern Cape Wind (150 MW, EPC contractor Vestas SA, R6.8B budget). Physical completion 58.5% — on schedule for COD 2026-09-30. Actual spend R3.978B; cost-to-complete estimate R2.754B; projected final cost R6.732B (R68M UNDER budget — 1.0% under-run). Contingency R680M total; spent R124M (18.2%); R556M remaining. No equity injection required. No standby facility drawdown. Next report due February 2026.',
    '2026-01-15T08:00:00Z',
    '2026-01-28T15:00:00Z'
  );

-- ─── 9. oe_capital_adequacy_reports ──────────────────────────────────────
-- 1 SARB BA 900 capital adequacy report for demo_lender_001.
-- Period: 2025-Q4 (Oct–Dec 2025).  chain_status = accepted.

INSERT OR IGNORE INTO oe_capital_adequacy_reports
  (id, participant_id, bank_tier,
   report_period, reporting_date,
   cet1_ratio, tier1_ratio, total_capital_ratio, leverage_ratio,
   rwa_credit_risk, rwa_market_risk, rwa_operational_risk, rwa_total,
   capital_conservation_buffer, countercyclical_buffer, systemic_risk_buffer,
   sarb_submission_ref, sarb_accepted_at, ba900_form_ref,
   query_count, last_query_at, last_response_at,
   remediation_description, remediation_deadline,
   breach_description, breach_cet1_ratio,
   chain_status, sla_deadline, sla_breached, regulator_notified,
   actor_id, reason,
   created_at, updated_at)
VALUES
  (
    'seed_cap_001_lender_001_2025q4',
    'demo_lender_001',
    'mid_tier',
    '2025-Q4',
    '2025-12-31',
    14.8,
    16.2,
    18.4,
    7.1,
    28400000000.0,
    2100000000.0,
    3600000000.0,
    34100000000.0,
    2.5,
    0.0,
    0.0,
    'SARB-BA900-2025Q4-DL001-00892',
    '2026-01-28T10:00:00Z',
    'BA900-2025-Q4-FORM-DL001',
    0,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    'accepted',
    '2026-01-31',
    0,
    0,
    'demo_lender_001',
    'SARB accepted BA 900 return for Q4 2025 without queries. CET1 14.8% (SARB minimum 7.0% + conservation buffer 2.5% = 9.5% floor; headroom 5.3%). Total capital ratio 18.4% (SARB minimum 9.5% + 2.5% = 12.0% floor; headroom 6.4%). Leverage ratio 7.1% (SARB 4.0% minimum; compliant). RWA total R34.1B. No countercyclical buffer applies (SA CCyB at 0% per SARB Prudential Standard PS-21 Q4 2025). No systemic risk buffer (mid-tier classification, not D-SIB). All Basel III Pillar 1 + Pillar 2 ICAAP thresholds met.',
    '2025-10-01T08:00:00Z',
    '2026-01-28T10:00:00Z'
  );

-- ─── 10. oe_regulator_export_pack ────────────────────────────────────────
-- 2 export packs for demo_regulator_001:
--   (a) packaged + ready for lodgement (NERSA quarterly_attestation)
--   (b) archived (SARB annual_audit)

INSERT OR IGNORE INTO oe_regulator_export_pack
  (id, pack_number, pack_cadence, regulator_target,
   w113_evm_ref, w114_doc_control_ref, w115_submittal_ref,
   w116_rfi_ref, w117_change_order_ref,
   w118_block_height_range_low, w118_block_height_range_high,
   parent_pack_id,
   cross_regulator_pack, material_restatement,
   esg_double_materiality_trigger, lender_distribution_required,
   regulator_audit_in_progress,
   taxonomy_version_set, schema_well_formed,
   required_element_assets, required_element_liabilities,
   required_element_equity, required_element_revenue,
   required_element_profit_loss, required_element_cash_equivalents,
   required_element_segments_reported,
   ixbrl_inline_html_valid, pdf_a3_archival_attached,
   signing_policy_etsi_119312, cms_signature_rfc5652,
   xbrl_conformance_score,
   gri_standards_attached, sasb_standards_attached,
   tcfd_recommendations_attached, issb_ifrs_s1_s2_attached,
   esg_taxonomy_coverage_pct,
   coso_components_present, tsc_trust_categories_present,
   management_assertion_signed, auditor_opinion_attached,
   bridge_letter_attached, controls_narrative_completeness,
   internal_qa_passed, counterparty_signoff_obtained,
   regulator_ack_received,
   current_tier, authority_required, urgency_band, pack_health_band,
   pack_completeness_index, integrity_index,
   regulator_export_window_hours, days_to_quarterly_attestation,
   title, reason_code, reject_reason, withdraw_reason,
   restate_reason, suspend_reason,
   is_reportable, regulator_relevant, regulator_reason_text,
   mtls_cert_fingerprint, regulator_ack_code, regulator_reject_code,
   chain_status,
   pack_proposed_at, blocks_selected_at, leaves_filtered_at,
   xbrl_assembled_at, narratives_attached_at, internal_qa_at,
   counterparty_signoff_at, packaged_at, countersigned_at,
   lodged_via_api_at, acknowledged_by_regulator_at, archived_at,
   rejected_at, withdrawn_at, restated_at, suspended_at,
   regulator_crossed_at, regulator_inbox_ref, regulator_ref,
   sla_target_hours, sla_deadline_at, last_sla_breach_at,
   sla_breached, escalation_level,
   tenant_id, created_by, created_at, updated_at)
VALUES
  (
    'seed_rep_001_nersa_q3_2025',
    'REP-NERSA-2025-Q3-001',
    'quarterly_attestation',
    'nersa',
    NULL, NULL, NULL, NULL, NULL,
    4800, 4920,
    NULL,
    0, 0, 0, 0, 0,
    1, 1, 1, 1, 1, 1, 1, 1, 1,
    1, 1, 1, 1,
    92,
    0, 0, 0, 0,
    0,
    1, 1, 1, 1, 1, 1,
    1, 1, 0,
    'quarterly_attestation', 'CFO', 'high', 'green',
    88, 91,
    168, 12,
    'NERSA Q3 FY2025 Quarterly Attestation — Limpopo Solar Park L/NR/001/0012/2022',
    NULL, NULL, NULL, NULL, NULL,
    1, 1,
    'NERSA quarterly generation return per ERA 4/2006 s.14 licence condition 8.2. Generation 38,920 MWh, availability 92.6%, capacity factor 21.2%. Countersigned; ready for API lodgement.',
    'sha256:a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2',
    NULL, NULL,
    'packaged',
    '2026-01-06T08:00:00Z',
    '2026-01-07T10:00:00Z',
    '2026-01-08T09:00:00Z',
    '2026-01-10T14:00:00Z',
    '2026-01-13T11:00:00Z',
    '2026-01-15T16:00:00Z',
    '2026-01-17T10:00:00Z',
    '2026-01-20T14:00:00Z',
    NULL,
    NULL, NULL, NULL,
    NULL, NULL, NULL, NULL,
    NULL, NULL, NULL,
    168,
    '2026-02-04T23:59:59Z',
    NULL,
    0, 0,
    'default',
    'demo_regulator_001',
    '2026-01-06T08:00:00Z',
    '2026-01-20T14:00:00Z'
  );

INSERT OR IGNORE INTO oe_regulator_export_pack
  (id, pack_number, pack_cadence, regulator_target,
   w113_evm_ref, w114_doc_control_ref, w115_submittal_ref,
   w116_rfi_ref, w117_change_order_ref,
   w118_block_height_range_low, w118_block_height_range_high,
   parent_pack_id,
   cross_regulator_pack, material_restatement,
   esg_double_materiality_trigger, lender_distribution_required,
   regulator_audit_in_progress,
   taxonomy_version_set, schema_well_formed,
   required_element_assets, required_element_liabilities,
   required_element_equity, required_element_revenue,
   required_element_profit_loss, required_element_cash_equivalents,
   required_element_segments_reported,
   ixbrl_inline_html_valid, pdf_a3_archival_attached,
   signing_policy_etsi_119312, cms_signature_rfc5652,
   xbrl_conformance_score,
   gri_standards_attached, sasb_standards_attached,
   tcfd_recommendations_attached, issb_ifrs_s1_s2_attached,
   esg_taxonomy_coverage_pct,
   coso_components_present, tsc_trust_categories_present,
   management_assertion_signed, auditor_opinion_attached,
   bridge_letter_attached, controls_narrative_completeness,
   internal_qa_passed, counterparty_signoff_obtained,
   regulator_ack_received,
   current_tier, authority_required, urgency_band, pack_health_band,
   pack_completeness_index, integrity_index,
   regulator_export_window_hours, days_to_quarterly_attestation,
   title, reason_code, reject_reason, withdraw_reason,
   restate_reason, suspend_reason,
   is_reportable, regulator_relevant, regulator_reason_text,
   mtls_cert_fingerprint, regulator_ack_code, regulator_reject_code,
   chain_status,
   pack_proposed_at, blocks_selected_at, leaves_filtered_at,
   xbrl_assembled_at, narratives_attached_at, internal_qa_at,
   counterparty_signoff_at, packaged_at, countersigned_at,
   lodged_via_api_at, acknowledged_by_regulator_at, archived_at,
   rejected_at, withdrawn_at, restated_at, suspended_at,
   regulator_crossed_at, regulator_inbox_ref, regulator_ref,
   sla_target_hours, sla_deadline_at, last_sla_breach_at,
   sla_breached, escalation_level,
   tenant_id, created_by, created_at, updated_at)
VALUES
  (
    'seed_rep_002_sarb_annual_2025',
    'REP-SARB-2025-ANN-001',
    'annual_audit',
    'sarb',
    NULL, NULL, NULL, NULL, NULL,
    3200, 3640,
    NULL,
    0, 0, 0, 1, 0,
    1, 1, 1, 1, 1, 1, 1, 1, 1,
    1, 1, 1, 1,
    98,
    1, 1, 1, 1,
    82,
    1, 1, 1, 1, 1, 1,
    1, 1, 1,
    'annual_audit', 'CEO', 'medium', 'green',
    97, 99,
    480, 0,
    'SARB Annual Audit Pack FY2024/25 — demo_lender_001 BA 900 + ICAAP Pillar 2',
    NULL, NULL, NULL, NULL, NULL,
    1, 1,
    'SARB annual regulatory capital audit pack per BA 900 + SARB Directive 1/2014. CET1 14.8%, total capital 18.4%, leverage 7.1%. ICAAP Pillar 2 assessment complete. Acknowledged by SARB Prudential Authority 2025-10-18. Archived.',
    'sha256:b2c3d4e5f6g7b2c3d4e5f6g7b2c3d4e5f6g7b2c3d4e5f6g7b2c3d4e5f6g7b2c3',
    'SARB-ACK-2025-ANN-DL001-00019',
    NULL,
    'archived',
    '2025-07-01T08:00:00Z',
    '2025-07-03T10:00:00Z',
    '2025-07-07T09:00:00Z',
    '2025-07-14T14:00:00Z',
    '2025-07-21T11:00:00Z',
    '2025-07-28T16:00:00Z',
    '2025-08-04T10:00:00Z',
    '2025-08-11T14:00:00Z',
    '2025-08-15T10:00:00Z',
    '2025-08-18T09:00:00Z',
    '2025-10-18T11:00:00Z',
    '2025-10-20T08:00:00Z',
    NULL, NULL, NULL, NULL,
    '2025-10-18T11:00:00Z',
    'SARB-INB-2025-DL001-00019',
    'SARB-REF-2025-DL001-ANN-001',
    480,
    '2025-08-31T23:59:59Z',
    NULL,
    0, 0,
    'default',
    'demo_regulator_001',
    '2025-07-01T08:00:00Z',
    '2025-10-20T08:00:00Z'
  );

-- ─── 11. oe_esg_disclosure ────────────────────────────────────────────────
-- 2 ESG disclosures:
--   (a) demo_ipp_001 FY2024/25 — chain_status = published (JSE SRL listed entity)
--   (b) demo_offtaker_001 FY2024/25 — chain_status = draft_compiled (non-listed)

INSERT OR IGNORE INTO oe_esg_disclosure
  (id, disclosure_number,
   source_event, source_entity_type, source_entity_id, source_wave,
   reporting_entity_id, reporting_entity_name, reporting_entity_lei,
   ticker, financial_year_label, financial_year_end_at, period_opened_at,
   disclosure_scope, climate_risk_exposure, assurance_level,
   assurance_opinion, assurance_provider, external_auditor_party_id,
   jse_listed_strict, scope3_inclusive_15cat, climate_scenario_required,
   material_topics_count, sbti_committed_strict, year_had_listed_disclosure,
   scope1_tco2e, scope2_market_tco2e, scope2_location_tco2e,
   scope3_total_tco2e, baseline_year, baseline_total_tco2e,
   reduction_pct_vs_baseline, sbti_alignment_score,
   tcfd_completeness_pct, gri_completeness_pct, cdp_score, cdp_score_band,
   jse_srl_completeness_pct, king_iv_completeness_pct,
   issb_s1_s2_completeness_pct, assurance_confidence_level,
   esg_disclosure_index, regulator_filing_window_days, urgency_band,
   current_tier, effective_tier, authority_required,
   dispute_count, restate_count, cancel_count,
   parent_disclosure_id, prior_disclosure_id,
   regulator_ref, jse_sens_ref, cipc_ref, dffe_ref, sars_ref,
   title, narrative, result_text,
   disputed_reason, cancelled_reason, restated_reason, reason_code,
   current_ball_in_court_party, last_responder_party,
   analyst_party, director_party, audit_committee_party, board_party,
   chain_status,
   period_open_at, data_collected_at, boundary_verified_at,
   metrics_computed_at, draft_compiled_at, internal_review_at,
   assurance_engaged_at, assurance_in_progress_at, assured_at,
   published_at, filed_at, archived_at,
   disputed_at, cancelled_at,
   is_reportable, regulator_crossed_at, regulator_inbox_ref,
   sla_deadline_at, last_sla_breach_at, escalation_level,
   created_by, created_at, updated_at)
VALUES
  (
    'seed_esg_001_ipp001_fy2025',
    'ESG-IPP001-FY2025-001',
    'ipp_annual_report_accepted',
    'ipp',
    'demo_ipp_001',
    'W103',
    'demo_ipp_001',
    'Limpopo Solar Park (Pty) Ltd',
    '378900LMTESM0SA001',
    'LSP',
    'FY2024/25',
    '2025-03-31',
    '2025-04-01T08:00:00Z',
    'entity_plus_subsidiaries',
    'medium',
    'limited',
    'unqualified',
    'Deloitte Sustainability Assurance (SA)',
    'demo_admin_001',
    1, 1, 1,
    12, 1, 1,
    4820.0,
    0.0,
    94200.0,
    18640.0,
    2020, 228400.0,
    90.2,
    88.4,
    91.0, 88.0, 82.0, 'B',
    94.0, 87.0,
    89.0, 'high',
    89.4, 30, 'medium',
    'material', 'material', 'audit_committee_chair',
    0, 0, 0,
    NULL, NULL,
    'NERSA-ESG-2025-LP001',
    'JSE-SENS-2025-LP001-ESG',
    'CIPC-ESG-2025-LP001',
    'DFFE-ESG-2025-LP001',
    'SARS-ESG-2025-LP001',
    'Limpopo Solar Park FY2024/25 ESG Disclosure — ISSB S1/S2 + GRI + TCFD + CDP',
    'Annual ESG disclosure for Limpopo Solar Park (Pty) Ltd covering FY2024/25 (April 2024 – March 2025). Scope 1 emissions 4,820 tCO2e (diesel generators + SF6 maintenance); Scope 2 market-based 0 tCO2e (100% self-generated renewable); Scope 3 total 18,640 tCO2e (15 categories per GHG Protocol). Generation 160,740 MWh; carbon avoided vs SA grid 152,703 tCO2e. SBTi near-term target: 50% absolute Scope 1+2 reduction by 2030 vs 2020 baseline. JSE SRL Sustainability and Climate Disclosure Guidance 2024 compliant. TCFD 4-pillar score 91%; GRI 88%; CDP B rating; King IV 87%; ISSB S1/S2 89%.',
    'Published to JSE SENS and DFFE carbon tax return portal. Assurance provider Deloitte issued unqualified limited assurance opinion.',
    NULL, NULL, NULL, NULL,
    'esg_analyst',
    'audit_committee_chair',
    'demo_ipp_001',
    'demo_ipp_001',
    'demo_ipp_001',
    'demo_ipp_001',
    'published',
    '2025-04-01T08:00:00Z',
    '2025-05-15T17:00:00Z',
    '2025-05-30T11:00:00Z',
    '2025-06-20T16:00:00Z',
    '2025-07-10T14:00:00Z',
    '2025-07-25T10:00:00Z',
    '2025-08-01T09:00:00Z',
    '2025-08-15T09:00:00Z',
    '2025-09-10T14:00:00Z',
    '2025-09-25T10:00:00Z',
    NULL, NULL,
    NULL, NULL,
    1,
    '2025-09-25T10:00:00Z',
    'NERSA-INB-2025-LP001-ESG',
    '2025-10-31T23:59:59Z',
    NULL, 0,
    'demo_ipp_001',
    '2025-04-01T08:00:00Z',
    '2025-09-25T10:00:00Z'
  );

INSERT OR IGNORE INTO oe_esg_disclosure
  (id, disclosure_number,
   source_event, source_entity_type, source_entity_id, source_wave,
   reporting_entity_id, reporting_entity_name, reporting_entity_lei,
   ticker, financial_year_label, financial_year_end_at, period_opened_at,
   disclosure_scope, climate_risk_exposure, assurance_level,
   assurance_opinion, assurance_provider, external_auditor_party_id,
   jse_listed_strict, scope3_inclusive_15cat, climate_scenario_required,
   material_topics_count, sbti_committed_strict, year_had_listed_disclosure,
   scope1_tco2e, scope2_market_tco2e, scope2_location_tco2e,
   scope3_total_tco2e, baseline_year, baseline_total_tco2e,
   reduction_pct_vs_baseline, sbti_alignment_score,
   tcfd_completeness_pct, gri_completeness_pct, cdp_score, cdp_score_band,
   jse_srl_completeness_pct, king_iv_completeness_pct,
   issb_s1_s2_completeness_pct, assurance_confidence_level,
   esg_disclosure_index, regulator_filing_window_days, urgency_band,
   current_tier, effective_tier, authority_required,
   dispute_count, restate_count, cancel_count,
   parent_disclosure_id, prior_disclosure_id,
   regulator_ref, jse_sens_ref, cipc_ref, dffe_ref, sars_ref,
   title, narrative, result_text,
   disputed_reason, cancelled_reason, restated_reason, reason_code,
   current_ball_in_court_party, last_responder_party,
   analyst_party, director_party, audit_committee_party, board_party,
   chain_status,
   period_open_at, data_collected_at, boundary_verified_at,
   metrics_computed_at, draft_compiled_at, internal_review_at,
   assurance_engaged_at, assurance_in_progress_at, assured_at,
   published_at, filed_at, archived_at,
   disputed_at, cancelled_at,
   is_reportable, regulator_crossed_at, regulator_inbox_ref,
   sla_deadline_at, last_sla_breach_at, escalation_level,
   created_by, created_at, updated_at)
VALUES
  (
    'seed_esg_002_offtaker001_fy2025',
    'ESG-OFT001-FY2025-001',
    'voluntary_esg_programme',
    'offtaker',
    'demo_offtaker_001',
    'W103',
    'demo_offtaker_001',
    'Eastern Cape Offtaker (Pty) Ltd',
    NULL,
    NULL,
    'FY2024/25',
    '2025-03-31',
    '2025-04-01T08:00:00Z',
    'entity_only',
    'low',
    'none',
    NULL,
    NULL,
    NULL,
    0, 0, 0,
    6, 0, 0,
    12840.0,
    18200.0,
    19100.0,
    NULL,
    2020, 31200.0,
    NULL,
    NULL,
    62.0, 55.0, NULL, NULL,
    0.0, 72.0,
    44.0, NULL,
    57.8, 90, 'low',
    'standard', 'standard', 'sustainability_director',
    0, 0, 0,
    NULL, NULL,
    NULL, NULL, NULL, NULL, NULL,
    'Eastern Cape Offtaker FY2024/25 ESG Disclosure — GRI + King IV Voluntary',
    'Voluntary ESG disclosure for Eastern Cape Offtaker (Pty) Ltd covering FY2024/25. Entity-only scope; non-listed; no external assurance in current cycle. Scope 1 emissions 12,840 tCO2e (fleet + generators); Scope 2 market-based 18,200 tCO2e (Eskom grid, prior to PPA transition). PPA with Limpopo Solar Park expected to reduce Scope 2 by ~86% from FY2025/26 following completion of wind project seed_proj_002. GRI Universal Standards disclosure index included. King IV 72%; TCFD 62% (governance + strategy pillars only, risk management and metrics in progress). No SBTi commitment in current period; board considering near-term target in FY2025/26 planning cycle.',
    NULL,
    NULL, NULL, NULL, NULL,
    'esg_analyst',
    'esg_analyst',
    'demo_offtaker_001',
    'demo_offtaker_001',
    NULL,
    NULL,
    'draft_compiled',
    '2025-04-01T08:00:00Z',
    '2025-06-30T17:00:00Z',
    '2025-07-15T11:00:00Z',
    '2025-08-10T16:00:00Z',
    '2025-09-05T14:00:00Z',
    NULL,
    NULL, NULL, NULL,
    NULL, NULL, NULL,
    NULL, NULL,
    0,
    NULL, NULL,
    '2026-03-31T23:59:59Z',
    NULL, 0,
    'demo_offtaker_001',
    '2025-04-01T08:00:00Z',
    '2025-09-05T14:00:00Z'
  );
