-- Wave 50 — Grid Ancillary Services Reserve Activation & Settlement seed.
-- 10 reserve activations ra_001..ra_010 spanning 10 distinct lifecycle states,
-- all five reserve tiers, and the non-performance + dispute branches.
-- SO is the National Transmission Company South Africa (NTCSA) System Operator.

INSERT OR IGNORE INTO oe_reserve_activations (
  id, activation_number, source_event, source_entity_type, source_entity_id, source_wave,
  so_party_id, so_party_name, provider_party_id, provider_party_name,
  reserve_tier, provider_type, service_name, contract_ref, trigger_type,
  instructed_mw, delivered_mw, response_time_seconds, actual_response_seconds, frequency_hz_at_event,
  availability_payment_zar, utilisation_payment_zar, penalty_zar,
  instruction_basis, performance_basis, reason_code, dispute_round,
  chain_status, activation_issued_at, acknowledged_at, ramping_at, sustaining_at, released_at,
  performance_review_at, verified_at, settled_at, non_performance_at, disputed_at,
  is_reportable, sla_deadline_at, escalation_level, created_by
) VALUES
-- ra_001 instantaneous / pumped storage — freshly issued, awaiting acknowledgement
('ra_001','AS-RES-2026-0001','dispatch.frequency_event','frequency_event','fe_2026_0512','W13',
 'so_ntcsa','NTCSA System Operator','prov_drakensberg','Drakensberg Pumped Storage Scheme',
 'instantaneous_reserve','pumped_storage','Drakensberg Instantaneous Reserve','AS-CTR-2025-IR-008','frequency_drop',
 120, NULL, 10, NULL, 49.62,
 NULL, NULL, NULL,
 'Frequency dipped to 49.62Hz after a 600MW unit trip at Medupi; SO dispatched 120MW instantaneous reserve from Drakensberg.', NULL, NULL, 0,
 'activation_issued','2026-05-28 06:14:00', NULL, NULL, NULL, NULL,
 NULL, NULL, NULL, NULL, NULL,
 0,'2026-06-30 00:00:00',0,'demo_grid_001'),

-- ra_002 regulating / generator — acknowledged, ramp SLA BREACHED
('ra_002','AS-RES-2026-0002','dispatch.agc_signal','agc_signal','agc_2026_1180',NULL,
 'so_ntcsa','NTCSA System Operator','prov_majuba','Majuba Power Station',
 'regulating_reserve','generator','Majuba AGC Regulating Reserve','AS-CTR-2025-RR-014','dispatch_shortfall',
 80, NULL, 30, NULL, 49.94,
 NULL, NULL, NULL,
 'AGC area-control error called 80MW of regulating reserve from Majuba; unit acknowledged but had not begun ramping within the window.', NULL, NULL, 0,
 'acknowledged','2026-05-20 10:00:00','2026-05-20 10:01:30', NULL, NULL, NULL,
 NULL, NULL, NULL, NULL, NULL,
 0,'2026-05-20 10:04:30',1,'demo_grid_001'),

-- ra_003 ten-minute / generator (OCGT) — ramping toward setpoint
('ra_003','AS-RES-2026-0003','contingency.unit_trip','unit_trip','ut_2026_0233',NULL,
 'so_ntcsa','NTCSA System Operator','prov_ankerlig','Ankerlig OCGT',
 'ten_minute_reserve','generator','Ankerlig Ten-Minute Spinning Reserve','AS-CTR-2025-TMR-021','contingency',
 200, NULL, 600, NULL, 49.78,
 NULL, NULL, NULL,
 'Contingency reserve called after Koeberg Unit 1 partial load rejection; Ankerlig OCGT ramping 200MW.', NULL, NULL, 0,
 'ramping','2026-05-28 05:40:00','2026-05-28 05:45:00','2026-05-28 05:48:00', NULL, NULL,
 NULL, NULL, NULL, NULL, NULL,
 0,'2026-06-30 00:00:00',0,'demo_grid_001'),

-- ra_004 emergency / demand response — sustaining (no SLA window while delivering)
('ra_004','AS-RES-2026-0004','dispatch.emergency','emergency_event','em_2026_0044',NULL,
 'so_ntcsa','NTCSA System Operator','prov_amsa','ArcelorMittal Saldanha Interruptible Load',
 'emergency_reserve','demand_response','Saldanha Emergency Interruptible Reserve','AS-CTR-2025-ER-005','frequency_drop',
 350, NULL, 1800, NULL, 49.55,
 NULL, NULL, NULL,
 'Stage-2 emergency reserve called during evening peak shortfall; Saldanha interrupted 350MW of load and is sustaining.', NULL, NULL, 0,
 'sustaining','2026-05-28 18:05:00','2026-05-28 18:20:00','2026-05-28 18:28:00','2026-05-28 18:34:00', NULL,
 NULL, NULL, NULL, NULL, NULL,
 0, NULL, 0,'demo_grid_001'),

-- ra_005 instantaneous / battery storage — released, awaiting review
('ra_005','AS-RES-2026-0005','dispatch.frequency_event','frequency_event','fe_2026_0498',NULL,
 'so_ntcsa','NTCSA System Operator','prov_oasis_bess','Oasis BESS Park',
 'instantaneous_reserve','battery_storage','Oasis BESS Frequency Response','AS-CTR-2025-IR-019','frequency_drop',
 90, 90, 10, 4, 49.71,
 60000, NULL, NULL,
 'BESS delivered 90MW frequency response within 4 seconds; instruction released after frequency recovery to 49.98Hz.','Full instructed MW delivered; response time 4s well inside the 10s product spec.', NULL, 0,
 'released','2026-05-26 14:02:00','2026-05-26 14:02:20','2026-05-26 14:02:40','2026-05-26 14:03:10','2026-05-26 14:18:00',
 NULL, NULL, NULL, NULL, NULL,
 0,'2026-06-30 00:00:00',0,'demo_grid_001'),

-- ra_006 regulating / generator — in performance review, review SLA BREACHED
('ra_006','AS-RES-2026-0006','dispatch.agc_signal','agc_signal','agc_2026_1090',NULL,
 'so_ntcsa','NTCSA System Operator','prov_kusile','Kusile Power Station',
 'regulating_reserve','generator','Kusile AGC Regulating Reserve','AS-CTR-2025-RR-011','dispatch_shortfall',
 60, 58, 30, 22, 49.97,
 NULL, NULL, NULL,
 'Regulating reserve called and delivered; performance review of metered response opened but not completed within 24h.', NULL, NULL, 0,
 'performance_review','2026-05-15 07:30:00','2026-05-15 07:30:25','2026-05-15 07:30:45','2026-05-15 07:31:30','2026-05-15 07:50:00',
 '2026-05-15 08:00:00', NULL, NULL, NULL, NULL,
 0,'2026-05-16 08:00:00',1,'demo_grid_001'),

-- ra_007 supplemental / interconnector — performance verified, awaiting settlement
('ra_007','AS-RES-2026-0007','contingency.import_shortfall','import_shortfall','imp_2026_0017',NULL,
 'so_ntcsa','NTCSA System Operator','prov_cahora','Cahora Bassa HVDC Import',
 'supplemental_reserve','interconnector','Cahora Bassa Supplemental Reserve','AS-CTR-2025-SR-003','dispatch_shortfall',
 150, 148, 1200, 940, 49.85,
 95000, 920000, NULL,
 'Supplemental reserve sourced via the Cahora Bassa HVDC link; 148MW of 150MW delivered.','Delivered 148MW (98.7%); response 940s within the 1200s product window; verified compliant.', NULL, 0,
 'verified','2026-05-24 16:10:00','2026-05-24 16:12:00','2026-05-24 16:18:00','2026-05-24 16:26:00','2026-05-24 16:55:00',
 '2026-05-24 17:10:00','2026-05-25 09:00:00', NULL, NULL, NULL,
 0,'2026-06-30 00:00:00',0,'demo_grid_001'),

-- ra_008 instantaneous / pumped storage — fully settled (happy path)
('ra_008','AS-RES-2026-0008','dispatch.frequency_event','frequency_event','fe_2026_0455',NULL,
 'so_ntcsa','NTCSA System Operator','prov_ingula','Ingula Pumped Storage Scheme',
 'instantaneous_reserve','pumped_storage','Ingula Instantaneous Reserve','AS-CTR-2025-IR-002','frequency_drop',
 110, 112, 10, 6, 49.66,
 75000, 1850000, 0,
 'Frequency event after a Camden unit trip; Ingula delivered 112MW within 6 seconds and was settled in full.','Delivered 112MW against 110MW instructed (101.8%); response 6s; availability plus utilisation paid in full, no penalty.', NULL, 0,
 'settled','2026-05-10 19:22:00','2026-05-10 19:22:15','2026-05-10 19:22:30','2026-05-10 19:23:00','2026-05-10 19:40:00',
 '2026-05-10 20:00:00','2026-05-11 09:00:00','2026-05-12 11:00:00', NULL, NULL,
 0, NULL, 0,'demo_grid_001'),

-- ra_009 regulating / generator — flagged non-performance (reportable), penalty pending
('ra_009','AS-RES-2026-0009','dispatch.agc_signal','agc_signal','agc_2026_0975',NULL,
 'so_ntcsa','NTCSA System Operator','prov_tutuka','Tutuka Power Station',
 'regulating_reserve','generator','Tutuka AGC Regulating Reserve','AS-CTR-2025-RR-007','dispatch_shortfall',
 75, 22, 30, NULL, 49.91,
 NULL, NULL, 3500000,
 'Regulating reserve called from Tutuka; unit delivered only 22MW of 75MW and stalled while ramping.','Delivered 22MW against 75MW instructed (29.3%); flagged as non-performance under the AS contract.','under_delivery', 0,
 'non_performance','2026-05-22 11:00:00','2026-05-22 11:00:40','2026-05-22 11:01:20', NULL, NULL,
 NULL, NULL, NULL, '2026-05-22 11:30:00', NULL,
 1,'2026-06-30 00:00:00',1,'demo_grid_001'),

-- ra_010 regulating / demand response — non-performance escalated to dispute (reportable)
('ra_010','AS-RES-2026-0010','dispatch.agc_signal','agc_signal','agc_2026_0960',NULL,
 'so_ntcsa','NTCSA System Operator','prov_sasol','Sasol Secunda Demand Response',
 'regulating_reserve','demand_response','Sasol Secunda Regulating Reserve','AS-CTR-2025-RR-022','dispatch_shortfall',
 70, 18, 30, NULL, 49.93,
 NULL, NULL, 4200000,
 'Regulating reserve called from Sasol Secunda demand response; only 18MW shed; flagged non-performance.','Delivered 18MW against 70MW instructed (25.7%); provider disputes the metering baseline used for the assessment.','disputed_baseline', 1,
 'disputed','2026-05-21 13:15:00','2026-05-21 13:15:50','2026-05-21 13:16:40', NULL, NULL,
 NULL, NULL, NULL, '2026-05-21 13:45:00', '2026-05-23 10:00:00',
 1,'2026-06-30 00:00:00',1,'demo_grid_001');

-- Events (transition log). Full chain for ra_008 (demonstrates SO/provider split),
-- the non-performance/dispute branches for ra_009/ra_010, and a creation marker
-- for the rest.
INSERT OR IGNORE INTO oe_reserve_activations_events (
  id, activation_id, event_type, from_status, to_status, actor_id, actor_party, notes, created_at
) VALUES
('ra_evt_001','ra_001','reserve_activation.issued',NULL,'activation_issued','so_ntcsa','system_operator','120MW instantaneous reserve dispatched','2026-05-28 06:14:00'),
('ra_evt_002','ra_002','reserve_activation.issued',NULL,'activation_issued','so_ntcsa','system_operator','80MW regulating reserve dispatched','2026-05-20 10:00:00'),
('ra_evt_003','ra_002','reserve_activation.acknowledged','activation_issued','acknowledged','prov_majuba','reserve_provider','Majuba acknowledged the instruction','2026-05-20 10:01:30'),
('ra_evt_004','ra_003','reserve_activation.issued',NULL,'activation_issued','so_ntcsa','system_operator','200MW ten-minute reserve dispatched','2026-05-28 05:40:00'),
('ra_evt_005','ra_003','reserve_activation.acknowledged','activation_issued','acknowledged','prov_ankerlig','reserve_provider','Ankerlig acknowledged','2026-05-28 05:45:00'),
('ra_evt_006','ra_003','reserve_activation.ramping','acknowledged','ramping','prov_ankerlig','reserve_provider','OCGT ramping to 200MW','2026-05-28 05:48:00'),
('ra_evt_007','ra_004','reserve_activation.issued',NULL,'activation_issued','so_ntcsa','system_operator','350MW emergency reserve dispatched','2026-05-28 18:05:00'),
('ra_evt_008','ra_004','reserve_activation.sustaining','ramping','sustaining','prov_amsa','reserve_provider','Saldanha sustaining 350MW interruption','2026-05-28 18:34:00'),
('ra_evt_009','ra_005','reserve_activation.released','sustaining','released','so_ntcsa','system_operator','Released after frequency recovery','2026-05-26 14:18:00'),
('ra_evt_010','ra_006','reserve_activation.performance_review','released','performance_review','so_ntcsa','system_operator','Metered response under review','2026-05-15 08:00:00'),
('ra_evt_011','ra_007','reserve_activation.verified','performance_review','verified','so_ntcsa','system_operator','148MW verified compliant','2026-05-25 09:00:00'),
-- ra_008 full happy path (SO -> provider -> provider -> provider -> SO -> SO -> SO -> SO)
('ra_evt_012','ra_008','reserve_activation.issued',NULL,'activation_issued','so_ntcsa','system_operator','110MW instantaneous reserve dispatched','2026-05-10 19:22:00'),
('ra_evt_013','ra_008','reserve_activation.acknowledged','activation_issued','acknowledged','prov_ingula','reserve_provider','Ingula acknowledged','2026-05-10 19:22:15'),
('ra_evt_014','ra_008','reserve_activation.ramping','acknowledged','ramping','prov_ingula','reserve_provider','Ramping','2026-05-10 19:22:30'),
('ra_evt_015','ra_008','reserve_activation.sustaining','ramping','sustaining','prov_ingula','reserve_provider','Sustaining 112MW','2026-05-10 19:23:00'),
('ra_evt_016','ra_008','reserve_activation.released','sustaining','released','so_ntcsa','system_operator','Released','2026-05-10 19:40:00'),
('ra_evt_017','ra_008','reserve_activation.performance_review','released','performance_review','so_ntcsa','system_operator','Review opened','2026-05-10 20:00:00'),
('ra_evt_018','ra_008','reserve_activation.verified','performance_review','verified','so_ntcsa','system_operator','Verified 112MW delivered','2026-05-11 09:00:00'),
('ra_evt_019','ra_008','reserve_activation.settled','verified','settled','so_ntcsa','system_operator','Availability plus utilisation paid in full','2026-05-12 11:00:00'),
-- ra_009 non-performance branch
('ra_evt_020','ra_009','reserve_activation.issued',NULL,'activation_issued','so_ntcsa','system_operator','75MW regulating reserve dispatched','2026-05-22 11:00:00'),
('ra_evt_021','ra_009','reserve_activation.acknowledged','activation_issued','acknowledged','prov_tutuka','reserve_provider','Tutuka acknowledged','2026-05-22 11:00:40'),
('ra_evt_022','ra_009','reserve_activation.ramping','acknowledged','ramping','prov_tutuka','reserve_provider','Ramping','2026-05-22 11:01:20'),
('ra_evt_023','ra_009','reserve_activation.non_performance','ramping','non_performance','so_ntcsa','system_operator','Delivered only 22MW of 75MW; flagged non-performance','2026-05-22 11:30:00'),
-- ra_010 non-performance -> dispute branch
('ra_evt_024','ra_010','reserve_activation.issued',NULL,'activation_issued','so_ntcsa','system_operator','70MW regulating reserve dispatched','2026-05-21 13:15:00'),
('ra_evt_025','ra_010','reserve_activation.acknowledged','activation_issued','acknowledged','prov_sasol','reserve_provider','Sasol acknowledged','2026-05-21 13:15:50'),
('ra_evt_026','ra_010','reserve_activation.ramping','acknowledged','ramping','prov_sasol','reserve_provider','Ramping','2026-05-21 13:16:40'),
('ra_evt_027','ra_010','reserve_activation.non_performance','ramping','non_performance','so_ntcsa','system_operator','Delivered only 18MW of 70MW','2026-05-21 13:45:00'),
('ra_evt_028','ra_010','reserve_activation.disputed','non_performance','disputed','prov_sasol','reserve_provider','Provider disputes the metering baseline','2026-05-23 10:00:00');
