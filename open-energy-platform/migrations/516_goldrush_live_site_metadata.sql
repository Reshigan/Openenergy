-- Migration 516: Backfill Goldrush live om_sites metadata
--
-- The 10 live Goldrush C&I sites were auto-created by the SolaX backfill path
-- (esums-accruals.ts), whose om_sites upsert only writes id/name/participant/
-- technology/status — leaving capacity, province, geo and commissioning null.
-- Migration 438 carries those values for the demo fleet but targets demo IDs, so
-- live never received them.
--
-- This fills the live rows from REAL sources only:
--   capacity_kwp / capacity_mw   ← SUM(om_devices.rated_kw)  (real SolaX inverter rating)
--   ppa_tariff_zar_mwh           ← solax_stations.tariff_rate_zar_per_kwh * 1000 (real per-site PPA tariff)
--   province / latitude / longitude / commissioning_date ← real-world site locations (from migration 438)
--
-- Matched by name (LIKE absorbs trailing whitespace in the live names). Idempotent:
-- re-running re-sets the same values. Scoped to the 10 Goldrush sites only.

UPDATE om_sites SET
  capacity_kwp       = COALESCE((SELECT SUM(rated_kw) FROM om_devices WHERE site_id = om_sites.id), capacity_kwp),
  capacity_mw        = COALESCE((SELECT SUM(rated_kw) FROM om_devices WHERE site_id = om_sites.id) / 1000.0, capacity_mw),
  ppa_tariff_zar_mwh = COALESCE((SELECT tariff_rate_zar_per_kwh * 1000 FROM solax_stations WHERE site_id = om_sites.id), ppa_tariff_zar_mwh),
  province = 'KwaZulu-Natal', latitude = -29.8874, longitude = 30.9786, commissioning_date = '2024-03-01',
  updated_at = datetime('now')
WHERE name LIKE 'Goldrush Malvern%';

UPDATE om_sites SET
  capacity_kwp       = COALESCE((SELECT SUM(rated_kw) FROM om_devices WHERE site_id = om_sites.id), capacity_kwp),
  capacity_mw        = COALESCE((SELECT SUM(rated_kw) FROM om_devices WHERE site_id = om_sites.id) / 1000.0, capacity_mw),
  ppa_tariff_zar_mwh = COALESCE((SELECT tariff_rate_zar_per_kwh * 1000 FROM solax_stations WHERE site_id = om_sites.id), ppa_tariff_zar_mwh),
  province = 'Limpopo', latitude = -24.8834, longitude = 28.3120, commissioning_date = '2024-03-01',
  updated_at = datetime('now')
WHERE name LIKE 'Goldrush Bela Bela%';

UPDATE om_sites SET
  capacity_kwp       = COALESCE((SELECT SUM(rated_kw) FROM om_devices WHERE site_id = om_sites.id), capacity_kwp),
  capacity_mw        = COALESCE((SELECT SUM(rated_kw) FROM om_devices WHERE site_id = om_sites.id) / 1000.0, capacity_mw),
  ppa_tariff_zar_mwh = COALESCE((SELECT tariff_rate_zar_per_kwh * 1000 FROM solax_stations WHERE site_id = om_sites.id), ppa_tariff_zar_mwh),
  province = 'KwaZulu-Natal', latitude = -29.9095, longitude = 30.9162, commissioning_date = '2024-03-01',
  updated_at = datetime('now')
WHERE name LIKE 'Goldrush Chatsworth Chillers%';

UPDATE om_sites SET
  capacity_kwp       = COALESCE((SELECT SUM(rated_kw) FROM om_devices WHERE site_id = om_sites.id), capacity_kwp),
  capacity_mw        = COALESCE((SELECT SUM(rated_kw) FROM om_devices WHERE site_id = om_sites.id) / 1000.0, capacity_mw),
  ppa_tariff_zar_mwh = COALESCE((SELECT tariff_rate_zar_per_kwh * 1000 FROM solax_stations WHERE site_id = om_sites.id), ppa_tariff_zar_mwh),
  province = 'KwaZulu-Natal', latitude = -29.9078, longitude = 30.9138, commissioning_date = '2024-03-01',
  updated_at = datetime('now')
WHERE name LIKE 'Goldrush Chatsworth%' AND name NOT LIKE '%Chillers%';

UPDATE om_sites SET
  capacity_kwp       = COALESCE((SELECT SUM(rated_kw) FROM om_devices WHERE site_id = om_sites.id), capacity_kwp),
  capacity_mw        = COALESCE((SELECT SUM(rated_kw) FROM om_devices WHERE site_id = om_sites.id) / 1000.0, capacity_mw),
  ppa_tariff_zar_mwh = COALESCE((SELECT tariff_rate_zar_per_kwh * 1000 FROM solax_stations WHERE site_id = om_sites.id), ppa_tariff_zar_mwh),
  province = 'KwaZulu-Natal', latitude = -29.8587, longitude = 31.0218, commissioning_date = '2024-03-01',
  updated_at = datetime('now')
WHERE name LIKE 'Goldrush HQ%';

UPDATE om_sites SET
  capacity_kwp       = COALESCE((SELECT SUM(rated_kw) FROM om_devices WHERE site_id = om_sites.id), capacity_kwp),
  capacity_mw        = COALESCE((SELECT SUM(rated_kw) FROM om_devices WHERE site_id = om_sites.id) / 1000.0, capacity_mw),
  ppa_tariff_zar_mwh = COALESCE((SELECT tariff_rate_zar_per_kwh * 1000 FROM solax_stations WHERE site_id = om_sites.id), ppa_tariff_zar_mwh),
  province = 'KwaZulu-Natal', latitude = -28.5565, longitude = 29.7843, commissioning_date = '2024-03-01',
  updated_at = datetime('now')
WHERE name LIKE 'Goldrush Ladysmith%';

UPDATE om_sites SET
  capacity_kwp       = COALESCE((SELECT SUM(rated_kw) FROM om_devices WHERE site_id = om_sites.id), capacity_kwp),
  capacity_mw        = COALESCE((SELECT SUM(rated_kw) FROM om_devices WHERE site_id = om_sites.id) / 1000.0, capacity_mw),
  ppa_tariff_zar_mwh = COALESCE((SELECT tariff_rate_zar_per_kwh * 1000 FROM solax_stations WHERE site_id = om_sites.id), ppa_tariff_zar_mwh),
  province = 'KwaZulu-Natal', latitude = -29.6006, longitude = 30.3794, commissioning_date = '2024-03-01',
  updated_at = datetime('now')
WHERE name LIKE 'Goldrush Pietermaritzburg%';

UPDATE om_sites SET
  capacity_kwp       = COALESCE((SELECT SUM(rated_kw) FROM om_devices WHERE site_id = om_sites.id), capacity_kwp),
  capacity_mw        = COALESCE((SELECT SUM(rated_kw) FROM om_devices WHERE site_id = om_sites.id) / 1000.0, capacity_mw),
  ppa_tariff_zar_mwh = COALESCE((SELECT tariff_rate_zar_per_kwh * 1000 FROM solax_stations WHERE site_id = om_sites.id), ppa_tariff_zar_mwh),
  province = 'KwaZulu-Natal', latitude = -29.3321, longitude = 31.2887, commissioning_date = '2024-03-01',
  updated_at = datetime('now')
WHERE name LIKE 'Goldrush Stanger%';

UPDATE om_sites SET
  capacity_kwp       = COALESCE((SELECT SUM(rated_kw) FROM om_devices WHERE site_id = om_sites.id), capacity_kwp),
  capacity_mw        = COALESCE((SELECT SUM(rated_kw) FROM om_devices WHERE site_id = om_sites.id) / 1000.0, capacity_mw),
  ppa_tariff_zar_mwh = COALESCE((SELECT tariff_rate_zar_per_kwh * 1000 FROM solax_stations WHERE site_id = om_sites.id), ppa_tariff_zar_mwh),
  province = 'KwaZulu-Natal', latitude = -29.8579, longitude = 31.0173, commissioning_date = '2024-03-01',
  updated_at = datetime('now')
WHERE name LIKE 'Goldrush West Street%';

UPDATE om_sites SET
  capacity_kwp       = COALESCE((SELECT SUM(rated_kw) FROM om_devices WHERE site_id = om_sites.id), capacity_kwp),
  capacity_mw        = COALESCE((SELECT SUM(rated_kw) FROM om_devices WHERE site_id = om_sites.id) / 1000.0, capacity_mw),
  ppa_tariff_zar_mwh = COALESCE((SELECT tariff_rate_zar_per_kwh * 1000 FROM solax_stations WHERE site_id = om_sites.id), ppa_tariff_zar_mwh),
  province = 'Gauteng', latitude = -25.6574, longitude = 28.1101, commissioning_date = '2024-03-01',
  updated_at = datetime('now')
WHERE name LIKE 'Goldrush Wonderpark%';
