-- Wave 56 — Carbon Crediting-Period Renewal & Baseline Reassessment seed.
-- 10 renewals cpr_001..cpr_010 spanning 10 distinct lifecycle states, all five
-- issuance tiers (two each), and the renew / refuse / revision / lapse-window
-- branches. Standards span Verra VCS, Gold Standard, Article 6.4 and CDM. The
-- three reportable cases prove the W56 signature: a renewed case with a baseline
-- reduction of thirty five percent (renew crosses for EVERY tier when the
-- downgrade is >= 30), a refused major case, and a mega renewal-window SLA breach.
-- reportable_total = 3. No apostrophes anywhere (D1 SQLite).

INSERT OR IGNORE INTO oe_crediting_period_renewals (
  id, renewal_number, source_event, source_entity_type, source_entity_id, source_wave,
  project_id, project_name, registry_standard, methodology_id, vvb_name, proponent_party_id, proponent_party_name,
  issuance_tier, annual_issuance_tco2e, crediting_period_number, current_period_start, current_period_end, renewed_period_start, renewed_period_end,
  original_baseline_tco2e, revised_baseline_tco2e, baseline_reduction_pct, additionality_outcome,
  application_ref, completeness_ref, vvb_report_ref, decision_ref, refusal_ref,
  submission_basis, completeness_basis, revision_basis, baseline_basis, additionality_basis, validation_basis, decision_basis, refusal_basis, reason_code, renewal_summary,
  chain_status, renewal_due_at, application_submitted_at, completeness_check_at, revision_requested_at, baseline_reassessment_at, additionality_retest_at, vvb_validation_at, standard_review_at, renewed_at, refused_at, withdrawn_at, lapsed_at,
  revision_round, sla_deadline_at, last_sla_breach_at, is_reportable, escalation_level, created_by
) VALUES
-- cpr_001 minor — application submitted, awaiting completeness check
('cpr_001','CPR-2026-0001','carbon_registration.registered','carbon_project_registration','reg_001','W37',
 'proj_karoo_solar','Karoo Solar Cluster Phase One','verra_vcs','VM0042','Aster Global Verification','pp_001','Karoo Renewables',
 'minor',5200,2,'2019-06-01','2026-05-31',NULL,NULL,
 5200,NULL,NULL,NULL,
 'APP-CPR-001',NULL,NULL,NULL,NULL,
 'Crediting period expiring within twelve months; renewal application filed under VCS v4.',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,
 'application_submitted','2026-03-01 08:00:00','2026-03-10 09:00:00',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,
 0,'2026-04-09 09:00:00',NULL,0,0,'demo_carbon_001'),

-- cpr_002 minor — RENEWED with a thirty five percent baseline downgrade (REPORTABLE: renew crosses for every tier when reduction >= 30)
('cpr_002','CPR-2026-0002','carbon_mrv.issuance','carbon_mrv','mrv_014','W11',
 'proj_coega_wind','Coega Wind Repower','gold_standard','GS-RE-01','Verdant Assurance','pp_002','Coega Wind Partners',
 'minor',6000,2,'2016-04-01','2026-03-31','2026-04-01','2033-03-31',
 6000,3900,35,'additional',
 'APP-CPR-002','COMP-002','VVB-002','DEC-002',NULL,
 'Renewal filed ahead of period expiry.','Submission complete on first review.',NULL,'Grid emission factor declined sharply; baseline reassessed downward by thirty five percent.','Investment analysis confirms the activity remains additional.','Independent VVB validated the reassessed baseline.','Standard approved renewal under the reduced baseline.',NULL,'baseline_downgrade','Renewed for a second crediting period with a materially reduced baseline.',
 'renewed','2026-01-05 08:00:00','2026-01-12 09:00:00','2026-01-20 10:00:00',NULL,'2026-02-02 11:00:00','2026-02-15 12:00:00','2026-03-01 13:00:00','2026-03-15 14:00:00','2026-03-28 15:00:00',NULL,NULL,NULL,
 0,NULL,NULL,1,0,'demo_carbon_001'),

-- cpr_003 moderate — completeness check underway
('cpr_003','CPR-2026-0003','carbon_registration.registered','carbon_project_registration','reg_003','W37',
 'proj_upington_pv','Upington PV Extension','verra_vcs','VM0042','Aster Global Verification','pp_003','Upington Solar Trust',
 'moderate',52000,2,'2018-09-01','2026-08-31',NULL,NULL,
 52000,NULL,NULL,NULL,
 'APP-CPR-003','COMP-003',NULL,NULL,NULL,
 'Renewal application submitted under VCS v4.','Completeness check underway on the renewal dossier.',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,
 'completeness_check','2026-04-01 08:00:00','2026-04-10 09:00:00','2026-04-20 10:00:00',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,
 0,'2026-06-19 10:00:00',NULL,0,0,'demo_carbon_001'),

-- cpr_004 moderate — baseline reassessment in progress (CDM third renewal)
('cpr_004','CPR-2026-0004','carbon_registration.registered','carbon_project_registration','reg_004','W37',
 'proj_kzn_biomass','KwaZulu Biomass Plant','cdm','ACM0006','Verdant Assurance','pp_004','KZN Bioenergy',
 'moderate',88000,3,'2019-01-01','2026-12-31',NULL,NULL,
 88000,NULL,NULL,NULL,
 'APP-CPR-004','COMP-004',NULL,NULL,NULL,
 'Third renewal filed under the CDM seven year crediting period.','Completeness confirmed.',NULL,'Reassessing baseline against current grid and technology diffusion data.',NULL,NULL,NULL,NULL,NULL,NULL,
 'baseline_reassessment','2026-02-01 08:00:00','2026-02-12 09:00:00','2026-02-25 10:00:00',NULL,'2026-03-10 11:00:00',NULL,NULL,NULL,NULL,NULL,NULL,NULL,
 0,'2026-03-31 11:00:00',NULL,0,0,'demo_carbon_001'),

-- cpr_005 material — additionality retest in progress
('cpr_005','CPR-2026-0005','carbon_registration.registered','carbon_project_registration','reg_005','W37',
 'proj_drakensberg_hydro','Drakensberg Small Hydro','gold_standard','GS-RE-02','Aster Global Verification','pp_005','Drakensberg Hydro',
 'material',260000,2,'2017-07-01','2026-06-30',NULL,NULL,
 260000,234000,10,NULL,
 'APP-CPR-005','COMP-005',NULL,NULL,NULL,
 'Renewal filed under Gold Standard for the Global Goals.','Completeness confirmed.',NULL,'Baseline reassessed downward by ten percent on the current grid factor.','Additionality retest in progress.',NULL,NULL,NULL,NULL,NULL,
 'additionality_retest','2026-01-15 08:00:00','2026-01-25 09:00:00','2026-02-05 10:00:00',NULL,'2026-02-20 11:00:00','2026-03-05 12:00:00',NULL,NULL,NULL,NULL,NULL,NULL,
 0,'2026-04-04 12:00:00',NULL,0,0,'demo_carbon_001'),

-- cpr_006 material — VVB validating the reassessed baseline
('cpr_006','CPR-2026-0006','carbon_mrv.issuance','carbon_mrv','mrv_022','W11',
 'proj_jhb_landfill','Johannesburg Landfill Gas','verra_vcs','VM0001','Verdant Assurance','pp_006','Joburg Gas Capture',
 'material',410000,2,'2018-03-01','2026-02-28',NULL,NULL,
 420000,357000,15,'additional',
 'APP-CPR-006','COMP-006','VVB-006',NULL,NULL,
 'Renewal filed ahead of expiry.','Completeness confirmed.',NULL,'Baseline reassessed downward by fifteen percent.','Additionality confirmed on investment analysis.','Independent VVB validating the reassessed baseline and additionality.',NULL,NULL,NULL,NULL,
 'vvb_validation','2025-12-01 08:00:00','2025-12-12 09:00:00','2025-12-22 10:00:00',NULL,'2026-01-10 11:00:00','2026-01-28 12:00:00','2026-02-15 13:00:00',NULL,NULL,NULL,NULL,NULL,
 0,'2026-03-22 13:00:00',NULL,0,0,'demo_carbon_001'),

-- cpr_007 major — standard review under way (Article 6.4 Supervisory Body)
('cpr_007','CPR-2026-0007','carbon_registration.registered','carbon_project_registration','reg_007','W37',
 'proj_pofadder_csp','Pofadder Concentrated Solar','article_6_4','A6.4-RE-01','Aster Global Verification','pp_007','Pofadder CSP',
 'major',1200000,2,'2017-01-01','2025-12-31',NULL,NULL,
 1200000,1080000,10,'additional',
 'APP-CPR-007','COMP-007','VVB-007',NULL,NULL,
 'Renewal filed under the Article 6.4 Mechanism.','Completeness confirmed.',NULL,'Baseline reassessed downward by ten percent.','Additionality confirmed.','VVB validated the reassessed baseline.','Supervisory Body reviewing the renewed baseline under Article 6.4.',NULL,NULL,NULL,
 'standard_review','2025-11-15 08:00:00','2025-11-25 09:00:00','2025-12-05 10:00:00',NULL,'2025-12-20 11:00:00','2026-01-10 12:00:00','2026-02-01 13:00:00','2026-03-20 14:00:00',NULL,NULL,NULL,NULL,
 0,'2026-05-19 14:00:00',NULL,0,0,'demo_carbon_001'),

-- cpr_008 major — REFUSED on a failed additionality retest (REPORTABLE: refuse crosses for major + mega)
('cpr_008','CPR-2026-0008','carbon_registration.registered','carbon_project_registration','reg_008','W37',
 'proj_richards_gas','Richards Bay Gas Switch','cdm','ACM0009','Verdant Assurance','pp_008','Richards Bay Energy',
 'major',1500000,3,'2016-06-01','2026-05-31',NULL,NULL,
 1500000,1200000,20,'not_additional',
 'APP-CPR-008','COMP-008','VVB-008','DEC-008','REF-008',
 'Third renewal filed under CDM.','Completeness confirmed.',NULL,'Baseline reassessed downward by twenty percent on the decarbonising grid.','Additionality retest failed; the fuel switch is now common practice.','VVB flagged additionality concerns.','Review panel considered the additionality finding.','Reassessment found the activity is no longer additional under current grid conditions; renewal refused.','additionality_failed',NULL,
 'refused','2025-12-01 08:00:00','2025-12-12 09:00:00','2025-12-22 10:00:00',NULL,'2026-01-15 11:00:00','2026-02-05 12:00:00','2026-02-25 13:00:00','2026-03-15 14:00:00',NULL,'2026-04-02 15:00:00',NULL,NULL,
 0,NULL,NULL,1,1,'demo_carbon_001'),

-- cpr_009 mega — revision requested (forest programme; updated monitoring data required)
('cpr_009','CPR-2026-0009','carbon_registration.registered','carbon_project_registration','reg_009','W37',
 'proj_limpopo_redd','Limpopo REDD Plus Programme','verra_vcs','VM0007','Aster Global Verification','pp_009','Limpopo Forest Trust',
 'mega',3200000,2,'2017-10-01','2026-09-30',NULL,NULL,
 3200000,NULL,NULL,NULL,
 'APP-CPR-009','COMP-009',NULL,NULL,NULL,
 'Renewal filed for the forest carbon programme.','Completeness review found gaps in the updated monitoring report.','Revision requested: updated remote sensing data and a revised leakage assessment required before completeness can be confirmed.',NULL,NULL,NULL,NULL,NULL,'incomplete_submission',NULL,
 'revision_requested','2026-02-10 08:00:00','2026-02-20 09:00:00','2026-03-01 10:00:00','2026-03-08 11:00:00',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,
 1,'2026-06-06 11:00:00',NULL,0,0,'demo_carbon_001'),

-- cpr_010 mega — renewal window open and SLA BREACHED (REPORTABLE: sla breach crosses for major + mega)
('cpr_010','CPR-2026-0010','carbon_registration.registered','carbon_project_registration','reg_010','W37',
 'proj_kzn_bluecarbon','KwaZulu Blue Carbon Mangrove','gold_standard','GS-AFOLU-01','Verdant Assurance','pp_010','Coastal Carbon Trust',
 'mega',5000000,2,'2016-01-01','2026-04-30',NULL,NULL,
 5000000,NULL,NULL,NULL,
 NULL,NULL,NULL,NULL,NULL,
 NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'sla_breach',NULL,
 'renewal_due','2025-11-01 08:00:00',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,
 0,'2026-03-01 08:00:00','2026-03-02 00:15:00',1,2,'demo_carbon_001');

-- Events (transition log). Full lifecycle path for the renewed showcase case
-- (cpr_002) plus key transitions for the rest. actor_party records the functional
-- party per step: proponent submits/resubmits, registry drives the standard-side
-- steps, vvb validates. The events table event_type column is plain TEXT.
INSERT OR IGNORE INTO oe_crediting_period_renewals_events (
  id, renewal_id, event_type, from_status, to_status, actor_id, actor_party, notes, created_at
) VALUES
('cpr_evt_001','cpr_001','crediting_renewal.application_submitted','renewal_due','application_submitted','demo_carbon_001','proponent','Renewal application submitted under VCS v4','2026-03-10 09:00:00'),
('cpr_evt_002','cpr_002','crediting_renewal.application_submitted','renewal_due','application_submitted','demo_carbon_001','proponent','Renewal application submitted ahead of expiry','2026-01-12 09:00:00'),
('cpr_evt_003','cpr_002','crediting_renewal.completeness_check','application_submitted','completeness_check','demo_carbon_001','registry','Completeness confirmed on first review','2026-01-20 10:00:00'),
('cpr_evt_004','cpr_002','crediting_renewal.baseline_reassessment','completeness_check','baseline_reassessment','demo_carbon_001','registry','Baseline reassessment opened against the current grid factor','2026-02-02 11:00:00'),
('cpr_evt_005','cpr_002','crediting_renewal.additionality_retest','baseline_reassessment','additionality_retest','demo_carbon_001','registry','Additionality retest opened','2026-02-15 12:00:00'),
('cpr_evt_006','cpr_002','crediting_renewal.vvb_validation','additionality_retest','vvb_validation','demo_carbon_001','vvb','Independent VVB validating the reassessed baseline','2026-03-01 13:00:00'),
('cpr_evt_007','cpr_002','crediting_renewal.standard_review','vvb_validation','standard_review','demo_carbon_001','registry','Standard review opened on the validated renewal','2026-03-15 14:00:00'),
('cpr_evt_008','cpr_002','crediting_renewal.renewed','standard_review','renewed','demo_carbon_001','registry','Renewed with the baseline reduced thirty five percent; escalated to the DNA as a material baseline downgrade','2026-03-28 15:00:00'),
('cpr_evt_009','cpr_003','crediting_renewal.application_submitted','renewal_due','application_submitted','demo_carbon_001','proponent','Renewal application submitted under VCS v4','2026-04-10 09:00:00'),
('cpr_evt_010','cpr_003','crediting_renewal.completeness_check','application_submitted','completeness_check','demo_carbon_001','registry','Completeness check opened on the renewal dossier','2026-04-20 10:00:00'),
('cpr_evt_011','cpr_004','crediting_renewal.completeness_check','application_submitted','completeness_check','demo_carbon_001','registry','Completeness confirmed','2026-02-25 10:00:00'),
('cpr_evt_012','cpr_004','crediting_renewal.baseline_reassessment','completeness_check','baseline_reassessment','demo_carbon_001','registry','Baseline reassessment opened against current grid and diffusion data','2026-03-10 11:00:00'),
('cpr_evt_013','cpr_005','crediting_renewal.baseline_reassessment','completeness_check','baseline_reassessment','demo_carbon_001','registry','Baseline reassessment completed at a ten percent reduction','2026-02-20 11:00:00'),
('cpr_evt_014','cpr_005','crediting_renewal.additionality_retest','baseline_reassessment','additionality_retest','demo_carbon_001','registry','Additionality retest opened','2026-03-05 12:00:00'),
('cpr_evt_015','cpr_006','crediting_renewal.additionality_retest','baseline_reassessment','additionality_retest','demo_carbon_001','registry','Additionality confirmed; proceeding to validation','2026-01-28 12:00:00'),
('cpr_evt_016','cpr_006','crediting_renewal.vvb_validation','additionality_retest','vvb_validation','demo_carbon_001','vvb','Independent VVB validating the reassessed baseline and additionality','2026-02-15 13:00:00'),
('cpr_evt_017','cpr_007','crediting_renewal.vvb_validation','additionality_retest','vvb_validation','demo_carbon_001','vvb','VVB validated the reassessed baseline','2026-02-01 13:00:00'),
('cpr_evt_018','cpr_007','crediting_renewal.standard_review','vvb_validation','standard_review','demo_carbon_001','registry','Supervisory Body review opened under Article 6.4','2026-03-20 14:00:00'),
('cpr_evt_019','cpr_008','crediting_renewal.standard_review','vvb_validation','standard_review','demo_carbon_001','registry','Review panel opened on the additionality finding','2026-03-15 14:00:00'),
('cpr_evt_020','cpr_008','crediting_renewal.refused','standard_review','refused','demo_carbon_001','registry','Renewal refused; activity no longer additional; reported to the DNA','2026-04-02 15:00:00'),
('cpr_evt_021','cpr_009','crediting_renewal.completeness_check','application_submitted','completeness_check','demo_carbon_001','registry','Completeness review found gaps in the updated monitoring report','2026-03-01 10:00:00'),
('cpr_evt_022','cpr_009','crediting_renewal.revision_requested','completeness_check','revision_requested','demo_carbon_001','registry','Revision requested: updated remote sensing and leakage assessment required','2026-03-08 11:00:00'),
('cpr_evt_023','cpr_010','crediting_renewal.sla_breached','renewal_due','renewal_due','system','registry','Renewal window SLA breached on a mega forest programme; escalated to the DNA','2026-03-02 00:15:00');
