-- Wave 79 — Esums Generation Revenue Assurance & Meter Reconciliation seed.
-- 10 recon periods gra_001..gra_010 spanning ten distinct lifecycle states, all five
-- revenue-variance tiers and a mix of leakage signatures (meter_drift / comms_gap /
-- settlement_error / clipping_loss / meter_tampering). Six reportable cases prove the
-- W79 signature set:
--   - gra_006 (critical meter_tampering classified) — classify_leakage crosses for any tier
--     when the category is meter tampering,
--   - gra_008 (MINOR in_dispute) — raise_dispute crosses for EVERY tier (the settlement /
--     metering-dispute signature, proven here on a minor-tier variance),
--   - gra_009 (major recovered via dispute) — crossed when the dispute was raised,
--   - gra_010 (material written_off) — write-offs cross for the material+ tiers,
--   - gra_004 (major variance_flagged, SLA breached) and gra_005 (critical investigating,
--     SLA breached) — sla_breached crosses for major + critical.
-- No apostrophes anywhere (D1 SQLite). variance_zar (absolute) drives revenue_assurance_tier.

INSERT OR IGNORE INTO oe_generation_revenue_assurance (
  id, gra_number,
  source_event, source_entity_type, source_entity_id, source_wave, site_id, project_id, meter_id, ppa_ref,
  reconciliation_period, period_start, period_end, data_cutoff_date,
  site_name, operator_name, counterparty_name, reviewer_name,
  expected_generation_mwh, metered_generation_mwh, settled_generation_mwh, invoiced_generation_mwh,
  currency, tariff_ref, expected_revenue_zar, settled_revenue_zar, variance_zar, variance_mwh, recovered_zar, written_off_zar,
  leakage_category, recovery_method, revenue_assurance_tier, reason_code, recovery_deadline, dispute_deadline,
  ingest_ref, reconciliation_ref, investigation_ref, classification_ref, recovery_ref, dispute_ref, resolution_ref, writeoff_ref, cancellation_ref,
  period_basis, ingest_basis, reconciliation_basis, investigation_basis, classification_basis, recovery_basis, dispute_basis, resolution_basis, writeoff_basis, cancellation_basis,
  chain_status, period_open_at, data_ingested_at, reconciled_at, variance_flagged_at, investigating_at, classified_at, recovery_pending_at, in_dispute_at, recovered_at, closed_clean_at, written_off_at, cancelled_at,
  sla_deadline_at, last_sla_breach_at, is_reportable, escalation_level, created_by
) VALUES
-- gra_001 minor — a period just opened against the Karoo revenue meter, ingestion pending
('gra_001','GRA-2026-0001',
 NULL,NULL,NULL,NULL,'SITE-KAROO-SOLAR','PRJ-KAROO-SOLAR','MTR-KAROO-01','PPA-2026-4001',
 '2026-04','2026-04-01','2026-04-30','2026-05-05',
 'Karoo Solar Park','Esums Operations','Eskom Distribution',NULL,
 4200,NULL,NULL,NULL,
 'ZAR','TRF-MEGAFLEX-2026',3780000,NULL,8000,NULL,NULL,NULL,
 NULL,NULL,'minor',NULL,NULL,NULL,
 NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,
 'A reconciliation period was opened for the April 2026 settlement month against the Karoo revenue meter; data ingestion is pending.',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,
 'period_open','2026-05-05 09:00:00',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,
 '2026-05-09 09:00:00',NULL,0,0,'demo_support_001'),

-- gra_002 moderate — meter, SCADA and settlement data ingested; comms gap back-filled
('gra_002','GRA-2026-0002',
 NULL,NULL,NULL,NULL,'SITE-WC-WIND','PRJ-WC-WIND','MTR-WCWIND-01','PPA-2026-4002',
 '2026-04','2026-04-01','2026-04-30','2026-05-05',
 'Western Cape Wind Farm','Esums Operations','City of Cape Town',NULL,
 5100,4980,NULL,NULL,
 'ZAR','TRF-WIND-PPA-2026',4590000,NULL,95000,105,NULL,NULL,
 NULL,NULL,'moderate',NULL,NULL,NULL,
 'GRA-2026-0002-ING',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,
 'Reconciliation period opened for the April 2026 settlement month.','Revenue-meter, SCADA and settlement data ingested; a comms outage left a telemetry gap that was back-filled by the meter register.',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,
 'data_ingested','2026-05-05 09:00:00','2026-05-07 10:00:00',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,
 '2026-05-11 10:00:00',NULL,0,0,'demo_support_001'),

-- gra_003 minor — reconciled within tolerance and closed clean (no leakage; terminal)
('gra_003','GRA-2026-0003',
 NULL,NULL,NULL,NULL,'SITE-NC-PV','PRJ-NC-PV','MTR-NCPV-01','PPA-2026-4003',
 '2026-04','2026-04-01','2026-04-30','2026-05-04',
 'Northern Cape PV','Esums Operations','Eskom Distribution','Esums Revenue Assurance Desk',
 6300,6285,6280,6280,
 'ZAR','TRF-MEGAFLEX-2026',5670000,5648000,22000,24,NULL,NULL,
 NULL,NULL,'minor',NULL,NULL,NULL,
 'GRA-2026-0003-ING','GRA-2026-0003-REC',NULL,NULL,NULL,NULL,NULL,NULL,NULL,
 'Reconciliation period opened for the April 2026 settlement month.','Meter, SCADA and settlement data ingested with full coverage.','Expected, metered, settled and invoiced generation reconciled within the 0.5 percent tolerance band; no revenue leakage detected and the period was closed clean.',NULL,NULL,NULL,NULL,NULL,NULL,NULL,
 'closed_clean','2026-05-04 09:00:00','2026-05-06 09:00:00','2026-05-08 09:00:00',NULL,NULL,NULL,NULL,NULL,NULL,'2026-05-09 09:00:00',NULL,NULL,
 NULL,NULL,0,0,'demo_support_001'),

-- gra_004 major — settlement materially below metered; variance flagged and SLA breached (REPORTABLE)
('gra_004','GRA-2026-0004',
 NULL,NULL,NULL,NULL,'SITE-MPU-CSP','PRJ-MPU-CSP','MTR-MPUCSP-01','PPA-2026-4004',
 '2026-04','2026-04-01','2026-04-30','2026-05-04',
 'Mpumalanga CSP','Esums Operations','Eskom Distribution',NULL,
 3800,3790,1470,1470,
 'ZAR','TRF-CSP-PPA-2026',3420000,1320000,2100000,2333,NULL,NULL,
 NULL,NULL,'major','settlement_underpayment',NULL,NULL,
 'GRA-2026-0004-ING','GRA-2026-0004-REC',NULL,NULL,NULL,NULL,NULL,NULL,NULL,
 'Reconciliation period opened for the April 2026 settlement month.','Meter, SCADA and settlement data ingested.','Reconciliation found the settlement statement materially below the metered generation; a major revenue variance was flagged and the SLA window has since been breached pending investigation.',NULL,NULL,NULL,NULL,NULL,NULL,NULL,
 'variance_flagged','2026-05-02 09:00:00','2026-05-04 09:00:00','2026-05-06 09:00:00','2026-05-07 09:00:00',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,
 '2026-05-10 09:00:00','2026-05-12 09:00:00',1,1,'demo_support_001'),

-- gra_005 critical — expected model and meter diverge sharply; under investigation, SLA breached (REPORTABLE)
('gra_005','GRA-2026-0005',
 NULL,NULL,NULL,NULL,'SITE-FS-PV','PRJ-FS-PV','MTR-FSPV-01','PPA-2026-4005',
 '2026-04','2026-04-01','2026-04-30','2026-05-02',
 'Free State PV','Esums Operations','Eskom Distribution','Esums Revenue Assurance Desk',
 7600,7100,7050,7050,
 'ZAR','TRF-PEAK-PPA-2026',11400000,4600000,6800000,4533,NULL,NULL,
 NULL,NULL,'critical','meter_drift_suspected',NULL,NULL,
 'GRA-2026-0005-ING','GRA-2026-0005-REC','GRA-2026-0005-INV',NULL,NULL,NULL,NULL,NULL,NULL,
 'Reconciliation period opened for the April 2026 settlement month.','Meter, SCADA and settlement data ingested.','A large gap between the expected-generation model and the revenue meter was flagged.','A critical revenue variance is under investigation; the expected-generation model and the revenue meter diverge sharply, indicating possible meter drift, and the SLA window has been breached.',NULL,NULL,NULL,NULL,NULL,NULL,
 'investigating','2026-04-28 09:00:00','2026-04-30 09:00:00','2026-05-02 09:00:00','2026-05-03 09:00:00','2026-05-05 09:00:00',NULL,NULL,NULL,NULL,NULL,NULL,NULL,
 '2026-05-08 09:00:00','2026-05-09 09:00:00',1,1,'demo_support_001'),

-- gra_006 critical — meter tampering confirmed at classification (REPORTABLE: tampering any tier)
('gra_006','GRA-2026-0006',
 NULL,NULL,NULL,NULL,'SITE-LIMPOPO-PV','PRJ-LIMPOPO-PV','MTR-LIMPV-01','PPA-2026-4006',
 '2026-03','2026-03-01','2026-03-31','2026-04-05',
 'Limpopo PV','Esums Operations','Eskom Distribution','Esums Revenue Assurance Desk',
 8200,6900,6880,6880,
 'ZAR','TRF-PEAK-PPA-2026',12300000,6900000,5400000,3600,NULL,NULL,
 'meter_tampering',NULL,'critical','meter_tampering_confirmed',NULL,NULL,
 'GRA-2026-0006-ING','GRA-2026-0006-REC','GRA-2026-0006-INV','GRA-2026-0006-CLS',NULL,NULL,NULL,NULL,NULL,
 'Reconciliation period opened for the March 2026 settlement month.','Meter, SCADA and settlement data ingested.','A critical revenue variance was flagged against the expected-generation model.','Investigation found broken metering seals and an altered CT ratio suppressing recorded generation.','Classified as meter tampering: the metering seals were broken and the CT ratio altered to suppress recorded generation; referred to the NERSA metering-code process.',NULL,NULL,NULL,NULL,NULL,
 'classified','2026-04-20 09:00:00','2026-04-22 09:00:00','2026-04-24 09:00:00','2026-04-25 09:00:00','2026-04-27 09:00:00','2026-05-01 09:00:00',NULL,NULL,NULL,NULL,NULL,NULL,
 '2026-05-04 09:00:00',NULL,1,0,'demo_support_001'),

-- gra_007 material — settlement error, recovery claim issued to the DSO and pending
('gra_007','GRA-2026-0007',
 NULL,NULL,NULL,NULL,'SITE-EC-WIND','PRJ-EC-WIND','MTR-ECWIND-01','PPA-2026-4007',
 '2026-03','2026-03-01','2026-03-31','2026-04-04',
 'Eastern Cape Wind Farm','Esums Operations','Coega Development Corporation','Esums Revenue Assurance Desk',
 5400,5390,5180,5180,
 'ZAR','TRF-WIND-PPA-2026',4860000,4220000,640000,711,NULL,NULL,
 'settlement_error','settlement_resubmission','material','settlement_error_confirmed','2026-05-05 09:00:00',NULL,
 'GRA-2026-0007-ING','GRA-2026-0007-REC','GRA-2026-0007-INV','GRA-2026-0007-CLS','GRA-2026-0007-RCV',NULL,NULL,NULL,NULL,
 'Reconciliation period opened for the March 2026 settlement month.','Meter, SCADA and settlement data ingested.','A material revenue variance was flagged against the metered generation.','Investigation traced the variance to an understated DSO settlement statement.','Classified as a settlement error.','A recovery claim was issued to the DSO for resubmission of the understated settlement and is pending the counterparty credit.',NULL,NULL,NULL,NULL,
 'recovery_pending','2026-04-15 09:00:00','2026-04-17 09:00:00','2026-04-19 09:00:00','2026-04-20 09:00:00','2026-04-22 09:00:00','2026-04-25 09:00:00','2026-04-28 09:00:00',NULL,NULL,NULL,NULL,NULL,
 '2026-05-05 09:00:00',NULL,0,0,'demo_support_001'),

-- gra_008 minor — DSO rejected the claim; escalated to a settlement dispute (REPORTABLE: dispute any tier)
('gra_008','GRA-2026-0008',
 NULL,NULL,NULL,NULL,'SITE-KZN-WIND','PRJ-KZN-WIND','MTR-KZNWIND-01','PPA-2026-4008',
 '2026-03','2026-03-01','2026-03-31','2026-04-04',
 'KwaZulu-Natal Wind Farm','Esums Operations','Richards Bay Minerals','Esums Revenue Assurance Desk',
 4600,4595,4560,4560,
 'ZAR','TRF-WIND-PPA-2026',4140000,4102000,38000,42,NULL,NULL,
 'settlement_error','settlement_resubmission','minor','settlement_disputed',NULL,'2026-05-27 09:00:00',
 'GRA-2026-0008-ING','GRA-2026-0008-REC','GRA-2026-0008-INV','GRA-2026-0008-CLS','GRA-2026-0008-RCV','GRA-2026-0008-DSP',NULL,NULL,NULL,
 'Reconciliation period opened for the March 2026 settlement month.','Meter, SCADA and settlement data ingested.','A minor revenue variance was flagged.','Investigation traced the variance to an understated settlement line.','Classified as a settlement error.','A recovery claim was issued for the understated settlement.','The DSO rejected the recovery claim; the matter was escalated to a formal settlement dispute under the NERSA metering code even though the quantum is minor.',NULL,NULL,NULL,
 'in_dispute','2026-04-10 09:00:00','2026-04-12 09:00:00','2026-04-14 09:00:00','2026-04-15 09:00:00','2026-04-17 09:00:00','2026-04-20 09:00:00','2026-04-23 09:00:00','2026-04-27 09:00:00',NULL,NULL,NULL,NULL,
 '2026-05-27 09:00:00',NULL,1,1,'demo_support_001'),

-- gra_009 major — meter drift recovered via dispute resolution and recalibration (terminal; REPORTABLE)
('gra_009','GRA-2026-0009',
 NULL,NULL,NULL,NULL,'SITE-NW-SOLAR','PRJ-NW-SOLAR','MTR-NWSOL-01','PPA-2026-4009',
 '2026-02','2026-02-01','2026-02-28','2026-03-04',
 'North West Solar','Esums Operations','Eskom Distribution','Esums Revenue Assurance Desk',
 6800,6300,6280,6280,
 'ZAR','TRF-MEGAFLEX-2026',6120000,4620000,1500000,1667,1500000,NULL,
 'meter_drift','meter_recalibration','major','meter_recalibrated',NULL,NULL,
 'GRA-2026-0009-ING','GRA-2026-0009-REC','GRA-2026-0009-INV','GRA-2026-0009-CLS','GRA-2026-0009-RCV','GRA-2026-0009-DSP','GRA-2026-0009-RES',NULL,NULL,
 'Reconciliation period opened for the February 2026 settlement month.','Meter, SCADA and settlement data ingested.','A major revenue variance was flagged against the expected-generation model.','Investigation found a slow drift in the revenue meter understating generation.','Classified as meter drift.','A recovery claim was issued against the under-recorded generation.','The DSO initially disputed the meter accuracy.','The dispute was resolved in favour of the operator; the meter was recalibrated and the DSO issued a credit note recovering the full drifted revenue. The case settled as recovered.',NULL,NULL,
 'recovered','2026-03-15 09:00:00','2026-03-17 09:00:00','2026-03-19 09:00:00','2026-03-20 09:00:00','2026-03-22 09:00:00','2026-03-25 09:00:00','2026-03-28 09:00:00','2026-04-02 09:00:00','2026-04-20 09:00:00',NULL,NULL,NULL,
 NULL,NULL,1,0,'demo_support_001'),

-- gra_010 material — unrecoverable comms gap written off after settlement window closed (terminal; REPORTABLE)
('gra_010','GRA-2026-0010',
 NULL,NULL,NULL,NULL,'SITE-GAUTENG-PV','PRJ-GAUTENG-PV','MTR-GTPV-01','PPA-2026-4010',
 '2026-02','2026-02-01','2026-02-28','2026-03-04',
 'Gauteng Rooftop PV','Esums Operations','City of Johannesburg','Esums Revenue Assurance Desk',
 3200,2980,2975,2975,
 'ZAR','TRF-MEGAFLEX-2026',2880000,2160000,720000,800,NULL,720000,
 'comms_gap','none','material','comms_gap_unrecoverable',NULL,NULL,
 'GRA-2026-0010-ING','GRA-2026-0010-REC','GRA-2026-0010-INV','GRA-2026-0010-CLS',NULL,NULL,NULL,'GRA-2026-0010-WOF',NULL,
 'Reconciliation period opened for the February 2026 settlement month.','Meter, SCADA and settlement data ingested.','A material revenue variance was flagged.','Investigation found a prolonged telemetry outage back-filled with an under-estimate.','Classified as an unrecoverable comms gap: a prolonged telemetry outage was back-filled with an under-estimate and the settlement window has closed.',NULL,NULL,NULL,'The DSO settlement window has closed and the back-filled estimate cannot be re-opened; the material revenue shortfall was written off and reported.',NULL,
 'written_off','2026-03-10 09:00:00','2026-03-12 09:00:00','2026-03-14 09:00:00','2026-03-15 09:00:00','2026-03-17 09:00:00','2026-03-20 09:00:00',NULL,NULL,NULL,NULL,'2026-03-28 09:00:00',NULL,
 NULL,NULL,1,0,'demo_support_001');
