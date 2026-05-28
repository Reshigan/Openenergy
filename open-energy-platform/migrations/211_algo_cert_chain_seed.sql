-- Wave 60 — Trader Algorithmic / DEA Trading-System Certification & Kill-Switch
-- seed. 10 automated/DEA trading systems aco_001..aco_010 spanning 10 distinct
-- lifecycle states, all five authorised-footprint tiers (two per tier), and the
-- go-live / kill-switch / recertification / reject branches. Trading firms own
-- the system-lifecycle endpoints; the exchange authority drives the gating.
--
-- Reportable rows: the four HIGH-tier systems (is_reportable = isHighTier).
-- Regulator crossings shown in the event log: aco_008 kill-switch invocation
-- (crosses for EVERY tier — the W60 signature) and aco_009 refused
-- certification of a systemic system (crosses for high tiers).

INSERT OR IGNORE INTO oe_algo_certifications (
  id, case_number, source_event, source_entity_type, source_entity_id, source_wave,
  firm_party_id, firm_party_name, authority_party_id, authority_party_name,
  system_code, system_name, system_type, strategy_class, asset_classes, venue, dea_provider, software_version,
  authorised_notional_zar_m, max_order_value_zar, max_message_rate_per_sec, algo_tier,
  kill_switch_present, price_collars_present, throttles_present, max_order_size_present, conformance_test_passed, controls_validated,
  documentation_basis, conformance_basis, controls_basis, certification_basis, recertification_basis, kill_switch_basis, remediation_basis, rejection_basis, reason_code,
  recertification_round, remediation_round, suspension_round,
  chain_status, registration_submitted_at, documentation_review_at, conformance_testing_at, risk_controls_validation_at, certification_review_at, certified_at, deployed_at, recertification_review_at, suspended_at, remediation_required_at, rejected_at, decommissioned_at,
  is_reportable, sla_deadline_at, escalation_level, created_by
) VALUES
-- aco_001 limited / registration_submitted — sandbox intraday execution algo just registered
('aco_001','ALGO-CERT-2026-0001','desk.algo_onboarding','trading_system','sys_intraday_sniper','W36',
 'firm_vantage','Vantage Energy Trading (Pty) Ltd','auth_jse_mr','JSE Market Regulation Division',
 'VET-EXEC-INTRA','Solar Intraday Sniper','algo','execution','power','Open Energy Exchange',NULL,'2.1.0',
 4.5,250000,20,'limited',
 1,1,1,1,0,0,
 NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'new_system_registration',
 0,0,0,
 'registration_submitted','2026-05-26 09:00:00',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,
 0,'2026-05-27 09:00:00',0,'demo_trader_001'),

-- aco_002 limited / documentation_review — REC auction bidder, documentation under review; SLA BREACHED
('aco_002','ALGO-CERT-2026-0002','desk.algo_onboarding','trading_system','sys_rec_bidder',NULL,
 'firm_nexus','Nexus Carbon Capital (Pty) Ltd','auth_jse_mr','JSE Market Regulation Division',
 'NCC-AUCT-REC','REC Auction Bidder','algo','execution','carbon','Open Energy Exchange',NULL,'1.4.2',
 8.0,400000,8,'limited',
 1,1,1,1,0,0,
 'Registration documentation under review by the certification desk; governance and testing evidence being assessed.',NULL,NULL,NULL,NULL,NULL,NULL,NULL,'documentation_assessment',
 0,0,0,
 'documentation_review','2026-05-20 09:00:00','2026-05-22 10:00:00',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,
 0,'2026-05-24 10:00:00',1,'demo_trader_001'),

-- aco_003 standard / conformance_testing — day-ahead spread trader in exchange conformance testing
('aco_003','ALGO-CERT-2026-0003','desk.algo_onboarding','trading_system','sys_da_spread',NULL,
 'firm_meridian','Meridian Power Desk (Pty) Ltd','auth_jse_mr','JSE Market Regulation Division',
 'MPD-SPRD-DA','Day-Ahead Spread Trader','algo','arbitrage','power','Open Energy Exchange',NULL,'3.0.1',
 22.0,1200000,40,'standard',
 1,1,1,1,0,0,
 'Documentation accepted; system advanced to exchange conformance testing.','Exchange conformance test suite running against the venue test environment; order-type and protocol checks in progress.',NULL,NULL,NULL,NULL,NULL,NULL,'conformance_in_progress',
 0,0,0,
 'conformance_testing','2026-05-12 09:00:00','2026-05-15 10:00:00','2026-05-20 11:00:00',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,
 0,'2026-05-24 11:00:00',0,'demo_trader_001'),

-- aco_004 standard / risk_controls_validation — wind balancing hedger; pre-trade controls being validated
('aco_004','ALGO-CERT-2026-0004','desk.algo_onboarding','trading_system','sys_wind_hedge',NULL,
 'firm_aurora','Aurora Renewables Trading (Pty) Ltd','auth_jse_mr','JSE Market Regulation Division',
 'ART-HEDG-WIND','Wind Balancing Hedger','algo','hedging','power','Open Energy Exchange',NULL,'2.5.0',
 35.0,1800000,30,'standard',
 1,1,1,1,1,0,
 'Documentation accepted.','Conformance testing passed against the venue test environment.','Pre-trade risk controls under validation: kill-switch, price collars, throttles and max order size being exercised against limit cases.',NULL,NULL,NULL,NULL,NULL,'controls_validation',
 0,0,0,
 'risk_controls_validation','2026-05-08 09:00:00','2026-05-11 10:00:00','2026-05-15 11:00:00','2026-05-22 09:00:00',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,
 0,'2026-05-26 09:00:00',0,'demo_trader_001'),

-- aco_005 significant / certification_review — carbon spot market-maker before the certification committee
('aco_005','ALGO-CERT-2026-0005','desk.algo_onboarding','trading_system','sys_carbon_mm',NULL,
 'firm_nexus','Nexus Carbon Capital (Pty) Ltd','auth_jse_mr','JSE Market Regulation Division',
 'NCC-MM-CARBON','Carbon Spot Market-Maker','market_maker','mm','carbon','Open Energy Exchange',NULL,'4.2.0',
 120.0,6000000,120,'significant',
 1,1,1,1,1,1,
 'Documentation accepted.','Conformance testing passed.','Pre-trade risk controls validated end to end.','Submitted to the certification committee for sign-off; controls evidence and conformance report tabled.',NULL,NULL,NULL,NULL,'certification_review',
 0,0,0,
 'certification_review','2026-04-28 09:00:00','2026-05-02 10:00:00','2026-05-08 11:00:00','2026-05-14 09:00:00','2026-05-20 10:00:00',NULL,NULL,NULL,NULL,NULL,NULL,NULL,
 0,'2026-05-24 10:00:00',0,'demo_trader_001'),

-- aco_006 significant / certified — power curve arbitrage engine certified, awaiting firm deployment
('aco_006','ALGO-CERT-2026-0006','desk.algo_onboarding','trading_system','sys_curve_arb',NULL,
 'firm_meridian','Meridian Power Desk (Pty) Ltd','auth_jse_mr','JSE Market Regulation Division',
 'MPD-ARB-CURVE','Power Curve Arbitrage Engine','algo','arbitrage','power','Open Energy Exchange',NULL,'3.3.0',
 180.0,9000000,90,'significant',
 1,1,1,1,1,1,
 'Documentation accepted.','Conformance testing passed.','Pre-trade risk controls validated.','Certification committee granted certification; system cleared for deployment by the firm.',NULL,NULL,NULL,NULL,'certified',
 0,0,0,
 'certified','2026-04-20 09:00:00','2026-04-24 10:00:00','2026-04-30 11:00:00','2026-05-06 09:00:00','2026-05-12 10:00:00','2026-05-18 14:00:00',NULL,NULL,NULL,NULL,NULL,NULL,
 0,'2026-05-30 14:00:00',0,'demo_trader_001'),

-- aco_007 high_impact / deployed — baseload block execution SOR live (REPORTABLE tier; deployed carries no SLA)
('aco_007','ALGO-CERT-2026-0007','desk.algo_onboarding','trading_system','sys_block_sor',NULL,
 'firm_vantage','Vantage Energy Trading (Pty) Ltd','auth_jse_mr','JSE Market Regulation Division',
 'VET-SOR-BLOCK','Baseload Block Execution SOR','smart_order_router','execution','power','Open Energy Exchange',NULL,'5.1.0',
 450.0,25000000,200,'high_impact',
 1,1,1,1,1,1,
 'Documentation accepted.','Conformance testing passed.','Pre-trade risk controls validated.','Certification granted by the committee.',NULL,NULL,NULL,NULL,'deployed_live',
 0,0,0,
 'deployed','2026-04-10 09:00:00','2026-04-14 10:00:00','2026-04-20 11:00:00','2026-04-26 09:00:00','2026-05-02 10:00:00','2026-05-06 14:00:00','2026-05-10 08:00:00',NULL,NULL,NULL,NULL,NULL,
 1,NULL,0,'demo_trader_001'),

-- aco_008 high_impact / suspended — peak demand directional algo killed by its kill-switch (REPORTABLE: kill-switch crosses for EVERY tier)
('aco_008','ALGO-CERT-2026-0008','desk.algo_onboarding','trading_system','sys_peak_dir',NULL,
 'firm_meridian','Meridian Power Desk (Pty) Ltd','auth_jse_mr','JSE Market Regulation Division',
 'MPD-DIR-PEAK','Peak Demand Directional Algo','algo','directional','power','Open Energy Exchange',NULL,'4.0.3',
 720.0,40000000,180,'high_impact',
 1,1,1,1,1,1,
 'Documentation accepted.','Conformance testing passed.','Pre-trade risk controls validated.','Certification granted by the committee.',NULL,'Kill-switch invoked during a runaway-quoting event: the system breached its max-message-rate collar and was halted by the desk; live orders pulled and the system suspended pending root-cause. Emergency halt notified to the exchange supervisor.',NULL,NULL,'kill_switch_invoked',
 0,0,1,
 'suspended','2026-03-25 09:00:00','2026-03-29 10:00:00','2026-04-04 11:00:00','2026-04-10 09:00:00','2026-04-16 10:00:00','2026-04-20 14:00:00','2026-04-25 08:00:00',NULL,'2026-05-24 13:30:00',NULL,NULL,NULL,
 1,'2026-05-25 01:30:00',1,'demo_trader_001'),

-- aco_009 systemic / rejected — cross-border energy arb refused certification (REPORTABLE: reject crosses for high tiers)
('aco_009','ALGO-CERT-2026-0009','desk.algo_onboarding','trading_system','sys_xborder_arb',NULL,
 'firm_aurora','Aurora Renewables Trading (Pty) Ltd','auth_jse_mr','JSE Market Regulation Division',
 'ART-ARB-XBDR','Cross-Border Energy Arb','algo','arbitrage','power','Open Energy Exchange',NULL,'1.9.0',
 1500.0,80000000,400,'systemic',
 1,0,1,1,0,0,
 'Documentation accepted.',NULL,NULL,'Tabled to the certification committee.',NULL,NULL,NULL,'Certification refused: price collars absent and conformance evidence incomplete for a systemic cross-border system; refusal notified to the exchange supervisor as a reportable event.','certification_refused',
 0,0,0,
 'rejected','2026-04-15 09:00:00','2026-04-19 10:00:00',NULL,NULL,'2026-05-08 10:00:00',NULL,NULL,NULL,NULL,NULL,'2026-05-15 11:00:00',NULL,
 1,NULL,0,'demo_trader_001'),

-- aco_010 systemic / recertification_review — national grid liquidity MM under periodic recertification (REPORTABLE tier)
('aco_010','ALGO-CERT-2026-0010','desk.algo_onboarding','trading_system','sys_grid_mm',NULL,
 'firm_vantage','Vantage Energy Trading (Pty) Ltd','auth_jse_mr','JSE Market Regulation Division',
 'VET-MM-GRIDLQ','National Grid Liquidity MM','market_maker','mm','power','Open Energy Exchange',NULL,'6.2.0',
 3200.0,150000000,500,'systemic',
 1,1,1,1,1,1,
 'Documentation accepted.','Conformance testing passed.','Pre-trade risk controls validated.','Certification granted by the committee.','Periodic recertification triggered after a material strategy change; conformance re-test and controls re-validation under exchange review.',NULL,NULL,NULL,'periodic_recertification',
 1,0,0,
 'recertification_review','2026-03-10 09:00:00','2026-03-14 10:00:00','2026-03-20 11:00:00','2026-03-26 09:00:00','2026-04-01 10:00:00','2026-04-06 14:00:00','2026-04-15 08:00:00','2026-05-22 09:00:00',NULL,NULL,NULL,NULL,
 1,'2026-05-30 09:00:00',0,'demo_trader_001');

-- Events (transition log). Full go-live arc for aco_007, the kill-switch branch
-- for aco_008, the reject branch for aco_009, the recertification trigger for
-- aco_010, and progression markers for the rest. Trading firm owns
-- registration / submit_certification / deploy / kill-switch; the exchange
-- authority drives review / conformance / controls / certify / recertify.
INSERT OR IGNORE INTO oe_algo_certifications_events (
  id, cert_id, event_type, from_status, to_status, actor_id, actor_party, notes, created_at
) VALUES
('aco_evt_001','aco_001','algo_certification.registration_submitted',NULL,'registration_submitted','firm_vantage','trading_firm','Sandbox intraday execution algo registered for certification','2026-05-26 09:00:00'),
('aco_evt_002','aco_002','algo_certification.registration_submitted',NULL,'registration_submitted','firm_nexus','trading_firm','REC auction bidder registered','2026-05-20 09:00:00'),
('aco_evt_003','aco_002','algo_certification.documentation_review','registration_submitted','documentation_review','auth_jse_mr','exchange_authority','Documentation review opened','2026-05-22 10:00:00'),
('aco_evt_004','aco_003','algo_certification.registration_submitted',NULL,'registration_submitted','firm_meridian','trading_firm','Day-ahead spread trader registered','2026-05-12 09:00:00'),
('aco_evt_005','aco_003','algo_certification.documentation_review','registration_submitted','documentation_review','auth_jse_mr','exchange_authority','Documentation accepted','2026-05-15 10:00:00'),
('aco_evt_006','aco_003','algo_certification.conformance_testing','documentation_review','conformance_testing','auth_jse_mr','exchange_authority','Exchange conformance testing started','2026-05-20 11:00:00'),
('aco_evt_007','aco_004','algo_certification.conformance_testing','documentation_review','conformance_testing','auth_jse_mr','exchange_authority','Conformance testing','2026-05-15 11:00:00'),
('aco_evt_008','aco_004','algo_certification.risk_controls_validation','conformance_testing','risk_controls_validation','auth_jse_mr','exchange_authority','Pre-trade risk controls under validation','2026-05-22 09:00:00'),
('aco_evt_009','aco_005','algo_certification.risk_controls_validation','conformance_testing','risk_controls_validation','auth_jse_mr','exchange_authority','Controls validated','2026-05-14 09:00:00'),
('aco_evt_010','aco_005','algo_certification.certification_review','risk_controls_validation','certification_review','firm_nexus','trading_firm','Submitted to the certification committee','2026-05-20 10:00:00'),
('aco_evt_011','aco_006','algo_certification.certification_review','risk_controls_validation','certification_review','firm_meridian','trading_firm','Submitted to the certification committee','2026-05-12 10:00:00'),
('aco_evt_012','aco_006','algo_certification.certified','certification_review','certified','auth_jse_mr','exchange_authority','Certification granted; cleared for deployment','2026-05-18 14:00:00'),
-- aco_007 full go-live arc (firm registers -> authority gates -> firm deploys)
('aco_evt_013','aco_007','algo_certification.registration_submitted',NULL,'registration_submitted','firm_vantage','trading_firm','Baseload block execution SOR registered','2026-04-10 09:00:00'),
('aco_evt_014','aco_007','algo_certification.documentation_review','registration_submitted','documentation_review','auth_jse_mr','exchange_authority','Documentation accepted','2026-04-14 10:00:00'),
('aco_evt_015','aco_007','algo_certification.conformance_testing','documentation_review','conformance_testing','auth_jse_mr','exchange_authority','Conformance testing passed','2026-04-20 11:00:00'),
('aco_evt_016','aco_007','algo_certification.risk_controls_validation','conformance_testing','risk_controls_validation','auth_jse_mr','exchange_authority','Pre-trade risk controls validated','2026-04-26 09:00:00'),
('aco_evt_017','aco_007','algo_certification.certification_review','risk_controls_validation','certification_review','firm_vantage','trading_firm','Submitted to the certification committee','2026-05-02 10:00:00'),
('aco_evt_018','aco_007','algo_certification.certified','certification_review','certified','auth_jse_mr','exchange_authority','Certification granted','2026-05-06 14:00:00'),
('aco_evt_019','aco_007','algo_certification.deployed','certified','deployed','firm_vantage','trading_firm','System deployed live by the firm','2026-05-10 08:00:00'),
-- aco_008 kill-switch branch (deployed then suspended; crosses for EVERY tier)
('aco_evt_020','aco_008','algo_certification.certified','certification_review','certified','auth_jse_mr','exchange_authority','Certification granted','2026-04-20 14:00:00'),
('aco_evt_021','aco_008','algo_certification.deployed','certified','deployed','firm_meridian','trading_firm','Peak demand directional algo deployed live','2026-04-25 08:00:00'),
('aco_evt_022','aco_008','algo_certification.suspended','deployed','suspended','firm_meridian','trading_firm','Kill-switch invoked on a runaway-quoting event; system halted and suspended; emergency halt notified to the exchange supervisor','2026-05-24 13:30:00'),
-- aco_009 reject branch (systemic refused; crosses for high tiers)
('aco_evt_023','aco_009','algo_certification.registration_submitted',NULL,'registration_submitted','firm_aurora','trading_firm','Cross-border energy arb registered','2026-04-15 09:00:00'),
('aco_evt_024','aco_009','algo_certification.documentation_review','registration_submitted','documentation_review','auth_jse_mr','exchange_authority','Documentation accepted','2026-04-19 10:00:00'),
('aco_evt_025','aco_009','algo_certification.certification_review','documentation_review','certification_review','firm_aurora','trading_firm','Tabled to the certification committee','2026-05-08 10:00:00'),
('aco_evt_026','aco_009','algo_certification.rejected','certification_review','rejected','auth_jse_mr','exchange_authority','Certification refused: price collars absent and conformance evidence incomplete; reportable to the exchange supervisor','2026-05-15 11:00:00'),
-- aco_010 recertification trigger (live then back under review)
('aco_evt_027','aco_010','algo_certification.certified','certification_review','certified','auth_jse_mr','exchange_authority','Certification granted','2026-04-06 14:00:00'),
('aco_evt_028','aco_010','algo_certification.deployed','certified','deployed','firm_vantage','trading_firm','National grid liquidity MM deployed live','2026-04-15 08:00:00'),
('aco_evt_029','aco_010','algo_certification.recertification_review','deployed','recertification_review','auth_jse_mr','exchange_authority','Periodic recertification triggered after a material strategy change','2026-05-22 09:00:00');
