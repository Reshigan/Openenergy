-- Wave 47 — OEM-Support ITIL Change Enablement seed data.
-- 10 prod-realistic platform change requests (RFCs) across 10 of 12 states
-- (omits standalone implemented + pir — both traversed inside the chg_007 closed
-- flagship) + 3 change classes. These are real platform changes, several of them
-- the permanent fixes raised by W41 problem records (provenance source_wave=W41):
-- the notification-idempotency key, the cron re-stagger, the D1 retry harness,
-- the webhook TLS pin, the VWAP timezone fix. Owner = Open Energy Platform
-- Operations (change-enablement function). Single-party write; actor_party records
-- the ITIL functional party (change_requester / change_authority / implementer).

-- 1) change_requested — emergency_change, OrderBook shard-failover auto-retry hotfix (W41 PRB-0001) — BREACHED
INSERT OR IGNORE INTO oe_change_requests (
  id, change_number,
  source_event, source_entity_type, source_entity_id, source_wave,
  owner_party_id, owner_party_name, service_name, affected_tenant, change_category, change_class, affected_ci_count,
  problem_ref, backout_plan, change_summary,
  chain_status, change_requested_at, sla_deadline_at, created_by
) VALUES (
  'chg_001', 'CHG-2026-0001',
  'problem_management.change_raised', 'problem_record', 'prob_001', 'W41',
  'oe_ops', 'Open Energy Platform Operations', 'Trading — OrderBook matching', null, 'software', 'emergency_change', 3,
  'PRB-2026-0001',
  'Backout: feature-flag the auto-retry off and revert the DO to manual shard failover; no schema change so revert is a single config toggle.',
  'Emergency change raised off PRB-2026-0001: add bounded shard-failover auto-retry to the OrderBook matching DO so peak-trading order rejections self-heal instead of needing a manual failover. Logged as emergency — recurring market-availability impact at evening peak.',
  'change_requested', '2026-05-27 14:00:00', '2026-05-27 15:00:00', 'demo_support_001'
);

-- 2) assessment — normal_change, notification idempotency key (W41 PRB-0006)
INSERT OR IGNORE INTO oe_change_requests (
  id, change_number,
  source_event, source_entity_type, source_entity_id, source_wave,
  owner_party_id, owner_party_name, service_name, affected_tenant, change_category, change_class, affected_ci_count,
  problem_ref, backout_plan, change_summary, assessment_basis,
  chain_status, change_requested_at, assessment_at, sla_deadline_at, created_by
) VALUES (
  'chg_002', 'CHG-2026-0002',
  'problem_management.change_raised', 'problem_record', 'prob_006', 'W41',
  'oe_ops', 'Open Energy Platform Operations', 'Notifications / cascade', null, 'software', 'normal_change', 2,
  'PRB-2026-0006',
  'Backout: the idempotency check is additive and behind a guard; disable the guard to restore prior behaviour with no data migration.',
  'Add a (cascade_id, stage, recipient) idempotency key persisted before send so DLQ replay no longer re-sends duplicate notification emails. Normal change.',
  'Risk/impact assessment underway: low blast radius (notification stage only), no data migration, reversible behind a flag. Assessing the dedup-key store sizing and TTL.',
  'assessment', '2026-05-27 09:00:00', '2026-05-28 06:00:00', '2026-06-05 09:00:00', 'demo_support_001'
);

-- 3) cab_review — normal_change, re-stagger metering vs settlement crons (W41 PRB-0004) — BREACHED
INSERT OR IGNORE INTO oe_change_requests (
  id, change_number,
  source_event, source_entity_type, source_entity_id, source_wave,
  owner_party_id, owner_party_name, service_name, affected_tenant, change_category, change_class, affected_ci_count,
  problem_ref, cab_ref, backout_plan, change_summary, assessment_basis, cab_basis,
  chain_status, change_requested_at, assessment_at, cab_review_at, sla_deadline_at, created_by
) VALUES (
  'chg_003', 'CHG-2026-0003',
  'problem_management.change_raised', 'problem_record', 'prob_004', 'W41',
  'oe_ops', 'Open Energy Platform Operations', 'Cron scheduling — metering / settlement', null, 'configuration', 'normal_change', 4,
  'PRB-2026-0004', 'CAB-2026-0019',
  'Backout: restore the prior wrangler.toml [triggers] cron expressions; pure config revert deployed on next push.',
  'Re-stagger the 5 0 * * * metering/ONA-rollup cron and the 10 0 * * * PPA-settlement cron so the settlement run no longer starts before ingestion drains (removes the D1 contention RCA from PRB-2026-0004). Normal change — touches the settlement schedule so CAB review required.',
  'Assessment: changing settlement timing has downstream impact on the previous-day settlement window; needs CAB sign-off from settlement + finance.',
  'In CAB review: settlement owners want confirmation the later settlement start still completes before the 30 0 margin-call cycle. Pending the timing model.',
  'cab_review', '2026-05-20 09:00:00', '2026-05-21 09:00:00', '2026-05-23 09:00:00', '2026-05-24 09:00:00', 'demo_support_001'
);

-- 4) approved — standard_change, pre-authorised dependency bump
INSERT OR IGNORE INTO oe_change_requests (
  id, change_number,
  owner_party_id, owner_party_name, service_name, affected_tenant, change_category, change_class, affected_ci_count,
  cab_ref, backout_plan, change_summary, assessment_basis, approval_basis,
  chain_status, change_requested_at, assessment_at, approved_at, sla_deadline_at, created_by
) VALUES (
  'chg_004', 'CHG-2026-0004',
  'oe_ops', 'Open Energy Platform Operations', 'Platform — dependencies', null, 'software', 'standard_change', 1,
  'STD-MODEL-007',
  'Backout: pin the dependency back to the prior version in package-lock and redeploy; reproducible build.',
  'Routine patch-level bump of a transitive dependency flagged by the security scanner. Pre-authorised standard change (change model STD-MODEL-007 — low-risk dependency hygiene).',
  'Assessment: patch-level only, no API surface change; covered by the existing standard-change model so auto-approved without full CAB.',
  'Approved under the pre-authorised standard-change model; awaiting scheduling into the next routine deploy.',
  'approved', '2026-05-26 10:00:00', '2026-05-26 11:00:00', '2026-05-26 12:00:00', '2026-06-05 09:00:00', 'demo_support_001'
);

-- 5) scheduled — normal_change, D1 remote-migration retry harness (W41 PRB-0007 / RFC-2026-0042)
INSERT OR IGNORE INTO oe_change_requests (
  id, change_number,
  source_event, source_entity_type, source_entity_id, source_wave,
  owner_party_id, owner_party_name, service_name, affected_tenant, change_category, change_class, affected_ci_count,
  problem_ref, cab_ref, release_ref, backout_plan, change_summary, assessment_basis, cab_basis, approval_basis, schedule_basis,
  scheduled_start_at, scheduled_end_at,
  chain_status, change_requested_at, assessment_at, cab_review_at, approved_at, scheduled_at, sla_deadline_at, created_by
) VALUES (
  'chg_005', 'CHG-2026-0005',
  'problem_management.change_raised', 'problem_record', 'prob_007', 'W41',
  'oe_ops', 'Open Energy Platform Operations', 'CI/CD — D1 remote migrations', null, 'infrastructure', 'normal_change', 2,
  'PRB-2026-0007', 'CAB-2026-0021', 'REL-2026-0033',
  'Backout: revert the deploy-workflow step to the single-shot migration apply; the harness is isolated to the CI workflow file.',
  'Wrap the deploy workflow remote-migration step in a bounded retry-with-backoff harness that re-attempts only the failed migrations and treats D1 7500 as retryable (PRB-2026-0007 / RFC-2026-0042). Normal change.',
  'Assessment: CI-workflow-only change; no runtime / data impact. Risk = a retry masking a genuine migration error — mitigated by capping attempts and surfacing the final failure.',
  'CAB approved: retry cap of 3 with exponential backoff; final failure still fails the deploy loudly.',
  'Authorised for the next low-traffic deploy window.',
  'Scheduled into the Saturday 02:00–03:00 SAST maintenance window (low trading activity).',
  '2026-05-30 00:00:00', '2026-05-30 01:00:00',
  'scheduled', '2026-05-18 09:00:00', '2026-05-19 09:00:00', '2026-05-21 09:00:00', '2026-05-22 09:00:00', '2026-05-24 09:00:00', '2026-06-05 09:00:00', 'demo_support_001'
);

-- 6) implementing — emergency_change, Cache-Control no-store on /* (ECAB fast-path) — crosses regulator, BREACHED
INSERT OR IGNORE INTO oe_change_requests (
  id, change_number,
  source_event, source_entity_type, source_entity_id, source_wave,
  owner_party_id, owner_party_name, service_name, affected_tenant, change_category, change_class, affected_ci_count,
  problem_ref, cab_ref, release_ref, regulator_ref, is_reportable, backout_plan,
  change_summary, assessment_basis, approval_basis, schedule_basis, implementation_basis,
  scheduled_start_at, scheduled_end_at,
  chain_status, change_requested_at, assessment_at, approved_at, scheduled_at, implementing_at, sla_deadline_at, created_by
) VALUES (
  'chg_006', 'CHG-2026-0006',
  'problem_management.change_raised', 'problem_record', 'prob_002', 'W41',
  'oe_ops', 'Open Energy Platform Operations', 'Web SPA delivery / edge cache', null, 'configuration', 'emergency_change', 5,
  'PRB-2026-0002', 'ECAB-2026-0004', 'REL-2026-0035', 'NERSA-NOTIFY-2026-0041', 1,
  'Backout: restore the prior _headers Cache-Control on /* and purge the CDN cache; single config revert.',
  'Emergency change: set Cache-Control no-store on /* (and purge the edge cache) so repeat visitors stop getting a stale SPA shell after a bad deploy left the trading desk on an old bundle. Restoring access to a live market service.',
  'Assessment (ECAB, expedited): edge-cache header change only; risk = marginally higher origin fetch volume, acceptable. Escalated to emergency because the desk could not see live order state.',
  'EMERGENCY-APPROVED via ECAB fast-path (bypassed full CAB). ECAB-2026-0004. Regulator notified of the governance bypass on a regulated market service (NERSA-NOTIFY-2026-0041).',
  'Deploying immediately under the emergency change authority.',
  'Implementation in progress: new _headers shipped; CDN purge running across PoPs; verifying repeat-visitor fetch on the trading workstation.',
  '2026-05-28 07:00:00', '2026-05-28 07:30:00',
  'implementing', '2026-05-28 06:30:00', '2026-05-28 06:45:00', '2026-05-28 07:00:00', '2026-05-28 07:10:00', '2026-05-28 07:30:00', '2026-05-28 11:30:00', 'demo_support_001'
);

-- 7) closed — normal_change, FULL happy arc: webhook TLS 1.2+ cipher pin (W41 PRB-0009 / RFC-2026-0031) — traverses implemented + pir
INSERT OR IGNORE INTO oe_change_requests (
  id, change_number,
  source_event, source_entity_type, source_entity_id, source_wave,
  owner_party_id, owner_party_name, service_name, affected_tenant, change_category, change_class, affected_ci_count,
  problem_ref, cab_ref, release_ref, backout_plan,
  change_summary, assessment_basis, cab_basis, approval_basis, schedule_basis, implementation_basis, verification_basis, reason_code, closure_notes,
  scheduled_start_at, scheduled_end_at,
  chain_status, change_requested_at, assessment_at, cab_review_at, approved_at, scheduled_at, implementing_at, implemented_at, pir_at, closed_at, created_by
) VALUES (
  'chg_007', 'CHG-2026-0007',
  'problem_management.change_raised', 'problem_record', 'prob_009', 'W41',
  'oe_ops', 'Open Energy Platform Operations', 'Webhooks — outbound delivery', 'lender_absa', 'infrastructure', 'normal_change', 2,
  'PRB-2026-0009', 'CAB-2026-0012', 'REL-2026-0028',
  'Backout: revert the dispatcher to the default TLS profile and re-enable the manual re-notify workaround.',
  'Pin the webhook dispatcher to TLS 1.2+ with the lender-supported cipher set and add a per-endpoint TLS profile, eliminating the recurring handshake failures to the lender drawdown system (PRB-2026-0009 / RFC-2026-0031). Normal change.',
  'Assessment: per-endpoint TLS profile is additive; existing endpoints keep defaults. Risk = a mis-set cipher list breaking one endpoint — mitigated by per-endpoint scoping + a canary delivery.',
  'CAB approved at the weekly board; canary delivery required before full rollout.',
  'Authorised after a successful canary to the lender sandbox endpoint.',
  'Scheduled into the Tuesday change window; lender notified of the delivery-profile change.',
  'Deployed the per-endpoint TLS 1.2+ profile to the dispatcher; canary to the lender endpoint succeeded.',
  'PIR: 14 consecutive scheduled deliveries succeeded with zero handshake failures over a two-week observation window; the linked PRB-2026-0009 incidents stopped recurring. No adverse side effects on other endpoints.',
  'implemented_successfully_verified',
  'CLOSED — full ITIL change arc: requested → assessment → CAB → approved → scheduled → implementing → implemented → PIR → closed. Permanent fix verified; PRB-2026-0009 closed in parallel.',
  '2026-04-14 20:00:00', '2026-04-14 21:00:00',
  'closed', '2026-04-08 09:00:00', '2026-04-09 09:00:00', '2026-04-10 09:00:00', '2026-04-11 09:00:00', '2026-04-12 09:00:00', '2026-04-14 20:00:00', '2026-04-14 21:30:00', '2026-04-28 09:00:00', '2026-05-02 09:00:00', 'demo_support_001'
);

-- 8) rejected — standard_change, request to disable the login rate limiter (W41 PRB-0008 working-as-designed) — CAB declined
INSERT OR IGNORE INTO oe_change_requests (
  id, change_number,
  source_event, source_entity_type, source_entity_id, source_wave,
  owner_party_id, owner_party_name, service_name, affected_tenant, change_category, change_class, affected_ci_count,
  problem_ref, cab_ref, backout_plan, change_summary, assessment_basis, cab_basis, reason_code, closure_notes,
  chain_status, change_requested_at, assessment_at, cab_review_at, rejected_at, created_by
) VALUES (
  'chg_008', 'CHG-2026-0008',
  'problem_management.cancelled', 'problem_record', 'prob_008', 'W41',
  'oe_ops', 'Open Energy Platform Operations', 'Auth — login rate limiter', null, 'security', 'standard_change', 1,
  'PRB-2026-0008', 'CAB-2026-0020',
  'N/A — change rejected, nothing deployed.',
  'Request to relax/disable the 10/5min/IP login rate limiter to reduce CI 429s. Submitted as a standard change.',
  'Assessment flagged the limiter as a POPIA/abuse control on /api/auth/login, not a defect (per PRB-2026-0008 working-as-designed).',
  'CAB REJECTED: weakening an authentication abuse control fails the security baseline. Correct fix is a test-harness change (use the login_or_cached token cache), not a platform change. Redirected to the test owners.',
  'rejected_security_baseline',
  'REJECTED at CAB — would weaken a POPIA/abuse control; no platform change warranted.',
  'rejected', '2026-05-19 09:00:00', '2026-05-19 12:00:00', '2026-05-20 09:00:00', '2026-05-20 14:00:00', 'demo_support_001'
);

-- 9) rolled_back — emergency_change, FULL backout arc: VWAP timezone fix regressed (W41 PRB-0005) — crosses regulator
INSERT OR IGNORE INTO oe_change_requests (
  id, change_number,
  source_event, source_entity_type, source_entity_id, source_wave,
  owner_party_id, owner_party_name, service_name, affected_tenant, change_category, change_class, affected_ci_count,
  problem_ref, cab_ref, release_ref, rollback_ref, regulator_ref, is_reportable, backout_plan,
  change_summary, assessment_basis, approval_basis, schedule_basis, implementation_basis, rollback_basis, reason_code, closure_notes,
  scheduled_start_at, scheduled_end_at,
  chain_status, change_requested_at, assessment_at, approved_at, scheduled_at, implementing_at, implemented_at, rolled_back_at, created_by
) VALUES (
  'chg_009', 'CHG-2026-0009',
  'problem_management.change_raised', 'problem_record', 'prob_005', 'W41',
  'oe_ops', 'Open Energy Platform Operations', 'Risk — VWAP marks', null, 'software', 'emergency_change', 6,
  'PRB-2026-0005', 'ECAB-2026-0003', 'REL-2026-0030', 'BACKOUT-2026-0006', 'NERSA-NOTIFY-2026-0038', 1,
  'Backout: redeploy the prior mark-freshness build and re-enable the manual 00:05 SAST VWAP refresh workaround; documented and rehearsed before the window.',
  'Emergency change to fix the VWAP mark-freshness check at the SAST/UTC day boundary so margin calls stop misfiring on stale marks (PRB-2026-0005). ECAB fast-tracked — money-affecting.',
  'Assessment (ECAB): isolated to the mark-age guard; risk = a timezone edge regressing other marks — accepted under emergency given the active margin-call exposure.',
  'EMERGENCY-APPROVED via ECAB fast-path (bypassed full CAB). ECAB-2026-0003.',
  'Deployed immediately into the hourly VWAP cron.',
  'Deployed the boundary-aware freshness check; published the next hourly marks.',
  'BACKED OUT: the fix over-corrected — marks for two non-SAST delivery zones were wrongly judged stale and republished mid-session, a worse regression than the original. Executed the documented backout (BACKOUT-2026-0006), restored the prior build + manual-refresh workaround. Change-induced incident — regulator notified (market-affecting marks; NERSA-NOTIFY-2026-0038). Re-engineering under the original PRB-2026-0005.',
  'change_induced_regression_backed_out',
  'ROLLED BACK — emergency fix regressed mark freshness for two zones; backed out cleanly; PRB-2026-0005 reopened for a corrected fix.',
  '2026-05-09 00:00:00', '2026-05-09 01:00:00',
  'rolled_back', '2026-05-08 22:00:00', '2026-05-08 22:30:00', '2026-05-08 23:00:00', '2026-05-08 23:15:00', '2026-05-09 00:00:00', '2026-05-09 00:30:00', '2026-05-09 02:00:00', 'demo_support_001'
);

-- 10) cancelled — standard_change, logging-verbosity flag bump, superseded
INSERT OR IGNORE INTO oe_change_requests (
  id, change_number,
  owner_party_id, owner_party_name, service_name, affected_tenant, change_category, change_class, affected_ci_count,
  cab_ref, backout_plan, change_summary, assessment_basis, reason_code, closure_notes,
  chain_status, change_requested_at, assessment_at, cancelled_at, created_by
) VALUES (
  'chg_010', 'CHG-2026-0010',
  'oe_ops', 'Open Energy Platform Operations', 'Observability — log verbosity', null, 'configuration', 'standard_change', 1,
  'STD-MODEL-002',
  'N/A — change cancelled before implementation.',
  'Bump the cascade log verbosity to debug for a week to aid an investigation. Standard change.',
  'Assessment: trivial config flag. While assessing, the investigation it supported was folded into a broader observability config bundle.',
  'superseded_by_bundle',
  'CANCELLED — superseded by the observability config bundle (CHG to follow); standalone flag bump no longer needed.',
  'cancelled', '2026-05-21 09:00:00', '2026-05-21 11:00:00', '2026-05-22 09:00:00', 'demo_support_001'
);

-- ─── EVENTS ────────────────────────────────────────────────────────────────

-- chg_001 (change_requested)
INSERT OR IGNORE INTO oe_change_requests_events (id, change_id, event_type, from_status, to_status, actor_id, actor_party, notes, created_at) VALUES
('chgv_001_a', 'chg_001', 'change_enablement.change_requested', null, 'change_requested', 'oe_ops', 'change_requester', 'Emergency RFC raised off PRB-2026-0001 (peak-trading rejections)', '2026-05-27 14:00:00');

-- chg_002 (assessment)
INSERT OR IGNORE INTO oe_change_requests_events (id, change_id, event_type, from_status, to_status, actor_id, actor_party, notes, created_at) VALUES
('chgv_002_a', 'chg_002', 'change_enablement.change_requested', null, 'change_requested', 'oe_ops', 'change_requester', 'RFC raised off PRB-2026-0006 (duplicate notification emails)', '2026-05-27 09:00:00'),
('chgv_002_b', 'chg_002', 'change_enablement.assessment', 'change_requested', 'assessment', 'oe_ops', 'change_requester', 'Risk/impact assessment underway — low blast radius, reversible', '2026-05-28 06:00:00');

-- chg_003 (cab_review)
INSERT OR IGNORE INTO oe_change_requests_events (id, change_id, event_type, from_status, to_status, actor_id, actor_party, notes, created_at) VALUES
('chgv_003_a', 'chg_003', 'change_enablement.change_requested', null, 'change_requested', 'oe_ops', 'change_requester', 'RFC raised off PRB-2026-0004 (cron contention)', '2026-05-20 09:00:00'),
('chgv_003_b', 'chg_003', 'change_enablement.assessment', 'change_requested', 'assessment', 'oe_ops', 'change_requester', 'Assessed: settlement-timing impact — CAB required', '2026-05-21 09:00:00'),
('chgv_003_c', 'chg_003', 'change_enablement.cab_review', 'assessment', 'cab_review', 'oe_ops', 'change_requester', 'Submitted to CAB-2026-0019 for settlement sign-off', '2026-05-23 09:00:00');

-- chg_004 (approved — standard)
INSERT OR IGNORE INTO oe_change_requests_events (id, change_id, event_type, from_status, to_status, actor_id, actor_party, notes, created_at) VALUES
('chgv_004_a', 'chg_004', 'change_enablement.change_requested', null, 'change_requested', 'oe_ops', 'change_requester', 'Standard-change RFC raised — security-scanner dependency bump', '2026-05-26 10:00:00'),
('chgv_004_b', 'chg_004', 'change_enablement.assessment', 'change_requested', 'assessment', 'oe_ops', 'change_requester', 'Assessed under standard-change model STD-MODEL-007', '2026-05-26 11:00:00'),
('chgv_004_c', 'chg_004', 'change_enablement.approved', 'assessment', 'approved', 'oe_ops', 'change_authority', 'Pre-authorised standard change — approved, awaiting scheduling', '2026-05-26 12:00:00');

-- chg_005 (scheduled)
INSERT OR IGNORE INTO oe_change_requests_events (id, change_id, event_type, from_status, to_status, actor_id, actor_party, notes, created_at) VALUES
('chgv_005_a', 'chg_005', 'change_enablement.change_requested', null, 'change_requested', 'oe_ops', 'change_requester', 'RFC-2026-0042 raised off PRB-2026-0007 (D1 7500 deploy flakes)', '2026-05-18 09:00:00'),
('chgv_005_b', 'chg_005', 'change_enablement.assessment', 'change_requested', 'assessment', 'oe_ops', 'change_requester', 'Assessed: CI-workflow-only, no runtime impact', '2026-05-19 09:00:00'),
('chgv_005_c', 'chg_005', 'change_enablement.cab_review', 'assessment', 'cab_review', 'oe_ops', 'change_requester', 'Submitted to CAB-2026-0021', '2026-05-21 09:00:00'),
('chgv_005_d', 'chg_005', 'change_enablement.approved', 'cab_review', 'approved', 'oe_ops', 'change_authority', 'CAB approved — retry cap 3 + backoff', '2026-05-22 09:00:00'),
('chgv_005_e', 'chg_005', 'change_enablement.scheduled', 'approved', 'scheduled', 'oe_ops', 'implementer', 'Scheduled into Sat 02:00–03:00 SAST window', '2026-05-24 09:00:00');

-- chg_006 (implementing — emergency, ECAB fast-path, crosses regulator)
INSERT OR IGNORE INTO oe_change_requests_events (id, change_id, event_type, from_status, to_status, actor_id, actor_party, notes, created_at) VALUES
('chgv_006_a', 'chg_006', 'change_enablement.change_requested', null, 'change_requested', 'oe_ops', 'change_requester', 'Emergency RFC raised — stale SPA shell blocking the trading desk', '2026-05-28 06:30:00'),
('chgv_006_b', 'chg_006', 'change_enablement.assessment', 'change_requested', 'assessment', 'oe_ops', 'change_requester', 'ECAB expedited assessment — edge-cache header only', '2026-05-28 06:45:00'),
('chgv_006_c', 'chg_006', 'change_enablement.approved', 'assessment', 'approved', 'oe_ops', 'change_authority', 'EMERGENCY-APPROVED via ECAB-2026-0004 (bypassed full CAB). Regulator notified of bypass on a market service.', '2026-05-28 07:00:00'),
('chgv_006_d', 'chg_006', 'change_enablement.scheduled', 'approved', 'scheduled', 'oe_ops', 'implementer', 'Scheduled for immediate deploy', '2026-05-28 07:10:00'),
('chgv_006_e', 'chg_006', 'change_enablement.implementing', 'scheduled', 'implementing', 'oe_ops', 'implementer', 'Shipping _headers no-store + CDN purge', '2026-05-28 07:30:00');

-- chg_007 (closed — FULL happy arc, traverses implemented + pir)
INSERT OR IGNORE INTO oe_change_requests_events (id, change_id, event_type, from_status, to_status, actor_id, actor_party, notes, created_at) VALUES
('chgv_007_a', 'chg_007', 'change_enablement.change_requested', null, 'change_requested', 'oe_ops', 'change_requester', 'RFC-2026-0031 raised off PRB-2026-0009 (webhook TLS failures)', '2026-04-08 09:00:00'),
('chgv_007_b', 'chg_007', 'change_enablement.assessment', 'change_requested', 'assessment', 'oe_ops', 'change_requester', 'Assessed: per-endpoint TLS profile, additive + canary-gated', '2026-04-09 09:00:00'),
('chgv_007_c', 'chg_007', 'change_enablement.cab_review', 'assessment', 'cab_review', 'oe_ops', 'change_requester', 'Submitted to CAB-2026-0012', '2026-04-10 09:00:00'),
('chgv_007_d', 'chg_007', 'change_enablement.approved', 'cab_review', 'approved', 'oe_ops', 'change_authority', 'CAB approved after a successful sandbox canary', '2026-04-11 09:00:00'),
('chgv_007_e', 'chg_007', 'change_enablement.scheduled', 'approved', 'scheduled', 'oe_ops', 'implementer', 'Scheduled into the Tuesday change window', '2026-04-12 09:00:00'),
('chgv_007_f', 'chg_007', 'change_enablement.implementing', 'scheduled', 'implementing', 'oe_ops', 'implementer', 'Deploying the per-endpoint TLS 1.2+ profile', '2026-04-14 20:00:00'),
('chgv_007_g', 'chg_007', 'change_enablement.implemented', 'implementing', 'implemented', 'oe_ops', 'implementer', 'Deployed; canary to the lender endpoint succeeded', '2026-04-14 21:30:00'),
('chgv_007_h', 'chg_007', 'change_enablement.pir', 'implemented', 'pir', 'oe_ops', 'change_authority', 'PIR opened — observing scheduled deliveries', '2026-04-28 09:00:00'),
('chgv_007_i', 'chg_007', 'change_enablement.closed', 'pir', 'closed', 'oe_ops', 'change_authority', 'CLOSED — 14 clean deliveries, no recurrence; PRB-2026-0009 closed in parallel', '2026-05-02 09:00:00');

-- chg_008 (rejected)
INSERT OR IGNORE INTO oe_change_requests_events (id, change_id, event_type, from_status, to_status, actor_id, actor_party, notes, created_at) VALUES
('chgv_008_a', 'chg_008', 'change_enablement.change_requested', null, 'change_requested', 'oe_ops', 'change_requester', 'RFC to relax the login rate limiter (CI 429s)', '2026-05-19 09:00:00'),
('chgv_008_b', 'chg_008', 'change_enablement.assessment', 'change_requested', 'assessment', 'oe_ops', 'change_requester', 'Assessed: limiter is a POPIA/abuse control, not a defect (PRB-2026-0008)', '2026-05-19 12:00:00'),
('chgv_008_c', 'chg_008', 'change_enablement.cab_review', 'assessment', 'cab_review', 'oe_ops', 'change_requester', 'Submitted to CAB-2026-0020', '2026-05-20 09:00:00'),
('chgv_008_d', 'chg_008', 'change_enablement.rejected', 'cab_review', 'rejected', 'oe_ops', 'change_authority', 'REJECTED — weakening an auth abuse control fails the security baseline; redirected to test owners', '2026-05-20 14:00:00');

-- chg_009 (rolled_back — FULL backout arc, ECAB + crosses regulator)
INSERT OR IGNORE INTO oe_change_requests_events (id, change_id, event_type, from_status, to_status, actor_id, actor_party, notes, created_at) VALUES
('chgv_009_a', 'chg_009', 'change_enablement.change_requested', null, 'change_requested', 'oe_ops', 'change_requester', 'Emergency RFC raised off PRB-2026-0005 (stale VWAP marks)', '2026-05-08 22:00:00'),
('chgv_009_b', 'chg_009', 'change_enablement.assessment', 'change_requested', 'assessment', 'oe_ops', 'change_requester', 'ECAB expedited assessment — isolated to the mark-age guard', '2026-05-08 22:30:00'),
('chgv_009_c', 'chg_009', 'change_enablement.approved', 'assessment', 'approved', 'oe_ops', 'change_authority', 'EMERGENCY-APPROVED via ECAB-2026-0003 (bypassed full CAB)', '2026-05-08 23:00:00'),
('chgv_009_d', 'chg_009', 'change_enablement.scheduled', 'approved', 'scheduled', 'oe_ops', 'implementer', 'Scheduled for immediate deploy', '2026-05-08 23:15:00'),
('chgv_009_e', 'chg_009', 'change_enablement.implementing', 'scheduled', 'implementing', 'oe_ops', 'implementer', 'Deploying the boundary-aware freshness check', '2026-05-09 00:00:00'),
('chgv_009_f', 'chg_009', 'change_enablement.implemented', 'implementing', 'implemented', 'oe_ops', 'implementer', 'Deployed; next hourly marks published', '2026-05-09 00:30:00'),
('chgv_009_g', 'chg_009', 'change_enablement.rolled_back', 'implemented', 'rolled_back', 'oe_ops', 'implementer', 'BACKED OUT (BACKOUT-2026-0006) — over-corrected two zones mid-session; regulator notified (NERSA-NOTIFY-2026-0038)', '2026-05-09 02:00:00');

-- chg_010 (cancelled)
INSERT OR IGNORE INTO oe_change_requests_events (id, change_id, event_type, from_status, to_status, actor_id, actor_party, notes, created_at) VALUES
('chgv_010_a', 'chg_010', 'change_enablement.change_requested', null, 'change_requested', 'oe_ops', 'change_requester', 'Standard-change RFC — bump cascade log verbosity', '2026-05-21 09:00:00'),
('chgv_010_b', 'chg_010', 'change_enablement.assessment', 'change_requested', 'assessment', 'oe_ops', 'change_requester', 'Assessed: trivial flag', '2026-05-21 11:00:00'),
('chgv_010_c', 'chg_010', 'change_enablement.cancelled', 'assessment', 'cancelled', 'oe_ops', 'change_requester', 'CANCELLED — superseded by the observability config bundle', '2026-05-22 09:00:00');
