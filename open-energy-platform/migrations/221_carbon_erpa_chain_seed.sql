-- Wave 65 — Carbon ERPA Forward Delivery & Make-Good seed.
-- 10 ERPAs erpa_001..erpa_010 spanning 10 distinct lifecycle states, all five
-- volume tiers (two each), and the clean-delivery / shortfall+make-good / dispute
-- / terminate branches. Transfer types span Article 6 (ITMO, corresponding
-- adjustment required), voluntary and compliance. The three reportable cases prove
-- the W65 signature: an Article 6 delivery verified on a MINOR project (verify
-- crosses for EVERY tier when a corresponding adjustment is required), a mega
-- termination (terminate crosses for major + mega), and a mega Article 6 dispute
-- whose SLA has breached (breach crosses for major + mega). reportable_total = 3.
-- No apostrophes anywhere (D1 SQLite).

INSERT OR IGNORE INTO oe_carbon_erpas (
  id, erpa_number,
  source_event, source_entity_type, source_entity_id, source_wave,
  project_id, project_name, registry_standard, methodology_id, seller_party_id, seller_party_name, buyer_party_id, buyer_party_name,
  transfer_type, volume_tier, contracted_volume_tco2e, delivered_volume_tco2e, shortfall_volume_tco2e, price_per_tco2e, contract_currency, contract_value, vintage_year, host_country, corresponding_adjustment_required, corresponding_adjustment_ref, delivery_window_start, delivery_window_end,
  erpa_ref, delivery_ref, verification_ref, settlement_ref, dispute_ref,
  execution_basis, schedule_basis, delivery_basis, verification_basis, shortfall_basis, make_good_basis, settlement_basis, dispute_basis, termination_basis, reason_code, erpa_summary,
  chain_status, drafted_at, executed_at, delivery_scheduled_at, delivery_initiated_at, delivery_verified_at, shortfall_flagged_at, make_good_pending_at, settled_at, completed_at, disputed_at, terminated_at, withdrawn_at,
  delivery_round, sla_deadline_at, last_sla_breach_at, is_reportable, escalation_level, created_by
) VALUES
-- erpa_001 minor voluntary — drafted, awaiting execution
('erpa_001','ERPA-2026-0001',
 'carbon_registration.registered','carbon_project_registration','reg_001','W37',
 'proj_karoo_solar','Karoo Solar Cluster Phase One','verra_vcs','VM0042','pp_001','Karoo Renewables','buyer_eu_001','EU Carbon Desk',
 'voluntary','minor',5000,NULL,NULL,180,'USD',900000,2026,NULL,0,NULL,'2026-07-01','2027-06-30',
 'ERPA-DOC-001',NULL,NULL,NULL,NULL,
 'Forward ERPA drafted for the voluntary market; awaiting counterparty execution.',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,
 'erpa_drafted','2026-05-20 08:00:00',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,
 0,'2026-06-03 08:00:00',NULL,0,0,'demo_carbon_001'),

-- erpa_002 minor article6 — delivery verified (REPORTABLE: verify crosses for EVERY tier when a corresponding adjustment is required)
('erpa_002','ERPA-2026-0002',
 'carbon_mrv.issuance','carbon_mrv','mrv_002','W11',
 'proj_coega_wind','Coega Wind Repower','gold_standard','GS-RE-01','pp_002','Coega Wind Partners','buyer_ch_002','Swiss KliK Foundation',
 'article6','minor',7000,7000,NULL,210,'USD',1470000,2026,'South Africa',1,'CA-AUTH-ZA-002','2026-04-01','2026-12-31',
 'ERPA-DOC-002','DEL-002','VER-002',NULL,NULL,
 'Article 6.2 cooperative-approach ERPA executed with a corresponding-adjustment authorisation.','First delivery tranche scheduled within the delivery window.','Seller transferred the contracted vintage into the buyer registry account.','Buyer verified receipt; a corresponding adjustment is required on the host NDC accounting.',NULL,NULL,NULL,NULL,NULL,NULL,'Article 6 ITMO forward delivery verified; corresponding adjustment reported to the DFFE DNA.',
 'delivery_verified','2026-03-01 08:00:00','2026-03-15 09:00:00','2026-04-01 10:00:00','2026-05-18 11:00:00','2026-05-25 12:00:00',NULL,NULL,NULL,NULL,NULL,NULL,NULL,
 0,'2026-06-01 12:00:00',NULL,1,0,'demo_carbon_001'),

-- erpa_003 moderate voluntary — executed, delivery schedule pending
('erpa_003','ERPA-2026-0003',
 'carbon_registration.registered','carbon_project_registration','reg_003','W37',
 'proj_upington_pv','Upington PV Extension','verra_vcs','VM0042','pp_003','Upington Solar Trust','buyer_corp_003','Anglo Carbon Procurement',
 'voluntary','moderate',45000,NULL,NULL,165,'ZAR',7425000,2026,NULL,0,NULL,'2026-08-01','2027-07-31',
 'ERPA-DOC-003',NULL,NULL,NULL,NULL,
 'Voluntary-market ERPA executed by both parties; delivery schedule pending.',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,
 'erpa_executed','2026-05-05 08:00:00','2026-05-15 09:00:00',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,
 0,'2026-06-05 09:00:00',NULL,0,0,'demo_carbon_001'),

-- erpa_004 moderate compliance — delivery scheduled
('erpa_004','ERPA-2026-0004',
 'carbon_registration.registered','carbon_project_registration','reg_004','W37',
 'proj_kzn_biomass','KwaZulu Biomass Plant','cdm','ACM0006','pp_004','KZN Bioenergy','buyer_taxpayer_004','Sasol Carbon Tax Unit',
 'compliance','moderate',80000,NULL,NULL,150,'ZAR',12000000,2025,NULL,0,NULL,'2026-06-15','2027-05-31',
 'ERPA-DOC-004','DEL-004',NULL,NULL,NULL,
 'Compliance-market ERPA executed for carbon-tax offset supply.','First delivery tranche scheduled.',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,
 'delivery_scheduled','2026-04-01 08:00:00','2026-04-10 09:00:00','2026-05-01 10:00:00',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,
 0,'2026-06-15 10:00:00',NULL,0,0,'demo_carbon_001'),

-- erpa_005 material voluntary — delivery initiated, awaiting verification
('erpa_005','ERPA-2026-0005',
 'carbon_mrv.issuance','carbon_mrv','mrv_005','W11',
 'proj_drakensberg_hydro','Drakensberg Small Hydro','gold_standard','GS-RE-02','pp_005','Drakensberg Hydro','buyer_corp_005','Naspers Net Zero Office',
 'voluntary','material',250000,120000,NULL,140,'ZAR',35000000,2026,NULL,0,NULL,'2026-03-01','2027-02-28',
 'ERPA-DOC-005','DEL-005',NULL,NULL,NULL,
 'Material voluntary forward sale executed.','Delivery schedule agreed across four quarterly tranches.','First tranche transferred; awaiting buyer verification.',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,
 'delivery_initiated','2026-03-01 08:00:00','2026-03-15 09:00:00','2026-04-01 10:00:00','2026-05-20 11:00:00',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,
 0,'2026-06-03 11:00:00',NULL,0,0,'demo_carbon_001'),

-- erpa_006 material article6 — shortfall flagged (delivered short; not yet crossed — the CA crossing fires at verify, which this case has not reached)
('erpa_006','ERPA-2026-0006',
 'carbon_mrv.issuance','carbon_mrv','mrv_006','W11',
 'proj_jhb_landfill','Johannesburg Landfill Gas','verra_vcs','VM0001','pp_006','Joburg Gas Capture','buyer_jp_006','Tokyo JCM Partner',
 'article6','material',400000,320000,80000,200,'USD',80000000,2025,'South Africa',1,'CA-AUTH-ZA-006','2026-01-01','2026-12-31',
 'ERPA-DOC-006','DEL-006',NULL,NULL,NULL,
 'Article 6.4 mechanism ERPA executed with a corresponding-adjustment authorisation.','Delivery scheduled across the vintage year.','Seller transferred the available volume.',NULL,'Delivered volume fell eighty thousand tCO2e short of the contracted tranche; shortfall flagged for make-good.',NULL,NULL,NULL,NULL,'delivery_shortfall',NULL,
 'shortfall_flagged','2026-02-01 08:00:00','2026-02-15 09:00:00','2026-03-01 10:00:00','2026-04-01 11:00:00',NULL,'2026-05-22 12:00:00',NULL,NULL,NULL,NULL,NULL,NULL,
 0,'2026-06-12 12:00:00',NULL,0,0,'demo_carbon_001'),

-- erpa_007 major voluntary — make-good pending (one make-good cycle opened)
('erpa_007','ERPA-2026-0007',
 'carbon_mrv.issuance','carbon_mrv','mrv_007','W11',
 'proj_pofadder_csp','Pofadder Concentrated Solar','article_6_4','A6.4-RE-01','pp_007','Pofadder CSP','buyer_corp_007','Microsoft Carbon Removal',
 'voluntary','major',900000,700000,200000,260,'USD',234000000,2026,NULL,0,NULL,'2025-09-01','2026-08-31',
 'ERPA-DOC-007','DEL-007','VER-007',NULL,NULL,
 'Major voluntary forward sale executed for corporate net-zero supply.','Delivery scheduled across the vintage year.','Seller transferred the available volume.',NULL,'Delivered volume fell two hundred thousand tCO2e short of the contracted tranche.','Make-good period opened; seller to source replacement reductions of equivalent vintage.',NULL,NULL,NULL,'make_good',NULL,
 'make_good_pending','2026-01-01 08:00:00','2026-01-20 09:00:00','2026-02-10 10:00:00','2026-03-15 11:00:00',NULL,'2026-04-10 12:00:00','2026-05-10 13:00:00',NULL,NULL,NULL,NULL,NULL,
 1,'2026-08-08 13:00:00',NULL,0,0,'demo_carbon_001'),

-- erpa_008 major compliance — completed (clean happy-path terminal)
('erpa_008','ERPA-2026-0008',
 'carbon_registration.registered','carbon_project_registration','reg_008','W37',
 'proj_richards_gas','Richards Bay Gas Switch','cdm','ACM0009','pp_008','Richards Bay Energy','buyer_taxpayer_008','Eskom Carbon Tax Unit',
 'compliance','major',1500000,1500000,NULL,155,'ZAR',232500000,2025,NULL,0,NULL,'2025-12-01','2026-02-28',
 'ERPA-DOC-008','DEL-008','VER-008','SET-008',NULL,
 'Compliance ERPA executed for carbon-tax offset supply.','Delivery scheduled.','Full contracted volume transferred.','Buyer verified the full delivery.',NULL,NULL,'Settlement completed at the agreed price.',NULL,NULL,NULL,'Compliance forward sale fully delivered and settled.',
 'completed','2025-11-01 08:00:00','2025-11-20 09:00:00','2025-12-10 10:00:00','2026-01-15 11:00:00','2026-02-01 12:00:00',NULL,NULL,'2026-02-20 13:00:00','2026-03-10 14:00:00',NULL,NULL,NULL,
 0,NULL,NULL,0,0,'demo_carbon_001'),

-- erpa_009 mega voluntary — terminated (REPORTABLE: terminate crosses for major + mega)
('erpa_009','ERPA-2026-0009',
 'carbon_registration.registered','carbon_project_registration','reg_009','W37',
 'proj_limpopo_redd','Limpopo REDD Plus Programme','verra_vcs','VM0007','pp_009','Limpopo Forest Trust','buyer_corp_009','Shell Carbon Trading',
 'voluntary','mega',3000000,NULL,NULL,120,'USD',360000000,2026,NULL,0,NULL,'2026-06-01','2028-05-31',
 'ERPA-DOC-009','DEL-009',NULL,NULL,NULL,
 'Mega voluntary forward sale executed for a forest-carbon programme.','First delivery scheduled.',NULL,NULL,NULL,NULL,NULL,NULL,'Buyer terminated the ERPA after a reversal event undermined deliverable volume; high-volume termination reported.','force_majeure',NULL,
 'terminated','2025-12-01 08:00:00','2025-12-20 09:00:00','2026-01-15 10:00:00',NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2026-03-01 11:00:00',NULL,
 0,NULL,NULL,1,1,'demo_carbon_001'),

-- erpa_010 mega article6 — disputed and SLA BREACHED (REPORTABLE: breach crosses for major + mega; CA crossing also fired at verify)
('erpa_010','ERPA-2026-0010',
 'carbon_mrv.issuance','carbon_mrv','mrv_010','W11',
 'proj_kzn_bluecarbon','KwaZulu Blue Carbon Mangrove','gold_standard','GS-AFOLU-01','pp_010','Coastal Carbon Trust','buyer_ch_010','Swiss Confederation ITMO Desk',
 'article6','mega',5000000,5000000,NULL,95,'USD',475000000,2025,'South Africa',1,'CA-AUTH-ZA-010','2025-06-01','2026-05-31',
 'ERPA-DOC-010','DEL-010','VER-010',NULL,'DIS-010',
 'Article 6.2 cooperative-approach ERPA executed with a corresponding-adjustment authorisation.','Delivery scheduled across the vintage.','Full volume transferred into the buyer registry.','Buyer verified receipt; corresponding adjustment required.',NULL,NULL,NULL,'Buyer disputes the corresponding-adjustment timing against the host NDC inventory; dispute under resolution.',NULL,'ca_dispute',NULL,
 'disputed','2026-01-01 08:00:00','2026-01-20 09:00:00','2026-02-10 10:00:00','2026-03-01 11:00:00','2026-03-20 12:00:00',NULL,NULL,NULL,NULL,'2026-03-25 13:00:00',NULL,NULL,
 0,'2026-05-24 13:00:00','2026-05-24 13:30:00',1,2,'demo_carbon_001');

-- Events (transition log). Full lifecycle path for the completed showcase case
-- (erpa_008) plus key transitions for the rest. actor_party records the functional
-- party per step: the seller drafts / schedules / delivers / makes good / terminates,
-- the buyer verifies / flags a shortfall / settles / disputes, the registry resolves
-- disputes and closes out a completed ERPA. The events table event_type column is
-- plain TEXT.
INSERT OR IGNORE INTO oe_carbon_erpas_events (
  id, erpa_id, event_type, from_status, to_status, actor_id, actor_party, notes, created_at
) VALUES
('erpa_evt_001','erpa_002','carbon_erpa.executed','erpa_drafted','erpa_executed','demo_carbon_001','seller','Article 6 ERPA executed by both parties','2026-03-15 09:00:00'),
('erpa_evt_002','erpa_002','carbon_erpa.delivery_scheduled','erpa_executed','delivery_scheduled','demo_carbon_001','seller','First delivery tranche scheduled','2026-04-01 10:00:00'),
('erpa_evt_003','erpa_002','carbon_erpa.delivery_initiated','delivery_scheduled','delivery_initiated','demo_carbon_001','seller','Contracted vintage transferred into the buyer registry','2026-05-18 11:00:00'),
('erpa_evt_004','erpa_002','carbon_erpa.delivery_verified','delivery_initiated','delivery_verified','demo_carbon_001','buyer','Receipt verified; corresponding adjustment reported to the DFFE DNA','2026-05-25 12:00:00'),
('erpa_evt_005','erpa_003','carbon_erpa.executed','erpa_drafted','erpa_executed','demo_carbon_001','seller','Voluntary ERPA executed by both parties','2026-05-15 09:00:00'),
('erpa_evt_006','erpa_004','carbon_erpa.executed','erpa_drafted','erpa_executed','demo_carbon_001','seller','Compliance ERPA executed for carbon-tax offset supply','2026-04-10 09:00:00'),
('erpa_evt_007','erpa_004','carbon_erpa.delivery_scheduled','erpa_executed','delivery_scheduled','demo_carbon_001','seller','First delivery tranche scheduled','2026-05-01 10:00:00'),
('erpa_evt_008','erpa_005','carbon_erpa.executed','erpa_drafted','erpa_executed','demo_carbon_001','seller','Material voluntary forward sale executed','2026-03-15 09:00:00'),
('erpa_evt_009','erpa_005','carbon_erpa.delivery_scheduled','erpa_executed','delivery_scheduled','demo_carbon_001','seller','Delivery scheduled across four quarterly tranches','2026-04-01 10:00:00'),
('erpa_evt_010','erpa_005','carbon_erpa.delivery_initiated','delivery_scheduled','delivery_initiated','demo_carbon_001','seller','First tranche transferred; awaiting buyer verification','2026-05-20 11:00:00'),
('erpa_evt_011','erpa_006','carbon_erpa.executed','erpa_drafted','erpa_executed','demo_carbon_001','seller','Article 6.4 ERPA executed with a corresponding-adjustment authorisation','2026-02-15 09:00:00'),
('erpa_evt_012','erpa_006','carbon_erpa.delivery_scheduled','erpa_executed','delivery_scheduled','demo_carbon_001','seller','Delivery scheduled across the vintage year','2026-03-01 10:00:00'),
('erpa_evt_013','erpa_006','carbon_erpa.delivery_initiated','delivery_scheduled','delivery_initiated','demo_carbon_001','seller','Available volume transferred','2026-04-01 11:00:00'),
('erpa_evt_014','erpa_006','carbon_erpa.shortfall_flagged','delivery_initiated','shortfall_flagged','demo_carbon_001','buyer','Delivered volume fell eighty thousand tCO2e short; flagged for make-good','2026-05-22 12:00:00'),
('erpa_evt_015','erpa_007','carbon_erpa.executed','erpa_drafted','erpa_executed','demo_carbon_001','seller','Major voluntary forward sale executed','2026-01-20 09:00:00'),
('erpa_evt_016','erpa_007','carbon_erpa.delivery_scheduled','erpa_executed','delivery_scheduled','demo_carbon_001','seller','Delivery scheduled across the vintage year','2026-02-10 10:00:00'),
('erpa_evt_017','erpa_007','carbon_erpa.delivery_initiated','delivery_scheduled','delivery_initiated','demo_carbon_001','seller','Available volume transferred','2026-03-15 11:00:00'),
('erpa_evt_018','erpa_007','carbon_erpa.shortfall_flagged','delivery_initiated','shortfall_flagged','demo_carbon_001','buyer','Delivered volume fell two hundred thousand tCO2e short','2026-04-10 12:00:00'),
('erpa_evt_019','erpa_007','carbon_erpa.make_good_pending','shortfall_flagged','make_good_pending','demo_carbon_001','seller','Make-good period opened to source replacement reductions','2026-05-10 13:00:00'),
('erpa_evt_020','erpa_008','carbon_erpa.executed','erpa_drafted','erpa_executed','demo_carbon_001','seller','Compliance ERPA executed','2025-11-20 09:00:00'),
('erpa_evt_021','erpa_008','carbon_erpa.delivery_scheduled','erpa_executed','delivery_scheduled','demo_carbon_001','seller','Delivery scheduled','2025-12-10 10:00:00'),
('erpa_evt_022','erpa_008','carbon_erpa.delivery_initiated','delivery_scheduled','delivery_initiated','demo_carbon_001','seller','Full contracted volume transferred','2026-01-15 11:00:00'),
('erpa_evt_023','erpa_008','carbon_erpa.delivery_verified','delivery_initiated','delivery_verified','demo_carbon_001','buyer','Buyer verified the full delivery','2026-02-01 12:00:00'),
('erpa_evt_024','erpa_008','carbon_erpa.settled','delivery_verified','settled','demo_carbon_001','buyer','Settlement completed at the agreed price','2026-02-20 13:00:00'),
('erpa_evt_025','erpa_008','carbon_erpa.completed','settled','completed','demo_carbon_001','registry','Forward sale fully delivered and settled; ERPA closed','2026-03-10 14:00:00'),
('erpa_evt_026','erpa_009','carbon_erpa.executed','erpa_drafted','erpa_executed','demo_carbon_001','seller','Mega voluntary forward sale executed','2025-12-20 09:00:00'),
('erpa_evt_027','erpa_009','carbon_erpa.delivery_scheduled','erpa_executed','delivery_scheduled','demo_carbon_001','seller','First delivery scheduled','2026-01-15 10:00:00'),
('erpa_evt_028','erpa_009','carbon_erpa.terminated','delivery_scheduled','terminated','demo_carbon_001','seller','Terminated after a reversal event; high-volume termination reported to the DFFE DNA','2026-03-01 11:00:00'),
('erpa_evt_029','erpa_010','carbon_erpa.executed','erpa_drafted','erpa_executed','demo_carbon_001','seller','Article 6.2 ERPA executed with a corresponding-adjustment authorisation','2026-01-20 09:00:00'),
('erpa_evt_030','erpa_010','carbon_erpa.delivery_scheduled','erpa_executed','delivery_scheduled','demo_carbon_001','seller','Delivery scheduled across the vintage','2026-02-10 10:00:00'),
('erpa_evt_031','erpa_010','carbon_erpa.delivery_initiated','delivery_scheduled','delivery_initiated','demo_carbon_001','seller','Full volume transferred into the buyer registry','2026-03-01 11:00:00'),
('erpa_evt_032','erpa_010','carbon_erpa.delivery_verified','delivery_initiated','delivery_verified','demo_carbon_001','buyer','Receipt verified; corresponding adjustment reported to the DFFE DNA','2026-03-20 12:00:00'),
('erpa_evt_033','erpa_010','carbon_erpa.disputed','delivery_verified','disputed','demo_carbon_001','buyer','Buyer disputes the corresponding-adjustment timing against the host NDC inventory','2026-03-25 13:00:00'),
('erpa_evt_034','erpa_010','carbon_erpa.sla_breached','disputed','disputed','system','registry','Dispute resolution SLA breached on a mega Article 6 ERPA; escalated to the DFFE DNA','2026-05-24 13:30:00');
