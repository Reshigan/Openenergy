-- Wave 24: PR chain seed — 8 cases across all 9 states
-- Cross-wave links to W16 (work orders) and W15 (warranty claims)

INSERT OR IGNORE INTO oe_pr_chain
(id, case_number, site_id, site_name, technology, capacity_mw, capacity_tier, baseline_pr, observed_pr, pr_shortfall, window_days, detected_at, primary_cause, rca_summary, action_plan, linked_wo_id, linked_warranty_claim_id, revenue_loss_zar, chain_status, warning_at, investigating_at, intervention_planned_at, intervention_executing_at, verified_at, escalated_at, closed_at, false_alarm_at, closure_notes, sla_deadline_at, last_sla_breach_at, escalation_level, created_by, created_at)
VALUES
-- pr_001 monitoring (baseline; no PR drop) — control example
('pr_001', 'PR-2026-0001', 'site_kuruman', 'Kuruman Solar', 'solar_pv', 75.0, 'utility', 0.85, 0.86, -0.01, 0, '2026-05-27T06:00:00Z', NULL, NULL, NULL, NULL, NULL, 0, 'monitoring', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 0, 'system', '2026-05-27T06:00:00Z'),

-- pr_002 warning (utility, just-detected) — Welkom Solar, 7-day PR drop 0.84→0.69
('pr_002', 'PR-2026-0002', 'site_welkom', 'Welkom Solar Park', 'solar_pv', 65.0, 'utility', 0.84, 0.69, 0.15, 7, '2026-05-26T06:00:00Z', 'soiling', NULL, NULL, NULL, NULL, 482000, 'warning', '2026-05-26T06:00:00Z', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-05-27T06:00:00Z', NULL, 0, 'system', '2026-05-26T06:00:00Z'),

-- pr_003 investigating (midscale) — Riebeeckstad O&M reviewing
('pr_003', 'PR-2026-0003', 'site_riebeeckstad', 'Riebeeckstad Solar', 'solar_pv', 22.0, 'midscale', 0.82, 0.71, 0.11, 10, '2026-05-22T06:00:00Z', 'inverter_fault', 'String inverter S-12 reporting MPPT divergence; firmware below current production baseline', NULL, NULL, NULL, 184000, 'investigating', '2026-05-22T06:00:00Z', '2026-05-23T09:00:00Z', NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-05-28T09:00:00Z', NULL, 0, 'site_riebeeckstad', '2026-05-22T06:00:00Z'),

-- pr_004 intervention_planned (utility — Loeriesfontein) — RCA done, WO plan ready
('pr_004', 'PR-2026-0004', 'site_loeriesfontein2', 'Loeriesfontein 2 Wind', 'wind', 140.0, 'utility', 0.45, 0.36, 0.09, 14, '2026-05-13T06:00:00Z', 'blade_delamination', 'WTG-04, WTG-07, WTG-11 blade leading-edge erosion + carbon fibre delamination; Vestas advisory matches', 'Schedule blade swap WTGs 04/07/11 over Q3; OEM Vestas to co-fund 35pct under T-21 advisory', NULL, NULL, 1842000, 'intervention_planned', '2026-05-13T06:00:00Z', '2026-05-15T09:00:00Z', '2026-05-22T11:00:00Z', NULL, NULL, NULL, NULL, NULL, NULL, '2026-06-05T11:00:00Z', NULL, 0, 'site_loeriesfontein2', '2026-05-13T06:00:00Z'),

-- pr_005 intervention_executing (utility — Roggeveld) — WO dispatched, linked W16
('pr_005', 'PR-2026-0005', 'site_roggeveld', 'Roggeveld Wind', 'wind', 147.0, 'utility', 0.48, 0.39, 0.09, 21, '2026-04-22T06:00:00Z', 'gearbox_temp_alarm', 'WTG-09 + WTG-14 gearbox high-side temp alarms; oil sample shows iron particulate >ISO4406 18/16/13', 'Replace gearbox seal kits + flush; dispatched OEM Vestas crew via WO wo_2026_0091', 'wo_2026_0091', NULL, 2940000, 'intervention_executing', '2026-04-22T06:00:00Z', '2026-04-24T09:00:00Z', '2026-05-01T11:00:00Z', '2026-05-08T14:00:00Z', NULL, NULL, NULL, NULL, NULL, '2026-06-07T14:00:00Z', NULL, 0, 'site_roggeveld', '2026-04-22T06:00:00Z'),

-- pr_006 verified (ci — Brackenfell) — recovery achieved, sustaining
('pr_006', 'PR-2026-0006', 'site_brackenfell_ci', 'Brackenfell C&I Rooftop', 'solar_pv', 4.8, 'ci', 0.80, 0.66, 0.14, 7, '2026-03-15T06:00:00Z', 'soiling', 'High particulate matter from N1 road construction next to site; soiling > model expectation', 'Robotic cleaning cycle scheduled bi-weekly during construction; immediate manual wash 2026-03-22', 'wo_2026_0042', NULL, 87500, 'verified', '2026-03-15T06:00:00Z', '2026-03-16T09:00:00Z', '2026-03-19T11:00:00Z', '2026-03-22T14:00:00Z', '2026-04-08T15:00:00Z', NULL, NULL, NULL, NULL, '2026-04-22T15:00:00Z', NULL, 0, 'site_brackenfell_ci', '2026-03-15T06:00:00Z'),

-- pr_007 escalated (utility — Aggeneys) — OEM defect, warranty claim filed (W15)
('pr_007', 'PR-2026-0007', 'site_aggeneys', 'Aggeneys Solar', 'solar_pv', 80.0, 'utility', 0.83, 0.62, 0.21, 28, '2026-03-25T06:00:00Z', 'OEM_defect', 'Sungrow SG250HX firmware regression — MPPT loss across 480 inverters batched 2025 Q4', 'Sungrow accepts root cause; warranty claim WAR-2026-0019 to swap firmware via remote update + on-site validation', 'wo_2026_0055', 'war_2026_0019', 4150000, 'escalated', '2026-03-25T06:00:00Z', '2026-03-27T09:00:00Z', '2026-04-08T11:00:00Z', '2026-04-15T14:00:00Z', NULL, '2026-04-28T15:00:00Z', NULL, NULL, NULL, '2026-05-28T15:00:00Z', NULL, 0, 'site_aggeneys', '2026-03-25T06:00:00Z'),

-- pr_008 closed (midscale — Mooi River) — verified + closed
('pr_008', 'PR-2026-0008', 'site_mooi_river', 'Mooi River Solar', 'solar_pv', 18.5, 'midscale', 0.82, 0.74, 0.08, 7, '2026-01-12T06:00:00Z', 'shading', 'New 132kV pylon erected 50m to the north casting morning shadow on rows 9-12 (Eskom transmission upgrade)', 'String reconfiguration row 9-12 to bypass shaded sections; OE-modelled annual loss 2.1pct, accepted', 'wo_2025_0312', NULL, 124000, 'closed', '2026-01-12T06:00:00Z', '2026-01-14T09:00:00Z', '2026-01-20T11:00:00Z', '2026-01-25T14:00:00Z', '2026-02-08T15:00:00Z', NULL, '2026-02-26T11:00:00Z', NULL, 'Re-baselined PR target to 0.80 reflecting permanent shading; W16 wo_2025_0312 closed', NULL, NULL, 0, 'site_mooi_river', '2026-01-12T06:00:00Z'),

-- pr_009 false_alarm (microgrid — Hluleka) — weather attribution overrode
('pr_009', 'PR-2026-0009', 'site_hluleka_clinic', 'Hluleka Clinic Microgrid', 'hybrid', 0.18, 'microgrid', 0.75, 0.61, 0.14, 5, '2026-05-15T06:00:00Z', 'weather', 'Coastal fog event days 12-17 May; ECMWF reanalysis confirms 5.2 sun-hours/day vs. expected 6.8', NULL, NULL, NULL, 3200, 'false_alarm', '2026-05-15T06:00:00Z', '2026-05-16T09:00:00Z', NULL, NULL, NULL, NULL, NULL, '2026-05-18T11:00:00Z', 'Closed as weather-attributable; no asset action needed', NULL, NULL, 0, 'site_hluleka_clinic', '2026-05-15T06:00:00Z');

-- Audit events
INSERT OR IGNORE INTO oe_pr_chain_events (id, case_id, event_type, from_status, to_status, actor_id, notes, payload, created_at) VALUES

-- pr_002 warning (1 event)
('pr_evt_001', 'pr_002', 'pr_warning_detected', 'monitoring', 'warning', 'system', 'PR 0.69 < 0.84 baseline for 7 consecutive days; soiling primary cause', NULL, '2026-05-26T06:00:00Z'),

-- pr_003 investigating (2 events)
('pr_evt_002', 'pr_003', 'pr_warning_detected', 'monitoring', 'warning', 'system', 'PR 0.71 < 0.82 baseline for 10 consecutive days', NULL, '2026-05-22T06:00:00Z'),
('pr_evt_003', 'pr_003', 'investigation_started', 'warning', 'investigating', 'site_riebeeckstad', 'Engineer assigned: inverter S-12 MPPT divergence flagged', NULL, '2026-05-23T09:00:00Z'),

-- pr_004 intervention_planned (3 events)
('pr_evt_004', 'pr_004', 'pr_warning_detected', 'monitoring', 'warning', 'system', 'PR 0.36 < 0.45 baseline for 14 days; multiple WTG blade alerts', NULL, '2026-05-13T06:00:00Z'),
('pr_evt_005', 'pr_004', 'investigation_started', 'warning', 'investigating', 'site_loeriesfontein2', 'WTG-04/07/11 blade inspection scheduled', NULL, '2026-05-15T09:00:00Z'),
('pr_evt_006', 'pr_004', 'rca_completed', 'investigating', 'intervention_planned', 'site_loeriesfontein2', 'Leading-edge erosion + delamination; Vestas T-21 advisory; co-fund 35pct', NULL, '2026-05-22T11:00:00Z'),

-- pr_005 intervention_executing (4 events)
('pr_evt_007', 'pr_005', 'pr_warning_detected', 'monitoring', 'warning', 'system', 'PR 0.39 < 0.48 baseline for 21 days', NULL, '2026-04-22T06:00:00Z'),
('pr_evt_008', 'pr_005', 'investigation_started', 'warning', 'investigating', 'site_roggeveld', 'Gearbox temp alarms WTG-09/14', NULL, '2026-04-24T09:00:00Z'),
('pr_evt_009', 'pr_005', 'rca_completed', 'investigating', 'intervention_planned', 'site_roggeveld', 'Oil sample iron particulate >ISO4406 18/16/13 — seal failure', NULL, '2026-05-01T11:00:00Z'),
('pr_evt_010', 'pr_005', 'intervention_dispatched', 'intervention_planned', 'intervention_executing', 'site_roggeveld', 'WO wo_2026_0091 dispatched to Vestas crew', NULL, '2026-05-08T14:00:00Z'),

-- pr_006 verified (5 events)
('pr_evt_011', 'pr_006', 'pr_warning_detected', 'monitoring', 'warning', 'system', 'PR 0.66 < 0.80 baseline for 7 days; PM10 surge from adjacent construction', NULL, '2026-03-15T06:00:00Z'),
('pr_evt_012', 'pr_006', 'investigation_started', 'warning', 'investigating', 'site_brackenfell_ci', 'Soiling visible on rows facing N1; PM10 monitor confirms', NULL, '2026-03-16T09:00:00Z'),
('pr_evt_013', 'pr_006', 'rca_completed', 'investigating', 'intervention_planned', 'site_brackenfell_ci', 'Bi-weekly robotic clean + immediate wash scheduled', NULL, '2026-03-19T11:00:00Z'),
('pr_evt_014', 'pr_006', 'intervention_dispatched', 'intervention_planned', 'intervention_executing', 'site_brackenfell_ci', 'WO wo_2026_0042 dispatched; first wash 2026-03-22', NULL, '2026-03-22T14:00:00Z'),
('pr_evt_015', 'pr_006', 'recovery_verified', 'intervention_executing', 'verified', 'site_brackenfell_ci', 'PR 0.81 sustained 17 days post-wash; recovery confirmed', NULL, '2026-04-08T15:00:00Z'),

-- pr_007 escalated (6 events)
('pr_evt_016', 'pr_007', 'pr_warning_detected', 'monitoring', 'warning', 'system', 'PR 0.62 < 0.83 baseline for 28 days; 480 inverters showing MPPT loss', NULL, '2026-03-25T06:00:00Z'),
('pr_evt_017', 'pr_007', 'investigation_started', 'warning', 'investigating', 'site_aggeneys', 'Sungrow SG250HX firmware regression suspected', NULL, '2026-03-27T09:00:00Z'),
('pr_evt_018', 'pr_007', 'rca_completed', 'investigating', 'intervention_planned', 'site_aggeneys', 'Sungrow accepts root cause; warranty path opened', NULL, '2026-04-08T11:00:00Z'),
('pr_evt_019', 'pr_007', 'intervention_dispatched', 'intervention_planned', 'intervention_executing', 'site_aggeneys', 'WO wo_2026_0055 + remote firmware push initiated', NULL, '2026-04-15T14:00:00Z'),
('pr_evt_020', 'pr_007', 'escalated_to_warranty', 'intervention_executing', 'escalated', 'site_aggeneys', 'WAR-2026-0019 filed against Sungrow under OEM defect clause 4.2', NULL, '2026-04-28T15:00:00Z'),
('pr_evt_021', 'pr_007', 'sla_breached', 'escalated', 'escalated', 'system', 'auto-breach by cron sweep; escalated beyond 30d for utility tier', NULL, '2026-05-27T15:00:00Z'),

-- pr_008 closed (7 events)
('pr_evt_022', 'pr_008', 'pr_warning_detected', 'monitoring', 'warning', 'system', 'PR 0.74 < 0.82 baseline for 7 days', NULL, '2026-01-12T06:00:00Z'),
('pr_evt_023', 'pr_008', 'investigation_started', 'warning', 'investigating', 'site_mooi_river', 'New pylon shadow analysis underway', NULL, '2026-01-14T09:00:00Z'),
('pr_evt_024', 'pr_008', 'rca_completed', 'investigating', 'intervention_planned', 'site_mooi_river', '132kV pylon causes morning shading rows 9-12', NULL, '2026-01-20T11:00:00Z'),
('pr_evt_025', 'pr_008', 'intervention_dispatched', 'intervention_planned', 'intervention_executing', 'site_mooi_river', 'WO wo_2025_0312 — string reconfiguration', NULL, '2026-01-25T14:00:00Z'),
('pr_evt_026', 'pr_008', 'recovery_verified', 'intervention_executing', 'verified', 'site_mooi_river', 'PR 0.80 sustained 14 days post-reconfig at new baseline', NULL, '2026-02-08T15:00:00Z'),
('pr_evt_027', 'pr_008', 'closed', 'verified', 'closed', 'site_mooi_river', 'PR baseline re-set to 0.80 reflecting permanent shading', NULL, '2026-02-26T11:00:00Z'),

-- pr_009 false_alarm (2 events)
('pr_evt_028', 'pr_009', 'pr_warning_detected', 'monitoring', 'warning', 'system', 'PR 0.61 < 0.75 baseline for 5 days', NULL, '2026-05-15T06:00:00Z'),
('pr_evt_029', 'pr_009', 'false_alarm', 'warning', 'false_alarm', 'site_hluleka_clinic', 'Coastal fog event 12-17 May; ECMWF reanalysis confirms 5.2 sun-hours/day', NULL, '2026-05-18T11:00:00Z');
