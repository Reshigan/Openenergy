-- Horizon chain-case backfill: Growvest (p_live_growvest, lender) is the debt provider
-- behind GoNXT's 10 real private-wire C&I solar sites. Horizon is chain-case-driven;
-- the covenants/tests tile backfill did not light it. This seeds the current-period
-- compliance certificate in the non-terminal 'under_review' state -> lands Growvest on a
-- populated /horizon (covenant_certificate lane). Ratios mirror the Q2-2026 covenant
-- tests already seeded (DSCR 1.38x, LLCR 1.52x, gearing 0.68). CALCULATED retrospective
-- off the real fleet. Idempotent: INSERT OR IGNORE, deterministic id.
INSERT OR IGNORE INTO oe_covenant_certificates (
  id, certificate_number, borrower_party_id, borrower_party_name,
  facility_agent_name, lender_name, facility_name, facility_tier,
  facility_limit, outstanding_principal, test_period, test_period_end,
  dscr_actual, dscr_threshold, llcr_actual, llcr_threshold,
  gearing_actual, gearing_threshold, submission_basis,
  chain_status, certificate_due_at, certificate_submitted_at, under_review_at,
  sla_deadline_at, created_by
)
VALUES (
  'covcert_growvest_q2_2026', 'CC-GR-2026-Q2', 'p_live_gonxt', 'GoNXT Energy',
  'Growvest', 'Growvest', 'GoNXT C&I Solar Senior Facility', 'senior_secured',
  18000000, 14200000, 'Q2-2026', '2026-06-30',
  1.38, 1.20, 1.52, 1.35,
  0.68, 0.75,
  'Q2-2026 quarterly compliance certificate submitted; ratios mirror seeded covenant tests. Calculated retrospective off the real fleet.',
  'under_review', '2026-07-15', date('now', '-3 days'), date('now', '-1 days'),
  '2026-07-22', 'p_live_growvest'
);

UPDATE participants SET onboarding_completed = 1, onboarding_step = 'completed', updated_at = datetime('now')
WHERE id = 'p_live_growvest';
