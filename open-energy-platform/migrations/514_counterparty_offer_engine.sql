-- 514 — Cross-role offer / marketplace engine
--
-- When a role creates an entity that needs counterparties (an IPP loads a new
-- project for funding; an offtaker computes baseload), the system surfaces the
-- standing OFFERS that counterparties have published, each with their own unique
-- terms. The role multi-selects one/some/all → that kicks off cross-chain
-- engagement (an oe_offer_engagements handshake → downstream LOI / credit /
-- ERPA chain).
--
-- oe_counterparty_offers   — one row per standing offer. offer_kind discriminates
--   (carbon_rec | carbon_voluntary | carbon_involuntary | funding_debt |
--    funding_mezz | funding_equity | energy_supply). terms_json holds the
--   kind-specific commercial terms. registry_standard is set for carbon offers
--   (gold_standard | verra_vcs | pure_earth | i_rec | article_6_4 | cdm).
-- oe_offer_engagements     — one row per (offer, initiating entity) selection.
--   status: requested → accepted | declined | withdrawn. The accept side
--   deep-links into the relevant existing chain Ledger to start the real work.
--
-- Both tables are FK-free (same convention as oe_role_action_queue): offeror /
-- initiator ids are participant ids but carry no FK so a cascade push never
-- explodes on a missing parent. SQL identifiers here are static; request values
-- only ever bind to ? placeholders.
--
-- Prod note: CREATE TABLE IF NOT EXISTS is idempotent; the role-based seed uses
-- INSERT OR IGNORE on deterministic ids so a re-apply is a no-op.

CREATE TABLE IF NOT EXISTS oe_counterparty_offers (
  id                    TEXT PRIMARY KEY,
  offeror_participant_id TEXT NOT NULL,
  offeror_role          TEXT NOT NULL,   -- carbon_fund | lender | ipp_developer | offtaker ...
  target_role           TEXT NOT NULL,   -- role this offer is aimed at (ipp_developer ...)
  offer_kind            TEXT NOT NULL,   -- carbon_rec | carbon_voluntary | carbon_involuntary | funding_debt | funding_mezz | funding_equity | energy_supply
  registry_standard     TEXT,            -- carbon offers only: gold_standard | verra_vcs | pure_earth | i_rec | article_6_4 | cdm
  headline              TEXT NOT NULL,
  terms_json            TEXT NOT NULL DEFAULT '{}',  -- kind-specific commercial terms
  match_json            TEXT,            -- optional eligibility filter (min_capacity_mw, technology[])
  status                TEXT NOT NULL DEFAULT 'active',  -- active | paused | withdrawn
  tenant_id             TEXT NOT NULL DEFAULT 'default',
  created_at            TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at            TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_cpoffer_target  ON oe_counterparty_offers (target_role, status);
CREATE INDEX IF NOT EXISTS idx_cpoffer_offeror ON oe_counterparty_offers (offeror_participant_id);
CREATE INDEX IF NOT EXISTS idx_cpoffer_kind    ON oe_counterparty_offers (offer_kind);

CREATE TABLE IF NOT EXISTS oe_offer_engagements (
  id                  TEXT PRIMARY KEY,
  offer_id            TEXT NOT NULL,
  offer_kind          TEXT NOT NULL,
  initiator_id        TEXT NOT NULL,     -- the role that selected the offer (e.g. the IPP)
  initiator_role      TEXT NOT NULL,
  offeror_id          TEXT NOT NULL,
  offeror_role        TEXT NOT NULL,
  entity_type         TEXT NOT NULL,     -- what the engagement is about (ipp_projects ...)
  entity_id           TEXT NOT NULL,
  entity_label        TEXT,
  status              TEXT NOT NULL DEFAULT 'requested',  -- requested | accepted | declined | withdrawn
  note                TEXT,
  tenant_id           TEXT NOT NULL DEFAULT 'default',
  created_at          TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_offereng_entity   ON oe_offer_engagements (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_offereng_offeror  ON oe_offer_engagements (offeror_id, status);
CREATE INDEX IF NOT EXISTS idx_offereng_initiator ON oe_offer_engagements (initiator_id, status);

-- ─────────────────────────────────────────────────────────────────────────────
-- Role-based seed. Picks the first participant of each role on whichever DB this
-- runs against (demo personas or live participants), so the funding-options view
-- is never empty. Illustrative commercial terms; live-specific terms (Growvest
-- R22.5m) are layered on by scripts/live/live-bootstrap.sql.
-- ─────────────────────────────────────────────────────────────────────────────

-- Carbon fund — REC (I-REC renewable attribute certificate)
INSERT OR IGNORE INTO oe_counterparty_offers
  (id, offeror_participant_id, offeror_role, target_role, offer_kind, registry_standard, headline, terms_json)
SELECT 'cof_seed_carbon_rec',
       (SELECT id FROM participants WHERE role='carbon_fund' ORDER BY id LIMIT 1),
       'carbon_fund', 'ipp_developer', 'carbon_rec', 'i_rec',
       'I-REC offtake — R45/MWh, 10-year attribute purchase',
       '{"price_per_mwh":45,"certificate":"i_rec","tenor_years":10,"settlement":"quarterly"}'
WHERE EXISTS (SELECT 1 FROM participants WHERE role='carbon_fund');

-- Carbon fund — voluntary, Gold Standard
INSERT OR IGNORE INTO oe_counterparty_offers
  (id, offeror_participant_id, offeror_role, target_role, offer_kind, registry_standard, headline, terms_json)
SELECT 'cof_seed_carbon_vol_gs',
       (SELECT id FROM participants WHERE role='carbon_fund' ORDER BY id LIMIT 1),
       'carbon_fund', 'ipp_developer', 'carbon_voluntary', 'gold_standard',
       'Gold Standard VER offtake — R180/tCO2e, 7-year forward',
       '{"price_per_tco2e":180,"min_volume_tco2e":1000,"tenor_years":7,"includes_doc_gen":true}'
WHERE EXISTS (SELECT 1 FROM participants WHERE role='carbon_fund');

-- Carbon fund — voluntary, Verra VCS
INSERT OR IGNORE INTO oe_counterparty_offers
  (id, offeror_participant_id, offeror_role, target_role, offer_kind, registry_standard, headline, terms_json)
SELECT 'cof_seed_carbon_vol_verra',
       (SELECT id FROM participants WHERE role='carbon_fund' ORDER BY id LIMIT 1),
       'carbon_fund', 'ipp_developer', 'carbon_voluntary', 'verra_vcs',
       'Verra VCS VCU offtake — R160/tCO2e, 7-year forward',
       '{"price_per_tco2e":160,"min_volume_tco2e":1000,"tenor_years":7,"includes_doc_gen":true}'
WHERE EXISTS (SELECT 1 FROM participants WHERE role='carbon_fund');

-- Carbon fund — voluntary, Pure Earth (co-benefit / remediation linked)
INSERT OR IGNORE INTO oe_counterparty_offers
  (id, offeror_participant_id, offeror_role, target_role, offer_kind, registry_standard, headline, terms_json)
SELECT 'cof_seed_carbon_vol_pureearth',
       (SELECT id FROM participants WHERE role='carbon_fund' ORDER BY id LIMIT 1),
       'carbon_fund', 'ipp_developer', 'carbon_voluntary', 'pure_earth',
       'Pure Earth co-benefit credit — R210/tCO2e, premium remediation-linked',
       '{"price_per_tco2e":210,"min_volume_tco2e":500,"tenor_years":5,"co_benefit":"toxic_site_remediation","includes_doc_gen":true}'
WHERE EXISTS (SELECT 1 FROM participants WHERE role='carbon_fund');

-- Carbon fund — involuntary / compliance (Carbon Tax Act s13 offset)
INSERT OR IGNORE INTO oe_counterparty_offers
  (id, offeror_participant_id, offeror_role, target_role, offer_kind, registry_standard, headline, terms_json)
SELECT 'cof_seed_carbon_compliance',
       (SELECT id FROM participants WHERE role='carbon_fund' ORDER BY id LIMIT 1),
       'carbon_fund', 'ipp_developer', 'carbon_involuntary', 'article_6_4',
       'Compliance offset — R240/tCO2e, Carbon Tax Act s13 eligible',
       '{"price_per_tco2e":240,"regime":"carbon_tax_act_s13","tenor_years":3,"includes_doc_gen":true}'
WHERE EXISTS (SELECT 1 FROM participants WHERE role='carbon_fund');

-- Lender — senior debt
INSERT OR IGNORE INTO oe_counterparty_offers
  (id, offeror_participant_id, offeror_role, target_role, offer_kind, headline, terms_json)
SELECT 'cof_seed_funding_senior',
       (SELECT id FROM participants WHERE role='lender' ORDER BY id LIMIT 1),
       'lender', 'ipp_developer', 'funding_debt',
       'Senior project debt — up to R25m, JIBAR+450bps, 15-year tenor',
       '{"ticket_zar":25000000,"rate_basis":"JIBAR","margin_bps":450,"tenor_years":15,"structure":"senior_debt","gearing_max_pct":75}'
WHERE EXISTS (SELECT 1 FROM participants WHERE role='lender');

-- Lender — mezzanine
INSERT OR IGNORE INTO oe_counterparty_offers
  (id, offeror_participant_id, offeror_role, target_role, offer_kind, headline, terms_json)
SELECT 'cof_seed_funding_mezz',
       (SELECT id FROM participants WHERE role='lender' ORDER BY id LIMIT 1),
       'lender', 'ipp_developer', 'funding_mezz',
       'Mezzanine tranche — up to R8m, fixed 16.5%, 7-year tenor',
       '{"ticket_zar":8000000,"rate_basis":"fixed","rate_pct":16.5,"tenor_years":7,"structure":"mezzanine"}'
WHERE EXISTS (SELECT 1 FROM participants WHERE role='lender');
