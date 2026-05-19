-- ════════════════════════════════════════════════════════════════════════
-- 073_document_templates.sql — document templates + signing envelopes
--
-- Templates hold parameterised body text with {{handlebar}} variables.
-- An envelope is a concrete instantiation: template_id + filled variables
-- + ordered list of required signatories. Once every signatory has
-- countersigned (via /api/polish/signatures), the envelope flips to
-- 'completed' and the canonical signed copy is stored in R2.
-- ════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS oe_document_templates (
  id              TEXT PRIMARY KEY,
  template_key    TEXT UNIQUE NOT NULL,                -- e.g. 'ppa.standard.v3'
  display_name    TEXT NOT NULL,
  category        TEXT NOT NULL,                       -- ppa|nda|epc|amendment|consent|other
  body_md         TEXT NOT NULL,                       -- markdown with {{vars}}
  variables_json  TEXT NOT NULL,                       -- declared vars + descriptions
  required_signatories_json TEXT NOT NULL,             -- ordered [{ role, label }]
  jurisdiction    TEXT,                                -- ZA-NERSA, JSE-SRL, REIPPPP, etc.
  version         INTEGER NOT NULL DEFAULT 1,
  status          TEXT NOT NULL DEFAULT 'draft',       -- draft|published|deprecated
  created_by      TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  published_at    TEXT,
  deprecated_at   TEXT
);
CREATE INDEX IF NOT EXISTS idx_oe_doc_tpl_category ON oe_document_templates(category, status);

CREATE TABLE IF NOT EXISTS oe_document_envelopes (
  id              TEXT PRIMARY KEY,
  template_id     TEXT NOT NULL REFERENCES oe_document_templates(id),
  raised_by       TEXT NOT NULL,
  raised_at       TEXT NOT NULL DEFAULT (datetime('now')),
  variables_json  TEXT NOT NULL,                       -- filled values
  body_rendered   TEXT NOT NULL,                       -- snapshot of rendered text
  signatories_json TEXT NOT NULL,                      -- [{ participant_id, role, label, signed_at? }]
  status          TEXT NOT NULL DEFAULT 'sent',        -- sent|in_progress|completed|cancelled|expired
  completed_at    TEXT,
  cancelled_at    TEXT,
  cancellation_reason TEXT,
  r2_signed_key   TEXT,                                -- final PDF/MD location
  document_hash   TEXT                                  -- SHA-256 of body_rendered, used as the signing payload
);
CREATE INDEX IF NOT EXISTS idx_oe_doc_env_status ON oe_document_envelopes(status, raised_at);
CREATE INDEX IF NOT EXISTS idx_oe_doc_env_template ON oe_document_envelopes(template_id);

-- Seed a couple of starter templates so the UI has something to show.
INSERT OR IGNORE INTO oe_document_templates
  (id, template_key, display_name, category, body_md, variables_json,
   required_signatories_json, jurisdiction, status, published_at)
VALUES
  ('tpl_ppa_std_v1', 'ppa.standard.v1', 'Standard PPA — small embedded generator', 'ppa',
   '# Power Purchase Agreement

**Generator:** {{generator_name}}
**Offtaker:** {{offtaker_name}}
**Contracted Capacity:** {{capacity_mw}} MW
**Tariff:** R{{tariff_zar_kwh}}/kWh, indexed at CPI annually
**Term:** {{term_years}} years from {{commencement_date}}

The Generator shall sell, and the Offtaker shall purchase, all Net
Energy generated up to the Contracted Capacity for the duration of the
Term. Settlement is monthly on net-metered values verified to the NERSA
Metering Code of Practice.',
   '[{"key":"generator_name","desc":"Legal name of the IPP"},
     {"key":"offtaker_name","desc":"Legal name of the offtaker"},
     {"key":"capacity_mw","desc":"Contracted capacity in MW"},
     {"key":"tariff_zar_kwh","desc":"Initial tariff in R/kWh"},
     {"key":"term_years","desc":"Contract term in years"},
     {"key":"commencement_date","desc":"Commencement date, YYYY-MM-DD"}]',
   '[{"role":"ipp_developer","label":"Generator"},
     {"role":"offtaker","label":"Offtaker"}]',
   'ZA-NERSA', 'published', datetime('now')),
  ('tpl_nda_v1', 'nda.bilateral.v1', 'Bilateral NDA', 'nda',
   '# Bilateral Non-Disclosure Agreement

**Parties:** {{party_a_name}} and {{party_b_name}}
**Effective date:** {{effective_date}}
**Term:** {{term_months}} months from the Effective Date

Each Party agrees to keep confidential all non-public information
received from the other Party. Permitted disclosures are limited to
representatives with a need to know who are themselves bound by
equivalent confidentiality obligations.',
   '[{"key":"party_a_name","desc":"Legal name of Party A"},
     {"key":"party_b_name","desc":"Legal name of Party B"},
     {"key":"effective_date","desc":"YYYY-MM-DD"},
     {"key":"term_months","desc":"Duration in months"}]',
   '[{"role":"any","label":"Party A"},
     {"role":"any","label":"Party B"}]',
   'ZA', 'published', datetime('now')),
  ('tpl_amend_v1', 'amendment.standard.v1', 'Standard contract amendment', 'amendment',
   '# Contract Amendment

**Original contract:** {{original_ref}}
**Amendment number:** {{amend_no}}
**Effective from:** {{effective_from}}

The Parties amend the original contract as follows:

{{amendment_body}}

All other terms of the original contract remain in full force and effect.',
   '[{"key":"original_ref","desc":"Original contract reference"},
     {"key":"amend_no","desc":"Sequential amendment number, e.g. A1"},
     {"key":"effective_from","desc":"YYYY-MM-DD"},
     {"key":"amendment_body","desc":"Free-text amendment body"}]',
   '[{"role":"any","label":"Counterparty A"},
     {"role":"any","label":"Counterparty B"}]',
   'ZA', 'published', datetime('now'));
