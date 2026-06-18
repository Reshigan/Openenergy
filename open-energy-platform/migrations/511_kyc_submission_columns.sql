-- 511_kyc_submission_columns.sql - extend existing per-document oe_kyc_submissions (migration 060)
-- with a tenant fence + a structured decision reason. Idempotent: the deploy.yml column-reconcile
-- band treats "duplicate column name" as a benign already-applied signal.
ALTER TABLE oe_kyc_submissions ADD COLUMN tenant_id TEXT;
ALTER TABLE oe_kyc_submissions ADD COLUMN reason_code TEXT;
CREATE INDEX IF NOT EXISTS idx_kyc_sub_tenant ON oe_kyc_submissions(tenant_id);
