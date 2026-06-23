-- Backfill ipp_projects for GoNXT (p_live_gonxt) from its 10 real Goldrush C&I sites.
-- Real metadata only (name/tech/capacity/location/COD/tariff). NO synthetic kWh or
-- billing: ppa_volume_mwh stays NULL. Idempotent: INSERT OR IGNORE + project_id IS NULL.
-- One project per site (each Goldrush location is a distinct private-wire installation),
-- so the IPP Horizon "Projects" tile and /projects surface populate from actuals.

INSERT OR IGNORE INTO ipp_projects (
  id, project_name, developer_id, structure_type, technology, capacity_mw,
  location, coordinates, status, commercial_operation_date, ppa_price_per_mwh,
  renewable_energy_certificate_eligible, created_at, updated_at
)
SELECT
  'proj_' || substr(id, 6),
  trim(name),
  participant_id,
  'private_wire',
  technology,
  capacity_mw,
  province,
  latitude || ',' || longitude,
  'commercial_operations',
  commissioning_date,
  ppa_tariff_zar_mwh,
  1,
  datetime('now'),
  datetime('now')
FROM om_sites
WHERE participant_id = 'p_live_gonxt';

-- Link each site back to its project.
UPDATE om_sites
SET project_id = 'proj_' || substr(id, 6), updated_at = datetime('now')
WHERE participant_id = 'p_live_gonxt' AND project_id IS NULL;

-- Land GoNXT on /horizon (sites now visible) instead of the stuck welcome step.
UPDATE participants
SET onboarding_completed = 1, onboarding_step = 'completed', updated_at = datetime('now')
WHERE id = 'p_live_gonxt';
