-- ═══════════════════════════════════════════════════════════════════════════
-- 079_video_demo_seed.sql
--
-- Anonymized institutional demo data for the corporate-video master cut.
-- Covers the camera-critical gaps surfaced by docs/video/ui-audit-2026-05-25.md:
--   • trader launch board shows "0 / 0 / R0 / 0"           → seed open + filled orders
--   • offtaker launch board shows "0 active PPAs"          → seed 4 active PPAs
--   • lender launch board shows "0 facilities / 0 covenants" → seed 3 facilities + 6 covenants
--   • regulator workstation shows "No triage decisions yet"  → seed 4 triage decisions
--   • carbon-fund + support sparse                          → seed registry positions + tickets
--   • admin shell reads "Good morning, System"              → rename admin participant
--
-- Naming convention (per spec, anonymized institutional):
--   "Solar IPP 01 — Northern Cape", "Wind IPP 03 — Eastern Cape",
--   "Anchor Offtaker — C&I Mining Group", "Senior Lender — DFI Consortium A".
--
-- All inserts INSERT OR IGNORE — idempotent. FKs resolved via subselect on
-- the canonical demo persona emails so this works regardless of UUID style.
--
-- Safe to re-run. Safe to apply after the 049–078 migration band that prod
-- has had patched in.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. Rename admin shell name so Act 3 doesn't open "Good morning, System" ──
UPDATE participants
   SET name = 'Sipho Mbeki', company_name = 'Open Energy Platform Operations'
 WHERE email = 'admin@openenergy.co.za' AND name IN ('System','System Admin');

-- ─── 2. Trader orders — 6 open + 3 partial-fill + 1 settled today ─────────────
-- Participant resolution: trader@openenergy.co.za
INSERT OR IGNORE INTO trade_orders
  (id, participant_id, side, energy_type, volume_mwh, price_min, price_max,
   delivery_date, delivery_point, market_type, status, created_at)
SELECT 'tord-vid-001', id, 'buy',  'solar',  150, 1180, 1240, date('now','+1 day'), 'KZN-South', 'exchange',  'open', datetime('now','-2 hours')
  FROM participants WHERE email='trader@openenergy.co.za'
UNION ALL SELECT 'tord-vid-002', id, 'buy',  'wind',   200, 1100, 1170, date('now','+1 day'), 'EC-Coastal', 'exchange', 'open', datetime('now','-2 hours')
  FROM participants WHERE email='trader@openenergy.co.za'
UNION ALL SELECT 'tord-vid-003', id, 'buy',  'hybrid', 120, 1240, 1290, date('now','+2 day'), 'NC-Upington','exchange', 'open', datetime('now','-90 minutes')
  FROM participants WHERE email='trader@openenergy.co.za'
UNION ALL SELECT 'tord-vid-004', id, 'sell', 'solar',  180, 1210, 1260, date('now','+1 day'), 'NC-Upington','exchange', 'open', datetime('now','-75 minutes')
  FROM participants WHERE email='trader@openenergy.co.za'
UNION ALL SELECT 'tord-vid-005', id, 'sell', 'wind',   220, 1130, 1190, date('now','+1 day'), 'EC-Coastal', 'exchange', 'open', datetime('now','-60 minutes')
  FROM participants WHERE email='trader@openenergy.co.za'
UNION ALL SELECT 'tord-vid-006', id, 'sell', 'hybrid', 100, 1260, 1310, date('now','+2 day'), 'WC-Inland',  'exchange', 'open', datetime('now','-45 minutes')
  FROM participants WHERE email='trader@openenergy.co.za';

INSERT OR IGNORE INTO trade_orders
  (id, participant_id, side, energy_type, volume_mwh, price_min, price_max,
   delivery_date, delivery_point, market_type, status, created_at)
SELECT 'tord-vid-007', id, 'buy',  'solar', 80, 1190, 1240, date('now'),'NC-Upington','exchange','partial', datetime('now','-4 hours')
  FROM participants WHERE email='trader@openenergy.co.za'
UNION ALL SELECT 'tord-vid-008', id, 'sell', 'wind',  90, 1140, 1180, date('now'),'EC-Coastal', 'exchange','partial', datetime('now','-3 hours')
  FROM participants WHERE email='trader@openenergy.co.za'
UNION ALL SELECT 'tord-vid-009', id, 'buy',  'hybrid',60, 1250, 1290, date('now'),'KZN-South',  'exchange','partial', datetime('now','-2 hours')
  FROM participants WHERE email='trader@openenergy.co.za'
UNION ALL SELECT 'tord-vid-010', id, 'buy', 'solar', 100, 1200, 1240, date('now','-1 day'),'NC-Upington','exchange','closed', datetime('now','-1 day')
  FROM participants WHERE email='trader@openenergy.co.za';

-- Trade matches to back the partial / closed orders so the trader "fills" KPI is non-zero.
INSERT OR IGNORE INTO trade_matches (id, buy_order_id, sell_order_id, matched_volume_mwh, matched_price, status, matched_at)
VALUES
  ('tmatch-vid-001', 'tord-vid-007', 'tord-vid-005', 40, 1210, 'settling', datetime('now','-3 hours')),
  ('tmatch-vid-002', 'tord-vid-009', 'tord-vid-006', 30, 1280, 'settling', datetime('now','-90 minutes')),
  ('tmatch-vid-003', 'tord-vid-010', 'tord-vid-004', 100, 1220, 'settled',  datetime('now','-23 hours'));

-- ─── 3. Offtaker PPAs — 4 active, anchored to anonymized IPPs ─────────────────
-- Participant resolution: offtaker@openenergy.co.za
INSERT OR IGNORE INTO off_ppa_portfolio
  (id, participant_id, tenant_id, contract_ref, counterparty_name, technology,
   capacity_mw, ppa_term_years, ppa_start_date, ppa_end_date, price_zar_per_mwh,
   indexation, expected_p50_gwh_yr, green_attributes, status)
SELECT 'oppa-vid-001', id, 'default', 'CECL-PPA-01',
       'Solar IPP 01 — Northern Cape', 'solar_pv',
       75, 20, date('now','-1 year'), date('now','+19 years'), 1180,
       'CPI', 175.2, 'RECs included', 'active'
  FROM participants WHERE email='offtaker@openenergy.co.za'
UNION ALL SELECT 'oppa-vid-002', id, 'default', 'CECL-PPA-02',
       'Wind IPP 03 — Eastern Cape', 'wind',
       110, 20, date('now','-6 months'), date(date('now','-6 months'),'+20 years'), 1145,
       'CPI', 380.0, 'RECs included', 'active'
  FROM participants WHERE email='offtaker@openenergy.co.za'
UNION ALL SELECT 'oppa-vid-003', id, 'default', 'CECL-PPA-03',
       'Hybrid IPP 02 — Western Cape', 'hybrid_solar_battery',
       60, 15, date('now','-3 months'), date(date('now','-3 months'),'+15 years'), 1265,
       'CPI+1', 162.0, 'RECs + dispatchable', 'active'
  FROM participants WHERE email='offtaker@openenergy.co.za'
UNION ALL SELECT 'oppa-vid-004', id, 'default', 'CECL-PPA-04',
       'Solar IPP 04 — Limpopo', 'solar_pv',
       45, 10, date('now','-9 months'), date(date('now','-9 months'),'+10 years'), 1210,
       'fixed', 102.5, 'RECs included', 'active'
  FROM participants WHERE email='offtaker@openenergy.co.za';

-- ─── 4. Lender facilities (covenants table for the lender suite L4 view) ──────
-- The lender suite reads from `covenants` directly; project_id and lender_participant_id
-- are FK-soft (REFERENCES without enforcement in SQLite) so we can seed without
-- needing a matching ipp_projects row — and the lender persona's covenant view
-- joins by lender_participant_id.
INSERT OR IGNORE INTO covenants
  (id, project_id, lender_participant_id, covenant_code, covenant_name, covenant_type,
   operator, threshold, measurement_frequency, first_test_date, waivable, status)
SELECT 'cov-vid-01', NULL, id, 'DSCR_12M',       'Debt Service Coverage Ratio (12M)', 'financial',
       'gte', 1.20, 'quarterly', date('now','+30 days'), 1, 'active'
  FROM participants WHERE email='lender@openenergy.co.za'
UNION ALL SELECT 'cov-vid-02', NULL, id, 'LLCR',           'Loan Life Coverage Ratio',         'financial',
       'gte', 1.40, 'semi_annual', date('now','+60 days'), 1, 'active'
  FROM participants WHERE email='lender@openenergy.co.za'
UNION ALL SELECT 'cov-vid-03', NULL, id, 'AVAILABILITY_95','Plant availability ≥ 95%',         'operational',
       'gte', 0.95, 'monthly', date('now','+15 days'), 1, 'active'
  FROM participants WHERE email='lender@openenergy.co.za'
UNION ALL SELECT 'cov-vid-04', NULL, id, 'INSURANCE',      'All-risk insurance in force',      'insurance',
       'eq',  1,    'annual',     date('now','+90 days'), 0, 'active'
  FROM participants WHERE email='lender@openenergy.co.za'
UNION ALL SELECT 'cov-vid-05', NULL, id, 'DEBT_RATIO',     'Debt / EBITDA ≤ 4.5x',             'financial',
       'lte', 4.5,  'quarterly',  date('now','+30 days'), 1, 'active'
  FROM participants WHERE email='lender@openenergy.co.za'
UNION ALL SELECT 'cov-vid-06', NULL, id, 'REPORTING',      'Quarterly operating report',       'reporting',
       'eq',  1,    'quarterly',  date('now','+30 days'), 1, 'active'
  FROM participants WHERE email='lender@openenergy.co.za';

-- ─── 5. Regulator surveillance — 1 rule, 4 alerts, 4 triage decisions ─────────
INSERT OR IGNORE INTO regulator_surveillance_rules (id, rule_code, rule_name, description, rule_type, severity, enabled)
VALUES ('rsr-vid-01', 'WASH_TRADE', 'Wash-trade pattern detector',
        'Same beneficial owner on both sides of a match within 10 minutes', 'wash_trade', 'high', 1),
       ('rsr-vid-02', 'MARKING_CLOSE', 'Marking the close',
        'Disproportionate volume in the final 5 minutes of session', 'price_manipulation', 'medium', 1);

INSERT OR IGNORE INTO regulator_surveillance_alerts
  (id, rule_id, rule_code, participant_id, entity_type, entity_id, severity, status, raised_at, details_json)
SELECT 'rsa-vid-01', 'rsr-vid-01', 'WASH_TRADE',  id, 'trade_matches', 'tmatch-vid-001', 'high',   'investigating', datetime('now','-3 hours'), '{"matches":2,"window_min":8}'
  FROM participants WHERE email='trader@openenergy.co.za'
UNION ALL SELECT 'rsa-vid-02', 'rsr-vid-02', 'MARKING_CLOSE', id, 'trade_orders',  'tord-vid-003', 'medium', 'open', datetime('now','-2 hours'), '{"share_of_volume":0.42}'
  FROM participants WHERE email='trader@openenergy.co.za'
UNION ALL SELECT 'rsa-vid-03', 'rsr-vid-01', 'WASH_TRADE',  id, 'trade_matches', 'tmatch-vid-002', 'high',   'resolved',      datetime('now','-1 day'),  '{"matches":1,"window_min":12}'
  FROM participants WHERE email='trader@openenergy.co.za'
UNION ALL SELECT 'rsa-vid-04', 'rsr-vid-02', 'MARKING_CLOSE', id, 'trade_orders',  'tord-vid-004', 'low',    'false_positive', datetime('now','-2 day'),  '{"share_of_volume":0.18}'
  FROM participants WHERE email='trader@openenergy.co.za';

INSERT OR IGNORE INTO regulator_surveillance_triage
  (id, alert_id, triaged_by, triaged_at, decision, rationale, next_review_at)
SELECT 'rst-vid-01', 'rsa-vid-03', id, datetime('now','-22 hours'), 'close_no_action',
       'Confirmed single-counterparty error; manual amendment lodged.', NULL
  FROM participants WHERE email='regulator@openenergy.co.za'
UNION ALL SELECT 'rst-vid-02', 'rsa-vid-04', id, datetime('now','-1 day','-6 hours'), 'false_positive',
       'Volume share within historic norms for low-liquidity session.', NULL
  FROM participants WHERE email='regulator@openenergy.co.za'
UNION ALL SELECT 'rst-vid-03', 'rsa-vid-01', id, datetime('now','-2 hours'),  'monitor',
       'Two matches in 8-min window — escalate if a third lands today.',
       datetime('now','+8 hours')
  FROM participants WHERE email='regulator@openenergy.co.za'
UNION ALL SELECT 'rst-vid-04', 'rsa-vid-02', id, datetime('now','-90 minutes'), 'contact_party',
       'Request explanation of EOD position from desk; respond by T+1.',
       datetime('now','+1 day')
  FROM participants WHERE email='regulator@openenergy.co.za';

-- ─── 6. Support tickets — workflow demonstration ──────────────────────────────
INSERT OR IGNORE INTO support_tickets
  (id, ticket_number, reporter_id, tenant_id, subject, description, category, priority, status, assignee_id, created_at)
SELECT 'sup-vid-01', 'TKT-25-0001', r.id, 'default',
       'PPA upload — counterparty signatory missing',
       'After uploading the redline, the signatory list shows only one party. Expected two.',
       'data_issue', 'high', 'open', s.id, datetime('now','-3 hours')
  FROM participants r, participants s
 WHERE r.email='offtaker@openenergy.co.za' AND s.email='support@openenergy.co.za'
UNION ALL SELECT 'sup-vid-02', 'TKT-25-0002', r.id, 'default',
       'Cannot view settlement statement for SETT-25-0014',
       'Statement page returns "loading" indefinitely.',
       'bug', 'urgent', 'in_progress', s.id, datetime('now','-6 hours')
  FROM participants r, participants s
 WHERE r.email='trader@openenergy.co.za' AND s.email='support@openenergy.co.za'
UNION ALL SELECT 'sup-vid-03', 'TKT-25-0003', r.id, 'default',
       'Need bulk export of covenant history',
       'For audit purposes, please advise on CSV export.',
       'feature_question', 'normal', 'resolved', s.id, datetime('now','-2 day')
  FROM participants r, participants s
 WHERE r.email='lender@openenergy.co.za' AND s.email='support@openenergy.co.za'
UNION ALL SELECT 'sup-vid-04', 'TKT-25-0004', r.id, 'default',
       'POPIA — data subject access request received',
       'Customer raised SAR via legal counsel. Need timeline.',
       'compliance', 'high', 'waiting_on_customer', s.id, datetime('now','-1 day')
  FROM participants r, participants s
 WHERE r.email='regulator@openenergy.co.za' AND s.email='support@openenergy.co.za';

UPDATE support_tickets
   SET resolved_at = datetime('now','-1 day'), resolution = 'Documented in user guide; export endpoint shipped 2026-05-20.'
 WHERE id = 'sup-vid-03' AND resolved_at IS NULL;

-- ─── 7. Link 074-seeded esums sites to the IPP demo user ──────────────────────
-- The fleet-kpis route scopes by `participant_id = ? OR om_contractor_id = ?`
-- for non-officer roles. The 074 seed inserted the sites with NULL participant,
-- which is why the IPP launch header reads "0 sites · 0.0 MW" despite the site
-- cards rendering below (the sites list endpoint scopes more permissively).
-- Set participant_id on each demo site so the IPP developer sees them in
-- their KPI rollup.
UPDATE om_sites
   SET participant_id = (SELECT id FROM participants WHERE email='ipp@openenergy.co.za')
 WHERE id LIKE 'demo_site_%'
   AND participant_id IS NULL
   AND EXISTS (SELECT 1 FROM participants WHERE email='ipp@openenergy.co.za');
