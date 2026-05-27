-- Wave 29 seed: 10 trader position-limit cases — one per state in canonical
-- lifecycle order across 3 tiers (prop / market_maker / retail). Demonstrates
-- FSCA Section 41 hard windows, INVERTED cure window, JSE-SRL Daily Aggregate
-- reference for retail, regulator inbox crossing on hard_breach + margin_call
-- (prop+mm) and force_liquidate (all tiers).

INSERT OR IGNORE INTO oe_poslimit_cases (id, case_number, trader_party, trader_user_id, trader_tier, fsca_license_ref, instrument, instrument_class, tenor, cap_mw, position_mw, utilisation_pct, cap_zar, jse_srl_ref, regulator_authority, chain_status, detected_at, sla_deadline_at, created_by, reason_code) VALUES
('pos_001', 'PL-PROP-2026-0001',   'Standard Bank Group Securities',  'trader_sbg_01',  'prop',         'FSCA-CAT2A-00142', 'ENERGY_FWD_2026Q3_BL',     'energy_fwd',  '2026Q3', 500,  385, 77.0,   5000000000, 'JSE-SRL-DTA-2026-05-28-0001', 'FSCA',    'within_limit',         '2026-05-28T08:00:00Z', NULL,                    'compliance_officer', 'pos_growth'),
('pos_002', 'PL-MM-2026-0002',     'Investec Energy Trading',         'trader_ivt_07',  'market_maker', 'FSCA-CAT2A-MM-0089', 'ENERGY_FWD_2026Q4_PK',     'energy_fwd',  '2026Q4', 80,   68,  85.0,   500000000,  'JSE-SRL-DTA-2026-05-28-0002', 'FSCA',    'warning',              '2026-05-28T09:00:00Z', '2026-05-28T17:00:00Z',  'compliance_officer', 'pos_growth'),
('pos_003', 'PL-RT-2026-0003',     'Renaissance Capital SA',          'trader_rcs_03',  'retail',       'FSCA-CAT1-RTL-0314',  'CARBON_FWD_2027_ZA',       'carbon_fwd',  '2027',   8,    8.8, 110.0,  50000000,   'JSE-SRL-DTA-2026-05-28-0003', 'JSE_SRL', 'soft_breach',          '2026-05-28T11:00:00Z', '2026-05-29T11:00:00Z',  'compliance_officer', 'mark_to_market'),
('pos_004', 'PL-PROP-2026-0004',   'RMB Markets',                     'trader_rmb_12',  'prop',         'FSCA-CAT2A-00077',    'ENERGY_FWD_2026Q3_BL',     'energy_fwd',  '2026Q3', 500,  580, 116.0,  5000000000, 'JSE-SRL-DTA-2026-05-28-0004', 'FSCA',    'hard_breach',          '2026-05-27T14:00:00Z', '2026-05-28T18:00:00Z',  'compliance_officer', 'pos_growth'),
('pos_005', 'PL-PROP-2026-0005',   'Standard Bank Group Securities',  'trader_sbg_04',  'prop',         'FSCA-CAT2A-00142',    'REC_2026Q2_ZA',             'rec',         '2026Q2', 200,  248, 124.0,  5000000000, 'JSE-SRL-DTA-2026-05-27-0011', 'FSCA',    'margin_call_issued',   '2026-05-26T10:00:00Z', '2026-05-31T10:00:00Z',  'compliance_officer', 'pos_growth'),
('pos_006', 'PL-MM-2026-0006',     'ABSA Capital Markets',            'trader_abs_22',  'market_maker', 'FSCA-CAT2A-MM-0124',  'ENERGY_FWD_2026Q4_PK',     'energy_fwd',  '2026Q4', 80,   97,  121.3,  500000000,  'JSE-SRL-DTA-2026-05-27-0019', 'FSCA',    'reduction_required',   '2026-05-25T08:00:00Z', '2026-05-29T08:00:00Z',  'compliance_officer', 'mark_to_market'),
('pos_007', 'PL-PROP-2026-0007',   'Investec Energy Trading',         'trader_ivt_14',  'prop',         'FSCA-CAT2A-00089',    'CARBON_FWD_2027_ZA',       'carbon_fwd',  '2027',   500,  610, 122.0,  5000000000, 'JSE-SRL-DTA-2026-05-26-0033', 'FSCA',    'reduction_executing',  '2026-05-22T11:00:00Z', '2026-05-29T11:00:00Z',  'compliance_officer', 'pos_growth'),
('pos_008', 'PL-MM-2026-0008',     'Old Mutual Specialised Finance',  'trader_oms_09',  'market_maker', 'FSCA-CAT2A-MM-0067',  'ENERGY_FWD_2026Q3_BL',     'energy_fwd',  '2026Q3', 100,  88,  88.0,   500000000,  'JSE-SRL-DTA-2026-05-21-0014', 'FSCA',    'cured',                '2026-05-20T13:00:00Z', NULL,                    'compliance_officer', 'mark_to_market'),
('pos_009', 'PL-RT-2026-0009',     'Renaissance Capital SA',          'trader_rcs_07',  'retail',       'FSCA-CAT1-RTL-0314',  'DAM_INTRADAY_2026_06_01',  'dam_intraday','2026-06-01', 10, 13.4, 134.0, 50000000,  'JSE-SRL-DTA-2026-05-15-0028', 'JSE_SRL', 'escalated',            '2026-05-12T07:00:00Z', NULL,                    'compliance_officer', 'pos_growth'),
('pos_010', 'PL-RT-2026-0010',     'Sasol Limited Energy Trading',    'trader_ssl_03',  'retail',       'FSCA-CAT1-RTL-0211',  'CARBON_FWD_2027_ZA',       'carbon_fwd',  '2027',   8,    9.1, 113.8,  50000000,   'JSE-SRL-DTA-2026-05-27-0042', 'JSE_SRL', 'false_alarm',          '2026-05-27T15:00:00Z', NULL,                    'compliance_officer', 'telemetry_stale');

-- Lifecycle timestamps + financial details for cases that have progressed
UPDATE oe_poslimit_cases SET warning_at='2026-05-28T09:00:00Z' WHERE id='pos_002';

UPDATE oe_poslimit_cases SET warning_at='2026-05-28T10:00:00Z', soft_breach_at='2026-05-28T11:00:00Z' WHERE id='pos_003';

UPDATE oe_poslimit_cases SET warning_at='2026-05-27T10:00:00Z', soft_breach_at='2026-05-27T12:00:00Z', hard_breach_at='2026-05-28T14:00:00Z', fsca_ref='FSCA-S41-2026-0023' WHERE id='pos_004';

UPDATE oe_poslimit_cases SET warning_at='2026-05-26T08:00:00Z', soft_breach_at='2026-05-26T10:00:00Z', hard_breach_at='2026-05-27T08:00:00Z', margin_call_issued_at='2026-05-27T10:00:00Z', margin_called_zar=620000000, margin_posted_zar=120000000, fsca_ref='FSCA-S41-2026-0019', regulator_ref='FSCA-S41-2026-0019' WHERE id='pos_005';

UPDATE oe_poslimit_cases SET warning_at='2026-05-25T06:00:00Z', soft_breach_at='2026-05-25T08:00:00Z', hard_breach_at='2026-05-26T06:00:00Z', margin_call_issued_at='2026-05-26T08:00:00Z', reduction_required_at='2026-05-28T08:00:00Z', margin_called_zar=85000000, margin_posted_zar=85000000, reduction_target_mw=72, fsca_ref='FSCA-S41-2026-0014', regulator_ref='FSCA-S41-2026-0014' WHERE id='pos_006';

UPDATE oe_poslimit_cases SET warning_at='2026-05-22T11:00:00Z', soft_breach_at='2026-05-22T13:00:00Z', hard_breach_at='2026-05-23T11:00:00Z', margin_call_issued_at='2026-05-23T13:00:00Z', reduction_required_at='2026-05-26T08:00:00Z', reduction_executing_at='2026-05-26T13:00:00Z', margin_called_zar=550000000, margin_posted_zar=550000000, reduction_target_mw=480, reduction_achieved_mw=42, fsca_ref='FSCA-S41-2026-0009', regulator_ref='FSCA-S41-2026-0009' WHERE id='pos_007';

UPDATE oe_poslimit_cases SET warning_at='2026-05-20T13:00:00Z', soft_breach_at='2026-05-20T16:00:00Z', cured_at='2026-05-21T08:00:00Z', rod_notes='Position trimmed via SOR auto-unwind; back within limit at 88%' WHERE id='pos_008';

UPDATE oe_poslimit_cases SET warning_at='2026-05-12T07:00:00Z', soft_breach_at='2026-05-12T09:00:00Z', hard_breach_at='2026-05-13T07:00:00Z', margin_call_issued_at='2026-05-13T09:00:00Z', reduction_required_at='2026-05-14T09:00:00Z', reduction_executing_at='2026-05-14T13:00:00Z', escalated_at='2026-05-15T13:00:00Z', last_sla_breach_at='2026-05-15T13:00:00Z', escalation_level=1, liquidation_order_ref='LIQ-RCS-2026-0011', margin_called_zar=14000000, margin_posted_zar=0, fsca_ref='FSCA-S41-2026-0008', regulator_ref='FSCA-S41-2026-0008', rod_notes='Margin call unmet; forced liquidation via JSE-SRL T+2; account suspended' WHERE id='pos_009';

UPDATE oe_poslimit_cases SET warning_at='2026-05-27T15:00:00Z', false_alarm_at='2026-05-27T16:30:00Z', rod_notes='Mark-to-market feed for CARBON_FWD_2027_ZA was stale by 4h; recomputed utilisation 87% — within limit' WHERE id='pos_010';

-- Audit events (per-transition; 53 total across 10 cases)
INSERT OR IGNORE INTO oe_poslimit_events (id, poslimit_id, event_type, from_status, to_status, actor_id, notes, created_at) VALUES
('pos_evt_001a', 'pos_001', 'within_limit', NULL, 'within_limit', 'compliance_officer', '77% utilisation — baseline healthy on ENERGY_FWD_2026Q3_BL', '2026-05-28T08:00:00Z'),

('pos_evt_002a', 'pos_002', 'within_limit',   NULL,            'within_limit', 'compliance_officer', NULL, '2026-05-28T07:00:00Z'),
('pos_evt_002b', 'pos_002', 'warning',        'within_limit',  'warning',      'compliance_officer', '85% utilisation; advisory issued to Investec desk', '2026-05-28T09:00:00Z'),

('pos_evt_003a', 'pos_003', 'within_limit',  NULL,            'within_limit',  'compliance_officer', NULL, '2026-05-28T08:00:00Z'),
('pos_evt_003b', 'pos_003', 'warning',       'within_limit',  'warning',       'compliance_officer', NULL, '2026-05-28T10:00:00Z'),
('pos_evt_003c', 'pos_003', 'soft_breach',   'warning',       'soft_breach',   'compliance_officer', '110% intraday; must cure by EOD or T+1 hard', '2026-05-28T11:00:00Z'),

('pos_evt_004a', 'pos_004', 'within_limit',  NULL,            'within_limit',  'compliance_officer', NULL, '2026-05-27T13:00:00Z'),
('pos_evt_004b', 'pos_004', 'warning',       'within_limit',  'warning',       'compliance_officer', NULL, '2026-05-27T10:00:00Z'),
('pos_evt_004c', 'pos_004', 'soft_breach',   'warning',       'soft_breach',   'compliance_officer', NULL, '2026-05-27T12:00:00Z'),
('pos_evt_004d', 'pos_004', 'hard_breach',   'soft_breach',   'hard_breach',   'compliance_officer', '116% unresolved overnight; FSCA-S41-2026-0023 raised; margin call window 4h', '2026-05-28T14:00:00Z'),

('pos_evt_005a', 'pos_005', 'within_limit',          NULL,                  'within_limit',         'compliance_officer', NULL, '2026-05-26T07:00:00Z'),
('pos_evt_005b', 'pos_005', 'warning',               'within_limit',        'warning',              'compliance_officer', NULL, '2026-05-26T08:00:00Z'),
('pos_evt_005c', 'pos_005', 'soft_breach',          'warning',             'soft_breach',          'compliance_officer', NULL, '2026-05-26T10:00:00Z'),
('pos_evt_005d', 'pos_005', 'hard_breach',          'soft_breach',         'hard_breach',          'compliance_officer', NULL, '2026-05-27T08:00:00Z'),
('pos_evt_005e', 'pos_005', 'margin_call_issued',   'hard_breach',         'margin_call_issued',   'compliance_officer', 'R620m margin call against R5bn cap; R120m posted; FSCA notified', '2026-05-27T10:00:00Z'),

('pos_evt_006a', 'pos_006', 'within_limit',         NULL,                  'within_limit',         'compliance_officer', NULL, '2026-05-25T05:00:00Z'),
('pos_evt_006b', 'pos_006', 'warning',              'within_limit',        'warning',              'compliance_officer', NULL, '2026-05-25T06:00:00Z'),
('pos_evt_006c', 'pos_006', 'soft_breach',          'warning',             'soft_breach',          'compliance_officer', NULL, '2026-05-25T08:00:00Z'),
('pos_evt_006d', 'pos_006', 'hard_breach',          'soft_breach',         'hard_breach',          'compliance_officer', NULL, '2026-05-26T06:00:00Z'),
('pos_evt_006e', 'pos_006', 'margin_call_issued',   'hard_breach',         'margin_call_issued',   'compliance_officer', 'R85m margin call posted; FSCA-S41-2026-0014', '2026-05-26T08:00:00Z'),
('pos_evt_006f', 'pos_006', 'reduction_required',   'margin_call_issued',  'reduction_required',   'compliance_officer', 'Reduce-only order issued; target 72MW on ENERGY_FWD_2026Q4_PK', '2026-05-28T08:00:00Z'),

('pos_evt_007a', 'pos_007', 'within_limit',         NULL,                  'within_limit',         'compliance_officer', NULL, '2026-05-22T10:00:00Z'),
('pos_evt_007b', 'pos_007', 'warning',              'within_limit',        'warning',              'compliance_officer', NULL, '2026-05-22T11:00:00Z'),
('pos_evt_007c', 'pos_007', 'soft_breach',          'warning',             'soft_breach',          'compliance_officer', NULL, '2026-05-22T13:00:00Z'),
('pos_evt_007d', 'pos_007', 'hard_breach',          'soft_breach',         'hard_breach',          'compliance_officer', NULL, '2026-05-23T11:00:00Z'),
('pos_evt_007e', 'pos_007', 'margin_call_issued',   'hard_breach',         'margin_call_issued',   'compliance_officer', 'R550m margin call posted in full', '2026-05-23T13:00:00Z'),
('pos_evt_007f', 'pos_007', 'reduction_required',   'margin_call_issued',  'reduction_required',   'compliance_officer', 'Target 480MW on CARBON_FWD_2027_ZA', '2026-05-26T08:00:00Z'),
('pos_evt_007g', 'pos_007', 'reduction_executing',  'reduction_required',  'reduction_executing',  'trader_ivt_14',      'IVT desk unwinding 130MW over 72h via TWAP', '2026-05-26T13:00:00Z'),

('pos_evt_008a', 'pos_008', 'within_limit',  NULL,           'within_limit',  'compliance_officer', NULL, '2026-05-20T12:00:00Z'),
('pos_evt_008b', 'pos_008', 'warning',       'within_limit', 'warning',       'compliance_officer', NULL, '2026-05-20T13:00:00Z'),
('pos_evt_008c', 'pos_008', 'soft_breach',   'warning',      'soft_breach',   'compliance_officer', '101% intraday', '2026-05-20T16:00:00Z'),
('pos_evt_008d', 'pos_008', 'cured',         'soft_breach',  'cured',         'compliance_officer', 'Position cured by SOR overnight auto-trim; back at 88%', '2026-05-21T08:00:00Z'),

('pos_evt_009a', 'pos_009', 'within_limit',         NULL,                  'within_limit',         'compliance_officer', NULL, '2026-05-12T06:00:00Z'),
('pos_evt_009b', 'pos_009', 'warning',              'within_limit',        'warning',              'compliance_officer', NULL, '2026-05-12T07:00:00Z'),
('pos_evt_009c', 'pos_009', 'soft_breach',          'warning',             'soft_breach',          'compliance_officer', NULL, '2026-05-12T09:00:00Z'),
('pos_evt_009d', 'pos_009', 'hard_breach',          'soft_breach',         'hard_breach',          'compliance_officer', 'Retail tier 134% on DAM intraday; FSCA-S41-2026-0008', '2026-05-13T07:00:00Z'),
('pos_evt_009e', 'pos_009', 'margin_call_issued',   'hard_breach',         'margin_call_issued',   'compliance_officer', 'R14m margin call; nothing posted', '2026-05-13T09:00:00Z'),
('pos_evt_009f', 'pos_009', 'reduction_required',   'margin_call_issued',  'reduction_required',   'compliance_officer', NULL, '2026-05-14T09:00:00Z'),
('pos_evt_009g', 'pos_009', 'reduction_executing',  'reduction_required',  'reduction_executing',  'trader_rcs_07',      'No bid in DAM session; unable to unwind', '2026-05-14T13:00:00Z'),
('pos_evt_009h', 'pos_009', 'escalated',            'reduction_executing', 'escalated',            'compliance_officer', 'Cure SLA breached; forced liquidation LIQ-RCS-2026-0011 via JSE-SRL T+2; account suspended', '2026-05-15T13:00:00Z'),
('pos_evt_009i', 'pos_009', 'sla_breached',         'reduction_executing', 'escalated',            'system',             'auto-breach: cure deadline 2026-05-15T13:00:00Z lapsed', '2026-05-15T13:00:00Z'),

('pos_evt_010a', 'pos_010', 'within_limit',   NULL,           'within_limit',  'compliance_officer', NULL, '2026-05-27T14:00:00Z'),
('pos_evt_010b', 'pos_010', 'warning',        'within_limit', 'warning',       'compliance_officer', '113.8% on stale mark-to-market feed', '2026-05-27T15:00:00Z'),
('pos_evt_010c', 'pos_010', 'false_alarm',    'warning',      'false_alarm',   'compliance_officer', 'Mark-to-market feed for CARBON_FWD_2027_ZA stale by 4h; recomputed utilisation 87% — within limit', '2026-05-27T16:30:00Z');
