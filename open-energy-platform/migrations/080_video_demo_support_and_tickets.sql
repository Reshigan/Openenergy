-- ═══════════════════════════════════════════════════════════════════════════
-- 080_video_demo_support_and_tickets.sql
--
-- Migration 079 inserted support_tickets via:
--   INSERT INTO ... SELECT ... FROM participants r, participants s
--     WHERE r.email = '<reporter>' AND s.email = 'support@openenergy.co.za';
--
-- but no `support@openenergy.co.za` participant exists, so the SELECT
-- produced zero rows and all four ticket inserts silently no-op'd —
-- leaving the Support workstation empty for the video. This migration:
--
--   1. Creates the missing `support@openenergy.co.za` participant.
--   2. Re-runs the 4 ticket inserts from 079 (idempotent — `INSERT OR
--      IGNORE` on the seeded ticket IDs).
--   3. Extends the seed to 12+ tickets across all categories + statuses,
--      so the Support cockpit reads as a live production helpdesk.
--
-- One INSERT per row (no UNION ALL chains — D1 caps compound terms).
-- Safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. Provision the support persona ────────────────────────────────────────
-- Password is the shared demo password `Demo@2024!`; hash matches the
-- format used for every other demo seed row (pbkdf2 SHA-256, 100k rounds,
-- the same `b3BlbmVuZXJneS1kZW1vLXNhbHQ=` salt).
INSERT OR IGNORE INTO participants
  (id, email, password_hash, name, company_name, role, status, kyc_status,
   subscription_tier, tenant_id, email_verified, onboarding_completed,
   bbbee_level, created_at, updated_at)
VALUES (
  'demo_support_001',
  'support@openenergy.co.za',
  'pbkdf2$sha256$100000$b3BlbmVuZXJneS1kZW1vLXNhbHQ=$IOJml+OkT8C4tON6R1DA+HDLPXUGnOyqgPF6XBjyYkk=',
  'Lerato Mokoena',
  'Open Energy Platform Support',
  'admin', 'active', 'approved',
  'enterprise', 'default', 1, 1,
  1,
  datetime('now','-30 days'),
  datetime('now')
);

-- Some 079 inserts reference `support@openenergy.co.za` as assignee; replay
-- them now that the participant exists.
INSERT OR IGNORE INTO support_tickets
  (id, ticket_number, reporter_id, tenant_id, subject, description, category, priority, status, assignee_id, created_at)
SELECT 'sup-vid-01', 'TKT-25-0001', r.id, 'default',
       'PPA upload — counterparty signatory missing',
       'After uploading the redline, the signatory list shows only one party. Expected two.',
       'data_issue', 'high', 'open', s.id, datetime('now','-3 hours')
  FROM participants r, participants s
 WHERE r.email='offtaker@openenergy.co.za' AND s.email='support@openenergy.co.za';
INSERT OR IGNORE INTO support_tickets
  (id, ticket_number, reporter_id, tenant_id, subject, description, category, priority, status, assignee_id, created_at)
SELECT 'sup-vid-02', 'TKT-25-0002', r.id, 'default',
       'Cannot view settlement statement for SETT-25-0014',
       'Statement page returns "loading" indefinitely.',
       'bug', 'urgent', 'in_progress', s.id, datetime('now','-6 hours')
  FROM participants r, participants s
 WHERE r.email='trader@openenergy.co.za' AND s.email='support@openenergy.co.za';
INSERT OR IGNORE INTO support_tickets
  (id, ticket_number, reporter_id, tenant_id, subject, description, category, priority, status, assignee_id, created_at)
SELECT 'sup-vid-03', 'TKT-25-0003', r.id, 'default',
       'Need bulk export of covenant history',
       'For audit purposes, please advise on CSV export.',
       'feature_question', 'normal', 'resolved', s.id, datetime('now','-2 day')
  FROM participants r, participants s
 WHERE r.email='lender@openenergy.co.za' AND s.email='support@openenergy.co.za';
INSERT OR IGNORE INTO support_tickets
  (id, ticket_number, reporter_id, tenant_id, subject, description, category, priority, status, assignee_id, created_at)
SELECT 'sup-vid-04', 'TKT-25-0004', r.id, 'default',
       'POPIA — data subject access request received',
       'Customer raised SAR via legal counsel. Need timeline.',
       'compliance', 'high', 'waiting_on_customer', s.id, datetime('now','-1 day')
  FROM participants r, participants s
 WHERE r.email='regulator@openenergy.co.za' AND s.email='support@openenergy.co.za';

UPDATE support_tickets
   SET resolved_at = datetime('now','-1 day'),
       resolution = 'Documented in user guide; export endpoint shipped 2026-05-20.'
 WHERE id = 'sup-vid-03' AND resolved_at IS NULL;

-- ─── 2. Extend to 12+ tickets across categories + statuses ───────────────────
INSERT OR IGNORE INTO support_tickets
  (id, ticket_number, reporter_id, tenant_id, subject, description, category, priority, status, assignee_id, created_at)
SELECT 'sup-vid-05', 'TKT-25-0005', r.id, 'default',
       'MFA enrolment failed — TOTP QR not rendering',
       'After scanning, Microsoft Authenticator returns "invalid secret". Re-tried 3x.',
       'bug', 'high', 'in_progress', s.id, datetime('now','-90 minutes')
  FROM participants r, participants s
 WHERE r.email='ipp@openenergy.co.za' AND s.email='support@openenergy.co.za';

INSERT OR IGNORE INTO support_tickets
  (id, ticket_number, reporter_id, tenant_id, subject, description, category, priority, status, assignee_id, created_at)
SELECT 'sup-vid-06', 'TKT-25-0006', r.id, 'default',
       'Invoice INV-25-0212 — wrong VAT rate',
       'VAT charged at 14%. South African VAT is 15% since 2018. Please correct.',
       'billing', 'high', 'open', s.id, datetime('now','-4 hours')
  FROM participants r, participants s
 WHERE r.email='carbon@openenergy.co.za' AND s.email='support@openenergy.co.za';

INSERT OR IGNORE INTO support_tickets
  (id, ticket_number, reporter_id, tenant_id, subject, description, category, priority, status, assignee_id, created_at)
SELECT 'sup-vid-07', 'TKT-25-0007', r.id, 'default',
       'Cannot access tenant analytics dashboard',
       'Permissions error when opening /admin/analytics. Need access for monthly board pack.',
       'access', 'normal', 'resolved', s.id, datetime('now','-3 day')
  FROM participants r, participants s
 WHERE r.email='grid@openenergy.co.za' AND s.email='support@openenergy.co.za';

UPDATE support_tickets
   SET resolved_at = datetime('now','-2 day','-3 hours'),
       resolution = 'Granted analyst role on /admin/* read scope. Configured under user preferences.'
 WHERE id = 'sup-vid-07' AND resolved_at IS NULL;

INSERT OR IGNORE INTO support_tickets
  (id, ticket_number, reporter_id, tenant_id, subject, description, category, priority, status, assignee_id, created_at)
SELECT 'sup-vid-08', 'TKT-25-0008', r.id, 'default',
       'Surveillance alert RSA-2026-0042 — false positive flag',
       'Alert raised against my desk for layering. Volume was a single algo run, not split.',
       'compliance', 'urgent', 'in_progress', s.id, datetime('now','-2 hours')
  FROM participants r, participants s
 WHERE r.email='trader@openenergy.co.za' AND s.email='support@openenergy.co.za';

INSERT OR IGNORE INTO support_tickets
  (id, ticket_number, reporter_id, tenant_id, subject, description, category, priority, status, assignee_id, created_at)
SELECT 'sup-vid-09', 'TKT-25-0009', r.id, 'default',
       'Cron run 2026-05-23T00:10 — settlement_daily failed',
       'Daily PPA settlement cron logged "no quorum on mark prices". Please investigate.',
       'bug', 'high', 'resolved', s.id, datetime('now','-5 day')
  FROM participants r, participants s
 WHERE r.email='admin@openenergy.co.za' AND s.email='support@openenergy.co.za';

UPDATE support_tickets
   SET resolved_at = datetime('now','-4 day','-12 hours'),
       resolution = 'VWAP mark-price cron raced settlement window. Added 30-minute grace; re-ran settlement.'
 WHERE id = 'sup-vid-09' AND resolved_at IS NULL;

INSERT OR IGNORE INTO support_tickets
  (id, ticket_number, reporter_id, tenant_id, subject, description, category, priority, status, assignee_id, created_at)
SELECT 'sup-vid-10', 'TKT-25-0010', r.id, 'default',
       'Need SSO integration with our Azure tenant',
       'Our security team requires Entra ID single sign-on before we can roll out to 50 users.',
       'feature_question', 'normal', 'open', s.id, datetime('now','-1 day')
  FROM participants r, participants s
 WHERE r.email='offtaker@openenergy.co.za' AND s.email='support@openenergy.co.za';

INSERT OR IGNORE INTO support_tickets
  (id, ticket_number, reporter_id, tenant_id, subject, description, category, priority, status, assignee_id, created_at)
SELECT 'sup-vid-11', 'TKT-25-0011', r.id, 'default',
       'Project commissioning checklist incorrect',
       'Step 12 (witnessed performance test) shows as optional. NERSA requires it before licence activation.',
       'data_issue', 'normal', 'closed', s.id, datetime('now','-7 day')
  FROM participants r, participants s
 WHERE r.email='ipp@openenergy.co.za' AND s.email='support@openenergy.co.za';

UPDATE support_tickets
   SET resolved_at = datetime('now','-6 day','-5 hours'),
       resolution = 'Step 12 marked mandatory in commissioning workflow v2.1, shipped 2026-05-19.'
 WHERE id = 'sup-vid-11' AND resolved_at IS NULL;

INSERT OR IGNORE INTO support_tickets
  (id, ticket_number, reporter_id, tenant_id, subject, description, category, priority, status, assignee_id, created_at)
SELECT 'sup-vid-12', 'TKT-25-0012', r.id, 'default',
       'POPIA breach notification template — clarification',
       'When the 30-day clock starts: from detection or from confirmation of impact?',
       'compliance', 'normal', 'waiting_on_customer', s.id, datetime('now','-18 hours')
  FROM participants r, participants s
 WHERE r.email='lender@openenergy.co.za' AND s.email='support@openenergy.co.za';

INSERT OR IGNORE INTO support_tickets
  (id, ticket_number, reporter_id, tenant_id, subject, description, category, priority, status, assignee_id, created_at)
SELECT 'sup-vid-13', 'TKT-25-0013', r.id, 'default',
       'Carbon retirement certificate — beneficiary field missing',
       'When retiring credits on behalf of a sponsor, no place to record the sponsor name.',
       'feature_question', 'low', 'resolved', s.id, datetime('now','-10 day')
  FROM participants r, participants s
 WHERE r.email='carbon@openenergy.co.za' AND s.email='support@openenergy.co.za';

UPDATE support_tickets
   SET resolved_at = datetime('now','-9 day'),
       resolution = 'Beneficiary fields shipped on retirement form. See certificate sample CR-2026-0188.'
 WHERE id = 'sup-vid-13' AND resolved_at IS NULL;

INSERT OR IGNORE INTO support_tickets
  (id, ticket_number, reporter_id, tenant_id, subject, description, category, priority, status, assignee_id, created_at)
SELECT 'sup-vid-14', 'TKT-25-0014', r.id, 'default',
       'Mobile responsive — Regulator workstation cropping',
       'Open investigation modal has actions cropped on iPad portrait (1024×768).',
       'bug', 'low', 'open', s.id, datetime('now','-12 hours')
  FROM participants r, participants s
 WHERE r.email='regulator@openenergy.co.za' AND s.email='support@openenergy.co.za';
