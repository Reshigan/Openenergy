-- ═══════════════════════════════════════════════════════════════════════════
-- Wave 20 — COD chain seed.
--
-- 10 projects spanning every chain state × tier. Dates chosen so a few
-- breach their SLA so the UI shows the breach state immediately.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. draft / large — Kathu II solar park, EPC nego in flight ────────────
INSERT OR IGNORE INTO oe_cod_chain
  (id, cod_number, project_id, participant_id, project_name, capacity_mw, capacity_tier,
   chain_status, target_cod_date, created_by, created_at, updated_at, sla_deadline_at)
VALUES
  ('cod_001', 'COD-2026-001', 'proj_solar_001', 'ip_001', 'Kathu II Solar 150MW', 150, 'large',
   'draft', '2028-06-30', 'demo_ipp_001', '2026-04-15T08:00:00Z', '2026-04-15T08:00:00Z', '2026-07-14T08:00:00Z');

INSERT OR IGNORE INTO oe_cod_chain_events (id, cod_id, event_type, from_status, to_status, actor_id, notes, payload, created_at)
VALUES
  ('cod_evt_001', 'cod_001', 'created', NULL, 'draft', 'demo_ipp_001', 'Project initiated post-procurement award. EPC nego window opened.', '{}', '2026-04-15T08:00:00Z');

-- ─── 2. epc_signed / large — Jeffreys Bay extension, NTP imminent ──────────
INSERT OR IGNORE INTO oe_cod_chain
  (id, cod_number, project_id, participant_id, project_name, epc_contract_id, epc_contractor_name,
   capacity_mw, capacity_tier, chain_status, target_cod_date, epc_signed_at, created_by,
   created_at, updated_at, sla_deadline_at)
VALUES
  ('cod_002', 'COD-2026-002', 'proj_wind_001', 'ip_002', 'Jeffreys Bay 138T Extension 350MW', 'epc_wind_001',
   'Vestas Southern Africa', 350, 'large', 'epc_signed', '2028-12-15', '2026-02-20T10:00:00Z',
   'demo_ipp_001', '2026-01-10T09:00:00Z', '2026-02-20T10:00:00Z', '2026-04-21T10:00:00Z');

INSERT OR IGNORE INTO oe_cod_chain_events (id, cod_id, event_type, from_status, to_status, actor_id, notes, payload, created_at)
VALUES
  ('cod_evt_002', 'cod_002', 'created',    NULL,        'draft',      'demo_ipp_001', 'Project initiated.', '{}', '2026-01-10T09:00:00Z'),
  ('cod_evt_003', 'cod_002', 'epc_signed', 'draft',     'epc_signed', 'demo_ipp_001', 'EPC contract executed with Vestas — R5.2bn turnkey.', '{"epc":"Vestas Southern Africa","value_zar":5200000000}', '2026-02-20T10:00:00Z');

-- ─── 3. ntp_issued / medium — Kangnas balance-of-plant, R850m ─────────────
INSERT OR IGNORE INTO oe_cod_chain
  (id, cod_number, project_id, participant_id, project_name, epc_contract_id, epc_contractor_name,
   capacity_mw, capacity_tier, chain_status, target_cod_date, epc_signed_at, ntp_issued_at,
   created_by, created_at, updated_at, sla_deadline_at)
VALUES
  ('cod_003', 'COD-2026-003', 'proj_wind_002', 'ip_002', 'Kangnas BoP 75MW',  'epc_wind_002',
   'Group Five Energy', 75, 'medium', 'ntp_issued', '2027-09-30', '2025-11-15T09:00:00Z', '2026-03-10T11:00:00Z',
   'demo_ipp_001', '2025-09-01T09:00:00Z', '2026-03-10T11:00:00Z', '2026-03-31T11:00:00Z');

INSERT OR IGNORE INTO oe_cod_chain_events (id, cod_id, event_type, from_status, to_status, actor_id, notes, payload, created_at)
VALUES
  ('cod_evt_004', 'cod_003', 'created',    NULL,         'draft',      'demo_ipp_001', 'Initiated.', '{}', '2025-09-01T09:00:00Z'),
  ('cod_evt_005', 'cod_003', 'epc_signed', 'draft',      'epc_signed', 'demo_ipp_001', 'EPC awarded post-RFP.', '{"epc":"Group Five Energy"}', '2025-11-15T09:00:00Z'),
  ('cod_evt_006', 'cod_003', 'ntp_issued', 'epc_signed', 'ntp_issued', 'demo_ipp_001', 'NTP issued, mobilization to begin within 21d.', '{}', '2026-03-10T11:00:00Z');

-- ─── 4. mobilization / large — De Aar BESS, civil works phase (breached) ──
INSERT OR IGNORE INTO oe_cod_chain
  (id, cod_number, project_id, participant_id, project_name, epc_contract_id, epc_contractor_name,
   capacity_mw, capacity_tier, chain_status, target_cod_date, epc_signed_at, ntp_issued_at, mobilization_at,
   created_by, created_at, updated_at, sla_deadline_at, last_sla_breach_at, escalation_level)
VALUES
  ('cod_004', 'COD-2026-004', 'proj_bess_001', 'ip_001', 'De Aar 200MWh BESS', 'epc_bess_001',
   'Tesla Megapack EPC', 200, 'large', 'mobilization', '2027-06-30', '2024-08-15T09:00:00Z',
   '2024-11-01T09:00:00Z', '2024-12-10T09:00:00Z',
   'demo_ipp_001', '2024-05-15T09:00:00Z', '2024-12-10T09:00:00Z',
   '2026-05-20T09:00:00Z', '2026-05-22T08:00:00Z', 1);

INSERT OR IGNORE INTO oe_cod_chain_events (id, cod_id, event_type, from_status, to_status, actor_id, notes, payload, created_at)
VALUES
  ('cod_evt_007', 'cod_004', 'created',      NULL,         'draft',        'demo_ipp_001', 'BESS pilot initiated.', '{}', '2024-05-15T09:00:00Z'),
  ('cod_evt_008', 'cod_004', 'epc_signed',   'draft',      'epc_signed',   'demo_ipp_001', 'Tesla Megapack EPC executed.', '{}', '2024-08-15T09:00:00Z'),
  ('cod_evt_009', 'cod_004', 'ntp_issued',   'epc_signed', 'ntp_issued',   'demo_ipp_001', 'NTP issued.', '{}', '2024-11-01T09:00:00Z'),
  ('cod_evt_010', 'cod_004', 'mobilized',    'ntp_issued', 'mobilization', 'demo_ipp_001', 'Site mobilization complete, civil works in progress.', '{}', '2024-12-10T09:00:00Z'),
  ('cod_evt_011', 'cod_004', 'sla_breached', 'mobilization', 'mobilization', 'system', 'Breached 777600m SLA (mech complete deadline missed).', '{"sla_window":"777600m","crosses_to_regulator":true}', '2026-05-22T08:00:00Z');

-- ─── 5. mechanical_complete / medium — Loeriesfontein extension ────────────
INSERT OR IGNORE INTO oe_cod_chain
  (id, cod_number, project_id, participant_id, project_name, epc_contract_id, epc_contractor_name,
   capacity_mw, capacity_tier, chain_status, target_cod_date, epc_signed_at, ntp_issued_at,
   mobilization_at, mechanical_complete_at, created_by, created_at, updated_at, sla_deadline_at)
VALUES
  ('cod_005', 'COD-2026-005', 'proj_wind_003', 'ip_002', 'Loeriesfontein Extension 60MW', 'epc_loer_001',
   'Murray & Roberts Energy', 60, 'medium', 'mechanical_complete', '2026-09-30',
   '2024-06-01T09:00:00Z', '2024-08-15T09:00:00Z', '2024-09-10T09:00:00Z', '2026-04-25T09:00:00Z',
   'demo_ipp_001', '2024-03-01T09:00:00Z', '2026-04-25T09:00:00Z', '2026-06-09T09:00:00Z');

INSERT OR IGNORE INTO oe_cod_chain_events (id, cod_id, event_type, from_status, to_status, actor_id, notes, payload, created_at)
VALUES
  ('cod_evt_012', 'cod_005', 'created',             NULL,                  'draft',               'demo_ipp_001', 'Initiated.', '{}', '2024-03-01T09:00:00Z'),
  ('cod_evt_013', 'cod_005', 'epc_signed',          'draft',               'epc_signed',          'demo_ipp_001', 'EPC executed.', '{}', '2024-06-01T09:00:00Z'),
  ('cod_evt_014', 'cod_005', 'ntp_issued',          'epc_signed',          'ntp_issued',          'demo_ipp_001', 'NTP issued.', '{}', '2024-08-15T09:00:00Z'),
  ('cod_evt_015', 'cod_005', 'mobilized',           'ntp_issued',          'mobilization',        'demo_ipp_001', 'Mobilized.', '{}', '2024-09-10T09:00:00Z'),
  ('cod_evt_016', 'cod_005', 'mechanical_complete', 'mobilization',        'mechanical_complete', 'demo_ipp_001', 'All 12 turbines erected; civil works complete; cold commissioning scheduled.', '{"turbines":12}', '2026-04-25T09:00:00Z');

-- ─── 6. cold_commissioning / large — Xina CSP, commissioning subsystems ──
INSERT OR IGNORE INTO oe_cod_chain
  (id, cod_number, project_id, participant_id, project_name, epc_contract_id, epc_contractor_name,
   capacity_mw, capacity_tier, chain_status, target_cod_date, epc_signed_at, ntp_issued_at,
   mobilization_at, mechanical_complete_at, cold_comm_at, created_by, created_at, updated_at, sla_deadline_at)
VALUES
  ('cod_006', 'COD-2026-006', 'proj_csp_001', 'ip_001', 'Xina Solar One 100MW CSP', 'epc_csp_001',
   'Sener Renewables', 100, 'large', 'cold_commissioning', '2027-03-15',
   '2024-01-15T09:00:00Z', '2024-04-01T09:00:00Z', '2024-05-10T09:00:00Z', '2026-03-20T09:00:00Z', '2026-05-05T09:00:00Z',
   'demo_ipp_001', '2023-10-15T09:00:00Z', '2026-05-05T09:00:00Z', '2026-06-04T09:00:00Z');

INSERT OR IGNORE INTO oe_cod_chain_events (id, cod_id, event_type, from_status, to_status, actor_id, notes, payload, created_at)
VALUES
  ('cod_evt_017', 'cod_006', 'created',             NULL,                  'draft',               'demo_ipp_001', 'CSP project initiated.', '{}', '2023-10-15T09:00:00Z'),
  ('cod_evt_018', 'cod_006', 'epc_signed',          'draft',               'epc_signed',          'demo_ipp_001', 'Sener EPC executed.', '{}', '2024-01-15T09:00:00Z'),
  ('cod_evt_019', 'cod_006', 'ntp_issued',          'epc_signed',          'ntp_issued',          'demo_ipp_001', 'NTP issued.', '{}', '2024-04-01T09:00:00Z'),
  ('cod_evt_020', 'cod_006', 'mobilized',           'ntp_issued',          'mobilization',        'demo_ipp_001', 'Mobilized.', '{}', '2024-05-10T09:00:00Z'),
  ('cod_evt_021', 'cod_006', 'mechanical_complete', 'mobilization',        'mechanical_complete', 'demo_ipp_001', 'Solar field + storage tower complete.', '{}', '2026-03-20T09:00:00Z'),
  ('cod_evt_022', 'cod_006', 'cold_commissioned',   'mechanical_complete', 'cold_commissioning',  'demo_ipp_001', 'Cold commissioning of HTF loop + storage system underway.', '{}', '2026-05-05T09:00:00Z');

-- ─── 7. grid_synchronized / large — Roggeveld wind, sync test passed ────
INSERT OR IGNORE INTO oe_cod_chain
  (id, cod_number, project_id, participant_id, project_name, epc_contract_id, epc_contractor_name,
   capacity_mw, capacity_tier, chain_status, target_cod_date, epc_signed_at, ntp_issued_at,
   mobilization_at, mechanical_complete_at, cold_comm_at, grid_sync_at,
   created_by, created_at, updated_at, sla_deadline_at)
VALUES
  ('cod_007', 'COD-2026-007', 'proj_wind_004', 'ip_002', 'Roggeveld 147MW Wind', 'epc_rogg_001',
   'Nordex Acciona EPC', 147, 'large', 'grid_synchronized', '2026-08-31',
   '2023-08-01T09:00:00Z', '2023-11-15T09:00:00Z', '2024-01-20T09:00:00Z', '2025-12-15T09:00:00Z',
   '2026-04-01T09:00:00Z', '2026-05-15T09:00:00Z',
   'demo_ipp_001', '2023-05-01T09:00:00Z', '2026-05-15T09:00:00Z', '2026-05-29T09:00:00Z');

INSERT OR IGNORE INTO oe_cod_chain_events (id, cod_id, event_type, from_status, to_status, actor_id, notes, payload, created_at)
VALUES
  ('cod_evt_023', 'cod_007', 'created',             NULL,                  'draft',               'demo_ipp_001', 'Wind project initiated.', '{}', '2023-05-01T09:00:00Z'),
  ('cod_evt_024', 'cod_007', 'epc_signed',          'draft',               'epc_signed',          'demo_ipp_001', 'Nordex Acciona EPC executed.', '{}', '2023-08-01T09:00:00Z'),
  ('cod_evt_025', 'cod_007', 'ntp_issued',          'epc_signed',          'ntp_issued',          'demo_ipp_001', 'NTP issued.', '{}', '2023-11-15T09:00:00Z'),
  ('cod_evt_026', 'cod_007', 'mobilized',           'ntp_issued',          'mobilization',        'demo_ipp_001', 'Mobilized.', '{}', '2024-01-20T09:00:00Z'),
  ('cod_evt_027', 'cod_007', 'mechanical_complete', 'mobilization',        'mechanical_complete', 'demo_ipp_001', '47 turbines erected.', '{"turbines":47}', '2025-12-15T09:00:00Z'),
  ('cod_evt_028', 'cod_007', 'cold_commissioned',   'mechanical_complete', 'cold_commissioning',  'demo_ipp_001', 'Cold commissioning passed all turbines.', '{}', '2026-04-01T09:00:00Z'),
  ('cod_evt_029', 'cod_007', 'grid_synchronized',   'cold_commissioning',  'grid_synchronized',   'demo_ipp_001', 'Grid synchronization with Eskom transmission complete. Sync test passed at all 12 reference points.', '{"sync_reference_points":12}', '2026-05-15T09:00:00Z');

-- ─── 8. reliability_run / large — Garob solar, in 21-day reliability test ─
INSERT OR IGNORE INTO oe_cod_chain
  (id, cod_number, project_id, participant_id, project_name, epc_contract_id, epc_contractor_name,
   capacity_mw, capacity_tier, chain_status, target_cod_date, epc_signed_at, ntp_issued_at,
   mobilization_at, mechanical_complete_at, cold_comm_at, grid_sync_at, reliability_run_at,
   ie_certifier, created_by, created_at, updated_at, sla_deadline_at)
VALUES
  ('cod_008', 'COD-2026-008', 'proj_solar_002', 'ip_001', 'Garob 145MW Solar', 'epc_garob_001',
   'Acwa Power EPC', 145, 'large', 'reliability_run', '2026-06-30',
   '2023-04-01T09:00:00Z', '2023-07-15T09:00:00Z', '2023-08-20T09:00:00Z',
   '2025-10-01T09:00:00Z', '2026-01-15T09:00:00Z', '2026-04-25T09:00:00Z', '2026-05-12T09:00:00Z',
   'Mott MacDonald (IE)',
   'demo_ipp_001', '2023-01-15T09:00:00Z', '2026-05-12T09:00:00Z', '2026-06-02T09:00:00Z');

INSERT OR IGNORE INTO oe_cod_chain_events (id, cod_id, event_type, from_status, to_status, actor_id, notes, payload, created_at)
VALUES
  ('cod_evt_030', 'cod_008', 'created',              NULL,                  'draft',               'demo_ipp_001', 'Solar project initiated.', '{}', '2023-01-15T09:00:00Z'),
  ('cod_evt_031', 'cod_008', 'epc_signed',           'draft',               'epc_signed',          'demo_ipp_001', 'Acwa Power EPC.', '{}', '2023-04-01T09:00:00Z'),
  ('cod_evt_032', 'cod_008', 'ntp_issued',           'epc_signed',          'ntp_issued',          'demo_ipp_001', 'NTP.', '{}', '2023-07-15T09:00:00Z'),
  ('cod_evt_033', 'cod_008', 'mobilized',            'ntp_issued',          'mobilization',        'demo_ipp_001', 'Mobilized.', '{}', '2023-08-20T09:00:00Z'),
  ('cod_evt_034', 'cod_008', 'mechanical_complete',  'mobilization',        'mechanical_complete', 'demo_ipp_001', '462k modules + inverter stations.', '{}', '2025-10-01T09:00:00Z'),
  ('cod_evt_035', 'cod_008', 'cold_commissioned',    'mechanical_complete', 'cold_commissioning',  'demo_ipp_001', 'Cold commissioning passed.', '{}', '2026-01-15T09:00:00Z'),
  ('cod_evt_036', 'cod_008', 'grid_synchronized',    'cold_commissioning',  'grid_synchronized',   'demo_ipp_001', 'Grid sync complete.', '{}', '2026-04-25T09:00:00Z'),
  ('cod_evt_037', 'cod_008', 'reliability_started',  'grid_synchronized',   'reliability_run',     'demo_ipp_001', '21-day reliability run started, Mott MacDonald monitoring.', '{"ie":"Mott MacDonald"}', '2026-05-12T09:00:00Z');

-- ─── 9. cod_certified / large — Touwsrivier 75MW, fully certified (REG x-ref) ─
INSERT OR IGNORE INTO oe_cod_chain
  (id, cod_number, project_id, participant_id, project_name, epc_contract_id, epc_contractor_name,
   capacity_mw, capacity_tier, chain_status, target_cod_date, actual_cod_date, epc_signed_at, ntp_issued_at,
   mobilization_at, mechanical_complete_at, cold_comm_at, grid_sync_at, reliability_run_at, cod_certified_at,
   ie_certifier, ie_cert_doc_ref, nersa_scada_ref,
   created_by, created_at, updated_at, sla_deadline_at)
VALUES
  ('cod_009', 'COD-2026-009', 'proj_solar_003', 'ip_001', 'Touwsrivier CPV 36MW', 'epc_touw_001',
   'Soitec EPC', 36, 'medium', 'cod_certified', '2026-04-30', '2026-04-28',
   '2022-08-01T09:00:00Z', '2022-11-10T09:00:00Z', '2022-12-15T09:00:00Z',
   '2025-04-20T09:00:00Z', '2025-08-01T09:00:00Z', '2025-12-15T09:00:00Z',
   '2026-03-15T09:00:00Z', '2026-04-28T09:00:00Z',
   'Mott MacDonald (IE)', 'IE-CERT-2026-TOUW-0042', NULL,
   'demo_ipp_001', '2022-05-01T09:00:00Z', '2026-04-28T09:00:00Z', NULL);

INSERT OR IGNORE INTO oe_cod_chain_events (id, cod_id, event_type, from_status, to_status, actor_id, notes, payload, created_at)
VALUES
  ('cod_evt_038', 'cod_009', 'created',             NULL,                  'draft',               'demo_ipp_001', 'CPV project initiated.', '{}', '2022-05-01T09:00:00Z'),
  ('cod_evt_039', 'cod_009', 'epc_signed',          'draft',               'epc_signed',          'demo_ipp_001', 'Soitec EPC.', '{}', '2022-08-01T09:00:00Z'),
  ('cod_evt_040', 'cod_009', 'ntp_issued',          'epc_signed',          'ntp_issued',          'demo_ipp_001', 'NTP.', '{}', '2022-11-10T09:00:00Z'),
  ('cod_evt_041', 'cod_009', 'mobilized',           'ntp_issued',          'mobilization',        'demo_ipp_001', 'Mobilized.', '{}', '2022-12-15T09:00:00Z'),
  ('cod_evt_042', 'cod_009', 'mechanical_complete', 'mobilization',        'mechanical_complete', 'demo_ipp_001', 'Mechanical complete.', '{}', '2025-04-20T09:00:00Z'),
  ('cod_evt_043', 'cod_009', 'cold_commissioned',   'mechanical_complete', 'cold_commissioning',  'demo_ipp_001', 'Cold commissioning passed.', '{}', '2025-08-01T09:00:00Z'),
  ('cod_evt_044', 'cod_009', 'grid_synchronized',   'cold_commissioning',  'grid_synchronized',   'demo_ipp_001', 'Grid sync complete.', '{}', '2025-12-15T09:00:00Z'),
  ('cod_evt_045', 'cod_009', 'reliability_started', 'grid_synchronized',   'reliability_run',     'demo_ipp_001', '21-day reliability run.', '{}', '2026-03-15T09:00:00Z'),
  ('cod_evt_046', 'cod_009', 'cod_certified',       'reliability_run',     'cod_certified',       'demo_ipp_001', 'IE Mott MacDonald certified COD. Drawdown unlocked. NERSA SCADA registration pending.', '{"ie":"Mott MacDonald","actual_cod":"2026-04-28","crosses_to_regulator":false}', '2026-04-28T09:00:00Z');

-- ─── 10. cancelled / large — Vredendal solar, cancelled at NTP (force majeure) ─
INSERT OR IGNORE INTO oe_cod_chain
  (id, cod_number, project_id, participant_id, project_name, epc_contract_id, epc_contractor_name,
   capacity_mw, capacity_tier, chain_status, target_cod_date, epc_signed_at, ntp_issued_at,
   cancellation_reason, created_by, created_at, updated_at, sla_deadline_at)
VALUES
  ('cod_010', 'COD-2026-010', 'proj_solar_004', 'ip_001', 'Vredendal 110MW Solar', 'epc_vred_001',
   'Black Rhino Energy', 110, 'large', 'cancelled', '2027-06-30',
   '2025-03-15T09:00:00Z', '2025-08-20T09:00:00Z',
   'Eskom curtailment in northern Cape exceeded 35% projection; PPA renegotiation collapsed. Bid window allocation surrendered.',
   'demo_ipp_001', '2024-11-15T09:00:00Z', '2026-02-10T09:00:00Z', NULL);

INSERT OR IGNORE INTO oe_cod_chain_events (id, cod_id, event_type, from_status, to_status, actor_id, notes, payload, created_at)
VALUES
  ('cod_evt_047', 'cod_010', 'created',    NULL,         'draft',      'demo_ipp_001', 'Solar project initiated post-bid-window.', '{}', '2024-11-15T09:00:00Z'),
  ('cod_evt_048', 'cod_010', 'epc_signed', 'draft',      'epc_signed', 'demo_ipp_001', 'EPC executed.', '{}', '2025-03-15T09:00:00Z'),
  ('cod_evt_049', 'cod_010', 'ntp_issued', 'epc_signed', 'ntp_issued', 'demo_ipp_001', 'NTP issued.', '{}', '2025-08-20T09:00:00Z'),
  ('cod_evt_050', 'cod_010', 'cancelled',  'ntp_issued', 'cancelled',  'demo_ipp_001', 'PPA renegotiation collapse — bid window allocation surrendered to DMRE.', '{"crosses_to_regulator":true,"reason":"PPA collapse"}', '2026-02-10T09:00:00Z');
