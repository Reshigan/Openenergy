-- Live backfill: Envera carbon Meridian-chain tables (oe_carbon_issuances /
-- oe_ccp_assessments / oe_carbon_credit_rating). Already-onboarded orgs do NOT
-- re-fire onboarding activation, so this mirrors seedCarbonRetrospective() in
-- src/cascade-rules/historic-retrospective.ts for the one live carbon fund.
-- Derived from the real cr_gonxt_solar_001 registration + the single verified
-- mrv_envera_2024 (1317.5 tCO2e, 2024 vintage). INSERT OR IGNORE keeps it
-- idempotent and id-compatible with any future cascade fire.
-- ponytail: hand-mirrored SQL (the established live-backfill pattern); both
-- sides derive from the same registration+MRV, so drift risk is low.

-- 1. Issuance (issued) — verified 2024 vintage minted to the registry.
INSERT OR IGNORE INTO oe_carbon_issuances
  (id, issuance_number, project_id, project_name, registry_standard, methodology_id,
   proponent_party_id, proponent_party_name, host_country, transfer_type, category,
   issuance_tier, requested_tco2e, requires_corresponding_adjustment, vintage_year,
   monitoring_period_start, monitoring_period_end, verified_tco2e, buffer_pct,
   buffer_contribution_tco2e, net_issuable_tco2e, serial_block_start, serial_block_end,
   serial_block_size, serial_number_prefix, screened_flag, verification_check_ok_flag,
   serials_assigned_flag, submitted_to_registry_flag, issued_flag, double_issuance_guard_ok,
   issuance_summary, chain_status, requested_at, screening_at, verification_check_at,
   serialization_at, pending_registry_at, issued_at, created_by, created_at, updated_at)
VALUES
  ('iss_gonxt_solar_00_v2024', 'ISS-GS-2024-gonxt_so', 'cr_gonxt_solar_001',
   'GoNXT private-wire solar portfolio', 'gold_standard', 'GS TPDDTEC',
   'p_live_gonxt', 'GoNXT Energy', 'ZA', 'voluntary', 'energy',
   'minor', 1317.5, 0, 2024,
   '2024-03-01', '2024-12-31', 1317.5, 0,
   0, 1317.5, 1, 1318,
   1318, 'GS-ZA-2024', 1, 1,
   1, 1, 1, 1,
   'Verified 2024 vintage issued to registry: 1317.5 tCO2e (no buffer, non-AFOLU renewable). Derived from verified MRV on onboarding.',
   'issued', '2024-03-01', '2024-03-01', '2024-12-31',
   '2024-12-31', '2024-12-31', '2024-12-31T00:00:00Z', 'p_live_envera', datetime('now'), datetime('now'));

-- 2. CCP quality assessment (ccp_label_granted) — high-integrity label.
INSERT OR IGNORE INTO oe_ccp_assessments
  (id, assessment_number, project_id, project_name, registry_standard, methodology_id,
   proponent_party_id, proponent_party_name, vvb_name, host_country, sector, assessment_tier,
   assessed_annual_tco2e, effective_governance_score, tracking_system_score, transparency_score,
   robust_quantification_score, no_double_counting_score, permanence_score, additionality_score,
   sustainable_development_score, transition_to_net_zero_score, safeguards_score, label_class,
   ccp_aggregate_score, sylvera_grade_equivalent, corsia_phase2_eligible_flag, screened_flag,
   eligibility_check_ok_flag, assessment_complete_flag, vvb_review_complete_flag, decision_made_flag,
   assessment_summary, chain_status, requested_at, screening_at, eligibility_check_at,
   assessment_in_progress_at, vvb_review_at, ccp_decision_pending_at, ccp_label_granted_at,
   created_by, created_at, updated_at)
VALUES
  ('ccp_gonxt_solar_00_v2024', 'CCP-GS-2024-gonxt_so', 'cr_gonxt_solar_001',
   'GoNXT private-wire solar portfolio', 'gold_standard', 'GS TPDDTEC',
   'p_live_gonxt', 'GoNXT Energy', 'SGS', 'ZA', 'renewable_energy', 'minor',
   1581, 0.90, 0.92, 0.91,
   0.89, 0.95, 0.93, 0.88,
   0.86, 0.90, 0.91, 'ccp_eligible',
   0.90, 'A', 1, 1,
   1, 1, 1, 1,
   'CCP high-integrity label granted for the 2024 issued vintage; meets all 10 Core Carbon Principles (aggregate 0.90).',
   'ccp_label_granted', '2024-03-01', '2024-03-01', '2024-03-01',
   '2024-12-31', '2024-12-31', '2024-12-31', '2024-12-31',
   'p_live_envera', datetime('now'), datetime('now'));

-- 3. Rating (monitoring) — issued credits under ongoing surveillance.
INSERT OR IGNORE INTO oe_carbon_credit_rating
  (id, rating_number, project_id, project_name, issuer_id, issuer_name, rater_id, rater_name,
   credit_vintage_year, scope_scale_tonnes, methodology_id, methodology_name, registry_name,
   methodology_score, additionality_score, permanence_score, leakage_score, cobenefit_score,
   composite_score, rating_band, current_tier, ccp_aligned_project, icroa_aligned,
   rating_completeness_index, narrative, chain_status, rating_requested_at, desk_review_at,
   methodology_score_at, additionality_score_at, permanence_score_at, leakage_score_at,
   cobenefit_score_at, composite_score_at, published_at, monitoring_at,
   created_by, created_at, updated_at)
VALUES
  ('rate_gonxt_solar_00_v2024', 'CRR-GS-2024-gonxt_so', 'cr_gonxt_solar_001',
   'GoNXT private-wire solar portfolio', 'p_live_envera', 'Envera Capital Carbon',
   'p_live_envera', 'Sylvera', 2024, 1317.5, 'GS TPDDTEC', 'GS TPDDTEC', 'gold_standard',
   0.89, 0.88, 0.93, 0.92, 0.86,
   0.90, 'AA', 'standard', 1, 1,
   0.95, 'Issued 2024 vintage rated AA (composite 0.90); under monitoring surveillance.',
   'monitoring', '2024-03-01', '2024-03-01',
   '2024-12-31', '2024-12-31', '2024-12-31', '2024-12-31',
   '2024-12-31', '2024-12-31', '2024-12-31', '2024-12-31',
   'p_live_envera', datetime('now'), datetime('now'));
