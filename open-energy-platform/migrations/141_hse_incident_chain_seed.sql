-- Wave 25: HSE/SHEQ incident chain seed — 9 incidents across all lifecycle states
-- OHSA Section 24 (DEL) + NEMA Section 30 (DFFE)
-- Tiers: fatal | major | environmental | minor | near_miss
-- Cross-wave links: linked_wo_id to W16 (work orders)

INSERT OR IGNORE INTO oe_hse_incidents
(id, case_number, site_id, site_name, project_id, occurred_at, reported_at, reported_by, incident_type, incident_tier, location_description, persons_affected, injury_description, environmental_release_description, immediate_actions_taken, rca_summary, capa_plan, linked_wo_id, authority_notified, authority, authority_ref, chain_status, triaged_at, notified_authority_at, investigating_at, corrective_actions_planned_at, corrective_actions_executing_at, verified_at, escalated_at, false_alarm_at, closed_at, closure_notes, sla_deadline_at, last_sla_breach_at, escalation_level, created_by, created_at)
VALUES

-- hse_001 reported (just-in; near-miss at C&I site) - control of initial state
('hse_001', 'HSE-2026-0001', 'site_brackenfell_ci', 'Brackenfell C&I Rooftop', NULL, '2026-05-28T07:15:00Z', '2026-05-28T07:45:00Z', 'sup_brackenfell', 'near_miss', 'near_miss', 'East rooftop, near inverter cabinet INV-04', 0, NULL, NULL, 'Cordoned area; powered down INV-04', NULL, NULL, NULL, 0, NULL, NULL, 'reported', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-05-30T07:45:00Z', NULL, 0, 'sup_brackenfell', '2026-05-28T07:45:00Z'),

-- hse_002 triaged (minor injury at Esums O&M; first-aid level)
('hse_002', 'HSE-2026-0002', 'site_mooi_river', 'Mooi River Solar', NULL, '2026-05-27T11:30:00Z', '2026-05-27T11:50:00Z', 'tech_mooi_river_03', 'injury', 'minor', 'Inverter row 5, southeast quadrant', 1, 'Technician lacerated left forearm on metal flange; 4 stitches on-site clinic; back on shift after 90min', NULL, 'First-aid applied; tetanus booster; flange edge filed and PPE inspection', NULL, NULL, NULL, 0, NULL, NULL, 'triaged', '2026-05-27T12:30:00Z', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-06-03T12:30:00Z', NULL, 0, 'sup_mooi_river', '2026-05-27T11:50:00Z'),

-- hse_003 notified_authority (environmental release at IPP construction site; NEMA s30)
('hse_003', 'HSE-2026-0003', 'site_loeriesfontein2', 'Loeriesfontein 2 Wind', 'proj_loeriesfontein2', '2026-05-25T14:20:00Z', '2026-05-25T15:00:00Z', 'epc_safety_off_01', 'environmental_release', 'environmental', 'Substation construction pad; transformer fluid bund', 0, NULL, 'Approximately 320 litres of mineral transformer oil released from cracked containment liner during commissioning fill; soil contamination footprint ~12m²', 'Spill kit deployed; bund isolated; contaminated soil staged for treatment', NULL, NULL, NULL, 1, 'DFFE', 'DFFE-NEMA30-2026-1142', 'notified_authority', '2026-05-25T17:30:00Z', '2026-05-26T10:00:00Z', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-06-25T10:00:00Z', NULL, 0, 'epc_safety_off_01', '2026-05-25T15:00:00Z'),

-- hse_004 investigating (major OHS at IPP construction; DEL notified, deep into RCA)
('hse_004', 'HSE-2026-0004', 'site_kuruman', 'Kuruman Solar', 'proj_kuruman', '2026-05-18T09:45:00Z', '2026-05-18T10:00:00Z', 'site_safety_kuruman', 'injury', 'major', 'Tracker installation row C, pile P-184', 1, 'Pile driver operator pinned right leg between tracker frame and bedrock; tibia fracture; airlift to Kimberley. >14 days off projected.', NULL, 'Site stop-work; medivac; DEL notified', 'Investigation ongoing — preliminary: hydraulic ram of tracker frame failed restraint catch; OEM Soltec advisory pending', NULL, NULL, 1, 'DEL', 'DEL-OHSA24-2026-0287', 'investigating', '2026-05-18T13:00:00Z', '2026-05-18T17:30:00Z', '2026-05-20T08:00:00Z', NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-05-27T08:00:00Z', '2026-05-27T08:00:00Z', 1, 'site_safety_kuruman', '2026-05-18T10:00:00Z'),

-- hse_005 corrective_actions_planned (environmental release at Esums O&M, CAPA plan locked)
('hse_005', 'HSE-2026-0005', 'site_aggeneys', 'Aggeneys Solar', NULL, '2026-04-22T08:00:00Z', '2026-04-22T08:30:00Z', 'om_lead_aggeneys', 'environmental_release', 'environmental', 'Battery storage container BESS-02; coolant leak', 0, NULL, 'Approximately 85L of glycol coolant released to bunded floor; recovered via spill kit; no soil exfiltration', 'Coolant loop isolated; BESS-02 derated to 0%', 'Hose fitting #3 corrosion failure; OEM CATL acknowledges; replace all fittings on BESS-01 to BESS-04 + 90d inspection cycle', 'Fleet retrofit + monthly inspection regime for first 90d', NULL, 1, 'DFFE', 'DFFE-NEMA30-2026-0998', 'corrective_actions_planned', '2026-04-22T11:00:00Z', '2026-04-23T09:00:00Z', '2026-04-25T08:00:00Z', '2026-05-02T14:00:00Z', NULL, NULL, NULL, NULL, NULL, NULL, '2026-06-01T14:00:00Z', NULL, 0, 'om_lead_aggeneys', '2026-04-22T08:30:00Z'),

-- hse_006 corrective_actions_executing (major injury at Esums O&M, CAPA in progress, linked WO)
('hse_006', 'HSE-2026-0006', 'site_roggeveld', 'Roggeveld Wind', NULL, '2026-04-10T13:00:00Z', '2026-04-10T13:15:00Z', 'om_lead_roggeveld', 'injury', 'major', 'WTG-07 nacelle; lift platform', 1, 'Technician fell 1.8m from nacelle service platform when fall-arrest anchor pulled out of corroded socket; broken collarbone, 21 days off', NULL, 'Site stop-work; medivac; DEL notified within 6h', 'Fall-arrest socket corrosion exceeded inspection threshold; previous inspection (2025-Q4) marked GREEN in error', 'Fleet-wide nacelle anchor re-inspection + socket replacement on 18 turbines; revised inspection SOP', 'wo_2026_0091', 1, 'DEL', 'DEL-OHSA24-2026-0254', 'corrective_actions_executing', '2026-04-10T16:00:00Z', '2026-04-11T08:00:00Z', '2026-04-13T08:00:00Z', '2026-04-21T11:00:00Z', '2026-04-28T14:00:00Z', NULL, NULL, NULL, NULL, NULL, '2026-06-27T14:00:00Z', NULL, 0, 'om_lead_roggeveld', '2026-04-10T13:15:00Z'),

-- hse_007 verified (environmental release fully remediated, soil tested clean, awaiting DFFE sign-off)
('hse_007', 'HSE-2026-0007', 'site_welkom', 'Welkom Solar Park', NULL, '2026-03-08T10:00:00Z', '2026-03-08T10:45:00Z', 'om_lead_welkom', 'environmental_release', 'environmental', 'Substation transformer T-2 secondary bund', 0, NULL, 'Approximately 480L of mineral oil released from T-2 silica-gel breather rupture; bund fully contained; no off-site release', 'Bund isolated; pumped out; T-2 taken offline', 'Breather sealed against thermal cycling fatigue; OEM advisory T-21B replaced 4 units across fleet', 'Replace silica-gel breather assembly on all 4 transformers in 2024 batch; quarterly inspection', 'wo_2026_0044', 1, 'DFFE', 'DFFE-NEMA30-2026-0734', 'verified', '2026-03-08T13:00:00Z', '2026-03-10T09:00:00Z', '2026-03-12T09:00:00Z', '2026-03-19T11:00:00Z', '2026-03-26T14:00:00Z', '2026-04-22T15:00:00Z', NULL, NULL, NULL, NULL, '2026-05-22T15:00:00Z', NULL, 0, 'om_lead_welkom', '2026-03-08T10:45:00Z'),

-- hse_008 closed (fatal incident at IPP construction, fully closed, regulator-grade audit trail)
('hse_008', 'HSE-2026-0008', 'site_riebeeckstad', 'Riebeeckstad Solar', 'proj_riebeeckstad', '2026-01-22T11:30:00Z', '2026-01-22T11:35:00Z', 'epc_safety_off_02', 'fatality', 'fatal', 'Substation bay, MV cable termination work', 1, 'Cable jointer received 11kV arc-flash injury during termination; declared deceased on-site; widow + 2 minors', NULL, 'Site stop-work; SAPS + DEL on-site within 90 min; MV bay LOTO verified', 'LOTO breach — upstream isolator left racked-in by maintenance team in previous shift; sign-off forged in handover log', 'Mandatory 2-person LOTO verification; biometric handover log; criminal proceedings handed to NPA', 'wo_2026_0011', 1, 'DEL', 'DEL-OHSA24-2026-0118', 'closed', '2026-01-22T12:30:00Z', '2026-01-22T17:30:00Z', '2026-01-24T08:00:00Z', '2026-02-15T11:00:00Z', '2026-02-22T14:00:00Z', '2026-03-18T15:00:00Z', NULL, NULL, '2026-04-02T10:00:00Z', 'DEL inspector report concurrence; CAPA closed; widow compensation handled by FSCA-monitored insurer; criminal proceedings ongoing', NULL, NULL, 0, 'epc_safety_off_02', '2026-01-22T11:35:00Z'),

-- hse_009 escalated (DEL inspector enforcement action; major incident pulled into formal enforcement)
('hse_009', 'HSE-2026-0009', 'site_loeriesfontein2', 'Loeriesfontein 2 Wind', 'proj_loeriesfontein2', '2026-02-14T15:00:00Z', '2026-02-14T15:30:00Z', 'epc_safety_off_01', 'injury', 'major', 'Wind tower base, crane lift operation', 2, 'Two riggers struck by swinging tower-section flange during lift; concussion + fractured arm; both >14 days off; DEL inspector arrived 36h later and issued Section 30 prohibition order', NULL, 'Site stop-work; medivacs; DEL notified', 'Crane wind-speed override active; SOP requires hard-stop at 12 m/s, override allowed lift at 17 m/s gusts', 'CAPA in progress: rip out crane override switches; recertify all 11 riggers; permit-to-lift review across all towers', 'wo_2026_0067', 1, 'DEL', 'DEL-OHSA24-2026-0162', 'escalated', '2026-02-14T17:00:00Z', '2026-02-15T08:00:00Z', '2026-02-17T08:00:00Z', '2026-02-22T11:00:00Z', '2026-03-01T14:00:00Z', NULL, '2026-03-12T11:00:00Z', NULL, NULL, NULL, '2026-04-11T11:00:00Z', '2026-04-11T11:00:00Z', 2, 'epc_safety_off_01', '2026-02-14T15:30:00Z'),

-- hse_010 false_alarm (initial near-miss flagged but later revised to no-incident)
('hse_010', 'HSE-2026-0010', 'site_hluleka_clinic', 'Hluleka Clinic Microgrid', NULL, '2026-05-19T14:00:00Z', '2026-05-19T14:30:00Z', 'clinic_nurse_supervisor', 'near_miss', 'near_miss', 'Battery cabinet exterior; visual smoke report', 0, NULL, NULL, 'Cabinet powered down; thermal scan performed', 'Visual smoke turned out to be coastal sea-spray condensation evaporating off warm cabinet surface in afternoon sun; no fault detected', NULL, NULL, 0, NULL, NULL, 'false_alarm', '2026-05-19T15:30:00Z', NULL, NULL, NULL, NULL, NULL, NULL, '2026-05-19T17:00:00Z', NULL, 'Re-classified as no-incident; thermal log retained for trend analysis', NULL, NULL, 0, 'clinic_nurse_supervisor', '2026-05-19T14:30:00Z');

-- Audit events
INSERT OR IGNORE INTO oe_hse_incident_events (id, incident_id, event_type, from_status, to_status, actor_id, notes, payload, created_at) VALUES

-- hse_002 triaged (1)
('hse_evt_001', 'hse_002', 'hse_incident.triaged', 'reported', 'triaged', 'sup_mooi_river', 'Minor lacerations classified as minor tier; first-aid only; no DEL notification needed', NULL, '2026-05-27T12:30:00Z'),

-- hse_003 notified_authority (2)
('hse_evt_002', 'hse_003', 'hse_incident.triaged', 'reported', 'triaged', 'epc_safety_off_01', 'Transformer oil release classified as environmental tier; NEMA s30 reportable', NULL, '2026-05-25T17:30:00Z'),
('hse_evt_003', 'hse_003', 'hse_incident.notified_authority', 'triaged', 'notified_authority', 'epc_safety_off_01', 'DFFE notified per NEMA Section 30; reference DFFE-NEMA30-2026-1142', NULL, '2026-05-26T10:00:00Z'),

-- hse_004 investigating (4 — includes SLA breach)
('hse_evt_004', 'hse_004', 'hse_incident.triaged', 'reported', 'triaged', 'site_safety_kuruman', 'Pile driver injury classified as major; OHSA s24 reportable; >14 days off projected', NULL, '2026-05-18T13:00:00Z'),
('hse_evt_005', 'hse_004', 'hse_incident.notified_authority', 'triaged', 'notified_authority', 'site_safety_kuruman', 'DEL notified within 8h per OHSA s24; reference DEL-OHSA24-2026-0287', NULL, '2026-05-18T17:30:00Z'),
('hse_evt_006', 'hse_004', 'hse_incident.investigating', 'notified_authority', 'investigating', 'site_safety_kuruman', 'OEM Soltec engaged; hydraulic ram restraint catch failure mode under analysis', NULL, '2026-05-20T08:00:00Z'),
('hse_evt_007', 'hse_004', 'hse_incident.sla_breached', 'investigating', 'investigating', 'system', 'Investigation SLA breached at 7-day mark per OHSA s24; escalation level 1', NULL, '2026-05-27T08:00:00Z'),

-- hse_005 corrective_actions_planned (4)
('hse_evt_008', 'hse_005', 'hse_incident.triaged', 'reported', 'triaged', 'om_lead_aggeneys', 'BESS coolant release; environmental tier; NEMA s30 reportable', NULL, '2026-04-22T11:00:00Z'),
('hse_evt_009', 'hse_005', 'hse_incident.notified_authority', 'triaged', 'notified_authority', 'om_lead_aggeneys', 'DFFE notified within 24h; ref DFFE-NEMA30-2026-0998', NULL, '2026-04-23T09:00:00Z'),
('hse_evt_010', 'hse_005', 'hse_incident.investigating', 'notified_authority', 'investigating', 'om_lead_aggeneys', 'OEM CATL engaged; coolant loop diagnostic + fleet-wide fitting inspection', NULL, '2026-04-25T08:00:00Z'),
('hse_evt_011', 'hse_005', 'hse_incident.corrective_actions_planned', 'investigating', 'corrective_actions_planned', 'om_lead_aggeneys', 'CAPA: retrofit all BESS hose fittings; 90-day enhanced inspection regime', NULL, '2026-05-02T14:00:00Z'),

-- hse_006 corrective_actions_executing (5)
('hse_evt_012', 'hse_006', 'hse_incident.triaged', 'reported', 'triaged', 'om_lead_roggeveld', 'Fall-from-height; major tier; OHSA s24 reportable; 21d off', NULL, '2026-04-10T16:00:00Z'),
('hse_evt_013', 'hse_006', 'hse_incident.notified_authority', 'triaged', 'notified_authority', 'om_lead_roggeveld', 'DEL notified within 6h; ref DEL-OHSA24-2026-0254', NULL, '2026-04-11T08:00:00Z'),
('hse_evt_014', 'hse_006', 'hse_incident.investigating', 'notified_authority', 'investigating', 'om_lead_roggeveld', 'Fall-arrest socket corrosion analysis; previous inspection re-audited', NULL, '2026-04-13T08:00:00Z'),
('hse_evt_015', 'hse_006', 'hse_incident.corrective_actions_planned', 'investigating', 'corrective_actions_planned', 'om_lead_roggeveld', 'Fleet-wide socket replacement + revised SOP; 18 WTGs', NULL, '2026-04-21T11:00:00Z'),
('hse_evt_016', 'hse_006', 'hse_incident.corrective_actions_executing', 'corrective_actions_planned', 'corrective_actions_executing', 'om_lead_roggeveld', 'WO wo_2026_0091 dispatched for fleet socket replacement', NULL, '2026-04-28T14:00:00Z'),

-- hse_007 verified (6)
('hse_evt_017', 'hse_007', 'hse_incident.triaged', 'reported', 'triaged', 'om_lead_welkom', 'Transformer oil release; environmental tier; NEMA s30 reportable', NULL, '2026-03-08T13:00:00Z'),
('hse_evt_018', 'hse_007', 'hse_incident.notified_authority', 'triaged', 'notified_authority', 'om_lead_welkom', 'DFFE notified; ref DFFE-NEMA30-2026-0734', NULL, '2026-03-10T09:00:00Z'),
('hse_evt_019', 'hse_007', 'hse_incident.investigating', 'notified_authority', 'investigating', 'om_lead_welkom', 'Silica-gel breather failure analysis under OEM warranty', NULL, '2026-03-12T09:00:00Z'),
('hse_evt_020', 'hse_007', 'hse_incident.corrective_actions_planned', 'investigating', 'corrective_actions_planned', 'om_lead_welkom', 'CAPA: replace breather assembly on 4 transformers; quarterly inspection', NULL, '2026-03-19T11:00:00Z'),
('hse_evt_021', 'hse_007', 'hse_incident.corrective_actions_executing', 'corrective_actions_planned', 'corrective_actions_executing', 'om_lead_welkom', 'WO wo_2026_0044 dispatched; OEM advisory T-21B parts on-site', NULL, '2026-03-26T14:00:00Z'),
('hse_evt_022', 'hse_007', 'hse_incident.verified', 'corrective_actions_executing', 'verified', 'om_lead_welkom', 'Soil samples clean; T-2 back in service; awaiting DFFE final concurrence', NULL, '2026-04-22T15:00:00Z'),

-- hse_008 closed (7)
('hse_evt_023', 'hse_008', 'hse_incident.triaged', 'reported', 'triaged', 'epc_safety_off_02', 'Arc-flash fatality; fatal tier; OHSA s24 8h notification + SAPS', NULL, '2026-01-22T12:30:00Z'),
('hse_evt_024', 'hse_008', 'hse_incident.notified_authority', 'triaged', 'notified_authority', 'epc_safety_off_02', 'DEL notified within 6h; ref DEL-OHSA24-2026-0118', NULL, '2026-01-22T17:30:00Z'),
('hse_evt_025', 'hse_008', 'hse_incident.investigating', 'notified_authority', 'investigating', 'epc_safety_off_02', 'LOTO procedure forensic audit; handover log analysis', NULL, '2026-01-24T08:00:00Z'),
('hse_evt_026', 'hse_008', 'hse_incident.corrective_actions_planned', 'investigating', 'corrective_actions_planned', 'epc_safety_off_02', 'CAPA: mandatory 2-person LOTO + biometric handover; criminal proceedings to NPA', NULL, '2026-02-15T11:00:00Z'),
('hse_evt_027', 'hse_008', 'hse_incident.corrective_actions_executing', 'corrective_actions_planned', 'corrective_actions_executing', 'epc_safety_off_02', 'WO wo_2026_0011 dispatched for biometric handover system rollout', NULL, '2026-02-22T14:00:00Z'),
('hse_evt_028', 'hse_008', 'hse_incident.verified', 'corrective_actions_executing', 'verified', 'epc_safety_off_02', 'CAPA verified; DEL inspector concurrence; system live', NULL, '2026-03-18T15:00:00Z'),
('hse_evt_029', 'hse_008', 'hse_incident.closed', 'verified', 'closed', 'epc_safety_off_02', 'Closed; widow compensation via FSCA-monitored insurer; criminal proceedings ongoing under NPA', NULL, '2026-04-02T10:00:00Z'),

-- hse_009 escalated (6)
('hse_evt_030', 'hse_009', 'hse_incident.triaged', 'reported', 'triaged', 'epc_safety_off_01', 'Crane lift struck two riggers; major tier; OHSA s24', NULL, '2026-02-14T17:00:00Z'),
('hse_evt_031', 'hse_009', 'hse_incident.notified_authority', 'triaged', 'notified_authority', 'epc_safety_off_01', 'DEL notified; ref DEL-OHSA24-2026-0162', NULL, '2026-02-15T08:00:00Z'),
('hse_evt_032', 'hse_009', 'hse_incident.investigating', 'notified_authority', 'investigating', 'epc_safety_off_01', 'Crane override mechanism analysis; SOP audit', NULL, '2026-02-17T08:00:00Z'),
('hse_evt_033', 'hse_009', 'hse_incident.corrective_actions_planned', 'investigating', 'corrective_actions_planned', 'epc_safety_off_01', 'CAPA: rip out override switches; recertify riggers', NULL, '2026-02-22T11:00:00Z'),
('hse_evt_034', 'hse_009', 'hse_incident.corrective_actions_executing', 'corrective_actions_planned', 'corrective_actions_executing', 'epc_safety_off_01', 'WO wo_2026_0067 dispatched; permit-to-lift review in flight', NULL, '2026-03-01T14:00:00Z'),
('hse_evt_035', 'hse_009', 'hse_incident.escalated', 'corrective_actions_executing', 'escalated', 'del_inspector', 'DEL Section 30 prohibition order issued; formal enforcement underway', NULL, '2026-03-12T11:00:00Z'),
('hse_evt_036', 'hse_009', 'hse_incident.sla_breached', 'escalated', 'escalated', 'system', 'Escalation SLA breach at 30d; escalation level 2', NULL, '2026-04-11T11:00:00Z'),

-- hse_010 false_alarm (1)
('hse_evt_037', 'hse_010', 'hse_incident.false_alarm', 'reported', 'false_alarm', 'clinic_nurse_supervisor', 'Sea-spray condensation misread as smoke; re-classified to no-incident', NULL, '2026-05-19T17:00:00Z');
