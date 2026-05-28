-- Wave 55 — OEM-Support Firmware / Security-Patch & Vulnerability Remediation seed.
-- 10 remediations srm_001..srm_010 spanning 10 distinct lifecycle states, all
-- five CVSS severity tiers (two each), and the mitigation / emergency / risk
-- acceptance / backout branches. Equipment OEMs are inverter / SCADA / BMS /
-- controller vendors; CIs are deployed OT assets across renewable sites. No
-- apostrophes anywhere (D1 SQLite).

INSERT OR IGNORE INTO oe_security_remediations (
  id, remediation_number, source_event, source_entity_type, source_entity_id, source_wave,
  advisory_ref, advisory_source, cve_id, cvss_score, cvss_vector, severity_tier,
  oem_vendor, product_family, ci_type, affected_versions, fixed_version, patch_package_ref, backout_plan_ref,
  affected_ci_count, patched_ci_count, sites_affected, fleet_scope, project_id, project_name, sector,
  mitigation_type, compensating_control, residual_risk_basis,
  triage_basis, assessment_basis, mitigation_basis, approval_basis, rollout_basis, verification_basis, resolution_basis, risk_acceptance_basis, backout_basis, reason_code,
  chain_status, advisory_received_at, triaged_at, impact_assessment_at, mitigation_applied_at, fleet_scoped_at, remediation_approved_at, rollout_in_progress_at, verification_at, resolved_at, not_affected_at, risk_accepted_at, rolled_back_at,
  is_reportable, sla_deadline_at, escalation_level, created_by
) VALUES
-- srm_001 critical — advisory just received, triage SLA BREACHED (REPORTABLE: critical sla breach)
('srm_001','SRM-2026-0001','oem.security_advisory','advisory','adv_2026_2180','W14',
 'ICSA-26-118-01','ics_cert','CVE-2026-21801',9.8,'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H','critical',
 'SunGrid Power Systems','SG-Suninverter X Series','inverter','firmware 2.1.0 to 2.4.3','firmware 2.4.4',NULL,NULL,
 0,0,0,NULL,NULL,NULL,'solar_pv',
 NULL,NULL,NULL,
 NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,
 'advisory_received','2026-05-27 20:00:00',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,
 1,'2026-05-27 21:00:00',1,'demo_admin_001'),

-- srm_002 high — triaged, awaiting impact assessment
('srm_002','SRM-2026-0002','oem.security_advisory','advisory','adv_2026_2045','W14',
 'VDE-26-0342','vendor_psirt','CVE-2026-20455',8.1,'CVSS:3.1/AV:N/AC:H/PR:N/UI:N/S:U/C:H/I:H/A:H','high',
 'Helios SCADA','Helios HMI Suite','scada','HMI 7.2 to 7.5','HMI 7.6',NULL,NULL,
 0,0,0,NULL,NULL,NULL,'wind',
 NULL,NULL,NULL,
 'Advisory triaged: confirmed the wind platform runs an affected Helios HMI release; CVSS 8.1 high.',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,
 'triaged','2026-05-26 08:00:00','2026-05-27 09:00:00',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,
 0,'2026-06-02 09:00:00',0,'demo_admin_001'),

-- srm_003 medium — impact assessment underway
('srm_003','SRM-2026-0003','oem.security_advisory','advisory','adv_2026_1932','W14',
 'VDE-26-0301','vendor_psirt','CVE-2026-19320',5.4,'CVSS:3.1/AV:A/AC:L/PR:L/UI:N/S:U/C:L/I:L/A:H','medium',
 'VoltEdge BMS','VoltEdge BMS Controller','bms','fw 3.0 to 3.2','fw 3.3',NULL,NULL,
 0,0,0,NULL,NULL,NULL,'bess',
 NULL,NULL,NULL,
 'Triaged as medium; affects battery management controllers on the storage fleet.',
 'Impact assessment underway: evaluating exploitability behind the OT firewall and the operational impact of patching the BMS controllers mid-cycle.',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,
 'impact_assessment','2026-05-22 08:00:00','2026-05-23 09:00:00','2026-05-24 10:00:00',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,
 0,'2026-06-05 10:00:00',0,'demo_admin_001'),

-- srm_004 low — interim mitigation applied (containment; no vendor fix yet)
('srm_004','SRM-2026-0004','oem.security_advisory','advisory','adv_2026_1800','W14',
 'OEM-PSIRT-26-44','oem','CVE-2026-18004',3.1,'CVSS:3.1/AV:A/AC:H/PR:L/UI:N/S:U/C:L/I:N/A:N','low',
 'GridLink Controllers','GridLink RTU 400','rtu','fw 1.4 to 1.6','fw 1.7 pending OEM release',NULL,NULL,
 0,0,0,NULL,NULL,NULL,'solar_pv',
 'segmentation','Affected RTUs isolated to a dedicated VLAN with an explicit-deny firewall rule pending the OEM firmware fix.',NULL,
 'Triaged low; remote exploitation requires adjacent network access.',
 'Assessment found no vendor fix yet available.',
 'Interim containment applied: network segmentation and a firewall ACL restricting RTU management ports until the OEM publishes fw 1.7.',NULL,NULL,NULL,NULL,NULL,NULL,'no_fix_available',
 'mitigation_applied','2026-05-15 08:00:00','2026-05-16 09:00:00','2026-05-17 10:00:00','2026-05-18 11:00:00',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,
 0,'2026-06-10 11:00:00',0,'demo_admin_001'),

-- srm_005 informational — fleet scoped (hardening advisory, no known exploit)
('srm_005','SRM-2026-0005','oem.security_advisory','advisory','adv_2026_1677','W14',
 'OEM-NOTE-26-77','oem',NULL,0.0,NULL,'informational',
 'SunGrid Power Systems','SG-Datalogger','gateway','logger fw 5.x','logger fw 6.0',NULL,NULL,
 42,0,6,'Forty-two SG dataloggers across six PV sites identified as carrying the affected logger firmware.',NULL,NULL,'solar_pv',
 NULL,NULL,NULL,
 'Triaged informational; advisory is a hardening recommendation with no known exploit.',
 'Assessment confirmed low operational impact.',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,
 'fleet_scoped','2026-05-10 08:00:00','2026-05-11 09:00:00','2026-05-12 10:00:00',NULL,'2026-05-13 11:00:00',NULL,NULL,NULL,NULL,NULL,NULL,NULL,
 0,'2026-06-15 11:00:00',0,'demo_admin_001'),

-- srm_006 medium — staged rollout in progress (17 of 28 gateways patched)
('srm_006','SRM-2026-0006','oem.security_advisory','advisory','adv_2026_1551','W14',
 'VDE-26-0288','vendor_psirt','CVE-2026-19777',6.5,'CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:U/C:L/I:L/A:L','medium',
 'Helios SCADA','Helios PLC Gateway','plc','plc fw 4.0 to 4.4','plc fw 4.5','PKG-HELIOS-PLC-4.5','BACKOUT-HELIOS-PLC-001',
 28,17,4,'Twenty-eight Helios PLC gateways across four wind sites.',NULL,NULL,'wind',
 NULL,NULL,NULL,
 'Triaged medium; affects PLC gateways on the wind fleet.',
 'Assessment confirmed a fixed firmware release is available.',NULL,
 'Remediation approved by the security authority; staged rollout authorised across the wind fleet.',
 'Firmware fw 4.5 rollout in progress; seventeen of twenty-eight gateways patched, remainder scheduled in the next maintenance window.',NULL,NULL,NULL,NULL,NULL,
 'rollout_in_progress','2026-05-05 08:00:00','2026-05-06 09:00:00','2026-05-07 10:00:00',NULL,'2026-05-08 11:00:00','2026-05-09 12:00:00','2026-05-10 13:00:00',NULL,NULL,NULL,NULL,NULL,
 0,'2026-06-08 13:00:00',0,'demo_admin_001'),

-- srm_007 informational — rollout complete, verification in progress
('srm_007','SRM-2026-0007','oem.security_advisory','advisory','adv_2026_1420','W14',
 'OEM-NOTE-26-55','oem',NULL,0.0,NULL,'informational',
 'VoltEdge BMS','VoltEdge Gateway','gateway','gw fw 2.x','gw fw 2.5','PKG-VOLT-GW-2.5','BACKOUT-VOLT-GW-001',
 12,12,2,'Twelve VoltEdge gateways across two storage sites.',NULL,NULL,'bess',
 NULL,NULL,NULL,
 'Triaged informational hardening advisory.',
 'Assessment confirmed low impact and an available firmware update.',NULL,
 'Remediation approved; routine gateway firmware update authorised.',
 'Rollout complete across all twelve gateways.',
 'Verification in progress confirming all twelve gateways report the fixed firmware version and pass post-patch health checks.',NULL,NULL,NULL,NULL,
 'verification','2026-04-28 08:00:00','2026-04-29 09:00:00','2026-04-30 10:00:00',NULL,'2026-05-01 11:00:00','2026-05-02 12:00:00','2026-05-03 13:00:00','2026-05-04 14:00:00',NULL,NULL,NULL,NULL,
 0,'2026-06-01 14:00:00',0,'demo_admin_001'),

-- srm_008 low — RESOLVED (clean terminal, full path)
('srm_008','SRM-2026-0008','oem.security_advisory','advisory','adv_2026_1300','W14',
 'OEM-PSIRT-26-30','oem','CVE-2026-17555',2.4,'CVSS:3.1/AV:A/AC:H/PR:H/UI:N/S:U/C:L/I:N/A:N','low',
 'GridLink Controllers','GridLink RTU 200','rtu','fw 2.0 to 2.1','fw 2.2','PKG-GRIDLINK-RTU-2.2','BACKOUT-GRIDLINK-001',
 9,9,3,'Nine GridLink RTUs across three hydro sites.',NULL,NULL,'hydro',
 NULL,NULL,NULL,
 'Triaged low.',
 'Assessment confirmed an available fix.',NULL,
 'Remediation approved; firmware update authorised.',
 'Rollout complete across all nine RTUs.',
 'Verification confirmed all RTUs on fw 2.2 and healthy.',
 'All nine RTUs patched to fw 2.2 and verified; advisory remediation closed with no residual exposure.',NULL,NULL,NULL,
 'resolved','2026-04-01 08:00:00','2026-04-02 09:00:00','2026-04-03 10:00:00',NULL,'2026-04-04 11:00:00','2026-04-05 12:00:00','2026-04-06 13:00:00','2026-04-08 14:00:00','2026-04-10 15:00:00',NULL,NULL,NULL,
 0,NULL,0,'demo_admin_001'),

-- srm_009 critical — RISK ACCEPTED on an end-of-life controller (REPORTABLE: accept_risk + critical; the W55 signature)
('srm_009','SRM-2026-0009','oem.security_advisory','advisory','adv_2026_2199','W14',
 'ICSA-26-090-02','ics_cert','CVE-2026-21999',9.1,'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:L','critical',
 'Legacy Micro Controls','LMC Turbine Controller EOL','controller','all versions end-of-life','none vendor end-of-life',NULL,NULL,
 6,0,2,'Six LMC turbine controllers across two legacy wind sites; no vendor firmware fix exists.',NULL,NULL,'wind',
 'segmentation','EOL turbine controllers isolated on an air-gapped OT segment with a monitored one-way data diode.',
 'No vendor firmware fix exists for the end-of-life turbine controllers; residual risk formally accepted by the security authority with compensating network isolation, pending controller replacement in the next capital cycle.',
 'Triaged critical; remotely exploitable controller with full compromise potential.',
 'Assessment confirmed the controllers are end-of-life with no vendor patch path.',
 'Interim containment: air-gapped segment with monitored data diode.',NULL,NULL,NULL,NULL,
 'Residual risk formally accepted with compensating controls; escalated to the regulator as an unpatched serious vulnerability on regulated OT equipment.',NULL,'no_vendor_fix_eol',
 'risk_accepted','2026-03-01 08:00:00','2026-03-02 09:00:00','2026-03-03 10:00:00','2026-03-05 11:00:00',NULL,NULL,NULL,NULL,NULL,NULL,'2026-03-20 12:00:00',NULL,
 1,NULL,0,'demo_admin_001'),

-- srm_010 high — patch ROLLED BACK after a regression (REPORTABLE: roll_back + high)
('srm_010','SRM-2026-0010','oem.security_advisory','advisory','adv_2026_2088','W14',
 'VDE-26-0260','vendor_psirt','CVE-2026-20888',7.8,'CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:U/C:H/I:H/A:N','high',
 'Helios SCADA','Helios HMI Suite','scada','HMI 6.0 to 6.3','HMI 6.4','PKG-HELIOS-HMI-6.4','BACKOUT-HELIOS-HMI-001',
 14,5,3,'Fourteen Helios SCADA HMI stations across three PV sites.',NULL,NULL,'solar_pv',
 NULL,NULL,NULL,
 'Triaged high.',
 'Assessment confirmed a fixed firmware release.',NULL,
 'Remediation approved; HMI 6.4 rollout authorised.',
 'Rollout commenced across the SCADA HMI fleet; five of fourteen stations patched.',NULL,NULL,NULL,
 'HMI 6.4 induced a regression in the alarm-acknowledgement workflow on patched stations; documented backout executed and all affected HMIs reverted to HMI 6.3 pending a fixed vendor release. Reported as a remediation-induced failure on regulated equipment.','patch_induced_regression',
 'rolled_back','2026-04-15 08:00:00','2026-04-16 09:00:00','2026-04-17 10:00:00',NULL,'2026-04-18 11:00:00','2026-04-19 12:00:00','2026-04-20 13:00:00',NULL,NULL,NULL,NULL,'2026-04-22 14:00:00',
 1,NULL,0,'demo_admin_001');

-- Events (transition log). Full lifecycle paths for the showcase cases (srm_008
-- resolved, srm_009 risk_accepted, srm_010 rolled_back) plus creation markers and
-- key intermediate transitions for the rest. The creation marker uses
-- security_remediation.advisory_received (the entry state; events table column is
-- plain TEXT). actor_party records the security function per step.
INSERT OR IGNORE INTO oe_security_remediations_events (
  id, remediation_id, event_type, from_status, to_status, actor_id, actor_party, notes, created_at
) VALUES
('srm_evt_001','srm_001','security_remediation.advisory_received',NULL,'advisory_received','demo_support_001','security_analyst','Critical OEM advisory received for SunGrid inverter firmware','2026-05-27 20:00:00'),
('srm_evt_002','srm_002','security_remediation.advisory_received',NULL,'advisory_received','demo_support_001','security_analyst','Vendor PSIRT advisory received for Helios HMI','2026-05-26 08:00:00'),
('srm_evt_003','srm_002','security_remediation.triaged','advisory_received','triaged','demo_support_001','security_analyst','Triaged high; affected HMI release confirmed on the wind platform','2026-05-27 09:00:00'),
('srm_evt_004','srm_003','security_remediation.advisory_received',NULL,'advisory_received','demo_support_001','security_analyst','Advisory received for VoltEdge BMS controller','2026-05-22 08:00:00'),
('srm_evt_005','srm_003','security_remediation.triaged','advisory_received','triaged','demo_support_001','security_analyst','Triaged medium','2026-05-23 09:00:00'),
('srm_evt_006','srm_003','security_remediation.impact_assessment','triaged','impact_assessment','demo_support_001','security_analyst','Impact assessment opened on the storage fleet','2026-05-24 10:00:00'),
('srm_evt_007','srm_004','security_remediation.advisory_received',NULL,'advisory_received','demo_support_001','security_analyst','Advisory received for GridLink RTU 400','2026-05-15 08:00:00'),
('srm_evt_008','srm_004','security_remediation.triaged','advisory_received','triaged','demo_support_001','security_analyst','Triaged low','2026-05-16 09:00:00'),
('srm_evt_009','srm_004','security_remediation.impact_assessment','triaged','impact_assessment','demo_support_001','security_analyst','Assessment found no vendor fix yet available','2026-05-17 10:00:00'),
('srm_evt_010','srm_004','security_remediation.mitigation_applied','impact_assessment','mitigation_applied','demo_support_001','remediation_engineer','Interim containment applied: VLAN segmentation and firewall ACL on RTU management ports','2026-05-18 11:00:00'),
('srm_evt_011','srm_005','security_remediation.advisory_received',NULL,'advisory_received','demo_support_001','security_analyst','Hardening advisory received for SG dataloggers','2026-05-10 08:00:00'),
('srm_evt_012','srm_005','security_remediation.triaged','advisory_received','triaged','demo_support_001','security_analyst','Triaged informational','2026-05-11 09:00:00'),
('srm_evt_013','srm_005','security_remediation.impact_assessment','triaged','impact_assessment','demo_support_001','security_analyst','Assessment confirmed low operational impact','2026-05-12 10:00:00'),
('srm_evt_014','srm_005','security_remediation.fleet_scoped','impact_assessment','fleet_scoped','demo_support_001','remediation_engineer','Fleet scoped: 42 dataloggers across six PV sites','2026-05-13 11:00:00'),
('srm_evt_015','srm_006','security_remediation.fleet_scoped','impact_assessment','fleet_scoped','demo_support_001','remediation_engineer','Fleet scoped: 28 PLC gateways across four wind sites','2026-05-08 11:00:00'),
('srm_evt_016','srm_006','security_remediation.remediation_approved','fleet_scoped','remediation_approved','demo_support_001','security_authority','Remediation approved; staged rollout authorised','2026-05-09 12:00:00'),
('srm_evt_017','srm_006','security_remediation.rollout_in_progress','remediation_approved','rollout_in_progress','demo_support_001','remediation_engineer','Firmware fw 4.5 rollout commenced','2026-05-10 13:00:00'),
('srm_evt_018','srm_007','security_remediation.remediation_approved','fleet_scoped','remediation_approved','demo_support_001','security_authority','Routine gateway firmware update authorised','2026-05-02 12:00:00'),
('srm_evt_019','srm_007','security_remediation.rollout_in_progress','remediation_approved','rollout_in_progress','demo_support_001','remediation_engineer','Gateway firmware rollout commenced','2026-05-03 13:00:00'),
('srm_evt_020','srm_007','security_remediation.verification','rollout_in_progress','verification','demo_support_001','remediation_engineer','Rollout complete; verification opened','2026-05-04 14:00:00'),
('srm_evt_021','srm_008','security_remediation.fleet_scoped','impact_assessment','fleet_scoped','demo_support_001','remediation_engineer','Fleet scoped: 9 RTUs across three hydro sites','2026-04-04 11:00:00'),
('srm_evt_022','srm_008','security_remediation.remediation_approved','fleet_scoped','remediation_approved','demo_support_001','security_authority','Remediation approved','2026-04-05 12:00:00'),
('srm_evt_023','srm_008','security_remediation.rollout_in_progress','remediation_approved','rollout_in_progress','demo_support_001','remediation_engineer','Firmware fw 2.2 rollout commenced','2026-04-06 13:00:00'),
('srm_evt_024','srm_008','security_remediation.verification','rollout_in_progress','verification','demo_support_001','remediation_engineer','Rollout complete; verification opened','2026-04-08 14:00:00'),
('srm_evt_025','srm_008','security_remediation.resolved','verification','resolved','demo_support_001','security_authority','All nine RTUs verified on fw 2.2; remediation closed','2026-04-10 15:00:00'),
('srm_evt_026','srm_009','security_remediation.mitigation_applied','impact_assessment','mitigation_applied','demo_support_001','remediation_engineer','Interim containment: air-gapped segment with monitored data diode','2026-03-05 11:00:00'),
('srm_evt_027','srm_009','security_remediation.risk_accepted','mitigation_applied','risk_accepted','demo_support_001','security_authority','Residual risk formally accepted on EOL controllers; escalated to the regulator','2026-03-20 12:00:00'),
('srm_evt_028','srm_010','security_remediation.remediation_approved','fleet_scoped','remediation_approved','demo_support_001','security_authority','HMI 6.4 rollout authorised','2026-04-19 12:00:00'),
('srm_evt_029','srm_010','security_remediation.rollout_in_progress','remediation_approved','rollout_in_progress','demo_support_001','remediation_engineer','HMI 6.4 rollout commenced','2026-04-20 13:00:00'),
('srm_evt_030','srm_010','security_remediation.rolled_back','rollout_in_progress','rolled_back','demo_support_001','remediation_engineer','Regression in alarm-acknowledgement workflow; documented backout executed and HMIs reverted to 6.3; reported to the regulator','2026-04-22 14:00:00'),
('srm_evt_031','srm_001','security_remediation.sla_breached','advisory_received','advisory_received','system','security_authority','Critical triage SLA breached; escalated to the regulator','2026-05-27 21:30:00');
