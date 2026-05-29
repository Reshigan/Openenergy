-- Wave 74 — Regulator NERSA Levy Assessment & Collection seed.
-- 10 levies levy_001..levy_010 spanning 10 distinct lifecycle states, all five
-- assessed-amount tiers, all three sectors and all three assessment bases. Two
-- reportable cases prove the W74 signature:
--   - levy_008 a MAJOR electricity levy in FINAL DEMAND (issue_final_demand crosses large+major)
--   - levy_009 a MAJOR piped-gas levy in ENFORCEMENT (escalate_enforcement crosses EVERY tier
--     — the W74 signature). reportable_total = 2.
-- No apostrophes anywhere (D1 SQLite). assessed_amount drives levy_tier.

INSERT OR IGNORE INTO oe_regulator_levies (
  id, levy_number,
  source_event, source_entity_type, source_entity_id, source_wave,
  licensee_id, licensee_name, licensee_licence_no,
  sector, levy_basis, levy_tier, financial_year,
  declared_base, base_unit, levy_rate, assessed_amount, paid_to_date, outstanding_amount, due_date,
  assessment_ref, invoice_ref, objection_ref, final_demand_ref, enforcement_ref, settlement_ref, writeoff_ref,
  assessment_basis, review_basis, invoice_basis, objection_basis, payable_basis, payment_basis, arrears_basis, final_demand_basis, enforcement_basis, settlement_basis, writeoff_basis, withdrawal_basis, reason_code,
  chain_status, assessed_at, assessment_review_at, invoiced_at, objection_review_at, payment_pending_at, partially_paid_at, in_arrears_at, final_demand_at, enforcement_at, settled_at, written_off_at, withdrawn_at,
  sla_deadline_at, last_sla_breach_at, is_reportable, escalation_level, created_by
) VALUES
-- levy_001 micro electricity fixed — freshly assessed, awaiting QA review
('levy_001','LEV-2026-0001',
 NULL,NULL,NULL,NULL,
 'lic_sseg_011','Karoo Community Solar SPV','NERSA-REG-1102',
 'electricity','fixed','micro','2026/27',
 0,'ZAR',75000,75000,0,75000,'2026-07-31',
 'LEV-2026-0001-ASMT',NULL,NULL,NULL,NULL,NULL,NULL,
 'Fixed-schedule levy for a registered small-scale embedded generator under NERSA fee schedule.',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,
 'levy_assessed','2026-05-27 08:00:00',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,
 '2026-06-06 08:00:00',NULL,0,0,'demo_regulator_001'),

-- levy_002 small electricity turnover — assessment under QA review
('levy_002','LEV-2026-0002',
 NULL,NULL,NULL,NULL,
 'lic_metro_002','Eastside Power Utility','NERSA-DL-0221',
 'electricity','turnover_based','small','2026/27',
 180000000,'ZAR',0.0025,450000,0,450000,'2026-07-31',
 'LEV-2026-0002-ASMT',NULL,NULL,NULL,NULL,NULL,NULL,
 'Turnover-based levy at 0.25 percent of declared annual electricity distribution turnover.','QA review of declared turnover against prior-year submission and audited financials.',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,
 'assessment_review','2026-05-24 08:00:00','2026-05-26 09:00:00',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,
 '2026-05-31 09:00:00',NULL,0,0,'demo_regulator_001'),

-- levy_003 medium piped_gas volume — levy notice issued, awaiting payment or objection
('levy_003','LEV-2026-0003',
 NULL,NULL,NULL,NULL,
 'lic_gas_003','Highveld Piped Gas Distributors','NERSA-PG-0044',
 'piped_gas','volume_based','medium','2026/27',
 6400000,'GJ',0.5,3200000,0,3200000,'2026-08-15',
 'LEV-2026-0003-ASMT','LEV-2026-0003-INV',NULL,NULL,NULL,NULL,NULL,
 'Volume-based levy at R0.50 per GJ of declared piped-gas throughput.','Declared throughput reconciled against metering returns.','Levy notice issued to the licensee with sixty-day payment terms.',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,
 'invoiced','2026-05-10 08:00:00','2026-05-12 09:00:00','2026-05-15 10:00:00',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,
 '2026-06-14 10:00:00',NULL,0,0,'demo_regulator_001'),

-- levy_004 small electricity turnover — licensee lodged an objection, under review
('levy_004','LEV-2026-0004',
 NULL,NULL,NULL,NULL,
 'lic_metro_004','Riverside Municipal Electricity','NERSA-DL-0309',
 'electricity','turnover_based','small','2026/27',
 320000000,'ZAR',0.0025,800000,0,800000,'2026-08-15',
 'LEV-2026-0004-ASMT','LEV-2026-0004-INV','LEV-2026-0004-OBJ',NULL,NULL,NULL,NULL,
 'Turnover-based levy at 0.25 percent of declared distribution turnover.','Declared turnover accepted.','Levy notice issued.','Licensee objects that intra-group wheeling revenue was double-counted in the turnover base.',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,
 'objection_review','2026-05-08 08:00:00','2026-05-10 09:00:00','2026-05-12 10:00:00','2026-05-20 11:00:00',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,
 '2026-06-03 11:00:00',NULL,0,0,'demo_regulator_001'),

-- levy_005 medium electricity turnover — payable confirmed, awaiting payment within terms
('levy_005','LEV-2026-0005',
 NULL,NULL,NULL,NULL,
 'lic_metro_005','Crown City Power','NERSA-DL-0512',
 'electricity','turnover_based','medium','2026/27',
 2600000000,'ZAR',0.0025,6500000,0,6500000,'2026-07-15',
 'LEV-2026-0005-ASMT','LEV-2026-0005-INV',NULL,NULL,NULL,NULL,NULL,
 'Turnover-based levy at 0.25 percent of declared metropolitan distribution turnover.','Declared turnover accepted.','Levy notice issued.',NULL,'No objection lodged; amount confirmed payable within terms.',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,
 'payment_pending','2026-05-05 08:00:00','2026-05-07 09:00:00','2026-05-09 10:00:00',NULL,'2026-05-12 12:00:00',NULL,NULL,NULL,NULL,NULL,NULL,NULL,
 '2026-05-26 12:00:00',NULL,0,0,'demo_regulator_001'),

-- levy_006 large electricity turnover — part payment received, residual outstanding
('levy_006','LEV-2026-0006',
 NULL,NULL,NULL,NULL,
 'lic_gen_006','Highveld Generation Company','NERSA-GL-0061',
 'electricity','turnover_based','large','2026/27',
 7200000000,'ZAR',0.0025,18000000,6000000,12000000,'2026-06-30',
 'LEV-2026-0006-ASMT','LEV-2026-0006-INV',NULL,NULL,NULL,NULL,NULL,
 'Turnover-based levy at 0.25 percent of declared generation turnover.','Declared turnover accepted.','Levy notice issued.',NULL,'Amount confirmed payable.','First instalment of R6m received; residual R12m outstanding.',NULL,NULL,NULL,NULL,NULL,NULL,NULL,
 'partially_paid','2026-04-20 08:00:00','2026-04-22 09:00:00','2026-04-24 10:00:00',NULL,'2026-04-27 12:00:00','2026-05-18 09:00:00',NULL,NULL,NULL,NULL,NULL,NULL,
 '2026-06-01 09:00:00',NULL,0,0,'demo_regulator_001'),

-- levy_007 large petroleum_pipeline volume — past due, in arrears
('levy_007','LEV-2026-0007',
 NULL,NULL,NULL,NULL,
 'lic_pipe_007','Coastal Petroleum Pipeline Co','NERSA-PPL-0007',
 'petroleum_pipeline','volume_based','large','2026/27',
 50000000,'m3',0.5,25000000,0,25000000,'2026-05-15',
 'LEV-2026-0007-ASMT','LEV-2026-0007-INV',NULL,NULL,NULL,NULL,NULL,
 'Volume-based levy at R0.50 per cubic metre of declared petroleum-pipeline throughput.','Declared throughput reconciled.','Levy notice issued.',NULL,'Amount confirmed payable.',NULL,'Payment not received by the due date; account flagged in arrears.',NULL,NULL,NULL,NULL,NULL,NULL,
 'in_arrears','2026-03-25 08:00:00','2026-03-27 09:00:00','2026-03-29 10:00:00',NULL,'2026-04-01 12:00:00',NULL,'2026-05-16 06:00:00',NULL,NULL,NULL,NULL,NULL,
 '2026-05-23 06:00:00',NULL,0,1,'demo_regulator_001'),

-- levy_008 major electricity turnover — final demand issued (REPORTABLE: final_demand crosses large+major)
('levy_008','LEV-2026-0008',
 NULL,NULL,NULL,NULL,
 'lic_natl_008','National Electricity Utility','NERSA-GL-0001',
 'electricity','turnover_based','major','2026/27',
 48000000000,'ZAR',0.0025,120000000,0,120000000,'2026-04-30',
 'LEV-2026-0008-ASMT','LEV-2026-0008-INV',NULL,'LEV-2026-0008-FD',NULL,NULL,NULL,
 'Turnover-based levy at 0.25 percent of declared national generation and transmission turnover.','Declared turnover accepted.','Levy notice issued.',NULL,'Amount confirmed payable.',NULL,'Payment not received; account in arrears.','Final demand issued for the full assessed amount before enforcement escalation.',NULL,NULL,NULL,NULL,NULL,
 'final_demand','2026-02-20 08:00:00','2026-02-22 09:00:00','2026-02-24 10:00:00',NULL,'2026-02-27 12:00:00',NULL,'2026-05-01 06:00:00','2026-05-18 09:00:00',NULL,NULL,NULL,NULL,
 '2026-05-21 09:00:00',NULL,1,2,'demo_regulator_001'),

-- levy_009 major piped_gas volume — escalated to enforcement (REPORTABLE: escalate_enforcement crosses EVERY tier)
('levy_009','LEV-2026-0009',
 NULL,NULL,NULL,NULL,
 'lic_gas_009','National Piped Gas Transmission','NERSA-PG-0001',
 'piped_gas','volume_based','major','2026/27',
 176000000,'GJ',0.5,88000000,10000000,78000000,'2026-04-15',
 'LEV-2026-0009-ASMT','LEV-2026-0009-INV',NULL,'LEV-2026-0009-FD','LEV-2026-0009-ENF',NULL,NULL,
 'Volume-based levy at R0.50 per GJ of declared piped-gas transmission throughput.','Declared throughput reconciled.','Levy notice issued.',NULL,'Amount confirmed payable.','Part payment of R10m received against R88m assessed.','Residual fell past due.','Final demand issued.','Uncollected balance escalated into enforcement; licence good-standing flagged.',NULL,NULL,NULL,NULL,
 'enforcement','2026-01-15 08:00:00','2026-01-17 09:00:00','2026-01-19 10:00:00',NULL,'2026-01-22 12:00:00','2026-02-10 09:00:00','2026-04-16 06:00:00','2026-04-28 09:00:00','2026-05-15 09:00:00',NULL,NULL,NULL,
 '2026-05-22 09:00:00',NULL,1,3,'demo_regulator_001'),

-- levy_010 large electricity turnover — fully paid and settled
('levy_010','LEV-2026-0010',
 NULL,NULL,NULL,NULL,
 'lic_gen_010','Cape Wind Generation SPV','NERSA-GL-0102',
 'electricity','turnover_based','large','2026/27',
 16800000000,'ZAR',0.0025,42000000,42000000,0,'2026-06-30',
 'LEV-2026-0010-ASMT','LEV-2026-0010-INV',NULL,NULL,NULL,'LEV-2026-0010-STL',NULL,
 'Turnover-based levy at 0.25 percent of declared generation turnover.','Declared turnover accepted.','Levy notice issued.',NULL,'Amount confirmed payable.','Full payment received within terms; account settled.',NULL,NULL,NULL,'Levy fully discharged and reconciled.',NULL,NULL,NULL,
 'settled','2026-04-10 08:00:00','2026-04-12 09:00:00','2026-04-14 10:00:00',NULL,'2026-04-17 12:00:00',NULL,NULL,NULL,NULL,'2026-05-09 10:00:00',NULL,NULL,
 NULL,NULL,0,0,'demo_regulator_001');
