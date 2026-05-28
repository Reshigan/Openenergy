-- Wave 30 — Lender Disbursement UoP Reconciliation seed (10 cases, one per state).
-- Cross-wave: W21 drawdown release seeds these cases (drawdown_ref ties back).

-- 1. tranche_released (initial state)
INSERT OR IGNORE INTO oe_disbursement_cases (
  id, case_number, lender_party, borrower_party, project_id, project_name,
  drawdown_ref, facility_ref, tranche_tier, tranche_amount_zar, released_zar,
  uop_category, chain_status, tranche_released_at, sla_deadline_at,
  created_by, created_at, updated_at
) VALUES (
  'dsb_001', 'UOP-RBK-2026-0001', 'Rand Merchant Bank', 'Loeriesfontein 3 IPP (Pty) Ltd',
  'proj_loeriesfontein_3', 'Loeriesfontein 3 144MW Wind',
  'dd_006', 'FAC-RMB-2026-0042', 'senior_a', 285000000, 285000000,
  'EPC milestone 3 — turbine erection',
  'tranche_released', '2026-05-26T08:00:00Z', '2026-05-29T08:00:00Z',
  'system', '2026-05-26T08:00:00Z', '2026-05-26T08:00:00Z'
);

-- 2. invoices_pending (waiting for borrower to submit supporting docs)
INSERT OR IGNORE INTO oe_disbursement_cases (
  id, case_number, lender_party, borrower_party, project_id, project_name,
  drawdown_ref, facility_ref, tranche_tier, tranche_amount_zar, released_zar,
  invoice_count, uop_category, chain_status, tranche_released_at, invoices_pending_at, sla_deadline_at,
  created_by, created_at, updated_at
) VALUES (
  'dsb_002', 'UOP-SBG-2026-0002', 'Standard Bank Group', 'Roggeveld Wind Phase 2 (Pty) Ltd',
  'proj_roggeveld_2', 'Roggeveld Wind Phase 2 147MW',
  'dd_007', 'FAC-SBG-2026-0091', 'senior_a', 420000000, 420000000,
  0, 'EPC milestone 4 — collection grid',
  'invoices_pending', '2026-05-20T10:00:00Z', '2026-05-21T08:00:00Z', '2026-07-20T08:00:00Z',
  'system', '2026-05-20T10:00:00Z', '2026-05-21T08:00:00Z'
);

-- 3. invoices_submitted
INSERT OR IGNORE INTO oe_disbursement_cases (
  id, case_number, lender_party, borrower_party, project_id, project_name,
  drawdown_ref, facility_ref, tranche_tier, tranche_amount_zar, released_zar,
  invoices_amount_zar, invoice_count, uop_category, chain_status,
  tranche_released_at, invoices_pending_at, invoices_submitted_at, sla_deadline_at,
  created_by, created_at, updated_at
) VALUES (
  'dsb_003', 'UOP-ABC-2026-0003', 'ABSA Capital', 'Kuruman SSEG Hybrid (Pty) Ltd',
  'proj_kuruman_sseg', 'Kuruman SSEG 2.5MW Hybrid',
  'dd_008', 'FAC-ABC-2026-0034', 'senior_b', 78000000, 78000000,
  78400000, 14, 'BoP balance + civils retention',
  'invoices_submitted',
  '2026-05-15T09:00:00Z', '2026-05-16T08:00:00Z', '2026-05-25T14:30:00Z', '2026-05-30T14:30:00Z',
  'system', '2026-05-15T09:00:00Z', '2026-05-25T14:30:00Z'
);

-- 4. bank_validating (front-office checking invoices line-by-line)
INSERT OR IGNORE INTO oe_disbursement_cases (
  id, case_number, lender_party, borrower_party, project_id, project_name,
  drawdown_ref, facility_ref, tranche_tier, tranche_amount_zar, released_zar,
  invoices_amount_zar, invoice_count, uop_category, chain_status,
  tranche_released_at, invoices_pending_at, invoices_submitted_at, bank_validating_at, sla_deadline_at,
  created_by, created_at, updated_at
) VALUES (
  'dsb_004', 'UOP-IVT-2026-0004', 'Investec Bank', 'Xina Solar Two CSP (Pty) Ltd',
  'proj_xina_solar_2', 'Xina Solar Two CSP 100MW',
  'dd_009', 'FAC-IVT-2026-0011', 'senior_a', 612000000, 612000000,
  624500000, 38, 'EPC milestone 5 — molten salt loop',
  'bank_validating',
  '2026-05-08T11:00:00Z', '2026-05-09T08:00:00Z', '2026-05-18T16:00:00Z', '2026-05-22T09:00:00Z',
  '2026-06-05T09:00:00Z',
  'system', '2026-05-08T11:00:00Z', '2026-05-22T09:00:00Z'
);

-- 5. ie_certifying (Independent Engineer site visits in progress)
INSERT OR IGNORE INTO oe_disbursement_cases (
  id, case_number, lender_party, borrower_party, project_id, project_name,
  drawdown_ref, facility_ref, tranche_tier, tranche_amount_zar, released_zar,
  invoices_amount_zar, invoice_count, uop_category, ie_firm, chain_status,
  tranche_released_at, invoices_pending_at, invoices_submitted_at, bank_validating_at, ie_certifying_at,
  sla_deadline_at, created_by, created_at, updated_at
) VALUES (
  'dsb_005', 'UOP-NDB-2026-0005', 'Nedbank CIB', 'Aggeneys Wind 80MW (Pty) Ltd',
  'proj_aggeneys_wind', 'Aggeneys Wind 80MW',
  'dd_010', 'FAC-NDB-2026-0067', 'senior_b', 198000000, 198000000,
  201200000, 22, 'EPC milestone 4 — substation construction', 'Mott MacDonald SA',
  'ie_certifying',
  '2026-04-22T08:00:00Z', '2026-04-23T08:00:00Z', '2026-05-05T11:00:00Z', '2026-05-08T09:00:00Z',
  '2026-05-15T14:00:00Z',
  '2026-06-05T14:00:00Z',
  'system', '2026-04-22T08:00:00Z', '2026-05-15T14:00:00Z'
);

-- 6. uop_certified (IE signed off, awaiting bank reconciliation close)
INSERT OR IGNORE INTO oe_disbursement_cases (
  id, case_number, lender_party, borrower_party, project_id, project_name,
  drawdown_ref, facility_ref, tranche_tier, tranche_amount_zar, released_zar,
  invoices_amount_zar, invoice_count, uop_category, ie_firm, ie_certificate_ref,
  chain_status,
  tranche_released_at, invoices_pending_at, invoices_submitted_at, bank_validating_at,
  ie_certifying_at, uop_certified_at, sla_deadline_at,
  created_by, created_at, updated_at
) VALUES (
  'dsb_006', 'UOP-RBK-2026-0006', 'Rand Merchant Bank', 'Mooi River Hydro 18.5MW (Pty) Ltd',
  'proj_mooi_river', 'Mooi River Hydro 18.5MW',
  'dd_011', 'FAC-RMB-2026-0102', 'mezzanine', 42000000, 42000000,
  42100000, 9, 'BoP completion + civils final', 'WSP South Africa', 'IE-WSP-2026-0044',
  'uop_certified',
  '2026-03-10T08:00:00Z', '2026-03-11T08:00:00Z', '2026-03-25T15:00:00Z', '2026-03-28T09:00:00Z',
  '2026-04-02T08:00:00Z', '2026-05-22T16:00:00Z',
  '2026-05-27T16:00:00Z',
  'system', '2026-03-10T08:00:00Z', '2026-05-22T16:00:00Z'
);

-- 7. reconciled (terminal good — happy path closed)
INSERT OR IGNORE INTO oe_disbursement_cases (
  id, case_number, lender_party, borrower_party, project_id, project_name,
  drawdown_ref, facility_ref, tranche_tier, tranche_amount_zar, released_zar,
  invoices_amount_zar, reconciled_amount_zar, invoice_count, uop_category,
  ie_firm, ie_certificate_ref, sarb_exchange_control_ref,
  chain_status,
  tranche_released_at, invoices_pending_at, invoices_submitted_at, bank_validating_at,
  ie_certifying_at, uop_certified_at, reconciled_at,
  created_by, created_at, updated_at
) VALUES (
  'dsb_007', 'UOP-SBG-2026-0007', 'Standard Bank Group', 'Hartebeespoort BESS (Pty) Ltd',
  'proj_hartebees_bess', 'Hartebeespoort BESS 50MW/200MWh',
  'dd_012', 'FAC-SBG-2026-0143', 'senior_b', 165000000, 165000000,
  165800000, 165000000, 19, 'EPC milestone 6 — commissioning',
  'AECOM SA', 'IE-AEC-2026-0019', 'SARB-EXC-2026-0142',
  'reconciled',
  '2026-02-14T10:00:00Z', '2026-02-15T08:00:00Z', '2026-03-02T13:00:00Z', '2026-03-05T09:00:00Z',
  '2026-03-12T11:00:00Z', '2026-04-08T14:00:00Z', '2026-04-12T16:00:00Z',
  'system', '2026-02-14T10:00:00Z', '2026-04-12T16:00:00Z'
);

-- 8. clawback_executed (terminal bad — UoP failure, lender clawing back)
INSERT OR IGNORE INTO oe_disbursement_cases (
  id, case_number, lender_party, borrower_party, project_id, project_name,
  drawdown_ref, facility_ref, tranche_tier, tranche_amount_zar, released_zar,
  invoices_amount_zar, clawback_amount_zar, invoice_count, uop_category,
  ie_firm, ie_certificate_ref, sarb_exchange_control_ref, equator_principles_ref,
  regulator_authority, regulator_ref, reason_code, rod_notes,
  chain_status,
  tranche_released_at, invoices_pending_at, invoices_submitted_at, bank_validating_at,
  ie_certifying_at, clawback_executed_at,
  created_by, created_at, updated_at
) VALUES (
  'dsb_008', 'UOP-IVT-2026-0008', 'Investec Bank', 'Coega Industrial Solar (Pty) Ltd',
  'proj_coega_solar', 'Coega Industrial Solar 75MW',
  'dd_013', 'FAC-IVT-2026-0028', 'senior_a', 510000000, 510000000,
  510000000, 78500000, 28, 'EPC milestone 3 — modules',
  'Mott MacDonald SA', 'IE-MOT-2026-0061', 'SARB-EXC-2026-0119', 'EP-IVT-2026-0044',
  'SARB_EXCHANGE_CONTROL', 'SARB-EXC-2026-0119',
  'uop_misallocation', 'IE found R78.5m allocated to non-EPC corporate overhead — clawback notice 2026-05-12, repayment due 30 days.',
  'clawback_executed',
  '2026-01-08T09:00:00Z', '2026-01-09T08:00:00Z', '2026-01-22T16:00:00Z', '2026-01-25T09:00:00Z',
  '2026-02-15T11:00:00Z', '2026-05-12T15:00:00Z',
  'system', '2026-01-08T09:00:00Z', '2026-05-12T15:00:00Z'
);

-- 9. waived (terminal special — board exception per facility agreement)
INSERT OR IGNORE INTO oe_disbursement_cases (
  id, case_number, lender_party, borrower_party, project_id, project_name,
  drawdown_ref, facility_ref, tranche_tier, tranche_amount_zar, released_zar,
  uop_category, rod_notes,
  chain_status,
  tranche_released_at, invoices_pending_at, waived_at,
  created_by, created_at, updated_at
) VALUES (
  'dsb_009', 'UOP-NDB-2026-0009', 'Nedbank CIB', 'Riebeeckstad Solar Phase 1 (Pty) Ltd',
  'proj_riebeeckstad_1', 'Riebeeckstad Solar 60MW Phase 1',
  'dd_014', 'FAC-NDB-2026-0082', 'bridge', 8000000, 8000000,
  'Short-dated bridge — site security upgrade',
  'Board exception — emergency security spend per FAC s14.3 waiver clause; invoiced separately via OPEX facility on 2026-05-18.',
  'waived',
  '2026-05-02T11:00:00Z', '2026-05-03T08:00:00Z', '2026-05-18T14:00:00Z',
  'system', '2026-05-02T11:00:00Z', '2026-05-18T14:00:00Z'
);

-- 10. uop_certified (mezzanine — second case, different lender/borrower)
INSERT OR IGNORE INTO oe_disbursement_cases (
  id, case_number, lender_party, borrower_party, project_id, project_name,
  drawdown_ref, facility_ref, tranche_tier, tranche_amount_zar, released_zar,
  invoices_amount_zar, invoice_count, uop_category, ie_firm, ie_certificate_ref,
  chain_status,
  tranche_released_at, invoices_pending_at, invoices_submitted_at, bank_validating_at,
  ie_certifying_at, uop_certified_at, sla_deadline_at,
  created_by, created_at, updated_at
) VALUES (
  'dsb_010', 'UOP-ABC-2026-0010', 'ABSA Capital', 'Sere Wind Repower (Pty) Ltd',
  'proj_sere_repower', 'Sere Wind Repower 105MW',
  'dd_015', 'FAC-ABC-2026-0057', 'senior_a', 320000000, 320000000,
  320600000, 31, 'EPC milestone 4 — turbine commissioning',
  'WSP South Africa', 'IE-WSP-2026-0058',
  'uop_certified',
  '2026-04-05T08:00:00Z', '2026-04-06T08:00:00Z', '2026-04-20T13:00:00Z', '2026-04-22T09:00:00Z',
  '2026-04-28T10:00:00Z', '2026-05-25T15:30:00Z',
  '2026-06-01T15:30:00Z',
  'system', '2026-04-05T08:00:00Z', '2026-05-25T15:30:00Z'
);

-- Audit events (compressed — one per forward transition + branch terminals)
INSERT OR IGNORE INTO oe_disbursement_events (id, disbursement_id, event_type, from_status, to_status, actor_id, notes, created_at) VALUES
  ('dsb_evt_001a', 'dsb_001', 'tranche_released',     NULL,                'tranche_released',     'system',     'Drawdown dd_006 funded R285m, UoP reconciliation opened', '2026-05-26T08:00:00Z'),
  ('dsb_evt_002a', 'dsb_002', 'tranche_released',     NULL,                'tranche_released',     'system',     'Drawdown dd_007 funded R420m, UoP reconciliation opened', '2026-05-20T10:00:00Z'),
  ('dsb_evt_002b', 'dsb_002', 'invoices_pending',     'tranche_released',  'invoices_pending',     'rmb_uop',    'Invoice request issued to borrower 2026-05-21', '2026-05-21T08:00:00Z'),
  ('dsb_evt_003a', 'dsb_003', 'tranche_released',     NULL,                'tranche_released',     'system',     'Drawdown dd_008 funded R78m, UoP reconciliation opened', '2026-05-15T09:00:00Z'),
  ('dsb_evt_003b', 'dsb_003', 'invoices_pending',     'tranche_released',  'invoices_pending',     'absa_uop',   'Invoice request issued', '2026-05-16T08:00:00Z'),
  ('dsb_evt_003c', 'dsb_003', 'invoices_submitted',   'invoices_pending',  'invoices_submitted',   'kuruman_fm', '14 invoices R78.4m submitted: BoP balance + civils retention', '2026-05-25T14:30:00Z'),
  ('dsb_evt_004a', 'dsb_004', 'tranche_released',     NULL,                'tranche_released',     'system',     'Drawdown dd_009 funded R612m, UoP reconciliation opened', '2026-05-08T11:00:00Z'),
  ('dsb_evt_004b', 'dsb_004', 'invoices_pending',     'tranche_released',  'invoices_pending',     'ivt_uop',    'Invoice request issued', '2026-05-09T08:00:00Z'),
  ('dsb_evt_004c', 'dsb_004', 'invoices_submitted',   'invoices_pending',  'invoices_submitted',   'xina_fm',    '38 invoices R624.5m submitted: molten salt loop EPC milestone 5', '2026-05-18T16:00:00Z'),
  ('dsb_evt_004d', 'dsb_004', 'bank_validating',      'invoices_submitted', 'bank_validating',     'ivt_uop',    'Bank front-office line-by-line validation in progress', '2026-05-22T09:00:00Z'),
  ('dsb_evt_005a', 'dsb_005', 'tranche_released',     NULL,                'tranche_released',     'system',     'Drawdown dd_010 funded R198m, UoP reconciliation opened', '2026-04-22T08:00:00Z'),
  ('dsb_evt_005b', 'dsb_005', 'invoices_pending',     'tranche_released',  'invoices_pending',     'ndb_uop',    'Invoice request issued', '2026-04-23T08:00:00Z'),
  ('dsb_evt_005c', 'dsb_005', 'invoices_submitted',   'invoices_pending',  'invoices_submitted',   'aggeneys_fm','22 invoices R201.2m submitted: substation construction milestone 4', '2026-05-05T11:00:00Z'),
  ('dsb_evt_005d', 'dsb_005', 'bank_validating',      'invoices_submitted', 'bank_validating',     'ndb_uop',    'Bank validation complete, IE site visit requested', '2026-05-08T09:00:00Z'),
  ('dsb_evt_005e', 'dsb_005', 'ie_certifying',        'bank_validating',   'ie_certifying',       'ndb_uop',    'Mott MacDonald engaged, site visit scheduled 2026-05-20', '2026-05-15T14:00:00Z'),
  ('dsb_evt_006a', 'dsb_006', 'tranche_released',     NULL,                'tranche_released',     'system',     'Drawdown dd_011 funded R42m mezz, UoP reconciliation opened', '2026-03-10T08:00:00Z'),
  ('dsb_evt_006b', 'dsb_006', 'invoices_pending',     'tranche_released',  'invoices_pending',     'rmb_uop',    'Invoice request issued', '2026-03-11T08:00:00Z'),
  ('dsb_evt_006c', 'dsb_006', 'invoices_submitted',   'invoices_pending',  'invoices_submitted',   'mooi_fm',    '9 invoices R42.1m submitted: BoP final + civils retention', '2026-03-25T15:00:00Z'),
  ('dsb_evt_006d', 'dsb_006', 'bank_validating',      'invoices_submitted', 'bank_validating',     'rmb_uop',    'Bank validation complete', '2026-03-28T09:00:00Z'),
  ('dsb_evt_006e', 'dsb_006', 'ie_certifying',        'bank_validating',   'ie_certifying',       'rmb_uop',    'WSP SA site visit scheduled 2026-04-15', '2026-04-02T08:00:00Z'),
  ('dsb_evt_006f', 'dsb_006', 'uop_certified',        'ie_certifying',     'uop_certified',       'wsp_ie',     'IE certificate IE-WSP-2026-0044 issued, UoP confirmed against milestone 5', '2026-05-22T16:00:00Z'),
  ('dsb_evt_007a', 'dsb_007', 'tranche_released',     NULL,                'tranche_released',     'system',     'Drawdown dd_012 funded R165m, UoP reconciliation opened', '2026-02-14T10:00:00Z'),
  ('dsb_evt_007b', 'dsb_007', 'invoices_pending',     'tranche_released',  'invoices_pending',     'sbg_uop',    'Invoice request issued', '2026-02-15T08:00:00Z'),
  ('dsb_evt_007c', 'dsb_007', 'invoices_submitted',   'invoices_pending',  'invoices_submitted',   'hbees_fm',   '19 invoices R165.8m submitted: commissioning EPC milestone 6', '2026-03-02T13:00:00Z'),
  ('dsb_evt_007d', 'dsb_007', 'bank_validating',      'invoices_submitted', 'bank_validating',     'sbg_uop',    'Bank validation complete', '2026-03-05T09:00:00Z'),
  ('dsb_evt_007e', 'dsb_007', 'ie_certifying',        'bank_validating',   'ie_certifying',       'sbg_uop',    'AECOM SA engaged', '2026-03-12T11:00:00Z'),
  ('dsb_evt_007f', 'dsb_007', 'uop_certified',        'ie_certifying',     'uop_certified',       'aec_ie',     'IE certificate IE-AEC-2026-0019 issued', '2026-04-08T14:00:00Z'),
  ('dsb_evt_007g', 'dsb_007', 'reconciled',           'uop_certified',     'reconciled',          'sbg_uop',    'Reconciliation closed R165m, SARB-EXC-2026-0142 lodged', '2026-04-12T16:00:00Z'),
  ('dsb_evt_008a', 'dsb_008', 'tranche_released',     NULL,                'tranche_released',     'system',     'Drawdown dd_013 funded R510m senior_a, UoP reconciliation opened', '2026-01-08T09:00:00Z'),
  ('dsb_evt_008b', 'dsb_008', 'invoices_pending',     'tranche_released',  'invoices_pending',     'ivt_uop',    'Invoice request issued', '2026-01-09T08:00:00Z'),
  ('dsb_evt_008c', 'dsb_008', 'invoices_submitted',   'invoices_pending',  'invoices_submitted',   'coega_fm',   '28 invoices R510m submitted: modules EPC milestone 3', '2026-01-22T16:00:00Z'),
  ('dsb_evt_008d', 'dsb_008', 'bank_validating',      'invoices_submitted', 'bank_validating',     'ivt_uop',    'Bank validation flagged R78.5m as outside EPC scope', '2026-01-25T09:00:00Z'),
  ('dsb_evt_008e', 'dsb_008', 'ie_certifying',        'bank_validating',   'ie_certifying',       'ivt_uop',    'Mott MacDonald engaged for forensic review', '2026-02-15T11:00:00Z'),
  ('dsb_evt_008f', 'dsb_008', 'clawback_executed',    'ie_certifying',     'clawback_executed',   'ivt_credit', 'IE found R78.5m allocated to non-EPC corporate overhead — clawback notice issued, 30 days to repay; SARB-EXC-2026-0119 lodged, EP-IVT-2026-0044 secretariat notified', '2026-05-12T15:00:00Z'),
  ('dsb_evt_009a', 'dsb_009', 'tranche_released',     NULL,                'tranche_released',     'system',     'Drawdown dd_014 funded R8m bridge, UoP reconciliation opened', '2026-05-02T11:00:00Z'),
  ('dsb_evt_009b', 'dsb_009', 'invoices_pending',     'tranche_released',  'invoices_pending',     'ndb_uop',    'Invoice request issued', '2026-05-03T08:00:00Z'),
  ('dsb_evt_009c', 'dsb_009', 'waived',               'invoices_pending',  'waived',              'ndb_credit', 'Board exception per FAC s14.3 — emergency security spend, invoiced via OPEX facility', '2026-05-18T14:00:00Z'),
  ('dsb_evt_010a', 'dsb_010', 'tranche_released',     NULL,                'tranche_released',     'system',     'Drawdown dd_015 funded R320m, UoP reconciliation opened', '2026-04-05T08:00:00Z'),
  ('dsb_evt_010b', 'dsb_010', 'invoices_pending',     'tranche_released',  'invoices_pending',     'absa_uop',   'Invoice request issued', '2026-04-06T08:00:00Z'),
  ('dsb_evt_010c', 'dsb_010', 'invoices_submitted',   'invoices_pending',  'invoices_submitted',   'sere_fm',    '31 invoices R320.6m submitted: turbine commissioning milestone 4', '2026-04-20T13:00:00Z'),
  ('dsb_evt_010d', 'dsb_010', 'bank_validating',      'invoices_submitted', 'bank_validating',     'absa_uop',   'Bank validation complete', '2026-04-22T09:00:00Z'),
  ('dsb_evt_010e', 'dsb_010', 'ie_certifying',        'bank_validating',   'ie_certifying',       'absa_uop',   'WSP SA engaged', '2026-04-28T10:00:00Z'),
  ('dsb_evt_010f', 'dsb_010', 'uop_certified',        'ie_certifying',     'uop_certified',       'wsp_ie',     'IE certificate IE-WSP-2026-0058 issued, UoP confirmed', '2026-05-25T15:30:00Z');
