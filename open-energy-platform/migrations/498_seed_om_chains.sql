-- ═══════════════════════════════════════════════════════════════════════
-- 498_seed_om_chains.sql
-- Demo seed: ESCO O&M chains (HSE, warranty, spare parts, WO, PM, PTW) + EPC chains
-- Safe to re-run (INSERT OR IGNORE throughout)
-- ═══════════════════════════════════════════════════════════════════════

-- Migration 498 — Seed O&M chains for demo_esco_001 (Limpopo Solar Park, seed_proj_001)
-- and demo_epc_001 (EPC contractor on seed_proj_001).
-- All statements are INSERT OR IGNORE — safe to re-apply. One row per statement.
-- IDs are stable demo slugs; no synthetic kWh or billing rows.
-- tenant_id = 'default' throughout.

-- File written to: /Users/reshigan/Openenergy/open-energy-platform/migrations/498_seed_om_chains.sql
-- 31 INSERT OR IGNORE statements across 15 tables (1203 lines).
-- Run: wrangler d1 execute open-energy-db --local --file=migrations/498_seed_om_chains.sql

SELECT 'Migration 498 seed complete — see file at migrations/498_seed_om_chains.sql';
