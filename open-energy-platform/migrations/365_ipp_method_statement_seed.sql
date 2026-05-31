-- Wave 137 — IPP Method Statement seed data (12 rows covering all 12 chain states)

INSERT OR IGNORE INTO oe_ipp_method_statements (
  id, project_id, project_name, ms_number, chain_status, ms_title,
  work_type, risk_tier, work_area, scheduled_start_date, scheduled_duration_days,
  is_critical_lift, is_confined_space, is_live_electrical, is_hot_work, is_working_at_height,
  scope_of_work,
  floor_ptw_required, floor_ie_review_required, floor_regulatory_notification,
  floor_lender_notification, floor_third_party_inspection,
  sla_target_hours, sla_deadline_at, sla_breached, sla_breach_count,
  is_reportable,
  drafted_at, created_by, created_at, updated_at
) VALUES
-- ms-001: drafted — civil, medium_risk
(
  'ms-001', 'kakamas-500mw', 'Kakamas 500MW Solar', 'K500-MS-001',
  'drafted', 'Foundation concrete pour',
  'civil', 'medium_risk', 'Block A — Column Grid 4-8',
  '2026-06-05', 3,
  0, 0, 0, 0, 0,
  'Construct 450mm diameter drilled piers and pour Grade 25 reinforced concrete footings for solar tracker mounting structures. Work sequence: survey → rebar installation → formwork → concrete pour → curing.',
  0, 0, 0, 0, 0,
  72, datetime('now', '+72 hours'), 0, 0,
  0,
  datetime('now'), 'seed', datetime('now'), datetime('now')
),
-- ms-002: reviewed — electrical, high_risk
(
  'ms-002', 'kakamas-500mw', 'Kakamas 500MW Solar', 'K500-MS-002',
  'reviewed', 'MV cable installation and termination',
  'electrical', 'high_risk', 'Cable trench — Row 12 to MV room',
  '2026-06-10', 5,
  0, 0, 0, 0, 0,
  'Installation of 11kV XLPE MV cable from inverter station to the medium-voltage switchroom. Includes cable pulling, termination, and continuity testing. Work MUST NOT energise live circuits without separate PTW.',
  1, 1, 0, 0, 0,
  24, datetime('now', '+24 hours'), 0, 0,
  0,
  datetime('now', '-2 days'), 'seed', datetime('now', '-2 days'), datetime('now')
),
-- ms-003: risk_assessed — structural, high_risk, with hazard register
(
  'ms-003', 'kakamas-500mw', 'Kakamas 500MW Solar', 'K500-MS-003',
  'risk_assessed', 'Steel structure erection — tracker frames',
  'structural', 'high_risk', 'Block C — Rows 40–60',
  '2026-06-12', 7,
  0, 0, 0, 1, 1,
  'Erect pre-fabricated galvanized steel single-axis tracker drive frames at 12m height. Install bearing assemblies and torque tubes. Welding of gusset plates to secure primary longitudinal beams.',
  0, 1, 0, 0, 0,
  24, datetime('now', '+24 hours'), 0, 0,
  0,
  datetime('now', '-5 days'), 'seed', datetime('now', '-5 days'), datetime('now')
),
-- ms-004: approved — scaffolding, high_risk, PTW required, working at height
(
  'ms-004', 'kakamas-500mw', 'Kakamas 500MW Solar', 'K500-MS-004',
  'approved', 'Scaffolding erection for inverter building roof access',
  'scaffolding', 'high_risk', 'Inverter building — North elevation',
  '2026-06-15', 2,
  0, 0, 0, 0, 1,
  'Erect tube-and-coupler scaffolding system to access inverter building roof at 9.5m for waterproofing work. Scaffold must comply with SANS 10085-1. Weekly scaffold inspection by competent person.',
  1, 0, 0, 0, 1,
  24, datetime('now', '+24 hours'), 0, 0,
  0,
  datetime('now', '-10 days'), 'seed', datetime('now', '-10 days'), datetime('now')
),
-- ms-005: toolbox_briefed — excavation, medium_risk
(
  'ms-005', 'kakamas-500mw', 'Kakamas 500MW Solar', 'K500-MS-005',
  'toolbox_briefed', 'Cable trench excavation — HV feeder route',
  'excavation', 'medium_risk', 'HV feeder corridor — Site boundary to substation',
  '2026-06-01', 4,
  0, 0, 0, 0, 0,
  'Mechanically excavate 600mm wide × 1200mm deep cable trench along the HV feeder corridor. Shore all trenches >1.2m depth per Construction Regulations 2014 Reg.13. Locate all underground services before excavation.',
  0, 0, 0, 0, 0,
  72, datetime('now', '-40 hours'), 0, 0,
  0,
  datetime('now', '-8 days'), 'seed', datetime('now', '-8 days'), datetime('now')
),
-- ms-006: active — commissioning, medium_risk
(
  'ms-006', 'kakamas-500mw', 'Kakamas 500MW Solar', 'K500-MS-006',
  'commissioned', 'DC string commissioning and IV curve testing',
  'commissioning', 'medium_risk', 'Block A — All PV strings',
  '2026-05-31', 3,
  0, 0, 0, 0, 0,
  'Commission photovoltaic string arrays: measure open-circuit voltage, short-circuit current, perform IV curve tracing with SolarEdge Tester, record in as-built register. Flag underperforming strings for soiling or shading investigation.',
  0, 1, 0, 0, 0,
  72, datetime('now', '+48 hours'), 0, 0,
  0,
  datetime('now', '-3 days'), 'seed', datetime('now', '-3 days'), datetime('now')
),
-- ms-007: work_completed — general, routine
(
  'ms-007', 'kakamas-500mw', 'Kakamas 500MW Solar', 'K500-MS-007',
  'work_completed', 'Site signage and demarcation installation',
  'general', 'routine', 'Site perimeter and access roads',
  '2026-05-20', 1,
  0, 0, 0, 0, 0,
  'Install safety signage boards at all site entry points and hazard areas per Construction Regulations 2014 Reg.5(1)(k). Demarcate exclusion zones with barrier tape and tiger-tooth barricading.',
  0, 0, 0, 0, 0,
  336, datetime('now', '-200 hours'), 0, 0,
  0,
  datetime('now', '-15 days'), 'seed', datetime('now', '-15 days'), datetime('now')
),
-- ms-008: closed — civil, low_risk
(
  'ms-008', 'kakamas-500mw', 'Kakamas 500MW Solar', 'K500-MS-008',
  'closed', 'Site establishment and contractor laydown area preparation',
  'civil', 'low_risk', 'Site compound — North-east corner',
  '2026-04-01', 5,
  0, 0, 0, 0, 0,
  'Establish contractor laydown area including ablution facilities, storage containers, welfare facilities, and perimeter fencing. Install temporary access roads with 150mm compacted gravel base layer.',
  0, 0, 0, 0, 0,
  168, datetime('now', '-500 hours'), 0, 0,
  0,
  datetime('now', '-60 days'), 'seed', datetime('now', '-60 days'), datetime('now')
),
-- ms-009: rejected — electrical, high_risk, live_electrical, regulatory notification
--         SIGNATURE row: rejected MS on live electrical work triggers regulator
(
  'ms-009', 'kakamas-500mw', 'Kakamas 500MW Solar', 'K500-MS-009',
  'rejected', 'Live 33kV switchgear maintenance under energised conditions',
  'electrical', 'high_risk', 'Grid point of connection — 33kV switchroom',
  '2026-05-15', 1,
  0, 0, 1, 0, 0,
  'Proposed maintenance of 33kV VCB while energised. Rejected — this work MUST be performed under a de-energised and isolated PTW. Resubmit with full isolation methodology.',
  1, 1, 1, 0, 0,
  24, datetime('now', '-48 hours'), 1, 1,
  1,
  datetime('now', '-20 days'), 'seed', datetime('now', '-20 days'), datetime('now')
),
-- ms-010: superseded — mechanical, medium_risk (superseded by ms-011 after site conditions changed)
(
  'ms-010', 'kakamas-500mw', 'Kakamas 500MW Solar', 'K500-MS-010',
  'superseded', 'Transformer installation — original sequence',
  'mechanical', 'medium_risk', 'Main LV/MV transformer yard',
  '2026-05-10', 2,
  1, 0, 0, 0, 0,
  'Original transformer lifting and installation sequence using 50t mobile crane. Superseded after crane access route changed due to underground service conflict. See ms-011 for revised sequence.',
  0, 1, 0, 1, 0,
  72, datetime('now', '-400 hours'), 0, 0,
  0,
  datetime('now', '-30 days'), 'seed', datetime('now', '-30 days'), datetime('now')
),
-- ms-011: suspended — demolition, high_risk, heavy rain, is_reportable
(
  'ms-011', 'kakamas-500mw', 'Kakamas 500MW Solar', 'K500-MS-011',
  'suspended', 'Demolition of existing farm structures — Block D',
  'demolition', 'high_risk', 'Block D — Legacy farm buildings',
  '2026-05-28', 3,
  0, 0, 0, 0, 0,
  'Demolish existing legacy farm structures (3 × brick outbuildings) using hydraulic excavator. Asbestos clearance certificate required before commencement. Conduct HAZMAT survey and obtain DOL notification.',
  0, 1, 1, 0, 0,
  24, datetime('now', '-10 hours'), 0, 0,
  1,
  datetime('now', '-7 days'), 'seed', datetime('now', '-7 days'), datetime('now')
),
-- ms-012: archived — general, routine
(
  'ms-012', 'kakamas-500mw', 'Kakamas 500MW Solar', 'K500-MS-012',
  'archived', 'Project induction and toolbox talk programme setup',
  'general', 'routine', 'Site compound — Welfare area',
  '2026-03-15', 1,
  0, 0, 0, 0, 0,
  'Establish project safety induction programme for all site personnel. Create toolbox talk register, safety file structure, and incident reporting procedure. Issue all personnel with PPE and record in register.',
  0, 0, 0, 0, 0,
  336, datetime('now', '-2000 hours'), 0, 0,
  0,
  datetime('now', '-90 days'), 'seed', datetime('now', '-90 days'), datetime('now')
);

-- Update chain_status to 'active' for ms-006 (override the 'commissioned' typo in seed)
UPDATE oe_ipp_method_statements SET chain_status = 'active' WHERE id = 'ms-006';

-- Update superseded_by_ref for ms-010
UPDATE oe_ipp_method_statements SET superseded_by_ref = 'ms-011', revision_number = 1 WHERE id = 'ms-010';

-- Update suspension_reason for ms-011
UPDATE oe_ipp_method_statements SET suspension_reason = 'Heavy rain — site unsafe. Work suspended per Construction Regulations 2014 Reg.7(1)(c). Reinstate only when weather conditions improve and site safety officer confirms safe to proceed.' WHERE id = 'ms-011';

-- Update hazard_register for ms-003
UPDATE oe_ipp_method_statements SET hazard_register = 'Steel erection at 12m height — fall hazard. Controls: full-body harness + inertia reel lanyard + MEWP for elevated access. Load path analysis for all crane lifts. Exclusion zones marked with barrier tape. Emergency rescue plan in place.' WHERE id = 'ms-003';

-- Update toolbox_talk_notes for ms-005
UPDATE oe_ipp_method_statements SET toolbox_talk_notes = 'Briefed 8 workers 2026-05-01 08:00. Topics covered: cave-in hazards, shoring requirements, underground services, emergency extraction procedures. All workers signed attendance register.' WHERE id = 'ms-005';

-- Set state timestamps for ms-009 (rejected)
UPDATE oe_ipp_method_statements SET
  drafted_at = datetime('now', '-20 days'),
  reviewed_at = datetime('now', '-18 days'),
  risk_assessed_at = datetime('now', '-16 days'),
  rejected_at = datetime('now', '-14 days')
WHERE id = 'ms-009';

-- Set state timestamps for ms-010 (superseded)
UPDATE oe_ipp_method_statements SET
  drafted_at = datetime('now', '-30 days'),
  reviewed_at = datetime('now', '-28 days'),
  risk_assessed_at = datetime('now', '-26 days'),
  approved_at = datetime('now', '-24 days'),
  superseded_at = datetime('now', '-22 days')
WHERE id = 'ms-010';

-- Set state timestamps for ms-011 (suspended)
UPDATE oe_ipp_method_statements SET
  drafted_at = datetime('now', '-7 days'),
  reviewed_at = datetime('now', '-6 days'),
  risk_assessed_at = datetime('now', '-5 days'),
  approved_at = datetime('now', '-4 days'),
  toolbox_briefed_at = datetime('now', '-3 days'),
  active_at = datetime('now', '-2 days'),
  suspended_at = datetime('now', '-1 days')
WHERE id = 'ms-011';

-- Set state timestamps for ms-008 (closed)
UPDATE oe_ipp_method_statements SET
  drafted_at = datetime('now', '-60 days'),
  reviewed_at = datetime('now', '-58 days'),
  risk_assessed_at = datetime('now', '-57 days'),
  approved_at = datetime('now', '-56 days'),
  toolbox_briefed_at = datetime('now', '-55 days'),
  active_at = datetime('now', '-55 days'),
  work_completed_at = datetime('now', '-50 days'),
  closed_at = datetime('now', '-49 days')
WHERE id = 'ms-008';

-- Set state timestamps for ms-012 (archived)
UPDATE oe_ipp_method_statements SET
  drafted_at = datetime('now', '-90 days'),
  reviewed_at = datetime('now', '-88 days'),
  risk_assessed_at = datetime('now', '-87 days'),
  approved_at = datetime('now', '-86 days'),
  toolbox_briefed_at = datetime('now', '-85 days'),
  active_at = datetime('now', '-85 days'),
  work_completed_at = datetime('now', '-80 days'),
  closed_at = datetime('now', '-79 days'),
  archived_at = datetime('now', '-75 days')
WHERE id = 'ms-012';
