-- Wave 138 — IPP Environmental Monitoring Log seed data
-- 12 rows covering all 12 chain states

INSERT OR IGNORE INTO oe_ipp_env_monitoring (
  id, project_id, project_name, monitoring_ref, chain_status, monitoring_title,
  monitoring_category, monitoring_tier, eia_condition_ref, sampling_location,
  monitoring_frequency, parameter_name, measured_value, measurement_unit,
  permit_limit_min, permit_limit_max, exceedance_magnitude, exceedance_pct,
  is_near_sensitive_receptor, lab_accredited, lab_name, lab_sample_ref,
  findings, exceedance_cause, corrective_actions, corrective_action_deadline,
  report_title, report_submitted_to, complaint_description,
  floor_nema_s30_notification, floor_dffe_report_required, floor_public_notice_required,
  floor_lender_report_required, floor_eia_condition_breach,
  sla_target_hours, sla_deadline_at, sla_breached, sla_breach_count,
  is_reportable, regulator_ref, ncr_ref, hse_incident_ref, ms_ref, stage_gate_ref,
  scheduled_at, sampling_at, sample_submitted_at, compliance_assessed_at,
  report_drafted_at, report_submitted_at, closed_at, exceedance_flagged_at,
  corrective_action_at, under_investigation_at, cancelled_at,
  created_by, created_at, updated_at
) VALUES

-- env-001: scheduled — dust monitoring station A (critical tier, air quality)
(
  'env-001', 'kakamas-500mw', 'Kakamas 500MW Solar', 'K500-ENV-001', 'scheduled',
  'Dust monitoring Station A',
  'air_quality', 'critical', 'EIA-2024-CON-014', '-28.7654, 20.3412',
  'weekly', 'PM10', NULL, 'µg/m³',
  NULL, 75.0, NULL, NULL,
  0, 0, NULL, NULL,
  NULL, NULL, NULL, NULL,
  NULL, NULL, NULL,
  0, 0, 0, 0, 0,
  24, datetime('now', '+24 hours'), 0, 0,
  0, NULL, NULL, NULL, NULL, NULL,
  datetime('now'), NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
  'system', datetime('now'), datetime('now')
),

-- env-002: sampling — noise monitoring near school (regular tier, near sensitive receptor)
(
  'env-002', 'kakamas-500mw', 'Kakamas 500MW Solar', 'K500-ENV-002', 'sampling',
  'Construction noise monitoring — Eastern boundary',
  'noise', 'regular', 'EIA-2024-CON-021', '-28.7701, 20.3498',
  'weekly', 'Laeq(1h)', NULL, 'dB(A)',
  NULL, 55.0, NULL, NULL,
  1, 0, NULL, NULL,
  NULL, NULL, NULL, NULL,
  NULL, NULL, NULL,
  0, 0, 0, 0, 0,
  72, datetime('now', '+72 hours'), 0, 0,
  0, NULL, NULL, NULL, NULL, NULL,
  datetime('now', '-1 hour'), datetime('now'), NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
  'ipp_developer', datetime('now'), datetime('now')
),

-- env-003: sample_submitted — water quality at stream crossing (SANAS lab)
(
  'env-003', 'kakamas-500mw', 'Kakamas 500MW Solar', 'K500-ENV-003', 'sample_submitted',
  'Orange River upstream water quality sample',
  'water_quality', 'regular', 'EIA-2024-CON-008', '-28.7512, 20.3301',
  'monthly', 'pH', NULL, 'pH units',
  6.5, 8.5, NULL, NULL,
  0, 1, 'Waterlab SA', 'WL-2026-05-1203',
  NULL, NULL, NULL, NULL,
  NULL, NULL, NULL,
  0, 0, 0, 0, 0,
  72, datetime('now', '+48 hours'), 0, 0,
  0, NULL, NULL, NULL, NULL, NULL,
  datetime('now', '-2 days'), datetime('now', '-1 day'), datetime('now', '-4 hours'), NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
  'ipp_developer', datetime('now'), datetime('now')
),

-- env-004: results_received — groundwater monitoring well (within permit limits)
(
  'env-004', 'kakamas-500mw', 'Kakamas 500MW Solar', 'K500-ENV-004', 'results_received',
  'Groundwater monitoring well MW-003',
  'groundwater', 'routine', 'EIA-2024-CON-032', '-28.7623, 20.3445',
  'quarterly', 'pH', 6.8, 'pH units',
  6.0, 9.0, NULL, NULL,
  0, 1, 'Waterlab SA', 'WL-2026-04-0891',
  NULL, NULL, NULL, NULL,
  NULL, NULL, NULL,
  0, 0, 0, 0, 0,
  168, datetime('now', '+120 hours'), 0, 0,
  0, NULL, NULL, NULL, NULL, NULL,
  datetime('now', '-5 days'), datetime('now', '-4 days'), datetime('now', '-3 days'), NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
  'ipp_developer', datetime('now'), datetime('now')
),

-- env-005: compliance_assessed — waste management monitoring (pass)
(
  'env-005', 'kakamas-500mw', 'Kakamas 500MW Solar', 'K500-ENV-005', 'compliance_assessed',
  'Construction waste audit — Waste facility A',
  'waste', 'routine', 'EIA-2024-CON-041', '-28.7589, 20.3367',
  'monthly', 'Waste segregation compliance', NULL, '%',
  NULL, NULL, NULL, NULL,
  0, 0, NULL, NULL,
  'Within limits — pass. Waste segregation at 94% — above 90% EIA requirement.', NULL, NULL, NULL,
  NULL, NULL, NULL,
  0, 0, 0, 0, 0,
  168, datetime('now', '+100 hours'), 0, 0,
  0, NULL, NULL, NULL, NULL, NULL,
  datetime('now', '-7 days'), datetime('now', '-6 days'), datetime('now', '-5 days'), datetime('now', '-1 day'), NULL, NULL, NULL, NULL, NULL, NULL, NULL,
  'support', datetime('now'), datetime('now')
),

-- env-006: report_drafted — biodiversity monitoring (baseline)
(
  'env-006', 'kakamas-500mw', 'Kakamas 500MW Solar', 'K500-ENV-006', 'report_drafted',
  'Biodiversity baseline survey Q1 2026',
  'biodiversity', 'baseline', 'EIA-2024-CON-055', '-28.7650, 20.3420',
  'quarterly', 'Species diversity index', NULL, 'Shannon H',
  NULL, NULL, NULL, NULL,
  0, 0, NULL, NULL,
  'No threatened or protected species detected in survey area. Succulents present — mitigation measures in place.', NULL, NULL, NULL,
  'Q1 2026 Biodiversity Monitoring Report — Kakamas 500MW', NULL, NULL,
  0, 0, 0, 0, 0,
  720, datetime('now', '+600 hours'), 0, 0,
  0, NULL, NULL, NULL, NULL, NULL,
  datetime('now', '-14 days'), datetime('now', '-13 days'), datetime('now', '-12 days'), datetime('now', '-10 days'), datetime('now', '-2 days'), NULL, NULL, NULL, NULL, NULL, NULL,
  'ipp_developer', datetime('now'), datetime('now')
),

-- env-007: report_submitted — DFFE report submitted (floor_dffe_report_required=1)
(
  'env-007', 'kakamas-500mw', 'Kakamas 500MW Solar', 'K500-ENV-007', 'report_submitted',
  'Annual environmental compliance report 2025',
  'air_quality', 'regular', 'EIA-2024-CON-001', '-28.7654, 20.3412',
  'annual', 'PM2.5', NULL, 'µg/m³',
  NULL, 25.0, NULL, NULL,
  0, 1, 'Envirochem SA', 'EC-2025-ANN-007',
  'Annual monitoring completed. All parameters within EIA limits for the full reporting year 2025.', NULL, NULL, NULL,
  'Annual Environmental Compliance Report 2025 — Kakamas 500MW', 'DFFE', NULL,
  0, 1, 0, 1, 0,
  72, datetime('now', '-24 hours'), 0, 0,
  1, 'W138-ENV-REG-K500-007', NULL, NULL, NULL, NULL,
  datetime('now', '-30 days'), datetime('now', '-29 days'), datetime('now', '-28 days'), datetime('now', '-25 days'), datetime('now', '-5 days'), datetime('now', '-1 day'), NULL, NULL, NULL, NULL, NULL,
  'ipp_developer', datetime('now'), datetime('now')
),

-- env-008: closed — stormwater monitoring (clean close)
(
  'env-008', 'kakamas-500mw', 'Kakamas 500MW Solar', 'K500-ENV-008', 'closed',
  'Stormwater drainage quality check — Oct 2025',
  'stormwater', 'routine', 'EIA-2024-CON-049', '-28.7701, 20.3489',
  'monthly', 'Turbidity', 8.2, 'NTU',
  NULL, 30.0, NULL, NULL,
  0, 0, NULL, NULL,
  'Within permit limits. Turbidity 8.2 NTU vs 30 NTU limit — pass.', NULL, NULL, NULL,
  'Stormwater Quality Report Oct 2025', NULL, NULL,
  0, 0, 0, 0, 0,
  168, datetime('now', '-48 hours'), 0, 0,
  0, NULL, NULL, NULL, NULL, NULL,
  datetime('now', '-45 days'), datetime('now', '-44 days'), datetime('now', '-43 days'), datetime('now', '-40 days'), datetime('now', '-10 days'), datetime('now', '-5 days'), datetime('now', '-1 day'), NULL, NULL, NULL, NULL,
  'support', datetime('now'), datetime('now')
),

-- env-009: exceedance_flagged — SIGNATURE row (PM10 exceedance near school/hospital)
(
  'env-009', 'kakamas-500mw', 'Kakamas 500MW Solar', 'K500-ENV-009', 'exceedance_flagged',
  'PM10 exceedance — blasting dust event near Kakamas town',
  'air_quality', 'critical', 'EIA-2024-CON-014', '-28.7654, 20.3412',
  'continuous', 'PM10', 152.0, 'µg/m³',
  NULL, 75.0, 77.0, 102.7,
  1, 1, 'AQM SA', 'AQM-2026-05-0034',
  'PM10 measured at 152 µg/m³ — 102.7% above the 75 µg/m³ permit limit. Blasting operations conducted 200m from monitoring station during peak wind direction.', 'Blasting operations during adverse wind conditions.', 'Cease blasting immediately; increase dust suppression to 3x daily; notify DFFE within 24h per NEMA s30.', datetime('now', '+24 hours'),
  NULL, NULL, 'Community complaint received from Kakamas primary school re: dust',
  1, 1, 1, 1, 0,
  24, datetime('now', '-4 hours'), 1, 1,
  1, 'W138-ENV-REG-K500-009', NULL, NULL, NULL, NULL,
  datetime('now', '-3 days'), datetime('now', '-2 days'), datetime('now', '-2 days'), NULL, NULL, NULL, NULL, datetime('now', '-4 hours'), NULL, NULL, NULL,
  'admin', datetime('now'), datetime('now')
),

-- env-010: corrective_action — dust suppression corrective action in progress
(
  'env-010', 'kakamas-500mw', 'Kakamas 500MW Solar', 'K500-ENV-010', 'corrective_action',
  'Dust suppression corrective action — Crushing plant area',
  'dust', 'regular', 'EIA-2024-CON-017', '-28.7567, 20.3398',
  'daily', 'TSP', 289.0, 'µg/m³',
  NULL, 200.0, 89.0, 44.5,
  0, 0, NULL, NULL,
  'TSP measured at 289 µg/m³ against 200 µg/m³ EIA limit. Dust suppression equipment malfunction identified.', 'Dust suppression pump failure during crushing operations.', 'Cease blasting; increase dust suppression to 3x daily; install additional wind barriers; repair suppression pump', datetime('now', '+48 hours'),
  NULL, NULL, NULL,
  0, 0, 0, 1, 1,
  72, datetime('now', '+36 hours'), 0, 0,
  1, 'W138-ENV-REG-K500-010', 'ncr-012', NULL, NULL, NULL,
  datetime('now', '-5 days'), datetime('now', '-4 days'), datetime('now', '-4 days'), NULL, NULL, NULL, NULL, datetime('now', '-3 days'), datetime('now', '-2 days'), NULL, NULL,
  'support', datetime('now'), datetime('now')
),

-- env-011: under_investigation — noise complaint under investigation (EIA condition breach)
(
  'env-011', 'kakamas-500mw', 'Kakamas 500MW Solar', 'K500-ENV-011', 'under_investigation',
  'Night-time construction noise — possible equipment fault',
  'noise', 'regular', 'EIA-2024-CON-021', '-28.7701, 20.3498',
  'daily', 'Laeq(1h)', 71.0, 'dB(A)',
  NULL, 45.0, 26.0, 57.8,
  1, 0, NULL, NULL,
  'Noise measured at 71 dB(A) at night — 57.8% above the 45 dB(A) limit. Complaint from school hostel received. Investigation ongoing.', 'Under investigation — possible equipment failure. Night-time operations generator suspected.', NULL, NULL,
  NULL, NULL, 'Complaint from Kakamas school hostel — excessive night noise',
  0, 0, 1, 0, 1,
  72, datetime('now', '+12 hours'), 1, 1,
  1, 'W138-ENV-REG-K500-011', NULL, 'hse-003', NULL, NULL,
  datetime('now', '-7 days'), datetime('now', '-6 days'), datetime('now', '-6 days'), NULL, NULL, NULL, NULL, datetime('now', '-5 days'), NULL, datetime('now', '-3 days'), NULL,
  'admin', datetime('now'), datetime('now')
),

-- env-012: cancelled — visual impact monitoring cancelled (scope change)
(
  'env-012', 'kakamas-500mw', 'Kakamas 500MW Solar', 'K500-ENV-012', 'cancelled',
  'Visual impact monitoring — photomontage baseline',
  'visual', 'baseline', 'EIA-2024-CON-062', '-28.7750, 20.3550',
  'annual', 'Visual impact score', NULL, 'VIA index',
  NULL, NULL, NULL, NULL,
  'Monitoring cancelled — photomontage scope transferred to appointed VIA specialist per revised EIA condition.', NULL, NULL, NULL,
  NULL, NULL, NULL,
  0, 0, 0, 0, 0,
  720, datetime('now', '+700 hours'), 0, 0,
  0, NULL, NULL, NULL, NULL, NULL,
  datetime('now', '-10 days'), NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, datetime('now', '-2 days'),
  'ipp_developer', datetime('now'), datetime('now')
);
