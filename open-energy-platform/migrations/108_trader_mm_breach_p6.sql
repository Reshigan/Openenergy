-- ═══════════════════════════════════════════════════════════════════════════
-- Wave 9 — Trader market-maker breach state machine.
--
-- Migration 066 created oe_mm_obligations + oe_mm_performance: registers the
-- MM, records each day's quote-side metrics, and inline-computes a compliant
-- 0/1 flag plus daily penalty. That's enough for L3 audit, but there is no
-- consecutive-miss state machine, no warning/breach/escalated lifecycle, no
-- regulator cascade when a breach lingers.
--
-- This wave layers the breach lifecycle on top:
--   • consecutive miss counter (running) on the obligation
--   • breach status none → warning (1 miss) → breach (3 misses) →
--     escalated (5 misses) on the obligation
--   • compliance_status enum on each performance row (compliant|miss|excused)
--     so an admin can excuse a miss (planned outage etc.) without resetting
--     the running counter incorrectly
--   • daily 05:00 UTC sweep re-scores yesterday's row and advances state
--
-- Per-statement ALTERs so deploy.yml shell execute treats duplicate-column
-- as benign.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE oe_mm_obligations ADD COLUMN consecutive_misses INTEGER DEFAULT 0;
ALTER TABLE oe_mm_obligations ADD COLUMN breach_status TEXT DEFAULT 'none';
ALTER TABLE oe_mm_obligations ADD COLUMN warning_threshold INTEGER DEFAULT 1;
ALTER TABLE oe_mm_obligations ADD COLUMN breach_threshold INTEGER DEFAULT 3;
ALTER TABLE oe_mm_obligations ADD COLUMN escalation_threshold INTEGER DEFAULT 5;
ALTER TABLE oe_mm_obligations ADD COLUMN last_breach_at TEXT;
ALTER TABLE oe_mm_obligations ADD COLUMN last_escalated_at TEXT;
ALTER TABLE oe_mm_obligations ADD COLUMN last_acknowledged_at TEXT;
ALTER TABLE oe_mm_obligations ADD COLUMN last_acknowledged_by TEXT;

ALTER TABLE oe_mm_performance ADD COLUMN compliance_status TEXT;
ALTER TABLE oe_mm_performance ADD COLUMN excused_reason TEXT;
ALTER TABLE oe_mm_performance ADD COLUMN excused_by TEXT;
ALTER TABLE oe_mm_performance ADD COLUMN excused_at TEXT;

CREATE INDEX IF NOT EXISTS idx_oe_mm_obl_breach ON oe_mm_obligations(breach_status);
CREATE INDEX IF NOT EXISTS idx_oe_mm_perf_status ON oe_mm_performance(compliance_status);
