-- Wave 77 — Reserve-Account (DSRA / MRA) Funding, Cure & Release seed.
-- 10 reserve obligations res_001..res_010 spanning 10 distinct lifecycle states, all
-- five target-amount tiers and a mix of reserve types (DSRA / MRA / O&M / tax). Four
-- reportable cases prove the W77 signature and tiering:
--   - res_005 (major shortfall_flagged) + res_006 (major cure_pending) + res_007
--     (systemic drawn) — isReportable true for the LARGE tiers (major + systemic),
--   - res_010 a SMALL-tier breached case — declare_breach crosses for EVERY tier (the
--     breach-driven signature, proven here on a non-large tier).
-- No apostrophes anywhere (D1 SQLite). target_amount_zar drives reserve_tier.

INSERT OR IGNORE INTO oe_reserve_account_chain (
  id, reserve_number,
  source_event, source_entity_type, source_entity_id, source_wave, facility_ref, project_id, loan_agreement_ref,
  lender_name, borrower_name, account_bank,
  reserve_type, funding_mode, target_basis, account_number, currency, target_amount_zar, current_balance_zar, drawn_amount_zar, shortfall_amount_zar, reserve_tier,
  next_test_date, cure_deadline, release_due_date, shortfall_reason_code,
  funding_ref, shortfall_ref, cure_ref, drawdown_ref, replenishment_ref, waiver_ref, release_ref, breach_ref, cancel_ref,
  funding_basis, shortfall_basis, cure_basis, drawdown_basis, replenishment_basis, waiver_basis, release_basis, breach_basis, cancel_basis, reason_code,
  chain_status, reserve_required_at, funding_scheduled_at, funding_in_progress_at, funded_at, shortfall_flagged_at, cure_pending_at, drawdown_authorized_at, drawn_at, release_requested_at, released_at, breached_at, cancelled_at,
  sla_deadline_at, last_sla_breach_at, is_reportable, escalation_level, created_by
) VALUES
-- res_001 small DSRA — obligation just established, awaiting funding schedule
('res_001','RAC-2026-0001',
 NULL,NULL,NULL,NULL,'FAC-2026-3001','PRJ-KAROO-SOLAR','LA-2026-3001',
 'Standard Bank Project Finance','Karoo Solar SPV','Standard Bank Account Services',
 'dsra','cash','next_6m_debt_service','RES-3001','ZAR',6000000,0,0,0,'small',
 NULL,NULL,NULL,NULL,
 NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,
 NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,
 'reserve_required','2026-05-28 09:00:00',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,
 '2026-06-27 09:00:00',NULL,0,0,'demo_lender_001'),

-- res_002 medium MRA — funding scheduled via an acceptable letter of credit
('res_002','RAC-2026-0002',
 NULL,NULL,NULL,NULL,'FAC-2026-3002','PRJ-WC-WIND','LA-2026-3002',
 'Nedbank CIB','Western Cape Wind SPV','Nedbank Account Services',
 'mra','letter_of_credit','annual_major_maintenance','RES-3002','ZAR',30000000,0,0,0,'medium',
 NULL,NULL,NULL,NULL,
 'RAC-2026-0002-FND',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,
 'Maintenance reserve to be funded by an acceptable standby letter of credit before first major service.',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,
 'funding_scheduled','2026-05-25 09:00:00','2026-05-27 10:00:00',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,
 '2026-06-10 10:00:00',NULL,0,0,'demo_lender_001'),

-- res_003 large DSRA — cash transfer in progress, partially funded
('res_003','RAC-2026-0003',
 NULL,NULL,NULL,NULL,'FAC-2026-3003','PRJ-NC-PV','LA-2026-3003',
 'ABSA CIB','Northern Cape PV SPV','ABSA Account Services',
 'dsra','cash','next_6m_debt_service','RES-3003','ZAR',150000000,90000000,0,0,'large',
 NULL,NULL,NULL,NULL,
 'RAC-2026-0003-FND',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,
 'Debt service reserve being funded from the financial-close equity bridge; first tranche received.',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,
 'funding_in_progress','2026-05-24 09:00:00','2026-05-25 09:00:00','2026-05-26 08:00:00',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,
 '2026-06-02 08:00:00',NULL,0,0,'demo_lender_001'),

-- res_004 large DSRA — funded to target, healthy steady state
('res_004','RAC-2026-0004',
 NULL,NULL,NULL,NULL,'FAC-2026-3004','PRJ-MPU-CSP','LA-2026-3004',
 'Investec','Mpumalanga CSP SPV','Investec Account Services',
 'dsra','hybrid','next_6m_debt_service','RES-3004','ZAR',200000000,200000000,0,0,'large',
 '2026-06-30',NULL,NULL,NULL,
 'RAC-2026-0004-FND',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,
 'Debt service reserve funded to the six-month target with a mix of cash and a backstop letter of credit.',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,
 'funded','2026-05-01 09:00:00','2026-05-03 09:00:00','2026-05-05 09:00:00','2026-05-10 08:00:00',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,
 NULL,NULL,0,0,'demo_lender_001'),

-- res_005 major DSRA — shortfall flagged on a letter-of-credit lapse (REPORTABLE: major tier)
('res_005','RAC-2026-0005',
 NULL,NULL,NULL,NULL,'FAC-2026-3005','PRJ-EC-WIND','LA-2026-3005',
 'Rand Merchant Bank','Eastern Cape Wind SPV','RMB Account Services',
 'dsra','letter_of_credit','next_6m_debt_service','RES-3005','ZAR',600000000,540000000,0,60000000,'major',
 '2026-05-28',NULL,NULL,'lc_lapse',
 'RAC-2026-0005-FND','RAC-2026-0005-SHF',NULL,NULL,NULL,NULL,NULL,NULL,NULL,
 'Reserve funded by a standby letter of credit.','Test date shows the reserve below target after the issuing bank credit rating triggered an LC step-down; shortfall flagged and reported.',NULL,NULL,NULL,NULL,NULL,NULL,NULL,'lc_lapse',
 'shortfall_flagged','2026-04-01 09:00:00','2026-04-03 09:00:00','2026-04-05 09:00:00','2026-04-15 08:00:00','2026-05-28 07:00:00',NULL,NULL,NULL,NULL,NULL,NULL,NULL,
 '2026-05-30 07:00:00',NULL,1,0,'demo_lender_001'),

-- res_006 major MRA — cure period open after a missed cash sweep (REPORTABLE: major tier)
('res_006','RAC-2026-0006',
 NULL,NULL,NULL,NULL,'FAC-2026-3006','PRJ-FS-PV','LA-2026-3006',
 'Development Bank of Southern Africa','Free State PV SPV','DBSA Account Services',
 'mra','cash','annual_major_maintenance','RES-3006','ZAR',700000000,650000000,0,50000000,'major',
 '2026-05-20','2026-06-01',NULL,'missed_sweep',
 'RAC-2026-0006-FND','RAC-2026-0006-SHF','RAC-2026-0006-CUR',NULL,NULL,NULL,NULL,NULL,NULL,
 'Maintenance reserve funded from the operating cash waterfall.','A scheduled cash sweep was missed when the distribution account was short; the reserve fell below target.','Cure period opened; the borrower must top the reserve back to target within the contractual window.',NULL,NULL,NULL,NULL,NULL,NULL,'missed_sweep',
 'cure_pending','2026-03-01 09:00:00','2026-03-05 09:00:00','2026-03-08 09:00:00','2026-03-20 08:00:00','2026-05-20 07:00:00','2026-05-22 09:00:00',NULL,NULL,NULL,NULL,NULL,NULL,
 '2026-06-01 09:00:00',NULL,1,1,'demo_lender_001'),

-- res_007 systemic DSRA — authorised draw executed to meet debt service (REPORTABLE: systemic tier)
('res_007','RAC-2026-0007',
 NULL,NULL,NULL,NULL,'FAC-2026-3007','PRJ-NATIONAL-GRID-BESS','LA-2026-3007',
 'Standard Bank Project Finance','National Grid BESS SPV','Standard Bank Account Services',
 'dsra','cash','next_6m_debt_service','RES-3007','ZAR',1200000000,900000000,300000000,0,'systemic',
 NULL,'2026-06-01',NULL,'dscr_dip',
 'RAC-2026-0007-FND',NULL,NULL,'RAC-2026-0007-DRW',NULL,NULL,NULL,NULL,NULL,
 'Debt service reserve funded to target at financial close.',NULL,NULL,'A temporary DSCR dip on a curtailment event left insufficient operating cash; the reserve was drawn to meet the scheduled debt service and must be replenished within the top-up window.',NULL,NULL,NULL,NULL,NULL,'dscr_dip',
 'drawn','2026-02-01 09:00:00','2026-02-05 09:00:00','2026-02-08 09:00:00','2026-02-20 08:00:00',NULL,NULL,'2026-05-15 09:00:00','2026-05-18 10:00:00',NULL,NULL,NULL,NULL,
 '2026-06-01 10:00:00',NULL,1,0,'demo_lender_001'),

-- res_008 medium tax reserve — release requested at the provisional-tax payment date
('res_008','RAC-2026-0008',
 NULL,NULL,NULL,NULL,'FAC-2026-3008','PRJ-KZN-WIND','LA-2026-3008',
 'Nedbank CIB','KwaZulu-Natal Wind SPV','Nedbank Account Services',
 'tax_reserve','cash','provisional_tax','RES-3008','ZAR',25000000,25000000,0,0,'medium',
 NULL,NULL,'2026-06-15',NULL,
 'RAC-2026-0008-FND',NULL,NULL,NULL,NULL,NULL,'RAC-2026-0008-REL',NULL,NULL,
 'Tax reserve funded ahead of the provisional-tax payment.',NULL,NULL,NULL,NULL,NULL,'Borrower requested release of the tax reserve to settle the provisional-tax liability now assessed.',NULL,NULL,NULL,
 'release_requested','2024-01-01 09:00:00','2024-01-05 09:00:00','2024-01-08 09:00:00','2024-02-01 08:00:00',NULL,NULL,NULL,NULL,'2026-05-26 09:00:00',NULL,NULL,NULL,
 '2026-06-09 09:00:00',NULL,0,0,'demo_lender_001'),

-- res_009 small DSRA — released at final maturity (terminal happy path)
('res_009','RAC-2026-0009',
 NULL,NULL,NULL,NULL,'FAC-2026-3009','PRJ-LIMPOPO-PV','LA-2026-3009',
 'ABSA CIB','Limpopo PV SPV','ABSA Account Services',
 'dsra','cash','next_6m_debt_service','RES-3009','ZAR',5000000,0,0,0,'small',
 NULL,NULL,'2026-05-10',NULL,
 'RAC-2026-0009-FND',NULL,NULL,NULL,NULL,NULL,'RAC-2026-0009-REL',NULL,NULL,
 'Debt service reserve funded for the life of the facility.',NULL,NULL,NULL,NULL,NULL,'Final debt service paid and the facility discharged; reserve released back to the borrower.',NULL,NULL,NULL,
 'released','2023-01-01 09:00:00','2023-01-05 09:00:00','2023-01-08 09:00:00','2023-02-01 08:00:00',NULL,NULL,NULL,NULL,'2026-05-01 09:00:00','2026-05-10 12:00:00',NULL,NULL,
 NULL,NULL,0,0,'demo_lender_001'),

-- res_010 small DSRA — cure failed, reserve breach declared (REPORTABLE: declare_breach crosses EVERY tier)
('res_010','RAC-2026-0010',
 NULL,NULL,NULL,NULL,'FAC-2026-3010','PRJ-NW-SOLAR','LA-2026-3010',
 'Investec','North West Solar SPV','Investec Account Services',
 'dsra','cash','next_6m_debt_service','RES-3010','ZAR',8000000,4000000,0,4000000,'small',
 '2026-04-20','2026-05-25',NULL,'dscr_dip',
 'RAC-2026-0010-FND','RAC-2026-0010-SHF','RAC-2026-0010-CUR',NULL,NULL,NULL,NULL,'RAC-2026-0010-BRK',NULL,
 'Debt service reserve funded to target.','Reserve fell below target on a sustained DSCR dip.','Cure period opened but the borrower could not source the top-up.',NULL,NULL,NULL,NULL,'Cure period expired without replenishment; reserve breach declared as an event of default and reported irrespective of tier.',NULL,'dscr_dip',
 'breached','2026-03-01 09:00:00','2026-03-05 09:00:00','2026-03-08 09:00:00','2026-03-15 08:00:00','2026-04-20 07:00:00','2026-04-25 09:00:00',NULL,NULL,NULL,NULL,'2026-05-28 11:00:00',NULL,
 NULL,NULL,1,2,'demo_lender_001');
