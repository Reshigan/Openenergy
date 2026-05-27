// ═══════════════════════════════════════════════════════════════════════════
// Wave 26 — Cybersecurity / POPIA Section 22 breach incident chain.
//
// Mounted at /api/cyber/incident-chain.
//
// 10-state digital security incident lifecycle:
//   detected → triaged → contained → notified_regulator → notified_subjects →
//   investigating → remediation_planned → remediation_executing →
//   verified → closed
// Branches: escalated (criminal referral), false_alarm (initial re-class).
//
// Tiers: catastrophic | major | personal_data | operational | low.
// Reportable tiers (catastrophic/major/personal_data) cross into regulator
// inbox on notify_regulator + escalate + close + close_escalated + sla_breached.
//
// Roles:
//   READ:  admin, support, compliance, regulator, ipp, ipp_developer,
//          esums, esums_om, trader
//   WRITE: admin, support, compliance
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
  SLA_MINUTES,
  type CyberStatus,
  type CyberAction,
  type CyberTier,
} from '../utils/cyber-incident-chain-spec';

const READ_ROLES = new Set([
  'admin', 'support', 'compliance',
  'regulator',
  'ipp', 'ipp_developer',
  'esums', 'esums_om',
  'trader',
]);
const WRITE_ROLES = new Set([
  'admin', 'support', 'compliance',
]);

const app = new Hono<HonoEnv>();
app.use('*', authMiddleware);

interface CyberRow {
  id: string;
  case_number: string;
  asset_scope: string;
  affected_system: string;
  project_id: string | null;
  detected_at: string;
  reported_at: string;
  reported_by: string;
  incident_type: string;
  incident_tier: CyberTier;
  threat_vector: string;
  records_affected: number;
  data_categories: string | null;
  containment_summary: string | null;
  rca_summary: string | null;
  remediation_plan: string | null;
  linked_wo_id: string | null;
  regulator_notified: number;
  regulator_authority: string | null;
  regulator_ref: string | null;
  subjects_notified: number;
  subjects_notified_count: number;
  chain_status: CyberStatus;
  triaged_at: string | null;
  contained_at: string | null;
  notified_regulator_at: string | null;
  notified_subjects_at: string | null;
  investigating_at: string | null;
  remediation_planned_at: string | null;
  remediation_executing_at: string | null;
  verified_at: string | null;
  escalated_at: string | null;
  false_alarm_at: string | null;
  closed_at: string | null;
  closure_notes: string | null;
  sla_deadline_at: string | null;
  last_sla_breach_at: string | null;
  escalation_level: number;
  created_by: string;
  created_at: string;
  updated_at: string;
}

interface EventRow {
  id: string;
  incident_id: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  actor_id: string | null;
  notes: string | null;
  payload: string | null;
  created_at: string;
}

const TIMESTAMP_COLUMN: Record<CyberStatus, keyof CyberRow | null> = {
  detected:              null,
  triaged:               'triaged_at',
  contained:             'contained_at',
  notified_regulator:    'notified_regulator_at',
  notified_subjects:     'notified_subjects_at',
  investigating:         'investigating_at',
  remediation_planned:   'remediation_planned_at',
  remediation_executing: 'remediation_executing_at',
  verified:              'verified_at',
  closed:                'closed_at',
  escalated:             'escalated_at',
  false_alarm:           'false_alarm_at',
};

function decorate(row: CyberRow, now: Date) {
  const tier = row.incident_tier;
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
    is_reportable: tier === 'catastrophic' || tier === 'major' || tier === 'personal_data',
  };
}

function eventTypeFor(action: CyberAction): string {
  switch (action) {
    case 'triage':               return 'triaged';
    case 'contain':              return 'contained';
    case 'notify_regulator':     return 'notified_regulator';
    case 'notify_subjects':      return 'notified_subjects';
    case 'skip_notify':          return 'investigation_started';
    case 'begin_investigation':  return 'investigation_started';
    case 'complete_rca':         return 'rca_completed';
    case 'dispatch_remediation': return 'remediation_dispatched';
    case 'verify_remediation':   return 'remediation_verified';
    case 'close':                return 'closed';
    case 'escalate':             return 'escalated';
    case 'close_escalated':      return 'closed_escalated';
    case 'mark_false_alarm':     return 'false_alarm';
    case 'close_false_alarm':    return 'closed_false_alarm';
  }
}

function cascadeEventFor(action: CyberAction): string {
  switch (action) {
    case 'triage':               return 'cyber_incident.triaged';
    case 'contain':              return 'cyber_incident.contained';
    case 'notify_regulator':     return 'cyber_incident.notified_regulator';
    case 'notify_subjects':      return 'cyber_incident.notified_subjects';
    case 'skip_notify':          return 'cyber_incident.investigating';
    case 'begin_investigation':  return 'cyber_incident.investigating';
    case 'complete_rca':         return 'cyber_incident.remediation_planned';
    case 'dispatch_remediation': return 'cyber_incident.remediation_executing';
    case 'verify_remediation':   return 'cyber_incident.verified';
    case 'close':                return 'cyber_incident.closed';
    case 'escalate':             return 'cyber_incident.escalated';
    case 'close_escalated':      return 'cyber_incident.closed';
    case 'mark_false_alarm':     return 'cyber_incident.false_alarm';
    case 'close_false_alarm':    return 'cyber_incident.closed';
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
  const asset_scope = c.req.query('asset_scope');
  const project_id = c.req.query('project_id');

  let sql = 'SELECT * FROM oe_cyber_incidents WHERE 1=1';
  const binds: unknown[] = [];
  if (tier)        { sql += ' AND incident_tier = ?'; binds.push(tier); }
  if (status)      { sql += ' AND chain_status = ?';   binds.push(status); }
  if (asset_scope) { sql += ' AND asset_scope = ?';    binds.push(asset_scope); }
  if (project_id)  { sql += ' AND project_id = ?';     binds.push(project_id); }

  sql += ' ORDER BY datetime(detected_at) DESC LIMIT 500';

  const rs = await c.env.DB.prepare(sql).bind(...binds).all<CyberRow>();
  const now = new Date();
  let items = (rs.results || []).map((r) => decorate(r, now));
  if (breached === 'true') items = items.filter((r) => r.sla_breached);

  const by_status: Record<string, number> = {};
  const by_tier: Record<string, number> = {};
  for (const i of items) {
    by_status[i.chain_status] = (by_status[i.chain_status] || 0) + 1;
    by_tier[i.incident_tier] = (by_tier[i.incident_tier] || 0) + 1;
  }

  const reportable_open = items.filter(
    (i) => i.is_reportable && !i.is_terminal,
  ).length;
  const notify_regulator_pending = items.filter(
    (i) => i.is_reportable && i.chain_status === 'contained',
  ).length;
  const escalated_open = items.filter(
    (i) => i.chain_status === 'escalated',
  ).length;
  const open_count = items.filter((i) => !i.is_terminal).length;
  const breached_count = items.filter((i) => i.sla_breached && !i.is_terminal).length;
  const records_affected_total = items.reduce(
    (s, i) => s + (i.records_affected || 0), 0,
  );

  return c.json({
    success: true,
    data: {
      items,
      total: items.length,
      by_status,
      by_tier,
      reportable_open,
      notify_regulator_pending,
      escalated_open,
      open_count,
      breached: breached_count,
      records_affected_total,
    },
  });
});

app.get('/:id', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const id = c.req.param('id')!;
  const row = await c.env.DB.prepare('SELECT * FROM oe_cyber_incidents WHERE id = ?').bind(id).first<CyberRow>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const ev = await c.env.DB.prepare(
    'SELECT * FROM oe_cyber_incident_events WHERE incident_id = ? ORDER BY datetime(created_at) ASC',
  ).bind(id).all<EventRow>();

  return c.json({
    success: true,
    data: {
      case: decorate(row, new Date()),
      events: ev.results || [],
    },
  });
});

interface NotifyRegulatorBody {
  regulator_authority?: string;
  regulator_ref?: string;
  notes?: string;
}

interface NotifySubjectsBody {
  subjects_notified_count?: number;
  notes?: string;
}

interface CompleteRcaBody {
  rca_summary?: string;
  remediation_plan?: string;
  notes?: string;
}

interface DispatchRemediationBody {
  linked_wo_id?: string;
  notes?: string;
}

interface CloseBody {
  closure_notes?: string;
  notes?: string;
}

interface FalseAlarmBody {
  closure_notes?: string;
  notes?: string;
}

async function transition(
  c: Context<HonoEnv>,
  action: CyberAction,
  bodyHandler?: (row: CyberRow, body: Record<string, unknown>) => Partial<CyberRow>,
) {
  const user = getCurrentUser(c);
  if (!user || !WRITE_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const id = c.req.param('id')!;
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const notes = typeof body.notes === 'string' ? body.notes : null;

  const row = await c.env.DB.prepare('SELECT * FROM oe_cyber_incidents WHERE id = ?').bind(id).first<CyberRow>();
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
  const sla = slaDeadlineFor(to, row.incident_tier, now);
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
    `UPDATE oe_cyber_incidents SET ${setClauses.join(', ')} WHERE id = ?`,
  ).bind(...setBinds).run();

  const evtId = `cyb_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
  await c.env.DB.prepare(
    'INSERT INTO oe_cyber_incident_events (id, incident_id, event_type, from_status, to_status, actor_id, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
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
    entity_type: 'cyber_incident',
    entity_id: id,
    data: {
      ...row,
      ...overrides,
      chain_status: to,
      from_status: row.chain_status,
      crosses_into_regulator: crossesIntoRegulator(action, row.incident_tier),
    },
    env: c.env,
  });

  const refreshed = await c.env.DB.prepare('SELECT * FROM oe_cyber_incidents WHERE id = ?').bind(id).first<CyberRow>();
  return c.json({ success: true, data: { case: refreshed ? decorate(refreshed, now) : null } });
}

app.post('/:id/triage', async (c) => transition(c, 'triage'));

app.post('/:id/contain', async (c) => transition(c, 'contain', (_row, body) => {
  const out: Partial<CyberRow> = {};
  if (typeof body.containment_summary === 'string') out.containment_summary = body.containment_summary as string;
  return out;
}));

app.post('/:id/notify-regulator', async (c) => transition(c, 'notify_regulator', (_row, body) => {
  const b = body as Partial<NotifyRegulatorBody>;
  const out: Partial<CyberRow> = { regulator_notified: 1 };
  if (typeof b.regulator_authority === 'string') out.regulator_authority = b.regulator_authority;
  if (typeof b.regulator_ref === 'string')       out.regulator_ref = b.regulator_ref;
  return out;
}));

app.post('/:id/notify-subjects', async (c) => transition(c, 'notify_subjects', (_row, body) => {
  const b = body as Partial<NotifySubjectsBody>;
  const out: Partial<CyberRow> = { subjects_notified: 1 };
  if (typeof b.subjects_notified_count === 'number') out.subjects_notified_count = b.subjects_notified_count;
  return out;
}));

app.post('/:id/skip-notify', async (c) => transition(c, 'skip_notify'));

app.post('/:id/begin-investigation', async (c) => transition(c, 'begin_investigation'));

app.post('/:id/complete-rca', async (c) => transition(c, 'complete_rca', (_row, body) => {
  const b = body as Partial<CompleteRcaBody>;
  const out: Partial<CyberRow> = {};
  if (typeof b.rca_summary === 'string')       out.rca_summary = b.rca_summary;
  if (typeof b.remediation_plan === 'string')  out.remediation_plan = b.remediation_plan;
  return out;
}));

app.post('/:id/dispatch-remediation', async (c) => transition(c, 'dispatch_remediation', (_row, body) => {
  const b = body as Partial<DispatchRemediationBody>;
  const out: Partial<CyberRow> = {};
  if (typeof b.linked_wo_id === 'string') out.linked_wo_id = b.linked_wo_id;
  return out;
}));

app.post('/:id/verify-remediation', async (c) => transition(c, 'verify_remediation'));

app.post('/:id/close', async (c) => transition(c, 'close', (_row, body) => {
  const b = body as Partial<CloseBody>;
  const out: Partial<CyberRow> = {};
  if (typeof b.closure_notes === 'string') out.closure_notes = b.closure_notes;
  return out;
}));

app.post('/:id/escalate', async (c) => transition(c, 'escalate'));

app.post('/:id/close-escalated', async (c) => transition(c, 'close_escalated', (_row, body) => {
  const b = body as Partial<CloseBody>;
  const out: Partial<CyberRow> = {};
  if (typeof b.closure_notes === 'string') out.closure_notes = b.closure_notes;
  return out;
}));

app.post('/:id/mark-false-alarm', async (c) => transition(c, 'mark_false_alarm', (_row, body) => {
  const b = body as Partial<FalseAlarmBody>;
  const out: Partial<CyberRow> = {};
  if (typeof b.closure_notes === 'string') out.closure_notes = b.closure_notes;
  return out;
}));

app.post('/:id/close-false-alarm', async (c) => transition(c, 'close_false_alarm', (_row, body) => {
  const b = body as Partial<CloseBody>;
  const out: Partial<CyberRow> = {};
  if (typeof b.closure_notes === 'string') out.closure_notes = b.closure_notes;
  return out;
}));

export async function cyberIncidentSlaSweep(env: HonoEnv['Bindings']): Promise<{ scanned: number; breached: number }> {
  const now = new Date();
  const nowIso = now.toISOString();
  const rs = await env.DB.prepare(
    `SELECT * FROM oe_cyber_incidents
     WHERE chain_status NOT IN ('closed','false_alarm')
       AND sla_deadline_at IS NOT NULL
       AND datetime(sla_deadline_at) < datetime(?)
       AND (last_sla_breach_at IS NULL OR datetime(last_sla_breach_at) < datetime(sla_deadline_at))`,
  ).bind(nowIso).all<CyberRow>();

  const rows = rs.results || [];
  let breached = 0;
  for (const row of rows) {
    await env.DB.prepare(
      `UPDATE oe_cyber_incidents
       SET last_sla_breach_at = ?, escalation_level = escalation_level + 1, updated_at = ?
       WHERE id = ?`,
    ).bind(nowIso, nowIso, row.id).run();

    const evtId = `cyb_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
    await env.DB.prepare(
      'INSERT INTO oe_cyber_incident_events (id, incident_id, event_type, from_status, to_status, actor_id, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).bind(
      evtId,
      row.id,
      'sla_breached',
      row.chain_status,
      row.chain_status,
      'system',
      `Auto-breach: ${row.chain_status} past SLA (tier ${row.incident_tier})`,
      JSON.stringify({ sla_deadline_at: row.sla_deadline_at }),
      nowIso,
    ).run();

    if (slaBreachCrossesIntoRegulator(row.incident_tier)) {
      await fireCascade({
        event: 'cyber_incident.sla_breached',
        actor_id: 'system',
        entity_type: 'cyber_incident',
        entity_id: row.id,
        data: { ...row, sla_window: row.chain_status },
        env,
      });
    }

    breached++;
  }

  return { scanned: rows.length, breached };
}

export default app;
