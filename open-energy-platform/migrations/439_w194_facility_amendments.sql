-- Wave 194: Lender Facility Amendment & Consent
-- Covers formal amendments to facility agreements under LMA Standard Form
-- Amendment Agreement. SARB Regulation 29 large-exposure notification applies
-- when security_variation = 1 on major/systemic amendment classes.
-- INVERTED SLA: unanimous_consent (60d) > majority_consent (45d) >
-- technical_amendment (30d) > administrative_amendment (21d) > clerical_correction (14d).

-- Migration slot 439 is REUSED — drop any prior table in this slot.
DROP TABLE IF EXISTS oe_facility_amendments;

CREATE TABLE IF NOT EXISTS oe_facility_amendments (
  id                     TEXT PRIMARY KEY,
  facility_id            TEXT NOT NULL,
  amendment_ref          TEXT,
  amendment_class        TEXT NOT NULL CHECK (amendment_class IN (
                           'unanimous_consent', 'majority_consent',
                           'technical_amendment', 'administrative_amendment',
                           'clerical_correction'
                         )),
  amendment_type         TEXT,
  majority_threshold_pct REAL,
  unanimous_required     INTEGER NOT NULL DEFAULT 0,
  consent_deadline       TEXT,
  effective_date         TEXT,
  security_variation     INTEGER NOT NULL DEFAULT 0,
  pricing_change_bps     REAL,
  description            TEXT,
  chain_status           TEXT NOT NULL DEFAULT 'amendment_requested' CHECK (chain_status IN (
                           'amendment_requested', 'eligibility_assessed',
                           'lender_circulated', 'majority_response',
                           'unanimous_required', 'consent_obtained',
                           'documentation_prepared', 'execution_signed',
                           'effective', 'refused', 'lapsed', 'withdrawn'
                         )),
  sla_deadline           TEXT,
  sla_breached           INTEGER NOT NULL DEFAULT 0,
  regulator_notified     INTEGER NOT NULL DEFAULT 0,
  actor_id               TEXT,
  reason                 TEXT,
  created_at             TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at             TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_fam_status         ON oe_facility_amendments(chain_status);
CREATE INDEX IF NOT EXISTS idx_fam_class          ON oe_facility_amendments(amendment_class);
CREATE INDEX IF NOT EXISTS idx_fam_facility       ON oe_facility_amendments(facility_id);
CREATE INDEX IF NOT EXISTS idx_fam_sla            ON oe_facility_amendments(sla_deadline, sla_breached);
CREATE INDEX IF NOT EXISTS idx_fam_created        ON oe_facility_amendments(created_at);
CREATE INDEX IF NOT EXISTS idx_fam_actor          ON oe_facility_amendments(actor_id);

-- ─── Seed data ────────────────────────────────────────────────────────────────
-- 12 rows covering all 12 states, all 5 amendment_classes, facility_id='FAC-2024-001'

INSERT OR IGNORE INTO oe_facility_amendments
  (id, facility_id, amendment_ref, amendment_class, amendment_type,
   majority_threshold_pct, unanimous_required, consent_deadline, effective_date,
   security_variation, pricing_change_bps, description,
   chain_status, sla_deadline, sla_breached, regulator_notified,
   actor_id, reason, created_at, updated_at)
VALUES

-- amendment_requested — unanimous_consent (structural tenor extension)
('fam-001',
 'FAC-2024-001', 'AMD-2026-001',
 'unanimous_consent', 'tenor_extension',
 NULL, 1, NULL, NULL,
 0, NULL,
 'Extension of facility tenor by 24 months from 2028 to 2030 following construction delay on Namaacha Wind Phase 2',
 'amendment_requested',
 '2026-08-04', 0, 0,
 'id_7c352b86da89907a85266a250e15db95',
 NULL,
 '2026-06-05 07:00:00', '2026-06-05 07:00:00'),

-- eligibility_assessed — majority_consent (covenant waiver)
('fam-002',
 'FAC-2024-001', 'AMD-2026-002',
 'majority_consent', 'covenant_waiver',
 66.67, 0, NULL, NULL,
 0, NULL,
 'Waiver of DSCR minimum covenant test for Q2-2026 owing to grid curtailment impact on revenue; W86 DSCR breached',
 'eligibility_assessed',
 '2026-07-20', 0, 0,
 'id_7c352b86da89907a85266a250e15db95',
 'Eligibility confirmed — covenant waiver qualifies as majority_consent amendment under LMA clause 35.2',
 '2026-06-01 09:00:00', '2026-06-04 14:00:00'),

-- lender_circulated — technical_amendment (drawdown schedule change)
('fam-003',
 'FAC-2024-001', 'AMD-2026-003',
 'technical_amendment', 'drawdown_schedule_change',
 66.67, 0, '2026-07-05', NULL,
 0, NULL,
 'Revised drawdown schedule shifting R120m tranche from July to September 2026 following updated EPC milestones',
 'lender_circulated',
 '2026-07-05', 0, 0,
 'id_7c352b86da89907a85266a250e15db95',
 'Circulated to all 4 lenders in the syndicate on 2026-06-04; consent deadline 30 days per LMA schedule',
 '2026-05-20 10:00:00', '2026-06-04 16:00:00'),

-- majority_response — majority_consent (pricing adjustment)
('fam-004',
 'FAC-2024-001', 'AMD-2026-004',
 'majority_consent', 'pricing_adjustment',
 66.67, 0, '2026-07-10', NULL,
 0, 15.0,
 'Margin step-up of 15 bps following credit-watch placement; separate from W95 SLL KPI ratchet mechanism',
 'majority_response',
 '2026-07-20', 0, 0,
 'id_7c352b86da89907a85266a250e15db95',
 'Majority response received: 3 of 4 lenders consented (75%) exceeding 66.67% threshold; escalate to formal vote not required',
 '2026-05-10 08:00:00', '2026-06-03 11:00:00'),

-- unanimous_required — unanimous_consent (security variation)
('fam-005',
 'FAC-2024-001', 'AMD-2026-005',
 'unanimous_consent', 'security_variation',
 NULL, 1, '2026-08-10', NULL,
 1, NULL,
 'Release of land mortgage over Site B following partial repayment; replacement with share pledge on HoldCo SPV; triggers SARB Reg 29',
 'unanimous_required',
 '2026-08-04', 0, 0,
 'id_7c352b86da89907a85266a250e15db95',
 'Majority of 3/4 lenders consented but security release requires unanimous consent under LMA security schedule',
 '2026-04-15 09:00:00', '2026-06-02 15:00:00'),

-- consent_obtained — administrative_amendment (notice mechanics)
('fam-006',
 'FAC-2024-001', 'AMD-2026-006',
 'administrative_amendment', 'agent_substitution',
 50.0, 0, NULL, NULL,
 0, NULL,
 'Change of facility agent from Standard Bank CIB to Rand Merchant Bank following portfolio transfer',
 'consent_obtained',
 '2026-06-26', 0, 0,
 'id_7c352b86da89907a85266a250e15db95',
 'All lenders consented by email; agent appointment letter executed; proceeding to documentation',
 '2026-06-04 08:00:00', '2026-06-05 10:00:00'),

-- documentation_prepared — clerical_correction
('fam-007',
 'FAC-2024-001', 'AMD-2026-007',
 'clerical_correction', 'reference_correction',
 NULL, 0, NULL, NULL,
 0, NULL,
 'Correction of erroneous account number in Schedule 4 (Payment Instructions) — NCA s18 variation record required',
 'documentation_prepared',
 '2026-06-19', 0, 0,
 'id_7c352b86da89907a85266a250e15db95',
 'Amendment documents prepared and reviewed by legal counsel; awaiting execution signatures',
 '2026-06-05 06:00:00', '2026-06-05 12:00:00'),

-- execution_signed — majority_consent (guarantor substitution)
('fam-008',
 'FAC-2024-001', 'AMD-2026-008',
 'majority_consent', 'guarantor_substitution',
 66.67, 0, NULL, NULL,
 0, NULL,
 'Substitution of corporate guarantor from Opco to HoldCo following group restructure; W69 security perfection triggered',
 'execution_signed',
 '2026-06-25', 0, 0,
 'id_7c352b86da89907a85266a250e15db95',
 'Amendment agreement signed by all parties on 2026-06-05; awaiting registration of effective date',
 '2026-05-11 09:00:00', '2026-06-05 14:00:00'),

-- effective — unanimous_consent (terminal +, security variation, regulator notified)
('fam-009',
 'FAC-2024-001', 'AMD-2025-009',
 'unanimous_consent', 'security_variation',
 NULL, 1, NULL, '2025-12-01',
 1, NULL,
 'Additional security package: registration of first-ranking notarial bond over movable assets under Movable Property Security Act',
 'effective',
 '2026-02-01', 0, 1,
 'id_7c352b86da89907a85266a250e15db95',
 'Amendment effective from 2025-12-01; SARB Reg 29 large-exposure notification submitted on 2025-11-28',
 '2025-09-01 08:00:00', '2025-12-01 10:00:00'),

-- refused — systemic (terminal -, regulator notified)
('fam-010',
 'FAC-2024-001', 'AMD-2025-010',
 'unanimous_consent', 'tenor_extension',
 NULL, 1, NULL, NULL,
 0, NULL,
 'Request to extend tenor by 36 months refused by majority lenders due to material adverse change in project economics',
 'refused',
 '2026-01-15', 0, 1,
 'id_7c352b86da89907a85266a250e15db95',
 'Refused: 2 of 4 lenders declined citing DSCR below 1.0x for extended period; MAC determination reported to regulator',
 '2025-10-01 09:00:00', '2026-01-20 11:00:00'),

-- lapsed — majority_consent (terminal -, sla_breached=1)
('fam-011',
 'FAC-2024-001', 'AMD-2025-011',
 'majority_consent', 'drawdown_schedule_change',
 66.67, 0, '2025-08-30', NULL,
 0, NULL,
 'Revised drawdown profile following EPC delay; lapsed after lenders failed to provide responses within consent window',
 'lapsed',
 '2025-07-30', 1, 0,
 'id_7c352b86da89907a85266a250e15db95',
 'SLA of 45 days expired without sufficient lender responses; amendment lapsed; new request required',
 '2025-06-15 09:00:00', '2025-08-01 10:00:00'),

-- withdrawn — technical_amendment (terminal neutral)
('fam-012',
 'FAC-2024-001', 'AMD-2025-012',
 'technical_amendment', 'reporting_mechanics',
 NULL, 0, NULL, NULL,
 0, NULL,
 'Proposed update to quarterly reporting obligations; withdrawn after parties agreed to address via side-letter instead',
 'withdrawn',
 '2025-10-01', 0, 0,
 'id_7c352b86da89907a85266a250e15db95',
 'Parties agreed that a side-letter is a more appropriate vehicle for reporting mechanics updates; amendment withdrawn',
 '2025-09-01 10:00:00', '2025-09-15 14:00:00');
