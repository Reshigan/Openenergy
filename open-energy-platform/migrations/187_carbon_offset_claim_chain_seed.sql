-- Wave 48 — Carbon Tax Offset Claim & Allowance lifecycle seed data.
-- 10 prod-realistic cases across 10 of 12 states (omits standalone claim_submitted
-- and applied_to_return — both traversed inside the coc_004/006/007/008/009 arcs)
-- + 3 tiers. Large SA carbon-tax-liable emitters claiming retired domestic
-- credits against their s.13 offset allowance via SARS eFiling, with COAS doing
-- the eligibility screening + credit lock.
-- Cross-wave provenance: a W17 retirement (ret_007) yields the eligible credits
-- behind the coc_007 reconciled flagship; a W42 reversal (rev_002) of previously
-- issued credits triggers the coc_009 SARS clawback.
-- offset_value_zar = credits_claimed_tco2e * ct_rate, capped at offset_limit_zar
-- (= gross * pct). coc_004 demonstrates the s.13 cap binding (credits_unused>0).

-- 1) claim_drafted — minor, general (5%), fresh draft
INSERT OR IGNORE INTO oe_carbon_offset_claims (
  id, claim_number,
  taxpayer_party_id, taxpayer_party_name, registry_name, sars_office_name,
  tax_year, industry_group, offset_tier,
  gross_tax_liability_zar, offset_limit_pct, offset_limit_zar, ct_rate_zar_per_tco2e,
  credits_claimed_tco2e, offset_value_zar, net_tax_liability_zar, credits_unused_tco2e,
  coas_reference, claim_summary, eligibility_basis,
  chain_status, claim_drafted_at, sla_deadline_at, created_by
) VALUES (
  'coc_001', 'CTO-2025-0001',
  'tp_tongaat', 'Tongaat Hulett Limited', 'DFFE Carbon Offset Administration System', 'SARS Large Business Centre (Durban)',
  2025, 'general', 'minor_claim',
  20000000.0, 5, 1000000.0, 236.0,
  3000.0, 708000.0, 19292000.0, 0.0,
  'COAS-2025-3310', 'Tongaat Hulett drafting a 2025 carbon-tax offset claim using 3,000 tCO2e of retired Lebombo biomass-cogeneration credits against an estimated R20m gross liability.',
  'Draft eligibility check: credits are SA-located biomass-cogeneration reductions retired under the taxpayer name in COAS; vintage 2024 within the s.13 window; not from an activity already in the carbon-tax net. Pending formal COAS screening.',
  'claim_drafted', '2026-05-26 09:00:00', '2026-05-29 09:00:00', 'demo_carbon_001'
);

-- 2) eligibility_screening — standard, general (5%), COAS screening underway
INSERT OR IGNORE INTO oe_carbon_offset_claims (
  id, claim_number,
  taxpayer_party_id, taxpayer_party_name, registry_name, sars_office_name,
  tax_year, industry_group, offset_tier,
  gross_tax_liability_zar, offset_limit_pct, offset_limit_zar, ct_rate_zar_per_tco2e,
  credits_claimed_tco2e, offset_value_zar, net_tax_liability_zar, credits_unused_tco2e,
  coas_reference, claim_summary, eligibility_basis,
  chain_status, claim_drafted_at, eligibility_screening_at, sla_deadline_at, created_by
) VALUES (
  'coc_002', 'CTO-2025-0002',
  'tp_ppc', 'PPC Limited', 'DFFE Carbon Offset Administration System', 'SARS Large Business Centre (Johannesburg)',
  2025, 'general', 'standard_claim',
  120000000.0, 5, 6000000.0, 236.0,
  20000.0, 4720000.0, 115280000.0, 0.0,
  'COAS-2025-2980', 'PPC cement claiming 20,000 tCO2e of retired Western Cape landfill-gas credits against an R120m gross liability.',
  'COAS eligibility screening underway: confirming the landfill-gas project is SA-registered, the credits were retired in the taxpayer name, the vintage falls within the prescribed window, and the activity is not otherwise covered by the carbon tax. Serial ranges being matched against the COAS retirement ledger.',
  'eligibility_screening', '2026-05-18 09:00:00', '2026-05-20 09:00:00', '2026-06-03 09:00:00', 'demo_carbon_001'
);

-- 3) credits_earmarked — major, annex_2 (10%), credits locked in COAS
INSERT OR IGNORE INTO oe_carbon_offset_claims (
  id, claim_number,
  taxpayer_party_id, taxpayer_party_name, registry_name, sars_office_name,
  tax_year, industry_group, offset_tier,
  gross_tax_liability_zar, offset_limit_pct, offset_limit_zar, ct_rate_zar_per_tco2e,
  credits_claimed_tco2e, offset_value_zar, net_tax_liability_zar, credits_unused_tco2e,
  coas_reference, retirement_ref, claim_summary, eligibility_basis, earmark_basis,
  chain_status, claim_drafted_at, eligibility_screening_at, credits_earmarked_at, sla_deadline_at, created_by
) VALUES (
  'coc_003', 'CTO-2025-0003',
  'tp_exxaro', 'Exxaro Resources Limited', 'DFFE Carbon Offset Administration System', 'SARS Large Business Centre (Pretoria)',
  2025, 'annex_2', 'major_claim',
  300000000.0, 10, 30000000.0, 236.0,
  60000.0, 14160000.0, 285840000.0, 0.0,
  'COAS-2025-2710', 'RET-2025-0091', 'Exxaro (coal mining, Annex-2 10% allowance) earmarking 60,000 tCO2e of retired Limpopo renewable-energy credits against an R300m gross liability.',
  'COAS confirmed eligibility: SA-located grid-connected renewable credits, retired under the Exxaro name, vintage within window, additionality verified, not double-counted against any REIPPPP obligation.',
  'COAS locked 60,000 tCO2e (RET-2025-0091) against the Exxaro 2025 tax period — the credits are now reserved and cannot be re-applied to another period or taxpayer.',
  'credits_earmarked', '2026-05-10 09:00:00', '2026-05-12 09:00:00', '2026-05-18 09:00:00', '2026-06-01 09:00:00', 'demo_carbon_001'
);

-- 4) sars_review — major, annex_2 (10%), s.13 CAP BINDING (credits_unused>0); SLA BREACHED
INSERT OR IGNORE INTO oe_carbon_offset_claims (
  id, claim_number,
  taxpayer_party_id, taxpayer_party_name, registry_name, sars_office_name,
  tax_year, industry_group, offset_tier,
  gross_tax_liability_zar, offset_limit_pct, offset_limit_zar, ct_rate_zar_per_tco2e,
  credits_claimed_tco2e, offset_value_zar, net_tax_liability_zar, credits_unused_tco2e,
  coas_reference, retirement_ref, sars_reference,
  claim_summary, eligibility_basis, earmark_basis, submission_basis, review_basis,
  chain_status, claim_drafted_at, eligibility_screening_at, credits_earmarked_at, claim_submitted_at, sars_review_at, sla_deadline_at, created_by
) VALUES (
  'coc_004', 'CTO-2024-0014',
  'tp_glencore', 'Glencore Operations South Africa (Pty) Ltd', 'DFFE Carbon Offset Administration System', 'SARS Large Business Centre (Johannesburg)',
  2024, 'annex_2', 'major_claim',
  100000000.0, 10, 10000000.0, 190.0,
  90000.0, 10000000.0, 90000000.0, 37368.42,
  'COAS-2024-1880', 'RET-2024-0220', 'SARS-CT-2024-0440',
  'Glencore claimed 90,000 tCO2e but the s.13 10% cap (R10m) binds: only 52,631.58 tCO2e of offset value can be applied, leaving 37,368.42 tCO2e unused for the period.',
  'COAS confirmed all 90,000 tCO2e eligible.',
  'COAS locked 90,000 tCO2e (RET-2024-0220).',
  'Taxpayer submitted the claim with the 2024 carbon-tax return via SARS eFiling. Offset value of R17.1m requested but flagged against the R10m s.13 ceiling.',
  'SARS review of a large Annex-2 claim: verifying the s.13 cap application (R10m ceiling binds; 37,368.42 tCO2e cannot be applied this period), confirming the COAS retirement serials, and checking the credits are not attributable to a tax-covered activity. Review running past its window.',
  'sars_review', '2026-03-01 09:00:00', '2026-03-05 09:00:00', '2026-03-12 09:00:00', '2026-03-18 09:00:00', '2026-03-22 09:00:00', '2026-05-06 09:00:00', 'demo_carbon_001'
);

-- 5) sars_query — standard, general (5%), SARS raised an RFI; SLA BREACHED
INSERT OR IGNORE INTO oe_carbon_offset_claims (
  id, claim_number,
  taxpayer_party_id, taxpayer_party_name, registry_name, sars_office_name,
  tax_year, industry_group, offset_tier,
  gross_tax_liability_zar, offset_limit_pct, offset_limit_zar, ct_rate_zar_per_tco2e,
  credits_claimed_tco2e, offset_value_zar, net_tax_liability_zar, credits_unused_tco2e,
  coas_reference, retirement_ref, sars_reference, query_ref,
  claim_summary, eligibility_basis, earmark_basis, submission_basis, review_basis, query_basis,
  chain_status, claim_drafted_at, eligibility_screening_at, credits_earmarked_at, claim_submitted_at, sars_review_at, sars_query_at, query_round, sla_deadline_at, created_by
) VALUES (
  'coc_005', 'CTO-2025-0021',
  'tp_sappi', 'Sappi Southern Africa Limited', 'DFFE Carbon Offset Administration System', 'SARS Large Business Centre (Durban)',
  2025, 'general', 'standard_claim',
  80000000.0, 5, 4000000.0, 236.0,
  12000.0, 2832000.0, 77168000.0, 0.0,
  'COAS-2025-3120', 'RET-2025-0140', 'SARS-CT-2025-0710', 'RFI-2025-0710',
  'Sappi claiming 12,000 tCO2e of retired KwaZulu-Natal afforestation credits against an R80m liability; SARS raised a query on the project vintage.',
  'COAS confirmed eligibility.',
  'COAS locked 12,000 tCO2e (RET-2025-0140).',
  'Taxpayer submitted the claim with the 2025 carbon-tax return.',
  'SARS commenced review.',
  'SARS raised a request-for-information: the afforestation project crediting period straddles a methodology revision, and SARS asked the taxpayer to confirm that the claimed vintages fall under the approved, post-revision baseline. Taxpayer assembling the COAS issuance records and the validation report in response.',
  'sars_query', '2026-03-20 09:00:00', '2026-03-24 09:00:00', '2026-03-30 09:00:00', '2026-04-05 09:00:00', '2026-04-09 09:00:00', '2026-04-12 09:00:00', 1, '2026-04-26 09:00:00', 'demo_carbon_001'
);

-- 6) allowance_granted — major, annex_2 (10%), SARS granted; CROSSES regulator (grant major)
INSERT OR IGNORE INTO oe_carbon_offset_claims (
  id, claim_number,
  taxpayer_party_id, taxpayer_party_name, registry_name, sars_office_name,
  tax_year, industry_group, offset_tier,
  gross_tax_liability_zar, offset_limit_pct, offset_limit_zar, ct_rate_zar_per_tco2e,
  credits_claimed_tco2e, offset_value_zar, net_tax_liability_zar, credits_unused_tco2e,
  coas_reference, retirement_ref, sars_reference, allowance_ref,
  claim_summary, eligibility_basis, earmark_basis, submission_basis, review_basis, allowance_basis, reason_code,
  chain_status, claim_drafted_at, eligibility_screening_at, credits_earmarked_at, claim_submitted_at, sars_review_at, allowance_granted_at, is_reportable, sla_deadline_at, created_by
) VALUES (
  'coc_006', 'CTO-2024-0031',
  'tp_sasol', 'Sasol South Africa Limited', 'DFFE Carbon Offset Administration System', 'SARS Large Business Centre (Johannesburg)',
  2024, 'annex_2', 'major_claim',
  500000000.0, 10, 50000000.0, 190.0,
  100000.0, 19000000.0, 481000000.0, 0.0,
  'COAS-2024-1450', 'RET-2024-0066', 'SARS-CT-2024-0205', 'ALW-2024-0205',
  'Sasol (petrochemical, Annex-2) granted an R19m offset allowance for 100,000 tCO2e of retired credits against an R500m gross liability.',
  'COAS confirmed eligibility of the 100,000 tCO2e.',
  'COAS locked 100,000 tCO2e (RET-2024-0066) against the Sasol 2024 period.',
  'Taxpayer submitted the claim with the 2024 carbon-tax return; offset value R19m well within the R50m s.13 ceiling.',
  'SARS reviewed the large Annex-2 claim, verified the COAS serials and the non-overlap with tax-covered activities.',
  'SARS GRANTED the R19m offset allowance (ALW-2024-0205). NOTIFIED to DFFE COAS / regulator — a major offset utilisation (>=R10m) is reportable. Taxpayer to apply the allowance to the carbon-tax return.',
  'major_offset_granted', 'allowance_granted', '2026-04-15 09:00:00', '2026-04-18 09:00:00', '2026-04-24 09:00:00', '2026-04-30 09:00:00', '2026-05-06 09:00:00', '2026-05-20 09:00:00', 1, '2026-06-19 09:00:00', 'demo_carbon_001'
);

-- 7) reconciled — standard, general (5%), FULL HAPPY ARC (traverses claim_submitted + applied_to_return); W17 ret_007 provenance
INSERT OR IGNORE INTO oe_carbon_offset_claims (
  id, claim_number,
  source_event, source_entity_type, source_entity_id, source_wave,
  taxpayer_party_id, taxpayer_party_name, registry_name, sars_office_name,
  tax_year, industry_group, offset_tier,
  gross_tax_liability_zar, offset_limit_pct, offset_limit_zar, ct_rate_zar_per_tco2e,
  credits_claimed_tco2e, offset_value_zar, net_tax_liability_zar, credits_unused_tco2e,
  coas_reference, retirement_ref, sars_reference, allowance_ref, return_ref, assessment_ref,
  claim_summary, eligibility_basis, earmark_basis, submission_basis, review_basis, allowance_basis, reconciliation_basis, reason_code,
  chain_status, claim_drafted_at, eligibility_screening_at, credits_earmarked_at, claim_submitted_at, sars_review_at, allowance_granted_at, applied_to_return_at, reconciled_at, created_by
) VALUES (
  'coc_007', 'CTO-2024-0007',
  'carbon_retirement.retired', 'carbon_retirement', 'ret_007', 'W17',
  'tp_amsa', 'ArcelorMittal South Africa Limited', 'DFFE Carbon Offset Administration System', 'SARS Large Business Centre (Pretoria)',
  2024, 'general', 'standard_claim',
  150000000.0, 5, 7500000.0, 190.0,
  30000.0, 5700000.0, 144300000.0, 0.0,
  'COAS-2024-1120', 'RET-2024-0007', 'SARS-CT-2024-0102', 'ALW-2024-0102', 'CTR-2024-0102', 'ASMT-2024-0102',
  'ArcelorMittal SA full arc: 30,000 tCO2e of retired credits (W17 ret_007) yielded an R5.7m offset allowance, applied to the 2024 return and reconciled to the SARS assessment.',
  'COAS confirmed eligibility of the W17-retired credits.',
  'COAS locked 30,000 tCO2e (RET-2024-0007 / W17 ret_007).',
  'Taxpayer submitted the claim with the 2024 carbon-tax return; R5.7m within the R7.5m ceiling.',
  'SARS reviewed and verified the COAS serials.',
  'SARS GRANTED the R5.7m allowance (ALW-2024-0102).',
  'Taxpayer applied the allowance to the 2024 carbon-tax return and SARS RECONCILED the net liability of R144.3m to the final assessment (ASMT-2024-0102). Claim closed — credits permanently consumed against the 2024 period.',
  'offset_reconciled', 'reconciled', '2026-01-10 09:00:00', '2026-01-13 09:00:00', '2026-01-18 09:00:00', '2026-01-24 09:00:00', '2026-02-05 09:00:00', '2026-03-10 09:00:00', '2026-04-05 09:00:00', '2026-04-30 09:00:00', 'admin'
);

-- 8) rejected — major, annex_2 (10%), SARS rejected ineligible credits; CROSSES (reject material)
INSERT OR IGNORE INTO oe_carbon_offset_claims (
  id, claim_number,
  taxpayer_party_id, taxpayer_party_name, registry_name, sars_office_name,
  tax_year, industry_group, offset_tier,
  gross_tax_liability_zar, offset_limit_pct, offset_limit_zar, ct_rate_zar_per_tco2e,
  credits_claimed_tco2e, offset_value_zar, net_tax_liability_zar, credits_unused_tco2e,
  coas_reference, sars_reference, rejection_basis, reason_code,
  claim_summary, eligibility_basis, earmark_basis, submission_basis, review_basis,
  chain_status, claim_drafted_at, eligibility_screening_at, credits_earmarked_at, claim_submitted_at, sars_review_at, rejected_at, is_reportable, created_by
) VALUES (
  'coc_008', 'CTO-2025-0048',
  'tp_engen', 'Engen Petroleum Limited', 'DFFE Carbon Offset Administration System', 'SARS Large Business Centre (Cape Town)',
  2025, 'annex_2', 'major_claim',
  350000000.0, 10, 35000000.0, 236.0,
  70000.0, 16520000.0, 350000000.0, 0.0,
  'COAS-2025-2510', 'SARS-CT-2025-0188',
  'SARS REJECTED the claim: a material portion of the credits originate from an activity ALREADY covered by the carbon tax (own-fleet fuel switching at the refinery), which is expressly excluded from the s.13 offset (no double benefit). The remaining credits could not independently substantiate the claimed quantum. NOTIFIED to regulator (major rejection — dispute / objection risk).',
  'tax_covered_activity_excluded',
  'Engen (refining, Annex-2) claimed 70,000 tCO2e (R16.52m) but SARS found the credits arose from a tax-covered own-activity — rejected.',
  'COAS screening passed on the serials but flagged the project boundary for SARS attention.',
  'COAS locked 70,000 tCO2e pending SARS confirmation.',
  'Taxpayer submitted the claim with the 2025 carbon-tax return.',
  'SARS review found the underlying reductions came from fuel switching within the refinery — an activity already in the carbon-tax net — which s.13 excludes from the offset.',
  'rejected', '2026-04-01 09:00:00', '2026-04-04 09:00:00', '2026-04-10 09:00:00', '2026-04-16 09:00:00', '2026-04-22 09:00:00', '2026-05-15 09:00:00', 1, 'demo_carbon_001'
);

-- 9) clawed_back — major, annex_2 (10%), FULL ARC then SARS clawback via W42 rev_002; CROSSES ALL tiers
INSERT OR IGNORE INTO oe_carbon_offset_claims (
  id, claim_number,
  source_event, source_entity_type, source_entity_id, source_wave,
  taxpayer_party_id, taxpayer_party_name, registry_name, sars_office_name,
  tax_year, industry_group, offset_tier,
  gross_tax_liability_zar, offset_limit_pct, offset_limit_zar, ct_rate_zar_per_tco2e,
  credits_claimed_tco2e, offset_value_zar, net_tax_liability_zar, credits_unused_tco2e,
  coas_reference, retirement_ref, sars_reference, allowance_ref, return_ref, clawback_ref, reversal_ref,
  claim_summary, eligibility_basis, earmark_basis, submission_basis, review_basis, allowance_basis, clawback_basis, reason_code,
  chain_status, claim_drafted_at, eligibility_screening_at, credits_earmarked_at, claim_submitted_at, sars_review_at, allowance_granted_at, applied_to_return_at, clawed_back_at, is_reportable, escalation_level, created_by
) VALUES (
  'coc_009', 'CTO-2024-0052',
  'carbon_reversal.replacement_required', 'carbon_reversal', 'rev_002', 'W42',
  'tp_amplats', 'Anglo American Platinum Limited', 'DFFE Carbon Offset Administration System', 'SARS Large Business Centre (Pretoria)',
  2024, 'annex_2', 'major_claim',
  600000000.0, 10, 60000000.0, 190.0,
  120000.0, 22800000.0, 577200000.0, 0.0,
  'COAS-2024-0980', 'RET-2024-0033', 'SARS-CT-2024-0260', 'ALW-2024-0260', 'CTR-2024-0260', 'CLB-2024-0260', 'REV-2024-0002',
  'Anglo American Platinum was granted an R22.8m allowance for 120,000 tCO2e of AFOLU credits, applied to the 2024 return — but SARS CLAWED BACK the allowance after a W42 reversal (rev_002) of the underlying credits.',
  'COAS confirmed eligibility at the time of claim.',
  'COAS locked 120,000 tCO2e (RET-2024-0033) against the 2024 period.',
  'Taxpayer submitted the claim with the 2024 carbon-tax return; R22.8m within the R60m ceiling.',
  'SARS reviewed and verified the COAS serials at the time.',
  'SARS GRANTED the R22.8m allowance (ALW-2024-0260); taxpayer applied it to the 2024 return.',
  'SARS CLAWED BACK the R22.8m allowance: a W42 non-permanence reversal (rev_002) of the underlying AFOLU credits — a forestry project loss event — invalidated the retirement that supported the offset. The credits no longer represent a permanent reduction, so the allowance is recovered with understatement exposure. NOTIFIED to regulator (a clawback crosses ALL tiers — the universal hard line). Revised 2024 net liability reinstated.',
  'reversal_triggered_clawback', 'clawed_back', '2025-09-01 09:00:00', '2025-09-04 09:00:00', '2025-09-10 09:00:00', '2025-09-18 09:00:00', '2025-10-02 09:00:00', '2025-11-05 09:00:00', '2025-12-10 09:00:00', '2026-05-22 09:00:00', 1, 1, 'admin'
);

-- 10) withdrawn — minor, general (5%), taxpayer withdrew before submission
INSERT OR IGNORE INTO oe_carbon_offset_claims (
  id, claim_number,
  taxpayer_party_id, taxpayer_party_name, registry_name, sars_office_name,
  tax_year, industry_group, offset_tier,
  gross_tax_liability_zar, offset_limit_pct, offset_limit_zar, ct_rate_zar_per_tco2e,
  credits_claimed_tco2e, offset_value_zar, net_tax_liability_zar, credits_unused_tco2e,
  coas_reference, eligibility_basis, earmark_basis, reason_code, claim_summary,
  chain_status, claim_drafted_at, eligibility_screening_at, credits_earmarked_at, withdrawn_at, created_by
) VALUES (
  'coc_010', 'CTO-2025-0066',
  'tp_distell', 'Distell Group Holdings Limited', 'DFFE Carbon Offset Administration System', 'SARS Large Business Centre (Cape Town)',
  2025, 'general', 'minor_claim',
  15000000.0, 5, 750000.0, 236.0,
  2500.0, 590000.0, 14410000.0, 0.0,
  'COAS-2025-3400',
  'COAS screening flagged that part of the small credit parcel had an unresolved double-claim marker against a prior period.',
  'COAS placed a provisional lock on 2,500 tCO2e pending resolution of the double-claim marker.',
  'taxpayer_withdrew_double_claim_risk',
  'Distell drafted a minor 2,500 tCO2e claim (R590k) but WITHDREW it after COAS flagged a double-claim risk on part of the parcel.',
  'withdrawn', '2026-04-28 09:00:00', '2026-05-02 09:00:00', '2026-05-06 09:00:00', '2026-05-10 09:00:00', 'demo_carbon_001'
);

-- ─── EVENTS ────────────────────────────────────────────────────────────────

-- coc_001 (claim_drafted)
INSERT OR IGNORE INTO oe_carbon_offset_claims_events (id, claim_id, event_type, from_status, to_status, actor_id, actor_party, notes, created_at) VALUES
('cocv_001_a', 'coc_001', 'carbon_offset_claim.claim_drafted', null, 'claim_drafted', 'demo_carbon_001', 'taxpayer', 'Tongaat Hulett drafted a 3,000 tCO2e offset claim (R708k) against the 2025 liability', '2026-05-26 09:00:00');

-- coc_002 (eligibility_screening)
INSERT OR IGNORE INTO oe_carbon_offset_claims_events (id, claim_id, event_type, from_status, to_status, actor_id, actor_party, notes, created_at) VALUES
('cocv_002_a', 'coc_002', 'carbon_offset_claim.claim_drafted', null, 'claim_drafted', 'demo_carbon_001', 'taxpayer', 'PPC drafted a 20,000 tCO2e claim against the 2025 liability', '2026-05-18 09:00:00'),
('cocv_002_b', 'coc_002', 'carbon_offset_claim.eligibility_screening', 'claim_drafted', 'eligibility_screening', 'demo_carbon_001', 'registry', 'COAS screening the landfill-gas credits for s.13 eligibility', '2026-05-20 09:00:00');

-- coc_003 (credits_earmarked)
INSERT OR IGNORE INTO oe_carbon_offset_claims_events (id, claim_id, event_type, from_status, to_status, actor_id, actor_party, notes, created_at) VALUES
('cocv_003_a', 'coc_003', 'carbon_offset_claim.claim_drafted', null, 'claim_drafted', 'demo_carbon_001', 'taxpayer', 'Exxaro drafted a 60,000 tCO2e Annex-2 claim against the 2025 liability', '2026-05-10 09:00:00'),
('cocv_003_b', 'coc_003', 'carbon_offset_claim.eligibility_screening', 'claim_drafted', 'eligibility_screening', 'demo_carbon_001', 'registry', 'COAS screening eligibility', '2026-05-12 09:00:00'),
('cocv_003_c', 'coc_003', 'carbon_offset_claim.credits_earmarked', 'eligibility_screening', 'credits_earmarked', 'demo_carbon_001', 'registry', 'COAS locked 60,000 tCO2e (RET-2025-0091) against the Exxaro 2025 period', '2026-05-18 09:00:00');

-- coc_004 (sars_review — traverses claim_submitted)
INSERT OR IGNORE INTO oe_carbon_offset_claims_events (id, claim_id, event_type, from_status, to_status, actor_id, actor_party, notes, created_at) VALUES
('cocv_004_a', 'coc_004', 'carbon_offset_claim.claim_drafted', null, 'claim_drafted', 'demo_carbon_001', 'taxpayer', 'Glencore drafted a 90,000 tCO2e Annex-2 claim against the 2024 liability', '2026-03-01 09:00:00'),
('cocv_004_b', 'coc_004', 'carbon_offset_claim.eligibility_screening', 'claim_drafted', 'eligibility_screening', 'demo_carbon_001', 'registry', 'COAS screening eligibility', '2026-03-05 09:00:00'),
('cocv_004_c', 'coc_004', 'carbon_offset_claim.credits_earmarked', 'eligibility_screening', 'credits_earmarked', 'demo_carbon_001', 'registry', 'COAS locked 90,000 tCO2e (RET-2024-0220)', '2026-03-12 09:00:00'),
('cocv_004_d', 'coc_004', 'carbon_offset_claim.claim_submitted', 'credits_earmarked', 'claim_submitted', 'tp_glencore', 'taxpayer', 'Submitted with the 2024 return; R17.1m requested against the R10m s.13 ceiling', '2026-03-18 09:00:00'),
('cocv_004_e', 'coc_004', 'carbon_offset_claim.sars_review', 'claim_submitted', 'sars_review', 'sars_ct', 'sars', 'SARS reviewing the s.13 cap application (R10m ceiling binds; 37,368.42 tCO2e unused) and the COAS serials', '2026-03-22 09:00:00');

-- coc_005 (sars_query — query loop)
INSERT OR IGNORE INTO oe_carbon_offset_claims_events (id, claim_id, event_type, from_status, to_status, actor_id, actor_party, notes, created_at) VALUES
('cocv_005_a', 'coc_005', 'carbon_offset_claim.claim_drafted', null, 'claim_drafted', 'demo_carbon_001', 'taxpayer', 'Sappi drafted a 12,000 tCO2e afforestation claim against the 2025 liability', '2026-03-20 09:00:00'),
('cocv_005_b', 'coc_005', 'carbon_offset_claim.eligibility_screening', 'claim_drafted', 'eligibility_screening', 'demo_carbon_001', 'registry', 'COAS screening eligibility', '2026-03-24 09:00:00'),
('cocv_005_c', 'coc_005', 'carbon_offset_claim.credits_earmarked', 'eligibility_screening', 'credits_earmarked', 'demo_carbon_001', 'registry', 'COAS locked 12,000 tCO2e (RET-2025-0140)', '2026-03-30 09:00:00'),
('cocv_005_d', 'coc_005', 'carbon_offset_claim.claim_submitted', 'credits_earmarked', 'claim_submitted', 'tp_sappi', 'taxpayer', 'Submitted with the 2025 return', '2026-04-05 09:00:00'),
('cocv_005_e', 'coc_005', 'carbon_offset_claim.sars_review', 'claim_submitted', 'sars_review', 'sars_ct', 'sars', 'SARS commenced review', '2026-04-09 09:00:00'),
('cocv_005_f', 'coc_005', 'carbon_offset_claim.sars_query', 'sars_review', 'sars_query', 'sars_ct', 'sars', 'SARS raised an RFI on the afforestation vintage straddling a methodology revision', '2026-04-12 09:00:00');

-- coc_006 (allowance_granted — crosses on grant)
INSERT OR IGNORE INTO oe_carbon_offset_claims_events (id, claim_id, event_type, from_status, to_status, actor_id, actor_party, notes, created_at) VALUES
('cocv_006_a', 'coc_006', 'carbon_offset_claim.claim_drafted', null, 'claim_drafted', 'demo_carbon_001', 'taxpayer', 'Sasol drafted a 100,000 tCO2e Annex-2 claim against the 2024 liability', '2026-04-15 09:00:00'),
('cocv_006_b', 'coc_006', 'carbon_offset_claim.eligibility_screening', 'claim_drafted', 'eligibility_screening', 'demo_carbon_001', 'registry', 'COAS screening eligibility', '2026-04-18 09:00:00'),
('cocv_006_c', 'coc_006', 'carbon_offset_claim.credits_earmarked', 'eligibility_screening', 'credits_earmarked', 'demo_carbon_001', 'registry', 'COAS locked 100,000 tCO2e (RET-2024-0066)', '2026-04-24 09:00:00'),
('cocv_006_d', 'coc_006', 'carbon_offset_claim.claim_submitted', 'credits_earmarked', 'claim_submitted', 'tp_sasol', 'taxpayer', 'Submitted with the 2024 return; R19m within the R50m ceiling', '2026-04-30 09:00:00'),
('cocv_006_e', 'coc_006', 'carbon_offset_claim.sars_review', 'claim_submitted', 'sars_review', 'sars_ct', 'sars', 'SARS reviewing the large Annex-2 claim', '2026-05-06 09:00:00'),
('cocv_006_f', 'coc_006', 'carbon_offset_claim.allowance_granted', 'sars_review', 'allowance_granted', 'sars_ct', 'sars', 'SARS GRANTED the R19m allowance (ALW-2024-0205). Major offset utilisation NOTIFIED to regulator.', '2026-05-20 09:00:00');

-- coc_007 (reconciled — FULL happy arc; traverses claim_submitted + applied_to_return; W17 ret_007)
INSERT OR IGNORE INTO oe_carbon_offset_claims_events (id, claim_id, event_type, from_status, to_status, actor_id, actor_party, notes, created_at) VALUES
('cocv_007_a', 'coc_007', 'carbon_offset_claim.claim_drafted', null, 'claim_drafted', 'admin', 'taxpayer', 'ArcelorMittal SA drafted a 30,000 tCO2e claim using W17 ret_007 credits against the 2024 liability', '2026-01-10 09:00:00'),
('cocv_007_b', 'coc_007', 'carbon_offset_claim.eligibility_screening', 'claim_drafted', 'eligibility_screening', 'admin', 'registry', 'COAS screening the W17-retired credits', '2026-01-13 09:00:00'),
('cocv_007_c', 'coc_007', 'carbon_offset_claim.credits_earmarked', 'eligibility_screening', 'credits_earmarked', 'admin', 'registry', 'COAS locked 30,000 tCO2e (RET-2024-0007 / W17 ret_007)', '2026-01-18 09:00:00'),
('cocv_007_d', 'coc_007', 'carbon_offset_claim.claim_submitted', 'credits_earmarked', 'claim_submitted', 'tp_amsa', 'taxpayer', 'Submitted with the 2024 return; R5.7m within the R7.5m ceiling', '2026-01-24 09:00:00'),
('cocv_007_e', 'coc_007', 'carbon_offset_claim.sars_review', 'claim_submitted', 'sars_review', 'sars_ct', 'sars', 'SARS reviewed and verified the COAS serials', '2026-02-05 09:00:00'),
('cocv_007_f', 'coc_007', 'carbon_offset_claim.allowance_granted', 'sars_review', 'allowance_granted', 'sars_ct', 'sars', 'SARS GRANTED the R5.7m allowance (ALW-2024-0102)', '2026-03-10 09:00:00'),
('cocv_007_g', 'coc_007', 'carbon_offset_claim.applied_to_return', 'allowance_granted', 'applied_to_return', 'tp_amsa', 'taxpayer', 'Taxpayer applied the R5.7m allowance to the 2024 carbon-tax return (net R144.3m)', '2026-04-05 09:00:00'),
('cocv_007_h', 'coc_007', 'carbon_offset_claim.reconciled', 'applied_to_return', 'reconciled', 'sars_ct', 'sars', 'SARS RECONCILED the net liability to the final assessment (ASMT-2024-0102). Credits permanently consumed.', '2026-04-30 09:00:00');

-- coc_008 (rejected — crosses; reject material)
INSERT OR IGNORE INTO oe_carbon_offset_claims_events (id, claim_id, event_type, from_status, to_status, actor_id, actor_party, notes, created_at) VALUES
('cocv_008_a', 'coc_008', 'carbon_offset_claim.claim_drafted', null, 'claim_drafted', 'demo_carbon_001', 'taxpayer', 'Engen drafted a 70,000 tCO2e Annex-2 claim against the 2025 liability', '2026-04-01 09:00:00'),
('cocv_008_b', 'coc_008', 'carbon_offset_claim.eligibility_screening', 'claim_drafted', 'eligibility_screening', 'demo_carbon_001', 'registry', 'COAS screening; flagged the project boundary', '2026-04-04 09:00:00'),
('cocv_008_c', 'coc_008', 'carbon_offset_claim.credits_earmarked', 'eligibility_screening', 'credits_earmarked', 'demo_carbon_001', 'registry', 'COAS locked 70,000 tCO2e pending SARS confirmation', '2026-04-10 09:00:00'),
('cocv_008_d', 'coc_008', 'carbon_offset_claim.claim_submitted', 'credits_earmarked', 'claim_submitted', 'tp_engen', 'taxpayer', 'Submitted with the 2025 return', '2026-04-16 09:00:00'),
('cocv_008_e', 'coc_008', 'carbon_offset_claim.sars_review', 'claim_submitted', 'sars_review', 'sars_ct', 'sars', 'SARS review found the reductions came from a tax-covered own-activity', '2026-04-22 09:00:00'),
('cocv_008_f', 'coc_008', 'carbon_offset_claim.rejected', 'sars_review', 'rejected', 'sars_ct', 'sars', 'SARS REJECTED — s.13 excludes credits from an activity already in the carbon-tax net. NOTIFIED to regulator (major rejection).', '2026-05-15 09:00:00');

-- coc_009 (clawed_back — FULL arc then clawback via W42 rev_002; crosses ALL)
INSERT OR IGNORE INTO oe_carbon_offset_claims_events (id, claim_id, event_type, from_status, to_status, actor_id, actor_party, notes, created_at) VALUES
('cocv_009_a', 'coc_009', 'carbon_offset_claim.claim_drafted', null, 'claim_drafted', 'admin', 'taxpayer', 'Anglo American Platinum drafted a 120,000 tCO2e AFOLU claim against the 2024 liability', '2025-09-01 09:00:00'),
('cocv_009_b', 'coc_009', 'carbon_offset_claim.eligibility_screening', 'claim_drafted', 'eligibility_screening', 'admin', 'registry', 'COAS screening eligibility', '2025-09-04 09:00:00'),
('cocv_009_c', 'coc_009', 'carbon_offset_claim.credits_earmarked', 'eligibility_screening', 'credits_earmarked', 'admin', 'registry', 'COAS locked 120,000 tCO2e (RET-2024-0033)', '2025-09-10 09:00:00'),
('cocv_009_d', 'coc_009', 'carbon_offset_claim.claim_submitted', 'credits_earmarked', 'claim_submitted', 'tp_amplats', 'taxpayer', 'Submitted with the 2024 return; R22.8m within the R60m ceiling', '2025-09-18 09:00:00'),
('cocv_009_e', 'coc_009', 'carbon_offset_claim.sars_review', 'claim_submitted', 'sars_review', 'sars_ct', 'sars', 'SARS reviewed and verified the COAS serials at the time', '2025-10-02 09:00:00'),
('cocv_009_f', 'coc_009', 'carbon_offset_claim.allowance_granted', 'sars_review', 'allowance_granted', 'sars_ct', 'sars', 'SARS GRANTED the R22.8m allowance (ALW-2024-0260)', '2025-11-05 09:00:00'),
('cocv_009_g', 'coc_009', 'carbon_offset_claim.applied_to_return', 'allowance_granted', 'applied_to_return', 'tp_amplats', 'taxpayer', 'Taxpayer applied the R22.8m allowance to the 2024 return', '2025-12-10 09:00:00'),
('cocv_009_h', 'coc_009', 'carbon_offset_claim.clawed_back', 'applied_to_return', 'clawed_back', 'sars_ct', 'sars', 'SARS CLAWED BACK the R22.8m: a W42 reversal (rev_002) invalidated the underlying AFOLU credits. NOTIFIED to regulator (clawback crosses ALL tiers).', '2026-05-22 09:00:00');

-- coc_010 (withdrawn — pre-submission)
INSERT OR IGNORE INTO oe_carbon_offset_claims_events (id, claim_id, event_type, from_status, to_status, actor_id, actor_party, notes, created_at) VALUES
('cocv_010_a', 'coc_010', 'carbon_offset_claim.claim_drafted', null, 'claim_drafted', 'demo_carbon_001', 'taxpayer', 'Distell drafted a minor 2,500 tCO2e claim (R590k) against the 2025 liability', '2026-04-28 09:00:00'),
('cocv_010_b', 'coc_010', 'carbon_offset_claim.eligibility_screening', 'claim_drafted', 'eligibility_screening', 'demo_carbon_001', 'registry', 'COAS screening flagged a double-claim marker on part of the parcel', '2026-05-02 09:00:00'),
('cocv_010_c', 'coc_010', 'carbon_offset_claim.credits_earmarked', 'eligibility_screening', 'credits_earmarked', 'demo_carbon_001', 'registry', 'COAS placed a provisional lock pending resolution', '2026-05-06 09:00:00'),
('cocv_010_d', 'coc_010', 'carbon_offset_claim.withdrawn', 'credits_earmarked', 'withdrawn', 'tp_distell', 'taxpayer', 'Taxpayer WITHDREW the claim after the double-claim risk surfaced', '2026-05-10 09:00:00');
