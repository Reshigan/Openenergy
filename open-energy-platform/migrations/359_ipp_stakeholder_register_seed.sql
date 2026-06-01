-- Wave 134: IPP Stakeholder Register seed data
-- 12 rows covering all 12 chain states.
-- Kakamas 500MW project — REIPPPP Round 7 bid.

INSERT OR IGNORE INTO oe_ipp_stakeholders (
  id, project_id, project_name, stakeholder_name, organization, stakeholder_type,
  chain_status, power_score, interest_score, urgency_score, engagement_score,
  stakeholder_tier, current_engagement_level, desired_engagement_level,
  communication_frequency, communication_channel, communication_plan,
  last_engagement_at, next_engagement_due_at,
  sla_target_hours, sla_breached, sla_breach_count,
  floor_ep4_required, floor_board_notify, floor_legal_risk, floor_nersa_required, floor_lender_required,
  is_reportable, regulator_relevant,
  identified_at,
  created_by, created_at, updated_at
) VALUES
-- sth-001: Community leader — identified
(
  'sth-001', 'proj-kakamas-500mw', 'Kakamas 500MW Solar',
  'Chief Jongilanga Damane', 'Kakamas Community Trust',
  'community_leader',
  'identified',
  4, 4, 3, 48,
  'key_player', 'neutral', 'supportive',
  'monthly', 'meeting',
  'Monthly community liaison meetings; present project benefits and address concerns.',
  '2026-05-01T09:00:00Z', '2026-06-01T09:00:00Z',
  48, 0, 0,
  1, 0, 0, 0, 0,
  0, 0,
  '2026-04-15T08:00:00Z',
  'system', '2026-04-15T08:00:00Z', '2026-04-15T08:00:00Z'
),
-- sth-002: Municipality — analyzed
(
  'sth-002', 'proj-kakamas-500mw', 'Kakamas 500MW Solar',
  'Cllr Pieter van Wyk', '!Kheis Local Municipality',
  'municipality',
  'analyzed',
  4, 3, 2, 24,
  'keep_satisfied', 'neutral', 'supportive',
  'monthly', 'formal_report',
  'Quarterly progress reports; attend council meetings when invited.',
  '2026-04-20T10:00:00Z', '2026-05-20T10:00:00Z',
  168, 0, 0,
  1, 0, 0, 1, 0,
  0, 0,
  '2026-03-10T08:00:00Z',
  'system', '2026-03-10T08:00:00Z', '2026-05-10T08:00:00Z'
),
-- sth-003: Traditional authority — classified
(
  'sth-003', 'proj-kakamas-500mw', 'Kakamas 500MW Solar',
  'Kgosi Motsepe Sehloho', 'Griqua National Conference',
  'traditional_authority',
  'classified',
  5, 4, 4, 80,
  'strategic_ally', 'neutral', 'leading',
  'weekly', 'meeting',
  'Weekly liaison with traditional council; integrate customary law consultation protocol; invite to all EP4 community meetings.',
  '2026-05-05T14:00:00Z', '2026-05-12T14:00:00Z',
  24, 0, 0,
  1, 1, 0, 0, 0,
  0, 0,
  '2026-03-01T08:00:00Z',
  'system', '2026-03-01T08:00:00Z', '2026-05-15T08:00:00Z'
),
-- sth-004: Regulator (NERSA) — engagement_planned
(
  'sth-004', 'proj-kakamas-500mw', 'Kakamas 500MW Solar',
  'Adv Thandi Molefe', 'National Energy Regulator of SA (NERSA)',
  'regulator',
  'engagement_planned',
  5, 5, 5, 125,
  'strategic_ally', 'neutral', 'supportive',
  'weekly', 'formal_report',
  'Submit formal engagement schedule per ERA s.10; attend pre-application meetings; provide Reg-I reports on milestones.',
  '2026-05-10T11:00:00Z', '2026-05-17T11:00:00Z',
  24, 0, 0,
  0, 1, 0, 1, 0,
  0, 1,
  '2026-04-01T08:00:00Z',
  'system', '2026-04-01T08:00:00Z', '2026-05-15T08:00:00Z'
),
-- sth-005: Funder (IDC) — active_engagement
(
  'sth-005', 'proj-kakamas-500mw', 'Kakamas 500MW Solar',
  'Nomvula Dlamini', 'Industrial Development Corporation (IDC)',
  'funder',
  'active_engagement',
  5, 5, 4, 100,
  'strategic_ally', 'supportive', 'leading',
  'weekly', 'meeting',
  'Weekly lender meetings; provide financial model updates, IE reports, and drawdown readiness status.',
  '2026-05-20T09:00:00Z', '2026-05-27T09:00:00Z',
  24, 0, 0,
  0, 1, 0, 0, 1,
  0, 0,
  '2026-03-15T08:00:00Z',
  'system', '2026-03-15T08:00:00Z', '2026-05-20T08:00:00Z'
),
-- sth-006: Offtaker (Eskom) — responsive
(
  'sth-006', 'proj-kakamas-500mw', 'Kakamas 500MW Solar',
  'Anele Nkosi', 'Eskom Holdings SOC',
  'offtaker',
  'responsive',
  5, 5, 3, 75,
  'strategic_ally', 'supportive', 'leading',
  'biweekly', 'meeting',
  'Bi-weekly PPA negotiation sessions; share metering standards; align on COD schedule.',
  '2026-05-18T10:00:00Z', '2026-06-01T10:00:00Z',
  24, 0, 0,
  0, 1, 0, 1, 0,
  0, 0,
  '2026-02-01T08:00:00Z',
  'system', '2026-02-01T08:00:00Z', '2026-05-18T08:00:00Z'
),
-- sth-007: Contractor (EPC) — supportive
(
  'sth-007', 'proj-kakamas-500mw', 'Kakamas 500MW Solar',
  'Marco Ferreira', 'SunPower EPC (Pty) Ltd',
  'contractor',
  'supportive',
  3, 4, 3, 36,
  'keep_informed', 'supportive', 'leading',
  'weekly', 'meeting',
  'Weekly construction progress meetings; align on ITP hold-points and handover milestones.',
  '2026-05-22T08:00:00Z', '2026-05-29T08:00:00Z',
  336, 0, 0,
  0, 0, 0, 0, 0,
  0, 0,
  '2026-01-15T08:00:00Z',
  'system', '2026-01-15T08:00:00Z', '2026-05-22T08:00:00Z'
),
-- sth-008: NGO (environmental) — champion
(
  'sth-008', 'proj-kakamas-500mw', 'Kakamas 500MW Solar',
  'Dr Lerato Kgomo', 'Green Northern Cape Initiative',
  'ngo',
  'champion',
  2, 5, 3, 30,
  'keep_informed', 'leading', 'leading',
  'monthly', 'workshop',
  'Quarterly workshop participation; share ESIA findings; co-author community benefits report.',
  '2026-05-15T14:00:00Z', '2026-06-15T14:00:00Z',
  336, 0, 0,
  1, 0, 0, 0, 0,
  0, 0,
  '2025-12-01T08:00:00Z',
  'system', '2025-12-01T08:00:00Z', '2026-05-15T08:00:00Z'
),
-- sth-009: Community leader — resistant (SIGNATURE row: power>=4, sla_breached=1, is_reportable=1)
(
  'sth-009', 'proj-kakamas-500mw', 'Kakamas 500MW Solar',
  'Mr Klaas Joubert', 'Kakamas Boere Gemeenskap',
  'community_leader',
  'resistant',
  5, 4, 5, 100,
  'strategic_ally', 'resistant', 'neutral',
  'weekly', 'meeting',
  'Immediate escalation meeting with project director required; engage land-use grievance; assign dedicated liaison officer.',
  '2026-04-10T09:00:00Z', '2026-04-17T09:00:00Z',
  24, 1, 2,
  1, 1, 1, 0, 0,
  1, 1,
  '2026-03-20T08:00:00Z',
  'system', '2026-03-20T08:00:00Z', '2026-05-01T08:00:00Z'
),
-- sth-010: Media — disengaged
(
  'sth-010', 'proj-kakamas-500mw', 'Kakamas 500MW Solar',
  'Sipho Mahlangu', 'Northern Cape Tribune',
  'media',
  'disengaged',
  3, 2, 1, 6,
  'monitor', 'unaware', 'neutral',
  'monthly', 'email',
  'Monthly press releases; provide factsheet; respond to media queries within 24h.',
  '2026-02-01T08:00:00Z', '2026-03-01T08:00:00Z',
  720, 0, 0,
  0, 0, 0, 0, 0,
  0, 0,
  '2026-01-10T08:00:00Z',
  'system', '2026-01-10T08:00:00Z', '2026-03-01T08:00:00Z'
),
-- sth-011: Government dept (DMRE) — escalated
(
  'sth-011', 'proj-kakamas-500mw', 'Kakamas 500MW Solar',
  'Director Fatima Cassim', 'Dept of Mineral Resources & Energy (DMRE)',
  'government_dept',
  'escalated',
  5, 5, 5, 125,
  'strategic_ally', 'neutral', 'supportive',
  'weekly', 'formal_report',
  'Escalated to project director for DMRE liaison. Submit REIPPPP Reg-I compliance report. Schedule pre-close meeting.',
  '2026-05-01T09:00:00Z', '2026-05-08T09:00:00Z',
  24, 0, 0,
  1, 1, 0, 1, 0,
  0, 1,
  '2026-04-01T08:00:00Z',
  'system', '2026-04-01T08:00:00Z', '2026-05-20T08:00:00Z'
),
-- sth-012: Consultant — archived
(
  'sth-012', 'proj-kakamas-500mw', 'Kakamas 500MW Solar',
  'Barry Jacobs', 'Eco-Logic Environmental Consultants',
  'consultant',
  'archived',
  2, 3, 1, 6,
  'monitor', 'supportive', 'supportive',
  'monthly', 'email',
  'ESIA completed. Archived post-submission. Retain contact for any follow-up queries.',
  '2026-01-15T10:00:00Z', NULL,
  720, 0, 0,
  0, 0, 0, 0, 0,
  0, 0,
  '2025-06-01T08:00:00Z',
  'system', '2025-06-01T08:00:00Z', '2026-01-20T08:00:00Z'
);
