-- ════════════════════════════════════════════════════════════════════════
-- 091_project_file_seed.sql
--
-- Seed every tab of the project file shell with realistic SA data for
-- two demo projects:
--   ip_001  Klerksdorp 50MW Solar PV — commercial_operations (live ops)
--   ip_004  De Aar 75MW Solar PV     — construction (build phase)
--
-- All inserts are INSERT OR IGNORE so reruns are safe. Every row keys off
-- the project_id present in 003_seed.sql / 005_ai_seed.sql.
-- ════════════════════════════════════════════════════════════════════════

------------------------------------------------------------------------
-- Plan: CP readiness (project_cp_readiness)
------------------------------------------------------------------------
INSERT OR IGNORE INTO project_cp_readiness (id, project_id, cp_name, target_date, days_until_date, status, readiness_notes) VALUES
('cp_004_01','ip_004','Land lease registered at Deeds','2026-06-10', 15, 'on_track','Surveyor-General diagrams approved, awaiting Deeds Office stamp.'),
('cp_004_02','ip_004','EPC contract executed','2026-06-20', 25, 'on_track','Lump-sum ZAR 920m, taking-over by 2027-04-30.'),
('cp_004_03','ip_004','Generation licence granted by NERSA','2026-07-05', 40, 'at_risk','Public participation closed; awaiting Energy Regulator decision.'),
('cp_004_04','ip_004','Environmental Authorisation conditions met','2026-07-15', 50, 'on_track','3 of 5 specialist studies finalised.'),
('cp_004_05','ip_004','Insurance bound (CAR + DSU)','2026-08-01', 67, 'not_ready','Broker compiling COWs; lender approval pending.'),
('cp_001_01','ip_001','Annual lender certificate','2026-06-30', 35, 'on_track','Independent engineer report signed, awaiting auditor sign-off.'),
('cp_001_02','ip_001','PPA tariff escalation review','2026-07-01', 36, 'on_track','CPI applied per clause 9.2; counterparty acknowledged.'),
('cp_001_03','ip_001','Site security audit (annual)','2026-08-15', 81, 'on_track','Scheduled with G4S, 3 days on site.');

------------------------------------------------------------------------
-- Permits: environmental_authorisations + compliance + ipp_permits
------------------------------------------------------------------------
INSERT OR IGNORE INTO environmental_authorisations (id, project_id, authorisation_type, reference_number, competent_authority, applied_date, decision_date, decision, conditions_text) VALUES
('ea_001_01','ip_001','environmental_authorisation_s24','DFFE/EA/2020/0142','DFFE','2020-04-12','2020-09-30','granted_with_conditions','Standard NEMA s.24 conditions; quarterly EMP audits.'),
('ea_001_02','ip_001','water_use_licence','DWS/WULA/NW/0089','DWS','2020-05-01','2021-01-15','granted','Domestic abstraction only; 5 kL/day.'),
('ea_001_03','ip_001','heritage_permit','SAHRA/2020/NW/0044','SAHRA','2020-03-10','2020-06-20','granted','No further studies required.'),
('ea_004_01','ip_004','environmental_authorisation_s24','DFFE/EA/2023/0078','DFFE','2023-03-01','2023-08-20','granted_with_conditions','Quarterly biodiversity monitoring; bird flight diverters on overhead lines.'),
('ea_004_02','ip_004','water_use_licence','DWS/WULA/NC/0156','DWS','2023-02-15','2023-09-10','granted','Borehole abstraction 12 kL/day; quarterly water-table monitoring.'),
('ea_004_03','ip_004','air_emission_licence','PROV/AEL/NC/0034','Provincial','2023-04-20','2023-12-01','pending','Awaiting variation re generator stack height.'),
('ea_004_04','ip_004','heritage_permit','SAHRA/2023/NC/0011','SAHRA','2023-02-08','2023-05-30','granted','Phase 2 archaeological assessment completed.');

INSERT OR IGNORE INTO environmental_compliance (id, authorisation_id, condition_reference, condition_text, due_date, compliance_status) VALUES
('ec_001_01','ea_001_01','EA-7.1','Quarterly environmental monitoring report to DFFE','2026-06-30','in_progress'),
('ec_001_02','ea_001_01','EA-7.4','Annual rehabilitation plan review','2026-09-30','pending'),
('ec_001_03','ea_001_02','WUL-3.2','Annual water meter calibration','2026-07-15','compliant'),
('ec_004_01','ea_004_01','EA-12.3','Pre-construction walkdown with EAP','2024-09-01','compliant'),
('ec_004_02','ea_004_01','EA-12.7','Monthly biodiversity monitoring report','2026-06-15','in_progress'),
('ec_004_03','ea_004_02','WUL-4.1','Quarterly groundwater quality report','2026-07-30','pending'),
('ec_004_04','ea_004_01','EA-15.2','Bird & bat mortality survey (12-monthly)','2026-11-30','pending');

INSERT OR IGNORE INTO ipp_permits (id, participant_id, project_id, permit_type, application_no, authority, applied_at, decided_at, outcome, conditions, valid_from, valid_to) VALUES
('per_001_01','demo_ipp_001','ip_001','nersa_generation_licence','GEN-2020-0142','NERSA','2020-08-15','2021-02-10','granted','50MW capped; annual return required.','2021-03-01','2046-03-01'),
('per_001_02','demo_ipp_001','ip_001','spluma_consent','SPLUMA-KK-2020-78','Local Municipality','2020-05-10','2020-09-05','granted','Land-use rezoned to industrial.','2020-09-15',NULL),
('per_004_01','demo_ipp_001','ip_004','nersa_generation_licence','GEN-2023-0091','NERSA','2023-11-20',NULL,'pending','Public participation in progress.',NULL,NULL),
('per_004_02','demo_ipp_001','ip_004','building_plan','BP-DA-2024-117','Local Municipality','2024-01-15','2024-04-22','granted','Standard structural conditions.','2024-05-01','2027-05-01'),
('per_004_03','demo_ipp_001','ip_004','occupational_health_safety','OHS-2024-DA-0033','DEL','2024-03-01','2024-06-10','granted','Construction OHS plan approved.','2024-06-15','2027-06-15');

INSERT OR IGNORE INTO insurance_policies (id, project_id, policy_number, policy_type, insurer, broker, period_start, period_end, sum_insured_zar, premium_zar, deductible_zar, lenders_noted, status) VALUES
('ins_001_01','ip_001','OAR-2026-1142','operational_all_risks','Santam','Aon SA','2026-04-01','2027-03-31',650000000,2900000,250000,1,'active'),
('ins_001_02','ip_001','BI-2026-0312','business_interruption','Santam','Aon SA','2026-04-01','2027-03-31',95000000,1450000,500000,1,'active'),
('ins_001_03','ip_001','PUB-2026-0044','public_liability','Hollard','Aon SA','2026-04-01','2027-03-31',75000000,420000,100000,1,'active'),
('ins_004_01','ip_004','CAR-2024-0567','car','Munich Re','Marsh SA','2023-09-01','2025-06-30',1100000000,8700000,1000000,1,'active'),
('ins_004_02','ip_004','DSU-2024-0089','delay_in_start_up','Munich Re','Marsh SA','2023-09-01','2025-06-30',180000000,3200000,2000000,1,'active'),
('ins_004_03','ip_004','PUB-2024-0118','public_liability','Hollard','Marsh SA','2024-01-01','2024-12-31',60000000,310000,100000,1,'active');

------------------------------------------------------------------------
-- Land & community
------------------------------------------------------------------------
INSERT OR IGNORE INTO land_parcels (id, project_id, parcel_number, ownership_type, area_hectares, registered_owner, monthly_rent_zar, status) VALUES
('lp_001_01','ip_001','Ptn 5 of Farm Klerksdorp 478','leased',120.5,'Sefako Family Trust',95000,'secured'),
('lp_001_02','ip_001','Rem Ptn of Farm Klerksdorp 479','leased',58.2,'Klerksdorp Local Municipality',45000,'secured'),
('lp_004_01','ip_004','Ptn 12 of Farm De Aar 211','leased',185.3,'De Aar Communal Property Association',125000,'secured'),
('lp_004_02','ip_004','Ptn 14 of Farm De Aar 211','leased',92.7,'De Aar Communal Property Association',62500,'secured'),
('lp_004_03','ip_004','Servitude strip Farm 211/213','servitude',8.5,'Eskom Holdings',0,'secured');

INSERT OR IGNORE INTO servitudes (id, project_id, servitude_type, parcel_number, grantor, consideration_zar, registered_at_deeds, registration_date, notes) VALUES
('sv_001_01','ip_001','powerline','Ptn 5 of Farm Klerksdorp 478','Eskom Holdings SOC',450000,1,'2021-04-15','132kV overhead corridor to substation.'),
('sv_001_02','ip_001','access_road','Ptn 5 of Farm Klerksdorp 478','Sefako Family Trust',180000,1,'2021-04-15','4km gravel access road.'),
('sv_004_01','ip_004','powerline','Ptn 12 of Farm De Aar 211','Eskom Holdings SOC',680000,0,'2024-03-20','132kV overhead corridor; awaiting Deeds registration.'),
('sv_004_02','ip_004','water_pipeline','Ptn 14 of Farm De Aar 211','De Aar Local Municipality',95000,1,'2024-05-10','Construction water supply pipeline 2.1km.'),
('sv_004_03','ip_004','fibre','Ptn 12 of Farm De Aar 211','Vodacom SA',0,1,'2024-06-01','Fibre optic for SCADA.');

INSERT OR IGNORE INTO community_stakeholders (id, project_id, stakeholder_name, stakeholder_type, contact_person, phone, email) VALUES
('cs_001_01','ip_001','Klerksdorp Local Municipality','municipality','Cllr Thandiwe Mokoena','+27 18 487 8000','tmokoena@klmun.gov.za'),
('cs_001_02','ip_001','Klerksdorp Community Trust','community_trust','Lerato Sefako','+27 82 451 9088','lerato@kctrust.org.za'),
('cs_001_03','ip_001','Bafokeng Traditional Council','traditional_authority','Kgosi Leruo Molotlegi','+27 14 566 1100','council@bafokeng.com'),
('cs_001_04','ip_001','Sefako Family Trust','landowner','Jacob Sefako','+27 82 776 4421','jsefako@gmail.com'),
('cs_004_01','ip_004','Emthanjeni Local Municipality','municipality','MM Sipho Dlamini','+27 53 632 9101','mm@emthanjeni.gov.za'),
('cs_004_02','ip_004','De Aar CPA','community_trust','Nomsa Khumalo','+27 53 631 4022','nomsa@deaarcpa.org.za'),
('cs_004_03','ip_004','NUMSA Northern Cape','union','Patrick Mahlangu','+27 53 832 1144','pmahlangu@numsa.org.za'),
('cs_004_04','ip_004','De Aar Primary School','school','Principal Mary Botha','+27 53 631 4099','principal@deaarprim.edu.za');

INSERT OR IGNORE INTO community_engagements (id, project_id, stakeholder_id, engagement_type, engagement_date, attendees_count, topic, outcome, follow_up_date) VALUES
('ce_001_01','ip_001','cs_001_01','public_meeting','2026-04-15',42,'Annual operations review','Municipality satisfied with rates payment and local procurement.','2027-04-15'),
('ce_001_02','ip_001','cs_001_02','workshop','2026-03-22',28,'2026 Skills bursary intake','15 bursaries awarded for engineering & artisan studies.','2026-09-22'),
('ce_001_03','ip_001','cs_001_04','one_on_one','2026-05-10',2,'Lease escalation review','CPI of 5.4% applied; signed addendum.','2027-05-10'),
('ce_004_01','ip_004','cs_004_01','public_meeting','2026-02-08',85,'Construction progress update','Concerns about dust raised; mitigation plan revised.','2026-08-08'),
('ce_004_02','ip_004','cs_004_03','one_on_one','2026-04-22',6,'Labour ratios for local hire','Agreed 65% local hire commitment; reviewing weekly.','2026-07-22'),
('ce_004_03','ip_004','cs_004_02','workshop','2026-05-03',52,'Land lease income transparency','CPA presented Q1 financials to community.','2026-08-03'),
('ce_004_04','ip_004','cs_004_04','site_visit','2026-04-30',38,'Career awareness for matric learners','38 learners toured construction site.','2026-10-30');

INSERT OR IGNORE INTO ed_sed_spend (id, project_id, category, period, amount_zar, beneficiary, description, reipppp_bid_window) VALUES
('ed_001_01','ip_001','skills_development','Q1-2026',420000,'Klerksdorp Community Trust','15 engineering bursaries','BW4'),
('ed_001_02','ip_001','enterprise_development','Q1-2026',180000,'Local SMEs','Vegetation management contracts','BW4'),
('ed_001_03','ip_001','socio_economic_development','Q1-2026',290000,'Klerksdorp Primary','Computer lab upgrade','BW4'),
('ed_001_04','ip_001','supplier_development','Q1-2026',520000,'Black-owned suppliers','Spares + consumables','BW4'),
('ed_004_01','ip_004','skills_development','Q1-2026',680000,'NUMSA Training Academy','30 artisan apprenticeships','BW5'),
('ed_004_02','ip_004','enterprise_development','Q1-2026',1200000,'Local construction SMEs','Earthworks & fencing subcontracts','BW5'),
('ed_004_03','ip_004','socio_economic_development','Q1-2026',450000,'De Aar Primary School','Library + computer lab','BW5'),
('ed_004_04','ip_004','localisation','Q1-2026',8500000,'Local content','Steel mounting structures (60% local)','BW5'),
('ed_004_05','ip_004','jobs_created','Q1-2026',0,'Construction','185 jobs created (140 local)','BW5');

------------------------------------------------------------------------
-- Funding
------------------------------------------------------------------------
INSERT OR IGNORE INTO ipp_financial_models (id, participant_id, project_id, model_version, capacity_mw, capex_zar, opex_zar_yr, ppa_tariff_zar_mwh, tariff_escalation_pct, operating_life_yrs, debt_ratio_pct, debt_tenor_yrs) VALUES
('fm_001_01','demo_ipp_001','ip_001','v1.0',50,720000000,18500000,285,2.5,25,70,15),
('fm_001_02','demo_ipp_001','ip_001','v2.0_refi',50,720000000,17800000,310,2.5,25,65,12),
('fm_004_01','demo_ipp_001','ip_004','v1.0',75,1090000000,22000000,275,2.0,25,72,15),
('fm_004_02','demo_ipp_001','ip_004','v1.1',75,1090000000,22000000,278,2.0,25,72,15),
('fm_004_03','demo_ipp_001','ip_004','v2.0_BC',75,1110000000,23200000,278,2.0,25,70,15);

INSERT OR IGNORE INTO ipp_info_memorandums (id, participant_id, project_id, im_version, im_title, executive_summary, capacity_mw, capex_zar, funding_requested_zar) VALUES
('im_001_01','demo_ipp_001','ip_001','v1.0','Klerksdorp 50MW IM','50MW solar PV, COD 2022. Long-term municipal PPA + REC sales.',50,720000000,504000000),
('im_004_01','demo_ipp_001','ip_004','v1.0','De Aar 75MW IM','75MW solar PV, construction phase. 20-yr PPA + REC sales upside.',75,1090000000,785000000),
('im_004_02','demo_ipp_001','ip_004','v1.1','De Aar 75MW IM (FC revision)','Refined post-Independent Engineer review; LCOE 9.2% lower than IM v1.0.',75,1090000000,785000000);

INSERT OR IGNORE INTO ipp_drawdown_requests (id, participant_id, project_id, drawdown_no, requested_amount_zar, purpose, requested_at, approved_amount_zar, approved_at, disbursed_amount_zar, disbursed_at, status) VALUES
('dd_004_01','demo_ipp_001','ip_004',1,120000000,'soft_costs & mobilisation','2023-09-15',120000000,'2023-09-25',120000000,'2023-09-28','disbursed'),
('dd_004_02','demo_ipp_001','ip_004',2,180000000,'epc_milestone_1 — earthworks 25%','2023-12-10',180000000,'2023-12-18',180000000,'2023-12-20','disbursed'),
('dd_004_03','demo_ipp_001','ip_004',3,80000000,'epc_milestone_2 — mounting 40%','2024-03-12',80000000,'2024-03-19',80000000,'2024-03-22','disbursed'),
('dd_004_04','demo_ipp_001','ip_004',4,165000000,'epc_milestone_3 — modules 60%','2026-04-22',165000000,'2026-05-01',NULL,NULL,'approved'),
('dd_004_05','demo_ipp_001','ip_004',5,140000000,'epc_milestone_4 — inverters & connection 75%','2026-05-20',NULL,NULL,NULL,NULL,'reviewing'),
('dd_001_01','demo_ipp_001','ip_001',6,18500000,'Major maintenance reserve top-up','2026-04-10',18500000,'2026-04-18',18500000,'2026-04-22','disbursed');

INSERT OR IGNORE INTO covenants (id, project_id, lender_participant_id, covenant_code, covenant_name, covenant_type, operator, threshold, measurement_frequency, first_test_date, status) VALUES
('cov_001_01','ip_001','demo_lender_001','DSCR_12M','12-month forward DSCR','financial','gte',1.15,'quarterly','2022-09-30','active'),
('cov_001_02','ip_001','demo_lender_001','AVAILABILITY_95','Plant availability ≥ 95%','operational','gte',95,'quarterly','2022-09-30','active'),
('cov_001_03','ip_001','demo_lender_001','INSURANCE','All required insurances in place','insurance','eq',1,'annual','2022-09-30','active'),
('cov_001_04','ip_001','demo_lender_001','REPORT_QTRLY','Quarterly operating reports to lender','reporting','eq',1,'quarterly','2022-09-30','active'),
('cov_004_01','ip_004','demo_lender_001','PROGRESS_S_CURVE','EPC progress ≥ planned − 5%','operational','gte',-5,'monthly','2023-10-31','active'),
('cov_004_02','ip_004','demo_lender_001','EPC_COST_VAR','EPC cost variance ≤ +3%','financial','lte',3,'monthly','2023-10-31','active'),
('cov_004_03','ip_004','demo_lender_001','SAFETY_LTIFR','LTIFR ≤ 0.5','operational','lte',0.5,'monthly','2023-10-31','active'),
('cov_004_04','ip_004','demo_lender_001','DEBT_RATIO','Debt ratio ≤ 72%','financial','lte',72,'quarterly','2024-03-31','active');

INSERT OR IGNORE INTO covenant_tests (id, covenant_id, test_period, test_date, measured_value, result) VALUES
('ct_001_01','cov_001_01','Q4-2025','2026-01-15',1.32,'pass'),
('ct_001_02','cov_001_01','Q1-2026','2026-04-15',1.28,'pass'),
('ct_001_03','cov_001_02','Q4-2025','2026-01-15',96.8,'pass'),
('ct_001_04','cov_001_02','Q1-2026','2026-04-15',94.2,'warn'),
('ct_001_05','cov_001_04','Q1-2026','2026-04-15',1,'pass'),
('ct_004_01','cov_004_01','2026-03','2026-04-05',-3.2,'pass'),
('ct_004_02','cov_004_01','2026-04','2026-05-05',-2.8,'pass'),
('ct_004_03','cov_004_02','2026-04','2026-05-05',1.4,'pass'),
('ct_004_04','cov_004_03','2026-04','2026-05-05',0.32,'pass');

INSERT OR IGNORE INTO reserve_accounts (id, project_id, reserve_type, target_amount_zar, target_basis, current_balance_zar, custodian, status) VALUES
('ra_001_01','ip_001','dsra',32000000,'next_6m_debt_service',32000000,'Standard Bank','active'),
('ra_001_02','ip_001','mra',8500000,'next_12m_om',9100000,'Standard Bank','active'),
('ra_001_03','ip_001','om_reserve',4200000,'fixed',4200000,'Standard Bank','active'),
('ra_004_01','ip_004','dsra',48000000,'next_6m_debt_service',0,'Nedbank','active'),
('ra_004_02','ip_004','mra',12500000,'next_12m_om',0,'Nedbank','active');

------------------------------------------------------------------------
-- Contracts: EPC variations & liquidated damages
-- (epc_contracts already seeded for ip_001 & ip_004 in earlier migrations
--  via epc_contracts/epc-*.sql — we just need variations/LDs)
------------------------------------------------------------------------
INSERT OR IGNORE INTO epc_contracts (id, project_id, contractor_name, lump_sum_zar, target_completion_date, status) VALUES
('epc_001','ip_001','Yingli Africa EPC',640000000,'2022-04-15','defects_period'),
('epc_004','ip_004','juwi Renewable Energies SA',920000000,'2026-10-31','construction');

INSERT OR IGNORE INTO epc_variations (id, epc_contract_id, variation_number, description, value_zar, time_impact_days, status, raised_at) VALUES
('var_004_01','epc_004','VO-001','Additional bird flight diverters per EA conditions',1800000,0,'approved','2024-01-20'),
('var_004_02','epc_004','VO-002','Substation civils upgrade for 132kV connection',4200000,14,'approved','2024-04-15'),
('var_004_03','epc_004','VO-003','Module cleaning equipment (post-FAT change)',-650000,0,'approved','2024-08-22'),
('var_004_04','epc_004','VO-004','Additional security perimeter fencing',2100000,7,'proposed','2026-05-10'),
('var_001_01','epc_001','VO-DLP-01','Module replacement (defects period)',850000,0,'approved','2025-11-15');

INSERT OR IGNORE INTO epc_liquidated_damages (id, epc_contract_id, event_type, event_date, description, calculated_amount_zar, capped_amount_zar, status) VALUES
('ld_004_01','epc_004','delay','2024-05-20','Module shipment delay 18 days (force majeure cured)',0,0,'waived'),
('ld_004_02','epc_004','performance','2024-09-15','SAT 1 partial failure on String 3',1200000,1200000,'paid'),
('ld_001_01','epc_001','availability','2025-03-01','Availability 92.3% vs 95% target month 1',850000,850000,'paid');

------------------------------------------------------------------------
-- LOIs
------------------------------------------------------------------------
INSERT OR IGNORE INTO loi_drafts (id, from_participant_id, to_participant_id, project_id, mix_json, body_md, status, horizon_years, annual_mwh, blended_price, sent_at, resulting_contract_document_id) VALUES
('loi_001_01','demo_offtaker_001','demo_ipp_001','ip_001','{"solar":100}','LOI for 50MW Klerksdorp solar offtake.','signed',20,45000,285,'2020-06-10','doc_001'),
('loi_001_02','demo_offtaker_002','demo_ipp_001','ip_001','{"solar":100}','LOI for residual capacity sale.','withdrawn',10,5000,290,'2025-08-12',NULL),
('loi_004_01','demo_offtaker_001','demo_ipp_001','ip_004','{"solar":100}','LOI for 75MW De Aar solar.','sent',20,140000,275,'2026-04-22',NULL),
('loi_004_02','demo_offtaker_003','demo_ipp_001','ip_004','{"solar":100}','LOI corporate PPA (Anglo American carve-out).','drafted',15,35000,320,NULL,NULL);

------------------------------------------------------------------------
-- Carbon: carbon_projects + credit_vintages + mrv_submissions + recs
-- The aggregator joins on cp.source_project_id = ? OR cp.id = ?.
-- Newer deploys may not have the source_project_id column yet —
-- backfill it via UPDATE keyed off the carbon_projects id, which the
-- aggregator OR-clause already supports.
------------------------------------------------------------------------
-- Key carbon_projects.id directly to the ipp project id so the
-- aggregator's `cp.id = ?` branch lights up vintages on the project file.
INSERT OR IGNORE INTO carbon_projects (id, project_name, project_number, project_type, methodology, host_country, developer_id, credits_issued, credits_available, credits_retired, status, registration_date, verification_date) VALUES
('ip_001','Klerksdorp 50MW Solar — GHG project','VCS-ZA-IP001-KLR','Renewable Energy','VM0007 v1.6','South Africa','demo_ipp_001',82500,42000,40500,'verified','2022-08-15','2025-11-20'),
('ip_004','De Aar 75MW Solar — GHG project','VCS-ZA-IP004-DA','Renewable Energy','VM0007 v1.6','South Africa','demo_ipp_001',0,0,0,'pending','2024-02-10',NULL);

INSERT OR IGNORE INTO credit_vintages (id, project_id, registry_id, vintage_year, serial_prefix, serial_start, serial_end, credits_issued, credits_retired, methodology, issuance_date, sa_carbon_tax_eligible) VALUES
('cv_001_22','ip_001','creg_verra',2022,'VCS-ZA-001-22',1,18000,18000,18000,'VM0007 v1.6','2023-03-15',1),
('cv_001_23','ip_001','creg_verra',2023,'VCS-ZA-001-23',1,22000,22000,12500,'VM0007 v1.6','2024-04-22',1),
('cv_001_24','ip_001','creg_verra',2024,'VCS-ZA-001-24',1,21000,21000,8000,'VM0007 v1.6','2025-05-10',1),
('cv_001_25','ip_001','creg_verra',2025,'VCS-ZA-001-25',1,21500,21500,2000,'VM0007 v1.6','2026-04-15',1);

INSERT OR IGNORE INTO mrv_submissions (id, project_id, reporting_period_start, reporting_period_end, claimed_reductions_tco2e, monitoring_methodology) VALUES
('mrv_001_22','ip_001','2022-06-01','2022-12-31',18000,'VM0007 monitoring plan v1.6'),
('mrv_001_23','ip_001','2023-01-01','2023-12-31',22000,'VM0007 monitoring plan v1.6'),
('mrv_001_24','ip_001','2024-01-01','2024-12-31',21000,'VM0007 monitoring plan v1.6'),
('mrv_001_25','ip_001','2025-01-01','2025-12-31',21500,'VM0007 monitoring plan v1.6');

INSERT OR IGNORE INTO rec_certificates (id, certificate_serial, generator_participant_id, project_id, generation_period_start, generation_period_end, mwh_represented, technology, registry, issuance_date, status, owner_participant_id) VALUES
('rc_001_24','IREC-ZA-KLR-2024-01','demo_ipp_001','ip_001','2024-01-01','2024-12-31',92000,'solar_pv','I-REC','2025-02-15','issued','demo_offtaker_001'),
('rc_001_25','IREC-ZA-KLR-2025-01','demo_ipp_001','ip_001','2025-01-01','2025-12-31',93500,'solar_pv','I-REC','2026-02-20','issued','demo_offtaker_001'),
('rc_001_25_2','IREC-ZA-KLR-2025-02','demo_ipp_001','ip_001','2025-01-01','2025-06-30',47200,'solar_pv','I-REC','2025-07-30','retired','demo_offtaker_001');

------------------------------------------------------------------------
-- Operations (ip_001): commissioning tests, nominations, work orders, spares
------------------------------------------------------------------------
INSERT OR IGNORE INTO ipp_commissioning_tests (id, participant_id, project_id, test_phase, test_name, test_code, scheduled_at, executed_at, pass_fail, measured_value, target_value, unit, status) VALUES
('ct_001_001','demo_ipp_001','ip_001','cold','Cold commissioning string 1','CT-001','2022-04-20','2022-04-22','pass',NULL,NULL,NULL,'complete'),
('ct_001_002','demo_ipp_001','ip_001','hot','Hot commissioning inverter 1','HT-001','2022-05-05','2022-05-07','pass',NULL,NULL,NULL,'complete'),
('ct_001_003','demo_ipp_001','ip_001','perf','Performance ratio test','PT-001','2022-05-18','2022-05-22','pass',83.2,82.0,'%','complete'),
('ct_001_004','demo_ipp_001','ip_001','grid_compliance','LVRT compliance','GC-001','2022-05-25','2022-05-26','pass',NULL,NULL,NULL,'complete'),
('ct_001_005','demo_ipp_001','ip_001','final_acceptance','Final acceptance','FA-001','2022-05-30','2022-06-01','pass',NULL,NULL,NULL,'complete');

INSERT OR IGNORE INTO ipp_commissioning_tests (id, participant_id, project_id, test_phase, test_name, test_code, scheduled_at, executed_at, pass_fail, measured_value, target_value, unit, status) VALUES
('ct_004_001','demo_ipp_001','ip_004','cold','Cold commissioning Block A','CT-A01','2026-09-15',NULL,NULL,NULL,NULL,NULL,'scheduled'),
('ct_004_002','demo_ipp_001','ip_004','cold','Cold commissioning Block B','CT-B01','2026-09-20',NULL,NULL,NULL,NULL,NULL,'scheduled'),
('ct_004_003','demo_ipp_001','ip_004','hot','Hot commissioning inverters 1-8','HT-001','2026-10-01',NULL,NULL,NULL,NULL,NULL,'scheduled'),
('ct_004_004','demo_ipp_001','ip_004','perf','Performance ratio test','PT-001','2026-10-15',NULL,NULL,NULL,NULL,NULL,'scheduled');

INSERT OR IGNORE INTO ipp_nominations (id, participant_id, project_id, delivery_date, nomination_type, hourly_mwh_json, total_mwh, scheduled_at, curtailed_mwh) VALUES
('nom_001_01','demo_ipp_001','ip_001','2026-05-25','day_ahead','[0,0,0,0,0,0,2.1,5.4,18.2,32.1,42.5,46.8,48.2,47.8,45.2,38.5,28.4,15.2,6.8,1.4,0,0,0,0]',378.6,'2026-05-24',12.4),
('nom_001_02','demo_ipp_001','ip_001','2026-05-24','day_ahead','[0,0,0,0,0,0,2.0,5.2,17.8,31.5,41.8,46.2,47.8,47.5,44.8,38.0,27.8,14.8,6.5,1.3,0,0,0,0]',373.0,'2026-05-23',8.2),
('nom_001_03','demo_ipp_001','ip_001','2026-05-23','day_ahead','[0,0,0,0,0,0,2.0,5.0,17.0,30.5,41.0,45.5,47.2,47.0,44.0,37.2,27.0,14.0,6.2,1.2,0,0,0,0]',365.0,'2026-05-22',0);

INSERT OR IGNORE INTO ipp_work_orders (id, participant_id, project_id, wo_number, wo_type, asset_descr, priority, scheduled_start, actual_start, downtime_hours, energy_loss_mwh, labour_hours, total_cost_zar, status) VALUES
('wo_001_01','demo_ipp_001','ip_001','WO-2026-0142','preventive','Inverter station 1','medium','2026-05-15','2026-05-15',0,0,16,18500,'complete'),
('wo_001_02','demo_ipp_001','ip_001','WO-2026-0143','corrective','String 18 — combiner box','high','2026-05-18','2026-05-18',4.2,1.8,8,22400,'complete'),
('wo_001_03','demo_ipp_001','ip_001','WO-2026-0144','preventive','Module cleaning blocks 1-4','low','2026-05-20','2026-05-20',0,0,32,45000,'complete'),
('wo_001_04','demo_ipp_001','ip_001','WO-2026-0145','inspection','SCADA cabinet','medium','2026-05-28',NULL,NULL,NULL,NULL,NULL,'open'),
('wo_004_01','demo_ipp_001','ip_004','WO-2026-CON-018','retrofit','Mounting structure row 24-32','high','2026-05-20','2026-05-20',NULL,NULL,180,420000,'in_progress'),
('wo_004_02','demo_ipp_001','ip_004','WO-2026-CON-019','retrofit','DC cabling block A','high','2026-05-22','2026-05-22',NULL,NULL,220,380000,'in_progress');

INSERT OR IGNORE INTO ipp_spares_inventory (id, participant_id, project_id, part_number, description, manufacturer, category, location, unit_of_measure, on_hand_qty, reorder_point, unit_cost_zar) VALUES
('sp_001_01','demo_ipp_001','ip_001','HW-INV-100K','Inverter 100kW spare','Huawei','inverter','Klerksdorp warehouse','each',2,1,285000),
('sp_001_02','demo_ipp_001','ip_001','HW-OPT-100','Optimizer module','Huawei','inverter','Klerksdorp warehouse','each',45,15,1450),
('sp_001_03','demo_ipp_001','ip_001','MOD-CSI-545','PV module 545W','Canadian Solar','module','Klerksdorp warehouse','each',180,50,3850),
('sp_001_04','demo_ipp_001','ip_001','CT-PVDC','PV DC cable 6mm² (per metre)','Lapp Group','consumable','Klerksdorp warehouse','meter',2400,500,42),
('sp_001_05','demo_ipp_001','ip_001','MC4-TPM','MC4 connector pair','Stäubli','consumable','Klerksdorp warehouse','each',1200,200,38),
('sp_004_01','demo_ipp_001','ip_004','SMA-INV-110','SMA Sunny Highpower 110kW','SMA Solar','inverter','De Aar site stores','each',6,2,310000),
('sp_004_02','demo_ipp_001','ip_004','MOD-LR-560','PV module 560W bifacial','LONGi','module','De Aar site stores','each',420,100,4200);

------------------------------------------------------------------------
-- O&M: Esums-linked operating data for ip_001
-- (om_sites/devices/faults/work_orders)
------------------------------------------------------------------------
INSERT OR IGNORE INTO om_sites (id, name, participant_id, project_id, technology, capacity_mw, capacity_kwp, province, latitude, longitude, commissioning_date, ppa_id, ppa_tariff_zar_mwh) VALUES
('om_klr_001','Klerksdorp 50MW Solar','demo_ipp_001','ip_001','solar',50,55000,'North West',-26.864,26.665,'2022-06-01','doc_001',285);

INSERT OR IGNORE INTO om_devices (id, site_id, device_type, manufacturer, model, serial_number, installed_at, warranty_expiry, rated_kw, status) VALUES
('omd_klr_inv_01','om_klr_001','inverter','Huawei','SUN2000-100KTL-M1','HW-100K-001','2022-04-15','2032-04-15',100,'online'),
('omd_klr_inv_02','om_klr_001','inverter','Huawei','SUN2000-100KTL-M1','HW-100K-002','2022-04-15','2032-04-15',100,'online'),
('omd_klr_inv_03','om_klr_001','inverter','Huawei','SUN2000-100KTL-M1','HW-100K-003','2022-04-15','2032-04-15',100,'warning'),
('omd_klr_inv_04','om_klr_001','inverter','Huawei','SUN2000-100KTL-M1','HW-100K-004','2022-04-15','2032-04-15',100,'online'),
('omd_klr_met_01','om_klr_001','meter','Schneider','iEM3275','SE-3275-001','2022-04-20','2032-04-20',NULL,'online'),
('omd_klr_wx_01','om_klr_001','weather','Lufft','WS600-UMB','LU-WS-001','2022-04-22','2027-04-22',NULL,'online');

INSERT OR IGNORE INTO om_faults (id, site_id, device_id, category, severity, fault_code, description, detected_at, resolved_at, status) VALUES
('omf_001_01','om_klr_001','omd_klr_inv_03','inverter','major','E-101','Inverter 3 phase imbalance detected','2026-05-23 09:42','','open'),
('omf_001_02','om_klr_001','omd_klr_inv_01','string','minor','E-205','String 12 underperformance (-4.2%)','2026-05-22 14:18','','in_progress'),
('omf_001_03','om_klr_001','omd_klr_inv_02','inverter','info','E-001','Daily self-test completed','2026-05-24 06:00','2026-05-24 06:05','closed'),
('omf_001_04','om_klr_001',NULL,'weather','minor','W-401','Soiling detected — PR -2.8%','2026-05-22 10:30','','open'),
('omf_001_05','om_klr_001','omd_klr_inv_04','inverter','minor','E-220','Temperature derating active','2026-05-21 13:45','2026-05-21 16:20','resolved');

INSERT OR IGNORE INTO om_work_orders (id, wo_number, site_id, fault_id, category, priority, status, title, description, sla_response_minutes, sla_deadline) VALUES
('omwo_001_01','WO-OM-2026-0421','om_klr_001','omf_001_01','corrective','high','assigned','Inverter 3 phase imbalance repair','Tech dispatched; expected on-site 14:00.',240,'2026-05-23 13:42'),
('omwo_001_02','WO-OM-2026-0422','om_klr_001','omf_001_02','corrective','medium','en_route','String 12 IV curve test','Technician en route with curve tracer.',480,'2026-05-23 22:18'),
('omwo_001_03','WO-OM-2026-0423','om_klr_001','omf_001_04','cleaning','medium','created','Module cleaning blocks 5-8','Soiling -2.8% triggered cleaning cycle.',1440,'2026-05-23 10:30');
