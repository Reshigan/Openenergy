-- Wave 33 — Regulator Licence Renewal seed data
-- 10 prod-realistic cases across all 11 states + 5 licence classes.
-- Cross-wave provenance via source_wave (W20 COD post-energisation amendments,
-- W28 GCA grid connection licence triggers, W31 disposition open-notice flags).

-- 1) Renewal initiated (generation_utility) — Eskom Kusile Unit 6 (4800MW total / 800MW unit)
INSERT OR IGNORE INTO oe_licence_renewals (
  id, case_number, licence_id, licence_number, licence_type, licence_class, capacity_mw,
  source_event, source_entity_type, source_entity_id, source_wave,
  applicant_party_id, applicant_party_name, facility_name, facility_province,
  current_expiry_date, requested_expiry_date, reason_code, rod_notes,
  chain_status, initiated_at, sla_deadline_at, created_by
) VALUES (
  'lr_001', 'LR-2026-0001', 'lic_gen_kusile_u6', 'NERSA-GEN-2003-KUS-U6', 'generation', 'generation_utility', 800,
  'expiry.approaching', 'licence', 'lic_gen_kusile_u6', null,
  'eskom_holdings', 'Eskom Holdings SOC Ltd', 'Kusile Power Station Unit 6', 'Mpumalanga',
  '2027-03-31', '2052-03-31', 'LICENCE-RENEWAL-25YR-EXTENSION',
  'Renewal initiated by Eskom for Kusile Unit 6 ahead of 31 Mar 2027 expiry. Standard 25-year extension request. s14(2)(b) 6-month statutory window opens 2026-09-30.',
  'renewal_initiated', '2026-04-12 09:00:00', '2026-10-09 09:00:00', 'system'
);

-- 2) Application filed (distribution) — City of Cape Town
INSERT OR IGNORE INTO oe_licence_renewals (
  id, case_number, licence_id, licence_number, licence_type, licence_class,
  applicant_party_id, applicant_party_name, facility_name, facility_province,
  current_expiry_date, requested_expiry_date, application_pack_ref, reason_code, rod_notes,
  chain_status, initiated_at, application_filed_at, sla_deadline_at, created_by
) VALUES (
  'lr_002', 'LR-2026-0002', 'lic_dist_cct', 'NERSA-DIST-2012-CCT-001', 'distribution', 'distribution',
  'cct_metro', 'City of Cape Town Metropolitan Municipality', 'CCT Electricity Distribution Network', 'Western Cape',
  '2027-06-30', '2042-06-30', 'CCT-RENEWAL-PACK-2026-Q2', 'LICENCE-RENEWAL-15YR-DISTRIBUTION',
  'CCT lodged full renewal pack 2026-04-15. Pack includes 5-year operational performance, R&E ratios, NRS 048 compliance. Awaiting completeness check.',
  'application_filed', '2026-03-01 09:00:00', '2026-04-15 14:30:00', '2026-05-06 14:30:00', 'system'
);

-- 3) Completeness check (generation_embedded) — Mooi River wind farm 90MW
INSERT OR IGNORE INTO oe_licence_renewals (
  id, case_number, licence_id, licence_number, licence_type, licence_class, capacity_mw,
  source_event, source_entity_type, source_entity_id, source_wave,
  applicant_party_id, applicant_party_name, facility_name, facility_province,
  current_expiry_date, requested_expiry_date, application_pack_ref, completeness_findings, completeness_ref,
  reason_code, rod_notes,
  chain_status, initiated_at, application_filed_at, completeness_checked_at, sla_deadline_at, created_by
) VALUES (
  'lr_003', 'LR-2026-0003', 'lic_gen_mooi_river_wind', 'NERSA-GEN-2017-MRW-001', 'generation', 'generation_embedded', 90,
  'expiry.approaching', 'licence', 'lic_gen_mooi_river_wind', null,
  'ipp_mooi_river_wind', 'Mooi River Wind Power (Pty) Ltd', 'Mooi River Wind Farm (90MW)', 'KwaZulu-Natal',
  '2027-08-31', '2042-08-31', 'MRW-RENEWAL-2026', 'Pack 95% complete. Missing: updated land lease addendum (Erf 1245), 2025 financial statements (audited). Applicant requested 21-day extension.',
  'CC-FINDINGS-2026-LR003',
  'LICENCE-RENEWAL-15YR-WIND', 'NERSA completeness review identified 2 gaps. 21-day cure window granted. Resubmission expected by 2026-06-08.',
  'completeness_check', '2026-04-01 09:00:00', '2026-04-20 11:15:00', '2026-05-18 16:00:00', '2026-06-08 16:00:00', 'admin'
);

-- 4) Public consultation (generation_utility) — Medupi Unit 4 (794MW)
INSERT OR IGNORE INTO oe_licence_renewals (
  id, case_number, licence_id, licence_number, licence_type, licence_class, capacity_mw,
  source_event, source_entity_type, source_entity_id, source_wave,
  applicant_party_id, applicant_party_name, facility_name, facility_province,
  current_expiry_date, requested_expiry_date, application_pack_ref, completeness_ref,
  consultation_notice_ref, consultation_responses_count,
  reason_code, rod_notes,
  chain_status, initiated_at, application_filed_at, completeness_checked_at, consultation_opened_at,
  sla_deadline_at, created_by
) VALUES (
  'lr_004', 'LR-2026-0004', 'lic_gen_medupi_u4', 'NERSA-GEN-2015-MED-U4', 'generation', 'generation_utility', 794,
  'expiry.approaching', 'licence', 'lic_gen_medupi_u4', null,
  'eskom_holdings', 'Eskom Holdings SOC Ltd', 'Medupi Power Station Unit 4', 'Limpopo',
  '2026-11-30', '2051-11-30', 'MED-U4-RENEWAL-PACK-2026', 'CC-CLEAN-2026-MED-U4',
  'NERSA-NOTICE-2026-MED-U4-PUBLIC-CONSULTATION', 47,
  'LICENCE-RENEWAL-25YR-COAL', 'Public consultation period opened 2026-03-01, 90-day window. 47 written submissions received to date. Civil society raising air quality + just transition concerns.',
  'public_consultation', '2026-01-15 09:00:00', '2026-02-01 09:00:00', '2026-02-21 14:00:00', '2026-03-01 09:00:00',
  '2026-05-30 09:00:00', 'admin'
);

-- 5) Evaluation (trading) — Africa Energy Trading licence (already breached SLA)
INSERT OR IGNORE INTO oe_licence_renewals (
  id, case_number, licence_id, licence_number, licence_type, licence_class,
  applicant_party_id, applicant_party_name, facility_name, facility_province,
  current_expiry_date, requested_expiry_date, application_pack_ref, completeness_ref,
  consultation_notice_ref, consultation_responses_count,
  technical_findings, technical_evaluation_ref, financial_findings, financial_evaluation_ref,
  reason_code, rod_notes,
  chain_status, initiated_at, application_filed_at, completeness_checked_at, consultation_opened_at,
  evaluation_started_at, sla_deadline_at, last_sla_breach_at, escalation_level, created_by
) VALUES (
  'lr_005', 'LR-2026-0005', 'lic_trade_aet', 'NERSA-TRADE-2020-AET-001', 'trading', 'trading',
  'africa_energy_trading', 'Africa Energy Trading (Pty) Ltd', 'Cross-border SADC trading desk', 'Gauteng',
  '2026-06-30', '2031-06-30', 'AET-RENEWAL-PACK', 'CC-CLEAN-2026-AET',
  'NERSA-NOTICE-2026-AET', 4,
  'Technical fit-and-proper review complete. KYC + risk management framework + position-limit policy reviewed (W29 cross-ref). No findings.',
  'TECH-EVAL-2026-AET',
  'Financial viability tested under 3 stress scenarios. Solvency ratio 1.4x, exceeds 1.2x threshold. Audit qualified opinion on FY2025 — requires note.',
  'FIN-EVAL-2026-AET',
  'LICENCE-RENEWAL-5YR-TRADING',
  'Evaluation 7 days past SLA. Audit qualification note pending applicant response. Tier=trading carries 30d eval window; auto-escalated.',
  'evaluation', '2026-01-15 09:00:00', '2026-02-01 09:00:00', '2026-02-15 14:00:00', '2026-02-22 09:00:00',
  '2026-03-24 09:00:00', '2026-04-23 09:00:00', '2026-04-23 09:00:00', 1, 'admin'
);

-- 6) Decision drafted (generation_sseg) — Stellenbosch University rooftop 0.5MW
INSERT OR IGNORE INTO oe_licence_renewals (
  id, case_number, licence_id, licence_number, licence_type, licence_class, capacity_mw,
  source_event, source_entity_type, source_entity_id, source_wave,
  applicant_party_id, applicant_party_name, facility_name, facility_province,
  current_expiry_date, requested_expiry_date, application_pack_ref, completeness_ref,
  consultation_notice_ref, consultation_responses_count,
  technical_evaluation_ref, financial_evaluation_ref, decision_rod_ref,
  reason_code, rod_notes,
  chain_status, initiated_at, application_filed_at, completeness_checked_at, consultation_opened_at,
  evaluation_started_at, decision_drafted_at, sla_deadline_at, created_by
) VALUES (
  'lr_006', 'LR-2026-0006', 'lic_gen_stell_uni_roof', 'NERSA-SSEG-2020-SU-ROOF', 'generation', 'generation_sseg', 0.5,
  'expiry.approaching', 'licence', 'lic_gen_stell_uni_roof', null,
  'stell_uni', 'Stellenbosch University', 'SU Engineering Faculty rooftop PV (0.5MW)', 'Western Cape',
  '2026-09-30', '2031-09-30', 'SU-ROOF-RENEWAL', 'CC-CLEAN-2026-SU',
  'NERSA-NOTICE-2026-SU-ROOF-SSEG', 0,
  'TECH-EVAL-2026-SU-CLEAN', 'FIN-EVAL-2026-SU-CLEAN',
  'ROD-DRAFT-2026-SU-ROOF',
  'LICENCE-RENEWAL-5YR-SSEG-EDUCATIONAL',
  'RoD drafted recommending CLEAN grant for 5-year extension. SSEG <1MW educational facility. Zero negative submissions during consultation.',
  'decision_drafted', '2026-04-01 09:00:00', '2026-04-10 09:00:00', '2026-04-15 14:00:00', '2026-04-18 09:00:00',
  '2026-05-03 09:00:00', '2026-05-22 11:00:00', '2026-06-05 11:00:00', 'admin'
);

-- 7) Council voted (generation_embedded) — De Hoop solar 50MW (decision awaited)
INSERT OR IGNORE INTO oe_licence_renewals (
  id, case_number, licence_id, licence_number, licence_type, licence_class, capacity_mw,
  applicant_party_id, applicant_party_name, facility_name, facility_province,
  current_expiry_date, requested_expiry_date, completeness_ref,
  consultation_notice_ref, consultation_responses_count,
  technical_evaluation_ref, financial_evaluation_ref, decision_rod_ref, council_meeting_ref,
  reason_code, rod_notes,
  chain_status, initiated_at, application_filed_at, completeness_checked_at, consultation_opened_at,
  evaluation_started_at, decision_drafted_at, council_voted_at, sla_deadline_at, created_by
) VALUES (
  'lr_007', 'LR-2026-0007', 'lic_gen_dehoop_solar', 'NERSA-GEN-2018-DEH-PV', 'generation', 'generation_embedded', 50,
  'ipp_dehoop_solar', 'De Hoop Solar (Pty) Ltd', 'De Hoop Solar Park (50MW)', 'Northern Cape',
  '2026-08-31', '2041-08-31', 'CC-CLEAN-2026-DEH',
  'NERSA-NOTICE-2026-DEH-PV', 8,
  'TECH-EVAL-2026-DEH', 'FIN-EVAL-2026-DEH',
  'ROD-2026-DEH-PV', 'COUNCIL-2026-04-MEETING-073',
  'LICENCE-RENEWAL-15YR-SOLAR-EMBEDDED',
  'Council voted at meeting 073 on 2026-05-15. Outcome pending Chair signature on RoD. Standard renewal with REIPPPP BW1 baseline.',
  'council_voted', '2026-01-01 09:00:00', '2026-01-15 09:00:00', '2026-01-22 14:00:00', '2026-02-01 09:00:00',
  '2026-03-03 09:00:00', '2026-04-21 09:00:00', '2026-05-15 16:00:00', '2026-05-29 16:00:00', 'admin'
);

-- 8) Granted (generation_utility) — Ankerlig OCGT 1338MW
INSERT OR IGNORE INTO oe_licence_renewals (
  id, case_number, licence_id, licence_number, licence_type, licence_class, capacity_mw,
  applicant_party_id, applicant_party_name, facility_name, facility_province,
  current_expiry_date, requested_expiry_date, granted_expiry_date, completeness_ref,
  consultation_notice_ref, consultation_responses_count,
  technical_evaluation_ref, financial_evaluation_ref, decision_rod_ref, council_meeting_ref,
  council_vote_outcome,
  reason_code, rod_notes,
  chain_status, initiated_at, application_filed_at, completeness_checked_at, consultation_opened_at,
  evaluation_started_at, decision_drafted_at, council_voted_at, granted_at, sla_deadline_at, created_by
) VALUES (
  'lr_008', 'LR-2026-0008', 'lic_gen_ankerlig', 'NERSA-GEN-2007-ANK-001', 'generation', 'generation_utility', 1338,
  'eskom_holdings', 'Eskom Holdings SOC Ltd', 'Ankerlig OCGT Power Station', 'Western Cape',
  '2025-12-31', '2050-12-31', '2050-12-31', 'CC-CLEAN-2025-ANK',
  'NERSA-NOTICE-2025-ANK', 23,
  'TECH-EVAL-2025-ANK', 'FIN-EVAL-2025-ANK',
  'ROD-2025-ANK-FINAL', 'COUNCIL-2025-11-MEETING-068',
  'UNANIMOUS_GRANT',
  'LICENCE-RENEWAL-25YR-OCGT',
  'GRANTED unanimously by Council 2025-11-22. 25-year extension to 2050-12-31. Standard utility OCGT peaking licence. No conditions attached.',
  'granted', '2025-01-15 09:00:00', '2025-03-01 09:00:00', '2025-03-21 14:00:00', '2025-04-01 09:00:00',
  '2025-07-01 09:00:00', '2025-10-20 09:00:00', '2025-11-22 16:00:00', '2025-12-01 09:00:00', null, 'admin'
);

-- 9) Amended (distribution) — eThekwini Metro (with conditions)
INSERT OR IGNORE INTO oe_licence_renewals (
  id, case_number, licence_id, licence_number, licence_type, licence_class,
  applicant_party_id, applicant_party_name, facility_name, facility_province,
  current_expiry_date, requested_expiry_date, granted_expiry_date, completeness_ref,
  consultation_notice_ref, consultation_responses_count,
  technical_evaluation_ref, financial_evaluation_ref, decision_rod_ref, council_meeting_ref,
  council_vote_outcome, conditions_attached, amendment_summary,
  reason_code, rod_notes,
  chain_status, initiated_at, application_filed_at, completeness_checked_at, consultation_opened_at,
  evaluation_started_at, decision_drafted_at, council_voted_at, amended_at, sla_deadline_at, created_by
) VALUES (
  'lr_009', 'LR-2026-0009', 'lic_dist_ethekwini', 'NERSA-DIST-2010-ETH-001', 'distribution', 'distribution',
  'ethekwini_metro', 'eThekwini Metropolitan Municipality', 'eThekwini Electricity Distribution', 'KwaZulu-Natal',
  '2025-06-30', '2040-06-30', '2035-06-30', 'CC-CLEAN-2025-ETH',
  'NERSA-NOTICE-2025-ETH', 51,
  'TECH-EVAL-2025-ETH', 'FIN-EVAL-2025-ETH',
  'ROD-2025-ETH-AMENDED', 'COUNCIL-2025-04-MEETING-061',
  'GRANT_WITH_CONDITIONS',
  'C1: SAIDI ≤ 18 hrs/customer/year by Y2 (NRS 048). C2: Quarterly NERSA performance reporting. C3: Tariff freeze on prepaid until Y3. C4: 10-year (not 15) initial term subject to mid-cycle review.',
  '10-year term granted (vs 15-yr requested). 4 performance conditions attached per NRS 048-2 + ED Codes Council recommendation. Conditional grant.',
  'LICENCE-RENEWAL-10YR-CONDITIONAL-METRO',
  'Council voted GRANT_WITH_CONDITIONS at meeting 061 on 2025-04-12. Term reduced 15→10 yrs. Four conditions attached. Performance reporting accelerated.',
  'amended', '2024-09-15 09:00:00', '2024-10-30 09:00:00', '2024-11-15 14:00:00', '2024-12-01 09:00:00',
  '2025-01-30 09:00:00', '2025-03-15 09:00:00', '2025-04-12 16:00:00', '2025-04-15 09:00:00', null, 'admin'
);

-- 10) Refused (generation_utility) — Komati legacy coal renewal denied
INSERT OR IGNORE INTO oe_licence_renewals (
  id, case_number, licence_id, licence_number, licence_type, licence_class, capacity_mw,
  source_event, source_entity_type, source_entity_id, source_wave,
  applicant_party_id, applicant_party_name, facility_name, facility_province,
  current_expiry_date, requested_expiry_date, completeness_ref,
  consultation_notice_ref, consultation_responses_count,
  technical_evaluation_ref, financial_evaluation_ref, decision_rod_ref, council_meeting_ref,
  council_vote_outcome, refusal_grounds,
  appeal_filed, appeal_filing_ref, tribunal_case_ref,
  reason_code, rod_notes,
  chain_status, initiated_at, application_filed_at, completeness_checked_at, consultation_opened_at,
  evaluation_started_at, decision_drafted_at, council_voted_at, refused_at, sla_deadline_at, created_by
) VALUES (
  'lr_010', 'LR-2026-0010', 'lic_gen_komati_legacy', 'NERSA-GEN-1998-KOM-LEGACY', 'generation', 'generation_utility', 990,
  'just_transition.pipeline', 'licence', 'lic_gen_komati_legacy', 'W31',
  'eskom_holdings', 'Eskom Holdings SOC Ltd', 'Komati Power Station (legacy coal, decommissioning)', 'Mpumalanga',
  '2025-09-30', '2035-09-30', 'CC-COND-2025-KOM',
  'NERSA-NOTICE-2025-KOM-LEGACY', 187,
  'TECH-EVAL-2025-KOM-NEGATIVE', 'FIN-EVAL-2025-KOM-NEGATIVE',
  'ROD-2025-KOM-REFUSE', 'COUNCIL-2025-08-MEETING-066',
  'REFUSE',
  'G1: Plant decommissioning underway per IRP 2019 / JET-IP; renewal contradicts just transition pipeline. G2: Technical evaluation flagged irreversible boiler-tube degradation; <40% availability. G3: Financial evaluation shows negative NPV vs decommissioning path. G4: 187/187 public submissions opposed.',
  1, 'APPEAL-2025-KOM-LEGACY', 'NERSA-TRIBUNAL-2025-0008',
  'LICENCE-RENEWAL-REFUSED-JUST-TRANSITION',
  'REFUSED unanimously. Eskom filed Tribunal appeal 2025-10-14. Tribunal case TRIB-2025-0008 in pre-hearing.',
  'refused', '2024-12-01 09:00:00', '2025-01-15 09:00:00', '2025-02-10 14:00:00', '2025-03-01 09:00:00',
  '2025-05-30 09:00:00', '2025-07-25 09:00:00', '2025-08-20 16:00:00', '2025-09-01 09:00:00', null, 'admin'
);

-- ─── EVENTS ────────────────────────────────────────────────────────────────

-- lr_001 events
INSERT OR IGNORE INTO oe_licence_renewal_events (id, renewal_id, event_type, from_status, to_status, actor_id, actor_party, notes, created_at) VALUES
('lre_001_a', 'lr_001', 'licence_renewal.initiated', null, 'renewal_initiated', 'system', 'system', 'Auto-initiated at 12-month expiry threshold (s14(2)(b))', '2026-04-12 09:00:00');

-- lr_002 events
INSERT OR IGNORE INTO oe_licence_renewal_events (id, renewal_id, event_type, from_status, to_status, actor_id, actor_party, notes, created_at) VALUES
('lre_002_a', 'lr_002', 'licence_renewal.initiated', null, 'renewal_initiated', 'system', 'system', 'Auto-initiated 12-month pre-expiry', '2026-03-01 09:00:00'),
('lre_002_b', 'lr_002', 'licence_renewal.application_filed', 'renewal_initiated', 'application_filed', 'cct_metro_lic_officer', 'applicant', 'Full pack lodged CCT-RENEWAL-PACK-2026-Q2', '2026-04-15 14:30:00');

-- lr_003 events
INSERT OR IGNORE INTO oe_licence_renewal_events (id, renewal_id, event_type, from_status, to_status, actor_id, actor_party, notes, created_at) VALUES
('lre_003_a', 'lr_003', 'licence_renewal.initiated', null, 'renewal_initiated', 'system', 'system', 'Auto-initiated', '2026-04-01 09:00:00'),
('lre_003_b', 'lr_003', 'licence_renewal.application_filed', 'renewal_initiated', 'application_filed', 'mrw_lic_officer', 'applicant', 'MRW-RENEWAL-2026 pack lodged', '2026-04-20 11:15:00'),
('lre_003_c', 'lr_003', 'licence_renewal.completeness_checked', 'application_filed', 'completeness_check', 'nersa_off_2', 'regulator', 'CC-FINDINGS-2026-LR003 — 2 gaps identified, 21d cure', '2026-05-18 16:00:00');

-- lr_004 events
INSERT OR IGNORE INTO oe_licence_renewal_events (id, renewal_id, event_type, from_status, to_status, actor_id, actor_party, notes, created_at) VALUES
('lre_004_a', 'lr_004', 'licence_renewal.initiated', null, 'renewal_initiated', 'system', 'system', 'Auto-initiated 10-month pre-expiry', '2026-01-15 09:00:00'),
('lre_004_b', 'lr_004', 'licence_renewal.application_filed', 'renewal_initiated', 'application_filed', 'eskom_lic_team', 'applicant', 'MED-U4-RENEWAL-PACK-2026 lodged', '2026-02-01 09:00:00'),
('lre_004_c', 'lr_004', 'licence_renewal.completeness_checked', 'application_filed', 'completeness_check', 'nersa_off_1', 'regulator', 'CC-CLEAN-2026-MED-U4 — pack complete', '2026-02-21 14:00:00'),
('lre_004_d', 'lr_004', 'licence_renewal.consultation_opened', 'completeness_check', 'public_consultation', 'nersa_off_1', 'regulator', 'Public consultation opened — 90d window per s10', '2026-03-01 09:00:00');

-- lr_005 events
INSERT OR IGNORE INTO oe_licence_renewal_events (id, renewal_id, event_type, from_status, to_status, actor_id, actor_party, notes, created_at) VALUES
('lre_005_a', 'lr_005', 'licence_renewal.initiated', null, 'renewal_initiated', 'system', 'system', 'Auto-initiated', '2026-01-15 09:00:00'),
('lre_005_b', 'lr_005', 'licence_renewal.application_filed', 'renewal_initiated', 'application_filed', 'aet_compliance', 'applicant', 'AET-RENEWAL-PACK lodged', '2026-02-01 09:00:00'),
('lre_005_c', 'lr_005', 'licence_renewal.completeness_checked', 'application_filed', 'completeness_check', 'nersa_off_3', 'regulator', 'CC-CLEAN-2026-AET', '2026-02-15 14:00:00'),
('lre_005_d', 'lr_005', 'licence_renewal.consultation_opened', 'completeness_check', 'public_consultation', 'nersa_off_3', 'regulator', 'Public consultation opened — 30d trading window', '2026-02-22 09:00:00'),
('lre_005_e', 'lr_005', 'licence_renewal.evaluation_started', 'public_consultation', 'evaluation', 'nersa_off_3', 'regulator', 'Technical + financial eval kicked off', '2026-03-24 09:00:00'),
('lre_005_f', 'lr_005', 'licence_renewal.sla_breached', 'evaluation', 'evaluation', 'system', 'system', 'SLA breach — trading eval window 30d exceeded by 7 days. Auto-escalated.', '2026-04-23 09:00:00');

-- lr_006 events
INSERT OR IGNORE INTO oe_licence_renewal_events (id, renewal_id, event_type, from_status, to_status, actor_id, actor_party, notes, created_at) VALUES
('lre_006_a', 'lr_006', 'licence_renewal.initiated', null, 'renewal_initiated', 'system', 'system', 'Auto-initiated', '2026-04-01 09:00:00'),
('lre_006_b', 'lr_006', 'licence_renewal.application_filed', 'renewal_initiated', 'application_filed', 'su_facilities', 'applicant', 'SU-ROOF-RENEWAL lodged', '2026-04-10 09:00:00'),
('lre_006_c', 'lr_006', 'licence_renewal.completeness_checked', 'application_filed', 'completeness_check', 'nersa_off_4', 'regulator', 'CC-CLEAN-2026-SU', '2026-04-15 14:00:00'),
('lre_006_d', 'lr_006', 'licence_renewal.consultation_opened', 'completeness_check', 'public_consultation', 'nersa_off_4', 'regulator', 'Consultation opened — 30d SSEG window', '2026-04-18 09:00:00'),
('lre_006_e', 'lr_006', 'licence_renewal.evaluation_started', 'public_consultation', 'evaluation', 'nersa_off_4', 'regulator', 'Eval kicked off — no negative submissions', '2026-05-03 09:00:00'),
('lre_006_f', 'lr_006', 'licence_renewal.decision_drafted', 'evaluation', 'decision_drafted', 'nersa_off_4', 'regulator', 'ROD-DRAFT-2026-SU-ROOF — clean grant recommended', '2026-05-22 11:00:00');

-- lr_007 events
INSERT OR IGNORE INTO oe_licence_renewal_events (id, renewal_id, event_type, from_status, to_status, actor_id, actor_party, notes, created_at) VALUES
('lre_007_a', 'lr_007', 'licence_renewal.initiated', null, 'renewal_initiated', 'system', 'system', 'Auto-initiated', '2026-01-01 09:00:00'),
('lre_007_b', 'lr_007', 'licence_renewal.application_filed', 'renewal_initiated', 'application_filed', 'dehoop_lic', 'applicant', 'Full pack lodged', '2026-01-15 09:00:00'),
('lre_007_c', 'lr_007', 'licence_renewal.completeness_checked', 'application_filed', 'completeness_check', 'nersa_off_2', 'regulator', 'CC-CLEAN', '2026-01-22 14:00:00'),
('lre_007_d', 'lr_007', 'licence_renewal.consultation_opened', 'completeness_check', 'public_consultation', 'nersa_off_2', 'regulator', '60d embedded consultation', '2026-02-01 09:00:00'),
('lre_007_e', 'lr_007', 'licence_renewal.evaluation_started', 'public_consultation', 'evaluation', 'nersa_off_2', 'regulator', 'Eval kicked off', '2026-03-03 09:00:00'),
('lre_007_f', 'lr_007', 'licence_renewal.decision_drafted', 'evaluation', 'decision_drafted', 'nersa_off_2', 'regulator', 'ROD-2026-DEH-PV drafted', '2026-04-21 09:00:00'),
('lre_007_g', 'lr_007', 'licence_renewal.council_voted', 'decision_drafted', 'council_voted', 'nersa_council', 'regulator', 'Council voted at meeting 073 — pending Chair signature', '2026-05-15 16:00:00');

-- lr_008 events (full grant lifecycle)
INSERT OR IGNORE INTO oe_licence_renewal_events (id, renewal_id, event_type, from_status, to_status, actor_id, actor_party, notes, created_at) VALUES
('lre_008_a', 'lr_008', 'licence_renewal.initiated', null, 'renewal_initiated', 'system', 'system', 'Auto-initiated', '2025-01-15 09:00:00'),
('lre_008_b', 'lr_008', 'licence_renewal.application_filed', 'renewal_initiated', 'application_filed', 'eskom_lic_team', 'applicant', 'Ankerlig renewal pack lodged', '2025-03-01 09:00:00'),
('lre_008_c', 'lr_008', 'licence_renewal.completeness_checked', 'application_filed', 'completeness_check', 'nersa_off_1', 'regulator', 'Pack clean', '2025-03-21 14:00:00'),
('lre_008_d', 'lr_008', 'licence_renewal.consultation_opened', 'completeness_check', 'public_consultation', 'nersa_off_1', 'regulator', '90d utility consultation', '2025-04-01 09:00:00'),
('lre_008_e', 'lr_008', 'licence_renewal.evaluation_started', 'public_consultation', 'evaluation', 'nersa_off_1', 'regulator', 'Full tech+fin eval', '2025-07-01 09:00:00'),
('lre_008_f', 'lr_008', 'licence_renewal.decision_drafted', 'evaluation', 'decision_drafted', 'nersa_off_1', 'regulator', 'ROD-2025-ANK-FINAL drafted', '2025-10-20 09:00:00'),
('lre_008_g', 'lr_008', 'licence_renewal.council_voted', 'decision_drafted', 'council_voted', 'nersa_council', 'regulator', 'Unanimous grant — Council 068', '2025-11-22 16:00:00'),
('lre_008_h', 'lr_008', 'licence_renewal.granted', 'council_voted', 'granted', 'nersa_chair', 'regulator', 'Granted 25-year extension to 2050-12-31, no conditions', '2025-12-01 09:00:00');

-- lr_009 events
INSERT OR IGNORE INTO oe_licence_renewal_events (id, renewal_id, event_type, from_status, to_status, actor_id, actor_party, notes, created_at) VALUES
('lre_009_a', 'lr_009', 'licence_renewal.initiated', null, 'renewal_initiated', 'system', 'system', 'Auto-initiated', '2024-09-15 09:00:00'),
('lre_009_b', 'lr_009', 'licence_renewal.application_filed', 'renewal_initiated', 'application_filed', 'ethekwini_lic', 'applicant', 'eThekwini pack lodged', '2024-10-30 09:00:00'),
('lre_009_c', 'lr_009', 'licence_renewal.completeness_checked', 'application_filed', 'completeness_check', 'nersa_off_2', 'regulator', 'CC-CLEAN', '2024-11-15 14:00:00'),
('lre_009_d', 'lr_009', 'licence_renewal.consultation_opened', 'completeness_check', 'public_consultation', 'nersa_off_2', 'regulator', '60d distribution consultation', '2024-12-01 09:00:00'),
('lre_009_e', 'lr_009', 'licence_renewal.evaluation_started', 'public_consultation', 'evaluation', 'nersa_off_2', 'regulator', 'Eval kicked off — NRS 048 review', '2025-01-30 09:00:00'),
('lre_009_f', 'lr_009', 'licence_renewal.decision_drafted', 'evaluation', 'decision_drafted', 'nersa_off_2', 'regulator', 'ROD-2025-ETH-AMENDED drafted with 4 conditions', '2025-03-15 09:00:00'),
('lre_009_g', 'lr_009', 'licence_renewal.council_voted', 'decision_drafted', 'council_voted', 'nersa_council', 'regulator', 'GRANT_WITH_CONDITIONS — Council 061', '2025-04-12 16:00:00'),
('lre_009_h', 'lr_009', 'licence_renewal.amended', 'council_voted', 'amended', 'nersa_chair', 'regulator', 'Granted with conditions — 10yr term + 4 performance conditions', '2025-04-15 09:00:00');

-- lr_010 events
INSERT OR IGNORE INTO oe_licence_renewal_events (id, renewal_id, event_type, from_status, to_status, actor_id, actor_party, notes, created_at) VALUES
('lre_010_a', 'lr_010', 'licence_renewal.initiated', null, 'renewal_initiated', 'system', 'system', 'Auto-initiated — flagged W31 disposition open notices', '2024-12-01 09:00:00'),
('lre_010_b', 'lr_010', 'licence_renewal.application_filed', 'renewal_initiated', 'application_filed', 'eskom_lic_team', 'applicant', 'KOM-LEGACY renewal pack lodged', '2025-01-15 09:00:00'),
('lre_010_c', 'lr_010', 'licence_renewal.completeness_checked', 'application_filed', 'completeness_check', 'nersa_off_1', 'regulator', 'Conditional clean — flagged Just Transition concerns', '2025-02-10 14:00:00'),
('lre_010_d', 'lr_010', 'licence_renewal.consultation_opened', 'completeness_check', 'public_consultation', 'nersa_off_1', 'regulator', 'Public consultation — 187 submissions received (all opposed)', '2025-03-01 09:00:00'),
('lre_010_e', 'lr_010', 'licence_renewal.evaluation_started', 'public_consultation', 'evaluation', 'nersa_off_1', 'regulator', 'Tech + financial eval — both negative findings', '2025-05-30 09:00:00'),
('lre_010_f', 'lr_010', 'licence_renewal.decision_drafted', 'evaluation', 'decision_drafted', 'nersa_off_1', 'regulator', 'ROD-2025-KOM-REFUSE drafted — recommend refuse', '2025-07-25 09:00:00'),
('lre_010_g', 'lr_010', 'licence_renewal.council_voted', 'decision_drafted', 'council_voted', 'nersa_council', 'regulator', 'REFUSE unanimously — Council 066', '2025-08-20 16:00:00'),
('lre_010_h', 'lr_010', 'licence_renewal.refused', 'council_voted', 'refused', 'nersa_chair', 'regulator', 'Refused — IRP+JET pipeline + 187 submissions + negative tech/fin', '2025-09-01 09:00:00');
