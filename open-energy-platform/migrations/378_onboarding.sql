-- Migration 378: onboarding step tracking + esums_owner role support
-- Adds per-step onboarding state columns to participants.
-- Note: D1 SQLite does not easily allow CHECK constraint modification;
-- esums_owner is enforced at application level.

ALTER TABLE participants ADD COLUMN onboarding_step TEXT DEFAULT 'welcome';
ALTER TABLE participants ADD COLUMN onboarding_data TEXT DEFAULT '{}';
ALTER TABLE participants ADD COLUMN onboarding_skipped INTEGER DEFAULT 0;
