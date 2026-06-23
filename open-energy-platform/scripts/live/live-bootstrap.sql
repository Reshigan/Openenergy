-- ════════════════════════════════════════════════════════════════════════
-- live-bootstrap.sql · run ONCE against cec-energy-db AFTER migrations apply.
--
-- Live (cec.vantax.co.za) shares the full demo migration set for schema
-- parity, which also seeds the demo personas. This file neutralises every
-- demo login and installs the single real platform admin.
--
-- Idempotent: re-running is safe (UPDATE by pattern + INSERT OR REPLACE).
-- ════════════════════════════════════════════════════════════════════════

-- 1. Disable every demo persona. password_hash is left non-null (NOT NULL
--    column) but in a form verifyPassword() can never match (not pbkdf2$ /
--    not $2). UPDATE not DELETE so demo seed FK references stay intact.
UPDATE participants
SET    status = 'suspended',
       password_hash = '!disabled-on-live',
       updated_at = datetime('now')
WHERE  email LIKE '%@openenergy.co.za';

-- 2. Real platform admin. Credential is reshigan@vantax.co.za / the password
--    surfaced to the operator at deploy time (rotate via the app after first
--    login). tenant_id 'default' = cross-tenant platform scope.
INSERT OR REPLACE INTO participants
  (id, email, password_hash, name, company_name, role, status,
   kyc_status, tenant_id, email_verified, onboarding_completed,
   created_at, updated_at)
VALUES
  ('p_live_admin',
   'reshigan@vantax.co.za',
   'pbkdf2$sha256$100000$LK3xPfGNpu//ACwrOui6Jg==$dy6tjsl/wRO1xjo5ZZqzKbFB/LApj2p0iQNaK4WEw+w=',
   'CEC Platform Admin',
   'Vantax',
   'admin',
   'active',
   'approved',
   'default',
   1,
   1,
   datetime('now'),
   datetime('now'));
