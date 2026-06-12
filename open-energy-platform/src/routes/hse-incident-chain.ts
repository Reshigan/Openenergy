// ═══════════════════════════════════════════════════════════════════════════
// Wave 25 — HSE/SHEQ incident chain (OHSA Section 24 + NEMA Section 30).
//
// Mounted at /api/hse/incident-chain.
//
// 9-state workplace-safety + environmental incident lifecycle:
//   reported → triaged → notified_authority → investigating →
//   corrective_actions_planned → corrective_actions_executing →
//   verified → closed
// Branches: escalated (DEL/DFFE inspector), false_alarm (initial re-class).
//
// Tiers: fatal | major | environmental | minor | near_miss.
// Reportable tiers (fatal/major/environmental) cross into regulator inbox
// on notify_authority + escalate + close + close_escalated + sla_breached.
//
// Roles:
//   READ:  admin, support, ipp, ipp_developer, wind, esums, esums_om, oem, regulator
//   WRITE: admin, support, ipp, ipp_developer, wind, esums, esums_om
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
  type HseStatus,
  type HseAction,
  type HseTier,
} from '../utils/hse-incident-chain-spec';

const READ_ROLES = new Set([
  'admin', 'support',
  'ipp', 'ipp_developer', 'wind',
  'esums', 'esums_om', 'esco',
  'oem',
  'regulator',
  'epc_contractor',
]);
const WRITE_ROLES = new Set([
  'admin', 'support',
  'ipp', 'ipp_developer', 'wind',
  'esums', 'esums_om', 'esco',
]);

const app = new Hono<HonoEnv>();
app.use('*', authMiddleware);

interface HseRow {
  id: string;
  case_number: string;
  site_id: string;
  site_name: string;
  project_id: string | null;
  occurred_at: string;
  reported_at: string;
  reported_by: string;
  incident_type: string;
  incident_tier: HseTier;
  location_description: string;
  persons_affected: number;
  injury_description: string | null;
  environmental_release_description: string | null;
  immediate_actions_taken: string | null;
  rca_summary: string | null;
  capa_plan: string | null;
  linked_wo_id: string | null;
  authority_notified: number;
  authority: string | null;
  authority_ref: string | null;
  chain_status: HseStatus;
  triaged_at: string | null;
  notified_authority_at: string | null;
  investigating_at: string | null;
  corrective_actions_planned_at: string | null;
  corrective_actions_executing_at: string | null;
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

const TIMESTAMP_COLUMN: Record<HseStatus, keyof HseRow | null> = {
  reported:                     null,
  triaged:                      'triaged_at',
  notified_authority:           'notified_authority_at',
  investigating:                'investigating_at',
  corrective_actions_planned:   'corrective_actions_planned_at',
  corrective_actions_executing: 'corrective_actions_executing_at',
  verified:                     'verified_at',
  closed:                       'closed_at',
  escalated:                    'escalated_at',
  false_alarm:                  'false_alarm_at',
};

function decorate(row: HseRow, now: Date) {
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
    is_reportable: tier === 'fatal' || tier === 'major' || tier === 'environmental',
  };
}

function eventTypeFor(action: HseAction): string {
  switch (action) {
    case 'triage':              return 'triaged';
    case 'notify_authority':    return 'notified_authority';
    case 'begin_investigation': return 'investigation_started';
    case 'complete_rca':        return 'rca_completed';
    case 'dispatch_corrective': return 'capa_dispatched';
    case 'verify_corrective':   return 'capa_verified';
    case 'close':               return 'closed';
    case 'escalate':            return 'escalated';
    case 'close_escalated':     return 'closed_escalated';
    case 'mark_false_alarm':    return 'false_alarm';
    case 'close_false_alarm':   return 'closed_false_alarm';
  }
}

function cascadeEventFor(action: HseAction): string {
  switch (action) {
    case 'triage':              return 'hse_incident.triaged';
    case 'notify_authority':    return 'hse_incident.notified_authority';
    case 'begin_investigation': return 'hse_incident.investigating';
    case 'complete_rca':        return 'hse_incident.corrective_actions_planned';
    case 'dispatch_corrective': return 'hse_incident.corrective_actions_executing';
    case 'verify_corrective':   return 'hse_incident.verified';
    case 'close':               return 'hse_incident.closed';
    case 'escalate':            return 'hse_incident.escalated';
    case 'close_escalated':     return 'hse_incident.closed';
    case 'mark_false_alarm':    return 'hse_incident.false_alarm';
    case 'close_false_alarm':   return 'hse_incident.closed';
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
  const site_id = c.req.query('site_id');
  const project_id = c.req.query('project_id');

  let sql = 'SELECT * FROM oe_hse_incidents WHERE 1=1';
  const binds: unknown[] = [];
  if (tier)       { sql += ' AND incident_tier = ?'; binds.push(tier); }
  if (status)     { sql += ' AND chain_status = ?';   binds.push(status); }
  if (site_id)    { sql += ' AND site_id = ?';        binds.push(site_id); }
  if (project_id) { sql += ' AND project_id = ?';     binds.push(project_id); }

  sql += ' ORDER BY datetime(occurred_at) DESC LIMIT 500';

  const rs = await c.env.DB.prepare(sql).bind(...binds).all<HseRow>();
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
  const notify_authority_pending = items.filter(
    (i) => i.is_reportable && i.chain_status === 'triaged',
  ).length;
  const escalated_open = items.filter(
    (i) => i.chain_status === 'escalated',
  ).length;
  const open_count = items.filter((i) => !i.is_terminal).length;
  const breached_count = items.filter((i) => i.sla_breached && !i.is_terminal).length;
  const persons_affected_total = items.reduce(
    (s, i) => s + (i.persons_affected || 0), 0,
  );

  return c.json({
    success: true,
    data: {
      items,
      total: items.length,
      by_status,
      by_tier,
      reportable_open,
      notify_authority_pending,
      escalated_open,
      open_count,
      breached: breached_count,
      persons_affected_total,
    },
  });
});

app.get('/:id', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const id = c.req.param('id')!;
  const row = await c.env.DB.prepare('SELECT * FROM oe_hse_incidents WHERE id = ?').bind(id).first<HseRow>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const ev = await c.env.DB.prepare(
    'SELECT * FROM oe_hse_incident_events WHERE incident_id = ? ORDER BY datetime(created_at) ASC',
  ).bind(id).all<EventRow>();

  return c.json({
    success: true,
    data: {
      case: decorate(row, new Date()),
      events: ev.results || [],
    },
  });
});

interface NotifyAuthorityBody {
  authority?: string;
  authority_ref?: string;
  notes?: string;
}

interface CompleteRcaBody {
  rca_summary?: string;
  capa_plan?: string;
  notes?: string;
}

interface DispatchCorrectiveBody {
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
  action: HseAction,
  bodyHandler?: (row: HseRow, body: Record<string, unknown>) => Partial<HseRow>,
) {
  const user = getCurrentUser(c);
  if (!user || !WRITE_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const id = c.req.param('id')!;
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const notes = typeof body.notes === 'string' ? body.notes : null;

  const row = await c.env.DB.prepare('SELECT * FROM oe_hse_incidents WHERE id = ?').bind(id).first<HseRow>();
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
    `UPDATE oe_hse_incidents SET ${setClauses.join(', ')} WHERE id = ?`,
  ).bind(...setBinds).run();

  const evtId = `hse_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
  await c.env.DB.prepare(
    'INSERT INTO oe_hse_incident_events (id, incident_id, event_type, from_status, to_status, actor_id, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
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
    entity_type: 'hse_incident',
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

  const refreshed = await c.env.DB.prepare('SELECT * FROM oe_hse_incidents WHERE id = ?').bind(id).first<HseRow>();
  return c.json({ success: true, data: { case: refreshed ? decorate(refreshed, now) : null } });
}

app.post('/:id/triage', async (c) => transition(c, 'triage'));

app.post('/:id/notify-authority', async (c) => transition(c, 'notify_authority', (_row, body) => {
  const b = body as Partial<NotifyAuthorityBody>;
  const out: Partial<HseRow> = { authority_notified: 1 };
  if (typeof b.authority === 'string')     out.authority = b.authority;
  if (typeof b.authority_ref === 'string') out.authority_ref = b.authority_ref;
  return out;
}));

app.post('/:id/begin-investigation', async (c) => transition(c, 'begin_investigation'));

app.post('/:id/complete-rca', async (c) => transition(c, 'complete_rca', (_row, body) => {
  const b = body as Partial<CompleteRcaBody>;
  const out: Partial<HseRow> = {};
  if (typeof b.rca_summary === 'string') out.rca_summary = b.rca_summary;
  if (typeof b.capa_plan === 'string')   out.capa_plan = b.capa_plan;
  return out;
}));

app.post('/:id/dispatch-corrective', async (c) => transition(c, 'dispatch_corrective', (_row, body) => {
  const b = body as Partial<DispatchCorrectiveBody>;
  const out: Partial<HseRow> = {};
  if (typeof b.linked_wo_id === 'string') out.linked_wo_id = b.linked_wo_id;
  return out;
}));

app.post('/:id/verify-corrective', async (c) => transition(c, 'verify_corrective'));

app.post('/:id/close', async (c) => transition(c, 'close', (_row, body) => {
  const b = body as Partial<CloseBody>;
  const out: Partial<HseRow> = {};
  if (typeof b.closure_notes === 'string') out.closure_notes = b.closure_notes;
  return out;
}));

app.post('/:id/escalate', async (c) => transition(c, 'escalate'));

app.post('/:id/close-escalated', async (c) => transition(c, 'close_escalated', (_row, body) => {
  const b = body as Partial<CloseBody>;
  const out: Partial<HseRow> = {};
  if (typeof b.closure_notes === 'string') out.closure_notes = b.closure_notes;
  return out;
}));

app.post('/:id/mark-false-alarm', async (c) => transition(c, 'mark_false_alarm', (_row, body) => {
  const b = body as Partial<FalseAlarmBody>;
  const out: Partial<HseRow> = {};
  if (typeof b.closure_notes === 'string') out.closure_notes = b.closure_notes;
  return out;
}));

app.post('/:id/close-false-alarm', async (c) => transition(c, 'close_false_alarm', (_row, body) => {
  const b = body as Partial<CloseBody>;
  const out: Partial<HseRow> = {};
  if (typeof b.closure_notes === 'string') out.closure_notes = b.closure_notes;
  return out;
}));

export async function hseIncidentSlaSweep(env: HonoEnv['Bindings']): Promise<{ scanned: number; breached: number }> {
  const now = new Date();
  const nowIso = now.toISOString();
  const rs = await env.DB.prepare(
    `SELECT * FROM oe_hse_incidents
     WHERE chain_status NOT IN ('closed','false_alarm')
       AND sla_deadline_at IS NOT NULL
       AND datetime(sla_deadline_at) < datetime(?)
       AND (last_sla_breach_at IS NULL OR datetime(last_sla_breach_at) < datetime(sla_deadline_at))`,
  ).bind(nowIso).all<HseRow>();

  const rows = rs.results || [];
  let breached = 0;
  for (const row of rows) {
    await env.DB.prepare(
      `UPDATE oe_hse_incidents
       SET last_sla_breach_at = ?, escalation_level = escalation_level + 1, updated_at = ?
       WHERE id = ?`,
    ).bind(nowIso, nowIso, row.id).run();

    const evtId = `hse_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
    await env.DB.prepare(
      'INSERT INTO oe_hse_incident_events (id, incident_id, event_type, from_status, to_status, actor_id, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
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
        event: 'hse_incident.sla_breached',
        actor_id: 'system',
        entity_type: 'hse_incident',
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
