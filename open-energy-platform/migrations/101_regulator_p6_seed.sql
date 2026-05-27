-- 101_regulator_p6_seed.sql
-- Wave 5 seed — default SLA escalation rules, a small demo inbox so the
-- regulator portal has something to render on first login, and a couple
-- of outbound compliance notices in different statuses.
--
-- INSERT OR IGNORE everywhere so reapplying is safe.

-- ── Default escalation rules ────────────────────────────────────────────
INSERT OR IGNORE INTO oe_regulator_escalation_rules
  (id, rule_code, description, event_pattern, severity_min, sla_minutes, on_breach, enabled, created_at, updated_at)
VALUES
  ('rer_seed_1', 'CRITICAL_LICENCE',
   'Licence suspension/revocation: must be acknowledged within 1 hour or auto-escalate to enforcement case.',
   'regulator.licence_*', 'critical', 60, 'open_case', 1,
   datetime('now'), datetime('now')),
  ('rer_seed_2', 'HIGH_SURVEILLANCE',
   'High-severity surveillance alert: 4-hour ack window, then auto-escalate.',
   'surveillance.*', 'high', 240, 'escalate', 1,
   datetime('now'), datetime('now')),
  ('rer_seed_3', 'MEDIUM_SURVEILLANCE',
   'Medium-severity surveillance / enforcement: 24-hour ack window.',
   'regulator.*', 'medium', 1440, 'escalate', 1,
   datetime('now'), datetime('now')),
  ('rer_seed_4', 'ARTICLE6_BLOCK',
   'Article 6 ITMO adjustment blocked: 4-hour ack window — represents a halted cross-border carbon transfer.',
   'carbon.article6.blocked', 'high', 240, 'open_case', 1,
   datetime('now'), datetime('now')),
  ('rer_seed_5', 'INFO_AUDIT_TRAIL',
   'Informational disclosures (clearing publication, UNFCCC posts): notify only, no auto-escalation.',
   'clearing.disclosure.*', 'info', 10080, 'notify_only', 1,
   datetime('now'), datetime('now')),
  ('rer_seed_6', 'INFO_UNFCCC_POST',
   'UNFCCC Article 6 ledger posts: notify only — audit-trail event.',
   'carbon.article6.unfccc_posted', 'info', 10080, 'notify_only', 1,
   datetime('now'), datetime('now'));

-- ── Demo inbox rows ─────────────────────────────────────────────────────
-- Lifecycle spread so the UI shows pending + acknowledged + escalated.
INSERT OR IGNORE INTO oe_regulator_inbox
  (id, source_event, source_entity_type, source_entity_id, severity,
   title, body_json, ack_status, sla_due_at, created_at, updated_at)
VALUES
  ('rinb_seed_1', 'carbon.article6.unfccc_posted',
   'oe_article6_adjustments', 'a6_demo_zaf_che_001', 'info',
   'Article 6 ITMO posted to UNFCCC — ZAF→CHE 25000 tCO₂e',
   '{"host_iso":"ZAF","beneficiary_iso":"CHE","volume_tco2e":25000,"vintage":2024}',
   'pending',
   datetime('now', '+7 days'),
   datetime('now', '-1 hour'), datetime('now', '-1 hour')),

  ('rinb_seed_2', 'carbon.article6.blocked',
   'oe_article6_adjustments', 'a6_demo_zaf_usa_001', 'high',
   'Article 6 adjustment BLOCKED — ZAF→USA',
   '{"host_iso":"ZAF","beneficiary_iso":"USA","reason":"USA paris_only — no Article 6 mechanism"}',
   'pending',
   datetime('now', '+4 hours'),
   datetime('now', '-2 hours'), datetime('now', '-2 hours')),

  ('rinb_seed_3', 'surveillance.alert_raised',
   'oe_surveillance_alerts', 'sva_demo_001', 'medium',
   'Surveillance alert — wash_trade_pattern',
   '{"alert_type":"wash_trade_pattern","contracts":3,"window":"15min"}',
   'acknowledged',
   datetime('now', '-12 hours'),
   datetime('now', '-2 days'), datetime('now', '-1 day')),

  ('rinb_seed_4', 'regulator.licence_varied',
   'regulator_licences', 'rl_demo_001', 'medium',
   'Licence varied — RL-IPP-2024-007',
   '{"licence_number":"RL-IPP-2024-007","variation":"capacity_increase_50MW"}',
   'pending',
   datetime('now', '+18 hours'),
   datetime('now', '-6 hours'), datetime('now', '-6 hours')),

  ('rinb_seed_5', 'clearing.disclosure.published',
   'oe_clearing_disclosures', 'cd_demo_2026_q1', 'info',
   'Clearing disclosure published — 2026-Q1',
   '{"period":"2026-Q1","cover_status":"PASS","cover_ratio":1.41}',
   'pending',
   datetime('now', '+7 days'),
   datetime('now', '-30 minutes'), datetime('now', '-30 minutes'));

-- Set ack metadata on rinb_seed_3 so it visibly looks "handled" in the UI.
UPDATE oe_regulator_inbox
   SET ack_by = 'regulator-1', ack_at = datetime('now', '-1 day'),
       ack_note = 'Reviewed — 3 trades fit pattern but did not breach. Cleared.'
 WHERE id = 'rinb_seed_3';

-- ── Demo compliance notices ─────────────────────────────────────────────
INSERT OR IGNORE INTO oe_compliance_notices
  (id, licensee_user_id, source_case_id, source_inbox_id, notice_type,
   title, body, remedy_deadline_at, status, issued_by, created_at, updated_at)
VALUES
  ('cn_seed_1', 'ipp-1', NULL, NULL, 'information_request',
   'Provide Q4 2025 generation data',
   'Pursuant to ERA s.34, please furnish hourly metered generation by site for the period 2025-10-01 to 2025-12-31. Submit via the regulator filings module.',
   datetime('now', '+14 days'),
   'issued', 'regulator-1',
   datetime('now', '-1 hour'), datetime('now', '-1 hour')),

  ('cn_seed_2', 'trader-1', NULL, 'rinb_seed_3', 'warning',
   'Review of trading patterns — wash trades alleged',
   'A surveillance review has identified three trades within a 15-minute window that match the pattern characteristic of wash trades. Provide a written explanation within 7 calendar days.',
   datetime('now', '+7 days'),
   'acknowledged', 'regulator-1',
   datetime('now', '-2 days'), datetime('now', '-1 day')),

  ('cn_seed_3', 'ipp-2', NULL, NULL, 'remediation',
   'Insurance lapse — restore continuous cover',
   'Your project insurance policy lapsed on 2026-05-15. Continuous cover is a licence condition. Restore cover and provide proof within 5 business days.',
   datetime('now', '-2 days'),
   'overdue', 'regulator-1',
   datetime('now', '-9 days'), datetime('now', '-2 days'));

UPDATE oe_compliance_notices
   SET overdue_flagged_at = datetime('now', '-1 day'),
       acknowledged_at = datetime('now', '-1 day')
 WHERE id = 'cn_seed_3';

UPDATE oe_compliance_notices
   SET acknowledged_at = datetime('now', '-1 day')
 WHERE id = 'cn_seed_2';
