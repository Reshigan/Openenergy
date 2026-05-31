-- Wave 142 — IPP TQ seed data (12 rows covering all 12 chain states)

INSERT OR IGNORE INTO oe_ipp_tqs (
  id, project_id, project_name, tq_number, chain_status, tq_title,
  discipline, query_urgency, contractor_ref, query_description,
  drawing_ref, specification_ref,
  sla_target_hours, sla_deadline_at, raised_at, created_by, created_at, updated_at
) VALUES (
  'tq-001', 'kakamas-500mw', 'Kakamas 500MW Solar', 'K500-TQ-001', 'raised',
  'Foundation depth variation at column C4',
  'structural', 'construction_blocking', 'K500-CONT-TQ-001',
  'The geotechnical report recommendation specifies 1.8m foundation depth at column C4, however the structural drawing S-101 Rev B shows 1.5m. Please clarify which governs.',
  'S-101 Rev B', 'Spec Section 03300 Clause 4.2',
  48, datetime('now', '+48 hours'), datetime('now'), 'seed', datetime('now'), datetime('now')
);

INSERT OR IGNORE INTO oe_ipp_tqs (
  id, project_id, project_name, tq_number, chain_status, tq_title,
  discipline, query_urgency, contractor_ref, query_description,
  sla_target_hours, sla_deadline_at, raised_at, logged_at, created_by, created_at, updated_at
) VALUES (
  'tq-002', 'kakamas-500mw', 'Kakamas 500MW Solar', 'K500-TQ-002', 'logged',
  'MV cable routing conflict with civil drainage',
  'electrical', 'standard', 'K500-CONT-TQ-002',
  'The MV cable tray route shown on electrical drawing E-205 conflicts with drainage channel DC-07 on civil drawing C-110. Cable tray cannot be installed as shown. What is the preferred resolution?',
  168, datetime('now', '+168 hours'), datetime('now', '-1 day'), datetime('now'), 'seed', datetime('now'), datetime('now')
);

INSERT OR IGNORE INTO oe_ipp_tqs (
  id, project_id, project_name, tq_number, chain_status, tq_title,
  discipline, query_urgency, contractor_ref, query_description,
  assigned_designer, design_company, assigned_at,
  sla_target_hours, sla_deadline_at, raised_at, logged_at, allocated_at, created_by, created_at, updated_at
) VALUES (
  'tq-003', 'kakamas-500mw', 'Kakamas 500MW Solar', 'K500-TQ-003', 'allocated',
  'Pile cap reinforcement layout at transformer plinth',
  'civil', 'standard', 'K500-CONT-TQ-003',
  'Pile cap PC-T03 reinforcement layout drawing C-230 does not show the top mesh layer specified in the structural spec Section 03300 clause 5.1.2. Please confirm if top mesh is required.',
  'Jane Fourie', 'ARUP SA', datetime('now', '-6 hours'),
  168, datetime('now', '+162 hours'), datetime('now', '-2 days'), datetime('now', '-2 days'), datetime('now', '-1 day'), 'seed', datetime('now'), datetime('now')
);

INSERT OR IGNORE INTO oe_ipp_tqs (
  id, project_id, project_name, tq_number, chain_status, tq_title,
  discipline, query_urgency, contractor_ref, query_description,
  assigned_designer, design_company, assigned_at,
  sla_target_hours, sla_deadline_at, raised_at, logged_at, allocated_at, under_review_at, created_by, created_at, updated_at
) VALUES (
  'tq-004', 'kakamas-500mw', 'Kakamas 500MW Solar', 'K500-TQ-004', 'under_review',
  'Cooling air flow requirement for inverter room HVAC',
  'mechanical', 'standard', 'K500-CONT-TQ-004',
  'Inverter room HVAC spec calls for minimum 40 air changes per hour but the equipment schedule lists unit with 28 ACH capacity. Is the spec requirement achievable with the specified equipment?',
  'Themba Nkosi', 'WSP Africa', datetime('now', '-2 days'),
  168, datetime('now', '+48 hours'), datetime('now', '-5 days'), datetime('now', '-5 days'), datetime('now', '-4 days'), datetime('now', '-3 days'), 'seed', datetime('now'), datetime('now')
);

INSERT OR IGNORE INTO oe_ipp_tqs (
  id, project_id, project_name, tq_number, chain_status, tq_title,
  discipline, query_urgency, contractor_ref, query_description,
  assigned_designer, design_company, assigned_at,
  response_description, response_type,
  sla_target_hours, sla_deadline_at, raised_at, logged_at, allocated_at, under_review_at, response_drafted_at, created_by, created_at, updated_at
) VALUES (
  'tq-005', 'kakamas-500mw', 'Kakamas 500MW Solar', 'K500-TQ-005', 'response_drafted',
  'Foundation depth at column C4 — geotech vs structural',
  'structural', 'construction_blocking', 'K500-CONT-TQ-005',
  'As per geotech report recommendation ref GR-001 para 4.3.2, what depth should foundation be constructed?',
  'Sipho Dlamini', 'Zutari SA', datetime('now', '-3 days'),
  'Foundation depth to be maintained at 1.8m per geotech report recommendation GR-001 para 4.3.2. Drawing S-101 Rev B contains a drafting error and will be updated via DCC. Contractor to proceed with 1.8m depth as per geotech recommendation.', 'clarification',
  48, datetime('now', '+24 hours'), datetime('now', '-6 days'), datetime('now', '-6 days'), datetime('now', '-5 days'), datetime('now', '-4 days'), datetime('now', '-1 day'), 'seed', datetime('now'), datetime('now')
);

INSERT OR IGNORE INTO oe_ipp_tqs (
  id, project_id, project_name, tq_number, chain_status, tq_title,
  discipline, query_urgency, contractor_ref, query_description,
  assigned_designer, design_company, assigned_at,
  response_description, response_type,
  floor_structural_safety,
  sla_target_hours, sla_deadline_at, is_reportable,
  raised_at, logged_at, allocated_at, under_review_at, response_drafted_at, response_approved_at, created_by, created_at, updated_at
) VALUES (
  'tq-006', 'kakamas-500mw', 'Kakamas 500MW Solar', 'K500-TQ-006', 'response_approved',
  'Lightning protection earth grid bonding method',
  'electrical', 'safety_critical', 'K500-CONT-TQ-006',
  'The lightning protection spec requires copper tape earth ring bonding to all structural steel columns. Access constraints mean copper tape routing as shown is not achievable. Contractor proposes exothermic welded bonds on accessible flanges instead.',
  'Marco van Wyk', 'Aurecon SA', datetime('now', '-4 days'),
  'The proposed exothermic welded bond method on accessible flanges is ACCEPTED as equivalent to copper tape where tape routing is obstructed. Welds must meet IEC 62305-3:2010 clause 5.6. IE to witness minimum 5% of welds.', 'accept_proposed',
  1,
  24, datetime('now', '+8 hours'), 1,
  datetime('now', '-8 days'), datetime('now', '-8 days'), datetime('now', '-7 days'), datetime('now', '-6 days'), datetime('now', '-3 days'), datetime('now', '-1 day'), 'seed', datetime('now'), datetime('now')
);

INSERT OR IGNORE INTO oe_ipp_tqs (
  id, project_id, project_name, tq_number, chain_status, tq_title,
  discipline, query_urgency, contractor_ref, query_description,
  assigned_designer, design_company, assigned_at,
  response_description, response_type,
  sla_target_hours, sla_deadline_at,
  raised_at, logged_at, allocated_at, under_review_at, response_drafted_at, response_approved_at, response_issued_at, created_by, created_at, updated_at
) VALUES (
  'tq-007', 'kakamas-500mw', 'Kakamas 500MW Solar', 'K500-TQ-007', 'response_issued',
  'Concrete mix design for blinding layer',
  'civil', 'standard', 'K500-CONT-TQ-007',
  'The contractor proposes to use C10/15 lean mix concrete for blinding layer beneath pile caps in lieu of C15/20 specified in clause 3.2.1. This saves 3 days on material lead time. Please advise.',
  'Priya Naidoo', 'BVi Consulting', datetime('now', '-6 days'),
  'Contractor proposed substitution of C10/15 for blinding layer is ACCEPTED. Blinding layer is non-structural; the strength reduction does not affect pile cap performance. Specification will be updated via addendum.', 'accept_proposed',
  168, datetime('now', '-2 days'),
  datetime('now', '-10 days'), datetime('now', '-10 days'), datetime('now', '-9 days'), datetime('now', '-8 days'), datetime('now', '-5 days'), datetime('now', '-4 days'), datetime('now', '-2 days'), 'seed', datetime('now'), datetime('now')
);

INSERT OR IGNORE INTO oe_ipp_tqs (
  id, project_id, project_name, tq_number, chain_status, tq_title,
  discipline, query_urgency, contractor_ref, query_description,
  assigned_designer, design_company, assigned_at,
  response_description, response_type,
  sla_target_hours, sla_deadline_at,
  raised_at, logged_at, allocated_at, under_review_at, response_drafted_at, response_approved_at, response_issued_at, acknowledged_at, created_by, created_at, updated_at
) VALUES (
  'tq-008', 'kakamas-500mw', 'Kakamas 500MW Solar', 'K500-TQ-008', 'acknowledged',
  'HART protocol compatibility for flow transmitters',
  'instrumentation', 'standard', 'K500-CONT-TQ-008',
  'The instrumentation spec requires HART 7 protocol for all flow transmitters however the specified vendor model FT-3000A supports only HART 5. Contractor proposes alternative FT-3200B with HART 7. Please confirm acceptability.',
  'Adele Botha', 'SRK Consulting', datetime('now', '-8 days'),
  'Alternative FT-3200B with HART 7 is approved as equal substitute. Substitution log to be updated. No further action required from contractor.', 'accept_proposed',
  168, datetime('now', '-5 days'),
  datetime('now', '-12 days'), datetime('now', '-12 days'), datetime('now', '-11 days'), datetime('now', '-10 days'), datetime('now', '-7 days'), datetime('now', '-6 days'), datetime('now', '-4 days'), datetime('now', '-1 day'), 'seed', datetime('now'), datetime('now')
);

INSERT OR IGNORE INTO oe_ipp_tqs (
  id, project_id, project_name, tq_number, chain_status, tq_title,
  discipline, query_urgency, contractor_ref, query_description,
  assigned_designer, design_company, assigned_at,
  response_description, response_type,
  sla_target_hours, sla_deadline_at,
  raised_at, logged_at, allocated_at, under_review_at, response_drafted_at, response_approved_at, response_issued_at, acknowledged_at, closed_at, created_by, created_at, updated_at
) VALUES (
  'tq-009', 'kakamas-500mw', 'Kakamas 500MW Solar', 'K500-TQ-009', 'closed',
  'GRP cable duct installation depth below road crossings',
  'civil', 'information_only', 'K500-CONT-TQ-009',
  'What is the minimum burial depth for GRP cable ducts beneath the site access road? Spec clause 12.4 specifies 600mm but local municipality requires 750mm. Which requirement governs?',
  'Liam Erasmus', 'Zutari SA', datetime('now', '-15 days'),
  'The more stringent municipality requirement of 750mm governs per the contract hierarchy (local authority requirements take precedence). Site access road crossings to be installed at 750mm minimum depth. Spec clause 12.4 reference noted for addendum.', 'clarification',
  336, datetime('now', '-10 days'),
  datetime('now', '-18 days'), datetime('now', '-18 days'), datetime('now', '-17 days'), datetime('now', '-16 days'), datetime('now', '-13 days'), datetime('now', '-12 days'), datetime('now', '-10 days'), datetime('now', '-7 days'), datetime('now', '-3 days'), 'seed', datetime('now'), datetime('now')
);

INSERT OR IGNORE INTO oe_ipp_tqs (
  id, project_id, project_name, tq_number, chain_status, tq_title,
  discipline, query_urgency, contractor_ref, query_description,
  assigned_designer, design_company, assigned_at,
  rejection_reason, response_type,
  sla_target_hours, sla_deadline_at,
  raised_at, logged_at, allocated_at, under_review_at, rejected_at, created_by, created_at, updated_at
) VALUES (
  'tq-010', 'kakamas-500mw', 'Kakamas 500MW Solar', 'K500-TQ-010', 'rejected',
  'Process water treatment chemical dosing sequence',
  'process', 'standard', 'K500-CONT-TQ-010',
  'Please confirm the recommended sequence for chemical dosing in the panel cleaning water treatment system. Spec clause 7.3 appears ambiguous.',
  'Andre Janse van Rensburg', 'Hatch Africa', datetime('now', '-5 days'),
  'Query already addressed in specification clause 7.3.2 which clearly defines the dosing sequence as: pH adjustment → coagulant → flocculant → chlorination. No design clarification required. Contractor to re-read specification.', 'reject_proposed',
  168, datetime('now', '+24 hours'),
  datetime('now', '-7 days'), datetime('now', '-7 days'), datetime('now', '-6 days'), datetime('now', '-5 days'), datetime('now', '-2 days'), 'seed', datetime('now'), datetime('now')
);

INSERT OR IGNORE INTO oe_ipp_tqs (
  id, project_id, project_name, tq_number, chain_status, tq_title,
  discipline, query_urgency, contractor_ref, query_description,
  assigned_designer, design_company, assigned_at,
  response_description, response_type, design_change_ref,
  floor_structural_safety, floor_ie_notification_required,
  sla_target_hours, sla_deadline_at, is_reportable,
  raised_at, logged_at, allocated_at, under_review_at, response_drafted_at, design_change_required_at, created_by, created_at, updated_at
) VALUES (
  'tq-011', 'kakamas-500mw', 'Kakamas 500MW Solar', 'K500-TQ-011', 'design_change_required',
  'Portal frame eave height conflict with module string layout',
  'structural', 'construction_blocking', 'K500-CONT-TQ-011',
  'The portal frame eave height as specified in structural drawing S-005 Rev A (7.2m) results in shading of the front row of PV modules on string S-07 to S-12 for approximately 45 minutes after sunrise during winter solstice. This will reduce energy yield below the contractual P50 guarantee. A structural redesign is required.',
  'Kobus Steyn', 'Aurecon SA', datetime('now', '-3 days'),
  'Confirmed: eave height reduction to 6.8m required to eliminate shading on string S-07 to S-12. This requires a structural redesign of portal frames in column line D. Full design change package DCN-K500-014 to be issued within 5 working days.', 'design_change_required',
  'DCN-K500-014',
  1, 1,
  48, datetime('now', '+12 hours'), 1,
  datetime('now', '-6 days'), datetime('now', '-6 days'), datetime('now', '-5 days'), datetime('now', '-4 days'), datetime('now', '-2 days'), datetime('now', '-1 day'), 'seed', datetime('now'), datetime('now')
);

INSERT OR IGNORE INTO oe_ipp_tqs (
  id, project_id, project_name, tq_number, chain_status, tq_title,
  discipline, query_urgency, contractor_ref, query_description,
  assigned_designer, design_company, assigned_at,
  escalation_reason, escalation_notes,
  floor_ie_notification_required,
  sla_target_hours, sla_deadline_at, is_reportable,
  raised_at, logged_at, allocated_at, under_review_at, escalated_at, created_by, created_at, updated_at
) VALUES (
  'tq-012', 'kakamas-500mw', 'Kakamas 500MW Solar', 'K500-TQ-012', 'escalated',
  'Conflicting requirements: geotech report vs structural drawings for piling spec',
  'structural', 'construction_blocking', 'K500-CONT-TQ-012',
  'The geotechnical investigation report GR-001 specifies a minimum pile diameter of 600mm for Class C3 reactive soil conditions identified in borehole BH-12 to BH-18. However structural drawing S-110 Rev C specifies 450mm piles in the same area. Contractor cannot proceed without written confirmation of the correct pile specification.',
  'Sipho Dlamini', 'Zutari SA', datetime('now', '-4 days'),
  'Conflicting requirements between geotechnical report and structural drawings. Designer has not provided a response within the 48h construction-blocking window. Escalated to design lead and IE for urgent resolution.',
  'Escalation raised due to non-response on construction-blocking query. Piling works on gridlines D-E are suspended pending resolution. Impact: 4 days programme delay if not resolved within 24h.',
  1,
  48, datetime('now', '-12 hours'), 1,
  datetime('now', '-4 days'), datetime('now', '-4 days'), datetime('now', '-3 days'), datetime('now', '-3 days'), datetime('now', '-1 day'), 'seed', datetime('now'), datetime('now')
);
