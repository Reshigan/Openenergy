// ═══════════════════════════════════════════════════════════════════════════
// Wave 31 — Regulator Compliance Notice Disposition chain — NERSA Act §10
//
// Mounted at /api/disposition/chain.
//
// 11-state lifecycle for how the Regulator disposes of every inbox notice
// crossed in by other waves (W18 critical outages, W21 senior drawdowns,
// W22 strategic PPA terminations, W23 catastrophic insurance, W25 fatal HSE,
// W26 catastrophic cyber, W27 high-scoring ED, W29 prop/MM position limits,
// W30 lender clawbacks/SLA breaches, etc).
//
// Statutory anchor: NERSA Act 2004 §10(2) — 90-day disposition window.
//
// Forward path:
//   received → triaged → assigned → investigating → action_required →
//   action_in_progress → action_completed → closed
//
// Branch terminals:
//   escalated  — Council senior panel / NERSA DG
//   dismissed  — false alarm / no jurisdiction
//   referred   — handed to other authority (SAPS, DMRE, FSCA, NEMA, DEL)
//
// Tiers (severity — INVERTED SLA, critical fastest):
//   critical  — 4h triage, 30d total
//   high      — 24h triage, 60d total
//   medium    — 72h triage, 90d total (Section 10 statutory)
//   low       — 7d triage, 180d total
//
// Reportability (NERSA Council §10 monthly report):
//   - close + escalate cross for critical + high tiers
//   - sla_breached crosses for ALL tiers (Section 10 hard line — DG reporting)
//   - dismiss + refer are audit-only
//
// Write roles: admin, support, regulator. Single-party write — no split.
// ═══════════════════════════════════════════════════════════════════════════

import { Hono, Context } from 'hono';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { HonoEnv } from '../utils/types';
import { fireCascade } from '../utils/cascade';
import {
  nextStatus,
  isTerminal,
  slaDeadlineFor,
  crossesIntoCouncil,
  slaBreachCrossesIntoCouncil,
  isReportable,
  SLA_MINUTES,
  type DispositionStatus,
  type DispositionAction,
  type DispositionTier,
} from '../utils/disposition-chain-spec';

const READ_ROLES = new Set([
  'admin', 'support',
  'regulator',
]);
const WRITE_ROLES = new Set([
  'admin', 'support',
  'regulator',
]);

const ACTION_ROLE_SET: Record<DispositionAction, Set<string>> = {
  triage:              WRITE_ROLES,
  assign:              WRITE_ROLES,
  begin_investigation: WRITE_ROLES,
  require_action:      WRITE_ROLES,
  begin_action:        WRITE_ROLES,
  complete_action:     WRITE_ROLES,
  close:               WRITE_ROLES,
  escalate:            WRITE_ROLES,
  dismiss:             WRITE_ROLES,
  refer:               WRITE_ROLES,
};

const app = new Hono<HonoEnv>();
app.use('*', authMiddleware);

interface DispositionRow {
  id: string;
  case_number: string;
  source_inbox_id: string | null;
  source_event: string | null;
  source_entity_type: string | null;
  source_entity_id: string | null;
  source_wave: string | null;
  source_party: string | null;
  notice_subject: string;
  severity_tier: DispositionTier;
  assigned_officer: string | null;
  assigned_directorate: string | null;
  investigation_findings: string | null;
  required_action: string | null;
  action_evidence_ref: string | null;
  disposition_outcome: string | null;
  referred_authority: string | null;
  referred_ref: string | null;
  council_panel_ref: string | null;
  council_minute_ref: string | null;
  section10_report_ref: string | null;
  reason_code: string | null;
  rod_notes: string | null;
  regulator_authority: string;
  regulator_ref: string | null;
  chain_status: DispositionStatus;
  received_at: string;
  triaged_at: string | null;
  assigned_at: string | null;
  investigating_at: string | null;
  action_required_at: string | null;
  action_in_progress_at: string | null;
  action_completed_at: string | null;
  closed_at: string | null;
  escalated_at: string | null;
  dismissed_at: string | null;
  referred_at: string | null;
  sla_deadline_at: string | null;
  last_sla_breach_at: string | null;
  escalation_level: number;
  created_by: string;
  created_at: string;
  updated_at: string;
}

interface EventRow {
  id: string;
  disposition_id: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  actor_id: string | null;
  notes: string | null;
  payload: string | null;
  created_at: string;
}

const TIMESTAMP_COLUMN: Record<DispositionStatus, keyof DispositionRow | null> = {
  received:           null,
  triaged:            'triaged_at',
  assigned:           'assigned_at',
  investigating:      'investigating_at',
  action_required:    'action_required_at',
  action_in_progress: 'action_in_progress_at',
  action_completed:   'action_completed_at',
  closed:             'closed_at',
  escalated:          'escalated_at',
  dismissed:          'dismissed_at',
  referred:           'referred_at',
};

function decorate(row: DispositionRow, now: Date) {
  const tier = row.severity_tier;
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
    is_reportable: isReportable(tier),
    breach_crosses_council: slaBreachCrossesIntoCouncil(tier),
  };
}

function eventTypeFor(action: DispositionAction): string {
  switch (action) {
    case 'triage':              return 'triaged';
    case 'assign':              return 'assigned';
    case 'begin_investigation': return 'investigating';
    case 'require_action':      return 'action_required';
    case 'begin_action':        return 'action_in_progress';
    case 'complete_action':     return 'action_completed';
    case 'close':               return 'closed';
    case 'escalate':            return 'escalated';
    case 'dismiss':             return 'dismissed';
    case 'refer':               return 'referred';
  }
}

function cascadeEventFor(action: DispositionAction): string {
  switch (action) {
    case 'triage':              return 'disposition.triaged';
    case 'assign':              return 'disposition.assigned';
    case 'begin_investigation': return 'disposition.investigating';
    case 'require_action':      return 'disposition.action_required';
    case 'begin_action':        return 'disposition.action_in_progress';
    case 'complete_action':     return 'disposition.action_completed';
    case 'close':               return 'disposition.closed';
    case 'escalate':            return 'disposition.escalated';
    case 'dismiss':             return 'disposition.dismissed';
    case 'refer':               return 'disposition.referred';
  }
}

app.get('/', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const tier = c.req.query('tier');
  const status = c.req.query('status');
  const breached = c.req.query('breached');
  const source_wave = c.req.query('source_wave');
  const source_party = c.req.query('source_party');
  const assigned_officer = c.req.query('assigned_officer');

  let sql = 'SELECT * FROM oe_disposition_cases WHERE 1=1';
  const binds: unknown[] = [];
  if (tier)             { sql += ' AND severity_tier = ?';     binds.push(tier); }
  if (status)           { sql += ' AND chain_status = ?';      binds.push(status); }
  if (source_wave)      { sql += ' AND source_wave = ?';       binds.push(source_wave); }
  if (source_party)     { sql += ' AND source_party = ?';      binds.push(source_party); }
  if (assigned_officer) { sql += ' AND assigned_officer = ?';  binds.push(assigned_officer); }

  sql += ' ORDER BY datetime(received_at) DESC LIMIT 500';

  const rs = await c.env.DB.prepare(sql).bind(...binds).all<DispositionRow>();
  const now = new Date();
  let items = (rs.results || []).map((r) => decorate(r, now));
  if (breached === 'true') items = items.filter((r) => r.sla_breached);

  const by_status: Record<string, number> = {};
  const by_tier: Record<string, number> = {};
  for (const i of items) {
    by_status[i.chain_status] = (by_status[i.chain_status] || 0) + 1;
    by_tier[i.severity_tier] = (by_tier[i.severity_tier] || 0) + 1;
  }

  const investigating_open = items.filter((i) => i.chain_status === 'investigating').length;
  const action_open = items.filter(
    (i) =>
      i.chain_status === 'action_required' ||
      i.chain_status === 'action_in_progress' ||
      i.chain_status === 'action_completed',
  ).length;
  const closed_count = items.filter((i) => i.chain_status === 'closed').length;
  const escalated_count = items.filter((i) => i.chain_status === 'escalated').length;
  const dismissed_count = items.filter((i) => i.chain_status === 'dismissed').length;
  const referred_count = items.filter((i) => i.chain_status === 'referred').length;
  const open_count = items.filter((i) => !i.is_terminal).length;
  const breached_count = items.filter((i) => i.sla_breached && !i.is_terminal).length;
  const reportable_total = items.filter((i) => i.is_reportable).length;
  const reportable_terminal_total = items.filter(
    (i) => i.is_reportable && (i.chain_status === 'closed' || i.chain_status === 'escalated'),
  ).length;
  const critical_open = items.filter(
    (i) => !i.is_terminal && i.severity_tier === 'critical',
  ).length;
  const high_open = items.filter(
    (i) => !i.is_terminal && i.severity_tier === 'high',
  ).length;

  return c.json({
    success: true,
    data: {
      items,
      total: items.length,
      by_status,
      by_tier,
      investigating_open,
      action_open,
      closed_count,
      escalated_count,
      dismissed_count,
      referred_count,
      open_count,
      breached: breached_count,
      reportable_total,
      reportable_terminal_total,
      critical_open,
      high_open,
    },
  });
});

app.get('/:id', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const id = c.req.param('id')!;
  const row = await c.env.DB.prepare('SELECT * FROM oe_disposition_cases WHERE id = ?').bind(id).first<DispositionRow>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const ev = await c.env.DB.prepare(
    'SELECT * FROM oe_disposition_events WHERE disposition_id = ? ORDER BY datetime(created_at) ASC',
  ).bind(id).all<EventRow>();

  return c.json({
    success: true,
    data: {
      case: decorate(row, new Date()),
      events: ev.results || [],
    },
  });
});

interface TriageBody {
  severity_tier?: DispositionTier;
  notes?: string;
}

interface AssignBody {
  assigned_officer?: string;
  assigned_directorate?: string;
  notes?: string;
}

interface RequireActionBody {
  investigation_findings?: string;
  required_action?: string;
  notes?: string;
}

interface CompleteActionBody {
  action_evidence_ref?: string;
  notes?: string;
}

interface CloseBody {
  disposition_outcome?: string;
  council_panel_ref?: string;
  council_minute_ref?: string;
  section10_report_ref?: string;
  regulator_ref?: string;
  notes?: string;
}

interface EscalateBody {
  council_panel_ref?: string;
  council_minute_ref?: string;
  section10_report_ref?: string;
  reason_code?: string;
  rod_notes?: string;
  notes?: string;
}

interface DismissBody {
  reason_code?: string;
  rod_notes?: string;
  notes?: string;
}

interface ReferBody {
  referred_authority?: string;
  referred_ref?: string;
  reason_code?: string;
  rod_notes?: string;
  notes?: string;
}

async function transition(
  c: Context<HonoEnv>,
  action: DispositionAction,
  bodyHandler?: (row: DispositionRow, body: Record<string, unknown>) => Partial<DispositionRow>,
) {
  const user = getCurrentUser(c);
  const allowed = ACTION_ROLE_SET[action];
  if (!user || !allowed.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const id = c.req.param('id')!;
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const notes = typeof body.notes === 'string' ? body.notes : null;

  const row = await c.env.DB.prepare('SELECT * FROM oe_disposition_cases WHERE id = ?').bind(id).first<DispositionRow>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const to = nextStatus(row.chain_status, action);
  if (!to) {
    return c.json({
      success: false,
      error: `Invalid transition: ${row.chain_status} → ${action}`,
    }, 422);
  }

  const tsCol = TIMESTAMP_COLUMN[to];
  const now = new Date();
  const nowIso = now.toISOString();
  const sla = slaDeadlineFor(to, row.severity_tier, now);
  const slaIso = sla ? sla.toISOString() : null;

  const overrides = bodyHandler ? bodyHandler(row, body) : {};
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
    `UPDATE oe_disposition_cases SET ${setClauses.join(', ')} WHERE id = ?`,
  ).bind(...setBinds).run();

  const evtId = `disp_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
  await c.env.DB.prepare(
    'INSERT INTO oe_disposition_events (id, disposition_id, event_type, from_status, to_status, actor_id, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
  ).bind(
    evtId,
    id,
    eventTypeFor(action),
    row.chain_status,
    to,
    user.id,
    notes,
    JSON.stringify(overrides),
    nowIso,
  ).run();

  const eventName = cascadeEventFor(action) as Parameters<typeof fireCascade>[0]['event'];
  await fireCascade({
    event: eventName,
    actor_id: user.id,
    entity_type: 'disposition_case',
    entity_id: id,
    data: {
      ...row,
      ...overrides,
      chain_status: to,
      from_status: row.chain_status,
      crosses_into_council: crossesIntoCouncil(action, row.severity_tier),
    },
    env: c.env,
  });

  const refreshed = await c.env.DB.prepare('SELECT * FROM oe_disposition_cases WHERE id = ?').bind(id).first<DispositionRow>();
  return c.json({ success: true, data: { case: refreshed ? decorate(refreshed, now) : null } });
}

app.post('/:id/triage', async (c) => transition(c, 'triage', (_row, body) => {
  const b = body as Partial<TriageBody>;
  const out: Partial<DispositionRow> = {};
  if (b.severity_tier === 'critical' || b.severity_tier === 'high' || b.severity_tier === 'medium' || b.severity_tier === 'low') {
    out.severity_tier = b.severity_tier;
  }
  return out;
}));

app.post('/:id/assign', async (c) => transition(c, 'assign', (_row, body) => {
  const b = body as Partial<AssignBody>;
  const out: Partial<DispositionRow> = {};
  if (typeof b.assigned_officer === 'string')      out.assigned_officer = b.assigned_officer;
  if (typeof b.assigned_directorate === 'string')  out.assigned_directorate = b.assigned_directorate;
  return out;
}));

app.post('/:id/begin-investigation', async (c) => transition(c, 'begin_investigation'));

app.post('/:id/require-action', async (c) => transition(c, 'require_action', (_row, body) => {
  const b = body as Partial<RequireActionBody>;
  const out: Partial<DispositionRow> = {};
  if (typeof b.investigation_findings === 'string') out.investigation_findings = b.investigation_findings;
  if (typeof b.required_action === 'string')        out.required_action = b.required_action;
  return out;
}));

app.post('/:id/begin-action', async (c) => transition(c, 'begin_action'));

app.post('/:id/complete-action', async (c) => transition(c, 'complete_action', (_row, body) => {
  const b = body as Partial<CompleteActionBody>;
  const out: Partial<DispositionRow> = {};
  if (typeof b.action_evidence_ref === 'string') out.action_evidence_ref = b.action_evidence_ref;
  return out;
}));

app.post('/:id/close', async (c) => transition(c, 'close', (_row, body) => {
  const b = body as Partial<CloseBody>;
  const out: Partial<DispositionRow> = {};
  if (typeof b.disposition_outcome === 'string')   out.disposition_outcome = b.disposition_outcome;
  if (typeof b.council_panel_ref === 'string')     out.council_panel_ref = b.council_panel_ref;
  if (typeof b.council_minute_ref === 'string')    out.council_minute_ref = b.council_minute_ref;
  if (typeof b.section10_report_ref === 'string')  out.section10_report_ref = b.section10_report_ref;
  if (typeof b.regulator_ref === 'string')         out.regulator_ref = b.regulator_ref;
  return out;
}));

app.post('/:id/escalate', async (c) => transition(c, 'escalate', (_row, body) => {
  const b = body as Partial<EscalateBody>;
  const out: Partial<DispositionRow> = {};
  if (typeof b.council_panel_ref === 'string')     out.council_panel_ref = b.council_panel_ref;
  if (typeof b.council_minute_ref === 'string')    out.council_minute_ref = b.council_minute_ref;
  if (typeof b.section10_report_ref === 'string')  out.section10_report_ref = b.section10_report_ref;
  if (typeof b.reason_code === 'string')           out.reason_code = b.reason_code;
  if (typeof b.rod_notes === 'string')             out.rod_notes = b.rod_notes;
  return out;
}));

app.post('/:id/dismiss', async (c) => transition(c, 'dismiss', (_row, body) => {
  const b = body as Partial<DismissBody>;
  const out: Partial<DispositionRow> = {};
  if (typeof b.reason_code === 'string') out.reason_code = b.reason_code;
  if (typeof b.rod_notes === 'string')   out.rod_notes = b.rod_notes;
  return out;
}));

app.post('/:id/refer', async (c) => transition(c, 'refer', (_row, body) => {
  const b = body as Partial<ReferBody>;
  const out: Partial<DispositionRow> = {};
  if (typeof b.referred_authority === 'string') out.referred_authority = b.referred_authority;
  if (typeof b.referred_ref === 'string')       out.referred_ref = b.referred_ref;
  if (typeof b.reason_code === 'string')        out.reason_code = b.reason_code;
  if (typeof b.rod_notes === 'string')          out.rod_notes = b.rod_notes;
  return out;
}));

export async function dispositionSlaSweep(env: HonoEnv['Bindings']): Promise<{ scanned: number; breached: number }> {
  const now = new Date();
  const nowIso = now.toISOString();
  const rs = await env.DB.prepare(
    `SELECT * FROM oe_disposition_cases
     WHERE chain_status NOT IN ('closed','escalated','dismissed','referred')
       AND sla_deadline_at IS NOT NULL
       AND datetime(sla_deadline_at) < datetime(?)
       AND (last_sla_breach_at IS NULL OR datetime(last_sla_breach_at) < datetime(sla_deadline_at))`,
  ).bind(nowIso).all<DispositionRow>();

  const rows = rs.results || [];
  let breached = 0;
  for (const row of rows) {
    await env.DB.prepare(
      `UPDATE oe_disposition_cases
       SET last_sla_breach_at = ?, escalation_level = escalation_level + 1, updated_at = ?
       WHERE id = ?`,
    ).bind(nowIso, nowIso, row.id).run();

    const evtId = `disp_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
    await env.DB.prepare(
      'INSERT INTO oe_disposition_events (id, disposition_id, event_type, from_status, to_status, actor_id, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).bind(
      evtId,
      row.id,
      'sla_breached',
      row.chain_status,
      row.chain_status,
      'system',
      `Auto-breach: ${row.chain_status} past SLA (tier ${row.severity_tier})`,
      JSON.stringify({ sla_deadline_at: row.sla_deadline_at }),
      nowIso,
    ).run();

    if (slaBreachCrossesIntoCouncil(row.severity_tier)) {
      await fireCascade({
        event: 'disposition.sla_breached',
        actor_id: 'system',
        entity_type: 'disposition_case',
        entity_id: row.id,
        data: {
          ...row,
          crosses_into_council: true,
        },
        env,
      });
    }

    breached++;
  }
  return { scanned: rows.length, breached };
}

export default app;
