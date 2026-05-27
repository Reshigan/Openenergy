-- Wave 23: Insurance claim chain seed
-- 10 claims across all 10 states + 38 audit events
-- Cross-wave linkage where natural (PPA/COD/drawdown projects)

INSERT OR IGNORE INTO oe_insurance_claim_chain
(id, claim_number, project_id, facility_id, participant_id, insurer_name, policy_number, cover_type, incident_type, incident_date, asset_description, claim_value_zar, claim_value_tier, agreed_value_zar, settled_value_zar, excess_zar, loss_adjuster_name, loss_adjuster_ref, fsca_report_ref, reinsurance_layer, chain_status, notified_at, assessing_at, adjuster_assigned_at, quantum_proposed_at, quantum_agreed_at, disputed_at, resolved_at, settled_at, declined_at, closed_at, withdrawn_at, decline_reason, withdrawal_reason, dispute_notes, claim_notes, sla_deadline_at, last_sla_breach_at, escalation_level, created_by, created_at)
VALUES
('clm_001', 'CLM-2026-0001', 'proj_kuruman_solar', NULL, 'p_ipp_mainstream', 'Santam Re', 'PD-BI-2026-MS-0017', 'pd_bi', 'lightning', '2026-05-22', 'Inverter station 3 — surge damage to 6 string inverters', 4200000, 'minor', NULL, NULL, 250000, NULL, NULL, NULL, 'primary', 'notified', '2026-05-23T09:00:00Z', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'Lightning strike during MV storm front; FAS records confirm event', '2026-05-28T09:00:00Z', NULL, 0, 'p_ipp_mainstream', '2026-05-23T09:00:00Z'),

('clm_002', 'CLM-2026-0002', 'proj_atlantis_wind', NULL, 'p_ipp_engie', 'Allianz Africa', 'PD-2026-ATL-0009', 'pd_bi', 'mechanical', '2026-04-18', 'WTG-07 gearbox failure — Vestas V162-5.6MW', 38500000, 'major', NULL, NULL, 1500000, 'Marsh JLT', 'ADJ-2026-ATL-0011', NULL, 'primary', 'assessing', '2026-04-20T11:00:00Z', '2026-04-25T13:00:00Z', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'WTG-07 stopped 2026-04-18 14:22 UTC · oil sample sent for ISO4406', '2026-05-25T13:00:00Z', NULL, 0, 'p_ipp_engie', '2026-04-20T11:00:00Z'),

('clm_003', 'CLM-2026-0003', 'proj_secunda_solar', NULL, 'p_ipp_scatec', 'Munich Re Africa', 'PD-BI-2026-SEC-0001', 'pd_bi', 'fire', '2026-03-15', 'BESS container 4 (Tesla Megapack 2XL) — thermal runaway', 72000000, 'catastrophic', NULL, NULL, 5000000, 'Crawford & Co', 'ADJ-2026-SEC-0004', 'FSCA-LL-2026-0042', 'excess_layer_1', 'adjuster_assigned', '2026-03-15T22:00:00Z', '2026-03-18T08:00:00Z', '2026-03-22T08:00:00Z', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'Thermal runaway 22:14 SAST; 8 modules destroyed; FSCA Section 38 lodged', '2026-06-20T08:00:00Z', NULL, 0, 'p_ipp_scatec', '2026-03-15T22:00:00Z'),

('clm_004', 'CLM-2026-0004', 'proj_mogalakwena_solar', NULL, 'p_ipp_globaleleq', 'Hollard', 'CARGO-2026-MOG-0003', 'cargo', 'theft', '2026-04-05', 'Copper cable theft — 2.4km MV reticulation stolen during installation', 6800000, 'minor', 6200000, NULL, 300000, 'Crawford & Co', 'ADJ-2026-MOG-0007', NULL, 'primary', 'quantum_proposed', '2026-04-06T07:00:00Z', '2026-04-08T09:00:00Z', '2026-04-12T11:00:00Z', '2026-05-10T14:00:00Z', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'Adjuster proposes R6.2m (12pct deduction for inadequate site security per policy condition)', '2026-05-31T14:00:00Z', NULL, 0, 'p_ipp_globaleleq', '2026-04-06T07:00:00Z'),

('clm_005', 'CLM-2026-0005', 'proj_loeriesfontein2', NULL, 'p_ipp_biotherm', 'Old Mutual Insure', 'PD-2026-LOE-0022', 'pd_bi', 'mechanical', '2026-02-10', 'WTG blade carbon fibre delamination — 3 blades', 14500000, 'major', 14500000, NULL, 750000, 'McLarens Africa', 'ADJ-2026-LOE-0019', NULL, 'primary', 'quantum_agreed', '2026-02-12T10:00:00Z', '2026-02-15T11:00:00Z', '2026-02-22T14:00:00Z', '2026-04-18T15:00:00Z', '2026-05-15T16:00:00Z', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'OEM (Vestas) accepted root cause — manufacturing defect; warranty co-pay R3.5m', '2026-06-05T16:00:00Z', NULL, 0, 'p_ipp_biotherm', '2026-02-12T10:00:00Z'),

('clm_006', 'CLM-2026-0006', 'proj_namakwa_solar', 'f_namakwa', 'p_ipp_edf', 'Lloyd''s SA', 'BI-2026-NAM-0011', 'pd_bi', 'business_interruption', '2026-02-01', 'BI cover for curtailment exceeding 10pct annual cap (clause 7.3)', 22400000, 'major', 11800000, NULL, 1000000, 'McLarens Africa', 'ADJ-2026-NAM-0008', NULL, 'primary', 'disputed', '2026-02-08T09:00:00Z', '2026-02-15T11:00:00Z', '2026-02-28T14:00:00Z', '2026-04-22T15:00:00Z', NULL, '2026-05-02T13:00:00Z', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'Insurer disputes deemed-delivery clause overlap (linked W22 ppa_007 arbitration)', 'Quantum offered R11.8m; IPP claims R22.4m — JAMS arbitration scheduled', '2026-09-01T13:00:00Z', NULL, 1, 'p_ipp_edf', '2026-02-08T09:00:00Z'),

('clm_007', 'CLM-2026-0007', 'proj_roggeveld', 'f_roggeveld', 'p_ipp_roggeveld', 'Santam Re', 'PD-BI-2026-ROG-0006', 'pd_bi', 'lightning', '2025-11-08', 'Substation transformer T1 — surge protection failure', 18700000, 'major', 17900000, 17900000, 1000000, 'Crawford & Co', 'ADJ-2025-ROG-0044', NULL, 'primary', 'settled', '2025-11-09T08:00:00Z', '2025-11-12T11:00:00Z', '2025-11-20T14:00:00Z', '2026-01-15T15:00:00Z', '2026-02-22T16:00:00Z', NULL, NULL, '2026-03-10T11:00:00Z', NULL, NULL, NULL, NULL, NULL, NULL, 'Settled R17.9m to IPP escrow; bond proceeds reduce lender exposure (linked W21 dd_006)', NULL, NULL, 0, 'p_ipp_roggeveld', '2025-11-09T08:00:00Z'),

('clm_008', 'CLM-2026-0008', 'proj_vredendal_bess', NULL, 'p_ipp_blackrhino', 'Hollard', 'PD-2026-VRE-0001', 'pd_bi', 'mechanical', '2026-03-22', 'BESS commissioning failure — manufacturing batch defect', 95000000, 'catastrophic', 0, NULL, 5000000, 'McLarens Africa', 'ADJ-2026-VRE-0001', 'FSCA-LL-2026-0051', 'primary', 'declined', '2026-03-25T09:00:00Z', '2026-03-28T11:00:00Z', '2026-04-05T14:00:00Z', NULL, NULL, NULL, NULL, NULL, '2026-05-15T16:00:00Z', NULL, NULL, 'Pre-commissioning loss outside cover period (policy attaches at provisional COD per condition 3.2)', NULL, NULL, 'Linked to W22 ppa_008 termination + W21 dd_010 cancellation', NULL, NULL, 0, 'p_ipp_blackrhino', '2026-03-25T09:00:00Z'),

('clm_009', 'CLM-2026-0009', 'proj_kangnas_ext', NULL, 'p_ipp_lekela', 'Allianz Africa', 'CARGO-2025-KAN-0001', 'cargo', 'theft', '2025-09-12', 'Cable theft pre-installation — stored materials', 380000, 'small', NULL, NULL, 50000, NULL, NULL, NULL, 'primary', 'withdrawn', '2025-09-13T08:00:00Z', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2025-12-15T16:00:00Z', NULL, 'Project cancelled (linked W22 ppa_010); claim withdrawn by sponsor', NULL, 'Withdrawn after Lekela exit', NULL, NULL, 0, 'p_ipp_lekela', '2025-09-13T08:00:00Z'),

('clm_010', 'CLM-2026-0010', 'proj_darling_wind', NULL, 'p_ipp_darling', 'Santam Re', 'PD-2024-DAR-0001', 'pd_bi', 'fire', '2024-08-18', 'Generator nacelle fire — WTG-02', 8200000, 'minor', 7800000, 7800000, 400000, 'Crawford & Co', 'ADJ-2024-DAR-0029', NULL, 'primary', 'closed', '2024-08-20T10:00:00Z', '2024-08-22T11:00:00Z', '2024-09-05T14:00:00Z', '2024-11-12T15:00:00Z', '2024-12-20T16:00:00Z', NULL, NULL, '2025-02-10T11:00:00Z', NULL, '2025-04-15T09:00:00Z', NULL, NULL, NULL, NULL, 'Final closure post 90-day no-reopen window', NULL, NULL, 0, 'p_ipp_darling', '2024-08-20T10:00:00Z');

-- Audit events
INSERT OR IGNORE INTO oe_insurance_claim_chain_events (id, claim_id, event_type, from_status, to_status, actor_id, notes, payload, created_at) VALUES

-- clm_001 notified (1 event)
('clm_evt_001', 'clm_001', 'created', NULL, 'notified', 'p_ipp_mainstream', 'Lightning strike 6 string inverters Kuruman', NULL, '2026-05-23T09:00:00Z'),

-- clm_002 assessing (2 events)
('clm_evt_002', 'clm_002', 'created', NULL, 'notified', 'p_ipp_engie', 'WTG-07 gearbox failure', NULL, '2026-04-20T11:00:00Z'),
('clm_evt_003', 'clm_002', 'assessment_started', 'notified', 'assessing', 'p_ipp_engie', 'Marsh JLT engaged; oil sample sent', NULL, '2026-04-25T13:00:00Z'),

-- clm_003 adjuster_assigned catastrophic (3 events)
('clm_evt_004', 'clm_003', 'created', NULL, 'notified', 'p_ipp_scatec', 'BESS container thermal runaway 2026-03-15', NULL, '2026-03-15T22:00:00Z'),
('clm_evt_005', 'clm_003', 'assessment_started', 'notified', 'assessing', 'p_ipp_scatec', 'Catastrophic loss; FSCA Section 38 notified', NULL, '2026-03-18T08:00:00Z'),
('clm_evt_006', 'clm_003', 'adjuster_assigned', 'assessing', 'adjuster_assigned', 'p_ipp_scatec', 'Crawford & Co lead; FSCA-LL-2026-0042', NULL, '2026-03-22T08:00:00Z'),

-- clm_004 quantum_proposed (4 events)
('clm_evt_007', 'clm_004', 'created', NULL, 'notified', 'p_ipp_globaleleq', 'Copper cable theft 2.4km', NULL, '2026-04-06T07:00:00Z'),
('clm_evt_008', 'clm_004', 'assessment_started', 'notified', 'assessing', 'p_ipp_globaleleq', 'Site security review initiated', NULL, '2026-04-08T09:00:00Z'),
('clm_evt_009', 'clm_004', 'adjuster_assigned', 'assessing', 'adjuster_assigned', 'p_ipp_globaleleq', 'Crawford & Co assigned', NULL, '2026-04-12T11:00:00Z'),
('clm_evt_010', 'clm_004', 'quantum_proposed', 'adjuster_assigned', 'quantum_proposed', 'p_ipp_globaleleq', 'R6.2m proposed (12pct deduction for security gap)', NULL, '2026-05-10T14:00:00Z'),

-- clm_005 quantum_agreed (5 events)
('clm_evt_011', 'clm_005', 'created', NULL, 'notified', 'p_ipp_biotherm', '3 blade delamination Loeriesfontein 2', NULL, '2026-02-12T10:00:00Z'),
('clm_evt_012', 'clm_005', 'assessment_started', 'notified', 'assessing', 'p_ipp_biotherm', 'OEM joined assessment', NULL, '2026-02-15T11:00:00Z'),
('clm_evt_013', 'clm_005', 'adjuster_assigned', 'assessing', 'adjuster_assigned', 'p_ipp_biotherm', 'McLarens Africa', NULL, '2026-02-22T14:00:00Z'),
('clm_evt_014', 'clm_005', 'quantum_proposed', 'adjuster_assigned', 'quantum_proposed', 'p_ipp_biotherm', 'R14.5m proposed; Vestas warranty co-pay R3.5m', NULL, '2026-04-18T15:00:00Z'),
('clm_evt_015', 'clm_005', 'quantum_agreed', 'quantum_proposed', 'quantum_agreed', 'p_ipp_biotherm', 'IPP accepted; OEM contribution confirmed', NULL, '2026-05-15T16:00:00Z'),

-- clm_006 disputed major (6 events)
('clm_evt_016', 'clm_006', 'created', NULL, 'notified', 'p_ipp_edf', 'BI claim curtailment cap exceeded', NULL, '2026-02-08T09:00:00Z'),
('clm_evt_017', 'clm_006', 'assessment_started', 'notified', 'assessing', 'p_ipp_edf', 'Lloyd''s SA review', NULL, '2026-02-15T11:00:00Z'),
('clm_evt_018', 'clm_006', 'adjuster_assigned', 'assessing', 'adjuster_assigned', 'p_ipp_edf', 'McLarens Africa engaged', NULL, '2026-02-28T14:00:00Z'),
('clm_evt_019', 'clm_006', 'quantum_proposed', 'adjuster_assigned', 'quantum_proposed', 'p_ipp_edf', 'R11.8m proposed (52pct of claim)', NULL, '2026-04-22T15:00:00Z'),
('clm_evt_020', 'clm_006', 'disputed', 'quantum_proposed', 'disputed', 'p_ipp_edf', 'IPP disputes; JAMS arbitration scheduled', NULL, '2026-05-02T13:00:00Z'),
('clm_evt_021', 'clm_006', 'sla_breached', 'disputed', 'disputed', 'system', 'auto-breach by cron sweep; disputed beyond 90d for major tier', NULL, '2026-05-26T13:00:00Z'),

-- clm_007 settled major (7 events)
('clm_evt_022', 'clm_007', 'created', NULL, 'notified', 'p_ipp_roggeveld', 'T1 transformer surge', NULL, '2025-11-09T08:00:00Z'),
('clm_evt_023', 'clm_007', 'assessment_started', 'notified', 'assessing', 'p_ipp_roggeveld', NULL, NULL, '2025-11-12T11:00:00Z'),
('clm_evt_024', 'clm_007', 'adjuster_assigned', 'assessing', 'adjuster_assigned', 'p_ipp_roggeveld', NULL, NULL, '2025-11-20T14:00:00Z'),
('clm_evt_025', 'clm_007', 'quantum_proposed', 'adjuster_assigned', 'quantum_proposed', 'p_ipp_roggeveld', 'R17.9m proposed', NULL, '2026-01-15T15:00:00Z'),
('clm_evt_026', 'clm_007', 'quantum_agreed', 'quantum_proposed', 'quantum_agreed', 'p_ipp_roggeveld', NULL, NULL, '2026-02-22T16:00:00Z'),
('clm_evt_027', 'clm_007', 'settled', 'quantum_agreed', 'settled', 'p_ipp_roggeveld', 'R17.9m to IPP escrow; W21 dd_006 lender exposure reduced', NULL, '2026-03-10T11:00:00Z'),

-- clm_008 declined catastrophic (4 events)
('clm_evt_028', 'clm_008', 'created', NULL, 'notified', 'p_ipp_blackrhino', 'Pre-commissioning BESS batch defect', NULL, '2026-03-25T09:00:00Z'),
('clm_evt_029', 'clm_008', 'assessment_started', 'notified', 'assessing', 'p_ipp_blackrhino', 'Catastrophic; FSCA-LL-2026-0051 lodged', NULL, '2026-03-28T11:00:00Z'),
('clm_evt_030', 'clm_008', 'adjuster_assigned', 'assessing', 'adjuster_assigned', 'p_ipp_blackrhino', 'McLarens Africa', NULL, '2026-04-05T14:00:00Z'),
('clm_evt_031', 'clm_008', 'declined', 'adjuster_assigned', 'declined', 'p_ipp_blackrhino', 'Outside cover period (policy condition 3.2)', NULL, '2026-05-15T16:00:00Z'),

-- clm_009 withdrawn (2 events)
('clm_evt_032', 'clm_009', 'created', NULL, 'notified', 'p_ipp_lekela', 'Cable theft pre-install Kangnas', NULL, '2025-09-13T08:00:00Z'),
('clm_evt_033', 'clm_009', 'withdrawn', 'notified', 'withdrawn', 'p_ipp_lekela', 'Sponsor withdrew post project cancellation (W22 ppa_010)', NULL, '2025-12-15T16:00:00Z'),

-- clm_010 closed (7 events)
('clm_evt_034', 'clm_010', 'created', NULL, 'notified', 'p_ipp_darling', 'WTG-02 generator nacelle fire', NULL, '2024-08-20T10:00:00Z'),
('clm_evt_035', 'clm_010', 'assessment_started', 'notified', 'assessing', 'p_ipp_darling', NULL, NULL, '2024-08-22T11:00:00Z'),
('clm_evt_036', 'clm_010', 'adjuster_assigned', 'assessing', 'adjuster_assigned', 'p_ipp_darling', 'Crawford & Co', NULL, '2024-09-05T14:00:00Z'),
('clm_evt_037', 'clm_010', 'quantum_proposed', 'adjuster_assigned', 'quantum_proposed', 'p_ipp_darling', 'R7.8m proposed', NULL, '2024-11-12T15:00:00Z'),
('clm_evt_038', 'clm_010', 'quantum_agreed', 'quantum_proposed', 'quantum_agreed', 'p_ipp_darling', NULL, NULL, '2024-12-20T16:00:00Z'),
('clm_evt_039', 'clm_010', 'settled', 'quantum_agreed', 'settled', 'p_ipp_darling', 'R7.8m paid', NULL, '2025-02-10T11:00:00Z'),
('clm_evt_040', 'clm_010', 'closed', 'settled', 'closed', 'p_ipp_darling', '90-day no-reopen window expired', NULL, '2025-04-15T09:00:00Z');
