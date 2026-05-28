-- Wave 53 — Lender Credit Facility Origination & Credit Approval seed.
-- 10 facility applications ca_001..ca_010 spanning 10 distinct lifecycle states,
-- all five facility-size tiers, and the conditional-approval / referral / decline
-- / withdraw branches. The lender of record is OE Project Finance; applicants are
-- renewable-energy SPVs. No apostrophes anywhere (D1 SQLite).

INSERT OR IGNORE INTO oe_credit_facility_applications (
  id, application_number, source_event, source_entity_type, source_entity_id, source_wave,
  applicant_party_id, applicant_party_name, lender_name, sponsor_name,
  facility_tier, facility_name, facility_type, facility_purpose, facility_limit_zar_m, tenor_months,
  margin_bps, pricing_basis, project_id, project_name, sector,
  credit_rating, ltv_pct, dscr_base, gearing_pct, pd_pct, lgd_pct, ead_zar_m, approved_amount_zar_m,
  conditions_count, cp_count,
  screening_basis, assessment_basis, committee_basis, approval_basis, conditions_basis, cp_basis,
  activation_basis, decline_basis, reason_code, referral_round,
  chain_status, application_received_at, screening_at, credit_assessment_at, committee_review_at,
  referred_back_at, conditions_pending_at, approved_at, agreement_issued_at, cp_satisfied_at,
  facility_available_at, declined_at, withdrawn_at,
  is_reportable, sla_deadline_at, escalation_level, created_by
) VALUES
-- ca_001 small / term_loan — freshly received, awaiting screening
('ca_001','CF-ORIG-2026-0001','origination.pipeline_intake','project','proj_2026_5510',NULL,
 'spv_kareebos','Kareebos Solar SPV (Pty) Ltd','OE Project Finance','Kareebos Renewables Holdings',
 'small','Kareebos 35MW Solar Term Facility','term_loan','Construction and term funding of a 35MW solar PV plant',30,180,
 285,'jibar_plus','proj_2026_5510','Kareebos 35MW Solar PV','solar_pv',
 'BBB',72,1.32,75,1.8,40,30,NULL,
 NULL,NULL,
 NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,0,
 'application_received','2026-05-27 08:30:00',NULL,NULL,NULL,
 NULL,NULL,NULL,NULL,NULL,
 NULL,NULL,NULL,
 0,'2026-05-29 08:30:00',0,'demo_admin_001'),

-- ca_002 medium / construction — under screening (KYC + NCA affordability)
('ca_002','CF-ORIG-2026-0002','origination.pipeline_intake','project','proj_2026_5488',NULL,
 'spv_mthatha','Mthatha Wind SPV (Pty) Ltd','OE Project Finance','Eastern Cape Wind Partners',
 'medium','Mthatha 90MW Wind Construction Facility','construction','Construction funding of a 90MW wind farm',120,210,
 310,'jibar_plus','proj_2026_5488','Mthatha 90MW Wind','wind',
 'BBB-',78,1.28,80,2.4,42,NULL,NULL,
 NULL,NULL,
 'Eligibility confirmed; KYC and NCA affordability screen in progress against the SPV cash-flow model.',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,0,
 'screening','2026-05-24 09:00:00','2026-05-25 10:00:00',NULL,NULL,
 NULL,NULL,NULL,NULL,NULL,
 NULL,NULL,NULL,
 0,'2026-06-01 10:00:00',0,'demo_admin_001'),

-- ca_003 large / term_loan — full credit assessment underway
('ca_003','CF-ORIG-2026-0003','origination.pipeline_intake','project','proj_2026_5401',NULL,
 'spv_groblersdal','Groblersdal BESS SPV (Pty) Ltd','OE Project Finance','Highveld Storage Ventures',
 'large','Groblersdal 250MWh BESS Term Facility','term_loan','Battery energy storage facility funding',450,180,
 335,'jibar_plus','proj_2026_5401','Groblersdal 250MWh BESS','bess',
 'BBB',70,1.40,72,1.6,38,450,NULL,
 NULL,NULL,
 'Eligibility and KYC cleared; affordability confirmed against the merchant-plus-capacity revenue stack.',
 'Full credit analysis underway: financial model audit, security package review and merchant-revenue stress.',NULL,NULL,NULL,NULL,NULL,NULL,NULL,0,
 'credit_assessment','2026-05-10 08:00:00','2026-05-12 09:00:00','2026-05-15 10:00:00',NULL,
 NULL,NULL,NULL,NULL,NULL,
 NULL,NULL,NULL,
 0,'2026-06-05 10:00:00',0,'demo_admin_001'),

-- ca_004 major / syndicated — at credit committee (large exposure)
('ca_004','CF-ORIG-2026-0004','origination.pipeline_intake','project','proj_2026_5300',NULL,
 'spv_kuruman','Kuruman Solar One SPV (Pty) Ltd','OE Project Finance','Northern Cape Solar Consortium',
 'major','Kuruman 400MW Solar Syndicated Facility','term_loan','Lead-arranger funding of a 400MW solar complex',1800,216,
 295,'jibar_plus','proj_2026_5300','Kuruman 400MW Solar Complex','solar_pv',
 'A-',65,1.52,68,1.1,35,1800,NULL,
 NULL,NULL,
 'Eligibility, KYC and affordability cleared; large-exposure pre-clearance noted.',
 'Credit analysis complete: investment-grade shadow rating, robust DSCR headroom and full security package.',
 'Tabled to the credit committee for decision; large-exposure concentration within Reg-28 limits.',NULL,NULL,NULL,NULL,NULL,NULL,0,
 'committee_review','2026-04-20 08:00:00','2026-04-25 09:00:00','2026-05-01 10:00:00','2026-05-20 11:00:00',
 NULL,NULL,NULL,NULL,NULL,
 NULL,NULL,NULL,
 0,'2026-06-03 11:00:00',0,'demo_admin_001'),

-- ca_005 large / refinance — committee referred back for more analysis (SLA breached open)
('ca_005','CF-ORIG-2026-0005','origination.pipeline_intake','project','proj_2026_5277',NULL,
 'spv_ladysmith','Ladysmith Hydro SPV (Pty) Ltd','OE Project Finance','Drakensberg Hydro Partners',
 'large','Ladysmith 120MW Hydro Refinance Facility','refinance','Refinance of an operating run-of-river hydro plant',620,168,
 320,'jibar_plus','proj_2026_5277','Ladysmith 120MW Hydro','hydro',
 'BBB',74,1.35,76,1.9,40,620,NULL,
 NULL,NULL,
 'Eligibility and KYC cleared; affordability confirmed on the operating track record.',
 'Initial credit analysis flagged hydrology-risk and offtake-renewal gaps requiring further work.',
 'Committee referred the application back for a hydrology study and an offtake-renewal opinion.',NULL,NULL,NULL,NULL,NULL,'referred_for_more_analysis',1,
 'referred_back','2026-04-15 08:00:00','2026-04-18 09:00:00','2026-04-25 10:00:00','2026-05-05 11:00:00',
 '2026-05-10 12:00:00',NULL,NULL,NULL,NULL,
 NULL,NULL,NULL,
 0,'2026-05-24 12:00:00',1,'demo_admin_001'),

-- ca_006 medium / construction — approved with conditions, conditions pending (SLA breached open)
('ca_006','CF-ORIG-2026-0006','origination.pipeline_intake','project','proj_2026_5190',NULL,
 'spv_bethlehem','Bethlehem Solar SPV (Pty) Ltd','OE Project Finance','Free State Solar Ventures',
 'medium','Bethlehem 75MW Solar Construction Facility','construction','Construction funding of a 75MW solar PV plant',180,180,
 305,'jibar_plus','proj_2026_5190','Bethlehem 75MW Solar PV','solar_pv',
 'BBB-',76,1.30,78,2.2,41,180,180,
 4,NULL,
 'Eligibility, KYC and affordability cleared.',
 'Credit analysis complete; bankable subject to conditions on the EPC bond and the grid-connection budget.',
 'Committee approved subject to four conditions: EPC performance bond, grid-budget cap, hedging policy and DSRA pre-funding.',NULL,
 'Four conditions of approval outstanding; awaiting EPC bond and grid-budget confirmation from the sponsor.',NULL,NULL,NULL,NULL,0,
 'conditions_pending','2026-04-10 08:00:00','2026-04-12 09:00:00','2026-04-20 10:00:00','2026-05-01 11:00:00',
 NULL,'2026-05-05 12:00:00',NULL,NULL,NULL,
 NULL,NULL,NULL,
 0,'2026-05-26 12:00:00',1,'demo_admin_001'),

-- ca_007 major / syndicated — facility agreement issued, CPs outstanding
('ca_007','CF-ORIG-2026-0007','origination.pipeline_intake','project','proj_2026_5055',NULL,
 'spv_vredendal','Vredendal Wind SPV (Pty) Ltd','OE Project Finance','West Coast Wind Consortium',
 'major','Vredendal 350MW Wind Syndicated Facility','term_loan','Lead-arranger funding of a 350MW wind farm',2400,216,
 300,'jibar_plus','proj_2026_5055','Vredendal 350MW Wind','wind',
 'A-',66,1.48,70,1.2,36,2400,2400,
 6,8,
 'Eligibility, KYC and affordability cleared; large-exposure pre-clearance noted.',
 'Credit analysis complete: investment-grade shadow rating with strong merchant hedge cover.',
 'Committee approved; large-exposure concentration noted within limits.',
 'Facility agreement issued to the borrower; eight conditions precedent to first drawdown.',NULL,NULL,NULL,NULL,NULL,0,
 'agreement_issued','2026-03-15 08:00:00','2026-03-20 09:00:00','2026-04-01 10:00:00','2026-04-20 11:00:00',
 NULL,NULL,'2026-04-28 12:00:00','2026-05-05 13:00:00',NULL,
 NULL,NULL,NULL,
 0,'2026-07-04 13:00:00',0,'demo_admin_001'),

-- ca_008 systemic / syndicated — FULL PATH to facility_available (activate crosses SARB large-exposure; reportable)
('ca_008','CF-ORIG-2026-0008','origination.pipeline_intake','project','proj_2026_4900',NULL,
 'spv_redstone','Redstone CSP SPV (Pty) Ltd','OE Project Finance','National Renewables Infrastructure Fund',
 'systemic','Redstone 1.2GW Renewables Platform Facility','term_loan','Platform funding of a 1.2GW multi-technology renewables portfolio',6500,240,
 280,'jibar_plus','proj_2026_4900','Redstone 1.2GW Renewables Platform','solar_pv',
 'A',60,1.65,62,0.8,32,6500,6500,
 9,12,
 'Eligibility, KYC and affordability cleared; systemic large-exposure pre-clearance and SARB pre-notification noted.',
 'Credit analysis complete: investment-grade portfolio with diversified technology and offtake; strong sponsor support.',
 'Committee approved the systemic facility; large-exposure concentration cleared with the prudential function.',
 'Facility agreement issued; twelve conditions precedent satisfied across financial close.',
 NULL,'All conditions precedent satisfied at financial close; legal opinions and security perfected.',
 'Facility activated and made available to draw; large exposure notified to the SARB large-exposure return.',NULL,NULL,0,
 'facility_available','2026-02-01 08:00:00','2026-02-10 09:00:00','2026-03-01 10:00:00','2026-04-01 11:00:00',
 NULL,NULL,'2026-04-15 12:00:00','2026-04-25 13:00:00','2026-05-15 14:00:00',
 '2026-05-25 15:00:00',NULL,NULL,
 1,NULL,0,'demo_admin_001'),

-- ca_009 systemic / refinance — DECLINED at committee (decline crosses SARB for systemic; reportable)
('ca_009','CF-ORIG-2026-0009','origination.pipeline_intake','project','proj_2026_4811',NULL,
 'spv_coega','Coega Green Hydrogen SPV (Pty) Ltd','OE Project Finance','Eastern Cape Hydrogen Consortium',
 'systemic','Coega 800MW Green Hydrogen Facility','term_loan','Funding of an 800MW electrolyser and green-hydrogen complex',8000,240,
 360,'jibar_plus','proj_2026_4811','Coega 800MW Green Hydrogen','solar_pv',
 'BB',85,0.95,88,5.5,55,NULL,NULL,
 NULL,NULL,
 'Eligibility and KYC cleared; affordability concerns flagged on the unproven offtake stack.',
 'Credit analysis: sub-investment-grade shadow rating, thin DSCR and material merchant-offtake risk on green-hydrogen demand.',
 'Committee declined: DSCR below policy floor, no firm offtake and excessive merchant exposure for a systemic ticket.',NULL,NULL,NULL,NULL,
 'DSCR below the 1.10 policy floor with no firm offtake; risk-adjusted return inadequate for a systemic large exposure.','dscr_below_floor',0,
 'declined','2026-03-01 08:00:00','2026-03-10 09:00:00','2026-04-01 10:00:00','2026-05-01 11:00:00',
 NULL,NULL,NULL,NULL,NULL,
 NULL,'2026-05-20 12:00:00',NULL,
 1,NULL,0,'demo_admin_001'),

-- ca_010 small / bridge — withdrawn by the applicant during screening
('ca_010','CF-ORIG-2026-0010','origination.pipeline_intake','project','proj_2026_4760',NULL,
 'spv_calvinia','Calvinia Solar SPV (Pty) Ltd','OE Project Finance','Karoo Solar Developments',
 'small','Calvinia 20MW Solar Bridge Facility','bridge','Short-term bridge to financial close on a 20MW solar plant',42,18,
 340,'jibar_plus','proj_2026_4760','Calvinia 20MW Solar PV','solar_pv',
 'BB+',80,1.20,82,3.0,45,NULL,NULL,
 NULL,NULL,
 'Eligibility confirmed; KYC and affordability screen commenced.',NULL,NULL,NULL,NULL,NULL,NULL,NULL,'applicant_withdrew',0,
 'withdrawn','2026-05-05 08:00:00','2026-05-08 09:00:00',NULL,NULL,
 NULL,NULL,NULL,NULL,NULL,
 NULL,NULL,'2026-05-12 10:00:00',
 0,NULL,0,'demo_admin_001');

-- Events (transition log). Full origination path for ca_008 (applicant + lender
-- split, ending in the SARB large-exposure crossing), the decline marker for
-- ca_009, the referral for ca_005, the conditional approval for ca_006, the
-- withdraw for ca_010, and a creation marker for the rest.
INSERT OR IGNORE INTO oe_credit_facility_applications_events (
  id, application_id, event_type, from_status, to_status, actor_id, actor_party, notes, created_at
) VALUES
('ca_evt_001','ca_001','credit_origination.application_received',NULL,'application_received','spv_kareebos','applicant','Facility application received via pipeline intake','2026-05-27 08:30:00'),
('ca_evt_002','ca_002','credit_origination.application_received',NULL,'application_received','spv_mthatha','applicant','Facility application received','2026-05-24 09:00:00'),
('ca_evt_003','ca_002','credit_origination.screening','application_received','screening','OE Project Finance','lender','Screening commenced: KYC and NCA affordability','2026-05-25 10:00:00'),
('ca_evt_004','ca_003','credit_origination.screening','application_received','screening','OE Project Finance','lender','Screening cleared','2026-05-12 09:00:00'),
('ca_evt_005','ca_003','credit_origination.credit_assessment','screening','credit_assessment','OE Project Finance','lender','Full credit assessment opened','2026-05-15 10:00:00'),
('ca_evt_006','ca_004','credit_origination.committee_review','credit_assessment','committee_review','OE Project Finance','lender','Tabled to the credit committee (large exposure)','2026-05-20 11:00:00'),
('ca_evt_007','ca_005','credit_origination.committee_review','credit_assessment','committee_review','OE Project Finance','lender','Tabled to the credit committee','2026-05-05 11:00:00'),
('ca_evt_008','ca_005','credit_origination.referred_back','committee_review','referred_back','OE Project Finance','lender','Referred back for a hydrology study and offtake-renewal opinion','2026-05-10 12:00:00'),
('ca_evt_009','ca_006','credit_origination.conditions_pending','committee_review','conditions_pending','OE Project Finance','lender','Approved subject to four conditions of approval','2026-05-05 12:00:00'),
('ca_evt_010','ca_007','credit_origination.agreement_issued','approved','agreement_issued','OE Project Finance','lender','Facility agreement issued; eight CPs to first drawdown','2026-05-05 13:00:00'),
-- ca_008 full origination path (applicant -> lender ... -> SARB large-exposure crossing on activate)
('ca_evt_011','ca_008','credit_origination.application_received',NULL,'application_received','spv_redstone','applicant','Systemic platform facility application received','2026-02-01 08:00:00'),
('ca_evt_012','ca_008','credit_origination.screening','application_received','screening','OE Project Finance','lender','Screening cleared; systemic large-exposure pre-clearance','2026-02-10 09:00:00'),
('ca_evt_013','ca_008','credit_origination.credit_assessment','screening','credit_assessment','OE Project Finance','lender','Full credit assessment: investment-grade portfolio','2026-03-01 10:00:00'),
('ca_evt_014','ca_008','credit_origination.committee_review','credit_assessment','committee_review','OE Project Finance','lender','Tabled to the credit committee','2026-04-01 11:00:00'),
('ca_evt_015','ca_008','credit_origination.approved','committee_review','approved','OE Project Finance','lender','Committee approved the systemic facility','2026-04-15 12:00:00'),
('ca_evt_016','ca_008','credit_origination.agreement_issued','approved','agreement_issued','OE Project Finance','lender','Facility agreement issued','2026-04-25 13:00:00'),
('ca_evt_017','ca_008','credit_origination.cp_satisfied','agreement_issued','cp_satisfied','spv_redstone','applicant','All conditions precedent satisfied at financial close','2026-05-15 14:00:00'),
('ca_evt_018','ca_008','credit_origination.facility_available','cp_satisfied','facility_available','OE Project Finance','lender','Facility activated; large exposure notified to the SARB large-exposure return','2026-05-25 15:00:00'),
-- ca_009 decline (systemic — crosses SARB)
('ca_evt_019','ca_009','credit_origination.committee_review','credit_assessment','committee_review','OE Project Finance','lender','Tabled to the credit committee','2026-05-01 11:00:00'),
('ca_evt_020','ca_009','credit_origination.declined','committee_review','declined','OE Project Finance','lender','Declined: DSCR below policy floor and no firm offtake','2026-05-20 12:00:00'),
-- ca_010 withdraw
('ca_evt_021','ca_010','credit_origination.screening','application_received','screening','OE Project Finance','lender','Screening commenced','2026-05-08 09:00:00'),
('ca_evt_022','ca_010','credit_origination.withdrawn','screening','withdrawn','spv_calvinia','applicant','Applicant withdrew the application during screening','2026-05-12 10:00:00');
