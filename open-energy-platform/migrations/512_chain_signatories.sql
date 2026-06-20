-- 512_chain_signatories.sql
-- Generalised e-signature ceremony for Meridian chain entities. Mirrors the
-- document_signatories ceremony (migration 001) but keyed by (entity_type,
-- entity_id) so any chain row — PPA, loan, O&M, termination — carries a hash-
-- bound, vault-backed signatory roster without an FK into contract_documents.
-- The ceremony semantics (all-signatories gate, document_hash_at_signing,
-- signature_r2_key) are identical; only the key generalises.
CREATE TABLE IF NOT EXISTS chain_signatories (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL,            -- the Meridian chain key (e.g. 'ppa_contract_chain')
  entity_id TEXT NOT NULL,              -- the chain row id
  participant_id TEXT NOT NULL REFERENCES participants(id),
  signatory_name TEXT,
  signatory_designation TEXT,
  signed INTEGER DEFAULT 0,
  signed_at TEXT,
  signature_r2_key TEXT,                -- vault artifact pointer (R2)
  document_hash_at_signing TEXT,        -- hash bound at the moment of signing
  tenant_id TEXT DEFAULT 'default',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_chain_signatories_entity
  ON chain_signatories (entity_type, entity_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_chain_signatories_unique
  ON chain_signatories (entity_type, entity_id, participant_id);
