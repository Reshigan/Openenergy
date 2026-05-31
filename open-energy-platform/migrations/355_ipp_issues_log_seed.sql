-- Wave 132: IPP Issues Log seed data
-- 16 rows covering all 12 forward + 4 branch states.
-- INSERT OR IGNORE = replay-safe.
-- URGENT SLA polarity: P1=24h (tightest), P5=720h (loosest).

INSERT OR IGNORE INTO oe_ipp_issues
  (id, project_id, project_name, title, description, category, priority,
   chain_status, raised_by, assigned_to, owner_name,
   sla_target_hours, sla_deadline_at, sla_breached,
   is_safety, is_regulatory, is_commercial, is_lender_notifiable, is_nersa_notifiable,
   rfi_ref, change_order_ref, stage_gate_ref, w118_block_ref,
   bridges_to_rfi_live, bridges_to_co_live, bridges_to_sg_live, bridges_to_w118_live,
   raised_at, created_by, created_at, updated_at)
VALUES

-- 1. raised — P1 critical safety issue
('iss-001','proj-kakamas-500mw','Kakamas 500MW',
 'Transformer oil leak at MV switchgear bay 3',
 'Oil leakage detected on 132kV transformer — potential fire hazard.',
 'safety','p1_critical','raised',
 'site_manager_1','','',
 24, datetime('2026-05-31T16:00:00Z', '+1 day'), 0,
 1, 0, 0, 1, 0,
 NULL, NULL, 'sg-001', NULL,
 0, 0, 1, 0,
 '2026-05-31T15:00:00Z','ipp_dev_1','2026-05-31T15:00:00Z','2026-05-31T15:00:00Z'),

-- 2. triaged — P2 high regulatory issue
('iss-002','proj-kakamas-500mw','Kakamas 500MW',
 'Environmental authorisation condition 7b partially unmet',
 'EA condition 7b offset planting target not achieved by 31 May deadline.',
 'regulatory','p2_high','triaged',
 'env_officer_1','pm_lead','',
 72, datetime('2026-05-31T12:00:00Z', '+3 days'), 0,
 0, 1, 0, 0, 1,
 NULL, 'ico-001', 'sg-002', NULL,
 0, 1, 1, 0,
 '2026-05-30T09:00:00Z','ipp_dev_1','2026-05-30T09:00:00Z','2026-05-31T10:00:00Z'),

-- 3. assigned — P2 high technical issue
('iss-003','proj-de-aar-100mw','De Aar 100MW',
 'Pile driving penetration resistance anomaly grid E7',
 'Driven piles at E7 achieving 80% of design set — structural engineer review required.',
 'technical','p2_high','assigned',
 'civil_eng_1','structural_eng_2','',
 72, datetime('2026-05-31T08:00:00Z', '+3 days'), 0,
 0, 0, 0, 0, 0,
 'rfi-031', NULL, NULL, NULL,
 1, 0, 0, 0,
 '2026-05-29T14:00:00Z','ipp_dev_2','2026-05-29T14:00:00Z','2026-05-31T08:00:00Z'),

-- 4. acknowledged — P3 medium commercial issue
('iss-004','proj-loeriesfontein-200mw','Loeriesfontein 200MW',
 'EPC contractor claims R2.1M variation for grid code changes',
 'Contractor issued variation notice under FIDIC Cl 13.3 for NERSA Grid Code rev 7.1.',
 'commercial','p3_medium','acknowledged',
 'contracts_mgr','pm_lead','',
 168, datetime('2026-05-28T10:00:00Z', '+7 days'), 0,
 0, 0, 1, 1, 0,
 NULL, 'ico-008', NULL, NULL,
 0, 1, 0, 0,
 '2026-05-27T11:00:00Z','ipp_dev_3','2026-05-27T11:00:00Z','2026-05-29T09:00:00Z'),

-- 5. in_progress — P2 high environmental issue
('iss-005','proj-cookhouse-135mw','Cookhouse 135MW',
 'Watercourse crossing sediment discharge above DFFE threshold',
 'Turbidity readings at downstream monitoring point 3 exceeded DFFE WUL condition.',
 'environmental','p2_high','in_progress',
 'env_monitor_1','env_officer_2','',
 72, datetime('2026-05-30T08:00:00Z', '+3 days'), 0,
 1, 1, 0, 0, 1,
 NULL, NULL, 'sg-003', NULL,
 0, 0, 1, 0,
 '2026-05-28T07:00:00Z','ipp_dev_4','2026-05-28T07:00:00Z','2026-05-30T10:00:00Z'),

-- 6. blocked — P3 medium technical issue (waiting on OEM response)
('iss-006','proj-de-aar-100mw','De Aar 100MW',
 'Inverter firmware v3.2.1 MPPT efficiency below spec',
 'Measured MPPT efficiency 97.1% vs 98.5% warranted — awaiting OEM investigation report.',
 'technical','p3_medium','blocked',
 'commissioning_eng','ipp_dev_2','',
 168, datetime('2026-05-25T09:00:00Z', '+7 days'), 0,
 0, 0, 0, 0, 0,
 NULL, NULL, NULL, NULL,
 0, 0, 0, 0,
 '2026-05-24T11:00:00Z','ipp_dev_2','2026-05-24T11:00:00Z','2026-05-29T15:00:00Z'),

-- 7. under_review — P2 high legal issue
('iss-007','proj-loeriesfontein-200mw','Loeriesfontein 200MW',
 'Servitude registration delay at Deeds Office',
 'Access road servitude registration 6 weeks behind schedule — blocks COD.',
 'legal','p2_high','under_review',
 'legal_officer','legal_mgr','',
 72, datetime('2026-05-20T14:00:00Z', '+3 days'), 0,
 0, 1, 0, 1, 0,
 NULL, NULL, 'sg-005', NULL,
 0, 0, 1, 0,
 '2026-05-15T09:00:00Z','ipp_dev_3','2026-05-15T09:00:00Z','2026-05-28T11:00:00Z'),

-- 8. resolved — P3 medium financial issue
('iss-008','proj-cookhouse-135mw','Cookhouse 135MW',
 'Construction insurance premium shortfall R850k',
 'OCIP premium calculation error identified — additional funds sourced from contingency.',
 'financial','p3_medium','resolved',
 'finance_mgr','cfo_delegate','',
 168, datetime('2026-05-10T12:00:00Z', '+7 days'), 0,
 0, 0, 1, 1, 0,
 NULL, 'ico-003', NULL, NULL,
 0, 1, 0, 0,
 '2026-05-05T10:00:00Z','ipp_dev_4','2026-05-05T10:00:00Z','2026-05-28T09:00:00Z'),

-- 9. verified — P3 medium stakeholder issue
('iss-009','proj-kakamas-500mw','Kakamas 500MW',
 'Community trust funding disbursement dispute',
 'Two community trusts dispute allocation formula for R12M ED contribution.',
 'stakeholder','p3_medium','verified',
 'community_liaison','pm_lead','',
 168, datetime('2026-05-01T09:00:00Z', '+7 days'), 0,
 0, 0, 0, 0, 0,
 NULL, NULL, 'sg-001', NULL,
 0, 0, 1, 0,
 '2026-04-25T08:00:00Z','ipp_dev_1','2026-04-25T08:00:00Z','2026-05-20T14:00:00Z'),

-- 10. evidence_filed — P4 low technical issue
('iss-010','proj-de-aar-100mw','De Aar 100MW',
 'Cable tray routing deviation from IFC drawing E-401',
 'As-built cable tray routing deviates from IFC — RFI-019 approved deviation on record.',
 'technical','p4_low','evidence_filed',
 'electrical_eng','pm_lead','',
 336, datetime('2026-04-20T08:00:00Z', '+14 days'), 0,
 0, 0, 0, 0, 0,
 'rfi-019', NULL, NULL, 'wblk-w118-2026-0010',
 1, 0, 0, 1,
 '2026-04-15T09:00:00Z','ipp_dev_2','2026-04-15T09:00:00Z','2026-05-10T11:00:00Z'),

-- 11. closed — P4 low general issue
('iss-011','proj-loeriesfontein-200mw','Loeriesfontein 200MW',
 'Site welfare facilities hygiene non-conformance',
 'HSEC inspection found portable toilets not serviced per contract schedule. Resolved.',
 'general','p4_low','closed',
 'hse_officer','site_mgr','',
 336, datetime('2026-04-01T08:00:00Z', '+14 days'), 0,
 0, 0, 0, 0, 0,
 NULL, NULL, NULL, NULL,
 0, 0, 0, 0,
 '2026-03-28T07:00:00Z','ipp_dev_3','2026-03-28T07:00:00Z','2026-04-20T09:00:00Z'),

-- 12. archived — P5 informational
('iss-012','proj-cookhouse-135mw','Cookhouse 135MW',
 'Dust road maintenance frequency tracking',
 'Tracking dust suppression frequency for access road — closed informational record.',
 'environmental','p5_informational','archived',
 'env_officer_2','pm_lead','',
 720, datetime('2026-03-01T08:00:00Z', '+30 days'), 0,
 0, 0, 0, 0, 0,
 NULL, NULL, NULL, NULL,
 0, 0, 0, 0,
 '2026-02-15T08:00:00Z','ipp_dev_4','2026-02-15T08:00:00Z','2026-03-20T08:00:00Z'),

-- 13. escalated — P1 critical safety, W132 SIGNATURE row
-- SIGNATURE: escalate_to_regulator crosses regulator EVERY tier when safety
('iss-013','proj-kakamas-500mw','Kakamas 500MW',
 'HV live-line work fatality near-miss — OHSA s24 reportable',
 'Worker near-miss on 132kV live conductor during maintenance window. OHSA s24 notifiable.',
 'safety','p1_critical','escalated',
 'hse_manager','project_director','',
 24, datetime('2026-05-31T06:00:00Z', '+1 day'), 0,
 1, 1, 0, 1, 1,
 NULL, NULL, 'sg-016', NULL,
 0, 0, 1, 0,
 '2026-05-31T05:00:00Z','ipp_dev_1','2026-05-31T05:00:00Z','2026-05-31T05:30:00Z'),

-- 14. deferred — P4 low general
('iss-014','proj-de-aar-100mw','De Aar 100MW',
 'Meteorological tower calibration schedule alignment',
 'Annual calibration of met towers deferred to Q3 maintenance window.',
 'technical','p4_low','deferred',
 'engineering_lead','pm_lead','',
 336, NULL, 0,
 0, 0, 0, 0, 0,
 NULL, NULL, NULL, NULL,
 0, 0, 0, 0,
 '2026-05-01T10:00:00Z','ipp_dev_2','2026-05-01T10:00:00Z','2026-05-15T09:00:00Z'),

-- 15. cancelled — P3 medium commercial (found to be non-issue)
('iss-015','proj-loeriesfontein-200mw','Loeriesfontein 200MW',
 'Suspected VAT reclaim discrepancy on EPC contract',
 'Raised as potential VAT discrepancy — SARS ruling confirmed EPC contract treatment correct.',
 'financial','p3_medium','cancelled',
 'finance_mgr','cfo_delegate','',
 168, NULL, 0,
 0, 0, 0, 0, 0,
 NULL, NULL, NULL, NULL,
 0, 0, 0, 0,
 '2026-04-10T11:00:00Z','ipp_dev_3','2026-04-10T11:00:00Z','2026-04-25T14:00:00Z'),

-- 16. overdue_flagged — P2 high regulatory SLA already breached
('iss-016','proj-kakamas-500mw','Kakamas 500MW',
 'NERSA quarterly return Section 10 submission overdue',
 'Q1 2026 NERSA Section 10 return 14 days overdue. Cron-flagged.',
 'regulatory','p2_high','overdue_flagged',
 'regulatory_mgr','pm_lead','',
 72, '2026-05-17T09:00:00Z', 1,
 0, 1, 0, 0, 1,
 NULL, NULL, 'sg-002', NULL,
 0, 0, 1, 0,
 '2026-05-14T09:00:00Z','ipp_dev_1','2026-05-14T09:00:00Z','2026-05-31T06:00:00Z');
