-- Wave 40 — Regulator Compliance Inspection & Enforcement seed data.
-- 10 prod-realistic cases across 10 of 12 states (omits standalone
-- remediation_verified — traversed inside the cinsp_009 compliant flagship — and
-- standalone appealed — traversed inside the cinsp_010 enforcement flagship) +
-- 3 tiers. NERSA own-initiative §10 inspections of SA energy licensees
-- (generation / distribution / trading / SSEG). Officer = NERSA inspectorate;
-- respondent = the licensee (begins remediation + lodges any appeal).
-- Cross-wave provenance: a W25 fatal HSE incident triggers an own-initiative
-- safety inspection (cinsp_001); a W31 disposition escalation (disp_009, itself
-- W25-sourced) drives the cinsp_010 full enforcement → Tribunal arc.

-- 1) inspection_scheduled — critical, incident-driven safety inspection (W25 provenance)
INSERT OR IGNORE INTO oe_compliance_inspections (
  id, inspection_number,
  source_event, source_entity_type, source_entity_id, source_wave,
  officer_party_id, officer_party_name, respondent_party_id, respondent_party_name,
  licence_ref, facility_name, inspection_trigger, contravention_tier, licence_condition_ref,
  inspection_basis,
  chain_status, inspection_scheduled_at, sla_deadline_at, created_by
) VALUES (
  'cinsp_001', 'CINS-2026-0001',
  'hse_incident.escalated', 'hse_incident', 'hse_009', 'W25',
  'nersa', 'NERSA (Compliance & Enforcement)', 'ipp_xina', 'Xina Solar One (RF) (Pty) Ltd',
  'GEN-LIC-2014-0188', 'Xina 100MW Solar Thermal (CSP)', 'incident', 'critical', 'ERA s10(g) — safe operation of the facility',
  'Own-initiative §10 compliance inspection scheduled following a fatal arc-flash incident (W25 hse_009). NERSA inspectorate to verify the licensee''s electrical safety management system, HV switching procedures and security-of-supply controls against licence conditions.',
  'inspection_scheduled', '2026-05-20 08:00:00', '2026-05-22 08:00:00', 'demo_regulator_001'
);

-- 2) inspection_in_progress — serious, complaint-driven grid-code voltage breach
INSERT OR IGNORE INTO oe_compliance_inspections (
  id, inspection_number,
  officer_party_id, officer_party_name, respondent_party_id, respondent_party_name,
  licence_ref, facility_name, inspection_trigger, contravention_tier, licence_condition_ref,
  inspection_basis,
  chain_status, inspection_scheduled_at, inspection_in_progress_at, sla_deadline_at, created_by
) VALUES (
  'cinsp_002', 'CINS-2026-0002',
  'nersa', 'NERSA (Compliance & Enforcement)', 'city_power_jhb', 'City Power Johannesburg SOC Ltd',
  'DIST-LIC-2010-0042', 'Johannesburg Metropolitan Distribution Network', 'complaint', 'serious', 'NRS 048 / Grid Code — quality of supply (voltage)',
  'Inspection underway: multiple customer complaints of sustained under-voltage in the Roodepoort feeder cluster. Inspectorate on site reviewing voltage-regulation records, NRS 048-2 compliance logs and the licensee''s QoS remediation register.',
  'inspection_in_progress', '2026-05-08 08:00:00', '2026-05-12 09:00:00', '2026-05-22 09:00:00', 'demo_regulator_001'
);

-- 3) findings_drafted — minor, thematic late regulatory-report filings
INSERT OR IGNORE INTO oe_compliance_inspections (
  id, inspection_number,
  officer_party_id, officer_party_name, respondent_party_id, respondent_party_name,
  licence_ref, facility_name, inspection_trigger, contravention_tier, licence_condition_ref,
  inspection_basis, findings_basis,
  chain_status, inspection_scheduled_at, inspection_in_progress_at, findings_drafted_at, sla_deadline_at, created_by
) VALUES (
  'cinsp_003', 'CINS-2026-0003',
  'nersa', 'NERSA (Compliance & Enforcement)', 'enpower_trading', 'Enpower Trading (Pty) Ltd',
  'TRAD-LIC-2019-0071', 'Wholesale Electricity Trading Desk', 'thematic', 'minor', 'Licence condition 8 — quarterly compliance returns',
  'Thematic review of trading-licensee reporting discipline across the registered trader cohort.',
  'Draft findings: respondent filed Q3 and Q4 2025 compliance returns 18 and 24 business days late respectively. Administrative contravention; no market-conduct or settlement impact identified. Draft recommends an administrative directive (no penalty).',
  'findings_drafted', '2026-04-20 08:00:00', '2026-04-24 09:00:00', '2026-05-06 09:00:00', '2026-05-16 09:00:00', 'demo_regulator_001'
);

-- 4) findings_issued — critical, generation reserve-margin / availability breach
INSERT OR IGNORE INTO oe_compliance_inspections (
  id, inspection_number,
  officer_party_id, officer_party_name, respondent_party_id, respondent_party_name,
  licence_ref, facility_name, inspection_trigger, contravention_tier, licence_condition_ref,
  inspection_basis, findings_basis, findings_ref,
  chain_status, inspection_scheduled_at, inspection_in_progress_at, findings_drafted_at, findings_issued_at, sla_deadline_at, created_by
) VALUES (
  'cinsp_004', 'CINS-2026-0004',
  'nersa', 'NERSA (Compliance & Enforcement)', 'eskom_gen', 'Eskom Holdings SOC Ltd (Generation)',
  'GEN-LIC-2008-0001', 'Tutuka Power Station (6×609MW)', 'routine', 'critical', 'ERA s10(g) + Grid Code — declared availability / security of supply',
  'Routine availability audit triggered escalation: declared EAF persistently below licence-condition floor.',
  'Findings ISSUED to the licensee: declared availability (EAF) at Tutuka averaged 41% over the review window against the 60% licence-condition floor, with five unplanned multi-unit trips inadequately reported within the Grid Code window. Critical security-of-supply contravention. Licensee has the statutory window to respond before a directive is issued.',
  'FIND-2026-0004',
  'findings_issued', '2026-04-15 08:00:00', '2026-04-20 09:00:00', '2026-04-28 09:00:00', '2026-05-04 09:00:00', '2026-05-09 09:00:00', 'demo_regulator_001'
);

-- 5) directive_issued — serious, distribution metering/billing non-compliance
INSERT OR IGNORE INTO oe_compliance_inspections (
  id, inspection_number,
  officer_party_id, officer_party_name, respondent_party_id, respondent_party_name,
  licence_ref, facility_name, inspection_trigger, contravention_tier, licence_condition_ref,
  inspection_basis, findings_basis, directive_basis, findings_ref, directive_ref,
  chain_status, inspection_scheduled_at, inspection_in_progress_at, findings_drafted_at, findings_issued_at, directive_issued_at, sla_deadline_at, created_by
) VALUES (
  'cinsp_005', 'CINS-2026-0005',
  'nersa', 'NERSA (Compliance & Enforcement)', 'ethekwini_elec', 'eThekwini Municipality (Electricity Unit)',
  'DIST-LIC-2010-0019', 'eThekwini Distribution Licence Area', 'complaint', 'serious', 'NRS 047 — metering & billing standards',
  'Complaint-driven inspection into systematic estimated-billing and meter-reading failures.',
  'Findings: 14% of large-power-user meters unread for >3 consecutive cycles; estimated billing applied beyond the NRS 047 tolerance. Material licence-condition breach.',
  'Compliance DIRECTIVE issued under §10: licensee must (a) physically read all affected LPU meters within 30 days, (b) re-bill on actuals and credit over-recoveries, and (c) submit a metering-asset remediation plan. Respondent to confirm commencement of remediation.',
  'FIND-2026-0005', 'DIR-2026-0005',
  'directive_issued', '2026-04-10 08:00:00', '2026-04-15 09:00:00', '2026-04-22 09:00:00', '2026-04-26 09:00:00', '2026-05-02 09:00:00', '2026-05-17 09:00:00', 'demo_regulator_001'
);

-- 6) remediation_underway — critical, generation protection-scheme defect (respondent began)
INSERT OR IGNORE INTO oe_compliance_inspections (
  id, inspection_number,
  officer_party_id, officer_party_name, respondent_party_id, respondent_party_name,
  licence_ref, facility_name, inspection_trigger, contravention_tier, licence_condition_ref,
  inspection_basis, findings_basis, directive_basis, remediation_basis, remediation_cost_zar,
  findings_ref, directive_ref,
  chain_status, inspection_scheduled_at, inspection_in_progress_at, findings_drafted_at, findings_issued_at, directive_issued_at, remediation_underway_at, sla_deadline_at, created_by
) VALUES (
  'cinsp_006', 'CINS-2026-0006',
  'nersa', 'NERSA (Compliance & Enforcement)', 'ipp_longyuan_dewind', 'Longyuan Mulilo De Aar Wind (RF) (Pty) Ltd',
  'GEN-LIC-2014-0203', 'De Aar 2 North 139MW Wind', 'incident', 'critical', 'Grid Code — protection & disturbance ride-through',
  'Inspection triggered by a feeder-fault cascade in which the facility failed to ride through and tripped, aggravating a local supply interruption.',
  'Findings: the facility''s under-voltage protection settings were non-compliant with the Grid Code ride-through envelope; relay coordination study out of date. Critical security-of-supply contravention.',
  'Directive issued: recommission protection relays to the compliant ride-through envelope and submit an independent coordination study.',
  'Remediation UNDERWAY: respondent engaged the OEM protection contractor, relay reprogramming in progress on 28 of 48 WTG strings; updated coordination study commissioned. Estimated remediation cost R8.4m.',
  8400000,
  'FIND-2026-0006', 'DIR-2026-0006',
  'remediation_underway', '2026-03-28 08:00:00', '2026-04-02 09:00:00', '2026-04-08 09:00:00', '2026-04-12 09:00:00', '2026-04-16 09:00:00', '2026-04-22 09:00:00', '2026-05-22 09:00:00', 'demo_regulator_001'
);

-- 7) penalty_imposed — critical, repeated security-of-supply breach (crosses regulator — Council)
INSERT OR IGNORE INTO oe_compliance_inspections (
  id, inspection_number,
  officer_party_id, officer_party_name, respondent_party_id, respondent_party_name,
  licence_ref, facility_name, inspection_trigger, contravention_tier, licence_condition_ref,
  inspection_basis, findings_basis, directive_basis, penalty_basis, penalty_amount_zar, daily_penalty_zar,
  findings_ref, directive_ref, penalty_ref, reason_code, is_reportable, escalation_level,
  chain_status, inspection_scheduled_at, inspection_in_progress_at, findings_drafted_at, findings_issued_at, directive_issued_at, penalty_imposed_at, sla_deadline_at, created_by
) VALUES (
  'cinsp_007', 'CINS-2026-0007',
  'nersa', 'NERSA (Compliance & Enforcement)', 'eskom_gen', 'Eskom Holdings SOC Ltd (Generation)',
  'GEN-LIC-2008-0001', 'Kusile Power Station Unit 5', 'routine', 'critical', 'ERA s10(g) — emissions abatement & availability conditions',
  'Repeat-offence audit: Unit 5 operated for an extended period with the FGD (flue-gas desulphurisation) plant bypassed and below the availability floor.',
  'Findings: prolonged operation outside the licence emissions-abatement condition and below the availability floor; a recurrence of a previously-directed contravention.',
  'Directive previously issued and not adequately complied with within the cure window.',
  'Financial PENALTY imposed under ERA §34 for the repeat critical contravention: R12.5m fixed plus a continuing penalty of R250k/day until the FGD plant is returned to service. Matter crosses to the NERSA Council enforcement-oversight register (critical tier).',
  12500000, 250000,
  'FIND-2026-0007', 'DIR-2025-0061', 'PEN-2026-0007', 'repeat_security_of_supply', 1, 1,
  'penalty_imposed', '2026-03-10 08:00:00', '2026-03-16 09:00:00', '2026-03-24 09:00:00', '2026-03-28 09:00:00', '2026-04-04 09:00:00', '2026-04-18 09:00:00', '2026-05-02 09:00:00', 'demo_regulator_001'
);

-- 8) withdrawn — minor, administrative matter resolved at intake (terminal)
INSERT OR IGNORE INTO oe_compliance_inspections (
  id, inspection_number,
  officer_party_id, officer_party_name, respondent_party_id, respondent_party_name,
  licence_ref, facility_name, inspection_trigger, contravention_tier, licence_condition_ref,
  inspection_basis, reason_code, rod_notes,
  chain_status, inspection_scheduled_at, inspection_in_progress_at, withdrawn_at, created_by
) VALUES (
  'cinsp_008', 'CINS-2026-0008',
  'nersa', 'NERSA (Compliance & Enforcement)', 'sseg_woolworths', 'Woolworths (Pty) Ltd (SSEG)',
  'SSEG-REG-2023-1144', 'Woolworths Midrand DC Rooftop PV (4.5MW)', 'complaint', 'minor', 'SSEG registration — wheeling notification',
  'Scheduled inspection into an alleged unregistered wheeling arrangement for the rooftop SSEG installation.',
  'no_contravention_superseded', 'WITHDRAWN before findings: on opening the inspection the inspectorate confirmed the SSEG was correctly registered and the wheeling notification had in fact been lodged (mis-filed by the distributor, not the respondent). No contravention; matter withdrawn at officer level.',
  'withdrawn', '2026-05-05 08:00:00', '2026-05-09 09:00:00', '2026-05-13 09:00:00', 'demo_regulator_001'
);

-- 9) compliant_closed — serious, FULL happy path (terminal) — traverses remediation_verified
INSERT OR IGNORE INTO oe_compliance_inspections (
  id, inspection_number,
  officer_party_id, officer_party_name, respondent_party_id, respondent_party_name,
  licence_ref, facility_name, inspection_trigger, contravention_tier, licence_condition_ref,
  inspection_basis, findings_basis, directive_basis, remediation_basis, remediation_cost_zar, reason_code, rod_notes,
  findings_ref, directive_ref,
  chain_status, inspection_scheduled_at, inspection_in_progress_at, findings_drafted_at, findings_issued_at, directive_issued_at, remediation_underway_at, remediation_verified_at, compliant_closed_at, created_by
) VALUES (
  'cinsp_009', 'CINS-2026-0009',
  'nersa', 'NERSA (Compliance & Enforcement)', 'nelson_mandela_bay', 'Nelson Mandela Bay Municipality (Electricity)',
  'DIST-LIC-2010-0033', 'NMB Distribution Licence Area', 'routine', 'serious', 'Grid Code — annual network performance reporting',
  'Routine compliance inspection of distribution-licensee Grid Code performance reporting.',
  'Findings: the licensee''s annual network-performance report omitted the required SAIDI/SAIFI reliability disclosures and the embedded-generation register. Material licence-condition breach.',
  'Directive issued: submit the complete network-performance report with reliability indices and the SSEG register within 30 days.',
  'Remediation completed: licensee submitted the full report including SAIDI 28.4h / SAIFI 22.1 and a reconciled 41.6MW embedded-generation register. Cost of compilation R3.2m.',
  3200000,
  'remediated_verified_clean',
  'Full happy path: scheduled → in_progress → findings drafted → findings issued → directive → remediation → VERIFIED → CLOSED COMPLIANT. The licensee fully remediated within the directive window; inspectorate verified the resubmission against the Grid Code reporting schedule and closed the matter as compliant. No penalty.',
  'FIND-2026-0009', 'DIR-2026-0009',
  'compliant_closed', '2026-02-20 08:00:00', '2026-02-25 09:00:00', '2026-03-04 09:00:00', '2026-03-09 09:00:00', '2026-03-14 09:00:00', '2026-03-20 09:00:00', '2026-04-15 09:00:00', '2026-04-22 09:00:00', 'demo_regulator_001'
);

-- 10) enforcement_closed — critical, penalty → Tribunal appeal → resolved (terminal) — W31 disp_009 provenance
INSERT OR IGNORE INTO oe_compliance_inspections (
  id, inspection_number,
  source_event, source_entity_type, source_entity_id, source_wave,
  officer_party_id, officer_party_name, respondent_party_id, respondent_party_name,
  licence_ref, facility_name, inspection_trigger, contravention_tier, licence_condition_ref,
  inspection_basis, findings_basis, directive_basis, penalty_basis, appeal_basis, penalty_amount_zar,
  findings_ref, directive_ref, penalty_ref, appeal_ref, tribunal_ref, reason_code, is_reportable, escalation_level, rod_notes,
  chain_status, inspection_scheduled_at, inspection_in_progress_at, findings_drafted_at, findings_issued_at, directive_issued_at, penalty_imposed_at, appealed_at, enforcement_closed_at, created_by
) VALUES (
  'cinsp_010', 'CINS-2025-0010',
  'disposition.escalated', 'disposition_case', 'disp_009', 'W31',
  'nersa', 'NERSA (Compliance & Enforcement)', 'ipp_solar_capital', 'Solar Capital De Aar (Pty) Ltd',
  'GEN-LIC-2013-0156', 'De Aar 175MW Solar PV', 'incident', 'critical', 'ERA s10(g) — safe operation; OHSA interface conditions',
  'Own-initiative §10 inspection opened after the W31 disposition disp_009 escalation (itself arising from the W25 fatal arc-flash) was referred to the NERSA Council enforcement panel.',
  'Findings: systemic failures in the HV permit-to-work and lockout/tagout regime caused the fatal arc-flash; the licensee operated outside its safe-operation licence condition. Critical contravention.',
  'Directive issued requiring a full electrical-safety management-system overhaul and independent re-audit; respondent''s remediation found materially incomplete at the verification gate.',
  'Financial PENALTY of R45m imposed under ERA §34 for the critical safe-operation contravention. Crosses to the NERSA Council enforcement-oversight register (critical tier).',
  'Respondent lodged a statutory APPEAL to the NERSA Tribunal contesting the quantum (not liability). Appeal crosses to the Tribunal docket (universal — every tier).',
  45000000,
  'FIND-2025-0010', 'DIR-2025-0010', 'PEN-2025-0010', 'APP-2025-0010', 'NERSA-TRIBUNAL-2025-0011', 'fatal_safe_operation_enforced', 1, 2,
  'ENFORCEMENT CLOSED via Tribunal determination: the NERSA Tribunal upheld liability and reduced the penalty from R45m to R30m, confirming the directed safety-management overhaul. Full enforcement arc: findings → directive → penalty → Tribunal appeal → resolved. Linked to W31 disp_009 (W25 fatal arc-flash). Tribunal ref NERSA-TRIBUNAL-2025-0011.',
  'enforcement_closed', '2025-11-10 08:00:00', '2025-11-17 09:00:00', '2025-11-28 09:00:00', '2025-12-04 09:00:00', '2025-12-12 09:00:00', '2026-01-15 09:00:00', '2026-01-26 09:00:00', '2026-04-10 09:00:00', 'demo_regulator_001'
);

-- ─── EVENTS ────────────────────────────────────────────────────────────────

-- cinsp_001 (inspection_scheduled)
INSERT OR IGNORE INTO oe_compliance_inspections_events (id, inspection_id, event_type, from_status, to_status, actor_id, actor_party, notes, created_at) VALUES
('cinspv_001_a', 'cinsp_001', 'compliance_inspection.inspection_scheduled', null, 'inspection_scheduled', 'nersa', 'officer', 'Own-initiative safety inspection scheduled following W25 fatal arc-flash (hse_009)', '2026-05-20 08:00:00');

-- cinsp_002 (inspection_in_progress)
INSERT OR IGNORE INTO oe_compliance_inspections_events (id, inspection_id, event_type, from_status, to_status, actor_id, actor_party, notes, created_at) VALUES
('cinspv_002_a', 'cinsp_002', 'compliance_inspection.inspection_scheduled', null, 'inspection_scheduled', 'nersa', 'officer', 'Complaint-driven QoS inspection scheduled', '2026-05-08 08:00:00'),
('cinspv_002_b', 'cinsp_002', 'compliance_inspection.inspection_in_progress', 'inspection_scheduled', 'inspection_in_progress', 'nersa', 'officer', 'Inspectorate on site reviewing voltage-regulation + NRS 048-2 records', '2026-05-12 09:00:00');

-- cinsp_003 (findings_drafted)
INSERT OR IGNORE INTO oe_compliance_inspections_events (id, inspection_id, event_type, from_status, to_status, actor_id, actor_party, notes, created_at) VALUES
('cinspv_003_a', 'cinsp_003', 'compliance_inspection.inspection_scheduled', null, 'inspection_scheduled', 'nersa', 'officer', 'Thematic reporting-discipline inspection scheduled', '2026-04-20 08:00:00'),
('cinspv_003_b', 'cinsp_003', 'compliance_inspection.inspection_in_progress', 'inspection_scheduled', 'inspection_in_progress', 'nersa', 'officer', 'Reviewing quarterly compliance-return filing dates', '2026-04-24 09:00:00'),
('cinspv_003_c', 'cinsp_003', 'compliance_inspection.findings_drafted', 'inspection_in_progress', 'findings_drafted', 'nersa', 'officer', 'Draft findings: Q3/Q4 returns 18/24 days late — administrative, no penalty recommended', '2026-05-06 09:00:00');

-- cinsp_004 (findings_issued)
INSERT OR IGNORE INTO oe_compliance_inspections_events (id, inspection_id, event_type, from_status, to_status, actor_id, actor_party, notes, created_at) VALUES
('cinspv_004_a', 'cinsp_004', 'compliance_inspection.inspection_scheduled', null, 'inspection_scheduled', 'nersa', 'officer', 'Availability audit scheduled', '2026-04-15 08:00:00'),
('cinspv_004_b', 'cinsp_004', 'compliance_inspection.inspection_in_progress', 'inspection_scheduled', 'inspection_in_progress', 'nersa', 'officer', 'Auditing declared EAF + unplanned-trip reporting', '2026-04-20 09:00:00'),
('cinspv_004_c', 'cinsp_004', 'compliance_inspection.findings_drafted', 'inspection_in_progress', 'findings_drafted', 'nersa', 'officer', 'Draft findings: EAF 41% vs 60% floor; 5 trips under-reported', '2026-04-28 09:00:00'),
('cinspv_004_d', 'cinsp_004', 'compliance_inspection.findings_issued', 'findings_drafted', 'findings_issued', 'nersa', 'officer', 'Findings ISSUED — critical security-of-supply contravention; statutory response window opens', '2026-05-04 09:00:00');

-- cinsp_005 (directive_issued)
INSERT OR IGNORE INTO oe_compliance_inspections_events (id, inspection_id, event_type, from_status, to_status, actor_id, actor_party, notes, created_at) VALUES
('cinspv_005_a', 'cinsp_005', 'compliance_inspection.inspection_scheduled', null, 'inspection_scheduled', 'nersa', 'officer', 'Metering/billing complaint inspection scheduled', '2026-04-10 08:00:00'),
('cinspv_005_b', 'cinsp_005', 'compliance_inspection.inspection_in_progress', 'inspection_scheduled', 'inspection_in_progress', 'nersa', 'officer', 'Reviewing meter-reading + estimated-billing records', '2026-04-15 09:00:00'),
('cinspv_005_c', 'cinsp_005', 'compliance_inspection.findings_drafted', 'inspection_in_progress', 'findings_drafted', 'nersa', 'officer', 'Draft findings: 14% LPU meters unread >3 cycles; NRS 047 breach', '2026-04-22 09:00:00'),
('cinspv_005_d', 'cinsp_005', 'compliance_inspection.findings_issued', 'findings_drafted', 'findings_issued', 'nersa', 'officer', 'Findings issued — material licence-condition breach', '2026-04-26 09:00:00'),
('cinspv_005_e', 'cinsp_005', 'compliance_inspection.directive_issued', 'findings_issued', 'directive_issued', 'nersa', 'officer', 'Compliance DIRECTIVE issued under §10 — read meters, re-bill on actuals, submit remediation plan', '2026-05-02 09:00:00');

-- cinsp_006 (remediation_underway — respondent began)
INSERT OR IGNORE INTO oe_compliance_inspections_events (id, inspection_id, event_type, from_status, to_status, actor_id, actor_party, notes, created_at) VALUES
('cinspv_006_a', 'cinsp_006', 'compliance_inspection.inspection_scheduled', null, 'inspection_scheduled', 'nersa', 'officer', 'Ride-through incident inspection scheduled', '2026-03-28 08:00:00'),
('cinspv_006_b', 'cinsp_006', 'compliance_inspection.inspection_in_progress', 'inspection_scheduled', 'inspection_in_progress', 'nersa', 'officer', 'Reviewing protection settings + relay coordination study', '2026-04-02 09:00:00'),
('cinspv_006_c', 'cinsp_006', 'compliance_inspection.findings_drafted', 'inspection_in_progress', 'findings_drafted', 'nersa', 'officer', 'Draft findings: non-compliant under-voltage protection envelope', '2026-04-08 09:00:00'),
('cinspv_006_d', 'cinsp_006', 'compliance_inspection.findings_issued', 'findings_drafted', 'findings_issued', 'nersa', 'officer', 'Findings issued — critical Grid Code contravention', '2026-04-12 09:00:00'),
('cinspv_006_e', 'cinsp_006', 'compliance_inspection.directive_issued', 'findings_issued', 'directive_issued', 'nersa', 'officer', 'Directive issued — recommission relays + independent coordination study', '2026-04-16 09:00:00'),
('cinspv_006_f', 'cinsp_006', 'compliance_inspection.remediation_underway', 'directive_issued', 'remediation_underway', 'ipp_longyuan_dewind', 'respondent', 'Respondent began remediation — relays reprogrammed on 28/48 strings; study commissioned (R8.4m)', '2026-04-22 09:00:00');

-- cinsp_007 (penalty_imposed — crosses regulator, critical)
INSERT OR IGNORE INTO oe_compliance_inspections_events (id, inspection_id, event_type, from_status, to_status, actor_id, actor_party, notes, created_at) VALUES
('cinspv_007_a', 'cinsp_007', 'compliance_inspection.inspection_scheduled', null, 'inspection_scheduled', 'nersa', 'officer', 'Repeat-offence emissions/availability audit scheduled', '2026-03-10 08:00:00'),
('cinspv_007_b', 'cinsp_007', 'compliance_inspection.inspection_in_progress', 'inspection_scheduled', 'inspection_in_progress', 'nersa', 'officer', 'Auditing FGD-bypass operation + availability', '2026-03-16 09:00:00'),
('cinspv_007_c', 'cinsp_007', 'compliance_inspection.findings_drafted', 'inspection_in_progress', 'findings_drafted', 'nersa', 'officer', 'Draft findings: prolonged FGD-bypass operation; repeat contravention', '2026-03-24 09:00:00'),
('cinspv_007_d', 'cinsp_007', 'compliance_inspection.findings_issued', 'findings_drafted', 'findings_issued', 'nersa', 'officer', 'Findings issued — critical emissions/availability contravention', '2026-03-28 09:00:00'),
('cinspv_007_e', 'cinsp_007', 'compliance_inspection.directive_issued', 'findings_issued', 'directive_issued', 'nersa', 'officer', 'Directive issued — return FGD to service', '2026-04-04 09:00:00'),
('cinspv_007_f', 'cinsp_007', 'compliance_inspection.penalty_imposed', 'directive_issued', 'penalty_imposed', 'nersa', 'officer', 'PENALTY imposed under §34: R12.5m + R250k/day. Crosses NERSA Council (critical).', '2026-04-18 09:00:00');

-- cinsp_008 (withdrawn — minor)
INSERT OR IGNORE INTO oe_compliance_inspections_events (id, inspection_id, event_type, from_status, to_status, actor_id, actor_party, notes, created_at) VALUES
('cinspv_008_a', 'cinsp_008', 'compliance_inspection.inspection_scheduled', null, 'inspection_scheduled', 'nersa', 'officer', 'SSEG wheeling-notification inspection scheduled', '2026-05-05 08:00:00'),
('cinspv_008_b', 'cinsp_008', 'compliance_inspection.inspection_in_progress', 'inspection_scheduled', 'inspection_in_progress', 'nersa', 'officer', 'Verifying SSEG registration + wheeling notification', '2026-05-09 09:00:00'),
('cinspv_008_c', 'cinsp_008', 'compliance_inspection.withdrawn', 'inspection_in_progress', 'withdrawn', 'nersa', 'officer', 'WITHDRAWN — SSEG correctly registered; notification mis-filed by distributor. No contravention.', '2026-05-13 09:00:00');

-- cinsp_009 (compliant_closed — full happy path, traverses remediation_verified)
INSERT OR IGNORE INTO oe_compliance_inspections_events (id, inspection_id, event_type, from_status, to_status, actor_id, actor_party, notes, created_at) VALUES
('cinspv_009_a', 'cinsp_009', 'compliance_inspection.inspection_scheduled', null, 'inspection_scheduled', 'nersa', 'officer', 'Routine Grid Code performance-reporting inspection scheduled', '2026-02-20 08:00:00'),
('cinspv_009_b', 'cinsp_009', 'compliance_inspection.inspection_in_progress', 'inspection_scheduled', 'inspection_in_progress', 'nersa', 'officer', 'Reviewing annual network-performance report', '2026-02-25 09:00:00'),
('cinspv_009_c', 'cinsp_009', 'compliance_inspection.findings_drafted', 'inspection_in_progress', 'findings_drafted', 'nersa', 'officer', 'Draft findings: missing SAIDI/SAIFI + embedded-generation register', '2026-03-04 09:00:00'),
('cinspv_009_d', 'cinsp_009', 'compliance_inspection.findings_issued', 'findings_drafted', 'findings_issued', 'nersa', 'officer', 'Findings issued — material reporting breach', '2026-03-09 09:00:00'),
('cinspv_009_e', 'cinsp_009', 'compliance_inspection.directive_issued', 'findings_issued', 'directive_issued', 'nersa', 'officer', 'Directive issued — resubmit complete report within 30 days', '2026-03-14 09:00:00'),
('cinspv_009_f', 'cinsp_009', 'compliance_inspection.remediation_underway', 'directive_issued', 'remediation_underway', 'nelson_mandela_bay', 'respondent', 'Respondent began compiling the full report (R3.2m)', '2026-03-20 09:00:00'),
('cinspv_009_g', 'cinsp_009', 'compliance_inspection.remediation_verified', 'remediation_underway', 'remediation_verified', 'nersa', 'officer', 'Inspectorate verified resubmission: SAIDI 28.4h / SAIFI 22.1 + 41.6MW SSEG register', '2026-04-15 09:00:00'),
('cinspv_009_h', 'cinsp_009', 'compliance_inspection.compliant_closed', 'remediation_verified', 'compliant_closed', 'nersa', 'officer', 'CLOSED COMPLIANT — fully remediated within the directive window; no penalty', '2026-04-22 09:00:00');

-- cinsp_010 (enforcement_closed — penalty → Tribunal appeal → resolved, W31 disp_009 provenance)
INSERT OR IGNORE INTO oe_compliance_inspections_events (id, inspection_id, event_type, from_status, to_status, actor_id, actor_party, notes, created_at) VALUES
('cinspv_010_a', 'cinsp_010', 'compliance_inspection.inspection_scheduled', null, 'inspection_scheduled', 'nersa', 'officer', 'Own-initiative inspection opened from W31 disp_009 escalation (W25 fatal arc-flash)', '2025-11-10 08:00:00'),
('cinspv_010_b', 'cinsp_010', 'compliance_inspection.inspection_in_progress', 'inspection_scheduled', 'inspection_in_progress', 'nersa', 'officer', 'Inspecting HV permit-to-work + LOTO regime', '2025-11-17 09:00:00'),
('cinspv_010_c', 'cinsp_010', 'compliance_inspection.findings_drafted', 'inspection_in_progress', 'findings_drafted', 'nersa', 'officer', 'Draft findings: systemic safe-operation failures caused the fatality', '2025-11-28 09:00:00'),
('cinspv_010_d', 'cinsp_010', 'compliance_inspection.findings_issued', 'findings_drafted', 'findings_issued', 'nersa', 'officer', 'Findings issued — critical safe-operation contravention', '2025-12-04 09:00:00'),
('cinspv_010_e', 'cinsp_010', 'compliance_inspection.directive_issued', 'findings_issued', 'directive_issued', 'nersa', 'officer', 'Directive issued — full ESMS overhaul + independent re-audit', '2025-12-12 09:00:00'),
('cinspv_010_f', 'cinsp_010', 'compliance_inspection.penalty_imposed', 'directive_issued', 'penalty_imposed', 'nersa', 'officer', 'PENALTY R45m imposed under §34 (remediation materially incomplete). Crosses NERSA Council (critical).', '2026-01-15 09:00:00'),
('cinspv_010_g', 'cinsp_010', 'compliance_inspection.appealed', 'penalty_imposed', 'appealed', 'ipp_solar_capital', 'respondent', 'Respondent lodged a NERSA Tribunal appeal on quantum. Crosses Tribunal docket (universal).', '2026-01-26 09:00:00'),
('cinspv_010_h', 'cinsp_010', 'compliance_inspection.enforcement_closed', 'appealed', 'enforcement_closed', 'nersa', 'officer', 'Tribunal upheld liability, reduced penalty R45m→R30m. ENFORCEMENT CLOSED (NERSA-TRIBUNAL-2025-0011).', '2026-04-10 09:00:00');
