-- Track every PDF generated on demand by /api/pdf/*
-- r2_key is optional — only set when ?persist=1 was passed

CREATE TABLE IF NOT EXISTS generated_documents (
  id           TEXT PRIMARY KEY,
  doc_type     TEXT NOT NULL,          -- invoice | carbon_cert | covenant_report | work_order | stage_gate | settlement | audit_export
  entity_type  TEXT NOT NULL,
  entity_id    TEXT NOT NULL,
  r2_key       TEXT,                   -- vault path, set only when persisted to R2
  generated_by TEXT NOT NULL,
  generated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_gendoc_entity  ON generated_documents (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_gendoc_type    ON generated_documents (doc_type);
CREATE INDEX IF NOT EXISTS idx_gendoc_by      ON generated_documents (generated_by);
