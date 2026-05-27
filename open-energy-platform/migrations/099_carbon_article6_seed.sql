-- 099_carbon_article6_seed.sql
-- Wave 4 demo seed for Article 6 ITMO corresponding-adjustment ledger.
--
-- Seeds:
--   • 8 country routing rules — South Africa, UK, US, Switzerland, Sweden,
--     Singapore, Brazil, Kenya (a mix of 6.2 / 6.4 / paris_only / non_party).
--   • 4 demo Article 6 adjustments spanning the lifecycle (unfccc_ledger,
--     dffe_cleared, dffe_pending, blocked) so the UI tab and the Cover-1
--     style verdict surface have something to render in dev/prod.
--   • Matching serial-registry URI anchors.
--
-- All INSERTs use OR IGNORE so a re-apply on a fresh DB is idempotent.

-- ── Country routing ───────────────────────────────────────────────────────
INSERT OR IGNORE INTO oe_country_routing
  (country_iso, country_name, ndc_authority, ndc_authority_email,
   article_6_track, registry_url_pattern, active, notes, updated_at)
VALUES
  ('ZAF', 'South Africa',
   'Department of Forestry, Fisheries and the Environment',
   NULL,
   '6.2',
   'https://carbonregistry.environment.gov.za/project/{proj}/vintage/{year}/serial/{serial}',
   1, 'Host party of last resort for SA-origin reductions. ITMO transfers must clear DFFE.',
   datetime('now')),
  ('GBR', 'United Kingdom',
   'UK Department for Energy Security and Net Zero',
   NULL,
   '6.4',
   'https://uk-ets.gov.uk/registry/{registry}/{serial}',
   1, 'Recognized 6.4 buyer; CDM transition active.', datetime('now')),
  ('CHE', 'Switzerland',
   'Federal Office for the Environment (FOEN)',
   NULL,
   '6.2',
   'https://klik.ch/itmo/{proj}/{year}/{serial}',
   1, 'Klik Foundation runs the largest 6.2 buyer programme; SA is a partner.',
   datetime('now')),
  ('SWE', 'Sweden',
   'Swedish Energy Agency',
   NULL,
   '6.2',
   'https://energimyndigheten.se/itmo/{registry}/{serial}',
   1, 'Active 6.2 buyer.', datetime('now')),
  ('SGP', 'Singapore',
   'National Climate Change Secretariat',
   NULL,
   '6.4',
   'https://nccs.gov.sg/itmo/{proj}/{year}/{serial}',
   1, 'Carbon tax offset programme — eligible 6.4 supply only.', datetime('now')),
  ('USA', 'United States',
   'US Department of State / EPA',
   NULL,
   'paris_only',
   NULL,
   1, 'No operational Article 6 mechanism for ITMO purchase.', datetime('now')),
  ('BRA', 'Brazil',
   'Ministry of Environment and Climate Change',
   NULL,
   '6.4',
   'https://gov.br/clima/registry/{registry}/{serial}',
   1, 'Large host party; 6.4 mechanism active.', datetime('now')),
  ('KEN', 'Kenya',
   'Climate Change Directorate',
   NULL,
   '6.2',
   'https://environment.go.ke/itmo/{proj}/{serial}',
   1, '6.2 partner with SA on cross-SACU reductions.', datetime('now'));

-- ── Demo Article 6 adjustments ────────────────────────────────────────────
-- Pick a real retirement_id + certificate_id if the carbon retirement seed
-- has populated rows; otherwise these are stable synthetic IDs.

-- A1: ZAF → CHE — fully cleared to UNFCCC ledger (the "happy path" exemplar).
INSERT OR IGNORE INTO oe_article6_adjustments
  (id, retirement_id, certificate_id,
   host_country_iso, beneficiary_country_iso,
   tco2e, vintage_year, registry, serial_range, registry_uri,
   article_6_track, ca_status,
   dffe_submitted_at, dffe_clearance_ref, dffe_clearance_at,
   unfccc_ledger_ref, unfccc_posted_at,
   created_by, created_at, updated_at)
VALUES
  ('a6_demo_zaf_che_001',
   'ret_demo_001', 'cert_demo_001',
   'ZAF', 'CHE',
   25000, 2024, 'verra', 'VCS-PRJ-001-2024-1000-1999',
   'https://carbonregistry.environment.gov.za/project/PRJ-ZAF-001/vintage/2024/serial/VCS-PRJ-001-2024-1000-1999',
   '6.2', 'unfccc_ledger',
   datetime('now','-30 days'), 'DFFE-2026-A6-0142', datetime('now','-20 days'),
   'UNFCCC-CR-2026-3471', datetime('now','-15 days'),
   'demo_carbon_001', datetime('now','-35 days'), datetime('now','-15 days'));

-- A2: ZAF → SWE — DFFE cleared, awaiting UNFCCC posting.
INSERT OR IGNORE INTO oe_article6_adjustments
  (id, retirement_id, certificate_id,
   host_country_iso, beneficiary_country_iso,
   tco2e, vintage_year, registry, serial_range, registry_uri,
   article_6_track, ca_status,
   dffe_submitted_at, dffe_clearance_ref, dffe_clearance_at,
   created_by, created_at, updated_at)
VALUES
  ('a6_demo_zaf_swe_001',
   'ret_demo_002', 'cert_demo_002',
   'ZAF', 'SWE',
   12500, 2024, 'gold_standard', 'GS-PRJ-027-2024-500-1499',
   'https://carbonregistry.environment.gov.za/project/PRJ-ZAF-027/vintage/2024/serial/GS-PRJ-027-2024-500-1499',
   '6.2', 'dffe_cleared',
   datetime('now','-12 days'), 'DFFE-2026-A6-0218', datetime('now','-3 days'),
   'demo_carbon_001', datetime('now','-15 days'), datetime('now','-3 days'));

-- A3: ZAF → SGP — submitted, awaiting DFFE clearance.
INSERT OR IGNORE INTO oe_article6_adjustments
  (id, retirement_id, certificate_id,
   host_country_iso, beneficiary_country_iso,
   tco2e, vintage_year, registry, serial_range, registry_uri,
   article_6_track, ca_status,
   dffe_submitted_at,
   created_by, created_at, updated_at)
VALUES
  ('a6_demo_zaf_sgp_001',
   'ret_demo_003', 'cert_demo_003',
   'ZAF', 'SGP',
   8000, 2025, 'verra', 'VCS-PRJ-044-2025-2000-2999',
   'https://carbonregistry.environment.gov.za/project/PRJ-ZAF-044/vintage/2025/serial/VCS-PRJ-044-2025-2000-2999',
   '6.4', 'dffe_pending',
   datetime('now','-4 days'),
   'demo_carbon_001', datetime('now','-6 days'), datetime('now','-4 days'));

-- A4: ZAF → USA — blocked because USA is paris_only (no CA mechanism).
INSERT OR IGNORE INTO oe_article6_adjustments
  (id, retirement_id, certificate_id,
   host_country_iso, beneficiary_country_iso,
   tco2e, vintage_year, registry, serial_range, registry_uri,
   article_6_track, ca_status, blocked_reason,
   created_by, created_at, updated_at)
VALUES
  ('a6_demo_zaf_usa_001',
   'ret_demo_004', 'cert_demo_004',
   'ZAF', 'USA',
   3500, 2024, 'verra', 'VCS-PRJ-009-2024-100-499',
   'https://carbonregistry.environment.gov.za/project/PRJ-ZAF-009/vintage/2024/serial/VCS-PRJ-009-2024-100-499',
   'paris_only', 'blocked',
   'Beneficiary country (USA) has no operational Article 6 mechanism; corresponding adjustment cannot be recorded. Hold until buyer relocates retirement.',
   'demo_carbon_001', datetime('now','-9 days'), datetime('now','-7 days'));

-- ── Serial registry URI anchors ──────────────────────────────────────────
INSERT OR IGNORE INTO oe_serial_registry_uri
  (id, certificate_id, retirement_id, registry, serial_range, registry_uri,
   resolved_at, resolved_status, resolved_sha256, created_at)
VALUES
  ('uri_demo_001', 'cert_demo_001', 'ret_demo_001', 'verra', 'VCS-PRJ-001-2024-1000-1999',
   'https://carbonregistry.environment.gov.za/project/PRJ-ZAF-001/vintage/2024/serial/VCS-PRJ-001-2024-1000-1999',
   datetime('now','-14 days'), 200,
   'b3bee5d2b18f7a1c4f4d0f5e5b2f9c8a7d6e5f4c3b2a1908f7e6d5c4b3a29180',
   datetime('now','-35 days')),
  ('uri_demo_002', 'cert_demo_002', 'ret_demo_002', 'gold_standard', 'GS-PRJ-027-2024-500-1499',
   'https://carbonregistry.environment.gov.za/project/PRJ-ZAF-027/vintage/2024/serial/GS-PRJ-027-2024-500-1499',
   datetime('now','-2 days'), 200,
   'c4f7d6e5b4a39281f7e6d5c4b3a29180b3bee5d2b18f7a1c4f4d0f5e5b2f9c8a',
   datetime('now','-15 days')),
  ('uri_demo_003', 'cert_demo_003', 'ret_demo_003', 'verra', 'VCS-PRJ-044-2025-2000-2999',
   'https://carbonregistry.environment.gov.za/project/PRJ-ZAF-044/vintage/2025/serial/VCS-PRJ-044-2025-2000-2999',
   NULL, NULL, NULL,
   datetime('now','-6 days')),
  ('uri_demo_004', 'cert_demo_004', 'ret_demo_004', 'verra', 'VCS-PRJ-009-2024-100-499',
   'https://carbonregistry.environment.gov.za/project/PRJ-ZAF-009/vintage/2024/serial/VCS-PRJ-009-2024-100-499',
   NULL, NULL, NULL,
   datetime('now','-9 days'));
