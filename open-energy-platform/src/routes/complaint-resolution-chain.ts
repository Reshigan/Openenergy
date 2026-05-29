// ═══════════════════════════════════════════════════════════════════════════
// Wave 66 — Regulator Complaints & Dispute Resolution chain (P6)
//
// Mounted at /api/complaints/chain.
//
// NERSA acting as the quasi-judicial dispute forum under the Electricity
// Regulation Act 4 of 2006 section 30 (Disputes), the National Energy Regulator
// Act 40 of 2004, and NERSAs Complaints and Compliance Procedures. An external
// party (end-customer, licensee, IPP, offtaker) lodges a complaint/dispute
// against a licensee; NERSA registers it, screens admissibility, FIRST refers it
// to the respondent licensee for first-level resolution, and on failure escalates
// to a formal investigation, attempts mediation, convenes an adjudication
// hearing, issues a binding ruling, monitors the remedy and closes it resolved.
//
// Distinct from the regulators other chains by INTAKE SOURCE:
//   - W31 disposition triages matters CROSS-REFERRED into the NERSA inbox.
//   - W40 compliance-inspection is a PROACTIVE inspection NERSA initiates.
//   - W66 is REACTIVE: an EXTERNAL party brings a grievance and NERSA adjudicates.
//
//   complaint_lodged → admissibility_review → referred_to_licensee
//     → under_investigation → mediation → adjudication_hearing
//     → ruling_issued → remedy_monitoring → resolved          (full adjudication)
//   first-level: referred_to_licensee → resolved              (settle_at_licensee)
//   short-circuit: under_investigation → adjudication_hearing  (convene_hearing)
//   dismiss:  admissibility_review | under_investigation | adjudication_hearing → dismissed
//   appeal:   ruling_issued | remedy_monitoring → appealed
//   withdraw: complaint_lodged | admissibility_review | referred_to_licensee
//               | under_investigation | mediation → withdrawn
//
// Tiers (5) by AFFECTED PARTIES: minor <10 / moderate <100 / significant <1000 /
// major <10000 / systemic ≥10000. URGENT SLA — the LARGER the affected population,
// the TIGHTER every window (same flavour as W40 / W34).
//
// Single regulator-owned desk write {admin, regulator}. actor_party tags the
// functional party (complainant / respondent / adjudicator) for audit only.
//
// Reportability — the W66 SIGNATURE:
//   lodge_appeal crosses for EVERY tier (judicial review of a NERSA ruling is
//     always material). issue_ruling crosses for major + systemic. dismiss
//     crosses for systemic only. sla_breached crosses for major + systemic.
// ═══════════════════════════════════════════════════════════════════════════

import { Hono, Context } from 'hono';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { HonoEnv } from '../utils/types';
import { fireCascade } from '../utils/cascade';
import {
  nextStatus,
  isTerminal,
  slaDeadlineFor,
  crossesIntoRegulator,
  slaBreachCrossesIntoRegulator,
  partyForAction,
  tierForAffectedParties,
  SLA_MINUTES,
  type ComplaintStatus,
  type ComplaintAction,
  type ComplaintTier,
} from '../utils/complaint-resolution-spec';

const READ_ROLES = new Set([
  'admin',
  'regulator',
  'carbon_fund', 'ipp_developer', 'grid_operator', 'offtaker', 'lender', 'trader', 'support',
]);

// Single regulator-owned desk write — NERSA records the whole complaint lifecycle.
// actor_party tags the procedural function (complainant / respondent / adjudicator).
const WRITE_ROLES = new Set(['admin', 'regulator']);

const app = new Hono<HonoEnv>();
app.use('*', authMiddleware);

interface ComplaintRow {
  id: string;
  complaint_number: string;
  source_event: string | null;
  source_entity_type: string | null;
  source_entity_id: string | null;
  source_wave: string | null;
  complainant_id: string;
  complainant_name: string;
  complainant_type: 'customer' | 'licensee' | 'ipp' | 'offtaker' | 'municipality' | 'other';
  respondent_id: string;
  respondent_name: string;
  respondent_licence_no: string | null;
  complaint_category: 'billing' | 'supply_quality' | 'connection' | 'tariff' | 'metering' | 'service' | 'market_conduct' | 'other';
  complaint_tier: ComplaintTier;
  affected_customers: number | null;
  jurisdiction_basis: string | null;
  complaint_ref: string | null;
  referral_ref: string | null;
  investigation_ref: string | null;
  mediation_ref: string | null;
  hearing_ref: string | null;
  ruling_ref: string | null;
  appeal_ref: string | null;
  lodgement_basis: string | null;
  admissibility_basis: string | null;
  referral_basis: string | null;
  settlement_basis: string | null;
  investigation_basis: string | null;
  mediation_basis: string | null;
  hearing_basis: string | null;
  ruling_basis: string | null;
  remedy_basis: string | null;
  dismissal_basis: string | null;
  appeal_basis: string | null;
  reason_code: string | null;
  complaint_summary: string | null;
  remedy_directed: string | null;
  chain_status: ComplaintStatus;
  lodged_at: string;
  admissibility_review_at: string | null;
  referred_to_licensee_at: string | null;
  under_investigation_at: string | null;
  mediation_at: string | null;
  adjudication_hearing_at: string | null;
  ruling_issued_at: string | null;
  remedy_monitoring_at: string | null;
  resolved_at: string | null;
  dismissed_at: string | null;
  appealed_at: string | null;
  withdrawn_at: string | null;
  sla_deadline_at: string | null;
  last_sla_breach_at: string | null;
  is_reportable: number;
  escalation_level: number;
  created_by: string;
  created_at: string;
  updated_at: string;
}

interface ComplaintEventRow {
  id: string;
  complaint_id: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  actor_id: string | null;
  actor_party: string | null;
  notes: string | null;
  payload: string | null;
  created_at: string;
}

const TIMESTAMP_COLUMN: Record<ComplaintStatus, keyof ComplaintRow | null> = {
  complaint_lodged:     null,
  admissibility_review: 'admissibility_review_at',
  referred_to_licensee: 'referred_to_licensee_at',
  under_investigation:  'under_investigation_at',
  mediation:            'mediation_at',
  adjudication_hearing: 'adjudication_hearing_at',
  ruling_issued:        'ruling_issued_at',
  remedy_monitoring:    'remedy_monitoring_at',
  resolved:             'resolved_at',
  dismissed:            'dismissed_at',
  appealed:             'appealed_at',
  withdrawn:            'withdrawn_at',
};

function decorate(row: ComplaintRow, now: Date) {
  const tier = row.complaint_tier;
  const status = row.chain_status;
  const slaIso = row.sla_deadline_at;
  const minutesUntilSla = slaIso
    ? Math.floor((new Date(slaIso).getTime() - now.getTime()) / 60000)
    : null;
  return {
    ...row,
    is_terminal: isTerminal(status),
    minutes_until_sla: minutesUntilSla,
    sla_breached: minutesUntilSla != null && minutesUntilSla < 0,
    sla_window_minutes: SLA_MINUTES[status]?.[tier] ?? 0,
    is_reportable: !!row.is_reportable,
    breach_crosses_regulator: slaBreachCrossesIntoRegulator(tier),
  };
}

// settle_at_licensee and confirm_compliance both land in resolved → share the
// .resolved event downstream.
function eventTypeFor(action: ComplaintAction): string {
  switch (action) {
    case 'screen_admissibility':   return 'regulator_complaint.admissibility_review';
    case 'refer_to_licensee':      return 'regulator_complaint.referred';
    case 'settle_at_licensee':     return 'regulator_complaint.resolved';
    case 'escalate_investigation': return 'regulator_complaint.escalated';
    case 'initiate_mediation':     return 'regulator_complaint.mediating';
    case 'convene_hearing':        return 'regulator_complaint.hearing_convened';
    case 'issue_ruling':           return 'regulator_complaint.ruling_issued';
    case 'monitor_remedy':         return 'regulator_complaint.remedy_monitoring';
    case 'confirm_compliance':     return 'regulator_complaint.resolved';
    case 'dismiss':                return 'regulator_complaint.dismissed';
    case 'lodge_appeal':           return 'regulator_complaint.appealed';
    case 'withdraw':               return 'regulator_complaint.withdrawn';
  }
}

app.get('/', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const complaint_tier     = c.req.query('complaint_tier');
  const complaint_category = c.req.query('complaint_category');
  const status             = c.req.query('status');
  const breached           = c.req.query('breached');
  const reportable         = c.req.query('reportable');

  let sql = 'SELECT * FROM oe_regulator_complaints WHERE 1=1';
  const binds: unknown[] = [];
  if (complaint_tier)     { sql += ' AND complaint_tier = ?';     binds.push(complaint_tier); }
  if (complaint_category) { sql += ' AND complaint_category = ?'; binds.push(complaint_category); }
  if (status)             { sql += ' AND chain_status = ?';       binds.push(status); }

  sql += ' ORDER BY datetime(lodged_at) DESC LIMIT 500';

  const rs = await c.env.DB.prepare(sql).bind(...binds).all<ComplaintRow>();
  const now = new Date();
  let items = (rs.results || []).map((r) => decorate(r, now));
  if (breached === 'true')   items = items.filter((r) => r.sla_breached);
  if (reportable === 'true') items = items.filter((r) => r.is_reportable);

  const by_status: Record<string, number> = {};
  const by_tier: Record<string, number> = {};
  const by_category: Record<string, number> = {};
  for (const i of items) {
    by_status[i.chain_status] = (by_status[i.chain_status] || 0) + 1;
    by_tier[i.complaint_tier] = (by_tier[i.complaint_tier] || 0) + 1;
    by_category[i.complaint_category] = (by_category[i.complaint_category] || 0) + 1;
  }

  const open_count        = items.filter((i) => !i.is_terminal).length;
  const resolved_count    = items.filter((i) => i.chain_status === 'resolved').length;
  const dismissed_count   = items.filter((i) => i.chain_status === 'dismissed').length;
  const appealed_count    = items.filter((i) => i.chain_status === 'appealed').length;
  const withdrawn_count   = items.filter((i) => i.chain_status === 'withdrawn').length;
  const at_licensee_count = items.filter((i) => i.chain_status === 'referred_to_licensee').length;
  const investigation_count = items.filter((i) => i.chain_status === 'under_investigation').length;
  const mediation_count   = items.filter((i) => i.chain_status === 'mediation').length;
  const hearing_count     = items.filter((i) => i.chain_status === 'adjudication_hearing').length;
  const monitoring_count  = items.filter((i) => i.chain_status === 'remedy_monitoring').length;
  const breached_count    = items.filter((i) => i.sla_breached && !i.is_terminal).length;
  const reportable_total  = items.filter((i) => i.is_reportable).length;
  const large_open        = items.filter((i) =>
    !i.is_terminal && (i.complaint_tier === 'major' || i.complaint_tier === 'systemic')).length;
  const total_affected    = items.reduce((sum, i) => sum + (i.affected_customers || 0), 0);

  return c.json({
    success: true,
    data: {
      items,
      total: items.length,
      by_status,
      by_tier,
      by_category,
      open_count,
      resolved_count,
      dismissed_count,
      appealed_count,
      withdrawn_count,
      at_licensee_count,
      investigation_count,
      mediation_count,
      hearing_count,
      monitoring_count,
      breached: breached_count,
      reportable_total,
      large_open,
      total_affected,
    },
  });
});

app.get('/:id', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const id = c.req.param('id')!;
  const row = await c.env.DB.prepare('SELECT * FROM oe_regulator_complaints WHERE id = ?').bind(id).first<ComplaintRow>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const ev = await c.env.DB.prepare(
    'SELECT * FROM oe_regulator_complaints_events WHERE complaint_id = ? ORDER BY datetime(created_at) ASC',
  ).bind(id).all<ComplaintEventRow>();

  return c.json({
    success: true,
    data: {
      case: decorate(row, new Date()),
      events: ev.results || [],
    },
  });
});

interface ScreenBody {
  admissibility_basis?: string;
  jurisdiction_basis?: string;
  affected_customers?: number;
  notes?: string;
}
interface ReferBody {
  referral_basis?: string;
  referral_ref?: string;
  notes?: string;
}
interface SettleBody {
  settlement_basis?: string;
  remedy_directed?: string;
  complaint_summary?: string;
  notes?: string;
}
interface InvestigateBody {
  investigation_basis?: string;
  investigation_ref?: string;
  notes?: string;
}
interface MediateBody {
  mediation_basis?: string;
  mediation_ref?: string;
  notes?: string;
}
interface HearingBody {
  hearing_basis?: string;
  hearing_ref?: string;
  notes?: string;
}
interface RulingBody {
  ruling_basis?: string;
  ruling_ref?: string;
  remedy_directed?: string;
  notes?: string;
}
interface MonitorBody {
  remedy_basis?: string;
  notes?: string;
}
interface ConfirmBody {
  remedy_basis?: string;
  complaint_summary?: string;
  notes?: string;
}
interface DismissBody {
  dismissal_basis?: string;
  reason_code?: string;
  notes?: string;
}
interface AppealBody {
  appeal_basis?: string;
  appeal_ref?: string;
  reason_code?: string;
  notes?: string;
}
interface WithdrawBody {
  reason_code?: string;
  notes?: string;
}

async function transition(
  c: Context<HonoEnv>,
  action: ComplaintAction,
  bodyHandler?: (row: ComplaintRow, body: Record<string, unknown>) => Partial<ComplaintRow>,
) {
  const user = getCurrentUser(c);
  if (!user || !WRITE_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const id = c.req.param('id')!;
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const notes = typeof body.notes === 'string' ? body.notes : null;

  const row = await c.env.DB.prepare('SELECT * FROM oe_regulator_complaints WHERE id = ?').bind(id).first<ComplaintRow>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const to = nextStatus(row.chain_status, action);
  if (!to) {
    return c.json({
      success: false,
      error: `Invalid transition: ${row.chain_status} → ${action}`,
    }, 422);
  }

  const overrides = bodyHandler ? bodyHandler(row, body) : {};
  // Tier can be re-derived at admissibility screening from the declared count.
  const effectiveTier = (overrides.complaint_tier as ComplaintTier) || row.complaint_tier;

  const tsCol = TIMESTAMP_COLUMN[to];
  const now = new Date();
  const nowIso = now.toISOString();
  const sla = slaDeadlineFor(to, effectiveTier, now);
  const slaIso = sla ? sla.toISOString() : null;

  const crosses = crossesIntoRegulator(action, effectiveTier);
  if (crosses) overrides.is_reportable = 1;

  const setClauses: string[] = ['chain_status = ?', 'updated_at = ?', 'sla_deadline_at = ?'];
  const setBinds: unknown[] = [to, nowIso, slaIso];
  if (tsCol) {
    setClauses.push(`${tsCol} = ?`);
    setBinds.push(nowIso);
  }
  for (const [k, v] of Object.entries(overrides)) {
    setClauses.push(`${k} = ?`);
    setBinds.push(v);
  }
  setBinds.push(id);

  await c.env.DB.prepare(
    `UPDATE oe_regulator_complaints SET ${setClauses.join(', ')} WHERE id = ?`,
  ).bind(...setBinds).run();

  const evtId = `cmp_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
  await c.env.DB.prepare(
    'INSERT INTO oe_regulator_complaints_events (id, complaint_id, event_type, from_status, to_status, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  ).bind(
    evtId,
    id,
    eventTypeFor(action),
    row.chain_status,
    to,
    user.id,
    partyForAction(action),
    notes,
    JSON.stringify(overrides),
    nowIso,
  ).run();

  const eventName = eventTypeFor(action) as Parameters<typeof fireCascade>[0]['event'];
  await fireCascade({
    event: eventName,
    actor_id: user.id,
    entity_type: 'regulator_complaint',
    entity_id: id,
    data: {
      ...row,
      ...overrides,
      complaint_tier: effectiveTier,
      chain_status: to,
      from_status: row.chain_status,
      action,
      crosses_into_regulator: crosses,
    },
    env: c.env,
  });

  const refreshed = await c.env.DB.prepare('SELECT * FROM oe_regulator_complaints WHERE id = ?').bind(id).first<ComplaintRow>();
  return c.json({ success: true, data: { case: refreshed ? decorate(refreshed, now) : null } });
}

app.post('/:id/screen-admissibility', async (c) => transition(c, 'screen_admissibility', (_row, body) => {
  const b = body as Partial<ScreenBody>;
  const out: Partial<ComplaintRow> = {};
  if (typeof b.admissibility_basis === 'string') out.admissibility_basis = b.admissibility_basis;
  if (typeof b.jurisdiction_basis === 'string')  out.jurisdiction_basis = b.jurisdiction_basis;
  if (typeof b.affected_customers === 'number') {
    out.affected_customers = b.affected_customers;
    out.complaint_tier = tierForAffectedParties(b.affected_customers);
  }
  return out;
}));

app.post('/:id/refer-to-licensee', async (c) => transition(c, 'refer_to_licensee', (_row, body) => {
  const b = body as Partial<ReferBody>;
  const out: Partial<ComplaintRow> = {};
  if (typeof b.referral_basis === 'string') out.referral_basis = b.referral_basis;
  if (typeof b.referral_ref === 'string')   out.referral_ref = b.referral_ref;
  return out;
}));

app.post('/:id/settle-at-licensee', async (c) => transition(c, 'settle_at_licensee', (_row, body) => {
  const b = body as Partial<SettleBody>;
  const out: Partial<ComplaintRow> = {};
  if (typeof b.settlement_basis === 'string') out.settlement_basis = b.settlement_basis;
  if (typeof b.remedy_directed === 'string')  out.remedy_directed = b.remedy_directed;
  if (typeof b.complaint_summary === 'string') out.complaint_summary = b.complaint_summary;
  return out;
}));

app.post('/:id/escalate-investigation', async (c) => transition(c, 'escalate_investigation', (_row, body) => {
  const b = body as Partial<InvestigateBody>;
  const out: Partial<ComplaintRow> = { escalation_level: 1 };
  if (typeof b.investigation_basis === 'string') out.investigation_basis = b.investigation_basis;
  if (typeof b.investigation_ref === 'string')   out.investigation_ref = b.investigation_ref;
  return out;
}));

app.post('/:id/initiate-mediation', async (c) => transition(c, 'initiate_mediation', (_row, body) => {
  const b = body as Partial<MediateBody>;
  const out: Partial<ComplaintRow> = {};
  if (typeof b.mediation_basis === 'string') out.mediation_basis = b.mediation_basis;
  if (typeof b.mediation_ref === 'string')   out.mediation_ref = b.mediation_ref;
  return out;
}));

app.post('/:id/convene-hearing', async (c) => transition(c, 'convene_hearing', (_row, body) => {
  const b = body as Partial<HearingBody>;
  const out: Partial<ComplaintRow> = {};
  if (typeof b.hearing_basis === 'string') out.hearing_basis = b.hearing_basis;
  if (typeof b.hearing_ref === 'string')   out.hearing_ref = b.hearing_ref;
  return out;
}));

app.post('/:id/issue-ruling', async (c) => transition(c, 'issue_ruling', (_row, body) => {
  const b = body as Partial<RulingBody>;
  const out: Partial<ComplaintRow> = {};
  if (typeof b.ruling_basis === 'string')    out.ruling_basis = b.ruling_basis;
  if (typeof b.ruling_ref === 'string')      out.ruling_ref = b.ruling_ref;
  if (typeof b.remedy_directed === 'string') out.remedy_directed = b.remedy_directed;
  return out;
}));

app.post('/:id/monitor-remedy', async (c) => transition(c, 'monitor_remedy', (_row, body) => {
  const b = body as Partial<MonitorBody>;
  const out: Partial<ComplaintRow> = {};
  if (typeof b.remedy_basis === 'string') out.remedy_basis = b.remedy_basis;
  return out;
}));

app.post('/:id/confirm-compliance', async (c) => transition(c, 'confirm_compliance', (_row, body) => {
  const b = body as Partial<ConfirmBody>;
  const out: Partial<ComplaintRow> = {};
  if (typeof b.remedy_basis === 'string')      out.remedy_basis = b.remedy_basis;
  if (typeof b.complaint_summary === 'string') out.complaint_summary = b.complaint_summary;
  return out;
}));

app.post('/:id/dismiss', async (c) => transition(c, 'dismiss', (_row, body) => {
  const b = body as Partial<DismissBody>;
  const out: Partial<ComplaintRow> = {};
  if (typeof b.dismissal_basis === 'string') out.dismissal_basis = b.dismissal_basis;
  if (typeof b.reason_code === 'string')     out.reason_code = b.reason_code;
  return out;
}));

app.post('/:id/lodge-appeal', async (c) => transition(c, 'lodge_appeal', (_row, body) => {
  const b = body as Partial<AppealBody>;
  const out: Partial<ComplaintRow> = { escalation_level: 1 };
  if (typeof b.appeal_basis === 'string') out.appeal_basis = b.appeal_basis;
  if (typeof b.appeal_ref === 'string')   out.appeal_ref = b.appeal_ref;
  if (typeof b.reason_code === 'string')  out.reason_code = b.reason_code;
  return out;
}));

app.post('/:id/withdraw', async (c) => transition(c, 'withdraw', (_row, body) => {
  const b = body as Partial<WithdrawBody>;
  const out: Partial<ComplaintRow> = {};
  if (typeof b.reason_code === 'string') out.reason_code = b.reason_code;
  return out;
}));

// SLA sweep: record an SLA breach on any non-terminal complaint past its deadline,
// crossing to the NERSA Council for the large tiers (major + systemic).
export async function complaintResolutionSlaSweep(env: HonoEnv['Bindings']): Promise<{ scanned: number; breached: number }> {
  const now = new Date();
  const nowIso = now.toISOString();

  const rs = await env.DB.prepare(
    `SELECT * FROM oe_regulator_complaints
     WHERE chain_status NOT IN ('resolved','dismissed','appealed','withdrawn')
       AND sla_deadline_at IS NOT NULL
       AND datetime(sla_deadline_at) < datetime(?)
       AND (last_sla_breach_at IS NULL OR datetime(last_sla_breach_at) < datetime(sla_deadline_at))`,
  ).bind(nowIso).all<ComplaintRow>();

  const rows = rs.results || [];
  let breached = 0;
  for (const row of rows) {
    await env.DB.prepare(
      `UPDATE oe_regulator_complaints
       SET last_sla_breach_at = ?, escalation_level = escalation_level + 1, updated_at = ?
       WHERE id = ?`,
    ).bind(nowIso, nowIso, row.id).run();

    const evtId = `cmp_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
    await env.DB.prepare(
      'INSERT INTO oe_regulator_complaints_events (id, complaint_id, event_type, from_status, to_status, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).bind(
      evtId,
      row.id,
      'regulator_complaint.sla_breached',
      row.chain_status,
      row.chain_status,
      'system',
      'system',
      `Auto-breach: ${row.chain_status} past SLA (tier ${row.complaint_tier})`,
      JSON.stringify({ sla_deadline_at: row.sla_deadline_at }),
      nowIso,
    ).run();

    if (slaBreachCrossesIntoRegulator(row.complaint_tier)) {
      await fireCascade({
        event: 'regulator_complaint.sla_breached',
        actor_id: 'system',
        entity_type: 'regulator_complaint',
        entity_id: row.id,
        data: { ...row, crosses_into_regulator: true },
        env,
      });
    }

    breached++;
  }

  return { scanned: rows.length, breached };
}

export default app;
