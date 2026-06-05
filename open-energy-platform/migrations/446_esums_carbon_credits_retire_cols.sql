-- 446 — add registry_ref + retired_at to esums_carbon_credits for retirement lifecycle
ALTER TABLE esums_carbon_credits ADD COLUMN registry_ref TEXT;
ALTER TABLE esums_carbon_credits ADD COLUMN retired_at   TEXT;
ALTER TABLE esums_carbon_credits ADD COLUMN carbon_value_zar REAL NOT NULL DEFAULT 0;
