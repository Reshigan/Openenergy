-- ════════════════════════════════════════════════════════════════════════
-- 077 · Drop ASOBA Cloud (Ona) integration tables
--
-- The Asoba HTTP client (src/utils/asoba.ts) and the /api/ona/asoba/* proxy
-- routes were removed in PR1 / WP-A. The two cache tables they populated
-- (ona_asoba_telemetry, ona_asoba_alerts) are now dead and dropped here.
--
-- ona_faults.source remains in the schema for forward-compat with the new
-- deterministic fault engine (which writes source = 'detector_<name>') and
-- with manually-logged faults (source = 'operator'). Only the literal value
-- 'asoba' is no longer produced.
--
-- Idempotent: uses DROP TABLE IF EXISTS so safe to apply on environments
-- where migration 033 was never run.
-- ════════════════════════════════════════════════════════════════════════

DROP TABLE IF EXISTS ona_asoba_telemetry;
DROP TABLE IF EXISTS ona_asoba_alerts;
