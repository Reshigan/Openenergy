-- Settlement page demo seed. The existing 20 invoices were all status='paid'
-- so the dashboard rendered with zero KPIs and empty tabs. Mix in real
-- outstanding / overdue / disputed / unreconciled / broken rows so the
-- Settlement video shot (Beat 6.x in script-2026-05-25.md) lands on a
-- dashboard that looks alive.
--
-- All inserts are idempotent (INSERT OR IGNORE).

-- ───────────────────────── New invoices (15 rows, varied statuses) ─────────────────────────
-- IDs start at inv_101 to avoid collisions with the existing inv_001..020.
INSERT OR IGNORE INTO invoices
  (id, invoice_number, match_id, project_id, from_participant_id, to_participant_id,
   invoice_type, period_start, period_end,
   line_items, subtotal, vat_rate, vat_amount, total_amount, currency,
   status, due_date, issued_at, paid_at, paid_amount,
   notes, created_at, updated_at, confirmation_status)
VALUES
  -- OUTSTANDING (issued, due in future)
  ('inv_101', 'INV-2026-101', NULL, 'ip_001', 'demo_ipp_001', 'demo_offtaker_001',
   'energy', '2026-05-01', '2026-05-31',
   '[{"desc":"PPA May 2026 — Klerksdorp 50MW","amount":2750000}]', 2750000, 0.15, 412500, 3162500, 'ZAR',
   'issued', '2026-06-15', datetime('now', '-7 days'), NULL, NULL,
   'May 2026 PPA settlement', datetime('now', '-7 days'), datetime('now', '-7 days'), 'pending'),
  ('inv_102', 'INV-2026-102', NULL, 'ip_002', 'demo_ipp_001', 'demo_offtaker_001',
   'energy', '2026-05-01', '2026-05-31',
   '[{"desc":"PPA May 2026 — Mookgopong 40MW Wind","amount":1850000}]', 1850000, 0.15, 277500, 2127500, 'ZAR',
   'issued', '2026-06-20', datetime('now', '-5 days'), NULL, NULL,
   'May 2026 PPA settlement — wind', datetime('now', '-5 days'), datetime('now', '-5 days'), 'pending'),
  ('inv_103', 'INV-2026-103', NULL, NULL, 'demo_admin_001', 'demo_trader_001',
   'management', '2026-05-01', '2026-05-31',
   '[{"desc":"Platform fees — May 2026","amount":425000}]', 425000, 0.15, 63750, 488750, 'ZAR',
   'issued', '2026-06-10', datetime('now', '-3 days'), NULL, NULL,
   'Monthly platform invoice', datetime('now', '-3 days'), datetime('now', '-3 days'), 'pending'),

  -- OVERDUE (issued, due_date in past, not paid)
  ('inv_104', 'INV-2026-104', NULL, 'ip_003', 'demo_ipp_002', 'demo_offtaker_001',
   'energy', '2026-04-01', '2026-04-30',
   '[{"desc":"PPA April 2026 — Brits 25MW Solar","amount":1380000}]', 1380000, 0.15, 207000, 1587000, 'ZAR',
   'overdue', '2026-05-15', datetime('now', '-35 days'), NULL, NULL,
   'Overdue — escalation tier 1', datetime('now', '-35 days'), datetime('now', '-9 days'), 'pending'),
  ('inv_105', 'INV-2026-105', NULL, NULL, 'demo_trader_001', 'demo_admin_001',
   'balancing', '2026-04-15', '2026-04-30',
   '[{"desc":"Late settlement penalty","amount":82500}]', 82500, 0.15, 12375, 94875, 'ZAR',
   'overdue', '2026-05-10', datetime('now', '-40 days'), NULL, NULL,
   'Overdue — 14 days past due', datetime('now', '-40 days'), datetime('now', '-14 days'), 'pending'),

  -- DISPUTED (real disputes table populated below)
  ('inv_106', 'INV-2026-106', NULL, 'ip_004', 'demo_ipp_002', 'demo_offtaker_001',
   'energy', '2026-04-01', '2026-04-30',
   '[{"desc":"PPA April 2026 — De Aar 75MW","amount":4125000}]', 4125000, 0.15, 618750, 4743750, 'ZAR',
   'disputed', '2026-05-25', datetime('now', '-25 days'), NULL, NULL,
   'Dispute filed by offtaker — metering mismatch', datetime('now', '-25 days'), datetime('now', '-2 days'), 'disputed'),
  ('inv_107', 'INV-2026-107', NULL, 'ip_005', 'demo_ipp_001', 'demo_offtaker_001',
   'energy', '2026-04-01', '2026-04-30',
   '[{"desc":"PPA April 2026 — Jeffreys Bay 120MW Wind","amount":6450000}]', 6450000, 0.15, 967500, 7417500, 'ZAR',
   'disputed', '2026-05-28', datetime('now', '-22 days'), NULL, NULL,
   'Dispute filed — wheeling-loss calculation', datetime('now', '-22 days'), datetime('now', '-1 days'), 'disputed'),

  -- PARTIALLY PAID (issued, partial payment received)
  ('inv_108', 'INV-2026-108', NULL, 'ip_006', 'demo_ipp_001', 'demo_offtaker_001',
   'energy', '2026-04-01', '2026-04-30',
   '[{"desc":"PPA April 2026 — Upington 200MW CSP","amount":8200000}]', 8200000, 0.15, 1230000, 9430000, 'ZAR',
   'issued', '2026-06-15', datetime('now', '-20 days'), NULL, 5000000,
   'Partial payment R5M received 2026-05-18', datetime('now', '-20 days'), datetime('now', '-7 days'), 'pending'),

  -- PAID (recent — for the paid-this-month KPI)
  ('inv_109', 'INV-2026-109', NULL, 'ip_007', 'demo_ipp_001', 'demo_offtaker_001',
   'energy', '2026-04-01', '2026-04-30',
   '[{"desc":"PPA April 2026 — Gqeberha Port Wind","amount":2150000}]', 2150000, 0.15, 322500, 2472500, 'ZAR',
   'paid', '2026-05-15', datetime('now', '-25 days'), datetime('now', '-3 days'), 2472500,
   'Paid in full', datetime('now', '-25 days'), datetime('now', '-3 days'), 'confirmed'),
  ('inv_110', 'INV-2026-110', NULL, NULL, 'demo_admin_001', 'demo_carbon_001',
   'management', '2026-04-01', '2026-04-30',
   '[{"desc":"Platform fees — April 2026","amount":215000}]', 215000, 0.15, 32250, 247250, 'ZAR',
   'paid', '2026-05-10', datetime('now', '-32 days'), datetime('now', '-8 days'), 247250,
   'Paid via EFT', datetime('now', '-32 days'), datetime('now', '-8 days'), 'confirmed'),

  -- ISSUED — broader spread for charts
  ('inv_111', 'INV-2026-111', NULL, 'ip_001', 'demo_ipp_001', 'demo_offtaker_001',
   'energy', '2026-03-01', '2026-03-31',
   '[{"desc":"PPA March 2026 — Klerksdorp","amount":2680000}]', 2680000, 0.15, 402000, 3082000, 'ZAR',
   'paid', '2026-04-15', datetime('now', '-65 days'), datetime('now', '-50 days'), 3082000,
   'Historical paid', datetime('now', '-65 days'), datetime('now', '-50 days'), 'confirmed'),
  ('inv_112', 'INV-2026-112', NULL, 'ip_002', 'demo_ipp_001', 'demo_offtaker_001',
   'energy', '2026-03-01', '2026-03-31',
   '[{"desc":"PPA March 2026 — Mookgopong","amount":1820000}]', 1820000, 0.15, 273000, 2093000, 'ZAR',
   'paid', '2026-04-20', datetime('now', '-60 days'), datetime('now', '-42 days'), 2093000,
   'Historical paid', datetime('now', '-60 days'), datetime('now', '-42 days'), 'confirmed'),
  ('inv_113', 'INV-2026-113', NULL, 'ip_003', 'demo_ipp_002', 'demo_offtaker_001',
   'energy', '2026-03-01', '2026-03-31',
   '[{"desc":"PPA March 2026 — Brits","amount":1320000}]', 1320000, 0.15, 198000, 1518000, 'ZAR',
   'paid', '2026-04-25', datetime('now', '-55 days'), datetime('now', '-38 days'), 1518000,
   'Historical paid', datetime('now', '-55 days'), datetime('now', '-38 days'), 'confirmed'),
  ('inv_114', 'INV-2026-114', NULL, NULL, 'demo_trader_001', 'demo_admin_001',
   'balancing', '2026-05-01', '2026-05-15',
   '[{"desc":"Q2 settlement clearing fee","amount":195000}]', 195000, 0.15, 29250, 224250, 'ZAR',
   'issued', '2026-06-15', datetime('now', '-2 days'), NULL, NULL,
   'Issued today — pending payment', datetime('now', '-2 days'), datetime('now', '-2 days'), 'pending'),
  ('inv_115', 'INV-2026-115', NULL, 'ip_004', 'demo_ipp_002', 'demo_offtaker_001',
   'energy', '2026-05-01', '2026-05-15',
   '[{"desc":"PPA mid-May 2026 — De Aar","amount":2100000}]', 2100000, 0.15, 315000, 2415000, 'ZAR',
   'issued', '2026-06-30', datetime('now', '-1 days'), NULL, NULL,
   'Mid-month settlement', datetime('now', '-1 days'), datetime('now', '-1 days'), 'pending');

-- ───────────────────────── Payments (12 rows; mix reconciled / unreconciled) ─────────────────────────
INSERT OR IGNORE INTO payments
  (id, invoice_id, payment_reference, amount, currency, payment_method,
   payment_date, bank_reference, reconciled, reconciled_by, reconciled_at, notes, created_at)
VALUES
  ('pay_001', 'inv_109', 'PR-2026-09-001', 2472500, 'ZAR', 'eft',
   datetime('now', '-3 days'), 'ABSA-REF-44291', 1, 'demo_support_001', datetime('now', '-2 days'),
   'Auto-reconciled via bank feed', datetime('now', '-3 days')),
  ('pay_002', 'inv_110', 'PR-2026-09-002', 247250, 'ZAR', 'eft',
   datetime('now', '-8 days'), 'FNB-REF-78112', 1, 'demo_support_001', datetime('now', '-7 days'),
   'Auto-reconciled', datetime('now', '-8 days')),
  ('pay_003', 'inv_108', 'PR-2026-09-003', 5000000, 'ZAR', 'eft',
   datetime('now', '-18 days'), 'STD-REF-22310', 1, 'demo_support_001', datetime('now', '-17 days'),
   'Partial payment — R4.43M still due', datetime('now', '-18 days')),
  ('pay_004', 'inv_111', 'PR-2026-09-004', 3082000, 'ZAR', 'eft',
   datetime('now', '-50 days'), 'ABSA-REF-39901', 1, 'demo_support_001', datetime('now', '-49 days'),
   'Reconciled', datetime('now', '-50 days')),
  ('pay_005', 'inv_112', 'PR-2026-09-005', 2093000, 'ZAR', 'eft',
   datetime('now', '-42 days'), 'FNB-REF-44091', 1, 'demo_support_001', datetime('now', '-41 days'),
   'Reconciled', datetime('now', '-42 days')),
  ('pay_006', 'inv_113', 'PR-2026-09-006', 1518000, 'ZAR', 'eft',
   datetime('now', '-38 days'), 'NEDB-REF-11220', 1, 'demo_support_001', datetime('now', '-37 days'),
   'Reconciled', datetime('now', '-38 days')),
  -- UNRECONCILED — sitting in the queue, will surface on the dashboard
  ('pay_007', 'inv_101', 'PR-2026-09-007', 3162500, 'ZAR', 'eft',
   datetime('now', '-1 days'), 'STD-REF-91233', 0, NULL, NULL,
   'Unreconciled — needs manual match', datetime('now', '-1 days')),
  ('pay_008', 'inv_102', 'PR-2026-09-008', 2127500, 'ZAR', 'eft',
   datetime('now', '-1 days'), 'ABSA-REF-91234', 0, NULL, NULL,
   'Unreconciled — bank reference mismatch', datetime('now', '-1 days')),
  ('pay_009', 'inv_115', 'PR-2026-09-009', 850000, 'ZAR', 'eft',
   datetime('now', '-2 days'), 'FNB-REF-99001', 0, NULL, NULL,
   'Unmatched receipt — bank reference unclear', datetime('now', '-2 days')),
  ('pay_010', 'inv_103', 'PR-2026-09-010', 488750, 'ZAR', 'eft',
   datetime('now'), 'NEDB-REF-77881', 0, NULL, NULL,
   'Unreconciled — same-day receipt', datetime('now')),
  ('pay_011', 'inv_114', 'PR-2026-09-011', 224250, 'ZAR', 'eft',
   datetime('now'), 'ABSA-REF-77882', 0, NULL, NULL,
   'Unreconciled — pending bank feed sync', datetime('now')),
  ('pay_012', 'inv_115', 'PR-2026-09-012', 1200000, 'ZAR', 'eft',
   datetime('now'), 'STD-REF-77883', 0, NULL, NULL,
   'Partial — only R1.2M of R2.4M received', datetime('now'));

-- ───────────────────────── Disputes (3 open + 2 resolved) ─────────────────────────
INSERT OR IGNORE INTO settlement_disputes
  (id, invoice_id, filed_by, reason, evidence_keys, status,
   resolution, resolved_by, resolved_at, created_at, updated_at)
VALUES
  ('disp_001', 'inv_106', 'demo_offtaker_001',
   'Metering data shows 1,840 MWh delivered; invoice charges for 1,920 MWh — 80 MWh discrepancy',
   '["metering/2026-04-de-aar.csv","metering/grid-export-2026-04.pdf"]',
   'open', NULL, NULL, NULL, datetime('now', '-2 days'), datetime('now', '-2 days')),
  ('disp_002', 'inv_107', 'demo_offtaker_001',
   'Wheeling-loss factor used (3.8%) does not match contracted ceiling (3.2%)',
   '["contract/jeffreys-bay-wheeling-addendum.pdf","metering/jb-wind-2026-04.csv"]',
   'open', NULL, NULL, NULL, datetime('now', '-1 days'), datetime('now', '-1 days')),
  ('disp_003', 'inv_104', 'demo_offtaker_001',
   'Late-payment penalty applied prematurely — invoice was queried within dispute window',
   '["correspondence/late-fee-2026-05-12.eml"]',
   'open', NULL, NULL, NULL, datetime('now', '-3 days'), datetime('now', '-3 days')),
  -- Resolved (for the historical strip)
  ('disp_004', 'inv_009', 'demo_offtaker_001',
   'Carbon attribute mismatch — REC certificates short by 12 units',
   '["rec/audit-2026-q1.pdf"]',
   'resolved', 'Credit note issued for 12 RECs', 'demo_support_001', datetime('now', '-12 days'),
   datetime('now', '-21 days'), datetime('now', '-12 days')),
  ('disp_005', 'inv_011', 'demo_ipp_001',
   'VAT calculation error',
   '["audit/vat-recomputation.pdf"]',
   'resolved', 'Reissued with corrected VAT', 'demo_support_001', datetime('now', '-18 days'),
   datetime('now', '-26 days'), datetime('now', '-18 days'));

-- ───────────────────────── Settlement breaks (6 rows) ─────────────────────────
INSERT OR IGNORE INTO settlement_breaks
  (id, invoice_id, break_type, severity, status, reported_by, reported_at,
   reason, expected_value, actual_value, resolution_outcome, resolution_notes,
   resolved_at, resolved_by, created_at, updated_at)
VALUES
  ('brk_001', 'inv_106', 'quantity', 'high', 'open',
   'demo_support_001', datetime('now', '-2 days'),
   'Metered volume 1840 MWh, invoiced volume 1920 MWh',
   1840, 1920, NULL, NULL, NULL, NULL,
   datetime('now', '-2 days'), datetime('now', '-2 days')),
  ('brk_002', 'inv_107', 'price', 'medium', 'investigating',
   'demo_support_001', datetime('now', '-1 days'),
   'Wheeling-loss factor 3.8% applied; contract ceiling 3.2%',
   3.2, 3.8, NULL, NULL, NULL, NULL,
   datetime('now', '-1 days'), datetime('now', '-1 days')),
  ('brk_003', 'inv_104', 'tariff', 'low', 'open',
   'demo_support_001', datetime('now', '-3 days'),
   'Late-fee applied within dispute window — flag for review',
   0, 82500, NULL, NULL, NULL, NULL,
   datetime('now', '-3 days'), datetime('now', '-3 days')),
  ('brk_004', 'inv_108', 'other', 'medium', 'investigating',
   'demo_support_001', datetime('now', '-18 days'),
   'Partial payment R5M received against R9.43M invoice',
   9430000, 5000000, NULL, NULL, NULL, NULL,
   datetime('now', '-18 days'), datetime('now', '-7 days')),
  -- Resolved
  ('brk_005', 'inv_009', 'metering', 'medium', 'resolved',
   'demo_support_001', datetime('now', '-21 days'),
   'REC count short by 12 units',
   5000, 4988,
   'rebooked', 'Credit note for 12 RECs issued and reconciled',
   datetime('now', '-12 days'), 'demo_support_001',
   datetime('now', '-21 days'), datetime('now', '-12 days')),
  ('brk_006', 'inv_011', 'other', 'low', 'resolved',
   'demo_support_001', datetime('now', '-26 days'),
   'VAT base computed on pre-discount line items',
   198000, 215000,
   'corrected', 'Invoice reissued with corrected VAT',
   datetime('now', '-18 days'), 'demo_support_001',
   datetime('now', '-26 days'), datetime('now', '-18 days'));

-- ───────────────────────── Settlement fees (8 rows) ─────────────────────────
INSERT OR IGNORE INTO settlement_fees
  (id, invoice_id, fee_type, basis, amount_zar, reason, calc_rule_version, calculated_at)
VALUES
  ('fee_001', 'inv_101', 'admin',           'notional', 31625, '1.0% clearing fee on R3.16M',                       'v1.4', datetime('now', '-7 days')),
  ('fee_002', 'inv_102', 'admin',           'notional', 21275, '1.0% clearing fee on R2.13M',                       'v1.4', datetime('now', '-5 days')),
  ('fee_003', 'inv_104', 'late_payment',    'flat',     15870, '1.0% late-payment penalty on R1.59M',               'v1.4', datetime('now', '-9 days')),
  ('fee_004', 'inv_106', 'admin',           'flat',      4750, 'Dispute administration fee',                        'v1.5', datetime('now', '-2 days')),
  ('fee_005', 'inv_107', 'admin',           'flat',      4750, 'Dispute administration fee',                        'v1.5', datetime('now', '-1 days')),
  ('fee_006', 'inv_108', 'wheeling_uplift', 'volume',   47150, 'Wheeling charge — Eskom transmission corridor',     'v1.4', datetime('now', '-20 days')),
  ('fee_007', 'inv_109', 'wheeling_uplift', 'volume',   24725, 'Wheeling charge — Port Elizabeth distribution',     'v1.4', datetime('now', '-25 days')),
  ('fee_008', 'inv_110', 'dunning',         'notional',  2472, '1.0% platform fee on R247K',                        'v1.4', datetime('now', '-32 days'));
