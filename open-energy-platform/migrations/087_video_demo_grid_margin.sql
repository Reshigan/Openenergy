-- 087 — Backfill the four Grid-Operator workstation tabs + Settlement margin
-- calls, all of which read empty on prod and cause "no rows yet" placeholders
-- in the UN/ESCO product film.
--
-- Touches (all empty on prod 2026-05-25):
--   • curtailment_notices       — 4 advisories so the Notices listing reads
--   • grid_curtailment_events   — 6 lifecycle events (issued→ack→partial_lift→full_lift)
--   • grid_outages              — 3 events (1 active, 1 restoring, 1 closed)
--   • ancillary_service_*       — 1 tender + 2 bids + 1 award (FCR product)
--   • margin_calls              — 3 open + 1 met so Settlement margin tab reads
--
-- INSERT OR IGNORE everywhere so the migration is idempotent. FKs are
-- disabled for the body of the migration so test replay (which skips the
-- 003_seed.sql parents) doesn't reject the rows — prod has every parent.
PRAGMA foreign_keys = OFF;

-- ─── Curtailment notices ────────────────────────────────────────────────
INSERT OR IGNORE INTO curtailment_notices
  (id, notice_number, issued_at, effective_from, effective_to,
   affected_zone, reason, curtailment_mw, severity, status, issued_by)
VALUES
  ('cn-vid-01', 'CN-2026-0114', datetime('now','-4 hours'),
   datetime('now','-3 hours'), datetime('now','+5 hours'),
   'NW-Klerksdorp', 'Transmission constraint on Klerksdorp–Witkop 400kV — derate solar dispatch.',
   75, 'mandatory', 'active', 'demo_grid_001'),
  ('cn-vid-02', 'CN-2026-0113', datetime('now','-9 hours'),
   datetime('now','-8 hours'), datetime('now','-1 hours'),
   'LP-Mookgopong', 'Reserve margin tightening — voluntary wind curtailment requested.',
   40, 'advisory', 'lifted', 'demo_grid_001'),
  ('cn-vid-03', 'CN-2026-0112', datetime('now','-26 hours'),
   datetime('now','-25 hours'), datetime('now','-19 hours'),
   'GP-Brits', 'Stage-1 load shedding instructed by System Operator.',
   120, 'emergency', 'lifted', 'demo_grid_001'),
  ('cn-vid-04', 'CN-2026-0111', datetime('now','-50 hours'),
   datetime('now','-49 hours'), datetime('now','+1 hours'),
   'KZN-Richards Bay', 'Scheduled line maintenance — wheeling capacity reduced.',
   30, 'advisory', 'active', 'demo_grid_001');

-- ─── Curtailment events (lifecycle against the active notice cn-vid-01) ─
INSERT OR IGNORE INTO grid_curtailment_events
  (id, curtailment_id, event_type, actor_id, occurred_at, notes)
VALUES
  ('gce-vid-01', 'cn-vid-01', 'issued',         'demo_grid_001',   datetime('now','-3 hours','+12 minutes'),
   'Notice issued to affected IPPs in NW-Klerksdorp zone.'),
  ('gce-vid-02', 'cn-vid-01', 'acknowledged',   'demo_ipp_001',    datetime('now','-3 hours','+18 minutes'),
   'Klerksdorp 50MW Solar PV — derate confirmed by plant.'),
  ('gce-vid-03', 'cn-vid-01', 'acknowledged',   'demo_ipp_002',    datetime('now','-3 hours','+22 minutes'),
   'Mookgopong 40MW Wind — derate accepted.'),
  ('gce-vid-04', 'cn-vid-01', 'partial_lift',   'demo_grid_001',   datetime('now','-1 hours','+5 minutes'),
   'Constraint eased — partial dispatch return authorised for solar.'),
  ('gce-vid-05', 'cn-vid-02', 'full_lift',      'demo_grid_001',   datetime('now','-1 hours'),
   'Reserve margin recovered; notice CN-2026-0113 lifted.'),
  ('gce-vid-06', 'cn-vid-03', 'escalated',      'demo_grid_001',   datetime('now','-24 hours','-30 minutes'),
   'Stage-1 escalated to Stage-2 briefly before full restoration.');

-- ─── Grid outages ──────────────────────────────────────────────────────
INSERT OR IGNORE INTO grid_outages
  (id, outage_number, outage_type, severity, reported_at, started_at,
   estimated_restoration_at, restored_at, affected_zone, affected_substations,
   affected_customers, affected_load_mw, cause, status, commander_id)
VALUES
  ('go-vid-01', 'OUT-2026-0312', 'unplanned', 'high',
   datetime('now','-2 hours','-15 minutes'),
   datetime('now','-2 hours','-15 minutes'),
   datetime('now','+90 minutes'), NULL,
   'NW-Klerksdorp', '["sub_klerksdorp_north"]',
   18400, 42.5, 'Lightning strike on 132kV bus.',
   'in_progress', 'demo_grid_001'),
  ('go-vid-02', 'OUT-2026-0311', 'planned', 'low',
   datetime('now','-1 days'),
   datetime('now','-1 days'),
   datetime('now','+2 hours'),
   datetime('now','-30 minutes'),
   'GP-Brits', '["sub_brits_west"]',
   5200, 12.0, 'Scheduled transformer maintenance.',
   'restored', 'demo_grid_001'),
  ('go-vid-03', 'OUT-2026-0310', 'forced', 'critical',
   datetime('now','-3 days','-8 hours'),
   datetime('now','-3 days','-8 hours'),
   datetime('now','-3 days','+6 hours'),
   datetime('now','-3 days','+5 hours','-12 minutes'),
   'LP-Mookgopong', '["sub_mookgopong_east","sub_mookgopong_central"]',
   31200, 78.4, 'Conductor failure following severe weather.',
   'closed', 'demo_grid_001');

-- ─── Ancillary services — 1 FCR tender, 2 bids, 1 award ────────────────
INSERT OR IGNORE INTO ancillary_service_tenders
  (id, tender_number, product_id, delivery_window_start, delivery_window_end,
   capacity_required_mw, ceiling_price_zar_mw_h, gate_closure_at, status,
   notes, published_by)
VALUES
  ('ast-vid-01', 'AS-2026-FCR-014', 'asp_fcr',
   datetime('now','+1 days','start of day','+18 hours'),
   datetime('now','+2 days','start of day','+6 hours'),
   60.0, 1850.0, datetime('now','+8 hours'), 'awarded',
   'Frequency Containment Reserve — Northern Cape import window.',
   'demo_grid_001');

INSERT OR IGNORE INTO ancillary_service_bids
  (id, tender_id, participant_id, capacity_offered_mw, price_zar_mw_h,
   site_id, status, awarded_capacity_mw, awarded_price_zar_mw_h)
VALUES
  ('asb-vid-01', 'ast-vid-01', 'demo_ipp_001', 40.0, 1620.0,
   'ip_001', 'awarded_full', 40.0, 1620.0),
  ('asb-vid-02', 'ast-vid-01', 'demo_ipp_002', 25.0, 1750.0,
   'ip_002', 'awarded_partial', 20.0, 1750.0);

INSERT OR IGNORE INTO ancillary_service_awards
  (id, tender_id, bid_id, awarded_capacity_mw, clearing_price_zar_mw_h,
   awarded_at, awarded_by)
VALUES
  ('asa-vid-01', 'ast-vid-01', 'asb-vid-01', 40.0, 1620.0,
   datetime('now','-2 hours'), 'demo_grid_001'),
  ('asa-vid-02', 'ast-vid-01', 'asb-vid-02', 20.0, 1750.0,
   datetime('now','-2 hours'), 'demo_grid_001');

-- ─── Margin calls — Settlement workstation hero ────────────────────────
INSERT OR IGNORE INTO margin_calls
  (id, participant_id, as_of, exposure_zar, initial_margin_zar,
   variation_margin_zar, posted_collateral_zar, shortfall_zar,
   due_by, status, created_at)
VALUES
  ('mc-vid-01', 'demo_trader_001', datetime('now','-3 hours'),
   12500000, 1250000, 480000, 1300000, 430000,
   datetime('now','+3 hours'),  'open',       datetime('now','-3 hours')),
  ('mc-vid-02', 'demo_ipp_002',   datetime('now','-2 hours'),
   8400000,  840000,  290000,   900000,  230000,
   datetime('now','+6 hours'),  'open',       datetime('now','-2 hours')),
  ('mc-vid-03', 'demo_offtaker_001', datetime('now','-1 hours'),
   15600000, 1560000, 610000,  1700000, 470000,
   datetime('now','+12 hours'), 'escalated',  datetime('now','-1 hours')),
  ('mc-vid-04', 'demo_carbon_001', datetime('now','-26 hours'),
   3200000,  320000,  110000,  450000,  0,
   datetime('now','-2 hours'),  'met',        datetime('now','-26 hours'));

PRAGMA foreign_keys = ON;
