-- ═══════════════════════════════════════════════════════════════════════════
-- Wave 19 — IPP procurement / RFP chain seed.
--
-- 12 RFPs spanning every chain state × capex_tier, mirroring real REIPPPP-
-- style procurement activity (EPC contracts, OEM turbines/PV modules,
-- balance-of-plant, services, spares).
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── HIGH tier (≥ R500m, REIPPPP-scale) ──────────────────────────────────
INSERT OR IGNORE INTO oe_procurement_rfps (id, rfp_number, project_id, participant_id, title, description, category, capex_tier, capex_estimate_zar, chain_status, start_at, bid_open_at, bid_close_at, delivery_due_at, sla_deadline_at, escalation_level, created_by, created_at) VALUES
  ('rfp_001', 'RFP-2026-001', 'proj_001', 'ipp@openenergy.co.za', 'EPC for Kathu Solar PV 100MW expansion', 'Lump-sum EPC for 100MW DC capacity expansion. ITC + ITP financing. NERSA grid-connect compliant.', 'epc', 'high', 1850000000, 'draft', '2026-06-15T08:00:00Z', NULL, NULL, '2027-12-31T17:00:00Z', '2026-07-15T08:00:00Z', 0, 'demo_ipp_001', datetime('now')),

  ('rfp_002', 'RFP-2026-002', 'proj_002', 'wind@openenergy.co.za', '138 × 4.5MW turbine supply — Jeffreys Bay 2', 'Turbine OEM supply with 25-year LCOE warranty + capacity factor floor. Local content ≥ 35%.', 'equipment', 'high', 5200000000, 'published', '2026-05-01T08:00:00Z', '2026-05-15T08:00:00Z', NULL, '2028-06-30T17:00:00Z', '2026-05-31T17:00:00Z', 0, 'demo_ipp_002', datetime('now', '-15 days')),

  ('rfp_003', 'RFP-2026-003', 'proj_003', 'ipp@openenergy.co.za', '140MW wind farm BoP — Kangnas', 'Balance-of-plant including substation, collection network, met masts, SCADA.', 'epc', 'high', 850000000, 'bidding', '2026-04-10T08:00:00Z', '2026-04-24T08:00:00Z', '2026-06-23T17:00:00Z', '2027-09-30T17:00:00Z', '2026-06-23T17:00:00Z', 0, 'demo_ipp_001', datetime('now', '-45 days')),

  ('rfp_004', 'RFP-2026-004', 'proj_004', 'ipp@openenergy.co.za', 'Battery storage 200MWh — Solar Capital De Aar', 'Co-located BESS for grid services + arbitrage. 4-hr duration. Augmented over 20yr life.', 'equipment', 'high', 1200000000, 'evaluation', '2026-02-01T08:00:00Z', '2026-02-15T08:00:00Z', '2026-04-15T17:00:00Z', '2027-06-30T17:00:00Z', '2026-05-15T17:00:00Z', 0, 'demo_ipp_001', datetime('now', '-110 days')),

  ('rfp_005', 'RFP-2026-005', 'proj_005', 'wind@openenergy.co.za', 'CSP Power Block — Xina Solar One II', 'Steam turbine + condenser + thermal storage block for 100MW CSP. AdaptaPower licensable design.', 'equipment', 'high', 3100000000, 'shortlisted', '2025-12-01T08:00:00Z', '2025-12-15T08:00:00Z', '2026-02-15T17:00:00Z', '2028-12-31T17:00:00Z', '2026-06-08T17:00:00Z', 0, 'demo_ipp_002', datetime('now', '-180 days')),

  ('rfp_006', 'RFP-2026-006', 'proj_006', 'ipp@openenergy.co.za', 'EPC — Loeriesfontein 140MW expansion phase 2', 'Lump-sum EPC for 70MW additional wind capacity. SO grid-connect studies included.', 'epc', 'high', 1450000000, 'awarded', '2025-11-01T08:00:00Z', '2025-11-15T08:00:00Z', '2026-01-15T17:00:00Z', '2027-12-31T17:00:00Z', '2026-08-01T17:00:00Z', 0, 'demo_ipp_001', datetime('now', '-210 days'));

UPDATE oe_procurement_rfps SET award_to = 'consortium_GroupFive_Vestas', award_name = 'Group Five / Vestas Consortium', award_amount_zar = 1380000000, awarded_at = datetime('now', '-5 days') WHERE id = 'rfp_006';

-- ─── MEDIUM tier (R50m – R500m, major EPC/OEM) ───────────────────────────
INSERT OR IGNORE INTO oe_procurement_rfps (id, rfp_number, project_id, participant_id, title, description, category, capex_tier, capex_estimate_zar, chain_status, start_at, bid_open_at, bid_close_at, delivery_due_at, sla_deadline_at, escalation_level, created_by, created_at) VALUES
  ('rfp_007', 'RFP-2026-007', 'proj_007', 'ipp@openenergy.co.za', 'O&M services 3-year — Droogfontein Solar', 'Comprehensive O&M including module washing, inverter PM, vegetation, security.', 'services', 'medium', 180000000, 'contracted', '2025-09-01T08:00:00Z', '2025-09-15T08:00:00Z', '2025-10-15T17:00:00Z', '2029-06-30T17:00:00Z', '2026-08-15T17:00:00Z', 0, 'demo_ipp_001', datetime('now', '-260 days'));

UPDATE oe_procurement_rfps SET award_to = 'siemens_om', award_name = 'Siemens O&M Services SA', award_amount_zar = 168000000, awarded_at = datetime('now', '-90 days'), contracted_at = datetime('now', '-60 days') WHERE id = 'rfp_007';

INSERT OR IGNORE INTO oe_procurement_rfps (id, rfp_number, project_id, participant_id, title, description, category, capex_tier, capex_estimate_zar, chain_status, start_at, bid_open_at, bid_close_at, delivery_due_at, sla_deadline_at, escalation_level, created_by, created_at) VALUES
  ('rfp_008', 'RFP-2026-008', 'proj_008', 'wind@openenergy.co.za', 'String inverters refresh — Perdekraal', '24 × 1.5MW string inverters + DC combiner upgrade for performance ratio recovery.', 'equipment', 'medium', 95000000, 'delivered', '2025-06-01T08:00:00Z', '2025-06-15T08:00:00Z', '2025-07-15T17:00:00Z', '2026-03-31T17:00:00Z', NULL, 0, 'demo_ipp_002', datetime('now', '-330 days'));

UPDATE oe_procurement_rfps SET award_to = 'huawei_sa', award_name = 'Huawei SA — Solar Inverter Division', award_amount_zar = 87000000, awarded_at = datetime('now', '-280 days'), contracted_at = datetime('now', '-240 days'), delivered_at = datetime('now', '-40 days') WHERE id = 'rfp_008';

INSERT OR IGNORE INTO oe_procurement_rfps (id, rfp_number, project_id, participant_id, title, description, category, capex_tier, capex_estimate_zar, chain_status, start_at, bid_open_at, bid_close_at, delivery_due_at, sla_deadline_at, escalation_level, created_by, created_at) VALUES
  ('rfp_009', 'RFP-2026-009', 'proj_009', 'ipp@openenergy.co.za', 'Grid-tie transformer — Red Cap Kouga', '132/22kV grid-tie transformer with on-load tap changer + spare bank.', 'equipment', 'medium', 220000000, 'bid_closed', '2026-03-01T08:00:00Z', '2026-03-15T08:00:00Z', '2026-05-14T17:00:00Z', '2027-04-30T17:00:00Z', '2026-05-21T17:00:00Z', 0, 'demo_ipp_001', datetime('now', '-85 days'));

-- ─── LOW tier (< R50m, services / spares) ────────────────────────────────
INSERT OR IGNORE INTO oe_procurement_rfps (id, rfp_number, project_id, participant_id, title, description, category, capex_tier, capex_estimate_zar, chain_status, start_at, bid_open_at, bid_close_at, delivery_due_at, sla_deadline_at, escalation_level, created_by, created_at) VALUES
  ('rfp_010', 'RFP-2026-010', 'proj_001', 'ipp@openenergy.co.za', 'Module-cleaning service — Kathu', '12-month module-cleaning contract incl. waterless robotic crawlers for arid zones.', 'services', 'low', 8500000, 'rejected', '2026-04-01T08:00:00Z', '2026-04-08T08:00:00Z', '2026-04-22T17:00:00Z', '2027-03-31T17:00:00Z', NULL, 0, 'demo_ipp_001', datetime('now', '-55 days'));

UPDATE oe_procurement_rfps SET rejection_reason = 'No bidder met the BBBEE Level 4 + local-content thresholds; re-issue with relaxed local-content for next round.' WHERE id = 'rfp_010';

INSERT OR IGNORE INTO oe_procurement_rfps (id, rfp_number, project_id, participant_id, title, description, category, capex_tier, capex_estimate_zar, chain_status, start_at, bid_open_at, bid_close_at, delivery_due_at, sla_deadline_at, escalation_level, last_sla_breach_at, created_by, created_at) VALUES
  ('rfp_011', 'RFP-2026-011', 'proj_005', 'wind@openenergy.co.za', 'Bird-strike monitoring — Dorper Wind', 'Annual avifauna monitoring per IFC PS6 + REIPPPP environmental compliance.', 'services', 'low', 4200000, 'disputed', '2026-03-15T08:00:00Z', '2026-03-22T08:00:00Z', '2026-04-05T17:00:00Z', '2027-04-30T17:00:00Z', '2026-05-30T17:00:00Z', 1, datetime('now', '-2 days'), 'demo_ipp_002', datetime('now', '-70 days'));

UPDATE oe_procurement_rfps SET award_to = 'birdlife_sa', award_name = 'BirdLife South Africa — Energy Programme', award_amount_zar = 3950000, awarded_at = datetime('now', '-20 days'), dispute_notes = 'Methodology dispute filed by losing bidder Endangered Wildlife Trust; under independent arbitration.' WHERE id = 'rfp_011';

INSERT OR IGNORE INTO oe_procurement_rfps (id, rfp_number, project_id, participant_id, title, description, category, capex_tier, capex_estimate_zar, chain_status, start_at, bid_open_at, bid_close_at, delivery_due_at, sla_deadline_at, escalation_level, created_by, created_at) VALUES
  ('rfp_012', 'RFP-2026-012', 'proj_004', 'ipp@openenergy.co.za', 'Spare inverter stock build — De Aar', 'Strategic spare-parts top-up: 4 × 1.5MW inverters, fuse banks, contactors.', 'spares', 'low', 18000000, 'cancelled', '2026-02-01T08:00:00Z', '2026-02-08T08:00:00Z', '2026-02-22T17:00:00Z', '2026-09-30T17:00:00Z', NULL, 0, 'demo_ipp_001', datetime('now', '-130 days'));

-- ─── Audit events: minimum one per row, more for milestone-rich rows ─────
INSERT OR IGNORE INTO oe_procurement_chain_events (id, rfp_id, event_type, from_status, to_status, actor_id, notes, payload, created_at) VALUES
  -- rfp_001 draft (none yet)

  -- rfp_002 published
  ('proc_evt_001', 'rfp_002', 'published', 'draft', 'published', 'demo_ipp_002', 'RFP published to qualified vendor list (18 OEMs).', '{}', datetime('now', '-15 days')),

  -- rfp_003 bidding
  ('proc_evt_002', 'rfp_003', 'published', 'draft', 'published', 'demo_ipp_001', 'BoP RFP issued.', '{}', datetime('now', '-45 days')),
  ('proc_evt_003', 'rfp_003', 'bid_opened', 'published', 'bidding', 'demo_ipp_001', 'Bid window opened — 11 expressions of interest.', '{}', datetime('now', '-31 days')),

  -- rfp_004 evaluation
  ('proc_evt_004', 'rfp_004', 'published', 'draft', 'published', 'demo_ipp_001', NULL, '{}', datetime('now', '-110 days')),
  ('proc_evt_005', 'rfp_004', 'bid_opened', 'published', 'bidding', 'demo_ipp_001', NULL, '{}', datetime('now', '-95 days')),
  ('proc_evt_006', 'rfp_004', 'bid_closed', 'bidding', 'bid_closed', 'demo_ipp_001', '7 conforming bids received.', '{}', datetime('now', '-45 days')),
  ('proc_evt_007', 'rfp_004', 'evaluation_started', 'bid_closed', 'evaluation', 'demo_ipp_001', 'Technical scoring underway.', '{}', datetime('now', '-42 days')),

  -- rfp_005 shortlisted
  ('proc_evt_008', 'rfp_005', 'published', 'draft', 'published', 'demo_ipp_002', NULL, '{}', datetime('now', '-180 days')),
  ('proc_evt_009', 'rfp_005', 'bid_opened', 'published', 'bidding', 'demo_ipp_002', NULL, '{}', datetime('now', '-165 days')),
  ('proc_evt_010', 'rfp_005', 'bid_closed', 'bidding', 'bid_closed', 'demo_ipp_002', NULL, '{}', datetime('now', '-105 days')),
  ('proc_evt_011', 'rfp_005', 'evaluation_started', 'bid_closed', 'evaluation', 'demo_ipp_002', NULL, '{}', datetime('now', '-100 days')),
  ('proc_evt_012', 'rfp_005', 'shortlisted', 'evaluation', 'shortlisted', 'demo_ipp_002', 'Two consortia shortlisted — Mitsubishi + GE Vernova.', '{}', datetime('now', '-25 days')),

  -- rfp_006 awarded (high-tier — crosses to regulator)
  ('proc_evt_013', 'rfp_006', 'published', 'draft', 'published', 'demo_ipp_001', NULL, '{}', datetime('now', '-210 days')),
  ('proc_evt_014', 'rfp_006', 'bid_opened', 'published', 'bidding', 'demo_ipp_001', NULL, '{}', datetime('now', '-195 days')),
  ('proc_evt_015', 'rfp_006', 'bid_closed', 'bidding', 'bid_closed', 'demo_ipp_001', NULL, '{}', datetime('now', '-135 days')),
  ('proc_evt_016', 'rfp_006', 'evaluation_started', 'bid_closed', 'evaluation', 'demo_ipp_001', NULL, '{}', datetime('now', '-130 days')),
  ('proc_evt_017', 'rfp_006', 'shortlisted', 'evaluation', 'shortlisted', 'demo_ipp_001', NULL, '{}', datetime('now', '-100 days')),
  ('proc_evt_018', 'rfp_006', 'awarded', 'shortlisted', 'awarded', 'demo_ipp_001', 'Awarded to Group Five / Vestas consortium at R1.38bn (-4.8% vs. estimate).', '{"crosses_to_regulator":true,"vendor":"Group Five / Vestas","amount_zar":1380000000}', datetime('now', '-5 days')),

  -- rfp_007 contracted
  ('proc_evt_019', 'rfp_007', 'published', 'draft', 'published', 'demo_ipp_001', NULL, '{}', datetime('now', '-260 days')),
  ('proc_evt_020', 'rfp_007', 'bid_opened', 'published', 'bidding', 'demo_ipp_001', NULL, '{}', datetime('now', '-245 days')),
  ('proc_evt_021', 'rfp_007', 'bid_closed', 'bidding', 'bid_closed', 'demo_ipp_001', NULL, '{}', datetime('now', '-215 days')),
  ('proc_evt_022', 'rfp_007', 'evaluation_started', 'bid_closed', 'evaluation', 'demo_ipp_001', NULL, '{}', datetime('now', '-210 days')),
  ('proc_evt_023', 'rfp_007', 'shortlisted', 'evaluation', 'shortlisted', 'demo_ipp_001', NULL, '{}', datetime('now', '-180 days')),
  ('proc_evt_024', 'rfp_007', 'awarded', 'shortlisted', 'awarded', 'demo_ipp_001', NULL, '{}', datetime('now', '-90 days')),
  ('proc_evt_025', 'rfp_007', 'contracted', 'awarded', 'contracted', 'demo_ipp_001', 'O&M services agreement executed.', '{}', datetime('now', '-60 days')),

  -- rfp_008 delivered
  ('proc_evt_026', 'rfp_008', 'awarded', 'shortlisted', 'awarded', 'demo_ipp_002', NULL, '{}', datetime('now', '-280 days')),
  ('proc_evt_027', 'rfp_008', 'contracted', 'awarded', 'contracted', 'demo_ipp_002', NULL, '{}', datetime('now', '-240 days')),
  ('proc_evt_028', 'rfp_008', 'delivered', 'contracted', 'delivered', 'demo_ipp_002', 'All 24 inverters commissioned + PR recovered to 84.2%.', '{}', datetime('now', '-40 days')),

  -- rfp_009 bid_closed
  ('proc_evt_029', 'rfp_009', 'published', 'draft', 'published', 'demo_ipp_001', NULL, '{}', datetime('now', '-85 days')),
  ('proc_evt_030', 'rfp_009', 'bid_opened', 'published', 'bidding', 'demo_ipp_001', NULL, '{}', datetime('now', '-75 days')),
  ('proc_evt_031', 'rfp_009', 'bid_closed', 'bidding', 'bid_closed', 'demo_ipp_001', '5 transformer OEMs bid — ABB / Siemens / TBEA / SGB / Hyundai.', '{}', datetime('now', '-13 days')),

  -- rfp_010 rejected
  ('proc_evt_032', 'rfp_010', 'published', 'draft', 'published', 'demo_ipp_001', NULL, '{}', datetime('now', '-55 days')),
  ('proc_evt_033', 'rfp_010', 'bid_opened', 'published', 'bidding', 'demo_ipp_001', NULL, '{}', datetime('now', '-48 days')),
  ('proc_evt_034', 'rfp_010', 'bid_closed', 'bidding', 'bid_closed', 'demo_ipp_001', NULL, '{}', datetime('now', '-34 days')),
  ('proc_evt_035', 'rfp_010', 'evaluation_started', 'bid_closed', 'evaluation', 'demo_ipp_001', NULL, '{}', datetime('now', '-30 days')),
  ('proc_evt_036', 'rfp_010', 'rejected', 'evaluation', 'rejected', 'demo_ipp_001', 'No bidder met BBBEE Level 4 + local-content thresholds.', '{}', datetime('now', '-20 days')),

  -- rfp_011 disputed
  ('proc_evt_037', 'rfp_011', 'published', 'draft', 'published', 'demo_ipp_002', NULL, '{}', datetime('now', '-70 days')),
  ('proc_evt_038', 'rfp_011', 'bid_opened', 'published', 'bidding', 'demo_ipp_002', NULL, '{}', datetime('now', '-63 days')),
  ('proc_evt_039', 'rfp_011', 'bid_closed', 'bidding', 'bid_closed', 'demo_ipp_002', NULL, '{}', datetime('now', '-49 days')),
  ('proc_evt_040', 'rfp_011', 'evaluation_started', 'bid_closed', 'evaluation', 'demo_ipp_002', NULL, '{}', datetime('now', '-45 days')),
  ('proc_evt_041', 'rfp_011', 'shortlisted', 'evaluation', 'shortlisted', 'demo_ipp_002', NULL, '{}', datetime('now', '-30 days')),
  ('proc_evt_042', 'rfp_011', 'awarded', 'shortlisted', 'awarded', 'demo_ipp_002', NULL, '{}', datetime('now', '-20 days')),
  ('proc_evt_043', 'rfp_011', 'disputed', 'awarded', 'disputed', 'demo_ipp_002', 'EWT filed methodology dispute — under independent arbitration.', '{}', datetime('now', '-8 days')),
  ('proc_evt_044', 'rfp_011', 'sla_breached', 'disputed', 'disputed', 'system', 'Breached 4320m SLA for dispute resolution.', '{"crosses_to_regulator":false}', datetime('now', '-2 days')),

  -- rfp_012 cancelled
  ('proc_evt_045', 'rfp_012', 'published', 'draft', 'published', 'demo_ipp_001', NULL, '{}', datetime('now', '-130 days')),
  ('proc_evt_046', 'rfp_012', 'bid_opened', 'published', 'bidding', 'demo_ipp_001', NULL, '{}', datetime('now', '-123 days')),
  ('proc_evt_047', 'rfp_012', 'cancelled', 'bidding', 'cancelled', 'demo_ipp_001', 'Cancelled — strategic-stock build deferred to FY27 capex cycle.', '{}', datetime('now', '-95 days'));
