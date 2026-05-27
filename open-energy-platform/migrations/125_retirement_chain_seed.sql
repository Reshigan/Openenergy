-- ═══════════════════════════════════════════════════════════════════════════
-- Wave 17 — Carbon retirement chain seed (idempotent).
--
-- Bring existing historical retirements into the chain in 'retired' state
-- (scope=voluntary unless overridden), then add 7 in-flight retirements
-- spanning every state × scope.
-- ═══════════════════════════════════════════════════════════════════════════

UPDATE carbon_retirements SET chain_status = 'retired', scope = 'voluntary'
 WHERE chain_status IS NULL OR chain_status = 'requested';

-- A few historical ones get reclassified as compliance / article6.
UPDATE carbon_retirements SET scope = 'compliance' WHERE id IN ('crit-vid-02', 'crit-vid-05');
UPDATE carbon_retirements SET scope = 'article6'   WHERE id = 'crit-vid-08';

-- ─── In-flight retirements covering every chain state × scope ───────────────
INSERT OR IGNORE INTO carbon_retirements
  (id, participant_id, project_id, quantity, retirement_reason, certificate_number,
   beneficiary_name, beneficiary_country, retirement_date, created_by, created_at,
   chain_status, scope, sla_deadline_at, escalation_level)
SELECT 'ret_chain_001', p.id, COALESCE((SELECT id FROM carbon_projects LIMIT 1 OFFSET 0), 'cp_001'),
       1500, 'Article 6 ITMO retirement — Switzerland buyer', NULL,
       'KliK Foundation', 'CH', NULL, p.id, datetime('now','-1 hours'),
       'requested', 'article6', datetime('now', '+4 hours'), 0
  FROM participants p WHERE email='carbon@openenergy.co.za';

INSERT OR IGNORE INTO carbon_retirements
  (id, participant_id, project_id, quantity, retirement_reason, certificate_number,
   beneficiary_name, beneficiary_country, retirement_date, created_by, created_at,
   chain_status, scope, sla_deadline_at, escalation_level)
SELECT 'ret_chain_002', p.id, COALESCE((SELECT id FROM carbon_projects LIMIT 1 OFFSET 0), 'cp_001'),
       3200, 'EU ETS compliance — German offtaker', NULL,
       'Deutsche Industrie GmbH', 'DE', NULL, p.id, datetime('now','-3 hours'),
       'validating', 'compliance', datetime('now', '+24 hours'), 0
  FROM participants p WHERE email='carbon@openenergy.co.za';

INSERT OR IGNORE INTO carbon_retirements
  (id, participant_id, project_id, quantity, retirement_reason, certificate_number,
   beneficiary_name, beneficiary_country, retirement_date, created_by, created_at,
   chain_status, scope, sla_deadline_at, escalation_level)
SELECT 'ret_chain_003', p.id, COALESCE((SELECT id FROM carbon_projects LIMIT 1 OFFSET 0), 'cp_001'),
       900, 'Article 6 — Singapore corresponding-adjustment', NULL,
       'Senoko Energy Pte Ltd', 'SG', NULL, p.id, datetime('now','-12 hours'),
       'adjustment_pending', 'article6', datetime('now', '+18 hours'), 0
  FROM participants p WHERE email='carbon@openenergy.co.za';

INSERT OR IGNORE INTO carbon_retirements
  (id, participant_id, project_id, quantity, retirement_reason, certificate_number,
   beneficiary_name, beneficiary_country, retirement_date, created_by, created_at,
   chain_status, scope, sla_deadline_at, escalation_level)
SELECT 'ret_chain_004', p.id, COALESCE((SELECT id FROM carbon_projects LIMIT 1 OFFSET 0), 'cp_001'),
       2100, 'Carbon Tax Act §13 — compliance batch', NULL,
       'PetroSA Compliance Pool', 'ZA', NULL, p.id, datetime('now','-18 hours'),
       'adjusted', 'compliance', datetime('now', '+12 hours'), 0
  FROM participants p WHERE email='carbon@openenergy.co.za';

INSERT OR IGNORE INTO carbon_retirements
  (id, participant_id, project_id, quantity, retirement_reason, certificate_number,
   beneficiary_name, beneficiary_country, retirement_date, created_by, created_at,
   chain_status, scope, sla_deadline_at, escalation_level, rejection_reason)
SELECT 'ret_chain_005', p.id, COALESCE((SELECT id FROM carbon_projects LIMIT 1 OFFSET 0), 'cp_001'),
       600, 'Voluntary retire — pre-issuance check failed', NULL,
       'Tribbiani Holdings', 'ZA', NULL, p.id, datetime('now','-2 days'),
       'rejected', 'voluntary', NULL, 0,
       'Credit serial range overlapped a prior cancelled issuance.'
  FROM participants p WHERE email='carbon@openenergy.co.za';

INSERT OR IGNORE INTO carbon_retirements
  (id, participant_id, project_id, quantity, retirement_reason, certificate_number,
   beneficiary_name, beneficiary_country, retirement_date, created_by, created_at,
   chain_status, scope, sla_deadline_at, escalation_level)
SELECT 'ret_chain_006', p.id, COALESCE((SELECT id FROM carbon_projects LIMIT 1 OFFSET 0), 'cp_001'),
       450, 'Buyer cancelled retirement request', NULL,
       'Cancelled Buyer Co.', 'ZA', NULL, p.id, datetime('now','-4 days'),
       'cancelled', 'voluntary', NULL, 0
  FROM participants p WHERE email='carbon@openenergy.co.za';

-- One critical SLA-breached row for the cron sweep to find.
INSERT OR IGNORE INTO carbon_retirements
  (id, participant_id, project_id, quantity, retirement_reason, certificate_number,
   beneficiary_name, beneficiary_country, retirement_date, created_by, created_at,
   chain_status, scope, sla_deadline_at, last_sla_breach_at, escalation_level)
SELECT 'ret_chain_007', p.id, COALESCE((SELECT id FROM carbon_projects LIMIT 1 OFFSET 0), 'cp_001'),
       4400, 'Article 6 — Korea corresponding-adjustment (SLA breached)', NULL,
       'KOMIPO Korea Midland Power', 'KR', NULL, p.id, datetime('now','-2 days'),
       'validating', 'article6', datetime('now','-12 hours'), datetime('now','-30 minutes'), 1
  FROM participants p WHERE email='carbon@openenergy.co.za';

-- ─── Audit history for the in-flight rows ────────────────────────────────────
INSERT OR IGNORE INTO oe_retirement_chain_events
  (id, retirement_id, event_type, from_status, to_status, actor_id, notes, payload, created_at) VALUES
  ('ret_evt_001', 'ret_chain_002', 'validation_started',  'requested',          'validating',         'demo_carbon_001', 'CRA assigned',        '{}', datetime('now','-3 hours')),
  ('ret_evt_002', 'ret_chain_003', 'validation_started',  'requested',          'validating',         'demo_carbon_001', NULL,                  '{}', datetime('now','-12 hours')),
  ('ret_evt_003', 'ret_chain_003', 'adjustment_pending',  'validating',         'adjustment_pending', 'demo_carbon_001', 'UNFCCC entry queued', '{}', datetime('now','-8 hours')),
  ('ret_evt_004', 'ret_chain_004', 'validation_started',  'requested',          'validating',         'demo_carbon_001', NULL,                  '{}', datetime('now','-18 hours')),
  ('ret_evt_005', 'ret_chain_004', 'adjustment_pending',  'validating',         'adjustment_pending', 'demo_carbon_001', NULL,                  '{}', datetime('now','-14 hours')),
  ('ret_evt_006', 'ret_chain_004', 'adjusted',            'adjustment_pending', 'adjusted',           'demo_carbon_001', 'Adjustment posted',   '{}', datetime('now','-6 hours')),
  ('ret_evt_007', 'ret_chain_005', 'validation_started',  'requested',          'validating',         'demo_carbon_001', NULL,                  '{}', datetime('now','-2 days')),
  ('ret_evt_008', 'ret_chain_005', 'rejected',            'validating',         'rejected',           'demo_carbon_001', 'Serial overlap',      '{}', datetime('now','-1 days')),
  ('ret_evt_009', 'ret_chain_006', 'cancelled',           'requested',          'cancelled',          'demo_carbon_001', 'Buyer pull-out',      '{}', datetime('now','-4 days')),
  ('ret_evt_010', 'ret_chain_007', 'validation_started',  'requested',          'validating',         'demo_carbon_001', NULL,                  '{}', datetime('now','-2 days')),
  ('ret_evt_011', 'ret_chain_007', 'sla_breached',        'validating',         'validating',         'system',          'Article6 24h breach', '{"sla_window":"24h"}', datetime('now','-30 minutes'));
