-- Wave 136 — IPP NCR seed data
-- 12 rows covering all 12 chain states

INSERT OR IGNORE INTO oe_ipp_ncrs (
  id, project_id, project_name, ncr_number, chain_status,
  ncr_category, ncr_severity, discipline, work_area, specification_ref,
  description, detected_by, detection_method, disposition,
  floor_hold_point_triggered, floor_safety_stop_work, floor_ie_notification_required,
  floor_lender_consent_required, floor_nersa_reportable,
  sla_target_hours, sla_deadline_at,
  raised_at, created_by, created_at, updated_at
) VALUES (
  'ncr-001', 'kakamas-500mw', 'Kakamas 500MW Solar', 'K500-NCR-001', 'raised',
  'workmanship', 'structural', 'civil', 'Foundation Zone B', 'SANS 10100:2014 §6.4',
  'Concrete pour in foundation zone B shows visible honeycombing exceeding 5% of surface area, violating structural specification SANS 10100:2014 §6.4.',
  'Site Inspector Thabo Mokoena', 'inspection', NULL,
  1, 0, 0, 0, 0,
  48, datetime('now', '+48 hours'),
  datetime('now'), 'system', datetime('now'), datetime('now')
);

INSERT OR IGNORE INTO oe_ipp_ncrs (
  id, project_id, project_name, ncr_number, chain_status,
  ncr_category, ncr_severity, discipline, work_area, specification_ref,
  description, detected_by, detection_method,
  sla_target_hours, sla_deadline_at,
  raised_at, acknowledged_at, created_by, created_at, updated_at
) VALUES (
  'ncr-002', 'kakamas-500mw', 'Kakamas 500MW Solar', 'K500-NCR-002', 'acknowledged',
  'materials', 'functional', 'electrical', 'Cable trench Row C', 'IEC 60502-1:2004 §4.2',
  'Delivered DC cable batch shows insulation thickness 1.8mm against spec requirement of 2.2mm minimum. Non-conformance with IEC 60502-1:2004 §4.2.',
  'QA Engineer Priya Naidoo', 'testing',
  120, datetime('now', '+72 hours'),
  datetime('now', '-8 hours'), datetime('now', '-6 hours'),
  'system', datetime('now', '-8 hours'), datetime('now', '-6 hours')
);

INSERT OR IGNORE INTO oe_ipp_ncrs (
  id, project_id, project_name, ncr_number, chain_status,
  ncr_category, ncr_severity, discipline, work_area, specification_ref,
  description, detected_by, detection_method, rca_method,
  floor_safety_stop_work, floor_hold_point_triggered,
  sla_target_hours, sla_deadline_at,
  raised_at, acknowledged_at, under_investigation_at,
  created_by, created_at, updated_at
) VALUES (
  'ncr-003', 'kakamas-500mw', 'Kakamas 500MW Solar', 'K500-NCR-003', 'under_investigation',
  'safety', 'safety_critical', 'electrical', 'HV switchyard', 'SANS 10142-1:2008 §8.3',
  'HV switchgear grounding connection found absent on three bays in the switchyard. Represents live electrical safety hazard. Work stopped immediately per OHSA §8.',
  'Safety Officer Naledi Dlamini', 'audit', 'five_whys',
  1, 1,
  24, datetime('now', '+16 hours'),
  datetime('now', '-20 hours'), datetime('now', '-18 hours'), datetime('now', '-14 hours'),
  'system', datetime('now', '-20 hours'), datetime('now', '-14 hours')
);

INSERT OR IGNORE INTO oe_ipp_ncrs (
  id, project_id, project_name, ncr_number, chain_status,
  ncr_category, ncr_severity, discipline, work_area, specification_ref,
  description, detected_by, detection_method, disposition, disposition_justification,
  rework_scope,
  sla_target_hours, sla_deadline_at,
  raised_at, acknowledged_at, under_investigation_at, disposition_proposed_at,
  created_by, created_at, updated_at
) VALUES (
  'ncr-004', 'kakamas-500mw', 'Kakamas 500MW Solar', 'K500-NCR-004', 'disposition_proposed',
  'workmanship', 'functional', 'civil', 'Racking Row A–F', 'REIPPPP Module Spec §3.2.1',
  'Module mounting rails installed at 2.1° tilt versus design specification of 25°. All rails in Rows A–F affected, totalling 480 mounts.',
  'Commissioning Engineer Sipho Khumalo', 'inspection', 'rework',
  'Re-installation required for all 480 mounting rails in Rows A-F to meet 25° design tilt specification.',
  'Remove existing rails, re-install at correct 25° angle. Torque verification required on all fasteners per structural spec.',
  120, datetime('now', '+90 hours'),
  datetime('now', '-72 hours'), datetime('now', '-70 hours'), datetime('now', '-65 hours'), datetime('now', '-24 hours'),
  'system', datetime('now', '-72 hours'), datetime('now', '-24 hours')
);

INSERT OR IGNORE INTO oe_ipp_ncrs (
  id, project_id, project_name, ncr_number, chain_status,
  ncr_category, ncr_severity, discipline, work_area, specification_ref,
  description, detected_by, detection_method, disposition, disposition_justification,
  floor_ie_notification_required,
  sla_target_hours, sla_deadline_at,
  raised_at, acknowledged_at, under_investigation_at, disposition_proposed_at, disposition_reviewed_at,
  created_by, created_at, updated_at
) VALUES (
  'ncr-005', 'kakamas-500mw', 'Kakamas 500MW Solar', 'K500-NCR-005', 'disposition_reviewed',
  'design', 'structural', 'structural', 'Substation building', 'SANS 10160-3:2011',
  'Structural steel column splice connection uses M20 bolts where design specifies M24 grade 8.8 bolts. Affects 12 column locations in substation building.',
  'Structural Engineer Dr. Amir Hassan', 'inspection', 'replace',
  'M20 bolts must be replaced with M24 grade 8.8 bolts as per structural design. Engineering sign-off required before replacement.',
  1,
  48, datetime('now', '+30 hours'),
  datetime('now', '-96 hours'), datetime('now', '-94 hours'), datetime('now', '-88 hours'),
  datetime('now', '-48 hours'), datetime('now', '-12 hours'),
  'system', datetime('now', '-96 hours'), datetime('now', '-12 hours')
);

INSERT OR IGNORE INTO oe_ipp_ncrs (
  id, project_id, project_name, ncr_number, chain_status,
  ncr_category, ncr_severity, discipline, work_area, specification_ref,
  description, detected_by, detection_method, disposition, rework_scope,
  rework_cost_zar, schedule_impact_days,
  sla_target_hours, sla_deadline_at,
  raised_at, acknowledged_at, under_investigation_at, disposition_proposed_at, disposition_reviewed_at, rework_in_progress_at,
  created_by, created_at, updated_at
) VALUES (
  'ncr-006', 'kakamas-500mw', 'Kakamas 500MW Solar', 'K500-NCR-006', 'rework_in_progress',
  'workmanship', 'functional', 'mechanical', 'Tracker drive Row G–J', 'REIPPPP Tracker Spec §5.1',
  'Single-axis tracker drive motor mounting brackets show misalignment of ±3mm across 200 tracker rows G–J, causing binding under wind load.',
  'Mechanical Supervisor Jan Van Der Berg', 'observation', 'repair',
  'Shim and re-align 200 drive motor brackets within ±0.5mm tolerance. Operational test required after each repair.',
  450000, 8,
  120, datetime('now', '+60 hours'),
  datetime('now', '-168 hours'), datetime('now', '-165 hours'), datetime('now', '-160 hours'),
  datetime('now', '-120 hours'), datetime('now', '-96 hours'), datetime('now', '-48 hours'),
  'system', datetime('now', '-168 hours'), datetime('now', '-48 hours')
);

INSERT OR IGNORE INTO oe_ipp_ncrs (
  id, project_id, project_name, ncr_number, chain_status,
  ncr_category, ncr_severity, discipline, work_area, specification_ref,
  description, detected_by, detection_method, disposition, rework_scope,
  reinspection_notes, floor_lender_consent_required, rework_cost_zar,
  sla_target_hours, sla_deadline_at,
  raised_at, acknowledged_at, under_investigation_at, disposition_proposed_at,
  disposition_reviewed_at, rework_in_progress_at, reinspection_at,
  created_by, created_at, updated_at
) VALUES (
  'ncr-007', 'kakamas-500mw', 'Kakamas 500MW Solar', 'K500-NCR-007', 'reinspection',
  'materials', 'structural', 'civil', 'Pile cap grid section 3', 'SANS 10100-1:2000 §3.3',
  'Pile cap concrete strength test results (28-day cube) returned 27 MPa versus specified 35 MPa minimum. Affects 40 pile caps in section 3.',
  'Materials Engineer Fatima Botha', 'testing', 'repair',
  'Core drilling and post-injection grouting to restore structural capacity. Third-party structural assessment required.',
  'Post-repair cores taken. Average strength now 33.8 MPa. Reviewing against structural reassessment report before sign-off.',
  1, 820000,
  48, datetime('now', '+20 hours'),
  datetime('now', '-240 hours'), datetime('now', '-238 hours'), datetime('now', '-232 hours'),
  datetime('now', '-200 hours'), datetime('now', '-168 hours'), datetime('now', '-120 hours'), datetime('now', '-24 hours'),
  'system', datetime('now', '-240 hours'), datetime('now', '-24 hours')
);

INSERT OR IGNORE INTO oe_ipp_ncrs (
  id, project_id, project_name, ncr_number, chain_status,
  ncr_category, ncr_severity, discipline, work_area, specification_ref,
  description, detected_by, detection_method, root_cause, corrective_action, preventive_action,
  rca_method, rework_cost_zar,
  sla_target_hours, sla_deadline_at,
  raised_at, acknowledged_at, under_investigation_at, disposition_proposed_at,
  disposition_reviewed_at, rework_in_progress_at, reinspection_at, corrective_action_planned_at,
  created_by, created_at, updated_at
) VALUES (
  'ncr-008', 'kakamas-500mw', 'Kakamas 500MW Solar', 'K500-NCR-008', 'corrective_action_planned',
  'documentation', 'minor', 'electrical', 'Cable schedule register', 'IEC 60445:2017',
  'Cable schedule register missing 147 cable entries for LV distribution panel DP-04. As-built documentation non-conforming to IEC 60445:2017.',
  'Document Controller Zanele Sithole', 'audit', 'Inadequate document handover process between EPC subcontractor and main contractor document control team.',
  'Update cable schedule register with all 147 missing entries. Verify against site markup drawings. Submit updated register to IE for review.',
  'Implement mandatory document handover checklist for all subcontractors. Weekly document completeness audit to be conducted.',
  'fishbone', 35000,
  336, datetime('now', '+200 hours'),
  datetime('now', '-300 hours'), datetime('now', '-298 hours'), datetime('now', '-290 hours'),
  datetime('now', '-270 hours'), datetime('now', '-250 hours'), datetime('now', '-220 hours'),
  datetime('now', '-180 hours'), datetime('now', '-48 hours'),
  'system', datetime('now', '-300 hours'), datetime('now', '-48 hours')
);

INSERT OR IGNORE INTO oe_ipp_ncrs (
  id, project_id, project_name, ncr_number, chain_status,
  ncr_category, ncr_severity, discipline, work_area, specification_ref,
  description, detected_by, detection_method, disposition, closure_notes,
  corrective_action, rework_cost_zar, schedule_impact_days,
  sla_target_hours, sla_deadline_at, sla_breached,
  raised_at, acknowledged_at, under_investigation_at, disposition_proposed_at,
  disposition_reviewed_at, rework_in_progress_at, reinspection_at,
  corrective_action_planned_at, closed_at,
  created_by, created_at, updated_at
) VALUES (
  'ncr-009', 'kakamas-500mw', 'Kakamas 500MW Solar', 'K500-NCR-009', 'closed',
  'commissioning', 'functional', 'electrical', 'Inverter block 1', 'IEC 62116:2014',
  'Anti-islanding protection test failed for 8 of 48 inverters in Block 1. Inverters did not disconnect within specified 2 second window.',
  'Commissioning Manager Brendan Olivier', 'testing', 'rework',
  'Rework verified and accepted. All 8 inverters now pass anti-islanding test within 1.8 seconds. Final grid connection approval received.',
  'Firmware update applied to all 8 non-conforming inverters. Protection relay settings reviewed and adjusted. Retest witnessed by IE.',
  180000, 3,
  120, datetime('now', '-100 hours'), 0,
  datetime('now', '-480 hours'), datetime('now', '-476 hours'), datetime('now', '-470 hours'),
  datetime('now', '-440 hours'), datetime('now', '-400 hours'), datetime('now', '-360 hours'),
  datetime('now', '-300 hours'), datetime('now', '-240 hours'), datetime('now', '-48 hours'),
  'system', datetime('now', '-480 hours'), datetime('now', '-48 hours')
);

INSERT OR IGNORE INTO oe_ipp_ncrs (
  id, project_id, project_name, ncr_number, chain_status,
  ncr_category, ncr_severity, discipline, work_area, specification_ref,
  description, detected_by, detection_method, disposition, disposition_justification,
  ie_comments, floor_ie_notification_required, floor_nersa_reportable,
  is_reportable, regulator_ref, rework_cost_zar,
  sla_target_hours, sla_deadline_at, sla_breached,
  raised_at, acknowledged_at, under_investigation_at, disposition_proposed_at,
  disposition_reviewed_at, accepted_as_is_at,
  created_by, created_at, updated_at
) VALUES (
  'ncr-010', 'kakamas-500mw', 'Kakamas 500MW Solar', 'K500-NCR-010', 'accepted_as_is',
  'materials', 'minor', 'civil', 'Road surface access track', 'REIPPPP Site Prep Spec §7.1',
  'Access road surface material uses 19mm crusher run instead of specified 26mm G5 gravel. Deviation from REIPPPP Site Prep Spec §7.1.',
  'Site Engineer Lungelo Dube', 'inspection', 'accept_as_is',
  'Engineering assessment confirms 19mm crusher run provides equivalent bearing capacity for intended vehicle loads. Cost difference R85,000. Accept with condition that annual road condition monitoring is added to O&M plan.',
  'IE concurs with accept-as-is. No structural or safety risk. NERSA notification required as this constitutes a deviation from approved construction plan. Annual monitoring condition accepted.',
  1, 1,
  1, 'W136-NCR-MINOR-2026-NCR-010', 85000,
  336, datetime('now', '-200 hours'), 1,
  datetime('now', '-600 hours'), datetime('now', '-596 hours'), datetime('now', '-590 hours'),
  datetime('now', '-560 hours'), datetime('now', '-480 hours'), datetime('now', '-120 hours'),
  'system', datetime('now', '-600 hours'), datetime('now', '-120 hours')
);

INSERT OR IGNORE INTO oe_ipp_ncrs (
  id, project_id, project_name, ncr_number, chain_status,
  ncr_category, ncr_severity, discipline, work_area, specification_ref,
  description, detected_by, detection_method, disposition, disposition_justification,
  ie_comments, floor_ie_notification_required,
  is_reportable, regulator_ref,
  rework_cost_zar, schedule_impact_days,
  sla_target_hours, sla_deadline_at, sla_breached, sla_breach_count,
  raised_at, acknowledged_at, under_investigation_at, disposition_proposed_at,
  disposition_reviewed_at, rejected_escalated_at,
  created_by, created_at, updated_at
) VALUES (
  'ncr-011', 'kakamas-500mw', 'Kakamas 500MW Solar', 'K500-NCR-011', 'rejected_escalated',
  'design', 'structural', 'structural', 'Main transformer plinth', 'SABS IEC 60076-1:2011 §7',
  'Transformer plinth dimensions 3.2m × 4.1m do not match approved design drawing TRF-PLN-001 Rev C (3.8m × 4.8m). Plinth already poured in wrong dimensions.',
  'Structural Engineer Dr. Amir Hassan', 'audit', 'repair',
  'Propose breakout and re-pour to correct dimensions. Structural review required.',
  'IE rejects proposed repair as insufficient. The out-of-tolerance plinth cannot safely carry transformer plus seismic loading. Full demolition and reconstruction required. NERSA notified as this affects structural integrity of licensed facility.',
  1,
  1, 'W136-NCR-STRUCTURAL-2026-NCR-011',
  1250000, 21,
  48, datetime('now', '-600 hours'), 1, 2,
  datetime('now', '-720 hours'), datetime('now', '-716 hours'), datetime('now', '-710 hours'),
  datetime('now', '-680 hours'), datetime('now', '-600 hours'), datetime('now', '-240 hours'),
  'system', datetime('now', '-720 hours'), datetime('now', '-240 hours')
);

INSERT OR IGNORE INTO oe_ipp_ncrs (
  id, project_id, project_name, ncr_number, chain_status,
  ncr_category, ncr_severity, discipline, work_area, specification_ref,
  description, detected_by, detection_method,
  closure_notes,
  sla_target_hours, sla_deadline_at,
  raised_at, voided_at,
  created_by, created_at, updated_at
) VALUES (
  'ncr-012', 'kakamas-500mw', 'Kakamas 500MW Solar', 'K500-NCR-012', 'voided',
  'documentation', 'cosmetic', 'electrical', 'Cable labelling Row D', 'IEC 60445:2017',
  'Cable labelling on Row D cables reported as missing. Raised in error — subsequent inspection confirmed all labels were present but obscured by dust.',
  'Junior Inspector Thandi Molefe', 'inspection',
  'Raised in error. Labels confirmed present under dust cover. NCR voided.',
  720, datetime('now', '+600 hours'),
  datetime('now', '-48 hours'), datetime('now', '-24 hours'),
  'system', datetime('now', '-48 hours'), datetime('now', '-24 hours')
);
