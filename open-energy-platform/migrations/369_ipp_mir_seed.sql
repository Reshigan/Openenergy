-- Wave 139 — IPP Material Inspection Record seed data
-- 12 rows covering all 12 chain states

INSERT OR IGNORE INTO oe_ipp_mirs (
  id, project_id, project_name, mir_number, chain_status,
  material_description, material_category, material_tier,
  supplier_name, manufacturer, quantity, quantity_unit,
  po_reference, floor_nersa_material,
  sla_target_hours, sla_deadline_at,
  sla_breached, sla_breach_count, is_reportable,
  delivery_notified_at, created_by, created_at, updated_at
) VALUES (
  'mir-001', 'kakamas-500mw', 'Kakamas 500MW Solar', 'K500-MIR-001', 'delivery_notified',
  '33kV Power Transformer 40MVA', 'transformer', 'electrical_mechanical',
  'Actom', 'Actom Transformers', 1, 'units',
  'PO-K500-2026-041', 1,
  48, datetime('now', '+48 hours'),
  0, 0, 0,
  datetime('now'), 'seed', datetime('now'), datetime('now')
);

INSERT OR IGNORE INTO oe_ipp_mirs (
  id, project_id, project_name, mir_number, chain_status,
  material_description, material_category, material_tier,
  supplier_name, quantity, quantity_unit,
  po_reference,
  sla_target_hours, sla_deadline_at,
  sla_breached, sla_breach_count, is_reportable,
  delivery_notified_at, delivered_at, actual_delivery_date,
  created_by, created_at, updated_at
) VALUES (
  'mir-002', 'kakamas-500mw', 'Kakamas 500MW Solar', 'K500-MIR-002', 'delivered',
  'Universal Column UC305x305x97 Structural Steel', 'structural_steel', 'critical_structural',
  'Macsteel SA', 45.2, 'tons',
  'PO-K500-2026-042',
  24, datetime('now', '+24 hours'),
  0, 0, 0,
  datetime('now', '-2 hours'), datetime('now'), '2026-05-31',
  'seed', datetime('now'), datetime('now')
);

INSERT OR IGNORE INTO oe_ipp_mirs (
  id, project_id, project_name, mir_number, chain_status,
  material_description, material_category, material_tier,
  supplier_name, manufacturer, quantity, quantity_unit,
  po_reference, inspection_type, inspector_name,
  sla_target_hours, sla_deadline_at,
  sla_breached, sla_breach_count, is_reportable,
  delivery_notified_at, delivered_at, initial_inspection_at,
  created_by, created_at, updated_at
) VALUES (
  'mir-003', 'kakamas-500mw', 'Kakamas 500MW Solar', 'K500-MIR-003', 'initial_inspection',
  'Bifacial Solar Panels 550W', 'solar_panel', 'electrical_mechanical',
  'JA Solar SA', 'JA Solar', 1200, 'units',
  'PO-K500-2026-043', 'visual', 'Thabo Mokoena',
  48, datetime('now', '+36 hours'),
  0, 0, 0,
  datetime('now', '-4 hours'), datetime('now', '-3 hours'), datetime('now'),
  'seed', datetime('now'), datetime('now')
);

INSERT OR IGNORE INTO oe_ipp_mirs (
  id, project_id, project_name, mir_number, chain_status,
  material_description, material_category, material_tier,
  supplier_name, quantity, quantity_unit,
  po_reference, inspection_type, inspector_name,
  floor_ie_witnessed,
  sla_target_hours, sla_deadline_at,
  sla_breached, sla_breach_count, is_reportable,
  delivery_notified_at, delivered_at, initial_inspection_at, detailed_inspection_at,
  created_by, created_at, updated_at
) VALUES (
  'mir-004', 'kakamas-500mw', 'Kakamas 500MW Solar', 'K500-MIR-004', 'detailed_inspection',
  '11kV XLPE Insulated Cable 240mm²', 'electrical_cable', 'electrical_mechanical',
  'Aberdare Cables', 2400, 'm',
  'PO-K500-2026-044', 'dimensional', 'Sipho Dlamini',
  1,
  48, datetime('now', '+20 hours'),
  0, 0, 0,
  datetime('now', '-6 hours'), datetime('now', '-5 hours'), datetime('now', '-4 hours'), datetime('now'),
  'seed', datetime('now'), datetime('now')
);

INSERT OR IGNORE INTO oe_ipp_mirs (
  id, project_id, project_name, mir_number, chain_status,
  material_description, material_category, material_tier,
  supplier_name, quantity, quantity_unit,
  po_reference, inspection_type,
  test_required, lab_name, lab_sample_ref,
  sla_target_hours, sla_deadline_at,
  sla_breached, sla_breach_count, is_reportable,
  delivery_notified_at, delivered_at, initial_inspection_at, detailed_inspection_at, test_sampling_at,
  created_by, created_at, updated_at
) VALUES (
  'mir-005', 'kakamas-500mw', 'Kakamas 500MW Solar', 'K500-MIR-005', 'test_sampling',
  'Ready-Mix Concrete 40MPa C40/50', 'concrete', 'critical_structural',
  'Lafarge SA', 120, 'm³',
  'PO-K500-2026-045', 'laboratory',
  1, 'Interlaboratory SA', 'ILAB-2026-0531-001',
  24, datetime('now', '+18 hours'),
  0, 0, 0,
  datetime('now', '-8 hours'), datetime('now', '-7 hours'), datetime('now', '-6 hours'), datetime('now', '-5 hours'), datetime('now'),
  'seed', datetime('now'), datetime('now')
);

INSERT OR IGNORE INTO oe_ipp_mirs (
  id, project_id, project_name, mir_number, chain_status,
  material_description, material_category, material_tier,
  supplier_name, quantity, quantity_unit,
  po_reference,
  test_required, lab_name, lab_sample_ref,
  sla_target_hours, sla_deadline_at,
  sla_breached, sla_breach_count, is_reportable,
  delivery_notified_at, delivered_at, initial_inspection_at, detailed_inspection_at, test_sampling_at, results_pending_at,
  created_by, created_at, updated_at
) VALUES (
  'mir-006', 'kakamas-500mw', 'Kakamas 500MW Solar', 'K500-MIR-006', 'results_pending',
  'G2 Crushed Stone Roadbase', 'civil_materials', 'civil',
  'Buildmax SA', 500, 'tons',
  'PO-K500-2026-046',
  1, 'SGS SA Laboratories', 'SGS-2026-0530-087',
  96, datetime('now', '+48 hours'),
  0, 0, 0,
  datetime('now', '-12 hours'), datetime('now', '-11 hours'), datetime('now', '-10 hours'), datetime('now', '-9 hours'), datetime('now', '-8 hours'), datetime('now'),
  'seed', datetime('now'), datetime('now')
);

INSERT OR IGNORE INTO oe_ipp_mirs (
  id, project_id, project_name, mir_number, chain_status,
  material_description, material_category, material_tier,
  supplier_name, manufacturer, quantity, quantity_unit,
  po_reference, inspection_type, inspector_name,
  dimensional_check_passed, quantity_check_passed, documentation_check_passed, visual_check_passed,
  sla_target_hours, sla_deadline_at,
  sla_breached, sla_breach_count, is_reportable,
  delivery_notified_at, delivered_at, initial_inspection_at, detailed_inspection_at, approved_at,
  created_by, created_at, updated_at
) VALUES (
  'mir-007', 'kakamas-500mw', 'Kakamas 500MW Solar', 'K500-MIR-007', 'approved',
  'String Inverter 100kW', 'inverter', 'electrical_mechanical',
  'SMA Solar Technology', 'SMA Solar', 40, 'units',
  'PO-K500-2026-047', 'combined', 'Nomsa Khumalo',
  1, 1, 1, 1,
  48, datetime('now', '+72 hours'),
  0, 0, 0,
  datetime('now', '-24 hours'), datetime('now', '-23 hours'), datetime('now', '-22 hours'), datetime('now', '-21 hours'), datetime('now'),
  'seed', datetime('now'), datetime('now')
);

INSERT OR IGNORE INTO oe_ipp_mirs (
  id, project_id, project_name, mir_number, chain_status,
  material_description, material_category, material_tier,
  supplier_name, quantity, quantity_unit,
  po_reference,
  conditional_notes,
  floor_lender_hold_point,
  sla_target_hours, sla_deadline_at,
  sla_breached, sla_breach_count, is_reportable,
  delivery_notified_at, delivered_at, initial_inspection_at, detailed_inspection_at, conditional_approval_at,
  created_by, created_at, updated_at
) VALUES (
  'mir-008', 'kakamas-500mw', 'Kakamas 500MW Solar', 'K500-MIR-008', 'conditional_approval',
  'Galvanised Anchor Bolts M24x600mm', 'civil_materials', 'critical_structural',
  'Stewarts & Lloyds', 320, 'units',
  'PO-K500-2026-048',
  'Minor surface rust on anchor bolts — apply cold zinc primer within 7 days before installation',
  1,
  24, datetime('now', '+60 hours'),
  0, 0, 0,
  datetime('now', '-30 hours'), datetime('now', '-29 hours'), datetime('now', '-28 hours'), datetime('now', '-27 hours'), datetime('now'),
  'seed', datetime('now'), datetime('now')
);

INSERT OR IGNORE INTO oe_ipp_mirs (
  id, project_id, project_name, mir_number, chain_status,
  material_description, material_category, material_tier,
  supplier_name, manufacturer, quantity, quantity_unit,
  po_reference,
  incorporated_to, incorporated_by,
  dimensional_check_passed, quantity_check_passed, documentation_check_passed, visual_check_passed,
  sla_target_hours, sla_deadline_at,
  sla_breached, sla_breach_count, is_reportable,
  delivery_notified_at, delivered_at, initial_inspection_at, detailed_inspection_at, approved_at, incorporated_at,
  created_by, created_at, updated_at
) VALUES (
  'mir-009', 'kakamas-500mw', 'Kakamas 500MW Solar', 'K500-MIR-009', 'incorporated',
  'Bifacial Solar Panels 550W (Batch 2)', 'solar_panel', 'electrical_mechanical',
  'JA Solar SA', 'JA Solar', 800, 'units',
  'PO-K500-2026-049',
  'Array block A1-A20', 'EPC subcontractor Solar Tech SA',
  1, 1, 1, 1,
  48, datetime('now', '+120 hours'),
  0, 0, 0,
  datetime('now', '-48 hours'), datetime('now', '-47 hours'), datetime('now', '-46 hours'), datetime('now', '-45 hours'), datetime('now', '-44 hours'), datetime('now'),
  'seed', datetime('now'), datetime('now')
);

INSERT OR IGNORE INTO oe_ipp_mirs (
  id, project_id, project_name, mir_number, chain_status,
  material_description, material_category, material_tier,
  supplier_name, quantity, quantity_unit,
  po_reference, inspection_type, inspector_name,
  rejection_reason,
  floor_ie_witnessed,
  dimensional_check_passed, quantity_check_passed, documentation_check_passed, visual_check_passed,
  sla_target_hours, sla_deadline_at,
  sla_breached, sla_breach_count, is_reportable,
  delivery_notified_at, delivered_at, initial_inspection_at, detailed_inspection_at, rejected_on_site_at,
  created_by, created_at, updated_at
) VALUES (
  'mir-010', 'kakamas-500mw', 'Kakamas 500MW Solar', 'K500-MIR-010', 'rejected_on_site',
  'Base Plate 500x500mm Structural Steel', 'structural_steel', 'critical_structural',
  'Macsteel SA', 48, 'units',
  'PO-K500-2026-050', 'dimensional', 'Heinrich van der Berg',
  'Dimensional non-conformance — column base plates 12mm thickness not 16mm as specified in drawing K500-ST-001 Rev 3',
  1,
  0, 1, 1, 1,
  24, datetime('now', '-2 hours'),
  1, 1, 1,
  datetime('now', '-36 hours'), datetime('now', '-35 hours'), datetime('now', '-34 hours'), datetime('now', '-33 hours'), datetime('now', '-2 hours'),
  'seed', datetime('now'), datetime('now')
);

INSERT OR IGNORE INTO oe_ipp_mirs (
  id, project_id, project_name, mir_number, chain_status,
  material_description, material_category, material_tier,
  supplier_name, quantity, quantity_unit,
  po_reference,
  quarantine_reason,
  floor_critical_safety,
  sla_target_hours, sla_deadline_at,
  sla_breached, sla_breach_count, is_reportable,
  delivery_notified_at, delivered_at, initial_inspection_at, quarantined_at,
  created_by, created_at, updated_at
) VALUES (
  'mir-011', 'kakamas-500mw', 'Kakamas 500MW Solar', 'K500-MIR-011', 'quarantined',
  'Fire Suppression System Cylinders FM-200', 'mechanical', 'critical_structural',
  'Fike SA', 12, 'units',
  'PO-K500-2026-051',
  'Suspected counterfeit certificates — SABS type test certificates cannot be verified with manufacturer; quarantine pending independent verification',
  1,
  24, datetime('now', '-4 hours'),
  1, 1, 1,
  datetime('now', '-20 hours'), datetime('now', '-19 hours'), datetime('now', '-18 hours'), datetime('now', '-4 hours'),
  'seed', datetime('now'), datetime('now')
);

INSERT OR IGNORE INTO oe_ipp_mirs (
  id, project_id, project_name, mir_number, chain_status,
  material_description, material_category, material_tier,
  supplier_name, quantity, quantity_unit,
  po_reference,
  rejection_reason,
  sla_target_hours, sla_deadline_at,
  sla_breached, sla_breach_count, is_reportable,
  delivery_notified_at, delivered_at, initial_inspection_at, detailed_inspection_at, rejected_on_site_at, returned_to_supplier_at,
  created_by, created_at, updated_at
) VALUES (
  'mir-012', 'kakamas-500mw', 'Kakamas 500MW Solar', 'K500-MIR-012', 'returned_to_supplier',
  'Rectangular Hollow Section 200x100x6mm', 'structural_steel', 'civil',
  'Steelmaster SA', 800, 'm',
  'PO-K500-2026-052',
  'Material certificates do not match delivered material — heat number discrepancy',
  96, datetime('now', '+200 hours'),
  0, 0, 0,
  datetime('now', '-72 hours'), datetime('now', '-71 hours'), datetime('now', '-70 hours'), datetime('now', '-69 hours'), datetime('now', '-48 hours'), datetime('now'),
  'seed', datetime('now'), datetime('now')
);
