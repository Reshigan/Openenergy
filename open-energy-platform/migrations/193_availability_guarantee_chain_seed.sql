-- Wave 51 — Esums O&M Availability Guarantee & Liquidated Damages seed.
-- 10 availability-guarantee periods avg_001..avg_010 spanning 10 distinct
-- lifecycle states, all five shortfall-severity tiers, and the shortfall / LD /
-- cure / dispute branches. Owners are project SPVs; contractors are O&M
-- providers; Esums operators record both parties' actions.

INSERT OR IGNORE INTO oe_availability_guarantees (
  id, case_number, source_event, source_entity_type, source_entity_id, source_wave,
  owner_party_id, owner_party_name, contractor_party_id, contractor_party_name,
  site_id, site_name, site_province, technology, capacity_mw, contract_ref,
  reporting_period, period_start, period_end,
  guaranteed_availability_pct, bonus_threshold_pct, measured_availability_pct, excused_downtime_hours, adjusted_availability_pct, shortfall_pp,
  shortfall_tier, ld_rate_zar_per_pp, ld_cap_zar, ld_assessed_zar, bonus_zar, settlement_zar,
  measurement_basis, shortfall_basis, ld_basis, reason_code, dispute_round,
  chain_status, period_open_at, measurement_submitted_at, adjustment_review_at, reconciled_at, meets_guarantee_at, shortfall_flagged_at, ld_assessed_at, cure_period_at, settled_at, disputed_at,
  is_reportable, sla_deadline_at, escalation_level, created_by
) VALUES
-- avg_001 solar / minor — period freshly opened, awaiting metered availability
('avg_001','OM-AVL-2026-0001','metering.monthly_rollup','om_period','omp_2026_0401','W12',
 'own_kathu','Kathu Solar Park (Pty) Ltd','om_juwi','juwi Renewable Energies O&M',
 'site_kathu','Kathu Solar Park','Northern Cape','solar_pv',100,'OMSA-2024-KSP-01',
 '2026-04','2026-04-01','2026-04-30',
 98.0,99.5,NULL,NULL,NULL,NULL,
 'minor_shortfall',200000,8000000,NULL,NULL,NULL,
 'April reporting period opened; awaiting metered availability submission from the O&M contractor.',NULL,NULL,NULL,0,
 'period_open','2026-05-02 08:00:00',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,
 0,'2026-06-30 00:00:00',0,'demo_ipp_001'),

-- avg_002 wind / moderate — measurement submitted, review SLA BREACHED
('avg_002','OM-AVL-2026-0002','metering.monthly_rollup','om_period','omp_2026_0402',NULL,
 'own_jbay','Jeffreys Bay Wind Farm (Pty) Ltd','om_vestas','Vestas Southern Africa O&M',
 'site_jbay','Jeffreys Bay Wind Farm','Eastern Cape','wind',138,'OMSA-2023-JBW-04',
 '2026-04','2026-04-01','2026-04-30',
 97.0,99.0,95.2,8,NULL,NULL,
 'moderate_shortfall',180000,7000000,NULL,NULL,NULL,
 'Metered turbine availability 95.2 percent submitted; eight hours of excused grid-curtailment downtime claimed; adjustment review not opened within the window.',NULL,NULL,NULL,0,
 'measurement_submitted','2026-05-04 09:00:00','2026-05-05 10:00:00',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,
 0,'2026-05-08 10:00:00',1,'demo_ipp_001'),

-- avg_003 solar / material — excused-downtime adjustment under review
('avg_003','OM-AVL-2026-0003','metering.monthly_rollup','om_period','omp_2026_0403',NULL,
 'own_deaar','De Aar Solar Power (Pty) Ltd','om_scatec','Scatec Solar O&M',
 'site_deaar','De Aar Solar Power','Northern Cape','solar_pv',175,'OMSA-2023-DAS-02',
 '2026-04','2026-04-01','2026-04-30',
 98.0,99.5,94.1,30,NULL,NULL,
 'material_shortfall',220000,9000000,NULL,NULL,NULL,
 'Metered availability 94.1 percent; contractor claims thirty hours of excused downtime for a Eskom feeder outage; owner reviewing the excused-downtime evidence.',NULL,NULL,NULL,0,
 'adjustment_review','2026-05-03 11:00:00','2026-05-04 12:00:00','2026-05-06 09:30:00',NULL,NULL,NULL,NULL,NULL,NULL,NULL,
 0,'2026-06-30 00:00:00',0,'demo_ipp_001'),

-- avg_004 wind / minor — reconciled, awaiting meets-guarantee or shortfall call
('avg_004','OM-AVL-2026-0004','metering.monthly_rollup','om_period','omp_2026_0404',NULL,
 'own_loeries','Loeriesfontein Wind Farm (Pty) Ltd','om_siemens','Siemens Gamesa O&M',
 'site_loeries','Loeriesfontein Wind Farm','Northern Cape','wind',140,'OMSA-2024-LWF-03',
 '2026-04','2026-04-01','2026-04-30',
 97.5,99.0,97.3,5,98.1,-0.6,
 'minor_shortfall',180000,7000000,NULL,NULL,NULL,
 'Metered 97.3 percent; five hours excused for a planned grid outage lift adjusted availability to 98.1 percent; reconciled and ready for the guarantee call.','Adjusted availability 98.1 percent exceeds the 97.5 percent guarantee by 0.6 pp.',NULL,NULL,0,
 'reconciled','2026-05-02 10:00:00','2026-05-03 09:00:00','2026-05-04 10:00:00','2026-05-06 14:00:00',NULL,NULL,NULL,NULL,NULL,NULL,
 0,'2026-06-30 00:00:00',0,'demo_ipp_001'),

-- avg_005 bess / minor — meets guarantee, awaiting settlement
('avg_005','OM-AVL-2026-0005','metering.monthly_rollup','om_period','omp_2026_0405',NULL,
 'own_tumelo','Tumelo Storage (Pty) Ltd','om_huawei','Huawei FusionSolar O&M',
 'site_tumelo','Tumelo BESS','Free State','bess',80,'OMSA-2025-TBS-01',
 '2026-04','2026-04-01','2026-04-30',
 99.0,99.5,99.3,2,99.4,-0.4,
 'minor_shortfall',250000,6000000,NULL,NULL,NULL,
 'Battery availability 99.3 percent metered; two hours excused for an auxiliary transformer fault lifted adjusted availability to 99.4 percent.','Adjusted 99.4 percent clears the 99.0 percent guarantee but is below the 99.5 percent bonus threshold; no bonus due.',NULL,NULL,0,
 'meets_guarantee','2026-05-02 08:30:00','2026-05-03 09:00:00','2026-05-04 10:00:00','2026-05-05 11:00:00','2026-05-07 09:00:00',NULL,NULL,NULL,NULL,NULL,
 0,'2026-06-30 00:00:00',0,'demo_ipp_001'),

-- avg_006 wind / severe — shortfall flagged (reportable), assess-LD SLA BREACHED
('avg_006','OM-AVL-2026-0006','metering.monthly_rollup','om_period','omp_2026_0406','W24',
 'own_sere','Sere Wind Farm (Pty) Ltd','om_vestas','Vestas Southern Africa O&M',
 'site_sere','Sere Wind Farm','Western Cape','wind',100,'OMSA-2022-SWF-05',
 '2026-04','2026-04-01','2026-04-30',
 95.0,98.0,88.0,20,89.2,5.8,
 'severe_shortfall',250000,8000000,NULL,NULL,NULL,
 'Gearbox failures on six turbines drove metered availability to 88.0 percent; twenty hours of excused grid downtime lift adjusted availability to only 89.2 percent.','Adjusted 89.2 percent is 5.8 pp below the 95.0 percent guarantee — severe shortfall, security-of-supply reportable.',NULL,'sustained_underperformance',0,
 'shortfall_flagged','2026-05-02 09:00:00','2026-05-03 10:00:00','2026-05-04 11:00:00','2026-05-05 12:00:00',NULL,'2026-05-06 13:00:00',NULL,NULL,NULL,NULL,
 1,'2026-05-09 13:00:00',1,'demo_ipp_001'),

-- avg_007 solar / material — liquidated damages assessed, awaiting settle/cure/dispute
('avg_007','OM-AVL-2026-0007','metering.monthly_rollup','om_period','omp_2026_0407',NULL,
 'own_touws','Touwsrivier CPV (Pty) Ltd','om_soitec','Soitec CPV O&M',
 'site_touws','Touwsrivier CPV','Western Cape','solar_pv',44,'OMSA-2023-TCP-02',
 '2026-04','2026-04-01','2026-04-30',
 98.0,99.5,94.0,6,94.5,3.5,
 'material_shortfall',200000,9000000,700000,NULL,NULL,
 'Tracker controller faults reduced metered availability to 94.0 percent; six hours excused lift adjusted availability to 94.5 percent.','Adjusted 94.5 percent is 3.5 pp below the 98.0 percent guarantee — material shortfall.','Liquidated damages assessed at R200000 per pp times 3.5 pp equals R700000, within the R9m cap.','tracker_controller_faults',0,
 'ld_assessed','2026-05-02 09:00:00','2026-05-03 10:00:00','2026-05-04 11:00:00','2026-05-05 12:00:00',NULL,'2026-05-06 13:00:00','2026-05-08 10:00:00',NULL,NULL,NULL,
 0,'2026-06-30 00:00:00',0,'demo_ipp_001'),

-- avg_008 solar / minor — fully settled, bonus earned (happy path)
('avg_008','OM-AVL-2026-0008','metering.monthly_rollup','om_period','omp_2026_0308',NULL,
 'own_pulida','Pulida Solar Park (Pty) Ltd','om_juwi','juwi Renewable Energies O&M',
 'site_pulida','Pulida Solar Park','Free State','solar_pv',75,'OMSA-2024-PSP-01',
 '2026-03','2026-03-01','2026-03-31',
 98.0,99.0,99.0,4,99.2,-1.2,
 'minor_shortfall',200000,8000000,NULL,150000,150000,
 'March availability 99.0 percent metered; four hours excused for a substation maintenance window lift adjusted availability to 99.2 percent.','Adjusted 99.2 percent clears both the 98.0 percent guarantee and the 99.0 percent bonus threshold.','Availability bonus of R150000 earned for exceeding the 99.0 percent bonus threshold; settled in full.','bonus_earned',0,
 'settled','2026-04-02 08:00:00','2026-04-03 09:00:00','2026-04-04 10:00:00','2026-04-05 11:00:00','2026-04-06 09:00:00',NULL,NULL,NULL,'2026-04-09 11:00:00',NULL,
 0,NULL,0,'demo_ipp_001'),

-- avg_009 wind / severe — cure plan agreed after LD assessment (reportable)
('avg_009','OM-AVL-2026-0009','metering.monthly_rollup','om_period','omp_2026_0409',NULL,
 'own_cookhouse','Cookhouse Wind Farm (Pty) Ltd','om_nordex','Nordex Acciona O&M',
 'site_cookhouse','Cookhouse Wind Farm','Eastern Cape','wind',139,'OMSA-2022-CWF-06',
 '2026-04','2026-04-01','2026-04-30',
 96.0,98.5,89.5,15,90.3,5.7,
 'severe_shortfall',300000,9000000,1710000,NULL,NULL,
 'Blade-bearing campaign on nine turbines reduced metered availability to 89.5 percent; fifteen hours excused lift adjusted availability to 90.3 percent.','Adjusted 90.3 percent is 5.7 pp below the 96.0 percent guarantee — severe shortfall, reportable.','Liquidated damages assessed at R300000 per pp times 5.7 pp equals R1710000.','blade_bearing_campaign',0,
 'cure_period','2026-05-02 09:00:00','2026-05-03 10:00:00','2026-05-04 11:00:00','2026-05-05 12:00:00',NULL,'2026-05-06 13:00:00','2026-05-08 10:00:00','2026-05-10 14:00:00',NULL,NULL,
 1,'2026-05-30 14:00:00',1,'demo_ipp_001'),

-- avg_010 csp / critical — non-performance disputed (reportable)
('avg_010','OM-AVL-2026-0010','metering.monthly_rollup','om_period','omp_2026_0410',NULL,
 'own_khi','Khi Solar One (Pty) Ltd','om_abengoa','Abengoa CSP O&M',
 'site_khi','Khi Solar One','Northern Cape','solar_pv',50,'OMSA-2021-KSO-03',
 '2026-04','2026-04-01','2026-04-30',
 95.0,98.0,80.0,10,82.5,12.5,
 'critical_shortfall',350000,10000000,4375000,NULL,NULL,
 'Receiver tube failures on the central tower drove metered availability to 80.0 percent; ten hours excused lift adjusted availability to 82.5 percent.','Adjusted 82.5 percent is 12.5 pp below the 95.0 percent guarantee — critical shortfall, reportable.','Liquidated damages assessed at R350000 per pp times 12.5 pp equals R4375000, within the R10m cap; contractor disputes the excused-downtime classification.','disputed_excused_downtime',1,
 'disputed','2026-05-02 09:00:00','2026-05-03 10:00:00','2026-05-04 11:00:00','2026-05-05 12:00:00',NULL,'2026-05-06 13:00:00','2026-05-08 10:00:00',NULL,NULL,'2026-05-11 09:00:00',
 1,'2026-06-30 00:00:00',1,'demo_ipp_001');

-- Events (transition log). Full happy path for avg_008 (owner/contractor split),
-- the shortfall / LD / cure / dispute branches for avg_006/007/009/010, and a
-- creation marker for the rest.
INSERT OR IGNORE INTO oe_availability_guarantee_events (
  id, guarantee_id, event_type, from_status, to_status, actor_id, actor_party, notes, created_at
) VALUES
('availg_evt_001','avg_001','availability_guarantee.period_open',NULL,'period_open','own_kathu','asset_owner','April reporting period opened','2026-05-02 08:00:00'),
('availg_evt_002','avg_002','availability_guarantee.period_open',NULL,'period_open','own_jbay','asset_owner','April reporting period opened','2026-05-04 09:00:00'),
('availg_evt_003','avg_002','availability_guarantee.measurement_submitted','period_open','measurement_submitted','om_vestas','om_contractor','Metered availability 95.2 percent submitted','2026-05-05 10:00:00'),
('availg_evt_004','avg_003','availability_guarantee.period_open',NULL,'period_open','own_deaar','asset_owner','April reporting period opened','2026-05-03 11:00:00'),
('availg_evt_005','avg_003','availability_guarantee.measurement_submitted','period_open','measurement_submitted','om_scatec','om_contractor','Metered availability 94.1 percent submitted','2026-05-04 12:00:00'),
('availg_evt_006','avg_003','availability_guarantee.adjustment_review','measurement_submitted','adjustment_review','own_deaar','asset_owner','Reviewing excused-downtime evidence','2026-05-06 09:30:00'),
('availg_evt_007','avg_004','availability_guarantee.reconciled','adjustment_review','reconciled','own_loeries','asset_owner','Adjusted availability reconciled at 98.1 percent','2026-05-06 14:00:00'),
('availg_evt_008','avg_005','availability_guarantee.meets_guarantee','reconciled','meets_guarantee','own_tumelo','asset_owner','Adjusted 99.4 percent meets the guarantee','2026-05-07 09:00:00'),
('availg_evt_009','avg_006','availability_guarantee.shortfall_flagged','reconciled','shortfall_flagged','own_sere','asset_owner','Severe 5.8 pp shortfall flagged; reportable','2026-05-06 13:00:00'),
('availg_evt_010','avg_007','availability_guarantee.shortfall_flagged','reconciled','shortfall_flagged','own_touws','asset_owner','Material 3.5 pp shortfall flagged','2026-05-06 13:00:00'),
('availg_evt_011','avg_007','availability_guarantee.ld_assessed','shortfall_flagged','ld_assessed','own_touws','asset_owner','Liquidated damages assessed at R700000','2026-05-08 10:00:00'),
-- avg_008 full happy path (owner -> contractor -> owner -> owner -> owner -> owner)
('availg_evt_012','avg_008','availability_guarantee.period_open',NULL,'period_open','own_pulida','asset_owner','March reporting period opened','2026-04-02 08:00:00'),
('availg_evt_013','avg_008','availability_guarantee.measurement_submitted','period_open','measurement_submitted','om_juwi','om_contractor','Metered availability 99.0 percent submitted','2026-04-03 09:00:00'),
('availg_evt_014','avg_008','availability_guarantee.adjustment_review','measurement_submitted','adjustment_review','own_pulida','asset_owner','Excused-downtime adjustment opened','2026-04-04 10:00:00'),
('availg_evt_015','avg_008','availability_guarantee.reconciled','adjustment_review','reconciled','own_pulida','asset_owner','Adjusted availability reconciled at 99.2 percent','2026-04-05 11:00:00'),
('availg_evt_016','avg_008','availability_guarantee.meets_guarantee','reconciled','meets_guarantee','own_pulida','asset_owner','Adjusted 99.2 percent clears guarantee and bonus threshold','2026-04-06 09:00:00'),
('availg_evt_017','avg_008','availability_guarantee.settled','meets_guarantee','settled','own_pulida','asset_owner','Settled in full; R150000 availability bonus paid','2026-04-09 11:00:00'),
-- avg_009 shortfall -> LD -> cure branch
('availg_evt_018','avg_009','availability_guarantee.shortfall_flagged','reconciled','shortfall_flagged','own_cookhouse','asset_owner','Severe 5.7 pp shortfall flagged; reportable','2026-05-06 13:00:00'),
('availg_evt_019','avg_009','availability_guarantee.ld_assessed','shortfall_flagged','ld_assessed','own_cookhouse','asset_owner','Liquidated damages assessed at R1710000','2026-05-08 10:00:00'),
('availg_evt_020','avg_009','availability_guarantee.cure_period','ld_assessed','cure_period','om_nordex','om_contractor','Cure plan agreed: blade-bearing campaign completion by month end','2026-05-10 14:00:00'),
-- avg_010 shortfall -> LD -> dispute branch
('availg_evt_021','avg_010','availability_guarantee.shortfall_flagged','reconciled','shortfall_flagged','own_khi','asset_owner','Critical 12.5 pp shortfall flagged; reportable','2026-05-06 13:00:00'),
('availg_evt_022','avg_010','availability_guarantee.ld_assessed','shortfall_flagged','ld_assessed','own_khi','asset_owner','Liquidated damages assessed at R4375000','2026-05-08 10:00:00'),
('availg_evt_023','avg_010','availability_guarantee.disputed','ld_assessed','disputed','om_abengoa','om_contractor','Contractor disputes the excused-downtime classification','2026-05-11 09:00:00');
