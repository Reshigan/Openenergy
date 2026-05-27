-- ═══════════════════════════════════════════════════════════════════════════
-- Wave 13 — Grid operator dispatch nomination chain demo seed.
--
-- 10 demo nominations covering every chain state so the UI tab, KPI strip
-- and Playwright smoke have content from launch.
--
-- States covered:
--   nominated              — disp_nom_001  awaiting SO accept (within 15m)
--   nominated (breached)   — disp_nom_002  past 15m SLA — to be picked up by cron
--   accepted               — disp_nom_003  within 30m of accept
--   activated              — disp_nom_004  in delivery, awaiting performance
--   performance_recorded   — disp_nom_005  delivery done, awaiting settlement
--   settled                — disp_nom_006  imbalance computed
--   closed                 — disp_nom_007  full happy-path complete
--   nomination_rejected    — disp_nom_008  SO rejected at accept gate
--   disputed               — disp_nom_009  participant raised dispute
--   closed_disputed        — disp_nom_010  dispute resolved + closed
--
-- All trading_days anchored relative to 'now'. INSERT OR IGNORE keeps replay
-- safe.
-- ═══════════════════════════════════════════════════════════════════════════

INSERT OR IGNORE INTO oe_dispatch_nominations
  (id, participant_id, trading_day, schedule_type, scheduled_mwh, actual_mwh, imbalance_mwh, charge_zar,
   nomination_status, rejection_reason, dispute_reason, dispute_resolution,
   nominated_at, accepted_at, activated_at, performance_recorded_at, settled_at, closed_at,
   rejected_at, dispute_raised_at, dispute_resolved_at,
   next_sla_due_at, last_sla_breach_at,
   submitted_by, accepted_by, activated_by, settled_by, created_at)
VALUES
  ('disp_nom_001', 'demo_ipp_001', date('now','+1 days'), 'day_ahead', 720.0, NULL, NULL, NULL,
   'nominated', NULL, NULL, NULL,
   datetime('now','-5 minutes'), NULL, NULL, NULL, NULL, NULL,
   NULL, NULL, NULL,
   datetime('now','+10 minutes'), NULL,
   'demo_ipp_001', NULL, NULL, NULL, datetime('now','-5 minutes')),

  ('disp_nom_002', 'demo_ipp_002', date('now','+1 days'), 'day_ahead', 480.0, NULL, NULL, NULL,
   'nominated', NULL, NULL, NULL,
   datetime('now','-30 minutes'), NULL, NULL, NULL, NULL, NULL,
   NULL, NULL, NULL,
   datetime('now','-15 minutes'), datetime('now','-10 minutes'),
   'demo_ipp_002', NULL, NULL, NULL, datetime('now','-30 minutes')),

  ('disp_nom_003', 'demo_ipp_001', date('now'), 'day_ahead', 850.0, NULL, NULL, NULL,
   'accepted', NULL, NULL, NULL,
   datetime('now','-20 minutes'), datetime('now','-10 minutes'), NULL, NULL, NULL, NULL,
   NULL, NULL, NULL,
   datetime('now','+20 minutes'), NULL,
   'demo_ipp_001', 'demo_grid_001', NULL, NULL, datetime('now','-20 minutes')),

  ('disp_nom_004', 'demo_ipp_002', date('now'), 'day_ahead', 600.0, NULL, NULL, NULL,
   'activated', NULL, NULL, NULL,
   datetime('now','-3 hours'), datetime('now','-2.5 hours'), datetime('now','-2 hours'), NULL, NULL, NULL,
   NULL, NULL, NULL,
   datetime('now','+10 hours'), NULL,
   'demo_ipp_002', 'demo_grid_001', 'demo_grid_001', NULL, datetime('now','-3 hours')),

  ('disp_nom_005', 'demo_ipp_001', date('now','-1 days'), 'day_ahead', 900.0, 870.0, -30.0, NULL,
   'performance_recorded', NULL, NULL, NULL,
   datetime('now','-1 days','-3 hours'), datetime('now','-1 days','-2.5 hours'), datetime('now','-1 days','-2 hours'),
   datetime('now','-2 hours'), NULL, NULL,
   NULL, NULL, NULL,
   datetime('now','+5 days','-2 hours'), NULL,
   'demo_ipp_001', 'demo_grid_001', 'demo_grid_001', NULL, datetime('now','-1 days','-3 hours')),

  ('disp_nom_006', 'demo_ipp_002', date('now','-3 days'), 'day_ahead', 540.0, 561.0, 21.0, 18900.00,
   'settled', NULL, NULL, NULL,
   datetime('now','-3 days','-3 hours'), datetime('now','-3 days','-2.5 hours'), datetime('now','-3 days','-2 hours'),
   datetime('now','-3 days','+1 hour'), datetime('now','-1 days'), NULL,
   NULL, NULL, NULL,
   datetime('now','+14 days'), NULL,
   'demo_ipp_002', 'demo_grid_001', 'demo_grid_001', 'demo_grid_001', datetime('now','-3 days','-3 hours')),

  ('disp_nom_007', 'demo_ipp_001', date('now','-30 days'), 'day_ahead', 780.0, 780.0, 0.0, 0.00,
   'closed', NULL, NULL, NULL,
   datetime('now','-30 days','-3 hours'), datetime('now','-30 days','-2.5 hours'), datetime('now','-30 days','-2 hours'),
   datetime('now','-30 days','+1 hour'), datetime('now','-28 days'), datetime('now','-13 days'),
   NULL, NULL, NULL,
   NULL, NULL,
   'demo_ipp_001', 'demo_grid_001', 'demo_grid_001', 'demo_grid_001', datetime('now','-30 days','-3 hours')),

  ('disp_nom_008', 'demo_ipp_002', date('now','-2 days'), 'day_ahead', 1200.0, NULL, NULL, NULL,
   'nomination_rejected', 'Nominated MWh exceeds connection capacity in current GCCA evaluation.', NULL, NULL,
   datetime('now','-2 days','-1 hour'), NULL, NULL, NULL, NULL, NULL,
   datetime('now','-2 days','-45 minutes'), NULL, NULL,
   NULL, NULL,
   'demo_ipp_002', NULL, NULL, NULL, datetime('now','-2 days','-1 hour')),

  ('disp_nom_009', 'demo_ipp_001', date('now','-7 days'), 'day_ahead', 820.0, 770.0, -50.0, 45000.00,
   'disputed', NULL, 'Curtailment instruction was issued at 14:30 by SO but not credited in imbalance calc — net 50 MWh shortfall is operator-caused.', NULL,
   datetime('now','-7 days','-3 hours'), datetime('now','-7 days','-2.5 hours'), datetime('now','-7 days','-2 hours'),
   datetime('now','-7 days','+1 hour'), datetime('now','-5 days'), NULL,
   NULL, datetime('now','-3 days'), NULL,
   datetime('now','+7 days'), NULL,
   'demo_ipp_001', 'demo_grid_001', 'demo_grid_001', 'demo_grid_001', datetime('now','-7 days','-3 hours')),

  ('disp_nom_010', 'demo_ipp_002', date('now','-45 days'), 'day_ahead', 480.0, 432.0, -48.0, 0.00,
   'closed_disputed', NULL, 'Force-majeure outage on transmission line — generator unable to deliver.',
   'Force-majeure accepted; imbalance charge reversed in full. POE evidence on file.',
   datetime('now','-45 days','-3 hours'), datetime('now','-45 days','-2.5 hours'), datetime('now','-45 days','-2 hours'),
   datetime('now','-45 days','+1 hour'), datetime('now','-43 days'), datetime('now','-20 days'),
   NULL, datetime('now','-40 days'), datetime('now','-22 days'),
   NULL, NULL,
   'demo_ipp_002', 'demo_grid_001', 'demo_grid_001', 'demo_grid_001', datetime('now','-45 days','-3 hours'));

-- ─── Audit chain rows for each non-trivial state
INSERT OR IGNORE INTO oe_dispatch_nomination_events
  (id, nomination_id, event_type, from_status, to_status, actor_id, notes, created_at)
VALUES
  -- disp_nom_002 — breached at the accept gate
  ('disp_nom_evt_002a', 'disp_nom_002', 'nominated',        NULL,                  'nominated',           'demo_ipp_002', 'BRP day-ahead submission',                          datetime('now','-30 minutes')),
  ('disp_nom_evt_002b', 'disp_nom_002', 'sla_breached',     'nominated',           'nominated',           'system',       'SO did not ACK within 15m SLA',                     datetime('now','-10 minutes')),
  -- disp_nom_003 — accepted
  ('disp_nom_evt_003a', 'disp_nom_003', 'nominated',        NULL,                  'nominated',           'demo_ipp_001', 'BRP day-ahead submission',                          datetime('now','-20 minutes')),
  ('disp_nom_evt_003b', 'disp_nom_003', 'accepted',         'nominated',           'accepted',            'demo_grid_001','SO acknowledged, no constraint breach',             datetime('now','-10 minutes')),
  -- disp_nom_004 — activated
  ('disp_nom_evt_004a', 'disp_nom_004', 'nominated',        NULL,                  'nominated',           'demo_ipp_002', 'BRP day-ahead submission',                          datetime('now','-3 hours')),
  ('disp_nom_evt_004b', 'disp_nom_004', 'accepted',         'nominated',           'accepted',            'demo_grid_001','SO acknowledged',                                   datetime('now','-2.5 hours')),
  ('disp_nom_evt_004c', 'disp_nom_004', 'activated',        'accepted',            'activated',           'demo_grid_001','Schedule published post-gate-closure',              datetime('now','-2 hours')),
  -- disp_nom_005 — performance recorded
  ('disp_nom_evt_005a', 'disp_nom_005', 'nominated',        NULL,                  'nominated',           'demo_ipp_001', 'BRP day-ahead submission',                          datetime('now','-1 days','-3 hours')),
  ('disp_nom_evt_005b', 'disp_nom_005', 'accepted',         'nominated',           'accepted',            'demo_grid_001','SO acknowledged',                                   datetime('now','-1 days','-2.5 hours')),
  ('disp_nom_evt_005c', 'disp_nom_005', 'activated',        'accepted',            'activated',           'demo_grid_001','Schedule activated',                                datetime('now','-1 days','-2 hours')),
  ('disp_nom_evt_005d', 'disp_nom_005', 'performance_recorded','activated',        'performance_recorded','system',       'Metering ingest closed: 870 MWh actual',           datetime('now','-2 hours')),
  -- disp_nom_006 — settled
  ('disp_nom_evt_006a', 'disp_nom_006', 'nominated',        NULL,                  'nominated',           'demo_ipp_002', 'BRP day-ahead submission',                          datetime('now','-3 days','-3 hours')),
  ('disp_nom_evt_006b', 'disp_nom_006', 'accepted',         'nominated',           'accepted',            'demo_grid_001','SO acknowledged',                                   datetime('now','-3 days','-2.5 hours')),
  ('disp_nom_evt_006c', 'disp_nom_006', 'activated',        'accepted',            'activated',           'demo_grid_001','Schedule activated',                                datetime('now','-3 days','-2 hours')),
  ('disp_nom_evt_006d', 'disp_nom_006', 'performance_recorded','activated',        'performance_recorded','system',       'Metering ingest closed: 561 MWh actual (+21 MWh)',  datetime('now','-3 days','+1 hour')),
  ('disp_nom_evt_006e', 'disp_nom_006', 'settled',          'performance_recorded','settled',             'demo_grid_001','Imbalance charge R 18 900 (long position)',         datetime('now','-1 days')),
  -- disp_nom_007 — closed
  ('disp_nom_evt_007a', 'disp_nom_007', 'nominated',        NULL,                  'nominated',           'demo_ipp_001', 'BRP day-ahead submission',                          datetime('now','-30 days','-3 hours')),
  ('disp_nom_evt_007b', 'disp_nom_007', 'accepted',         'nominated',           'accepted',            'demo_grid_001','SO acknowledged',                                   datetime('now','-30 days','-2.5 hours')),
  ('disp_nom_evt_007c', 'disp_nom_007', 'activated',        'accepted',            'activated',           'demo_grid_001','Schedule activated',                                datetime('now','-30 days','-2 hours')),
  ('disp_nom_evt_007d', 'disp_nom_007', 'performance_recorded','activated',        'performance_recorded','system',       'Perfect delivery: 780 MWh actual',                  datetime('now','-30 days','+1 hour')),
  ('disp_nom_evt_007e', 'disp_nom_007', 'settled',          'performance_recorded','settled',             'demo_grid_001','Zero imbalance — no charge',                        datetime('now','-28 days')),
  ('disp_nom_evt_007f', 'disp_nom_007', 'closed',           'settled',             'closed',              'demo_grid_001','15-day dispute window expired without claims',      datetime('now','-13 days')),
  -- disp_nom_008 — rejected
  ('disp_nom_evt_008a', 'disp_nom_008', 'nominated',        NULL,                  'nominated',           'demo_ipp_002',     'BRP day-ahead submission',                      datetime('now','-2 days','-1 hour')),
  ('disp_nom_evt_008b', 'disp_nom_008', 'nomination_rejected','nominated',         'nomination_rejected', 'demo_grid_001','GCCA capacity violation — rejected',                datetime('now','-2 days','-45 minutes')),
  -- disp_nom_009 — disputed
  ('disp_nom_evt_009a', 'disp_nom_009', 'nominated',        NULL,                  'nominated',           'demo_ipp_001', 'BRP day-ahead submission',                          datetime('now','-7 days','-3 hours')),
  ('disp_nom_evt_009b', 'disp_nom_009', 'accepted',         'nominated',           'accepted',            'demo_grid_001','SO acknowledged',                                   datetime('now','-7 days','-2.5 hours')),
  ('disp_nom_evt_009c', 'disp_nom_009', 'activated',        'accepted',            'activated',           'demo_grid_001','Schedule activated',                                datetime('now','-7 days','-2 hours')),
  ('disp_nom_evt_009d', 'disp_nom_009', 'performance_recorded','activated',        'performance_recorded','system',       'Metering ingest: 770 MWh actual (-50)',             datetime('now','-7 days','+1 hour')),
  ('disp_nom_evt_009e', 'disp_nom_009', 'settled',          'performance_recorded','settled',             'demo_grid_001','Imbalance charge R 45 000',                         datetime('now','-5 days')),
  ('disp_nom_evt_009f', 'disp_nom_009', 'dispute_raised',   'settled',             'disputed',            'demo_ipp_001', 'Disputed — operator-caused curtailment',            datetime('now','-3 days')),
  -- disp_nom_010 — full disputed lifecycle complete
  ('disp_nom_evt_010a', 'disp_nom_010', 'nominated',        NULL,                  'nominated',           'demo_ipp_002', 'BRP day-ahead submission',                          datetime('now','-45 days','-3 hours')),
  ('disp_nom_evt_010b', 'disp_nom_010', 'accepted',         'nominated',           'accepted',            'demo_grid_001','SO acknowledged',                                   datetime('now','-45 days','-2.5 hours')),
  ('disp_nom_evt_010c', 'disp_nom_010', 'activated',        'accepted',            'activated',           'demo_grid_001','Schedule activated',                                datetime('now','-45 days','-2 hours')),
  ('disp_nom_evt_010d', 'disp_nom_010', 'performance_recorded','activated',        'performance_recorded','system',       'Metering ingest: 432 MWh actual (-48, force majeure)', datetime('now','-45 days','+1 hour')),
  ('disp_nom_evt_010e', 'disp_nom_010', 'settled',          'performance_recorded','settled',             'demo_grid_001','Imbalance charge issued',                           datetime('now','-43 days')),
  ('disp_nom_evt_010f', 'disp_nom_010', 'dispute_raised',   'settled',             'disputed',            'demo_ipp_002', 'Force-majeure claim raised',                        datetime('now','-40 days')),
  ('disp_nom_evt_010g', 'disp_nom_010', 'dispute_resolved', 'disputed',            'dispute_resolved',    'demo_grid_001','Force-majeure accepted; charge reversed',           datetime('now','-22 days')),
  ('disp_nom_evt_010h', 'disp_nom_010', 'closed_disputed',  'dispute_resolved',    'closed_disputed',     'demo_grid_001','Closed post-dispute',                               datetime('now','-20 days'));
