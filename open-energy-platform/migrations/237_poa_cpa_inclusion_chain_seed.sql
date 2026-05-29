-- Wave 73 — Carbon PoA / CPA Inclusion & Conformance seed.
-- 10 CPAs poa_001..poa_010 spanning the lifecycle states (proposed, screening,
-- inclusion_review, included, monitoring, verified) and all four terminals
-- (rejected, withdrawn, excluded, completed), all five volume tiers, and the
-- three transfer types (voluntary, compliance, Article 6). The five reportable
-- cases prove the W73 signature: two large/mega inclusions (approve crosses for
-- large + mega), an Article 6 verification on a small raw volume floored to large
-- (corresponding adjustment required), a MEGA Article 6 DELISTING (exclude crosses
-- for EVERY tier — the distinctive W73 crossing), and a mega completion (reportable
-- by volume). reportable_total = 5. No apostrophes anywhere (D1 SQLite).

INSERT OR IGNORE INTO oe_poa_cpa_inclusions (
  id, cpa_number,
  source_event, source_entity_type, source_entity_id, source_wave,
  programme_id, programme_name, registry_standard, methodology_id, cpa_ref, cpa_name, proponent_party_id, proponent_party_name, coordinating_entity_name, dna_name, vvb_name, host_country, geo_key,
  transfer_type, cpa_tier, annual_er_tco2e, requires_corresponding_adjustment, corresponding_adjustment_ref,
  programme_cap_er_tco2e, included_er_tco2e, programme_headroom_tco2e, vintage_year, crediting_period_start, crediting_period_end,
  methodology_applicability, additionality_strength, monitoring_readiness, loa_confidence, eligibility_score, predicted_inclusion_days,
  screening_ref, methodology_ref, loa_ref, inclusion_ref, monitoring_ref, verification_ref, exclusion_ref, rejection_ref, withdrawal_ref, completion_ref, regulator_ref,
  proposal_basis, screening_basis, methodology_basis, loa_basis, inclusion_basis, monitoring_basis, verification_basis, exclusion_basis, rejection_basis, withdrawal_basis, completion_basis, reason_code, cpa_summary,
  monitoring_round,
  chain_status, cpa_proposed_at, eligibility_screening_at, methodology_check_at, loa_pending_at, inclusion_review_at, included_at, monitoring_at, verified_at, rejected_at, excluded_at, withdrawn_at, completed_at,
  is_reportable, sla_deadline_at, last_sla_breach_at, escalation_level, created_by
) VALUES
-- poa_001 micro voluntary — proposed, awaiting eligibility screening
('poa_001','CPA-2026-0001',
 'carbon_registration.registered','carbon_project_registration','reg_011','W37',
 'poa_drakensberg_mini_hydro','Drakensberg Mini-Hydro Programme','gold_standard','AMS-I.D','CPA-DKB-001','Bergville Run-of-River Unit 1','pp_011','Bergville Hydro Collective','OE Carbon Programme Desk','DFFE DNA','TUV SUD','South Africa','erf-dkb-1101',
 'voluntary','micro',800,0,NULL,
 50000,0,49200,2026,'2026-07-01','2033-06-30',
 0.8,0.7,0.75,0.7,75,48,
 NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,
 'Component activity proposed for inclusion in the registered mini-hydro programme.',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'Small run-of-river unit awaiting eligibility screening against the programme criteria.',
 0,
 'cpa_proposed','2026-05-20 08:00:00',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,
 0,'2026-05-25 08:00:00',NULL,0,'demo_carbon_001'),

-- poa_002 small voluntary — eligibility screening underway
('poa_002','CPA-2026-0002',
 'carbon_registration.registered','carbon_project_registration','reg_012','W37',
 'poa_eastern_cape_solar_homes','Eastern Cape Solar Home Programme','gold_standard','AMS-I.A','CPA-ECS-002','Mthatha Rooftop Cluster A','pp_012','Mthatha Solar Cooperative','OE Carbon Programme Desk','DFFE DNA','DNV','South Africa','erf-ecs-2200',
 'voluntary','small',5000,0,NULL,
 120000,30000,85000,2026,'2026-08-01','2033-07-31',
 0.85,0.75,0.8,0.7,79,68,
 'SCR-002',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,
 'Rooftop cluster proposed under the solar-home programme.','Eligibility screening underway against the approved small-scale methodology applicability conditions.',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'Cluster under eligibility screening; methodology applicability strong.',
 0,
 'eligibility_screening','2026-05-15 08:00:00','2026-05-18 09:00:00',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,
 0,'2026-05-25 09:00:00',NULL,0,'demo_carbon_001'),

-- poa_003 medium compliance — rejected at methodology check
('poa_003','CPA-2026-0003',
 'carbon_registration.registered','carbon_project_registration','reg_013','W37',
 'poa_kzn_biogas','KwaZulu Biogas Digester Programme','cdm','AMS-III.D','CPA-KZB-003','Pietermaritzburg Digester 3','pp_013','KZN Agri Biogas','OE Carbon Programme Desk','DFFE DNA','SGS','South Africa','erf-kzb-3300',
 'compliance','medium',45000,0,NULL,
 200000,80000,75000,2025,'2026-06-01','2033-05-31',
 0.4,0.45,0.6,0.7,50,100,
 'SCR-003','METH-003',NULL,NULL,NULL,NULL,NULL,'REJ-003',NULL,NULL,NULL,
 'Digester proposed under the biogas programme.','Screened; eligibility marginal.','Methodology applicability check failed: baseline scenario not consistent with the approved AMS-III.D conditions.',NULL,NULL,NULL,NULL,NULL,'Rejected at methodology check for a non-conforming baseline.',NULL,NULL,'methodology_nonconformance','CPA rejected; baseline did not meet methodology applicability.',
 0,
 'rejected','2026-04-01 08:00:00','2026-04-04 09:00:00','2026-04-10 10:00:00',NULL,NULL,NULL,NULL,NULL,'2026-04-15 11:00:00',NULL,NULL,NULL,
 0,NULL,NULL,0,'demo_carbon_001'),

-- poa_004 small voluntary — withdrawn while awaiting the LoA
('poa_004','CPA-2026-0004',
 'carbon_registration.registered','carbon_project_registration','reg_014','W37',
 'poa_limpopo_cookstoves','Limpopo Efficient Cookstove Programme','gold_standard','AMS-II.G','CPA-LCS-004','Polokwane Cookstove Batch 4','pp_014','Limpopo Clean Cooking','OE Carbon Programme Desk','DFFE DNA','TUV NORD','South Africa','erf-lcs-4400',
 'voluntary','small',7000,0,NULL,
 90000,40000,43000,2026,'2026-09-01','2033-08-31',
 0.8,0.7,0.65,0.5,70,68,
 'SCR-004','METH-004',NULL,NULL,NULL,NULL,NULL,NULL,'WD-004',NULL,NULL,
 'Cookstove batch proposed under the cookstove programme.','Screened and passed.','Methodology applicability confirmed.','Letter of Approval requested from the host-country DNA.',NULL,NULL,NULL,NULL,NULL,'Proponent withdrew the CPA pending commercial restructuring of the distribution model.',NULL,'proponent_withdrawal','CPA withdrawn by the proponent while awaiting the host-country LoA.',
 0,
 'withdrawn','2026-03-10 08:00:00','2026-03-13 09:00:00','2026-03-20 10:00:00','2026-03-28 11:00:00',NULL,NULL,NULL,NULL,NULL,NULL,'2026-04-05 12:00:00',NULL,
 0,NULL,NULL,0,'demo_carbon_001'),

-- poa_005 medium voluntary — inclusion review with LoA in hand
('poa_005','CPA-2026-0005',
 'carbon_registration.registered','carbon_project_registration','reg_015','W37',
 'poa_western_cape_wind_smes','Western Cape SME Wind Programme','verra_vcs','VMR0006','CPA-WCW-005','Saldanha SME Turbine 5','pp_015','Saldanha Community Wind','OE Carbon Programme Desk','DFFE DNA','Aster Global','South Africa','erf-wcw-5500',
 'voluntary','medium',60000,0,NULL,
 250000,90000,100000,2026,'2026-07-15','2033-07-14',
 0.9,0.85,0.8,0.85,86,100,
 'SCR-005','METH-005','LOA-005','INC-005',NULL,NULL,NULL,NULL,NULL,NULL,NULL,
 'SME turbine proposed under the community-wind programme.','Screened and passed with a high eligibility score.','Methodology applicability confirmed under VMR0006.','Host-country LoA received.','Inclusion request submitted; under coordinating-entity review.',NULL,NULL,NULL,NULL,NULL,NULL,NULL,'CPA under inclusion review with the LoA in hand.',
 0,
 'inclusion_review','2026-04-20 08:00:00','2026-04-23 09:00:00','2026-04-30 10:00:00','2026-05-05 11:00:00','2026-05-18 12:00:00',NULL,NULL,NULL,NULL,NULL,NULL,NULL,
 0,'2026-06-08 12:00:00',NULL,0,'demo_carbon_001'),

-- poa_006 large voluntary — included (REPORTABLE: large-tier inclusion crosses)
('poa_006','CPA-2026-0006',
 'carbon_registration.registered','carbon_project_registration','reg_016','W37',
 'poa_mpumalanga_solar_utility','Mpumalanga Utility Solar Programme','verra_vcs','VM0042','CPA-MPS-006','Witbank Solar Block 6','pp_016','Highveld Solar Partners','OE Carbon Programme Desk','DFFE DNA','DNV','South Africa','erf-mps-6600',
 'voluntary','large',250000,0,NULL,
 1000000,400000,350000,2026,'2026-06-01','2033-05-31',
 0.9,0.8,0.85,0.9,86,139,
 'SCR-006','METH-006','LOA-006','INC-006',NULL,NULL,NULL,NULL,NULL,NULL,'REG-POA-006',
 'Utility solar block proposed under the programme.','Screened and passed.','Methodology applicability confirmed.','Host-country LoA received.','Inclusion approved; large-tier inclusion notified to the DFFE DNA as it expands the accredited programme scope.',NULL,NULL,NULL,NULL,NULL,NULL,NULL,'Large CPA included in the programme; inclusion reported to the regulator.',
 0,
 'included','2026-03-01 08:00:00','2026-03-05 09:00:00','2026-03-12 10:00:00','2026-03-20 11:00:00','2026-04-10 12:00:00','2026-05-01 13:00:00',NULL,NULL,NULL,NULL,NULL,NULL,
 1,'2026-06-15 13:00:00',NULL,0,'demo_carbon_001'),

-- poa_007 large voluntary — first monitoring period (REPORTABLE: large)
('poa_007','CPA-2026-0007',
 'carbon_mrv.issuance','carbon_mrv','mrv_017','W11',
 'poa_northern_cape_csp','Northern Cape CSP Programme','cdm','ACM0030','CPA-NCC-007','Pofadder CSP Train 7','pp_017','Pofadder Solar Thermal','OE Carbon Programme Desk','DFFE DNA','SGS','South Africa','erf-ncc-7700',
 'voluntary','large',300000,0,NULL,
 1500000,600000,600000,2025,'2025-06-01','2032-05-31',
 0.88,0.82,0.9,0.85,86,139,
 'SCR-007','METH-007','LOA-007','INC-007','MON-007',NULL,NULL,NULL,NULL,NULL,'REG-POA-007',
 'CSP train proposed under the programme.','Screened and passed.','Methodology applicability confirmed under ACM0030.','Host-country LoA received.','Inclusion approved and notified to the regulator.','First monitoring period underway; the data acquisition system is live.',NULL,NULL,NULL,NULL,NULL,NULL,'Included large CPA in its first monitoring period.',
 1,
 'monitoring','2025-04-01 08:00:00','2025-04-05 09:00:00','2025-04-12 10:00:00','2025-04-20 11:00:00','2025-05-10 12:00:00','2025-06-01 13:00:00','2025-06-15 14:00:00',NULL,NULL,NULL,NULL,NULL,
 1,'2026-03-12 14:00:00',NULL,0,'demo_carbon_001'),

-- poa_008 article6 (raw small, floored to large) — verified (REPORTABLE: requiresCA)
('poa_008','CPA-2026-0008',
 'carbon_mrv.issuance','carbon_mrv','mrv_018','W11',
 'poa_free_state_biomass','Free State Biomass Programme','gold_standard','AMS-I.C','CPA-FSB-008','Bethlehem Biomass Unit 8','pp_018','Free State Bioenergy','OE Carbon Programme Desk','DFFE DNA','TUV SUD','South Africa','erf-fsb-8800',
 'article6','large',600,1,'CA-AUTH-ZA-008',
 80000,20000,59400,2026,'2026-04-01','2033-03-31',
 0.85,0.8,0.8,0.9,83,139,
 'SCR-008','METH-008','LOA-008','INC-008','MON-008','VER-008',NULL,NULL,NULL,NULL,'REG-POA-008',
 'Small biomass unit proposed under an Article 6 cooperative programme.','Screened and passed.','Methodology applicability confirmed.','Host-country LoA received with an Article 6 corresponding-adjustment authorisation.','Inclusion approved; Article 6 corresponding adjustment notified to the DFFE DNA.','Monitoring period completed.','VVB verified the period; the corresponding adjustment is to be applied to the host NDC.',NULL,NULL,NULL,NULL,NULL,'Article 6 CPA verified; corresponding adjustment required despite a small raw volume (floored to large).',
 1,
 'verified','2026-01-10 08:00:00','2026-01-13 09:00:00','2026-01-20 10:00:00','2026-02-01 11:00:00','2026-02-20 12:00:00','2026-03-10 13:00:00','2026-03-15 14:00:00','2026-05-20 15:00:00',NULL,NULL,NULL,NULL,
 1,'2026-07-04 15:00:00',NULL,0,'demo_carbon_001'),

-- poa_009 mega article6 — EXCLUDED (REPORTABLE: a delisting is always reportable — W73 SIGNATURE)
('poa_009','CPA-2026-0009',
 'carbon_mrv.issuance','carbon_mrv','mrv_019','W11',
 'poa_gauteng_landfill_gas','Gauteng Landfill Gas Programme','cdm','ACM0001','CPA-GLG-009','Johannesburg Landfill Flare 9','pp_019','Gauteng Waste-to-Energy','OE Carbon Programme Desk','DFFE DNA','DNV','South Africa','erf-glg-9900',
 'article6','mega',600000,1,'CA-AUTH-ZA-009',
 2000000,1200000,200000,2024,'2024-06-01','2031-05-31',
 0.6,0.5,0.55,0.7,58,207,
 'SCR-009','METH-009','LOA-009','INC-009','MON-009','VER-009','EXC-009',NULL,NULL,NULL,'REG-POA-009',
 'Landfill gas flare proposed under the Article 6 programme.','Screened and passed.','Methodology applicability confirmed under ACM0001.','Host-country LoA received with a corresponding-adjustment authorisation.','Inclusion approved and reported to the regulator.','Monitored across two periods.','Verified in the prior period.','CPA delisted from the programme: methane flaring ceased and the measurement system failed the conformance re-test; the corresponding adjustment is to be reversed and the delisting reported to the DFFE DNA.',NULL,NULL,NULL,'nonconformance_delisting','Mega Article 6 CPA EXCLUDED for non-conformance; a delisting is always reportable.',
 2,
 'excluded','2024-04-01 08:00:00','2024-04-05 09:00:00','2024-04-15 10:00:00','2024-05-01 11:00:00','2024-05-20 12:00:00','2024-06-10 13:00:00','2024-06-20 14:00:00','2024-12-15 15:00:00',NULL,'2026-05-22 16:00:00',NULL,NULL,
 1,NULL,NULL,1,'demo_carbon_001'),

-- poa_010 mega voluntary — completed at end of crediting (REPORTABLE: mega)
('poa_010','CPA-2026-0010',
 'carbon_mrv.issuance','carbon_mrv','mrv_020','W11',
 'poa_eastern_cape_wind_utility','Eastern Cape Utility Wind Programme','verra_vcs','VM0042','CPA-ECW-010','Cookhouse Wind Block 10','pp_020','Cookhouse Wind Partners','OE Carbon Programme Desk','DFFE DNA','SGS','South Africa','erf-ecw-1010',
 'voluntary','mega',750000,0,NULL,
 3000000,2000000,250000,2024,'2019-06-01','2026-05-31',
 0.92,0.88,0.9,0.9,90,207,
 'SCR-010','METH-010','LOA-010','INC-010','MON-010','VER-010',NULL,NULL,NULL,'CMP-010','REG-POA-010',
 'Utility wind block proposed under the programme.','Screened and passed.','Methodology applicability confirmed.','Host-country LoA received.','Inclusion approved and reported to the regulator at mega tier.','Monitored across the full crediting period.','Verified each period.',NULL,NULL,NULL,'CPA reached the end of its crediting period under the programme and was completed.','crediting_period_end','Mega CPA completed at the end of crediting under the programme.',
 7,
 'completed','2019-05-01 08:00:00','2019-05-05 09:00:00','2019-05-15 10:00:00','2019-06-01 11:00:00','2019-06-20 12:00:00','2019-07-10 13:00:00','2019-07-20 14:00:00','2025-12-15 15:00:00',NULL,NULL,NULL,'2026-05-15 16:00:00',
 1,NULL,NULL,0,'demo_carbon_001');

INSERT OR IGNORE INTO oe_poa_cpa_inclusions_events (
  id, inclusion_id, event_type, from_status, to_status, actor_id, actor_party, notes, created_at
) VALUES
('poa_evt_001','poa_002','carbon_poa.eligibility_screening','cpa_proposed','eligibility_screening','demo_carbon_001','coordinating_entity','Eligibility screening started.','2026-05-18 09:00:00'),
('poa_evt_002','poa_003','carbon_poa.eligibility_screening','cpa_proposed','eligibility_screening','demo_carbon_001','coordinating_entity','Eligibility screening started.','2026-04-04 09:00:00'),
('poa_evt_003','poa_003','carbon_poa.methodology_check','eligibility_screening','methodology_check','demo_carbon_001','coordinating_entity','Methodology applicability check.','2026-04-10 10:00:00'),
('poa_evt_004','poa_003','carbon_poa.rejected','methodology_check','rejected','demo_carbon_001','coordinating_entity','Rejected for a non-conforming baseline.','2026-04-15 11:00:00'),
('poa_evt_005','poa_004','carbon_poa.loa_pending','methodology_check','loa_pending','demo_carbon_001','dna','Host-country LoA requested.','2026-03-28 11:00:00'),
('poa_evt_006','poa_004','carbon_poa.withdrawn','loa_pending','withdrawn','demo_carbon_001','proponent','Proponent withdrew the CPA.','2026-04-05 12:00:00'),
('poa_evt_007','poa_005','carbon_poa.loa_pending','methodology_check','loa_pending','demo_carbon_001','dna','Host-country LoA requested.','2026-05-05 11:00:00'),
('poa_evt_008','poa_005','carbon_poa.inclusion_review','loa_pending','inclusion_review','demo_carbon_001','proponent','Inclusion request submitted.','2026-05-18 12:00:00'),
('poa_evt_009','poa_006','carbon_poa.inclusion_review','loa_pending','inclusion_review','demo_carbon_001','proponent','Inclusion request submitted.','2026-04-10 12:00:00'),
('poa_evt_010','poa_006','carbon_poa.included','inclusion_review','included','demo_carbon_001','coordinating_entity','Inclusion approved; large-tier inclusion reported to the DFFE DNA.','2026-05-01 13:00:00'),
('poa_evt_011','poa_007','carbon_poa.included','inclusion_review','included','demo_carbon_001','coordinating_entity','Inclusion approved and reported to the regulator.','2025-06-01 13:00:00'),
('poa_evt_012','poa_007','carbon_poa.monitoring','included','monitoring','demo_carbon_001','proponent','First monitoring period started.','2025-06-15 14:00:00'),
('poa_evt_013','poa_008','carbon_poa.monitoring','included','monitoring','demo_carbon_001','proponent','Monitoring period started.','2026-03-15 14:00:00'),
('poa_evt_014','poa_008','carbon_poa.verified','monitoring','verified','demo_carbon_001','vvb','VVB verified the period; the Article 6 corresponding adjustment is to be applied.','2026-05-20 15:00:00'),
('poa_evt_015','poa_009','carbon_poa.included','inclusion_review','included','demo_carbon_001','coordinating_entity','Inclusion approved and reported.','2024-06-10 13:00:00'),
('poa_evt_016','poa_009','carbon_poa.monitoring','included','monitoring','demo_carbon_001','proponent','Monitoring started.','2024-06-20 14:00:00'),
('poa_evt_017','poa_009','carbon_poa.verified','monitoring','verified','demo_carbon_001','vvb','Verified the prior period.','2024-12-15 15:00:00'),
('poa_evt_018','poa_009','carbon_poa.excluded','verified','excluded','demo_carbon_001','coordinating_entity','CPA delisted for non-conformance; the delisting was reported to the DFFE DNA.','2026-05-22 16:00:00'),
('poa_evt_019','poa_010','carbon_poa.monitoring','included','monitoring','demo_carbon_001','proponent','Monitoring started.','2019-07-20 14:00:00'),
('poa_evt_020','poa_010','carbon_poa.verified','monitoring','verified','demo_carbon_001','vvb','Verified the final period.','2025-12-15 15:00:00'),
('poa_evt_021','poa_010','carbon_poa.completed','verified','completed','demo_carbon_001','coordinating_entity','CPA completed at the end of crediting.','2026-05-15 16:00:00');
