// ═══════════════════════════════════════════════════════════════════════════
// Wave 83 — NERSA Consultation Notice & Public-Comment Period chain (P6).
//
// Mounted at /api/consultation-notice/chain.
//
// The PUBLIC-ENGAGEMENT engine of the energy regulator. NERSA must publish a
// notice and invite comment before adopting any material rule, methodology,
// licence condition or tariff determination — Electricity Regulation Act 4
// of 2006 s.10, Promotion of Administrative Justice Act 3 of 2000 s.4, and
// NERSA's own Rules of Procedure all anchor it. This chain governs the notice
// lifecycle: draft → publish (Gazette) → open comment period → optional
// extension → close → optional public hearing → analysis → consolidated
// response (with reasons) → adopted decision; with on-hold for legal review
// and withdrawn/cancelled terminals.
//
// DISTINCTIVE move (beat best-in-class — ACER consultation portal / FERC
// eFiling / Ofgem consultation hub / AER consultation register / BEREC
// public-consultation system — all of which run essentially linear publish-
// comment-respond workflows with manual procedural-validity tracking): live
// calculated consultation-health battery on every record — comments
// received, stakeholder-balance index, representativeness coverage,
// statutory-period validity flag, judicial-review risk score, days
// remaining, extension-count visibility — all derived from the same inputs
// each transition.
//
// Write model — SINGLE regulator desk {admin, regulator}. READ all nine
// personas. actor_party (secretariat / panel / presiding_member /
// stakeholder) records the functional owner per step, not the JWT role.
//
// Reportability (the W83 SIGNATURE is TRANSPARENCY-driven):
//   withdraw_notice    crosses for EVERY tier — pulling a published
//                      consultation is ALWAYS notifiable to PAJA / Council.
//   adopt_decision     crosses for EVERY tier when binding-class; else for
//                      material+landmark only.
//   extend_comment_period crosses for material+landmark only.
//   sla_breached       crosses for material+landmark only.
// ═══════════════════════════════════════════════════════════════════════════

import { Hono, Context } from 'hono';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { HonoEnv } from '../utils/types';
import { fireCascade } from '../utils/cascade';
import {
  nextStatus,
  isTerminal,
  slaDeadlineFor,
  tierForAffectedParties,
  isBindingClass,
  crossesIntoRegulator,
  slaBreachCrossesIntoRegulator,
  isReportable,
  partyForAction,
  daysUntilCommentClose,
  daysInCommentPeriod,
  proceduralValidityOk,
  balanceIndex,
  representativenessIndex,
  coverageCompleteness,
  judicialReviewRiskScore,
  predictedConsultationDays,
  SLA_MINUTES,
  type ConsultationStatus,
  type ConsultationAction,
  type ConsultationTier,
  type ConsultationClass,
  type ConsultationKind,
} from '../utils/consultation-notice-spec';

const READ_ROLES = new Set([
  'admin', 'regulator',
  'ipp_developer', 'grid_operator', 'offtaker', 'lender', 'trader', 'support', 'carbon_fund',
]);

const WRITE_ROLES = new Set(['admin', 'regulator']);

interface NoticeRow {
  id: string;
  notice_number: string;
  source_event: string | null;
  source_entity_type: string | null;
  source_entity_id: string | null;
  source_wave: string | null;
  notice_title: string;
  era_section: string | null;
  gazette_number: string | null;
  gazette_publication_at: string | null;
  consultation_kind: ConsultationKind;
  consultation_class: ConsultationClass;
  consultation_tier: ConsultationTier;
  affected_parties_estimate: number;
  is_binding_class: number;
  comment_period_start_at: string | null;
  comment_period_end_at: string | null;
  comment_period_minimum_days: number | null;
  extension_count: number;
  comments_received_count: number;
  industry_comments_count: number;
  consumer_comments_count: number;
  civil_society_comments_count: number;
  ipp_comments_count: number;
  government_comments_count: number;
  provinces_represented: number;
  sectors_represented: number;
  questions_total: number;
  questions_answered: number;
  hearing_scheduled_at: string | null;
  hearing_held_at: string | null;
  hearing_venue: string | null;
  presiding_member_name: string | null;
  response_document_ref: string | null;
  decision_reasons: string | null;
  adopted_decision_ref: string | null;
  procedural_validity_flag: number;
  judicial_review_risk_score: number;
  predicted_consultation_days: number | null;
  published_flag: number;
  comment_period_opened_flag: number;
  comment_period_closed_flag: number;
  hearing_held_flag: number;
  response_drafted_flag: number;
  adopted_flag: number;
  draft_ref: string | null;
  publish_ref: string | null;
  open_ref: string | null;
  extension_ref: string | null;
  close_ref: string | null;
  reopen_ref: string | null;
  hearing_schedule_ref: string | null;
  hearing_ref: string | null;
  analysis_ref: string | null;
  response_ref: string | null;
  adoption_ref: string | null;
  hold_ref: string | null;
  withdrawal_ref: string | null;
  cancellation_ref: string | null;
  regulator_ref: string | null;
  draft_basis: string | null;
  publish_basis: string | null;
  open_basis: string | null;
  extension_basis: string | null;
  close_basis: string | null;
  hearing_basis: string | null;
  analysis_basis: string | null;
  response_basis: string | null;
  adoption_basis: string | null;
  hold_basis: string | null;
  withdrawal_basis: string | null;
  cancellation_basis: string | null;
  reason_code: string | null;
  consultation_summary: string | null;
  chain_status: ConsultationStatus;
  drafted_at: string;
  published_at: string | null;
  open_for_comment_at: string | null;
  comment_period_closed_at: string | null;
  hearing_scheduled_at_status: string | null;
  hearing_held_at_status: string | null;
  analysis_at: string | null;
  response_drafted_at: string | null;
  adopted_at: string | null;
  on_hold_at: string | null;
  withdrawn_at: string | null;
  cancelled_at: string | null;
  is_reportable: number;
  sla_deadline_at: string | null;
  last_sla_breach_at: string | null;
  escalation_level: number;
  created_by: string;
  created_at: string;
  updated_at: string;
}

interface NoticeEventRow {
  id: string;
  notice_id: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  actor_id: string | null;
  actor_party: string | null;
  notes: string | null;
  payload: string | null;
  created_at: string;
}

const TIMESTAMP_COLUMN: Record<ConsultationStatus, keyof NoticeRow | null> = {
  drafted:               null,
  published:             'published_at',
  open_for_comment:      'open_for_comment_at',
  comment_period_closed: 'comment_period_closed_at',
  hearing_scheduled:     'hearing_scheduled_at_status',
  hearing_held:          'hearing_held_at_status',
  analysis:              'analysis_at',
  response_drafted:      'response_drafted_at',
  adopted:               'adopted_at',
  on_hold:               'on_hold_at',
  withdrawn:             'withdrawn_at',
  cancelled:             'cancelled_at',
};

// resume re-enters analysis, extend_comment_period self-loops open_for_comment,
// and reopen_for_comment also lands in open_for_comment.
function eventTypeFor(action: ConsultationAction): string {
  switch (action) {
    case 'publish_notice':        return 'consultation_notice.published';
    case 'open_comment_period':   return 'consultation_notice.open_for_comment';
    case 'extend_comment_period': return 'consultation_notice.open_for_comment';
    case 'close_comment_period':  return 'consultation_notice.comment_period_closed';
    case 'reopen_for_comment':    return 'consultation_notice.open_for_comment';
    case 'schedule_hearing':      return 'consultation_notice.hearing_scheduled';
    case 'hold_hearing':          return 'consultation_notice.hearing_held';
    case 'begin_analysis':        return 'consultation_notice.analysis';
    case 'draft_response':        return 'consultation_notice.response_drafted';
    case 'adopt_decision':        return 'consultation_notice.adopted';
    case 'place_on_hold':         return 'consultation_notice.on_hold';
    case 'resume':                return 'consultation_notice.analysis';
    case 'withdraw_notice':       return 'consultation_notice.withdrawn';
    case 'cancel':                return 'consultation_notice.cancelled';
  }
}

function decorate(row: NoticeRow, now: Date) {
  const tier = row.consultation_tier;
  const status = row.chain_status;
  const slaIso = row.sla_deadline_at;
  const minutesUntilSla = slaIso
    ? Math.floor((new Date(slaIso).getTime() - now.getTime()) / 60000)
    : null;
  const isBinding = !!row.is_binding_class;
  // Live consultation-health battery — derived from the same inputs every record
  // so the numbers match across transitions. This is what beats the linear
  // publish-comment-respond workflows of ACER/FERC/Ofgem/AER/BEREC.
  const startAt = row.comment_period_start_at ? new Date(row.comment_period_start_at) : null;
  const endAt = row.comment_period_end_at ? new Date(row.comment_period_end_at) : null;
  const hearingAt = row.hearing_held_at_status ? new Date(row.hearing_held_at_status) : null;
  const balance = balanceIndex({
    industry: row.industry_comments_count,
    consumer: row.consumer_comments_count,
    civil_society: row.civil_society_comments_count,
    ipp: row.ipp_comments_count,
    government: row.government_comments_count,
  });
  const representativeness = representativenessIndex(row.provinces_represented, row.sectors_represented);
  const coverage = coverageCompleteness(row.questions_answered, row.questions_total);
  const proceduralOk = proceduralValidityOk(tier, startAt, endAt, hearingAt, isBinding);
  const judicialRisk = judicialReviewRiskScore(
    proceduralOk, balance, coverage, representativeness, row.extension_count, row.comments_received_count,
  );
  return {
    ...row,
    is_terminal: isTerminal(status),
    minutes_until_sla: minutesUntilSla,
    sla_breached: minutesUntilSla != null && minutesUntilSla < 0,
    sla_window_minutes: SLA_MINUTES[status]?.[tier] ?? 0,
    is_reportable_flag: !!row.is_reportable,
    is_binding_class_flag: isBinding,
    breach_crosses_regulator: slaBreachCrossesIntoRegulator(tier),
    comments_received_count_live: row.comments_received_count,
    balance_index_live: balance,
    representativeness_index_live: representativeness,
    coverage_completeness_pct_live: Math.round(coverage * 100),
    procedural_validity_flag_live: proceduralOk,
    judicial_review_risk_score_live: judicialRisk,
    days_in_comment_period_live: daysInCommentPeriod(startAt, now),
    days_until_deadline_live: daysUntilCommentClose(endAt, now),
    extension_count_live: row.extension_count,
    predicted_consultation_days_live: predictedConsultationDays(tier),
  };
}

const app = new Hono<HonoEnv>();
app.use('*', authMiddleware);

app.get('/', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const consultation_tier  = c.req.query('consultation_tier');
  const status             = c.req.query('status');
  const consultation_kind  = c.req.query('consultation_kind');
  const consultation_class = c.req.query('consultation_class');
  const breached           = c.req.query('breached');
  const reportable         = c.req.query('reportable');
  const binding            = c.req.query('binding');

  let sql = 'SELECT * FROM oe_consultation_notices WHERE 1=1';
  const binds: unknown[] = [];
  if (consultation_tier)  { sql += ' AND consultation_tier = ?';  binds.push(consultation_tier); }
  if (status)             { sql += ' AND chain_status = ?';       binds.push(status); }
  if (consultation_kind)  { sql += ' AND consultation_kind = ?';  binds.push(consultation_kind); }
  if (consultation_class) { sql += ' AND consultation_class = ?'; binds.push(consultation_class); }

  sql += ' ORDER BY datetime(drafted_at) DESC LIMIT 500';

  const rs = await c.env.DB.prepare(sql).bind(...binds).all<NoticeRow>();
  const now = new Date();
  let items = (rs.results || []).map((r) => decorate(r, now));
  if (breached === 'true')   items = items.filter((r) => r.sla_breached);
  if (reportable === 'true') items = items.filter((r) => r.is_reportable_flag);
  if (binding === 'true')    items = items.filter((r) => r.is_binding_class_flag);

  const by_status: Record<string, number> = {};
  const by_tier: Record<string, number> = {};
  const by_kind: Record<string, number> = {};
  const by_class: Record<string, number> = {};
  for (const i of items) {
    by_status[i.chain_status] = (by_status[i.chain_status] || 0) + 1;
    by_tier[i.consultation_tier] = (by_tier[i.consultation_tier] || 0) + 1;
    by_kind[i.consultation_kind] = (by_kind[i.consultation_kind] || 0) + 1;
    by_class[i.consultation_class] = (by_class[i.consultation_class] || 0) + 1;
  }

  const open_count       = items.filter((i) => !i.is_terminal).length;
  const adopted_count    = items.filter((i) => i.chain_status === 'adopted').length;
  const on_hold_count    = items.filter((i) => i.chain_status === 'on_hold').length;
  const withdrawn_count  = items.filter((i) => i.chain_status === 'withdrawn').length;
  const cancelled_count  = items.filter((i) => i.chain_status === 'cancelled').length;
  const breached_count   = items.filter((i) => i.sla_breached && !i.is_terminal).length;
  const reportable_total = items.filter((i) => i.is_reportable_flag).length;
  const binding_count    = items.filter((i) => i.is_binding_class_flag).length;
  const total_comments   = items.reduce((s, i) => s + (i.comments_received_count || 0), 0);
  const total_extensions = items.reduce((s, i) => s + (i.extension_count || 0), 0);
  const high_judicial_risk_count = items.filter((i) => i.judicial_review_risk_score_live >= 50).length;
  const procedurally_invalid_count = items.filter((i) => !i.procedural_validity_flag_live && !i.is_terminal).length;
  const total_affected_parties = items.reduce((s, i) => s + (i.affected_parties_estimate || 0), 0);

  return c.json({
    success: true,
    data: {
      items,
      total: items.length,
      by_status,
      by_tier,
      by_kind,
      by_class,
      open_count,
      adopted_count,
      on_hold_count,
      withdrawn_count,
      cancelled_count,
      breached: breached_count,
      reportable_total,
      binding_count,
      total_comments,
      total_extensions,
      high_judicial_risk_count,
      procedurally_invalid_count,
      total_affected_parties,
    },
  });
});

app.get('/:id', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const id = c.req.param('id')!;
  const row = await c.env.DB.prepare('SELECT * FROM oe_consultation_notices WHERE id = ?').bind(id).first<NoticeRow>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const ev = await c.env.DB.prepare(
    'SELECT * FROM oe_consultation_notices_events WHERE notice_id = ? ORDER BY datetime(created_at) ASC',
  ).bind(id).all<NoticeEventRow>();

  return c.json({
    success: true,
    data: {
      case: decorate(row, new Date()),
      events: ev.results || [],
    },
  });
});

interface PublishBody { publish_basis?: string; publish_ref?: string; gazette_number?: string; gazette_publication_at?: string; notes?: string; }
interface OpenBody    { open_basis?: string; open_ref?: string; comment_period_start_at?: string; comment_period_end_at?: string; notes?: string; }
interface ExtendBody  { extension_basis?: string; extension_ref?: string; new_comment_period_end_at?: string; regulator_ref?: string; notes?: string; }
interface CloseBody   { close_basis?: string; close_ref?: string; notes?: string; }
interface ReopenBody  { open_basis?: string; reopen_ref?: string; comment_period_end_at?: string; notes?: string; }
interface ScheduleHearingBody { hearing_basis?: string; hearing_schedule_ref?: string; hearing_scheduled_at?: string; hearing_venue?: string; presiding_member_name?: string; notes?: string; }
interface HoldHearingBody { hearing_basis?: string; hearing_ref?: string; notes?: string; }
interface AnalysisBody { analysis_basis?: string; analysis_ref?: string; notes?: string; }
interface DraftResponseBody { response_basis?: string; response_ref?: string; response_document_ref?: string; decision_reasons?: string; notes?: string; }
interface AdoptBody { adoption_basis?: string; adoption_ref?: string; adopted_decision_ref?: string; regulator_ref?: string; notes?: string; }
interface HoldBody { hold_basis?: string; hold_ref?: string; reason_code?: string; notes?: string; }
interface WithdrawBody { withdrawal_basis?: string; withdrawal_ref?: string; reason_code?: string; regulator_ref?: string; notes?: string; }
interface CancelBody { cancellation_basis?: string; cancellation_ref?: string; reason_code?: string; notes?: string; }

async function transition(
  c: Context<HonoEnv>,
  action: ConsultationAction,
  bodyHandler?: (row: NoticeRow, body: Record<string, unknown>) => Partial<NoticeRow>,
) {
  const user = getCurrentUser(c);
  if (!user || !WRITE_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const id = c.req.param('id')!;
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const notes = typeof body.notes === 'string' ? body.notes : null;

  const row = await c.env.DB.prepare('SELECT * FROM oe_consultation_notices WHERE id = ?').bind(id).first<NoticeRow>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const to = nextStatus(row.chain_status, action);
  if (!to) {
    return c.json({
      success: false,
      error: `Invalid transition: ${row.chain_status} -> ${action}`,
    }, 422);
  }

  const overrides = bodyHandler ? bodyHandler(row, body) : {};
  // Tier is RE-DERIVED on every transition from affected_parties_estimate +
  // binding-class floor — same INVERTED family as W82/W81/W73.
  const klass = (overrides.consultation_class as ConsultationClass | undefined) ?? row.consultation_class;
  const affected = (overrides.affected_parties_estimate as number | undefined) ?? row.affected_parties_estimate;
  const tier = tierForAffectedParties(affected, klass);
  overrides.consultation_tier = tier;
  const isBinding = isBindingClass(klass);
  overrides.is_binding_class = isBinding ? 1 : 0;

  const tsCol = TIMESTAMP_COLUMN[to];
  const now = new Date();
  const nowIso = now.toISOString();
  const sla = slaDeadlineFor(to, tier, now);
  const slaIso = sla ? sla.toISOString() : null;

  const crosses = crossesIntoRegulator(action, tier, isBinding);
  overrides.is_reportable = (isReportable(tier, isBinding) || crosses) ? 1 : 0;

  const setClauses: string[] = ['chain_status = ?', 'updated_at = ?', 'sla_deadline_at = ?'];
  const setBinds: unknown[] = [to, nowIso, slaIso];
  if (tsCol && to !== row.chain_status) {
    setClauses.push(`${tsCol} = ?`);
    setBinds.push(nowIso);
  }
  for (const [k, v] of Object.entries(overrides)) {
    setClauses.push(`${k} = ?`);
    setBinds.push(v);
  }
  setBinds.push(id);

  await c.env.DB.prepare(
    `UPDATE oe_consultation_notices SET ${setClauses.join(', ')} WHERE id = ?`,
  ).bind(...setBinds).run();

  const evtId = `cn_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
  await c.env.DB.prepare(
    'INSERT INTO oe_consultation_notices_events (id, notice_id, event_type, from_status, to_status, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  ).bind(
    evtId,
    id,
    eventTypeFor(action),
    row.chain_status,
    to,
    user.id,
    partyForAction(action),
    notes,
    JSON.stringify({ ...overrides, action }),
    nowIso,
  ).run();

  const eventName = eventTypeFor(action) as Parameters<typeof fireCascade>[0]['event'];
  await fireCascade({
    event: eventName,
    actor_id: user.id,
    entity_type: 'consultation_notice',
    entity_id: id,
    data: {
      ...row,
      ...overrides,
      consultation_tier: tier,
      consultation_class: klass,
      is_binding_class: isBinding ? 1 : 0,
      chain_status: to,
      from_status: row.chain_status,
      action,
      crosses_into_regulator: crosses,
    },
    env: c.env,
  });

  const refreshed = await c.env.DB.prepare('SELECT * FROM oe_consultation_notices WHERE id = ?').bind(id).first<NoticeRow>();
  return c.json({ success: true, data: { case: refreshed ? decorate(refreshed, now) : null } });
}

app.post('/:id/publish-notice', async (c) => transition(c, 'publish_notice', (row, body) => {
  const b = body as Partial<PublishBody>;
  const out: Partial<NoticeRow> = { published_flag: 1 };
  if (typeof b.publish_basis === 'string') out.publish_basis = b.publish_basis;
  if (typeof b.publish_ref === 'string')   out.publish_ref = b.publish_ref;
  if (typeof b.gazette_number === 'string') out.gazette_number = b.gazette_number;
  if (typeof b.gazette_publication_at === 'string') out.gazette_publication_at = b.gazette_publication_at;
  out.predicted_consultation_days = predictedConsultationDays(
    tierForAffectedParties(row.affected_parties_estimate, row.consultation_class),
  );
  return out;
}));

app.post('/:id/open-comment-period', async (c) => transition(c, 'open_comment_period', (_row, body) => {
  const b = body as Partial<OpenBody>;
  const out: Partial<NoticeRow> = { comment_period_opened_flag: 1 };
  if (typeof b.open_basis === 'string') out.open_basis = b.open_basis;
  if (typeof b.open_ref === 'string')   out.open_ref = b.open_ref;
  if (typeof b.comment_period_start_at === 'string') out.comment_period_start_at = b.comment_period_start_at;
  if (typeof b.comment_period_end_at === 'string')   out.comment_period_end_at = b.comment_period_end_at;
  return out;
}));

app.post('/:id/extend-comment-period', async (c) => transition(c, 'extend_comment_period', (row, body) => {
  const b = body as Partial<ExtendBody>;
  const out: Partial<NoticeRow> = { extension_count: (row.extension_count || 0) + 1 };
  if (typeof b.extension_basis === 'string') out.extension_basis = b.extension_basis;
  if (typeof b.extension_ref === 'string')   out.extension_ref = b.extension_ref;
  if (typeof b.new_comment_period_end_at === 'string') out.comment_period_end_at = b.new_comment_period_end_at;
  if (typeof b.regulator_ref === 'string') out.regulator_ref = b.regulator_ref;
  return out;
}));

app.post('/:id/close-comment-period', async (c) => transition(c, 'close_comment_period', (_row, body) => {
  const b = body as Partial<CloseBody>;
  const out: Partial<NoticeRow> = { comment_period_closed_flag: 1 };
  if (typeof b.close_basis === 'string') out.close_basis = b.close_basis;
  if (typeof b.close_ref === 'string')   out.close_ref = b.close_ref;
  return out;
}));

app.post('/:id/reopen-for-comment', async (c) => transition(c, 'reopen_for_comment', (_row, body) => {
  const b = body as Partial<ReopenBody>;
  const out: Partial<NoticeRow> = { comment_period_closed_flag: 0 };
  if (typeof b.open_basis === 'string') out.open_basis = b.open_basis;
  if (typeof b.reopen_ref === 'string') out.reopen_ref = b.reopen_ref;
  if (typeof b.comment_period_end_at === 'string') out.comment_period_end_at = b.comment_period_end_at;
  return out;
}));

app.post('/:id/schedule-hearing', async (c) => transition(c, 'schedule_hearing', (_row, body) => {
  const b = body as Partial<ScheduleHearingBody>;
  const out: Partial<NoticeRow> = {};
  if (typeof b.hearing_basis === 'string') out.hearing_basis = b.hearing_basis;
  if (typeof b.hearing_schedule_ref === 'string') out.hearing_schedule_ref = b.hearing_schedule_ref;
  if (typeof b.hearing_scheduled_at === 'string') out.hearing_scheduled_at = b.hearing_scheduled_at;
  if (typeof b.hearing_venue === 'string') out.hearing_venue = b.hearing_venue;
  if (typeof b.presiding_member_name === 'string') out.presiding_member_name = b.presiding_member_name;
  return out;
}));

app.post('/:id/hold-hearing', async (c) => transition(c, 'hold_hearing', (_row, body) => {
  const b = body as Partial<HoldHearingBody>;
  const out: Partial<NoticeRow> = { hearing_held_flag: 1, hearing_held_at: new Date().toISOString() };
  if (typeof b.hearing_basis === 'string') out.hearing_basis = b.hearing_basis;
  if (typeof b.hearing_ref === 'string')   out.hearing_ref = b.hearing_ref;
  return out;
}));

app.post('/:id/begin-analysis', async (c) => transition(c, 'begin_analysis', (_row, body) => {
  const b = body as Partial<AnalysisBody>;
  const out: Partial<NoticeRow> = {};
  if (typeof b.analysis_basis === 'string') out.analysis_basis = b.analysis_basis;
  if (typeof b.analysis_ref === 'string')   out.analysis_ref = b.analysis_ref;
  return out;
}));

app.post('/:id/draft-response', async (c) => transition(c, 'draft_response', (_row, body) => {
  const b = body as Partial<DraftResponseBody>;
  const out: Partial<NoticeRow> = { response_drafted_flag: 1 };
  if (typeof b.response_basis === 'string') out.response_basis = b.response_basis;
  if (typeof b.response_ref === 'string')   out.response_ref = b.response_ref;
  if (typeof b.response_document_ref === 'string') out.response_document_ref = b.response_document_ref;
  if (typeof b.decision_reasons === 'string') out.decision_reasons = b.decision_reasons;
  return out;
}));

app.post('/:id/adopt-decision', async (c) => transition(c, 'adopt_decision', (_row, body) => {
  const b = body as Partial<AdoptBody>;
  const out: Partial<NoticeRow> = { adopted_flag: 1 };
  if (typeof b.adoption_basis === 'string') out.adoption_basis = b.adoption_basis;
  if (typeof b.adoption_ref === 'string')   out.adoption_ref = b.adoption_ref;
  if (typeof b.adopted_decision_ref === 'string') out.adopted_decision_ref = b.adopted_decision_ref;
  if (typeof b.regulator_ref === 'string')   out.regulator_ref = b.regulator_ref;
  return out;
}));

app.post('/:id/place-on-hold', async (c) => transition(c, 'place_on_hold', (row, body) => {
  const b = body as Partial<HoldBody>;
  const out: Partial<NoticeRow> = { escalation_level: (row.escalation_level || 0) + 1 };
  if (typeof b.hold_basis === 'string') out.hold_basis = b.hold_basis;
  if (typeof b.hold_ref === 'string')   out.hold_ref = b.hold_ref;
  if (typeof b.reason_code === 'string') out.reason_code = b.reason_code;
  return out;
}));

app.post('/:id/resume', async (c) => transition(c, 'resume'));

app.post('/:id/withdraw-notice', async (c) => transition(c, 'withdraw_notice', (_row, body) => {
  const b = body as Partial<WithdrawBody>;
  const out: Partial<NoticeRow> = {};
  if (typeof b.withdrawal_basis === 'string') out.withdrawal_basis = b.withdrawal_basis;
  if (typeof b.withdrawal_ref === 'string')   out.withdrawal_ref = b.withdrawal_ref;
  if (typeof b.reason_code === 'string')      out.reason_code = b.reason_code;
  if (typeof b.regulator_ref === 'string')    out.regulator_ref = b.regulator_ref;
  return out;
}));

app.post('/:id/cancel', async (c) => transition(c, 'cancel', (_row, body) => {
  const b = body as Partial<CancelBody>;
  const out: Partial<NoticeRow> = {};
  if (typeof b.cancellation_basis === 'string') out.cancellation_basis = b.cancellation_basis;
  if (typeof b.cancellation_ref === 'string')   out.cancellation_ref = b.cancellation_ref;
  if (typeof b.reason_code === 'string')        out.reason_code = b.reason_code;
  return out;
}));

export async function consultationNoticeSlaSweep(env: HonoEnv['Bindings']): Promise<{ scanned: number; breached: number }> {
  const now = new Date();
  const nowIso = now.toISOString();
  const rs = await env.DB.prepare(
    `SELECT * FROM oe_consultation_notices
     WHERE chain_status NOT IN ('adopted','withdrawn','cancelled')
       AND sla_deadline_at IS NOT NULL
       AND datetime(sla_deadline_at) < datetime(?)
       AND (last_sla_breach_at IS NULL OR datetime(last_sla_breach_at) < datetime(sla_deadline_at))`,
  ).bind(nowIso).all<NoticeRow>();

  const rows = rs.results || [];
  let breached = 0;
  for (const row of rows) {
    await env.DB.prepare(
      `UPDATE oe_consultation_notices
       SET last_sla_breach_at = ?, escalation_level = escalation_level + 1, updated_at = ?
       WHERE id = ?`,
    ).bind(nowIso, nowIso, row.id).run();

    const evtId = `cn_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
    await env.DB.prepare(
      'INSERT INTO oe_consultation_notices_events (id, notice_id, event_type, from_status, to_status, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).bind(
      evtId,
      row.id,
      'consultation_notice.sla_breached',
      row.chain_status,
      row.chain_status,
      'system',
      'system',
      `Auto-breach: ${row.chain_status} past SLA (tier ${row.consultation_tier})`,
      JSON.stringify({ sla_deadline_at: row.sla_deadline_at }),
      nowIso,
    ).run();

    if (slaBreachCrossesIntoRegulator(row.consultation_tier)) {
      await fireCascade({
        event: 'consultation_notice.sla_breached',
        actor_id: 'system',
        entity_type: 'consultation_notice',
        entity_id: row.id,
        data: {
          ...row,
          crosses_into_regulator: true,
        },
        env,
      });
    }

    breached++;
  }
  return { scanned: rows.length, breached };
}

export default app;
