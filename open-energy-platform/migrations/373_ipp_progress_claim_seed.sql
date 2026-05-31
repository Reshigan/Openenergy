-- Wave 141 — IPP Progress Claims seed data (12 rows covering all 12 chain states)

INSERT OR IGNORE INTO oe_ipp_progress_claims (
  id, project_id, project_name, claim_number, chain_status, claim_type, claim_tier,
  contractor_name, claim_amount_zar, sla_target_hours, sla_deadline_at,
  submitted_at, created_by, created_at, updated_at
) VALUES (
  'pcn-001', 'kakamas-500mw', 'Kakamas 500 MW Solar PV', 'K500-PCN-001',
  'submitted', 'interim', 'significant',
  'Powercon SA', 4500000, 336,
  datetime('now', '+14 days'),
  datetime('now', '-1 day'), 'seed', datetime('now'), datetime('now')
);

INSERT OR IGNORE INTO oe_ipp_progress_claims (
  id, project_id, project_name, claim_number, chain_status, claim_type, claim_tier,
  contractor_name, claim_amount_zar, floor_ie_milestone_payment, sla_target_hours,
  submitted_at, quantity_survey_review_at, created_by, created_at, updated_at
) VALUES (
  'pcn-002', 'kakamas-500mw', 'Kakamas 500 MW Solar PV', 'K500-PCN-002',
  'quantity_survey_review', 'milestone', 'major',
  'Powercon SA', 18500000, 1, 720,
  datetime('now', '-3 days'), datetime('now', '-1 day'),
  'seed', datetime('now'), datetime('now')
);

INSERT OR IGNORE INTO oe_ipp_progress_claims (
  id, project_id, project_name, claim_number, chain_status, claim_type, claim_tier,
  contractor_name, claim_amount_zar, qs_assessed_zar, sla_target_hours,
  submitted_at, quantity_survey_review_at, pm_review_at, created_by, created_at, updated_at
) VALUES (
  'pcn-003', 'kakamas-500mw', 'Kakamas 500 MW Solar PV', 'K500-PCN-003',
  'pm_review', 'interim', 'standard',
  'Powercon SA', 3500000, 3200000, 168,
  datetime('now', '-5 days'), datetime('now', '-3 days'), datetime('now', '-1 day'),
  'seed', datetime('now'), datetime('now')
);

INSERT OR IGNORE INTO oe_ipp_progress_claims (
  id, project_id, project_name, claim_number, chain_status, claim_type, claim_tier,
  contractor_name, claim_amount_zar, certified_amount_zar,
  floor_ie_milestone_payment, floor_lender_certification_required,
  is_reportable, sla_target_hours,
  submitted_at, quantity_survey_review_at, pm_review_at, engineer_certified_at,
  created_by, created_at, updated_at
) VALUES (
  'pcn-004', 'kakamas-500mw', 'Kakamas 500 MW Solar PV', 'K500-PCN-004',
  'engineer_certified', 'milestone', 'major',
  'Powercon SA', 16000000, 15800000,
  1, 1,
  1, 720,
  datetime('now', '-10 days'), datetime('now', '-7 days'), datetime('now', '-4 days'),
  datetime('now', '-1 day'),
  'seed', datetime('now'), datetime('now')
);

INSERT OR IGNORE INTO oe_ipp_progress_claims (
  id, project_id, project_name, claim_number, chain_status, claim_type, claim_tier,
  contractor_name, claim_amount_zar, certified_amount_zar, approved_amount_zar,
  retention_amount_zar, net_payable_zar, sla_target_hours,
  submitted_at, quantity_survey_review_at, pm_review_at, engineer_certified_at, approved_at,
  created_by, created_at, updated_at
) VALUES (
  'pcn-005', 'kakamas-500mw', 'Kakamas 500 MW Solar PV', 'K500-PCN-005',
  'approved', 'interim', 'standard',
  'Powercon SA', 3500000, 3300000, 3200000,
  320000, 2880000, 168,
  datetime('now', '-14 days'), datetime('now', '-11 days'), datetime('now', '-8 days'),
  datetime('now', '-5 days'), datetime('now', '-2 days'),
  'seed', datetime('now'), datetime('now')
);

INSERT OR IGNORE INTO oe_ipp_progress_claims (
  id, project_id, project_name, claim_number, chain_status, claim_type, claim_tier,
  contractor_name, claim_amount_zar, certified_amount_zar, approved_amount_zar,
  net_payable_zar, sla_target_hours,
  submitted_at, quantity_survey_review_at, pm_review_at, engineer_certified_at,
  approved_at, payment_processed_at,
  created_by, created_at, updated_at
) VALUES (
  'pcn-006', 'kakamas-500mw', 'Kakamas 500 MW Solar PV', 'K500-PCN-006',
  'payment_processed', 'interim', 'standard',
  'Powercon SA', 2900000, 2900000, 2900000,
  2880000, 168,
  datetime('now', '-20 days'), datetime('now', '-17 days'), datetime('now', '-14 days'),
  datetime('now', '-11 days'), datetime('now', '-8 days'), datetime('now', '-2 days'),
  'seed', datetime('now'), datetime('now')
);

INSERT OR IGNORE INTO oe_ipp_progress_claims (
  id, project_id, project_name, claim_number, chain_status, claim_type, claim_tier,
  contractor_name, claim_amount_zar, sla_target_hours,
  submitted_at, quantity_survey_review_at, pm_review_at, engineer_certified_at,
  approved_at, payment_processed_at, closed_at,
  created_by, created_at, updated_at
) VALUES (
  'pcn-007', 'kakamas-500mw', 'Kakamas 500 MW Solar PV', 'K500-PCN-007',
  'closed', 'interim', 'minor',
  'Powercon SA', 450000, 72,
  datetime('now', '-35 days'), datetime('now', '-32 days'), datetime('now', '-29 days'),
  datetime('now', '-26 days'), datetime('now', '-23 days'), datetime('now', '-20 days'),
  datetime('now', '-15 days'),
  'seed', datetime('now'), datetime('now')
);

INSERT OR IGNORE INTO oe_ipp_progress_claims (
  id, project_id, project_name, claim_number, chain_status, claim_type, claim_tier,
  contractor_name, claim_amount_zar, dispute_reason, sla_target_hours,
  submitted_at, quantity_survey_review_at, pm_review_at, disputed_at,
  created_by, created_at, updated_at
) VALUES (
  'pcn-008', 'kakamas-500mw', 'Kakamas 500 MW Solar PV', 'K500-PCN-008',
  'disputed', 'interim', 'significant',
  'Powercon SA', 5200000,
  'QS under-assessed earthworks volumes — disputing 1,200m³ @ R850/m³',
  336,
  datetime('now', '-8 days'), datetime('now', '-5 days'), datetime('now', '-3 days'),
  datetime('now', '-1 day'),
  'seed', datetime('now'), datetime('now')
);

INSERT OR IGNORE INTO oe_ipp_progress_claims (
  id, project_id, project_name, claim_number, chain_status, claim_type, claim_tier,
  contractor_name, claim_amount_zar, suspension_reason, floor_defects_outstanding,
  sla_target_hours,
  submitted_at, quantity_survey_review_at, pm_review_at, approved_at, suspended_at,
  created_by, created_at, updated_at
) VALUES (
  'pcn-009', 'kakamas-500mw', 'Kakamas 500 MW Solar PV', 'K500-PCN-009',
  'suspended', 'interim', 'standard',
  'Powercon SA', 2100000,
  'Outstanding NCRs on structural concrete must be resolved before payment',
  1, 168,
  datetime('now', '-12 days'), datetime('now', '-9 days'), datetime('now', '-6 days'),
  datetime('now', '-3 days'), datetime('now', '-1 day'),
  'seed', datetime('now'), datetime('now')
);

INSERT OR IGNORE INTO oe_ipp_progress_claims (
  id, project_id, project_name, claim_number, chain_status, claim_type, claim_tier,
  contractor_name, claim_amount_zar, rejection_reason, sla_target_hours,
  submitted_at, quantity_survey_review_at, rejected_at,
  created_by, created_at, updated_at
) VALUES (
  'pcn-010', 'kakamas-500mw', 'Kakamas 500 MW Solar PV', 'K500-PCN-010',
  'rejected', 'variation', 'standard',
  'Powercon SA', 780000,
  'Claim submitted outside contractual notice period',
  168,
  datetime('now', '-15 days'), datetime('now', '-12 days'), datetime('now', '-8 days'),
  'seed', datetime('now'), datetime('now')
);

INSERT OR IGNORE INTO oe_ipp_progress_claims (
  id, project_id, project_name, claim_number, chain_status, claim_type, claim_tier,
  contractor_name, claim_amount_zar, approved_amount_zar, floor_variation_included,
  sla_target_hours,
  submitted_at, quantity_survey_review_at, pm_review_at, partial_payment_at,
  created_by, created_at, updated_at
) VALUES (
  'pcn-011', 'kakamas-500mw', 'Kakamas 500 MW Solar PV', 'K500-PCN-011',
  'partial_payment', 'variation', 'standard',
  'Powercon SA', 1800000, 1200000, 1, 168,
  datetime('now', '-10 days'), datetime('now', '-7 days'), datetime('now', '-4 days'),
  datetime('now', '-1 day'),
  'seed', datetime('now'), datetime('now')
);

INSERT OR IGNORE INTO oe_ipp_progress_claims (
  id, project_id, project_name, claim_number, chain_status, claim_type, claim_tier,
  contractor_name, claim_amount_zar, floor_retention_release, is_reportable,
  sla_target_hours,
  submitted_at, quantity_survey_review_at, pm_review_at, engineer_certified_at,
  approved_at, payment_processed_at, closed_at, final_account_at,
  created_by, created_at, updated_at
) VALUES (
  'pcn-012', 'kakamas-500mw', 'Kakamas 500 MW Solar PV', 'K500-PCN-012',
  'final_account', 'final', 'major',
  'Powercon SA', 22000000, 1, 1, 720,
  datetime('now', '-60 days'), datetime('now', '-55 days'), datetime('now', '-50 days'),
  datetime('now', '-45 days'), datetime('now', '-40 days'), datetime('now', '-35 days'),
  datetime('now', '-30 days'), datetime('now', '-20 days'),
  'seed', datetime('now'), datetime('now')
);
