-- 510_email_outbox.sql
-- Append-only audit log of every email the platform attempts to send.
-- The sendEmail() seam (src/utils/email.ts) writes one row per attempt:
-- queued on entry, then sent (delivered or dev no-op) or failed (transport
-- error, with the error text captured). Live delivery via MailChannels is
-- gated on env.ENVIRONMENT === 'production' && env.EMAIL_FROM; until that gate
-- opens every row simply records intent (status 'sent', dev no-op).
CREATE TABLE IF NOT EXISTS oe_email_outbox (
  id          TEXT PRIMARY KEY,
  to_addr     TEXT NOT NULL,
  template    TEXT NOT NULL,
  payload     TEXT NOT NULL DEFAULT '{}',  -- JSON of the template data
  status      TEXT NOT NULL DEFAULT 'queued',  -- queued | sent | failed
  error       TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_oe_email_outbox_status  ON oe_email_outbox(status);
CREATE INDEX IF NOT EXISTS idx_oe_email_outbox_created ON oe_email_outbox(created_at);
