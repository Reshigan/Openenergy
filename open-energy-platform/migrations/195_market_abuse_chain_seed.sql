-- Wave 52 — Trader Market Abuse Surveillance & STOR seed.
-- 10 surveillance cases mac_001..mac_010 spanning 10 distinct lifecycle states,
-- all five typology severity tiers, and the dismiss / STOR / enforcement /
-- dispute branches. The surveillance function is OE Market Surveillance; the
-- subjects are anonymised member desks. No apostrophes anywhere (D1 SQLite).

INSERT OR IGNORE INTO oe_market_abuse_cases (
  id, case_number, source_event, source_entity_type, source_entity_id, source_wave,
  subject_party_id, subject_party_name, surveillance_party_id, surveillance_party_name,
  abuse_tier, typology, alert_source, instrument, energy_type, product, venue, risk_score,
  suspect_volume_mwh, suspect_value_zar_m, estimated_benefit_zar, penalty_zar,
  triage_basis, investigation_basis, evidence_basis, analysis_basis, stor_basis, sanction_basis,
  reason_code, dispute_round,
  chain_status, alert_raised_at, triaged_at, under_investigation_at, evidence_review_at,
  analysis_complete_at, cleared_at, stor_filed_at, regulator_referred_at, enforcement_action_at,
  sanctioned_at, disputed_at, dispute_resolved_at,
  is_reportable, sla_deadline_at, escalation_level, created_by
) VALUES
-- mac_001 info_alert / quote_stuffing — freshly raised, awaiting triage
('mac_001','MA-SUR-2026-0001','surveillance.order_rate_spike','order_pattern','op_2026_4471',NULL,
 'mbr_desk_07','Member Desk 07 (Mthombo Energy Trading)','sur_oe','OE Market Surveillance',
 'info_alert','quote_stuffing','automated_surveillance','Day-Ahead Baseload','electricity','day_ahead','order_book',14,
 0, 0, NULL, NULL,
 NULL, NULL, NULL, NULL, NULL, NULL,
 NULL, 0,
 'alert_raised','2026-05-28 07:55:00', NULL, NULL, NULL,
 NULL, NULL, NULL, NULL, NULL,
 NULL, NULL, NULL,
 0,'2026-05-29 07:55:00',0,'demo_admin_001'),

-- mac_002 high_risk / spoofing — triaged, triage-to-investigation SLA BREACHED
('mac_002','MA-SUR-2026-0002','surveillance.layered_cancels','order_pattern','op_2026_4388',NULL,
 'mbr_desk_12','Member Desk 12 (Karoo Power Capital)','sur_oe','OE Market Surveillance',
 'high_risk','spoofing','automated_surveillance','Intraday Peak Block','electricity','intraday','order_book',71,
 240, 18.4, NULL, NULL,
 'Repeated large bids placed and cancelled within 300ms ahead of opposing fills; triaged as probable spoofing.', NULL, NULL, NULL, NULL, NULL,
 NULL, 0,
 'triaged','2026-05-20 09:10:00','2026-05-20 09:40:00', NULL, NULL,
 NULL, NULL, NULL, NULL, NULL,
 NULL, NULL, NULL,
 1,'2026-05-20 17:40:00',1,'demo_admin_001'),

-- mac_003 critical_abuse / price_manipulation — under investigation
('mac_003','MA-SUR-2026-0003','surveillance.close_price_ramp','trade_pattern','tp_2026_2210',NULL,
 'mbr_desk_03','Member Desk 03 (Highveld Merchant Power)','sur_oe','OE Market Surveillance',
 'critical_abuse','price_manipulation','automated_surveillance','Day-Ahead Settlement','electricity','day_ahead','auction',92,
 600, 92.7, NULL, NULL,
 'Coordinated buying into the closing auction lifted the day-ahead settlement index; triaged critical and escalated.',
 'Investigation opened: reconstructing the order book around the 12:00 auction window and the desk net position.', NULL, NULL, NULL, NULL,
 NULL, 0,
 'under_investigation','2026-05-25 12:30:00','2026-05-25 13:00:00','2026-05-25 14:15:00', NULL,
 NULL, NULL, NULL, NULL, NULL,
 NULL, NULL, NULL,
 1,'2026-05-28 14:15:00',0,'demo_admin_001'),

-- mac_004 medium_risk / wash_trade — evidence review
('mac_004','MA-SUR-2026-0004','surveillance.self_match','trade_pattern','tp_2026_2188',NULL,
 'mbr_desk_19','Member Desk 19 (Cape Renewables Trading)','sur_oe','OE Market Surveillance',
 'medium_risk','wash_trade','automated_surveillance','REC Forward','rec','forward','otc',52,
 150, 7.1, NULL, NULL,
 'Matched buy and sell at the same price between two accounts under common control; triaged medium.',
 'Common-control analysis confirmed; beneficial ownership traced to a single parent.',
 'Trade and order evidence compiled; no change in beneficial ownership across the matched legs.', NULL, NULL, NULL,
 NULL, 0,
 'evidence_review','2026-05-24 10:00:00','2026-05-24 11:00:00','2026-05-24 15:00:00','2026-05-26 09:30:00',
 NULL, NULL, NULL, NULL, NULL,
 NULL, NULL, NULL,
 0,'2026-05-29 09:30:00',0,'demo_admin_001'),

-- mac_005 low_risk / front_running — analysis complete, decision pending
('mac_005','MA-SUR-2026-0005','surveillance.pre_position','order_pattern','op_2026_4001',NULL,
 'mbr_desk_05','Member Desk 05 (Limpopo Grid Markets)','sur_oe','OE Market Surveillance',
 'low_risk','front_running','automated_surveillance','Carbon Credit Spot','carbon','spot','order_book',31,
 80, 2.4, NULL, NULL,
 'Small proprietary fill seconds before a large client order; triaged low risk.',
 'Timeline reviewed; client order was not yet visible to the desk at the time of the proprietary fill.',
 'Order-entry timestamps and desk access logs collected.',
 'Analysis: no informational advantage established; recommend clearance pending sign-off.', NULL, NULL,
 NULL, 0,
 'analysis_complete','2026-05-22 08:00:00','2026-05-22 09:00:00','2026-05-22 13:00:00','2026-05-23 10:00:00',
 '2026-05-24 11:00:00', NULL, NULL, NULL, NULL,
 NULL, NULL, NULL,
 0,'2026-05-26 11:00:00',0,'demo_admin_001'),

-- mac_006 info_alert / quote_stuffing — dismissed false positive (cleared terminal via dismiss)
('mac_006','MA-SUR-2026-0006','surveillance.order_rate_spike','order_pattern','op_2026_3950',NULL,
 'mbr_desk_22','Member Desk 22 (Atlantic Power Brokers)','sur_oe','OE Market Surveillance',
 'info_alert','quote_stuffing','automated_surveillance','Intraday Block','electricity','intraday','order_book',9,
 0, 0, NULL, NULL,
 'High message rate flagged; triage found it was a routine algo recalibration during a scheduled test window.', NULL, NULL, NULL, NULL, NULL,
 'false_positive', 0,
 'cleared','2026-05-19 06:30:00', NULL, NULL, NULL,
 NULL, '2026-05-19 07:10:00', NULL, NULL, NULL,
 NULL, NULL, NULL,
 0, NULL, 0,'demo_admin_001'),

-- mac_007 high_risk / insider_trading — STOR filed to the FSCA (reportable)
('mac_007','MA-SUR-2026-0007','surveillance.news_screening','trade_pattern','tp_2026_2055',NULL,
 'mbr_desk_09','Member Desk 09 (Drakensberg Commodities)','sur_oe','OE Market Surveillance',
 'high_risk','insider_trading','news_screening','Day-Ahead Baseload','electricity','day_ahead','order_book',74,
 420, 54.2, 6800000, NULL,
 'Unusual long build immediately before a market-moving outage notice; triaged high risk.',
 'Investigation linked the desk to a contractor with advance knowledge of the unplanned outage.',
 'Communications and trade records compiled showing trading on non-public outage information.',
 'Analysis concluded probable insider dealing under FMA s78; STOR recommended.',
 'Suspicious Transaction and Order Report filed with the FSCA market-abuse division.', NULL,
 NULL, 0,
 'stor_filed','2026-05-15 14:00:00','2026-05-15 15:00:00','2026-05-16 09:00:00','2026-05-18 10:00:00',
 '2026-05-20 11:00:00', NULL, '2026-05-21 09:00:00', NULL, NULL,
 NULL, NULL, NULL,
 1,'2026-05-24 09:00:00',0,'demo_admin_001'),

-- mac_008 critical_abuse / price_manipulation — full path to SANCTIONED (reportable)
('mac_008','MA-SUR-2026-0008','surveillance.close_price_ramp','trade_pattern','tp_2026_1990',NULL,
 'mbr_desk_15','Member Desk 15 (Vaal Energy Partners)','sur_oe','OE Market Surveillance',
 'critical_abuse','price_manipulation','automated_surveillance','Day-Ahead Settlement','electricity','day_ahead','auction',96,
 900, 138.5, 14500000, 9000000,
 'Persistent marking-the-close across five sessions lifted the settlement index against a large short; triaged critical.',
 'Investigation reconstructed the closing auctions and quantified the index impact attributable to the desk.',
 'Order, trade and position evidence compiled across the five sessions; clear manipulative intent established.',
 'Analysis concluded manipulation under FMA s80; STOR and enforcement recommended.',
 'STOR filed with the FSCA; matter referred for enforcement.',
 'Administrative penalty of R9.0m imposed and disgorgement of R14.5m estimated benefit ordered.',
 'marking_the_close', 0,
 'sanctioned','2026-05-04 16:00:00','2026-05-04 17:00:00','2026-05-05 09:00:00','2026-05-07 10:00:00',
 '2026-05-09 11:00:00', NULL, '2026-05-10 09:00:00','2026-05-12 10:00:00','2026-05-15 09:00:00',
 '2026-05-22 14:00:00', NULL, NULL,
 1, NULL, 0,'demo_admin_001'),

-- mac_009 high_risk / front_running — referred to the regulator for enforcement (reportable)
('mac_009','MA-SUR-2026-0009','surveillance.pre_position','order_pattern','op_2026_3777',NULL,
 'mbr_desk_11','Member Desk 11 (Orange River Trading)','sur_oe','OE Market Surveillance',
 'high_risk','front_running','automated_surveillance','REC Forward','rec','forward','otc',68,
 300, 21.0, 3100000, NULL,
 'Repeated proprietary fills ahead of large client REC orders; triaged high risk.',
 'Investigation established a consistent pattern of trading ahead of visible client flow.',
 'Order-routing and desk-access evidence compiled showing pre-positioning against client orders.',
 'Analysis concluded probable front-running under FAIS conduct duties; STOR filed and referral recommended.',
 'STOR filed; matter referred to the FSCA for enforcement consideration.', NULL,
 NULL, 0,
 'regulator_referred','2026-05-12 08:30:00','2026-05-12 10:00:00','2026-05-13 09:00:00','2026-05-15 10:00:00',
 '2026-05-17 11:00:00', NULL, '2026-05-18 09:00:00','2026-05-20 10:00:00', NULL,
 NULL, NULL, NULL,
 1,'2026-05-27 10:00:00',0,'demo_admin_001'),

-- mac_010 critical_abuse / layering — enforcement disputed by the subject (reportable)
('mac_010','MA-SUR-2026-0010','surveillance.layered_cancels','order_pattern','op_2026_3654',NULL,
 'mbr_desk_18','Member Desk 18 (Sterkfontein Capital)','sur_oe','OE Market Surveillance',
 'critical_abuse','layering','automated_surveillance','Intraday Peak Block','electricity','intraday','order_book',88,
 540, 47.8, 5600000, NULL,
 'Multi-level layered orders away from touch to create a false impression of depth; triaged critical.',
 'Investigation quantified the layered volume and the executions achieved on the opposite side.',
 'Full order-book reconstruction compiled showing the layering and subsequent fills.',
 'Analysis concluded manipulation by layering under FMA s80; STOR filed and enforcement commenced.',
 'STOR filed; enforcement commenced; subject contests the findings.', NULL,
 'disputed_findings', 1,
 'disputed','2026-05-08 11:00:00','2026-05-08 13:00:00','2026-05-09 09:00:00','2026-05-11 10:00:00',
 '2026-05-13 11:00:00', NULL, '2026-05-14 09:00:00','2026-05-16 10:00:00','2026-05-19 09:00:00',
 NULL, '2026-05-24 10:00:00', NULL,
 1,'2026-05-31 10:00:00',0,'demo_admin_001');

-- Events (transition log). Full escalation chain for mac_008 (surveillance ->
-- regulator split), the dispute branch entry for mac_010, the STOR markers for
-- mac_007/mac_009, and a creation marker for the rest.
INSERT OR IGNORE INTO oe_market_abuse_cases_events (
  id, case_id, event_type, from_status, to_status, actor_id, actor_party, notes, created_at
) VALUES
('mac_evt_001','mac_001','market_abuse.alert_raised',NULL,'alert_raised','sur_oe','surveillance','Order-rate spike flagged by automated surveillance','2026-05-28 07:55:00'),
('mac_evt_002','mac_002','market_abuse.alert_raised',NULL,'alert_raised','sur_oe','surveillance','Layered cancellations flagged','2026-05-20 09:10:00'),
('mac_evt_003','mac_002','market_abuse.triaged','alert_raised','triaged','sur_oe','surveillance','Triaged as probable spoofing','2026-05-20 09:40:00'),
('mac_evt_004','mac_003','market_abuse.alert_raised',NULL,'alert_raised','sur_oe','surveillance','Closing-auction price ramp flagged','2026-05-25 12:30:00'),
('mac_evt_005','mac_003','market_abuse.triaged','alert_raised','triaged','sur_oe','surveillance','Triaged critical','2026-05-25 13:00:00'),
('mac_evt_006','mac_003','market_abuse.under_investigation','triaged','under_investigation','sur_oe','surveillance','Investigation opened','2026-05-25 14:15:00'),
('mac_evt_007','mac_004','market_abuse.alert_raised',NULL,'alert_raised','sur_oe','surveillance','Self-match flagged','2026-05-24 10:00:00'),
('mac_evt_008','mac_004','market_abuse.evidence_review','under_investigation','evidence_review','sur_oe','surveillance','Evidence under review','2026-05-26 09:30:00'),
('mac_evt_009','mac_005','market_abuse.analysis_complete','evidence_review','analysis_complete','sur_oe','surveillance','Analysis complete; clearance recommended','2026-05-24 11:00:00'),
('mac_evt_010','mac_006','market_abuse.alert_raised',NULL,'alert_raised','sur_oe','surveillance','High message rate flagged','2026-05-19 06:30:00'),
('mac_evt_011','mac_006','market_abuse.cleared','alert_raised','cleared','sur_oe','surveillance','Dismissed as a false positive during a scheduled algo test','2026-05-19 07:10:00'),
('mac_evt_012','mac_007','market_abuse.stor_filed','analysis_complete','stor_filed','sur_oe','surveillance','STOR filed with the FSCA on probable insider dealing','2026-05-21 09:00:00'),
-- mac_008 full escalation path (surveillance -> surveillance ... -> regulator -> regulator -> regulator)
('mac_evt_013','mac_008','market_abuse.alert_raised',NULL,'alert_raised','sur_oe','surveillance','Marking-the-close pattern flagged','2026-05-04 16:00:00'),
('mac_evt_014','mac_008','market_abuse.triaged','alert_raised','triaged','sur_oe','surveillance','Triaged critical','2026-05-04 17:00:00'),
('mac_evt_015','mac_008','market_abuse.under_investigation','triaged','under_investigation','sur_oe','surveillance','Investigation opened across five sessions','2026-05-05 09:00:00'),
('mac_evt_016','mac_008','market_abuse.evidence_review','under_investigation','evidence_review','sur_oe','surveillance','Evidence compiled','2026-05-07 10:00:00'),
('mac_evt_017','mac_008','market_abuse.analysis_complete','evidence_review','analysis_complete','sur_oe','surveillance','Manipulation under FMA s80 concluded','2026-05-09 11:00:00'),
('mac_evt_018','mac_008','market_abuse.stor_filed','analysis_complete','stor_filed','sur_oe','surveillance','STOR filed with the FSCA','2026-05-10 09:00:00'),
('mac_evt_019','mac_008','market_abuse.regulator_referred','stor_filed','regulator_referred','reg_fsca','regulator','Referred for enforcement','2026-05-12 10:00:00'),
('mac_evt_020','mac_008','market_abuse.enforcement_action','regulator_referred','enforcement_action','reg_fsca','regulator','Enforcement commenced','2026-05-15 09:00:00'),
('mac_evt_021','mac_008','market_abuse.sanctioned','enforcement_action','sanctioned','reg_fsca','regulator','Penalty R9.0m plus disgorgement R14.5m ordered','2026-05-22 14:00:00'),
-- mac_009 STOR + referral markers
('mac_evt_022','mac_009','market_abuse.stor_filed','analysis_complete','stor_filed','sur_oe','surveillance','STOR filed on probable front-running','2026-05-18 09:00:00'),
('mac_evt_023','mac_009','market_abuse.regulator_referred','stor_filed','regulator_referred','reg_fsca','regulator','Referred to the FSCA for enforcement consideration','2026-05-20 10:00:00'),
-- mac_010 enforcement -> dispute branch
('mac_evt_024','mac_010','market_abuse.enforcement_action','regulator_referred','enforcement_action','reg_fsca','regulator','Enforcement commenced on layering','2026-05-19 09:00:00'),
('mac_evt_025','mac_010','market_abuse.disputed','enforcement_action','disputed','mbr_desk_18','subject','Subject contests the manipulation findings','2026-05-24 10:00:00');
