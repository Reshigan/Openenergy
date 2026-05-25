-- 086 — Backfill so every role's launch board hero reads non-zero.
--
-- Touches:
--   • covenants.project_id (6 rows currently NULL) → ip_001/ip_002/ip_003
--   • covenant_tests       → 2 breaches so lender hero shows breaches
--   • contract_documents   → 3 active PPAs for demo_offtaker_001
--   • invoices             → 4 invoices to pay (1 overdue) for demo_offtaker_001
--
-- All statements use UPDATE / INSERT OR IGNORE so this migration is
-- idempotent and safe to re-apply.

-- ─── Covenants — give every covenant a real project so facilities_count > 0
UPDATE covenants SET project_id = 'ip_001' WHERE id IN ('cov-vid-01','cov-vid-02') AND project_id IS NULL;
UPDATE covenants SET project_id = 'ip_002' WHERE id IN ('cov-vid-03','cov-vid-04') AND project_id IS NULL;
UPDATE covenants SET project_id = 'ip_003' WHERE id IN ('cov-vid-05','cov-vid-06') AND project_id IS NULL;

-- ─── Covenant tests — 2 breaches so lender hero shows breaches > 0.
-- tested_by left NULL (FK to participants → no synthetic 'system_l5_eval' actor).
INSERT OR IGNORE INTO covenant_tests
  (id, covenant_id, test_period, test_date, measured_value, result, narrative, tested_by, created_at)
VALUES
  ('cvt-vid-01', 'cov-vid-01', '2026Q1', date('now','-15 days'), 1.18, 'breach',
   'DSCR fell below the 1.20 threshold for the period — escalate to workout queue.',
   NULL, datetime('now','-15 days')),
  ('cvt-vid-02', 'cov-vid-04', '2026Q1', date('now','-9 days'),  92.4, 'breach',
   'Plant availability below the 95% covenant for two consecutive months.',
   NULL, datetime('now','-9 days'));

-- ─── PPAs — 3 active contracts where demo_offtaker_001 is the counterparty.
-- document_type allowed values: loi, term_sheet, hoa, ppa_wheeling, ppa_btm,
-- carbon_purchase, carbon_option_isda, forward, epc, wheeling_agreement,
-- offtake_agreement, nda.
INSERT OR IGNORE INTO contract_documents
  (id, title, document_type, phase, creator_id, counterparty_id, project_id, version, created_at, updated_at)
VALUES
  ('ppa-vid-01', 'Klerksdorp 50MW Solar PPA',  'ppa_wheeling', 'active', 'demo_ipp_001', 'demo_offtaker_001', 'ip_001', 'v1.0', datetime('now','-180 days'), datetime('now','-180 days')),
  ('ppa-vid-02', 'Mookgopong 40MW Wind PPA',   'ppa_wheeling', 'active', 'demo_ipp_002', 'demo_offtaker_001', 'ip_002', 'v1.0', datetime('now','-120 days'), datetime('now','-120 days')),
  ('ppa-vid-03', 'Brits 25MW Rooftop PPA',     'ppa_btm',      'active', 'demo_ipp_001', 'demo_offtaker_001', 'ip_003', 'v1.0', datetime('now','-60 days'),  datetime('now','-60 days'));

-- ─── Invoices to pay — 4 outstanding, 1 overdue.
-- invoice_type allowed: energy, capacity, carbon, ancillary, balancing, disbursement, management.
INSERT OR IGNORE INTO invoices
  (id, invoice_number, project_id, from_participant_id, to_participant_id, invoice_type,
   period_start, period_end, line_items, subtotal, vat_rate, vat_amount, total_amount,
   currency, status, due_date, issued_at, created_at, updated_at)
VALUES
  ('inv-vid-01', 'INV-2026-0241', 'ip_001', 'demo_ipp_001', 'demo_offtaker_001', 'energy',
   date('now','-31 days'), date('now','-1 day'), '[]', 1850000, 0.15, 277500, 2127500,
   'ZAR', 'overdue', date('now','-3 days'),  datetime('now','-12 days'), datetime('now','-12 days'), datetime('now','-12 days')),
  ('inv-vid-02', 'INV-2026-0242', 'ip_002', 'demo_ipp_002', 'demo_offtaker_001', 'energy',
   date('now','-30 days'), date('now'),       '[]', 2240000, 0.15, 336000, 2576000,
   'ZAR', 'issued',  date('now','+12 days'), datetime('now','-2 days'),  datetime('now','-2 days'),  datetime('now','-2 days')),
  ('inv-vid-03', 'INV-2026-0243', 'ip_003', 'demo_ipp_001', 'demo_offtaker_001', 'energy',
   date('now','-29 days'), date('now','+1 day'), '[]', 760000, 0.15, 114000, 874000,
   'ZAR', 'issued',  date('now','+18 days'), datetime('now','-1 day'),   datetime('now','-1 day'),   datetime('now','-1 day')),
  ('inv-vid-04', 'INV-2026-0244', 'ip_001', 'demo_ipp_001', 'demo_offtaker_001', 'capacity',
   date('now','-29 days'), date('now'),       '[]', 430000,  0.15, 64500,  494500,
   'ZAR', 'partial', date('now','+5 days'),  datetime('now','-4 days'),  datetime('now','-4 days'),  datetime('now','-4 days'));
