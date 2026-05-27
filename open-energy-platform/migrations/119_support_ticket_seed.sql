-- ═══════════════════════════════════════════════════════════════════════════
-- Wave 14 — Support ticket chain seed (demo data).
--
-- 8 demo tickets covering every state + priority combination:
--   1. P1 open (within triage SLA)
--   2. P1 open (triage SLA breached)
--   3. P2 triaged (first_response pending)
--   4. P2 in_progress (resolution within SLA)
--   5. P3 awaiting_user (clock paused)
--   6. P3 resolved (awaiting close)
--   7. P4 closed (clean cycle)
--   8. P1 escalated (compliance → regulator inbox)
--
-- INSERT OR IGNORE keeps the seed idempotent across replays.
-- ═══════════════════════════════════════════════════════════════════════════

INSERT OR IGNORE INTO support_tickets (
  id, ticket_number, reporter_id, tenant_id, subject, description,
  category, priority, status, chain_status,
  triaged_at, first_responded_at, waiting_since, reopened_at,
  escalated_at, escalation_reason,
  resolved_at, resolved_by,
  next_sla_due_at, next_sla_window, last_sla_breach_at, sla_breach_count,
  assignee_id, triaged_by, closed_by,
  created_at, updated_at
) VALUES
  -- 1. P1 open within triage SLA (created 30m ago, triage = 60m)
  ('supp_tkt_001', 'TKT-2026-001', 'demo_trader_001', 'tenant_trader_001',
   'Order rejected — limit/credit', 'New order rejected with credit check failure, blocking morning trading.',
   'access', 'urgent', 'open', 'open',
   NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
   datetime('now','+30 minutes'), 'triage', NULL, 0,
   NULL, NULL, NULL,
   datetime('now','-30 minutes'), datetime('now','-30 minutes')),

  -- 2. P1 open with triage breached (2h ago, triage = 60m)
  ('supp_tkt_002', 'TKT-2026-002', 'demo_ipp_002', 'tenant_ipp_002',
   'Cannot upload monthly meter file', 'POPIA filing window closes today, upload portal returns 500.',
   'compliance', 'urgent', 'open', 'open',
   NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
   datetime('now','-1 hour'), 'triage', datetime('now','-30 minutes'), 1,
   NULL, NULL, NULL,
   datetime('now','-2 hours'), datetime('now','-30 minutes')),

  -- 3. P2 triaged, first_response pending (triaged 1h ago, first_response = 4h)
  ('supp_tkt_003', 'TKT-2026-003', 'demo_offtaker_001', 'tenant_offtaker_001',
   'Monthly delivery dashboard shows zero', 'Counterparty dashboard not refreshing after midnight rollup.',
   'data_issue', 'high', 'in_progress', 'triaged',
   datetime('now','-1 hour'), NULL, NULL, NULL, NULL, NULL, NULL, NULL,
   datetime('now','+3 hours'), 'first_response', NULL, 0,
   'demo_support_001', 'demo_support_001', NULL,
   datetime('now','-90 minutes'), datetime('now','-1 hour')),

  -- 4. P2 in_progress, resolution within SLA (picked up 30m ago, resolution = 24h)
  ('supp_tkt_004', 'TKT-2026-004', 'demo_lender_001', 'tenant_lender_001',
   'Covenant export missing FX column', 'Q1 covenant pack export omits ZAR→USD column needed by ratings.',
   'bug', 'high', 'in_progress', 'in_progress',
   datetime('now','-2 hours'), datetime('now','-30 minutes'), NULL, NULL, NULL, NULL, NULL, NULL,
   datetime('now','+23 hours 30 minutes'), 'resolution', NULL, 0,
   'demo_support_001', 'demo_support_001', NULL,
   datetime('now','-3 hours'), datetime('now','-30 minutes')),

  -- 5. P3 awaiting_user — clock paused
  ('supp_tkt_005', 'TKT-2026-005', 'demo_carbon_001', 'tenant_carbon_001',
   'CRA opinion attachment too large', 'Trying to attach 80MB validation report; need workaround.',
   'feature_question', 'normal', 'in_progress', 'awaiting_user',
   datetime('now','-1 day'), datetime('now','-20 hours'), datetime('now','-4 hours'),
   NULL, NULL, NULL, NULL, NULL,
   NULL, NULL, NULL, 0,
   'demo_support_001', 'demo_support_001', NULL,
   datetime('now','-1 day','-2 hours'), datetime('now','-4 hours')),

  -- 6. P3 resolved (awaiting close, resolution SLA cleared)
  ('supp_tkt_006', 'TKT-2026-006', 'demo_regulator_001', 'tenant_regulator_001',
   'CSV export character encoding', 'Q1 audit pack contained Latin-1 not UTF-8.',
   'data_issue', 'normal', 'resolved', 'resolved',
   datetime('now','-3 days'), datetime('now','-2 days'), NULL, NULL, NULL, NULL,
   datetime('now','-1 day'), 'demo_support_001',
   NULL, NULL, NULL, 0,
   'demo_support_001', 'demo_support_001', NULL,
   datetime('now','-3 days','-1 hour'), datetime('now','-1 day')),

  -- 7. P4 closed clean cycle
  ('supp_tkt_007', 'TKT-2026-007', 'demo_grid_001', 'tenant_grid_001',
   'Documentation typo on dispatch nominations', 'Acceptance SLA shown as "15 minutes" twice.',
   'other', 'low', 'closed', 'closed',
   datetime('now','-10 days'), datetime('now','-9 days'), NULL, NULL, NULL, NULL,
   datetime('now','-5 days'), 'demo_support_001',
   NULL, NULL, NULL, 0,
   'demo_support_001', 'demo_support_001', 'demo_support_001',
   datetime('now','-10 days','-2 hours'), datetime('now','-2 days')),

  -- 8. P1 escalated — compliance category, regulator inbox cross
  ('supp_tkt_008', 'TKT-2026-008', 'demo_regulator_002', 'tenant_regulator_002',
   'POPIA erasure request blocked', 'Customer erasure request hung at "verifying" for 3 days.',
   'compliance', 'urgent', 'open', 'escalated',
   datetime('now','-3 days'), datetime('now','-2 days','-12 hours'), NULL, NULL,
   datetime('now','-1 day'), 'POPIA erasure deadline at risk — engineering escalation',
   NULL, NULL,
   NULL, NULL, datetime('now','-1 day'), 2,
   'demo_support_002', 'demo_support_001', NULL,
   datetime('now','-3 days','-1 hour'), datetime('now','-1 day'));

-- Matching audit-chain events
INSERT OR IGNORE INTO oe_support_ticket_events (id, ticket_id, event_type, from_status, to_status, actor_id, notes, payload_json, created_at) VALUES
  -- Ticket 001
  ('supp_tkt_evt_001', 'supp_tkt_001', 'opened', NULL, 'open', 'demo_trader_001', 'P1 — order rejected', NULL, datetime('now','-30 minutes')),

  -- Ticket 002
  ('supp_tkt_evt_002a', 'supp_tkt_002', 'opened', NULL, 'open', 'demo_ipp_002', 'P1 compliance', NULL, datetime('now','-2 hours')),
  ('supp_tkt_evt_002b', 'supp_tkt_002', 'sla_breached', 'open', 'open', 'system', 'Triage SLA missed (60m)', '{"window":"triage","minutes_overdue":60}', datetime('now','-30 minutes')),

  -- Ticket 003
  ('supp_tkt_evt_003a', 'supp_tkt_003', 'opened', NULL, 'open', 'demo_offtaker_001', NULL, NULL, datetime('now','-90 minutes')),
  ('supp_tkt_evt_003b', 'supp_tkt_003', 'triaged', 'open', 'triaged', 'demo_support_001', 'Reproduced — escalating to dashboards team', '{"window":"first_response"}', datetime('now','-1 hour')),

  -- Ticket 004
  ('supp_tkt_evt_004a', 'supp_tkt_004', 'opened', NULL, 'open', 'demo_lender_001', NULL, NULL, datetime('now','-3 hours')),
  ('supp_tkt_evt_004b', 'supp_tkt_004', 'triaged', 'open', 'triaged', 'demo_support_001', NULL, '{"window":"first_response"}', datetime('now','-2 hours')),
  ('supp_tkt_evt_004c', 'supp_tkt_004', 'picked_up', 'triaged', 'in_progress', 'demo_support_001', 'First response sent; investigating export schema', '{"window":"resolution"}', datetime('now','-30 minutes')),

  -- Ticket 005
  ('supp_tkt_evt_005a', 'supp_tkt_005', 'opened', NULL, 'open', 'demo_carbon_001', NULL, NULL, datetime('now','-1 day','-2 hours')),
  ('supp_tkt_evt_005b', 'supp_tkt_005', 'triaged', 'open', 'triaged', 'demo_support_001', NULL, NULL, datetime('now','-1 day')),
  ('supp_tkt_evt_005c', 'supp_tkt_005', 'picked_up', 'triaged', 'in_progress', 'demo_support_001', NULL, NULL, datetime('now','-20 hours')),
  ('supp_tkt_evt_005d', 'supp_tkt_005', 'wait_for_user', 'in_progress', 'awaiting_user', 'demo_support_001', 'Asked customer to compress attachment', NULL, datetime('now','-4 hours')),

  -- Ticket 006
  ('supp_tkt_evt_006a', 'supp_tkt_006', 'opened', NULL, 'open', 'demo_regulator_001', NULL, NULL, datetime('now','-3 days','-1 hour')),
  ('supp_tkt_evt_006b', 'supp_tkt_006', 'triaged', 'open', 'triaged', 'demo_support_001', NULL, NULL, datetime('now','-3 days')),
  ('supp_tkt_evt_006c', 'supp_tkt_006', 'picked_up', 'triaged', 'in_progress', 'demo_support_001', NULL, NULL, datetime('now','-2 days')),
  ('supp_tkt_evt_006d', 'supp_tkt_006', 'resolved', 'in_progress', 'resolved', 'demo_support_001', 'Patched export to force UTF-8 BOM', NULL, datetime('now','-1 day')),

  -- Ticket 007
  ('supp_tkt_evt_007a', 'supp_tkt_007', 'opened', NULL, 'open', 'demo_grid_001', NULL, NULL, datetime('now','-10 days','-2 hours')),
  ('supp_tkt_evt_007b', 'supp_tkt_007', 'triaged', 'open', 'triaged', 'demo_support_001', NULL, NULL, datetime('now','-10 days')),
  ('supp_tkt_evt_007c', 'supp_tkt_007', 'picked_up', 'triaged', 'in_progress', 'demo_support_001', NULL, NULL, datetime('now','-9 days')),
  ('supp_tkt_evt_007d', 'supp_tkt_007', 'resolved', 'in_progress', 'resolved', 'demo_support_001', 'Docs PR merged', NULL, datetime('now','-5 days')),
  ('supp_tkt_evt_007e', 'supp_tkt_007', 'closed', 'resolved', 'closed', 'demo_support_001', NULL, NULL, datetime('now','-2 days')),

  -- Ticket 008
  ('supp_tkt_evt_008a', 'supp_tkt_008', 'opened', NULL, 'open', 'demo_regulator_002', 'POPIA erasure', NULL, datetime('now','-3 days','-1 hour')),
  ('supp_tkt_evt_008b', 'supp_tkt_008', 'triaged', 'open', 'triaged', 'demo_support_001', NULL, NULL, datetime('now','-3 days')),
  ('supp_tkt_evt_008c', 'supp_tkt_008', 'picked_up', 'triaged', 'in_progress', 'demo_support_002', NULL, NULL, datetime('now','-2 days','-12 hours')),
  ('supp_tkt_evt_008d', 'supp_tkt_008', 'sla_breached', 'in_progress', 'in_progress', 'system', 'Resolution SLA missed (240m P1)', '{"window":"resolution","minutes_overdue":240}', datetime('now','-1 day','-6 hours')),
  ('supp_tkt_evt_008e', 'supp_tkt_008', 'escalated', 'in_progress', 'escalated', 'demo_support_002', 'POPIA deadline at risk', '{"reason":"POPIA erasure deadline at risk","crossed_into_regulator":true}', datetime('now','-1 day'));
