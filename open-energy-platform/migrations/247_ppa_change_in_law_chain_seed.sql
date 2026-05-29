-- Wave 78 — PPA Change-in-Law / Qualifying-Change relief seed.
-- 10 claims cil_001..cil_010 spanning 10 distinct lifecycle states, all five quantum
-- tiers and a mix of change types (tax / regulatory / statutory / discriminatory /
-- other). Six reportable cases prove the W78 signature:
--   - cil_003 (material tax), cil_004 (major regulatory), cil_006 (material
--     discriminatory), cil_008 (critical tax), cil_009 (major regulatory) — governmental
--     change of material+ quantum is NERSA-visible,
--   - cil_007 a MINOR-tier claim in_arbitration — refer_to_arbitration crosses for EVERY
--     tier (the arbitration-driven signature, proven here on a non-material tier).
-- No apostrophes anywhere (D1 SQLite). claim_quantum_zar_m drives change_in_law_tier.

INSERT OR IGNORE INTO oe_ppa_change_in_law (
  id, cil_number,
  source_event, source_entity_type, source_entity_id, source_wave, ppa_ref, project_id, contract_ref,
  generator_name, offtaker_name, arbitrator_name,
  change_type, change_category, relief_mechanism, currency, claim_quantum_zar_m, assessed_quantum_zar_m, granted_quantum_zar_m, change_in_law_tier,
  law_effective_date, notification_date, claim_deadline, determination_due_date, reason_code,
  eligibility_ref, assessment_ref, claim_ref, negotiation_ref, determination_ref, arbitration_ref, implementation_ref, rejection_ref, withdrawal_ref,
  event_basis, eligibility_basis, assessment_basis, claim_basis, negotiation_basis, determination_basis, arbitration_basis, implementation_basis, rejection_basis, withdrawal_basis,
  chain_status, event_logged_at, eligibility_review_at, impact_assessment_at, claim_submitted_at, counterparty_review_at, negotiation_at, determination_pending_at, in_arbitration_at, relief_granted_at, implemented_at, rejected_at, withdrawn_at,
  sla_deadline_at, last_sla_breach_at, is_reportable, escalation_level, created_by
) VALUES
-- cil_001 minor other_change — a change just logged, eligibility test not yet opened
('cil_001','CIL-2026-0001',
 NULL,NULL,NULL,NULL,'PPA-2026-4001','PRJ-KAROO-SOLAR','OFT-2026-4001',
 'Karoo Solar SPV','Eskom',NULL,
 'other_change','grid_tariff_repackaging',NULL,'ZAR',3,NULL,NULL,'minor',
 '2026-05-20','2026-05-26',NULL,NULL,NULL,
 NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,
 'A change in the network charge packaging was notified by the offtaker and logged for assessment against the qualifying-change-in-law definition.',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,
 'event_logged','2026-05-26 09:00:00',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,
 '2026-05-28 09:00:00',NULL,0,0,'demo_offtaker_001'),

-- cil_002 moderate regulatory_change — eligibility under review (governmental but below material)
('cil_002','CIL-2026-0002',
 NULL,NULL,NULL,NULL,'PPA-2026-4002','PRJ-WC-WIND','OFT-2026-4002',
 'Western Cape Wind SPV','City of Cape Town',NULL,
 'regulatory_change','grid_code_amendment',NULL,'ZAR',15,NULL,NULL,'moderate',
 '2026-05-10','2026-05-18',NULL,NULL,NULL,
 'CIL-2026-0002-ELG',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,
 'A NERSA Grid Code amendment imposing new reactive-power obligations was notified for assessment.','Eligibility review opened to test whether the amendment meets the qualifying-change-in-law threshold under the PPA.',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,
 'eligibility_review','2026-05-18 09:00:00','2026-05-20 10:00:00',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,
 '2026-05-25 10:00:00',NULL,0,0,'demo_offtaker_001'),

-- cil_003 material tax_change — impact being quantified (REPORTABLE: governmental + material)
('cil_003','CIL-2026-0003',
 NULL,NULL,NULL,NULL,'PPA-2026-4003','PRJ-NC-PV','OFT-2026-4003',
 'Northern Cape PV SPV','Eskom',NULL,
 'tax_change','carbon_tax_rate',NULL,'ZAR',60,NULL,NULL,'material',
 '2026-04-01','2026-04-10',NULL,NULL,'carbon_tax_increase',
 'CIL-2026-0003-ELG','CIL-2026-0003-ASM',NULL,NULL,NULL,NULL,NULL,NULL,NULL,
 'A carbon-tax rate increase under the Carbon Tax Act was notified as a qualifying change in law.','Eligibility confirmed as a qualifying change in tax law.','Impact assessment quantifying the additional carbon-tax cost on the contracted generation is in progress.',NULL,NULL,NULL,NULL,NULL,NULL,NULL,
 'impact_assessment','2026-04-10 09:00:00','2026-04-12 09:00:00','2026-04-18 09:00:00',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,
 '2026-04-28 09:00:00',NULL,1,0,'demo_offtaker_001'),

-- cil_004 major regulatory_change — formal claim submitted (REPORTABLE: governmental + major)
('cil_004','CIL-2026-0004',
 NULL,NULL,NULL,NULL,'PPA-2026-4004','PRJ-MPU-CSP','OFT-2026-4004',
 'Mpumalanga CSP SPV','Eskom',NULL,
 'regulatory_change','env_licence_condition','tariff_adjustment','ZAR',250,240,NULL,'major',
 '2026-03-01','2026-03-08',NULL,'2026-05-10','env_compliance_capex',
 'CIL-2026-0004-ELG','CIL-2026-0004-ASM','CIL-2026-0004-CLM',NULL,NULL,NULL,NULL,NULL,NULL,
 'A new environmental-licensing condition requiring additional water-treatment capex was notified.','Eligibility confirmed as a qualifying regulatory change in law.','Assessment valued the incremental compliance capex and operating cost.','Formal relief claim submitted seeking a tariff adjustment to recover the compliance capex over the remaining term.',NULL,NULL,NULL,NULL,NULL,NULL,
 'claim_submitted','2026-03-08 09:00:00','2026-03-12 09:00:00','2026-03-25 09:00:00','2026-04-02 09:00:00',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,
 '2026-04-07 09:00:00',NULL,1,0,'demo_offtaker_001'),

-- cil_005 moderate statutory_change — counterparty reviewing the claim (below material, not reportable)
('cil_005','CIL-2026-0005',
 NULL,NULL,NULL,NULL,'PPA-2026-4005','PRJ-EC-WIND','OFT-2026-4005',
 'Eastern Cape Wind SPV','Coega Development Corporation',NULL,
 'statutory_change','labour_law','lump_sum','ZAR',18,17,NULL,'moderate',
 '2026-02-15','2026-02-20',NULL,'2026-04-15',NULL,
 'CIL-2026-0005-ELG','CIL-2026-0005-ASM','CIL-2026-0005-CLM',NULL,NULL,NULL,NULL,NULL,NULL,
 'An amendment to labour legislation raising minimum operating-staff costs was notified.','Eligibility confirmed as a qualifying statutory change.','Assessment valued the incremental annual staffing cost.','A lump-sum relief claim was submitted; the offtaker contract desk is reviewing the evidence and quantum.',NULL,NULL,NULL,NULL,NULL,NULL,
 'counterparty_review','2026-02-20 09:00:00','2026-02-24 09:00:00','2026-03-05 09:00:00','2026-03-12 09:00:00','2026-03-15 09:00:00',NULL,NULL,NULL,NULL,NULL,NULL,NULL,
 '2026-03-22 09:00:00',NULL,0,0,'demo_offtaker_001'),

-- cil_006 material discriminatory_change — in negotiation (REPORTABLE: governmental + material)
('cil_006','CIL-2026-0006',
 NULL,NULL,NULL,NULL,'PPA-2026-4006','PRJ-FS-PV','OFT-2026-4006',
 'Free State PV SPV','Eskom',NULL,
 'discriminatory_change','sector_levy','combination','ZAR',75,72,NULL,'material',
 '2026-01-20','2026-01-28',NULL,'2026-04-30','renewables_levy',
 'CIL-2026-0006-ELG','CIL-2026-0006-ASM','CIL-2026-0006-CLM','CIL-2026-0006-NEG',NULL,NULL,NULL,NULL,NULL,
 'A new levy applied specifically to renewable generators was notified as a discriminatory change in law.','Eligibility confirmed as a discriminatory qualifying change.','Assessment valued the levy impact over the remaining term.','Relief claim submitted seeking a combination of tariff adjustment and lump-sum.','Parties are negotiating the relief split between tariff adjustment and a one-off payment.',NULL,NULL,NULL,NULL,NULL,
 'negotiation','2026-01-28 09:00:00','2026-02-02 09:00:00','2026-02-15 09:00:00','2026-02-25 09:00:00','2026-03-02 09:00:00','2026-03-10 09:00:00',NULL,NULL,NULL,NULL,NULL,NULL,
 '2026-03-25 09:00:00',NULL,1,0,'demo_offtaker_001'),

-- cil_007 minor other_change — referred to arbitration (REPORTABLE: refer_to_arbitration crosses EVERY tier)
('cil_007','CIL-2026-0007',
 NULL,NULL,NULL,NULL,'PPA-2026-4007','PRJ-KZN-WIND','OFT-2026-4007',
 'KwaZulu-Natal Wind SPV','Richards Bay Minerals','Arbitration Foundation of Southern Africa',
 'other_change','metering_protocol',NULL,'ZAR',4,4,NULL,'minor',
 '2026-02-01','2026-02-06',NULL,NULL,'eligibility_disputed',
 'CIL-2026-0007-ELG','CIL-2026-0007-ASM','CIL-2026-0007-CLM',NULL,NULL,'CIL-2026-0007-ARB',NULL,NULL,NULL,
 'A change to the metering settlement protocol was notified by the offtaker.','Eligibility tested; the claimant asserts it qualifies, the counterparty disputes it.','Assessment valued a small settlement adjustment.','Relief claim submitted on the disputed change.',NULL,NULL,'The parties could not agree eligibility and the claim was referred to arbitration even though the quantum is small.',NULL,NULL,NULL,
 'in_arbitration','2026-02-06 09:00:00','2026-02-10 09:00:00','2026-02-18 09:00:00','2026-02-25 09:00:00','2026-03-01 09:00:00',NULL,NULL,'2026-03-08 09:00:00',NULL,NULL,NULL,NULL,
 '2026-04-07 09:00:00',NULL,1,1,'demo_offtaker_001'),

-- cil_008 critical tax_change — relief granted, awaiting implementation (REPORTABLE: governmental + critical)
('cil_008','CIL-2026-0008',
 NULL,NULL,NULL,NULL,'PPA-2026-4008','PRJ-NATIONAL-GRID-BESS','OFT-2026-4008',
 'National Grid BESS SPV','Eskom',NULL,
 'tax_change','import_duty','tariff_adjustment','ZAR',800,780,760,'critical',
 '2025-11-01','2025-11-10',NULL,'2026-02-28','battery_import_duty',
 'CIL-2026-0008-ELG','CIL-2026-0008-ASM','CIL-2026-0008-CLM','CIL-2026-0008-NEG','CIL-2026-0008-DET',NULL,NULL,NULL,NULL,
 'A new import duty on battery cells was notified as a qualifying change in tax law.','Eligibility confirmed as a qualifying change in tax law.','Assessment valued the duty impact on the storage build cost.','Relief claim submitted seeking a tariff adjustment.','Parties agreed a tariff adjustment in principle.','Determination issued granting a tariff adjustment to recover the duty over the remaining term.',NULL,NULL,NULL,NULL,
 'relief_granted','2025-11-10 09:00:00','2025-11-15 09:00:00','2025-12-01 09:00:00','2025-12-15 09:00:00','2026-01-05 09:00:00','2026-01-20 09:00:00','2026-02-10 09:00:00',NULL,'2026-02-25 09:00:00',NULL,NULL,NULL,
 '2026-03-27 09:00:00',NULL,1,0,'demo_offtaker_001'),

-- cil_009 major regulatory_change — relief implemented (terminal; REPORTABLE: governmental + major)
('cil_009','CIL-2026-0009',
 NULL,NULL,NULL,NULL,'PPA-2026-4009','PRJ-LIMPOPO-PV','OFT-2026-4009',
 'Limpopo PV SPV','Eskom',NULL,
 'regulatory_change','grid_code_amendment','tariff_adjustment','ZAR',300,290,285,'major',
 '2025-09-01','2025-09-08',NULL,'2025-12-15','grid_code_capex',
 'CIL-2026-0009-ELG','CIL-2026-0009-ASM','CIL-2026-0009-CLM','CIL-2026-0009-NEG','CIL-2026-0009-DET',NULL,'CIL-2026-0009-IMP',NULL,NULL,
 'A NERSA Grid Code amendment requiring inverter retrofit was notified as a qualifying regulatory change.','Eligibility confirmed.','Assessment valued the retrofit capex.','Relief claim submitted seeking a tariff adjustment.','Parties agreed the relief quantum.','Determination issued granting a tariff adjustment.','Relief implemented; the adjusted tariff took effect from the next billing cycle and the case is closed.',NULL,NULL,NULL,
 'implemented','2025-09-08 09:00:00','2025-09-12 09:00:00','2025-10-01 09:00:00','2025-10-15 09:00:00','2025-11-01 09:00:00','2025-11-20 09:00:00','2025-12-05 09:00:00',NULL,'2025-12-12 09:00:00','2025-12-20 09:00:00',NULL,NULL,
 NULL,NULL,1,0,'demo_offtaker_001'),

-- cil_010 moderate other_change — rejected as not a qualifying change (terminal)
('cil_010','CIL-2026-0010',
 NULL,NULL,NULL,NULL,'PPA-2026-4010','PRJ-NW-SOLAR','OFT-2026-4010',
 'North West Solar SPV','Sasol',NULL,
 'other_change','commercial_repricing','no_relief','ZAR',20,0,0,'moderate',
 '2026-01-05','2026-01-12',NULL,NULL,'not_qualifying',
 'CIL-2026-0010-ELG',NULL,NULL,NULL,NULL,NULL,NULL,'CIL-2026-0010-REJ',NULL,
 'A commercial repricing of a balancing service was notified as a possible change in law.','Eligibility review found the change was a commercial matter and not a qualifying change in law; the claim was rejected.',NULL,NULL,NULL,NULL,NULL,NULL,'Rejected at eligibility: a commercial repricing is not a qualifying change in law under the PPA definition.',NULL,
 'rejected','2026-01-12 09:00:00','2026-01-16 09:00:00',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2026-01-20 09:00:00',NULL,
 NULL,NULL,0,0,'demo_offtaker_001');
