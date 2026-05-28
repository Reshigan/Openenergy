-- Wave 41 — OEM-Support ITIL Problem Management seed data.
-- 10 prod-realistic platform problem records across 10 of 12 states (omits
-- standalone fix_deployed + resolution_verified — both traversed inside the
-- prob_009 closed flagship) + 3 priority tiers. These are real platform IT/OT
-- problems: recurring trading rejections, the CF edge-cache SPA-shell defect,
-- D1-7500 deploy flakes, webhook TLS failures, settlement-integrity drift.
-- Owner = Open Energy Platform Operations (problem-management function).
-- Single-party write; actor_party records the ITIL functional party
-- (problem_manager / resolver / change_mgmt). Cross-wave provenance: clusters
-- of W14 support tickets + a W3 settlement integrity signal spawn problems.

-- 1) problem_logged — major_problem, recurring peak-trading order rejections (W14 cluster)
INSERT OR IGNORE INTO oe_problem_records (
  id, problem_number,
  source_event, source_entity_type, source_entity_id, source_wave,
  owner_party_id, owner_party_name, service_name, affected_tenant, problem_category, problem_priority, recurring_incident_count,
  problem_summary,
  chain_status, problem_logged_at, sla_deadline_at, created_by
) VALUES (
  'prob_001', 'PRB-2026-0001',
  'support_ticket.escalated', 'support_ticket', 'tkt_cluster_peak', 'W14',
  'oe_ops', 'Open Energy Platform Operations', 'Trading — OrderBook matching', null, 'infrastructure', 'major_problem', 9,
  'Problem logged from a cluster of 9 P1 incidents over two weeks: order rejections spike to ~6% during the 17:00–19:00 evening peak, concentrated on the energy_type=peak shards. Individual incidents were each restored by a shard failover, but the underlying cause is unaddressed — opened as a major problem.',
  'problem_logged', '2026-05-26 07:30:00', '2026-05-26 09:30:00', 'demo_support_001'
);

-- 2) categorized — significant, repeat-visitor SPA blank screen (edge-cache shell)
INSERT OR IGNORE INTO oe_problem_records (
  id, problem_number,
  owner_party_id, owner_party_name, service_name, affected_tenant, problem_category, problem_priority, recurring_incident_count,
  problem_summary,
  chain_status, problem_logged_at, categorized_at, sla_deadline_at, created_by
) VALUES (
  'prob_002', 'PRB-2026-0002',
  'oe_ops', 'Open Energy Platform Operations', 'Web SPA delivery', null, 'infrastructure', 'significant', 5,
  'Repeat visitors intermittently see a blank screen / stale build after a deploy until a hard refresh. Categorised as a CDN edge-caching problem on the SPA shell (Cache-Control on /* too permissive). Affects multiple roles; not service-critical (workaround = hard refresh) so significant, not major.',
  'categorized', '2026-05-22 10:00:00', '2026-05-23 09:00:00', '2026-05-24 09:00:00', 'demo_support_001'
);

-- 3) investigating — minor, slow settlement-statement PDF export
INSERT OR IGNORE INTO oe_problem_records (
  id, problem_number,
  owner_party_id, owner_party_name, service_name, affected_tenant, problem_category, problem_priority, recurring_incident_count,
  problem_summary, investigation_basis,
  chain_status, problem_logged_at, categorized_at, investigating_at, sla_deadline_at, created_by
) VALUES (
  'prob_003', 'PRB-2026-0003',
  'oe_ops', 'Open Energy Platform Operations', 'Settlement reporting', 'offtaker_acme', 'data', 'minor', 4,
  'Settlement-statement PDF export occasionally takes 25–40s for large multi-PPA offtakers, with sporadic timeouts. Low impact (statements still generate on retry) — minor priority.',
  'Investigating: profiling the statement renderer. Early signal points to N+1 queries over the per-interval metering rows when an offtaker has many active PPAs; correlating slow exports with PPA count.',
  'investigating', '2026-05-15 11:00:00', '2026-05-16 09:00:00', '2026-05-18 09:00:00', '2026-06-01 09:00:00', 'demo_support_001'
);

-- 4) rca_identified — significant, midnight metering-ingestion lag (cron contention)
INSERT OR IGNORE INTO oe_problem_records (
  id, problem_number,
  source_event, source_entity_type, source_entity_id, source_wave,
  owner_party_id, owner_party_name, service_name, affected_tenant, problem_category, problem_priority, recurring_incident_count,
  problem_summary, investigation_basis, rca_basis,
  chain_status, problem_logged_at, categorized_at, investigating_at, rca_identified_at, sla_deadline_at, created_by
) VALUES (
  'prob_004', 'PRB-2026-0004',
  'support_ticket.escalated', 'support_ticket', 'tkt_cluster_meter', 'W14',
  'oe_ops', 'Open Energy Platform Operations', 'Metering ingestion', null, 'integration', 'significant', 6,
  'Esums site telemetry rollups are delayed past the 00:05 metering cron on heavy nights, pushing ONA rollups and settlement prep late. Recurring across month-ends.',
  'Investigated cron execution windows and D1 contention during the 00:00–00:10 band.',
  'Root cause identified: the 5 0 * * * metering/ONA-rollup cron and the 10 0 * * * PPA-settlement cron overlap on heavy nights and contend on the same D1 reads, serialising behind advisory locks. The settlement run starts before ingestion drains. RCA logged.',
  'rca_identified', '2026-05-10 08:00:00', '2026-05-11 09:00:00', '2026-05-13 09:00:00', '2026-05-19 09:00:00', '2026-05-21 09:00:00', 'demo_support_001'
);

-- 5) known_error — major_problem, stale VWAP marks at DST/timezone edge (with workaround)
INSERT OR IGNORE INTO oe_problem_records (
  id, problem_number,
  owner_party_id, owner_party_name, service_name, affected_tenant, problem_category, problem_priority, recurring_incident_count,
  problem_summary, investigation_basis, rca_basis, known_error_basis, workaround, known_error_ref,
  chain_status, problem_logged_at, categorized_at, investigating_at, rca_identified_at, known_error_at, sla_deadline_at, created_by
) VALUES (
  'prob_005', 'PRB-2026-0005',
  'oe_ops', 'Open Energy Platform Operations', 'Risk — VWAP marks', null, 'software', 'major_problem', 7,
  'On the hourly VWAP mark-price cron, marks occasionally publish stale at the local-midnight / SAST boundary, which can misfire margin calls in the 30 0 * * * cycle. Trader-facing and money-affecting — major problem.',
  'Reproduced the staleness at the day boundary; isolated to the mark-age guard reading a UTC timestamp against a local trading-day window.',
  'Root cause: the mark freshness check compares a UTC mark timestamp to a SAST-derived trading-day cutoff; at the boundary the mark is wrongly judged fresh and the prior day''s VWAP is reused.',
  'Logged to the Known Error Database with a documented workaround pending the permanent fix.',
  'Workaround: ops trigger a manual VWAP refresh via the admin cron-run endpoint at 00:05 SAST on affected days; pre-trade mark-age guard then revalidates before the margin cycle.',
  'KEDB-2026-0005',
  'known_error', '2026-05-02 08:00:00', '2026-05-03 09:00:00', '2026-05-05 09:00:00', '2026-05-08 09:00:00', '2026-05-12 09:00:00', '2026-05-13 09:00:00', 'demo_support_001'
);

-- 6) fix_proposed — significant, duplicate notification emails on cascade DLQ replay
INSERT OR IGNORE INTO oe_problem_records (
  id, problem_number,
  owner_party_id, owner_party_name, service_name, affected_tenant, problem_category, problem_priority, recurring_incident_count,
  problem_summary, rca_basis, known_error_basis, fix_basis, workaround, known_error_ref,
  chain_status, problem_logged_at, categorized_at, investigating_at, rca_identified_at, known_error_at, fix_proposed_at, sla_deadline_at, created_by
) VALUES (
  'prob_006', 'PRB-2026-0006',
  'oe_ops', 'Open Energy Platform Operations', 'Notifications / cascade', null, 'software', 'significant', 8,
  'Users intermittently receive duplicate notification emails (covenant reminders, SLA-breach alerts). Recurring whenever a cascade stage retries off the DLQ.',
  'Root cause: the notification cascade stage is not idempotent on DLQ replay — a retried stage re-sends without checking a delivery-dedup key.',
  'Known error logged: duplicate sends bounded to retry events; no data loss, cosmetic + trust impact.',
  'Fix proposed: add a (cascade_id, stage, recipient) idempotency key persisted before send; DLQ replay short-circuits if the key already recorded a successful delivery. Proposal under review before raising the change.',
  'Workaround: ops suppress the DLQ replay for the notification stage during incident windows.',
  'KEDB-2026-0006',
  'fix_proposed', '2026-04-22 08:00:00', '2026-04-23 09:00:00', '2026-04-26 09:00:00', '2026-04-30 09:00:00', '2026-05-03 09:00:00', '2026-05-07 09:00:00', '2026-05-10 09:00:00', 'demo_support_001'
);

-- 7) change_raised — major_problem, D1-7500 transient deploy-migration flakes (RFC raised)
INSERT OR IGNORE INTO oe_problem_records (
  id, problem_number,
  owner_party_id, owner_party_name, service_name, affected_tenant, problem_category, problem_priority, recurring_incident_count,
  problem_summary, rca_basis, known_error_basis, fix_basis, change_basis, workaround, known_error_ref, change_request_ref,
  chain_status, problem_logged_at, categorized_at, investigating_at, rca_identified_at, known_error_at, fix_proposed_at, change_raised_at, sla_deadline_at, created_by
) VALUES (
  'prob_007', 'PRB-2026-0007',
  'oe_ops', 'Open Energy Platform Operations', 'CI/CD — D1 remote migrations', null, 'infrastructure', 'major_problem', 11,
  'Deploys intermittently fail at the "Apply D1 migrations (remote)" step with a Cloudflare D1 API internal error (code 7500), blocking releases until a manual re-run. Recurring across many deploys — major problem (release pipeline reliability).',
  'Root cause: the remote-migration step issues large single-shot imports against the D1 API; transient 7500 internal errors are not retried, so a benign API blip fails the whole deploy job.',
  'Known error: 7500 is retry-class and clears on re-run of the failed job; build job is unaffected.',
  'Fix proposed: wrap the remote-migration step in a bounded retry-with-backoff harness that re-attempts only the failed migrations, treating 7500 as retryable.',
  'Change request raised into change management to land the retry harness in the deploy workflow; awaiting deploy-window scheduling.',
  'Workaround: re-run the failed job (gh run rerun <id> --failed); build artifacts are reused.',
  'KEDB-2026-0007', 'RFC-2026-0042',
  'change_raised', '2026-04-10 08:00:00', '2026-04-11 09:00:00', '2026-04-13 09:00:00', '2026-04-16 09:00:00', '2026-04-19 09:00:00', '2026-04-23 09:00:00', '2026-04-28 09:00:00', '2026-05-01 09:00:00', 'demo_support_001'
);

-- 8) cancelled — minor, "login rate-limit too aggressive" (working as designed — terminal)
INSERT OR IGNORE INTO oe_problem_records (
  id, problem_number,
  owner_party_id, owner_party_name, service_name, affected_tenant, problem_category, problem_priority, recurring_incident_count,
  problem_summary, investigation_basis, reason_code, closure_notes,
  chain_status, problem_logged_at, categorized_at, investigating_at, cancelled_at, created_by
) VALUES (
  'prob_008', 'PRB-2026-0008',
  'oe_ops', 'Open Energy Platform Operations', 'Auth — login rate limiter', null, 'process', 'minor', 3,
  'Logged after repeated CI reports of "login rate-limit too aggressive" (HTTP 429 on the auth endpoint during test runs).',
  'Investigated the 10/5min/IP sensitive-route limiter against the reported 429s.',
  'not_a_problem_working_as_designed',
  'CANCELLED: the limiter is working as designed — a POPIA/abuse control on /api/auth/login. The 429s came from test scripts not using the token cache (login_or_cached). Correct disposition is a test-harness change, not a platform problem. Cancelled and redirected to the test owners.',
  'cancelled', '2026-05-18 09:00:00', '2026-05-18 12:00:00', '2026-05-19 09:00:00', '2026-05-20 09:00:00', 'demo_support_001'
);

-- 9) closed — significant, FULL happy path: webhook TLS failures (traverses fix_deployed + resolution_verified)
INSERT OR IGNORE INTO oe_problem_records (
  id, problem_number,
  owner_party_id, owner_party_name, service_name, affected_tenant, problem_category, problem_priority, recurring_incident_count,
  problem_summary, rca_basis, known_error_basis, fix_basis, change_basis, verification_basis, reason_code, closure_notes,
  known_error_ref, change_request_ref,
  chain_status, problem_logged_at, categorized_at, investigating_at, rca_identified_at, known_error_at, fix_proposed_at, change_raised_at, fix_deployed_at, resolution_verified_at, closed_at, created_by
) VALUES (
  'prob_009', 'PRB-2026-0009',
  'oe_ops', 'Open Energy Platform Operations', 'Webhooks — outbound delivery', 'lender_absa', 'integration', 'significant', 7,
  'Outbound webhook deliveries to a lender''s drawdown system recurrently failed (TLS handshake errors), forcing manual covenant/drawdown re-notifications. Recurring weekly.',
  'Root cause: the lender endpoint required TLS 1.2+ with a modern cipher suite; the webhook dispatcher negotiated an older cipher that the lender''s WAF began rejecting after their upgrade.',
  'Known error logged with a manual re-notify workaround.',
  'Fix proposed: pin the dispatcher to TLS 1.2+ with the lender-supported cipher set and add a per-endpoint TLS profile.',
  'Change RFC-2026-0031 raised and approved in the weekly CAB.',
  'Verified: 14 consecutive scheduled deliveries succeeded post-deploy with zero handshake failures; the linked incidents stopped recurring over a two-week observation window.',
  'permanently_resolved_verified',
  'CLOSED — full ITIL arc: logged → categorized → investigating → RCA → known error → fix proposed → change raised → fix DEPLOYED → resolution VERIFIED → closed. Permanent fix eliminated the recurring TLS failures; no recurrence in the observation window.',
  'KEDB-2026-0009', 'RFC-2026-0031',
  'closed', '2026-03-01 08:00:00', '2026-03-02 09:00:00', '2026-03-04 09:00:00', '2026-03-08 09:00:00', '2026-03-11 09:00:00', '2026-03-14 09:00:00', '2026-03-18 09:00:00', '2026-03-24 09:00:00', '2026-04-08 09:00:00', '2026-04-12 09:00:00', 'demo_support_001'
);

-- 10) escalated — major_problem, settlement-integrity drift (crosses regulator — market integrity)
INSERT OR IGNORE INTO oe_problem_records (
  id, problem_number,
  source_event, source_entity_type, source_entity_id, source_wave,
  owner_party_id, owner_party_name, service_name, affected_tenant, problem_category, problem_priority, recurring_incident_count,
  problem_summary, investigation_basis, rca_basis, reason_code, major_problem_ref, regulator_ref, is_reportable, escalation_level, closure_notes,
  chain_status, problem_logged_at, categorized_at, investigating_at, escalated_at, sla_deadline_at, created_by
) VALUES (
  'prob_010', 'PRB-2025-0010',
  'support_ticket.escalated', 'support_ticket', 'tkt_cluster_settle', 'W14',
  'oe_ops', 'Open Energy Platform Operations', 'Settlement — PPA settlement engine', null, 'data', 'major_problem', 12,
  'Recurring sub-cent-to-rand discrepancies between the platform PPA settlement run and offtaker-side recomputations, clustering at month-end across several PPAs. Touches settlement integrity of a regulated market service.',
  'Investigated rounding + business-day handling in the 10 0 * * * settlement run; reproduced a half-up vs banker''s-rounding divergence on indexed tariffs.',
  'Provisional root cause: inconsistent rounding convention between the tariff-indexation escalation (W39) and the settlement engine, compounded over many intervals. Not yet fully bounded — blast radius spans multiple PPAs and settlement periods.',
  'major_problem_market_integrity',
  'MPR-2025-0010', 'NERSA-NOTIFY-2025-0033', 1, 1,
  'ESCALATED to major-problem governance: settlement-integrity impact on a regulated market service exceeds the support function''s remit. Convened a major-problem review board and NOTIFIED the regulator (market-integrity / availability) per the major-problem reportability rule. Hand-off to settlement engineering + the W3 settlement chain owners for the corrective programme.',
  'escalated', '2025-12-20 08:00:00', '2025-12-21 09:00:00', '2025-12-24 09:00:00', '2026-01-06 09:00:00', '2026-01-08 09:00:00', 'demo_support_001'
);

-- ─── EVENTS ────────────────────────────────────────────────────────────────

-- prob_001 (problem_logged)
INSERT OR IGNORE INTO oe_problem_records_events (id, problem_id, event_type, from_status, to_status, actor_id, actor_party, notes, created_at) VALUES
('probv_001_a', 'prob_001', 'problem_management.problem_logged', null, 'problem_logged', 'oe_ops', 'problem_manager', 'Problem logged from a cluster of 9 P1 peak-trading rejection incidents (W14)', '2026-05-26 07:30:00');

-- prob_002 (categorized)
INSERT OR IGNORE INTO oe_problem_records_events (id, problem_id, event_type, from_status, to_status, actor_id, actor_party, notes, created_at) VALUES
('probv_002_a', 'prob_002', 'problem_management.problem_logged', null, 'problem_logged', 'oe_ops', 'problem_manager', 'Repeat-visitor blank-screen problem logged', '2026-05-22 10:00:00'),
('probv_002_b', 'prob_002', 'problem_management.categorized', 'problem_logged', 'categorized', 'oe_ops', 'problem_manager', 'Categorised: CDN edge-cache on SPA shell; significant (workaround = hard refresh)', '2026-05-23 09:00:00');

-- prob_003 (investigating)
INSERT OR IGNORE INTO oe_problem_records_events (id, problem_id, event_type, from_status, to_status, actor_id, actor_party, notes, created_at) VALUES
('probv_003_a', 'prob_003', 'problem_management.problem_logged', null, 'problem_logged', 'oe_ops', 'problem_manager', 'Slow PDF-export problem logged', '2026-05-15 11:00:00'),
('probv_003_b', 'prob_003', 'problem_management.categorized', 'problem_logged', 'categorized', 'oe_ops', 'problem_manager', 'Categorised data/minor', '2026-05-16 09:00:00'),
('probv_003_c', 'prob_003', 'problem_management.investigating', 'categorized', 'investigating', 'oe_ops', 'resolver', 'Profiling statement renderer; suspect N+1 over metering rows', '2026-05-18 09:00:00');

-- prob_004 (rca_identified)
INSERT OR IGNORE INTO oe_problem_records_events (id, problem_id, event_type, from_status, to_status, actor_id, actor_party, notes, created_at) VALUES
('probv_004_a', 'prob_004', 'problem_management.problem_logged', null, 'problem_logged', 'oe_ops', 'problem_manager', 'Midnight metering-lag problem logged (W14 cluster)', '2026-05-10 08:00:00'),
('probv_004_b', 'prob_004', 'problem_management.categorized', 'problem_logged', 'categorized', 'oe_ops', 'problem_manager', 'Categorised integration/significant', '2026-05-11 09:00:00'),
('probv_004_c', 'prob_004', 'problem_management.investigating', 'categorized', 'investigating', 'oe_ops', 'resolver', 'Reviewing cron windows + D1 contention 00:00–00:10', '2026-05-13 09:00:00'),
('probv_004_d', 'prob_004', 'problem_management.rca_identified', 'investigating', 'rca_identified', 'oe_ops', 'resolver', 'RCA: metering + settlement crons contend; settlement starts before ingestion drains', '2026-05-19 09:00:00');

-- prob_005 (known_error)
INSERT OR IGNORE INTO oe_problem_records_events (id, problem_id, event_type, from_status, to_status, actor_id, actor_party, notes, created_at) VALUES
('probv_005_a', 'prob_005', 'problem_management.problem_logged', null, 'problem_logged', 'oe_ops', 'problem_manager', 'Stale-VWAP-marks problem logged (major — money-affecting)', '2026-05-02 08:00:00'),
('probv_005_b', 'prob_005', 'problem_management.categorized', 'problem_logged', 'categorized', 'oe_ops', 'problem_manager', 'Categorised software/major_problem', '2026-05-03 09:00:00'),
('probv_005_c', 'prob_005', 'problem_management.investigating', 'categorized', 'investigating', 'oe_ops', 'resolver', 'Reproduced staleness at SAST/UTC day boundary', '2026-05-05 09:00:00'),
('probv_005_d', 'prob_005', 'problem_management.rca_identified', 'investigating', 'rca_identified', 'oe_ops', 'resolver', 'RCA: mark-age guard compares UTC ts to SAST trading-day cutoff', '2026-05-08 09:00:00'),
('probv_005_e', 'prob_005', 'problem_management.known_error', 'rca_identified', 'known_error', 'oe_ops', 'resolver', 'Logged KEDB-2026-0005 with manual-refresh workaround', '2026-05-12 09:00:00');

-- prob_006 (fix_proposed)
INSERT OR IGNORE INTO oe_problem_records_events (id, problem_id, event_type, from_status, to_status, actor_id, actor_party, notes, created_at) VALUES
('probv_006_a', 'prob_006', 'problem_management.problem_logged', null, 'problem_logged', 'oe_ops', 'problem_manager', 'Duplicate-email problem logged', '2026-04-22 08:00:00'),
('probv_006_b', 'prob_006', 'problem_management.categorized', 'problem_logged', 'categorized', 'oe_ops', 'problem_manager', 'Categorised software/significant', '2026-04-23 09:00:00'),
('probv_006_c', 'prob_006', 'problem_management.investigating', 'categorized', 'investigating', 'oe_ops', 'resolver', 'Traced duplicates to DLQ replay of the notification stage', '2026-04-26 09:00:00'),
('probv_006_d', 'prob_006', 'problem_management.rca_identified', 'investigating', 'rca_identified', 'oe_ops', 'resolver', 'RCA: notification stage not idempotent on replay', '2026-04-30 09:00:00'),
('probv_006_e', 'prob_006', 'problem_management.known_error', 'rca_identified', 'known_error', 'oe_ops', 'resolver', 'Logged KEDB-2026-0006 with replay-suppress workaround', '2026-05-03 09:00:00'),
('probv_006_f', 'prob_006', 'problem_management.fix_proposed', 'known_error', 'fix_proposed', 'oe_ops', 'resolver', 'Proposed (cascade_id, stage, recipient) idempotency key', '2026-05-07 09:00:00');

-- prob_007 (change_raised)
INSERT OR IGNORE INTO oe_problem_records_events (id, problem_id, event_type, from_status, to_status, actor_id, actor_party, notes, created_at) VALUES
('probv_007_a', 'prob_007', 'problem_management.problem_logged', null, 'problem_logged', 'oe_ops', 'problem_manager', 'D1-7500 deploy-flake problem logged (major — pipeline reliability)', '2026-04-10 08:00:00'),
('probv_007_b', 'prob_007', 'problem_management.categorized', 'problem_logged', 'categorized', 'oe_ops', 'problem_manager', 'Categorised infrastructure/major_problem', '2026-04-11 09:00:00'),
('probv_007_c', 'prob_007', 'problem_management.investigating', 'categorized', 'investigating', 'oe_ops', 'resolver', 'Correlated failures with large single-shot D1 imports', '2026-04-13 09:00:00'),
('probv_007_d', 'prob_007', 'problem_management.rca_identified', 'investigating', 'rca_identified', 'oe_ops', 'resolver', 'RCA: 7500 not retried; benign API blip fails whole job', '2026-04-16 09:00:00'),
('probv_007_e', 'prob_007', 'problem_management.known_error', 'rca_identified', 'known_error', 'oe_ops', 'resolver', 'Logged KEDB-2026-0007 with rerun-failed workaround', '2026-04-19 09:00:00'),
('probv_007_f', 'prob_007', 'problem_management.fix_proposed', 'known_error', 'fix_proposed', 'oe_ops', 'resolver', 'Proposed bounded retry-with-backoff harness', '2026-04-23 09:00:00'),
('probv_007_g', 'prob_007', 'problem_management.change_raised', 'fix_proposed', 'change_raised', 'oe_ops', 'change_mgmt', 'Raised RFC-2026-0042 into change management', '2026-04-28 09:00:00');

-- prob_008 (cancelled)
INSERT OR IGNORE INTO oe_problem_records_events (id, problem_id, event_type, from_status, to_status, actor_id, actor_party, notes, created_at) VALUES
('probv_008_a', 'prob_008', 'problem_management.problem_logged', null, 'problem_logged', 'oe_ops', 'problem_manager', 'Login rate-limit problem logged from CI 429 reports', '2026-05-18 09:00:00'),
('probv_008_b', 'prob_008', 'problem_management.categorized', 'problem_logged', 'categorized', 'oe_ops', 'problem_manager', 'Categorised process/minor', '2026-05-18 12:00:00'),
('probv_008_c', 'prob_008', 'problem_management.investigating', 'categorized', 'investigating', 'oe_ops', 'resolver', 'Reviewed 10/5min/IP limiter against reported 429s', '2026-05-19 09:00:00'),
('probv_008_d', 'prob_008', 'problem_management.cancelled', 'investigating', 'cancelled', 'oe_ops', 'problem_manager', 'CANCELLED — limiter working as designed; redirected to test owners', '2026-05-20 09:00:00');

-- prob_009 (closed — full happy path)
INSERT OR IGNORE INTO oe_problem_records_events (id, problem_id, event_type, from_status, to_status, actor_id, actor_party, notes, created_at) VALUES
('probv_009_a', 'prob_009', 'problem_management.problem_logged', null, 'problem_logged', 'oe_ops', 'problem_manager', 'Webhook TLS-failure problem logged', '2026-03-01 08:00:00'),
('probv_009_b', 'prob_009', 'problem_management.categorized', 'problem_logged', 'categorized', 'oe_ops', 'problem_manager', 'Categorised integration/significant', '2026-03-02 09:00:00'),
('probv_009_c', 'prob_009', 'problem_management.investigating', 'categorized', 'investigating', 'oe_ops', 'resolver', 'Captured TLS handshake errors to the lender endpoint', '2026-03-04 09:00:00'),
('probv_009_d', 'prob_009', 'problem_management.rca_identified', 'investigating', 'rca_identified', 'oe_ops', 'resolver', 'RCA: dispatcher negotiated an old cipher rejected by lender WAF', '2026-03-08 09:00:00'),
('probv_009_e', 'prob_009', 'problem_management.known_error', 'rca_identified', 'known_error', 'oe_ops', 'resolver', 'Logged KEDB-2026-0009 with manual re-notify workaround', '2026-03-11 09:00:00'),
('probv_009_f', 'prob_009', 'problem_management.fix_proposed', 'known_error', 'fix_proposed', 'oe_ops', 'resolver', 'Proposed TLS 1.2+ pin + per-endpoint TLS profile', '2026-03-14 09:00:00'),
('probv_009_g', 'prob_009', 'problem_management.change_raised', 'fix_proposed', 'change_raised', 'oe_ops', 'change_mgmt', 'Raised RFC-2026-0031; approved at CAB', '2026-03-18 09:00:00'),
('probv_009_h', 'prob_009', 'problem_management.fix_deployed', 'change_raised', 'fix_deployed', 'oe_ops', 'change_mgmt', 'Deployed TLS profile change to the webhook dispatcher', '2026-03-24 09:00:00'),
('probv_009_i', 'prob_009', 'problem_management.resolution_verified', 'fix_deployed', 'resolution_verified', 'oe_ops', 'resolver', 'Verified: 14 consecutive deliveries clean; no recurrence in 2-week window', '2026-04-08 09:00:00'),
('probv_009_j', 'prob_009', 'problem_management.closed', 'resolution_verified', 'closed', 'oe_ops', 'problem_manager', 'CLOSED — permanently resolved + verified', '2026-04-12 09:00:00');

-- prob_010 (escalated — crosses regulator)
INSERT OR IGNORE INTO oe_problem_records_events (id, problem_id, event_type, from_status, to_status, actor_id, actor_party, notes, created_at) VALUES
('probv_010_a', 'prob_010', 'problem_management.problem_logged', null, 'problem_logged', 'oe_ops', 'problem_manager', 'Settlement-integrity drift problem logged (W14 cluster)', '2025-12-20 08:00:00'),
('probv_010_b', 'prob_010', 'problem_management.categorized', 'problem_logged', 'categorized', 'oe_ops', 'problem_manager', 'Categorised data/major_problem', '2025-12-21 09:00:00'),
('probv_010_c', 'prob_010', 'problem_management.investigating', 'categorized', 'investigating', 'oe_ops', 'resolver', 'Reproduced half-up vs banker''s-rounding divergence on indexed tariffs', '2025-12-24 09:00:00'),
('probv_010_d', 'prob_010', 'problem_management.escalated', 'investigating', 'escalated', 'oe_ops', 'problem_manager', 'ESCALATED — major-problem review board + regulator NOTIFIED (market integrity). Crosses regulator inbox.', '2026-01-06 09:00:00');
