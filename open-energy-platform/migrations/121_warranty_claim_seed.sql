-- ═══════════════════════════════════════════════════════════════════════════
-- Wave 15 — OEM warranty / RMA claim chain seed (demo data).
--
-- 9 demo claims spanning every state + every severity combination:
--   1. safety opened (within triage SLA)
--   2. safety opened (triage breached, escalated path)
--   3. performance triaged (submit pending)
--   4. performance submitted (awaiting OEM ack, within SLA)
--   5. cosmetic acknowledged (under review, within 30d)
--   6. performance under_review (approve SLA armed)
--   7. safety denied → disputed (regulator inbox crossing)
--   8. performance approved → fulfilled (awaiting close)
--   9. cosmetic closed (clean cycle)
--
-- INSERT OR IGNORE keeps the seed idempotent.
-- ═══════════════════════════════════════════════════════════════════════════

INSERT OR IGNORE INTO oe_warranty_claims (
  id, claim_number, tenant_id, asset_id, asset_label, oem_id, oem_name,
  site_id, reported_by, subject, description, severity, fault_code,
  failure_mode, warranty_ref, rma_number, chain_status,
  triaged_at, submitted_at, acknowledged_at, review_started_at,
  approved_at, denied_at, disputed_at, fulfilled_at, closed_at,
  triaged_by, submitted_by, approved_by, denied_by, closed_by,
  next_sla_due_at, next_sla_window, last_sla_breach_at, sla_breach_count,
  resolution, denial_reason, dispute_reason, recovery_zar,
  created_at, updated_at
) VALUES
  -- 1. safety opened within triage SLA (created 1h ago, triage = 4h)
  ('warr_clm_001', 'WC-2026-001', 'tenant_ipp_001', 'demo_dev_inv_001',
   'Sungrow SG250HX inverter SN SGN-1234', 'oem_sungrow', 'Sungrow Power',
   'demo_site_001', 'demo_ipp_001',
   'Inverter DC arc fault — site shutdown',
   'High DC arc fault detected; auto-isolate engaged, site offline pending OEM review.',
   'safety', 'ARC-FAULT-DC1', 'IGBT short to chassis', 'WARR-SUNGROW-2025-A',
   NULL, 'opened',
   NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
   NULL, NULL, NULL, NULL, NULL,
   datetime('now','+3 hours'), 'triage', NULL, 0,
   NULL, NULL, NULL, NULL,
   datetime('now','-1 hour'), datetime('now','-1 hour')),

  -- 2. safety opened with triage breached (6h ago, triage = 4h, 1 breach)
  ('warr_clm_002', 'WC-2026-002', 'tenant_ipp_002', 'demo_dev_bess_001',
   'BYD MC Cube BESS rack SN BYD-77', 'oem_byd', 'BYD Energy',
   'demo_site_004', 'demo_ipp_002',
   'BESS rack thermal runaway warning',
   'Module 3 of rack 2 reading 78°C, suppression deployed, isolating affected strings.',
   'safety', 'BMS-THERMAL-78', 'Thermal runaway precursor', 'WARR-BYD-2024-Q3',
   NULL, 'opened',
   NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
   NULL, NULL, NULL, NULL, NULL,
   datetime('now','-2 hours'), 'triage', datetime('now','-1 hour'), 1,
   NULL, NULL, NULL, NULL,
   datetime('now','-6 hours'), datetime('now','-1 hour')),

  -- 3. performance triaged (triaged 4h ago, submit SLA = 3d)
  ('warr_clm_003', 'WC-2026-003', 'tenant_ipp_001', 'demo_dev_inv_002',
   'Huawei SUN2000-100KTL inverter SN HUA-501', 'oem_huawei', 'Huawei Tech',
   'demo_site_001', 'demo_ipp_001',
   'String 4 efficiency 12% below spec',
   'String MPPT-4 yielding 12% below nameplate for 7 consecutive sunny days.',
   'performance', 'STRING-DERATE-12', 'MPPT controller degradation', 'WARR-HUAWEI-2025',
   NULL, 'triaged',
   datetime('now','-4 hours'), NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
   'demo_om_lead_001', NULL, NULL, NULL, NULL,
   datetime('now','+68 hours'), 'submit', NULL, 0,
   NULL, NULL, NULL, NULL,
   datetime('now','-2 days'), datetime('now','-4 hours')),

  -- 4. performance submitted (submitted 6h ago, ack SLA = 1d)
  ('warr_clm_004', 'WC-2026-004', 'tenant_ipp_003', 'demo_dev_wind_001',
   'Vestas V112 turbine SN VST-9912', 'oem_vestas', 'Vestas Wind',
   'demo_site_003', 'demo_ipp_003',
   'Gearbox vibration spectrum anomaly',
   'Spectrum analysis flagged bearing race signature on HSS, requesting OEM teardown.',
   'performance', 'GEARBOX-VIB-2H', 'HSS bearing race wear', 'WARR-VESTAS-MAJ-2024',
   'RMA-VESTAS-22041', 'submitted',
   datetime('now','-2 days'), datetime('now','-6 hours'), NULL, NULL, NULL, NULL, NULL, NULL, NULL,
   'demo_om_lead_001', 'demo_om_lead_001', NULL, NULL, NULL,
   datetime('now','+18 hours'), 'ack', NULL, 0,
   NULL, NULL, NULL, NULL,
   datetime('now','-3 days'), datetime('now','-6 hours')),

  -- 5. cosmetic acknowledged (acknowledged 2d ago, review SLA = 30d)
  ('warr_clm_005', 'WC-2026-005', 'tenant_ipp_001', 'demo_dev_pnl_001',
   'Trina TSM-485NE17 panel array', 'oem_trina', 'Trina Solar',
   'demo_site_002', 'demo_ipp_001',
   'Panel backsheet yellowing — cosmetic',
   'Visual inspection shows backsheet yellowing on 14 panels in array N3.',
   'cosmetic', 'COSM-BACKSHEET', 'Backsheet UV degradation', 'WARR-TRINA-2024',
   'RMA-TRINA-88102', 'acknowledged',
   datetime('now','-5 days'), datetime('now','-3 days'), datetime('now','-2 days'),
   NULL, NULL, NULL, NULL, NULL, NULL,
   'demo_om_lead_002', 'demo_om_lead_002', NULL, NULL, NULL,
   datetime('now','+28 days'), 'review', NULL, 0,
   NULL, NULL, NULL, NULL,
   datetime('now','-6 days'), datetime('now','-2 days')),

  -- 6. performance under_review (review_started 5d ago, approve SLA = 30d)
  ('warr_clm_006', 'WC-2026-006', 'tenant_ipp_002', 'demo_dev_inv_003',
   'Sungrow SG250HX inverter SN SGN-2207', 'oem_sungrow', 'Sungrow Power',
   'demo_site_004', 'demo_ipp_002',
   'Output power derate at high temp',
   'Inverter derating to 60% at >35°C — outside warranty curve.',
   'performance', 'DERATE-HIGH-T', 'Heat-sink thermal coupling fault', 'WARR-SUNGROW-2025-B',
   'RMA-SUNGROW-44012', 'under_review',
   datetime('now','-12 days'), datetime('now','-10 days'), datetime('now','-9 days'),
   datetime('now','-5 days'), NULL, NULL, NULL, NULL, NULL,
   'demo_om_lead_001', 'demo_om_lead_001', NULL, NULL, NULL,
   datetime('now','+25 days'), 'approve', NULL, 0,
   NULL, NULL, NULL, NULL,
   datetime('now','-14 days'), datetime('now','-5 days')),

  -- 7. safety denied → disputed (regulator inbox crossing)
  ('warr_clm_007', 'WC-2026-007', 'tenant_ipp_003', 'demo_dev_xfmr_001',
   'ABB DTC100 transformer SN ABB-7700', 'oem_abb', 'ABB Group',
   'demo_site_003', 'demo_ipp_003',
   'Transformer winding insulation breakdown',
   'IR test confirms <0.1MΩ winding-earth; OEM denied claim citing siting humidity.',
   'safety', 'INSULATION-FAIL', 'Winding insulation breakdown', 'WARR-ABB-2023-MV',
   'RMA-ABB-11203', 'disputed',
   datetime('now','-20 days'), datetime('now','-18 days'), datetime('now','-17 days'),
   datetime('now','-10 days'), NULL, datetime('now','-3 days'), datetime('now','-1 day'),
   NULL, NULL,
   'demo_om_lead_002', 'demo_om_lead_002', NULL, 'oem_abb', NULL,
   datetime('now','+23 hours'), 'review', NULL, 0,
   NULL, 'Out-of-warranty environmental conditions (humidity > spec)',
   'Field humidity logs show compliance; OEM siting spec was not delivered.', 1850000.0,
   datetime('now','-21 days'), datetime('now','-1 day')),

  -- 8. performance approved → fulfilled (awaiting close)
  ('warr_clm_008', 'WC-2026-008', 'tenant_ipp_001', 'demo_dev_inv_004',
   'Huawei SUN2000-100KTL inverter SN HUA-209', 'oem_huawei', 'Huawei Tech',
   'demo_site_002', 'demo_ipp_001',
   'MPPT-2 channel failure',
   'Channel 2 of inverter MPPT down; OEM replacement unit installed under warranty.',
   'performance', 'MPPT-CH2-FAIL', 'MPPT board electronic failure', 'WARR-HUAWEI-2025',
   'RMA-HUAWEI-90455', 'fulfilled',
   datetime('now','-25 days'), datetime('now','-23 days'), datetime('now','-22 days'),
   datetime('now','-18 days'), datetime('now','-10 days'), NULL, NULL,
   datetime('now','-2 days'), NULL,
   'demo_om_lead_001', 'demo_om_lead_001', 'oem_huawei', NULL, NULL,
   NULL, NULL, NULL, 0,
   'OEM-supplied replacement MPPT board commissioned. Recovery booked.',
   NULL, NULL, 285000.0,
   datetime('now','-26 days'), datetime('now','-2 days')),

  -- 9. cosmetic closed (clean cycle)
  ('warr_clm_009', 'WC-2026-009', 'tenant_ipp_002', 'demo_dev_pnl_002',
   'JinkoSolar Tiger Neo panel array', 'oem_jinko', 'Jinko Solar',
   'demo_site_004', 'demo_ipp_002',
   'Panel anti-reflective coating wear',
   'Anti-reflective coating wear on 4 panels; OEM agreed to replace under warranty.',
   'cosmetic', 'AR-COAT-WEAR', 'Coating delamination', 'WARR-JINKO-2024',
   'RMA-JINKO-22019', 'closed',
   datetime('now','-90 days'), datetime('now','-87 days'), datetime('now','-85 days'),
   datetime('now','-80 days'), datetime('now','-30 days'), NULL, NULL,
   datetime('now','-15 days'), datetime('now','-5 days'),
   'demo_om_lead_002', 'demo_om_lead_002', 'oem_jinko', NULL, 'demo_om_lead_002',
   NULL, NULL, NULL, 0,
   'Panels replaced and commissioned. Warranty claim cycle complete.',
   NULL, NULL, 38500.0,
   datetime('now','-92 days'), datetime('now','-5 days'));

-- Seed audit events for each claim's lifecycle (subset — opening + key transitions).
INSERT OR IGNORE INTO oe_warranty_claim_events (
  id, claim_id, event_type, from_status, to_status, sla_window, actor_id, notes, created_at
) VALUES
  ('wcev_001_1', 'warr_clm_001', 'opened', NULL, 'opened', 'triage', 'demo_ipp_001',
   'Site auto-isolate triggered; claim opened.', datetime('now','-1 hour')),

  ('wcev_002_1', 'warr_clm_002', 'opened', NULL, 'opened', 'triage', 'demo_ipp_002',
   'Safety alarm raised; suppression deployed.', datetime('now','-6 hours')),
  ('wcev_002_2', 'warr_clm_002', 'sla_breached', 'opened', 'opened', 'triage', 'system',
   'Triage SLA breached; pending response.', datetime('now','-1 hour')),

  ('wcev_003_1', 'warr_clm_003', 'opened', NULL, 'opened', 'triage', 'demo_ipp_001',
   'Performance drop reported.', datetime('now','-2 days')),
  ('wcev_003_2', 'warr_clm_003', 'triaged', 'opened', 'triaged', 'submit', 'demo_om_lead_001',
   'Severity confirmed performance; pending submission to OEM.', datetime('now','-4 hours')),

  ('wcev_004_1', 'warr_clm_004', 'opened', NULL, 'opened', 'triage', 'demo_ipp_003',
   'Spectrum anomaly identified.', datetime('now','-3 days')),
  ('wcev_004_2', 'warr_clm_004', 'triaged', 'opened', 'triaged', 'submit', 'demo_om_lead_001',
   'Confirmed bearing race wear; preparing submission.', datetime('now','-2 days')),
  ('wcev_004_3', 'warr_clm_004', 'submitted', 'triaged', 'submitted', 'ack', 'demo_om_lead_001',
   'Submitted to Vestas with RMA RMA-VESTAS-22041.', datetime('now','-6 hours')),

  ('wcev_005_1', 'warr_clm_005', 'opened', NULL, 'opened', 'triage', 'demo_ipp_001',
   'Cosmetic backsheet yellowing flagged.', datetime('now','-6 days')),
  ('wcev_005_2', 'warr_clm_005', 'submitted', 'triaged', 'submitted', 'ack', 'demo_om_lead_002',
   'Submitted to Trina.', datetime('now','-3 days')),
  ('wcev_005_3', 'warr_clm_005', 'acknowledged', 'submitted', 'acknowledged', 'review', 'oem_trina',
   'Trina acknowledged claim.', datetime('now','-2 days')),

  ('wcev_006_1', 'warr_clm_006', 'opened', NULL, 'opened', 'triage', 'demo_ipp_002',
   'High-temp derate fault reported.', datetime('now','-14 days')),
  ('wcev_006_2', 'warr_clm_006', 'acknowledged', 'submitted', 'acknowledged', 'review', 'oem_sungrow',
   'Sungrow acknowledged.', datetime('now','-9 days')),
  ('wcev_006_3', 'warr_clm_006', 'review_started', 'acknowledged', 'under_review', 'approve', 'oem_sungrow',
   'Engineering review initiated.', datetime('now','-5 days')),

  ('wcev_007_1', 'warr_clm_007', 'opened', NULL, 'opened', 'triage', 'demo_ipp_003',
   'Transformer insulation failure.', datetime('now','-21 days')),
  ('wcev_007_2', 'warr_clm_007', 'submitted', 'triaged', 'submitted', 'ack', 'demo_om_lead_002',
   'Submitted to ABB.', datetime('now','-18 days')),
  ('wcev_007_3', 'warr_clm_007', 'denied', 'under_review', 'denied', NULL, 'oem_abb',
   'ABB denied citing humidity overrange.', datetime('now','-3 days')),
  ('wcev_007_4', 'warr_clm_007', 'disputed', 'denied', 'disputed', 'review', 'demo_om_lead_002',
   'Dispute filed: field humidity logs prove spec compliance.', datetime('now','-1 day')),

  ('wcev_008_1', 'warr_clm_008', 'opened', NULL, 'opened', 'triage', 'demo_ipp_001',
   'MPPT-2 channel failure.', datetime('now','-26 days')),
  ('wcev_008_2', 'warr_clm_008', 'approved', 'under_review', 'approved', 'fulfill', 'oem_huawei',
   'Huawei approved replacement.', datetime('now','-10 days')),
  ('wcev_008_3', 'warr_clm_008', 'fulfilled', 'approved', 'fulfilled', NULL, 'demo_om_lead_001',
   'Replacement MPPT installed and commissioned.', datetime('now','-2 days')),

  ('wcev_009_1', 'warr_clm_009', 'opened', NULL, 'opened', 'triage', 'demo_ipp_002',
   'Panel coating delamination.', datetime('now','-92 days')),
  ('wcev_009_2', 'warr_clm_009', 'closed', 'fulfilled', 'closed', NULL, 'demo_om_lead_002',
   'Cycle complete; panels replaced and warranty closed.', datetime('now','-5 days'));
