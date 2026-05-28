-- Wave 42 — Carbon Reversal / Buffer-Pool & Permanence Management seed data.
-- 10 prod-realistic reversal events across 10 of 12 states (omits standalone
-- buffer_cancellation_proposed + remediation_verified — both traversed inside
-- the crev_009 buffer-path closed flagship) + 3 tiers + both resolution paths.
-- Cross-wave provenance: reversals arise against W37-registered AFOLU projects
-- (creg_003 Eastern Cape thicket REDD+/ARR, creg_008 Kruger-to-Canyons savanna
-- fire mgmt) — the sequestration projects that carry real non-permanence risk.
-- Single carbon-fund desk write; actor_party records the contractual function
-- (proponent / vvb / registry / authority).

-- 1) reversal_reported — catastrophic, wildfire on the K2C savanna project (just reported)
INSERT OR IGNORE INTO oe_carbon_reversals (
  id, reversal_number,
  source_event, source_entity_type, source_entity_id, source_wave,
  project_party_id, project_party_name, vvb_name, project_name, project_tier, standard, methodology, province, host_country,
  registered_project_ref, credit_serial_block,
  reversal_cause, reversal_type, reversal_tier, reversed_tco2e,
  reversal_summary,
  chain_status, reversal_reported_at, sla_deadline_at, created_by
) VALUES (
  'crev_001', 'CARB-REV-2026-0001',
  'carbon_registration.registered', 'carbon_registration', 'creg_008', 'W37',
  'dev_k2c', 'Kruger-to-Canyons Biosphere NPC', 'AENOR Internacional', 'Kruger-to-Canyons Savanna Fire Management (Article 6.4)', 'afolu_redd', 'article6', 'VM0042 / AMS-III.BK (Savanna Burning)', 'Mpumalanga', 'ZA',
  'REG-2026-0008', 'ZA-A6-2026-K2C-0001..120000',
  'wildfire', 'unintentional', 'catastrophic', 88000,
  'Late-dry-season wildfire breached the early-burning fire-break network and burned ~73% of the managed savanna block. Satellite burn-scar (Sentinel-2) flags an estimated 88,000 tCO2e reversal against issued Article 6.4 credits. Reported to the registry; assessment pending. Unintentional natural disturbance — buffer-pool candidate.',
  'reversal_reported', '2026-05-26 07:00:00', '2026-05-27 07:00:00', 'demo_carbon_001'
);

-- 2) under_assessment — significant, drought partial mortality on the EC thicket REDD+
INSERT OR IGNORE INTO oe_carbon_reversals (
  id, reversal_number,
  source_event, source_entity_type, source_entity_id, source_wave,
  project_party_id, project_party_name, vvb_name, project_name, project_tier, standard, methodology, province, host_country,
  registered_project_ref, credit_serial_block,
  reversal_cause, reversal_type, reversal_tier, reversed_tco2e,
  reversal_summary, assessment_basis,
  chain_status, reversal_reported_at, under_assessment_at, sla_deadline_at, created_by
) VALUES (
  'crev_002', 'CARB-REV-2026-0002',
  'carbon_registration.validation_underway', 'carbon_registration', 'creg_003', 'W37',
  'dev_ectrust', 'Eastern Cape Restoration Trust', 'AENOR Internacional', 'Eastern Cape Subtropical Thicket Restoration (REDD+/ARR)', 'afolu_redd', 'verra_vcs', 'VM0007 / AR-ACM0003', 'Eastern Cape', 'ZA',
  'VAL-2026-0003', 'VCS-2025-ECT-0001..045000',
  'drought', 'unintentional', 'significant', 21500,
  'A multi-season drought caused partial spekboom thicket die-back across the restoration footprint. Field reports + NDVI decline suggest a material but partial sequestration loss. Reported and now under formal assessment.',
  'Assessment opened: VVB commissioned to ground-truth NDVI-flagged die-back polygons against the permanence monitoring plots; preliminary loss bracket 18,000–24,000 tCO2e pending plot remeasurement.',
  'under_assessment', '2026-05-10 08:00:00', '2026-05-12 09:00:00', '2026-05-19 08:00:00', 'demo_carbon_001'
);

-- 3) loss_quantified — significant, pest/disease mortality (loss bounded, awaiting resolution decision)
INSERT OR IGNORE INTO oe_carbon_reversals (
  id, reversal_number,
  source_event, source_entity_type, source_entity_id, source_wave,
  project_party_id, project_party_name, vvb_name, project_name, project_tier, standard, methodology, province, host_country,
  registered_project_ref, credit_serial_block,
  reversal_cause, reversal_type, reversal_tier, reversed_tco2e,
  reversal_summary, assessment_basis, quantification_basis,
  chain_status, reversal_reported_at, under_assessment_at, loss_quantified_at, sla_deadline_at, created_by
) VALUES (
  'crev_003', 'CARB-REV-2026-0003',
  'carbon_registration.validation_underway', 'carbon_registration', 'creg_003', 'W37',
  'dev_ectrust', 'Eastern Cape Restoration Trust', 'AENOR Internacional', 'Eastern Cape Subtropical Thicket Restoration (REDD+/ARR)', 'afolu_redd', 'verra_vcs', 'VM0007 / AR-ACM0003', 'Eastern Cape', 'ZA',
  'VAL-2026-0003', 'VCS-2025-ECT-0046..061000',
  'pest_disease', 'unintentional', 'significant', 15800,
  'A cochineal/insect outbreak killed a contiguous spekboom stand in the northern blocks. Distinct from the drought event — separate reversal record.',
  'VVB site audit + remote sensing confirmed the affected area boundary and excluded the drought-stressed (recoverable) zone from the loss.',
  'Loss quantified at 15,800 tCO2e against the VCS Non-Permanence Risk Tool stock-difference method (registered stock minus remeasured live biomass carbon over the affected polygons). Unintentional — routes to buffer cancellation.',
  'loss_quantified', '2026-04-15 08:00:00', '2026-04-18 09:00:00', '2026-04-28 09:00:00', '2026-05-28 09:00:00', 'demo_carbon_001'
);

-- 4) false_alarm — minor, remote-sensing false positive (reported then dismissed — terminal)
INSERT OR IGNORE INTO oe_carbon_reversals (
  id, reversal_number,
  source_event, source_entity_type, source_entity_id, source_wave,
  project_party_id, project_party_name, vvb_name, project_name, project_tier, standard, methodology, province, host_country,
  registered_project_ref, credit_serial_block,
  reversal_cause, reversal_type, reversal_tier, reversed_tco2e,
  reversal_summary, assessment_basis, reason_code, closure_notes,
  chain_status, reversal_reported_at, under_assessment_at, false_alarm_at, created_by
) VALUES (
  'crev_004', 'CARB-REV-2026-0004',
  'carbon_registration.validation_underway', 'carbon_registration', 'creg_003', 'W37',
  'dev_ectrust', 'Eastern Cape Restoration Trust', 'AENOR Internacional', 'Eastern Cape Subtropical Thicket Restoration (REDD+/ARR)', 'afolu_redd', 'verra_vcs', 'VM0007 / AR-ACM0003', 'Eastern Cape', 'ZA',
  'VAL-2026-0003', null,
  'drought', 'unintentional', 'minor', 0,
  'An automated NDVI anomaly alert flagged a suspected ~3,000 tCO2e die-back in a southern block. Reported and assessed.',
  'Ground-truthing found the NDVI dip was seasonal senescence (deciduous nurse-plant leaf drop), not carbon-stock loss; live biomass plots unchanged. No reversal occurred.',
  'no_real_loss_seasonal_signal',
  'DISMISSED as a false alarm — the satellite signal was a benign seasonal phenology artefact, not a permanence loss. No buffer action; project stock intact. Monitoring thresholds tuned to suppress the seasonal false positive.',
  'false_alarm', '2026-03-20 08:00:00', '2026-03-22 09:00:00', '2026-03-28 09:00:00', 'demo_carbon_001'
);

-- 5) buffer_cancelled — significant, contained fire, buffer pool spent (buffer path, awaiting remediation verify)
INSERT OR IGNORE INTO oe_carbon_reversals (
  id, reversal_number,
  source_event, source_entity_type, source_entity_id, source_wave,
  project_party_id, project_party_name, vvb_name, project_name, project_tier, standard, methodology, province, host_country,
  registered_project_ref, credit_serial_block,
  reversal_cause, reversal_type, reversal_tier, reversed_tco2e, buffer_cancelled_tco2e, buffer_pool_ref, reversal_ref,
  reversal_summary, assessment_basis, quantification_basis, buffer_basis,
  chain_status, reversal_reported_at, under_assessment_at, loss_quantified_at, buffer_cancellation_proposed_at, buffer_cancelled_at, sla_deadline_at, created_by
) VALUES (
  'crev_005', 'CARB-REV-2026-0005',
  'carbon_registration.registered', 'carbon_registration', 'creg_008', 'W37',
  'dev_k2c', 'Kruger-to-Canyons Biosphere NPC', 'AENOR Internacional', 'Kruger-to-Canyons Savanna Fire Management (Article 6.4)', 'afolu_redd', 'article6', 'VM0042 / AMS-III.BK (Savanna Burning)', 'Mpumalanga', 'ZA',
  'REG-2026-0008', 'ZA-A6-2026-K2C-0001..120000',
  'wildfire', 'unintentional', 'significant', 12400, 12400, 'BUFFER-VCS-AFOLU-POOL', 'REVERSAL-2026-0005',
  'A contained late-season fire burned a peripheral management block before suppression. Material but partial loss.',
  'VVB confirmed the burn-scar boundary and the unburned core stayed intact.',
  'Loss quantified at 12,400 tCO2e via burn-scar stock difference.',
  'Buffer cancellation executed: 12,400 buffer credits cancelled from the shared VCS AFOLU buffer pool equal to the reversed tonnage. No penalty — this is what the buffer is for. Site stabilisation underway; remediation verification pending.',
  'buffer_cancelled', '2026-02-01 08:00:00', '2026-02-03 09:00:00', '2026-02-12 09:00:00', '2026-02-18 09:00:00', '2026-02-25 09:00:00', '2026-03-25 09:00:00', 'demo_carbon_001'
);

-- 6) replacement_required — catastrophic, INTENTIONAL illegal logging (proponent at fault — crosses regulator)
INSERT OR IGNORE INTO oe_carbon_reversals (
  id, reversal_number,
  source_event, source_entity_type, source_entity_id, source_wave,
  project_party_id, project_party_name, vvb_name, project_name, project_tier, standard, methodology, province, host_country,
  registered_project_ref, credit_serial_block,
  reversal_cause, reversal_type, reversal_tier, reversed_tco2e, replacement_tco2e, reversal_ref, regulator_ref, is_reportable, escalation_level,
  reversal_summary, assessment_basis, quantification_basis, replacement_basis,
  chain_status, reversal_reported_at, under_assessment_at, loss_quantified_at, replacement_required_at, sla_deadline_at, created_by
) VALUES (
  'crev_006', 'CARB-REV-2026-0006',
  'carbon_registration.validation_underway', 'carbon_registration', 'creg_003', 'W37',
  'dev_ectrust', 'Eastern Cape Restoration Trust', 'AENOR Internacional', 'Eastern Cape Subtropical Thicket Restoration (REDD+/ARR)', 'afolu_redd', 'verra_vcs', 'VM0007 / AR-ACM0003', 'Eastern Cape', 'ZA',
  'VAL-2026-0003', 'VCS-2025-ECT-0062..110000',
  'illegal_logging', 'intentional', 'catastrophic', 48000, 48000, 'REVERSAL-2026-0006', 'NERSA-NOTIFY-2026-0041', 1, 1,
  'Investigation found systematic illegal harvesting of restored thicket inside the project boundary, facilitated by a lapse in the proponent''s monitoring obligations. Proponent-at-fault — the buffer is NOT spent for an intentional reversal.',
  'VVB + registry forensic assessment traced cut-stump density and haul-road imagery to a sustained harvesting operation over two seasons.',
  'Loss quantified at 48,000 tCO2e against the harvested-area stock difference.',
  'REPLACEMENT REQUIRED: because the reversal is intentional / proponent-at-fault, the proponent must replace 48,000 tCO2e of equivalent credits (and the buffer is preserved). NOTIFIED to the regulator — an intentional reversal is a market-integrity event regardless of size. Verification will follow replacement submission.',
  'replacement_required', '2026-01-10 08:00:00', '2026-01-13 09:00:00', '2026-02-05 09:00:00', '2026-02-20 09:00:00', '2026-03-06 09:00:00', 'demo_carbon_001'
);

-- 7) replacement_submitted — significant, monitoring negligence (proponent submitted replacement credits)
INSERT OR IGNORE INTO oe_carbon_reversals (
  id, reversal_number,
  source_event, source_entity_type, source_entity_id, source_wave,
  project_party_id, project_party_name, vvb_name, project_name, project_tier, standard, methodology, province, host_country,
  registered_project_ref, credit_serial_block,
  reversal_cause, reversal_type, reversal_tier, reversed_tco2e, replacement_tco2e, replacement_serial_block, reversal_ref, regulator_ref, is_reportable,
  reversal_summary, quantification_basis, replacement_basis,
  chain_status, reversal_reported_at, under_assessment_at, loss_quantified_at, replacement_required_at, replacement_submitted_at, sla_deadline_at, created_by
) VALUES (
  'crev_007', 'CARB-REV-2026-0007',
  'carbon_registration.registered', 'carbon_registration', 'creg_008', 'W37',
  'dev_k2c', 'Kruger-to-Canyons Biosphere NPC', 'AENOR Internacional', 'Kruger-to-Canyons Savanna Fire Management (Article 6.4)', 'afolu_redd', 'article6', 'VM0042 / AMS-III.BK (Savanna Burning)', 'Mpumalanga', 'ZA',
  'REG-2026-0008', 'ZA-A6-2026-K2C-0001..120000',
  'non_compliance', 'intentional', 'significant', 9200, 9200, 'ZA-A6-2026-K2C-REPL-0001..009200', 'REVERSAL-2026-0007', 'NERSA-NOTIFY-2026-0029', 1,
  'A fire-management compliance lapse (early-burning regime not executed in two blocks) led to avoidable late-season emissions counted as a reversal. Treated as proponent-at-fault (intentional non-compliance).',
  'Loss quantified at 9,200 tCO2e against the foregone early-burning emission reduction.',
  'Replacement credits submitted: the proponent transferred 9,200 tCO2e of equivalent Article 6.4 vintage credits (serial block ZA-A6-2026-K2C-REPL) to cover the loss. Awaiting VVB verification of the replacement before close.',
  'replacement_submitted', '2025-12-15 08:00:00', '2025-12-18 09:00:00', '2026-01-05 09:00:00', '2026-01-18 09:00:00', '2026-02-08 09:00:00', '2026-02-22 09:00:00', 'demo_carbon_001'
);

-- 8) replacement_verified — significant, replacement credits verified (awaiting close)
INSERT OR IGNORE INTO oe_carbon_reversals (
  id, reversal_number,
  source_event, source_entity_type, source_entity_id, source_wave,
  project_party_id, project_party_name, vvb_name, project_name, project_tier, standard, methodology, province, host_country,
  registered_project_ref, credit_serial_block,
  reversal_cause, reversal_type, reversal_tier, reversed_tco2e, replacement_tco2e, replacement_serial_block, reversal_ref, regulator_ref, is_reportable,
  reversal_summary, quantification_basis, replacement_basis, verification_basis,
  chain_status, reversal_reported_at, under_assessment_at, loss_quantified_at, replacement_required_at, replacement_submitted_at, replacement_verified_at, sla_deadline_at, created_by
) VALUES (
  'crev_008', 'CARB-REV-2026-0008',
  'carbon_registration.validation_underway', 'carbon_registration', 'creg_003', 'W37',
  'dev_ectrust', 'Eastern Cape Restoration Trust', 'AENOR Internacional', 'Eastern Cape Subtropical Thicket Restoration (REDD+/ARR)', 'afolu_redd', 'verra_vcs', 'VM0007 / AR-ACM0003', 'Eastern Cape', 'ZA',
  'VAL-2026-0003', 'VCS-2025-ECT-0111..130000',
  'non_compliance', 'intentional', 'significant', 7600, 7600, 'VCS-2026-ECT-REPL-0001..007600', 'REVERSAL-2026-0008', 'NERSA-NOTIFY-2026-0018', 1,
  'A boundary-encroachment grazing breach (proponent failed to maintain the exclusion fencing) caused avoidable thicket loss. Proponent-at-fault.',
  'Loss quantified at 7,600 tCO2e against the encroached-area stock difference.',
  'Replacement of 7,600 tCO2e of equivalent VCS credits submitted by the proponent.',
  'VVB VERIFIED the replacement credits: vintage equivalence, additionality, and serial uniqueness confirmed; the replacement fully offsets the reversed tonnage. Ready to close.',
  'replacement_verified', '2025-11-01 08:00:00', '2025-11-04 09:00:00', '2025-11-20 09:00:00', '2025-12-01 09:00:00', '2025-12-18 09:00:00', '2026-01-10 09:00:00', '2026-01-24 09:00:00', 'demo_carbon_001'
);

-- 9) closed — significant, BUFFER-path FULL happy arc (traverses buffer_cancellation_proposed + remediation_verified)
INSERT OR IGNORE INTO oe_carbon_reversals (
  id, reversal_number,
  source_event, source_entity_type, source_entity_id, source_wave,
  project_party_id, project_party_name, vvb_name, project_name, project_tier, standard, methodology, province, host_country,
  registered_project_ref, credit_serial_block,
  reversal_cause, reversal_type, reversal_tier, reversed_tco2e, buffer_cancelled_tco2e, buffer_pool_ref, reversal_ref, regulator_ref, is_reportable,
  reversal_summary, assessment_basis, quantification_basis, buffer_basis, remediation_basis, verification_basis, reason_code, closure_notes,
  chain_status, reversal_reported_at, under_assessment_at, loss_quantified_at, buffer_cancellation_proposed_at, buffer_cancelled_at, remediation_verified_at, closed_at, created_by
) VALUES (
  'crev_009', 'CARB-REV-2026-0009',
  'carbon_registration.registered', 'carbon_registration', 'creg_008', 'W37',
  'dev_k2c', 'Kruger-to-Canyons Biosphere NPC', 'AENOR Internacional', 'Kruger-to-Canyons Savanna Fire Management (Article 6.4)', 'afolu_redd', 'article6', 'VM0042 / AMS-III.BK (Savanna Burning)', 'Mpumalanga', 'ZA',
  'REG-2026-0008', 'ZA-A6-2026-K2C-0001..120000',
  'wildfire', 'unintentional', 'significant', 18900, 18900, 'BUFFER-VCS-AFOLU-POOL', 'REVERSAL-2025-0009', 'NERSA-NOTIFY-2025-0040', 1,
  'A lightning-ignited wildfire burned a managed savanna block during an extreme fire-danger window despite a compliant early-burning regime. Unintentional natural disturbance — the textbook buffer-pool case.',
  'VVB site audit + Sentinel-2 burn-scar mapping established the affected boundary and confirmed no proponent fault.',
  'Loss quantified at 18,900 tCO2e via burn-scar stock difference under the VCS Non-Permanence Risk Tool.',
  'Buffer cancellation proposed and approved: 18,900 buffer credits earmarked from the shared AFOLU buffer pool.',
  'Buffer cancelled — 18,900 credits cancelled equal to the reversed tonnage; the market is made whole at no cost to the proponent.',
  'Remediation verified: VVB confirmed the site has stabilised, regrowth monitoring plots re-established, and fire-break network reinforced; no ongoing loss.',
  'buffer_resolved_verified',
  'CLOSED — full buffer-path arc: reported → assessment → loss quantified → buffer cancellation proposed → buffer cancelled → remediation verified → closed. Unintentional reversal absorbed by the buffer pool; site stabilised. Material reversal — registry-board notified per the close-reportability rule.',
  'closed', '2025-09-01 08:00:00', '2025-09-04 09:00:00', '2025-09-18 09:00:00', '2025-09-26 09:00:00', '2025-10-05 09:00:00', '2025-11-02 09:00:00', '2025-11-16 09:00:00', 'admin'
);

-- 10) escalated — catastrophic, total reversal + fraud → project termination (crosses regulator)
INSERT OR IGNORE INTO oe_carbon_reversals (
  id, reversal_number,
  source_event, source_entity_type, source_entity_id, source_wave,
  project_party_id, project_party_name, vvb_name, project_name, project_tier, standard, methodology, province, host_country,
  registered_project_ref, credit_serial_block,
  reversal_cause, reversal_type, reversal_tier, reversed_tco2e, reversal_ref, regulator_ref, is_reportable, escalation_level,
  reversal_summary, assessment_basis, quantification_basis, reason_code, closure_notes,
  chain_status, reversal_reported_at, under_assessment_at, loss_quantified_at, escalated_at, sla_deadline_at, created_by
) VALUES (
  'crev_010', 'CARB-REV-2025-0010',
  'carbon_registration.validation_underway', 'carbon_registration', 'creg_003', 'W37',
  'dev_ectrust', 'Eastern Cape Restoration Trust', 'AENOR Internacional', 'Eastern Cape Subtropical Thicket Restoration (REDD+/ARR)', 'afolu_redd', 'verra_vcs', 'VM0007 / AR-ACM0003', 'Eastern Cape', 'ZA',
  'VAL-2026-0003', 'VCS-2025-ECT-FULL-BLOCK',
  'project_failure', 'intentional', 'catastrophic', 142000, 'REVERSAL-2025-0010', 'NERSA-TRIBUNAL-2025-0014', 1, 2,
  'A combined catastrophic permanence failure: near-total clearing of the restored thicket for grazing conversion, compounded by evidence that monitoring reports were falsified to conceal earlier losses. Project-termination event.',
  'Joint VVB + registry + authority forensic assessment found the restored stock effectively eliminated and the proponent''s permanence-monitoring submissions fraudulent.',
  'Loss quantified at 142,000 tCO2e — a total reversal of the issued + projected crediting block.',
  'catastrophic_fraud_project_termination',
  'ESCALATED beyond the registry desk: total reversal + monitoring fraud exceeds routine resolution. Crediting suspended, registration flagged for termination, and the matter NOTIFIED to the regulator / Article 6.4 supervisory authority (escalation crosses ALL tiers — total reversal / fraud / termination is always a market-integrity event). Hand-off to enforcement; replacement + buffer-replenishment to be pursued through the termination proceedings.',
  'escalated', '2025-08-15 08:00:00', '2025-08-18 09:00:00', '2025-09-10 09:00:00', '2025-10-01 09:00:00', '2025-10-08 09:00:00', 'admin'
);

-- ─── EVENTS ────────────────────────────────────────────────────────────────

-- crev_001 (reversal_reported)
INSERT OR IGNORE INTO oe_carbon_reversals_events (id, reversal_id, event_type, from_status, to_status, actor_id, actor_party, notes, created_at) VALUES
('crevv_001_a', 'crev_001', 'carbon_reversal.reversal_reported', null, 'reversal_reported', 'dev_k2c', 'proponent', 'Wildfire reversal reported — ~88,000 tCO2e burn-scar on K2C savanna block', '2026-05-26 07:00:00');

-- crev_002 (under_assessment)
INSERT OR IGNORE INTO oe_carbon_reversals_events (id, reversal_id, event_type, from_status, to_status, actor_id, actor_party, notes, created_at) VALUES
('crevv_002_a', 'crev_002', 'carbon_reversal.reversal_reported', null, 'reversal_reported', 'dev_ectrust', 'proponent', 'Drought die-back reversal reported on EC thicket', '2026-05-10 08:00:00'),
('crevv_002_b', 'crev_002', 'carbon_reversal.under_assessment', 'reversal_reported', 'under_assessment', 'oe_registry', 'registry', 'Assessment opened; VVB commissioned to ground-truth NDVI die-back', '2026-05-12 09:00:00');

-- crev_003 (loss_quantified)
INSERT OR IGNORE INTO oe_carbon_reversals_events (id, reversal_id, event_type, from_status, to_status, actor_id, actor_party, notes, created_at) VALUES
('crevv_003_a', 'crev_003', 'carbon_reversal.reversal_reported', null, 'reversal_reported', 'dev_ectrust', 'proponent', 'Pest/disease mortality reversal reported', '2026-04-15 08:00:00'),
('crevv_003_b', 'crev_003', 'carbon_reversal.under_assessment', 'reversal_reported', 'under_assessment', 'oe_registry', 'registry', 'Assessment opened', '2026-04-18 09:00:00'),
('crevv_003_c', 'crev_003', 'carbon_reversal.loss_quantified', 'under_assessment', 'loss_quantified', 'aenor_vvb', 'vvb', 'Loss quantified 15,800 tCO2e (VCS stock-difference); routes to buffer', '2026-04-28 09:00:00');

-- crev_004 (false_alarm)
INSERT OR IGNORE INTO oe_carbon_reversals_events (id, reversal_id, event_type, from_status, to_status, actor_id, actor_party, notes, created_at) VALUES
('crevv_004_a', 'crev_004', 'carbon_reversal.reversal_reported', null, 'reversal_reported', 'dev_ectrust', 'proponent', 'NDVI anomaly reported as suspected ~3,000 tCO2e die-back', '2026-03-20 08:00:00'),
('crevv_004_b', 'crev_004', 'carbon_reversal.under_assessment', 'reversal_reported', 'under_assessment', 'oe_registry', 'registry', 'Assessment opened to verify the satellite signal', '2026-03-22 09:00:00'),
('crevv_004_c', 'crev_004', 'carbon_reversal.false_alarm', 'under_assessment', 'false_alarm', 'oe_registry', 'registry', 'DISMISSED — seasonal phenology artefact, no carbon-stock loss', '2026-03-28 09:00:00');

-- crev_005 (buffer_cancelled)
INSERT OR IGNORE INTO oe_carbon_reversals_events (id, reversal_id, event_type, from_status, to_status, actor_id, actor_party, notes, created_at) VALUES
('crevv_005_a', 'crev_005', 'carbon_reversal.reversal_reported', null, 'reversal_reported', 'dev_k2c', 'proponent', 'Contained fire reversal reported', '2026-02-01 08:00:00'),
('crevv_005_b', 'crev_005', 'carbon_reversal.under_assessment', 'reversal_reported', 'under_assessment', 'oe_registry', 'registry', 'Assessment opened', '2026-02-03 09:00:00'),
('crevv_005_c', 'crev_005', 'carbon_reversal.loss_quantified', 'under_assessment', 'loss_quantified', 'aenor_vvb', 'vvb', 'Loss quantified 12,400 tCO2e via burn-scar stock difference', '2026-02-12 09:00:00'),
('crevv_005_d', 'crev_005', 'carbon_reversal.buffer_cancellation_proposed', 'loss_quantified', 'buffer_cancellation_proposed', 'oe_registry', 'registry', 'Proposed cancelling 12,400 buffer credits', '2026-02-18 09:00:00'),
('crevv_005_e', 'crev_005', 'carbon_reversal.buffer_cancelled', 'buffer_cancellation_proposed', 'buffer_cancelled', 'oe_registry', 'registry', 'Buffer cancelled 12,400 tCO2e from AFOLU pool; no penalty', '2026-02-25 09:00:00');

-- crev_006 (replacement_required — crosses regulator)
INSERT OR IGNORE INTO oe_carbon_reversals_events (id, reversal_id, event_type, from_status, to_status, actor_id, actor_party, notes, created_at) VALUES
('crevv_006_a', 'crev_006', 'carbon_reversal.reversal_reported', null, 'reversal_reported', 'oe_registry', 'registry', 'Suspected illegal-harvest reversal flagged on EC thicket', '2026-01-10 08:00:00'),
('crevv_006_b', 'crev_006', 'carbon_reversal.under_assessment', 'reversal_reported', 'under_assessment', 'oe_registry', 'registry', 'Forensic assessment opened', '2026-01-13 09:00:00'),
('crevv_006_c', 'crev_006', 'carbon_reversal.loss_quantified', 'under_assessment', 'loss_quantified', 'aenor_vvb', 'vvb', 'Loss quantified 48,000 tCO2e (harvested-area stock difference)', '2026-02-05 09:00:00'),
('crevv_006_d', 'crev_006', 'carbon_reversal.replacement_required', 'loss_quantified', 'replacement_required', 'oe_registry', 'registry', 'REPLACEMENT REQUIRED — intentional reversal; buffer preserved; regulator NOTIFIED (NERSA-NOTIFY-2026-0041)', '2026-02-20 09:00:00');

-- crev_007 (replacement_submitted)
INSERT OR IGNORE INTO oe_carbon_reversals_events (id, reversal_id, event_type, from_status, to_status, actor_id, actor_party, notes, created_at) VALUES
('crevv_007_a', 'crev_007', 'carbon_reversal.reversal_reported', null, 'reversal_reported', 'oe_registry', 'registry', 'Fire-management non-compliance reversal flagged', '2025-12-15 08:00:00'),
('crevv_007_b', 'crev_007', 'carbon_reversal.under_assessment', 'reversal_reported', 'under_assessment', 'oe_registry', 'registry', 'Assessment opened', '2025-12-18 09:00:00'),
('crevv_007_c', 'crev_007', 'carbon_reversal.loss_quantified', 'under_assessment', 'loss_quantified', 'aenor_vvb', 'vvb', 'Loss quantified 9,200 tCO2e (foregone early-burning reduction)', '2026-01-05 09:00:00'),
('crevv_007_d', 'crev_007', 'carbon_reversal.replacement_required', 'loss_quantified', 'replacement_required', 'oe_registry', 'registry', 'Replacement required (intentional non-compliance); regulator NOTIFIED', '2026-01-18 09:00:00'),
('crevv_007_e', 'crev_007', 'carbon_reversal.replacement_submitted', 'replacement_required', 'replacement_submitted', 'dev_k2c', 'proponent', 'Proponent submitted 9,200 tCO2e replacement credits (ZA-A6-2026-K2C-REPL)', '2026-02-08 09:00:00');

-- crev_008 (replacement_verified)
INSERT OR IGNORE INTO oe_carbon_reversals_events (id, reversal_id, event_type, from_status, to_status, actor_id, actor_party, notes, created_at) VALUES
('crevv_008_a', 'crev_008', 'carbon_reversal.reversal_reported', null, 'reversal_reported', 'oe_registry', 'registry', 'Boundary-encroachment grazing breach reversal flagged', '2025-11-01 08:00:00'),
('crevv_008_b', 'crev_008', 'carbon_reversal.under_assessment', 'reversal_reported', 'under_assessment', 'oe_registry', 'registry', 'Assessment opened', '2025-11-04 09:00:00'),
('crevv_008_c', 'crev_008', 'carbon_reversal.loss_quantified', 'under_assessment', 'loss_quantified', 'aenor_vvb', 'vvb', 'Loss quantified 7,600 tCO2e (encroached-area stock difference)', '2025-11-20 09:00:00'),
('crevv_008_d', 'crev_008', 'carbon_reversal.replacement_required', 'loss_quantified', 'replacement_required', 'oe_registry', 'registry', 'Replacement required (proponent-at-fault); regulator NOTIFIED', '2025-12-01 09:00:00'),
('crevv_008_e', 'crev_008', 'carbon_reversal.replacement_submitted', 'replacement_required', 'replacement_submitted', 'dev_ectrust', 'proponent', 'Submitted 7,600 tCO2e replacement credits', '2025-12-18 09:00:00'),
('crevv_008_f', 'crev_008', 'carbon_reversal.replacement_verified', 'replacement_submitted', 'replacement_verified', 'aenor_vvb', 'vvb', 'VERIFIED replacement: vintage equivalence + serial uniqueness confirmed', '2026-01-10 09:00:00');

-- crev_009 (closed — buffer-path full happy arc)
INSERT OR IGNORE INTO oe_carbon_reversals_events (id, reversal_id, event_type, from_status, to_status, actor_id, actor_party, notes, created_at) VALUES
('crevv_009_a', 'crev_009', 'carbon_reversal.reversal_reported', null, 'reversal_reported', 'dev_k2c', 'proponent', 'Lightning wildfire reversal reported', '2025-09-01 08:00:00'),
('crevv_009_b', 'crev_009', 'carbon_reversal.under_assessment', 'reversal_reported', 'under_assessment', 'oe_registry', 'registry', 'Assessment opened', '2025-09-04 09:00:00'),
('crevv_009_c', 'crev_009', 'carbon_reversal.loss_quantified', 'under_assessment', 'loss_quantified', 'aenor_vvb', 'vvb', 'Loss quantified 18,900 tCO2e; no proponent fault', '2025-09-18 09:00:00'),
('crevv_009_d', 'crev_009', 'carbon_reversal.buffer_cancellation_proposed', 'loss_quantified', 'buffer_cancellation_proposed', 'oe_registry', 'registry', 'Proposed cancelling 18,900 buffer credits', '2025-09-26 09:00:00'),
('crevv_009_e', 'crev_009', 'carbon_reversal.buffer_cancelled', 'buffer_cancellation_proposed', 'buffer_cancelled', 'oe_registry', 'registry', 'Buffer cancelled 18,900 tCO2e from AFOLU pool', '2025-10-05 09:00:00'),
('crevv_009_f', 'crev_009', 'carbon_reversal.remediation_verified', 'buffer_cancelled', 'remediation_verified', 'aenor_vvb', 'vvb', 'Remediation verified — site stabilised, regrowth plots re-established', '2025-11-02 09:00:00'),
('crevv_009_g', 'crev_009', 'carbon_reversal.closed', 'remediation_verified', 'closed', 'oe_registry', 'registry', 'CLOSED — buffer-absorbed; material reversal, registry-board notified', '2025-11-16 09:00:00');

-- crev_010 (escalated — crosses regulator)
INSERT OR IGNORE INTO oe_carbon_reversals_events (id, reversal_id, event_type, from_status, to_status, actor_id, actor_party, notes, created_at) VALUES
('crevv_010_a', 'crev_010', 'carbon_reversal.reversal_reported', null, 'reversal_reported', 'oe_registry', 'registry', 'Suspected total clearing + monitoring-fraud reversal flagged', '2025-08-15 08:00:00'),
('crevv_010_b', 'crev_010', 'carbon_reversal.under_assessment', 'reversal_reported', 'under_assessment', 'oe_registry', 'registry', 'Joint forensic assessment opened', '2025-08-18 09:00:00'),
('crevv_010_c', 'crev_010', 'carbon_reversal.loss_quantified', 'under_assessment', 'loss_quantified', 'aenor_vvb', 'vvb', 'Loss quantified 142,000 tCO2e — total reversal of the crediting block', '2025-09-10 09:00:00'),
('crevv_010_d', 'crev_010', 'carbon_reversal.escalated', 'loss_quantified', 'escalated', 'dffe_authority', 'authority', 'ESCALATED — total reversal + fraud → termination; regulator/Article 6.4 authority NOTIFIED (NERSA-TRIBUNAL-2025-0014)', '2025-10-01 09:00:00');
