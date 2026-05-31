-- Wave 135 — IPP Lessons Learned Register seed data
-- 12 rows covering all 12 chain states.

INSERT OR IGNORE INTO oe_ipp_lessons_learned (
  id, project_id, project_name, lesson_title, chain_status,
  lesson_type, lesson_category, lesson_phase, impact_tier, rca_method,
  description, root_cause, impact_summary, recommendation,
  cost_impact_zar, schedule_impact_days,
  floor_safety_critical, floor_regulatory_change, floor_contractual_impact,
  floor_design_change, floor_portfolio_impact,
  prevents_fatality, sla_target_hours, sla_deadline_at,
  is_reportable,
  captured_at, created_by, created_at, updated_at
) VALUES
-- lrn-001: captured
(
  'lrn-001', 'kakamas-500mw', 'Kakamas 500MW Solar', 'SCADA integration commissioning delay',
  'captured',
  'negative', 'technical', 'commissioning', 'high_impact', 'none',
  'SCADA integration with grid operator systems took 6 weeks longer than planned due to interface specification changes late in commissioning phase.',
  NULL, NULL, NULL,
  NULL, NULL,
  0, 0, 0, 0, 0,
  0, 480, datetime('now', '+20 days'),
  0,
  datetime('now'), 'system', datetime('now'), datetime('now')
),
-- lrn-002: categorized
(
  'lrn-002', 'kakamas-500mw', 'Kakamas 500MW Solar', 'Permitting delays from inconsistent NEMA application format',
  'categorized',
  'negative', 'schedule', 'permitting', 'medium_impact', 'none',
  'NEMA environmental authorisation application was returned twice due to format inconsistencies with DEA regional office requirements.',
  NULL, NULL, NULL,
  NULL, NULL,
  0, 0, 0, 0, 0,
  0, 336, datetime('now', '+14 days'),
  0,
  datetime('now', '-2 days'), 'system', datetime('now', '-2 days'), datetime('now', '-1 day')
),
-- lrn-003: root_cause_analyzed
(
  'lrn-003', 'kakamas-500mw', 'Kakamas 500MW Solar', 'Main transformer procurement lead-time underestimation',
  'root_cause_analyzed',
  'negative', 'procurement', 'procurement', 'high_impact', 'five_whys',
  'Main power transformer procurement took 18 months vs 12 months planned, caused by global supply chain disruption and inadequate early procurement trigger.',
  '5 Whys: (1) Transformer arrived late → (2) Order placed too late in project timeline → (3) Early procurement policy not enforced → (4) No trigger linked to financial close milestone → (5) Procurement schedule not integrated into project P6 schedule.',
  'Schedule delay 6 months, cost overrun ZAR 1.2M for acceleration measures.',
  'Implement mandatory early-procurement trigger at DG2 stage gate for long-lead items.',
  -1200000, -45,
  0, 0, 0, 1, 1,
  0, 480, datetime('now', '+20 days'),
  0,
  datetime('now', '-5 days'), 'system', datetime('now', '-5 days'), datetime('now', '-1 day')
),
-- lrn-004: impact_assessed
(
  'lrn-004', 'kakamas-500mw', 'Kakamas 500MW Solar', 'Grid connection cost estimate shortfall',
  'impact_assessed',
  'negative', 'cost', 'development', 'high_impact', 'fishbone',
  'Grid connection cost came in ZAR 2.5M over budget due to Eskom requesting additional substation upgrades not in scope of initial cost estimate.',
  'Fishbone: Eskom scope change driven by new Grid Code requirements published after financial model lock-in date.',
  'ZAR 2.5M cost overrun, 21-day schedule delay for re-negotiation.',
  'Include grid connection cost contingency of 25% in financial model; request updated scope from Eskom at DG3.',
  -2500000, -21,
  0, 1, 1, 0, 0,
  0, 480, datetime('now', '+20 days'),
  0,
  datetime('now', '-8 days'), 'system', datetime('now', '-8 days'), datetime('now', '-2 days')
),
-- lrn-005: recommendation_drafted
(
  'lrn-005', 'kakamas-500mw', 'Kakamas 500MW Solar', 'Value engineering opportunity on mounting structure',
  'recommendation_drafted',
  'positive', 'cost', 'construction', 'medium_impact', 'none',
  'Alternative mounting structure design reduced BoS costs by ZAR 800K through reduced steel tonnage and faster installation.',
  NULL,
  'ZAR 800K saving, 5 days schedule improvement.',
  'Mandate early value engineering workshop at DG2 for civil and structural BoS components.',
  800000, 5,
  0, 0, 0, 1, 0,
  0, 336, datetime('now', '+14 days'),
  0,
  datetime('now', '-10 days'), 'system', datetime('now', '-10 days'), datetime('now', '-3 days')
),
-- lrn-006: peer_reviewed
(
  'lrn-006', 'kakamas-500mw', 'Kakamas 500MW Solar', 'ITP non-conformance resolution delays',
  'peer_reviewed',
  'negative', 'quality', 'construction', 'medium_impact', 'timeline_analysis',
  'ITP non-conformance reports took average 12 days to resolve vs 5 days target, due to unclear escalation path to EPC contractor.',
  'Timeline analysis showed delays concentrated at contractor review stage with no contractual time obligation.',
  'Approximately 30 days cumulative delay attributable to NCR resolution backlog.',
  'Include contractual NCR response SLAs in EPC contract; integrate NCR status into weekly progress report.',
  NULL, -10,
  0, 0, 1, 0, 0,
  0, 336, datetime('now', '+14 days'),
  0,
  datetime('now', '-12 days'), 'system', datetime('now', '-12 days'), datetime('now', '-4 days')
),
-- lrn-007: approved
(
  'lrn-007', 'kakamas-500mw', 'Kakamas 500MW Solar', 'NERSA licence condition interpretation ambiguity',
  'approved',
  'negative', 'regulatory', 'development', 'medium_impact', 'five_whys',
  'Ambiguity in NERSA generation licence condition 14(c) resulted in 45-day delay while NERSA provided written clarification.',
  '5 Whys: Condition wording inherited from 2012 era template not updated for hybrid projects.',
  '45-day delay in achieving certain milestone payments.',
  'Request pre-application meeting with NERSA to clarify licence condition interpretation for hybrid/storage configurations.',
  NULL, -45,
  0, 1, 0, 0, 1,
  0, 336, datetime('now', '+14 days'),
  0,
  datetime('now', '-15 days'), 'system', datetime('now', '-15 days'), datetime('now', '-5 days')
),
-- lrn-008: disseminated — SIGNATURE row
(
  'lrn-008', 'kakamas-500mw', 'Kakamas 500MW Solar', 'Fatal exclusion zone violation — crane operations near live busbars',
  'disseminated',
  'safety', 'safety', 'construction', 'critical_impact', 'fault_tree',
  'Crane operator entered live busbar exclusion zone during cable pulling operation. Near-miss with fatal potential. Immediate stop-work issued.',
  'Fault tree analysis: Inadequate permit-to-work integration with crane lift plan; exclusion zones not marked on lifting drawings.',
  'Near-miss. No injury. 3-day work stoppage for investigation.',
  'Mandatory integration of PTW exclusion zones into all crane lift plans; dual sign-off by lift supervisor and safety officer.',
  NULL, -3,
  1, 0, 0, 1, 1,
  1, 720, datetime('now', '-2 days'),
  1,
  datetime('now', '-20 days'), 'system', datetime('now', '-20 days'), datetime('now', '-5 days')
),
-- lrn-009: applied
(
  'lrn-009', 'kakamas-500mw', 'Kakamas 500MW Solar', 'Community liaison officer model improved public participation outcomes',
  'applied',
  'positive', 'stakeholder', 'development', 'medium_impact', 'none',
  'Appointing a dedicated community liaison officer from the local community improved public participation attendance by 60% and reduced objections.',
  NULL,
  'Smoother EIA process, reduced objection period by 30 days, improved ED compliance.',
  'Include CLO appointment as standard practice in project execution plan from inception.',
  NULL, 30,
  0, 0, 0, 0, 1,
  0, 336, datetime('now', '+20 days'),
  0,
  datetime('now', '-25 days'), 'system', datetime('now', '-25 days'), datetime('now', '-7 days')
),
-- lrn-010: archived
(
  'lrn-010', 'kakamas-500mw', 'Kakamas 500MW Solar', 'Bifacial module rear-irradiance modelling gap',
  'archived',
  'positive', 'technical', 'development', 'low_impact', 'none',
  'Standard PVsyst model underestimated bifacial gain by 3.2% due to albedo assumptions. Revised modelling using site-measured albedo improved yield forecast accuracy.',
  NULL,
  'ZAR 400K improvement in P50 revenue forecast accuracy.',
  'Use site-measured albedo for bifacial gain modelling; run sensitivity on ±0.1 albedo range.',
  400000, 0,
  0, 0, 0, 0, 1,
  0, 168, datetime('now', '-10 days'),
  0,
  datetime('now', '-40 days'), 'system', datetime('now', '-40 days'), datetime('now', '-10 days')
),
-- lrn-011: rejected
(
  'lrn-011', 'kakamas-500mw', 'Kakamas 500MW Solar', 'Proposed alternative inverter brand cost saving',
  'rejected',
  'negative', 'technical', 'procurement', 'low_impact', 'none',
  'Proposed substitution of approved inverter brand with cheaper alternative. Rejected by lender IE as non-bankable technology.',
  NULL,
  'No cost saving achieved. 2-week delay in procurement approval.',
  NULL,
  NULL, -14,
  0, 0, 0, 0, 0,
  0, 168, datetime('now', '-5 days'),
  0,
  datetime('now', '-18 days'), 'system', datetime('now', '-18 days'), datetime('now', '-8 days')
),
-- lrn-012: deferred
(
  'lrn-012', 'kakamas-500mw', 'Kakamas 500MW Solar', 'PPA change-in-law clause triggered by carbon tax increase',
  'deferred',
  'negative', 'contractual', 'operations', 'high_impact', 'none',
  'Carbon tax rate increase triggered change-in-law clause in PPA. Process for quantifying and claiming relief took 8 months due to unclear calculation methodology.',
  NULL,
  'Revenue impact during 8-month resolution period. Legal costs ZAR 350K.',
  'Define calculation methodology for carbon tax pass-through in PPA drafting; include worked example in annexure.',
  -350000, NULL,
  0, 1, 1, 0, 1,
  0, 480, datetime('now', '+30 days'),
  0,
  datetime('now', '-3 days'), 'system', datetime('now', '-3 days'), datetime('now', '-1 day')
);
