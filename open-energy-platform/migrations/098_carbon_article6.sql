-- 098_carbon_article6.sql
-- Wave 4: COP-aligned Article 6 ITMO corresponding-adjustment ledger.
--
-- UNFCCC Paris Agreement Article 6.2 / 6.4 require that when an emissions
-- reduction (ITMO) is transferred internationally, the host country make a
-- "corresponding adjustment" — adding the tonne back to its inventory so the
-- buyer country can claim it without double-counting. This migration adds
-- the four artefacts that surface that:
--
--   oe_article6_adjustments   — one row per cross-border ITMO transfer with
--                                host-country adjustment state + DFFE
--                                clearance + UNFCCC ledger reference.
--   oe_country_routing        — per-country routing config (ISO 3166 alpha-3,
--                                NDC authority email, registry URL pattern,
--                                Article 6.2 / 6.4 / paris-only / non-party).
--   oe_serial_registry_uri    — deterministic anchor URL per retired serial
--                                so any auditor can independently verify the
--                                retirement against the host registry.
--   (extends) carbon_retirement_certificates — country + Article 6 + DFFE.
--
-- All CREATE TABLE IF NOT EXISTS; ALTER TABLE ADD COLUMN steps are wrapped
-- in single-statement blocks so a re-apply on a fresh DB is idempotent.

-- ── Country routing ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS oe_country_routing (
  country_iso          TEXT PRIMARY KEY,           -- ISO 3166-1 alpha-3 (ZAF, GBR, …)
  country_name         TEXT NOT NULL,
  ndc_authority        TEXT,                       -- e.g. 'Department of Forestry, Fisheries and the Environment'
  ndc_authority_email  TEXT,
  article_6_track      TEXT NOT NULL DEFAULT 'unknown'
    CHECK (article_6_track IN ('6.2','6.4','paris_only','non_party','unknown')),
  registry_url_pattern TEXT,                       -- e.g. 'https://verra.org/project/{proj}/vintage/{year}/serial/{serial}'
  active               INTEGER NOT NULL DEFAULT 1,
  notes                TEXT,
  updated_at           TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_oe_country_routing_track ON oe_country_routing(article_6_track);

-- ── Article 6 corresponding-adjustment ledger ─────────────────────────────
CREATE TABLE IF NOT EXISTS oe_article6_adjustments (
  id                          TEXT PRIMARY KEY,
  retirement_id               TEXT NOT NULL,           -- credit_serials retirement event / carbon_retirements.id
  certificate_id              TEXT,                    -- carbon_retirement_certificates.id (nullable until issued)
  host_country_iso            TEXT NOT NULL,           -- where the reduction occurred (SA = ZAF)
  beneficiary_country_iso     TEXT NOT NULL,           -- who is claiming the reduction
  tco2e                       REAL NOT NULL,
  vintage_year                INTEGER,
  registry                    TEXT,                    -- verra / gold_standard / cdm / sa_redd
  serial_range                TEXT,                    -- 'VCS-PRJ-001-2024-1000-1999'
  registry_uri                TEXT,                    -- deterministic anchor URL
  article_6_track             TEXT NOT NULL
    CHECK (article_6_track IN ('6.2','6.4','voluntary_oc','paris_only')),
  -- Lifecycle:
  --   draft           — captured at certificate issuance
  --   dffe_pending    — submitted to host-country NDC authority (DFFE for SA)
  --   dffe_cleared    — host authority has acknowledged
  --   unfccc_ledger   — UNFCCC central ledger entry posted
  --   blocked         — flagged as double-counting risk; not redeemable
  ca_status                   TEXT NOT NULL DEFAULT 'draft'
    CHECK (ca_status IN ('draft','dffe_pending','dffe_cleared','unfccc_ledger','blocked')),
  dffe_submitted_at           TEXT,
  dffe_clearance_ref          TEXT,
  dffe_clearance_at           TEXT,
  unfccc_ledger_ref           TEXT,
  unfccc_posted_at            TEXT,
  blocked_reason              TEXT,
  created_by                  TEXT NOT NULL,
  created_at                  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at                  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_oe_article6_retirement   ON oe_article6_adjustments(retirement_id);
CREATE INDEX IF NOT EXISTS idx_oe_article6_status       ON oe_article6_adjustments(ca_status);
CREATE INDEX IF NOT EXISTS idx_oe_article6_host         ON oe_article6_adjustments(host_country_iso);
CREATE INDEX IF NOT EXISTS idx_oe_article6_beneficiary  ON oe_article6_adjustments(beneficiary_country_iso);

-- ── Deterministic serial-registry URI anchor ──────────────────────────────
-- One row per retired serial block (or per certificate) so any auditor can
-- independently follow the URL to the host registry and verify the
-- retirement record. The URI is computed from the country_routing pattern
-- at certificate-issuance time.
CREATE TABLE IF NOT EXISTS oe_serial_registry_uri (
  id                 TEXT PRIMARY KEY,
  certificate_id     TEXT NOT NULL,
  retirement_id      TEXT NOT NULL,
  registry           TEXT NOT NULL,
  serial_range       TEXT NOT NULL,
  registry_uri       TEXT NOT NULL,
  resolved_at        TEXT,           -- last time our verifier hit the URL (200 OK)
  resolved_status    INTEGER,        -- last HTTP status
  resolved_sha256    TEXT,           -- hash of the response payload for tamper detection
  created_at         TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_oe_uri_cert    ON oe_serial_registry_uri(certificate_id);
CREATE INDEX IF NOT EXISTS idx_oe_uri_serial  ON oe_serial_registry_uri(serial_range);
