// ═══════════════════════════════════════════════════════════════════════════
// Wave 27 — REIPPPP Economic Development (ED) commitment monitoring chain.
//
// Mounted at /api/ed/commitment-chain.
//
// 9-state monitoring lifecycle for the 7 contractual ED commitments every
// REIPPPP-awarded project carries to IPPO/DMRE/DTI:
//   baseline_locked → monitoring → variance_flagged → cure_plan_required →
//   cure_plan_submitted → cure_executing → verified_compliant → closed
// Branches: penalty_issued (cure_executing → penalty_issued → closed),
//           escalated (DTI Codes Council referral),
//           false_alarm (variance_flagged stale-data reconciliation).
//
// Tiers: ownership | local_content | jobs | skills | enterprise_dev |
//        socio_economic | community_trust.
//
// Reportable tiers (ownership/local_content high-scoring + jobs/skills mid)
// cross into regulator inbox on require_cure_plan/issue_penalty/escalate/
// close_with_penalty/close_escalated/sla_breached per spec matrix.
//
// Roles:
//   READ:  admin, support, compliance, regulator, ipp, ipp_developer,
//          esums, esums_om, lender
//   WRITE: admin, support, compliance, ipp_developer
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
  isHighScoring,
  SLA_MINUTES,
  type EdStatus,
  type EdAction,
  type EdTier,
} from '../utils/ed-commitment-chain-spec';

const READ_ROLES = new Set([
  'admin', 'support', 'compliance',
  'regulator',
  'ipp', 'ipp_developer',
  'esums', 'esums_om',
  'lender',
]);
const WRITE_ROLES = new Set([
  'admin', 'support', 'compliance',
  'ipp_developer',
]);

const app = new Hono<HonoEnv>();
app.use('*', authMiddleware);

interface EdRow {
  id: string;
  case_number: string;
  project_id: string;
  project_name: string;
  bid_window: string;
  commitment_type: EdTier;
  commitment_label: string;
  baseline_value: number;
  baseline_unit: string;
  reporting_period: string;
  current_value: number | null;
  variance_pct: number | null;
  variance_threshold_pct: number;
  cure_plan_summary: string | null;
  cure_plan_filed_at: string | null;
  cure_plan_approved_at: string | null;
  remediation_summary: string | null;
  linked_wo_id: string | null;
  penalty_amount_zar: number | null;
  penalty_ref: string | null;
  regulator_authority: string | null;
  regulator_ref: string | null;
  chain_status: EdStatus;
  baseline_locked_at: string;
  monitoring_at: string | null;
  variance_flagged_at: string | null;
  cure_plan_required_at: string | null;
  cure_plan_submitted_at: string | null;
  cure_executing_at: string | null;
  verified_compliant_at: string | null;
  penalty_issued_at: string | null;
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
  commitment_id: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  actor_id: string | null;
  notes: string | null;
  payload: string | null;
  created_at: string;
}

const TIMESTAMP_COLUMN: Record<EdStatus, keyof EdRow | null> = {
  baseline_locked:     null,
  monitoring:          'monitoring_at',
  variance_flagged:    'variance_flagged_at',
  cure_plan_required:  'cure_plan_required_at',
  cure_plan_submitted: 'cure_plan_submitted_at',
  cure_executing:      'cure_executing_at',
  verified_compliant:  'verified_compliant_at',
  penalty_issued:      'penalty_issued_at',
  escalated:           'escalated_at',
  false_alarm:         'false_alarm_at',
  closed:              'closed_at',
};

function decorate(row: EdRow, now: Date) {
  const tier = row.commitment_type;
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
    is_high_scoring: isHighScoring(tier),
    is_reportable: slaBreachCrossesIntoRegulator(tier),
  };
}

function eventTypeFor(action: EdAction): string {
  switch (action) {
    case 'activate_monitoring': return 'monitoring_activated';
    case 'detect_variance':     return 'variance_flagged';
    case 'require_cure_plan':   return 'cure_plan_required';
    case 'submit_cure_plan':    return 'cure_plan_submitted';
    case 'approve_cure_plan':   return 'cure_plan_approved';
    case 'verify_compliance':   return 'compliance_verified';
    case 'close_compliant':     return 'closed_compliant';
    case 'issue_penalty':       return 'penalty_issued';
    case 'close_with_penalty':  return 'closed_with_penalty';
    case 'escalate':            return 'escalated';
    case 'close_escalated':     return 'closed_escalated';
    case 'mark_false_alarm':    return 'false_alarm';
    case 'close_false_alarm':   return 'closed_false_alarm';
  }
}

function cascadeEventFor(action: EdAction): string {
  switch (action) {
    case 'activate_monitoring': return 'ed_commitment.monitoring';
    case 'detect_variance':     return 'ed_commitment.variance_flagged';
    case 'require_cure_plan':   return 'ed_commitment.cure_plan_required';
    case 'submit_cure_plan':    return 'ed_commitment.cure_plan_submitted';
    case 'approve_cure_plan':   return 'ed_commitment.cure_executing';
    case 'verify_compliance':   return 'ed_commitment.verified_compliant';
    case 'close_compliant':     return 'ed_commitment.closed';
    case 'issue_penalty':       return 'ed_commitment.penalty_issued';
    case 'close_with_penalty':  return 'ed_commitment.closed';
    case 'escalate':            return 'ed_commitment.escalated';
    case 'close_escalated':     return 'ed_commitment.closed';
    case 'mark_false_alarm':    return 'ed_commitment.false_alarm';
    case 'close_false_alarm':   return 'ed_commitment.closed';
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
  const bid_window = c.req.query('bid_window');
  const project_id = c.req.query('project_id');

  let sql = 'SELECT * FROM oe_ed_commitments WHERE 1=1';
  const binds: unknown[] = [];
  if (tier)        { sql += ' AND commitment_type = ?'; binds.push(tier); }
  if (status)      { sql += ' AND chain_status = ?';    binds.push(status); }
  if (bid_window)  { sql += ' AND bid_window = ?';      binds.push(bid_window); }
  if (project_id)  { sql += ' AND project_id = ?';      binds.push(project_id); }

  sql += ' ORDER BY datetime(baseline_locked_at) DESC LIMIT 500';

  const rs = await c.env.DB.prepare(sql).bind(...binds).all<EdRow>();
  const now = new Date();
  let items = (rs.results || []).map((r) => decorate(r, now));
  if (breached === 'true') items = items.filter((r) => r.sla_breached);

  const by_status: Record<string, number> = {};
  const by_tier: Record<string, number> = {};
  for (const i of items) {
    by_status[i.chain_status] = (by_status[i.chain_status] || 0) + 1;
    by_tier[i.commitment_type] = (by_tier[i.commitment_type] || 0) + 1;
  }

  const variance_open = items.filter(
    (i) => i.chain_status === 'variance_flagged',
  ).length;
  const cure_required_open = items.filter(
    (i) => i.chain_status === 'cure_plan_required' || i.chain_status === 'cure_plan_submitted',
  ).length;
  const cure_executing_open = items.filter(
    (i) => i.chain_status === 'cure_executing',
  ).length;
  const penalty_open = items.filter(
    (i) => i.chain_status === 'penalty_issued',
  ).length;
  const escalated_open = items.filter(
    (i) => i.chain_status === 'escalated',
  ).length;
  const high_scoring_open = items.filter(
    (i) => i.is_high_scoring && !i.is_terminal,
  ).length;
  const open_count = items.filter((i) => !i.is_terminal).length;
  const breached_count = items.filter((i) => i.sla_breached && !i.is_terminal).length;
  const penalty_total_zar = items.reduce(
    (s, i) => s + (i.penalty_amount_zar || 0), 0,
  );

  return c.json({
    success: true,
    data: {
      items,
      total: items.length,
      by_status,
      by_tier,
      variance_open,
      cure_required_open,
      cure_executing_open,
      penalty_open,
      escalated_open,
      high_scoring_open,
      open_count,
      breached: breached_count,
      penalty_total_zar,
    },
  });
});

app.get('/:id', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const id = c.req.param('id')!;
  const row = await c.env.DB.prepare('SELECT * FROM oe_ed_commitments WHERE id = ?').bind(id).first<EdRow>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const ev = await c.env.DB.prepare(
    'SELECT * FROM oe_ed_commitment_events WHERE commitment_id = ? ORDER BY datetime(created_at) ASC',
  ).bind(id).all<EventRow>();

  return c.json({
    success: true,
    data: {
      case: decorate(row, new Date()),
      events: ev.results || [],
    },
  });
});

interface DetectVarianceBody {
  current_value?: number;
  variance_pct?: number;
  notes?: string;
}

interface RequireCurePlanBody {
  regulator_authority?: string;
  regulator_ref?: string;
  notes?: string;
}

interface SubmitCurePlanBody {
  cure_plan_summary?: string;
  notes?: string;
}

interface ApproveCurePlanBody {
  linked_wo_id?: string;
  notes?: string;
}

interface VerifyBody {
  remediation_summary?: string;
  current_value?: number;
  variance_pct?: number;
  notes?: string;
}

interface IssuePenaltyBody {
  penalty_amount_zar?: number;
  penalty_ref?: string;
  regulator_authority?: string;
  notes?: string;
}

interface CloseBody {
  closure_notes?: string;
  notes?: string;
}

async function transition(
  c: Context<HonoEnv>,
  action: EdAction,
  bodyHandler?: (row: EdRow, body: Record<string, unknown>) => Partial<EdRow>,
) {
  const user = getCurrentUser(c);
  if (!user || !WRITE_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const id = c.req.param('id')!;
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const notes = typeof body.notes === 'string' ? body.notes : null;

  const row = await c.env.DB.prepare('SELECT * FROM oe_ed_commitments WHERE id = ?').bind(id).first<EdRow>();
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
  const sla = slaDeadlineFor(to, row.commitment_type, now);
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
    `UPDATE oe_ed_commitments SET ${setClauses.join(', ')} WHERE id = ?`,
  ).bind(...setBinds).run();

  const evtId = `ed_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
  await c.env.DB.prepare(
    'INSERT INTO oe_ed_commitment_events (id, commitment_id, event_type, from_status, to_status, actor_id, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
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
    entity_type: 'ed_commitment',
    entity_id: id,
    data: {
      ...row,
      ...overrides,
      chain_status: to,
      from_status: row.chain_status,
      crosses_into_regulator: crossesIntoRegulator(action, row.commitment_type),
    },
    env: c.env,
  });

  const refreshed = await c.env.DB.prepare('SELECT * FROM oe_ed_commitments WHERE id = ?').bind(id).first<EdRow>();
  return c.json({ success: true, data: { case: refreshed ? decorate(refreshed, now) : null } });
}

app.post('/:id/activate-monitoring', async (c) => transition(c, 'activate_monitoring'));

app.post('/:id/detect-variance', async (c) => transition(c, 'detect_variance', (_row, body) => {
  const b = body as Partial<DetectVarianceBody>;
  const out: Partial<EdRow> = {};
  if (typeof b.current_value === 'number') out.current_value = b.current_value;
  if (typeof b.variance_pct === 'number')  out.variance_pct  = b.variance_pct;
  return out;
}));

app.post('/:id/require-cure-plan', async (c) => transition(c, 'require_cure_plan', (_row, body) => {
  const b = body as Partial<RequireCurePlanBody>;
  const out: Partial<EdRow> = {};
  if (typeof b.regulator_authority === 'string') out.regulator_authority = b.regulator_authority;
  if (typeof b.regulator_ref === 'string')       out.regulator_ref = b.regulator_ref;
  return out;
}));

app.post('/:id/submit-cure-plan', async (c) => transition(c, 'submit_cure_plan', (_row, body) => {
  const b = body as Partial<SubmitCurePlanBody>;
  const out: Partial<EdRow> = { cure_plan_filed_at: new Date().toISOString() };
  if (typeof b.cure_plan_summary === 'string') out.cure_plan_summary = b.cure_plan_summary;
  return out;
}));

app.post('/:id/approve-cure-plan', async (c) => transition(c, 'approve_cure_plan', (_row, body) => {
  const b = body as Partial<ApproveCurePlanBody>;
  const out: Partial<EdRow> = { cure_plan_approved_at: new Date().toISOString() };
  if (typeof b.linked_wo_id === 'string') out.linked_wo_id = b.linked_wo_id;
  return out;
}));

app.post('/:id/verify-compliance', async (c) => transition(c, 'verify_compliance', (_row, body) => {
  const b = body as Partial<VerifyBody>;
  const out: Partial<EdRow> = {};
  if (typeof b.remediation_summary === 'string') out.remediation_summary = b.remediation_summary;
  if (typeof b.current_value === 'number')       out.current_value = b.current_value;
  if (typeof b.variance_pct === 'number')        out.variance_pct  = b.variance_pct;
  return out;
}));

app.post('/:id/close-compliant', async (c) => transition(c, 'close_compliant', (_row, body) => {
  const b = body as Partial<CloseBody>;
  const out: Partial<EdRow> = {};
  if (typeof b.closure_notes === 'string') out.closure_notes = b.closure_notes;
  return out;
}));

app.post('/:id/issue-penalty', async (c) => transition(c, 'issue_penalty', (_row, body) => {
  const b = body as Partial<IssuePenaltyBody>;
  const out: Partial<EdRow> = {};
  if (typeof b.penalty_amount_zar === 'number')  out.penalty_amount_zar = b.penalty_amount_zar;
  if (typeof b.penalty_ref === 'string')         out.penalty_ref = b.penalty_ref;
  if (typeof b.regulator_authority === 'string') out.regulator_authority = b.regulator_authority;
  return out;
}));

app.post('/:id/close-with-penalty', async (c) => transition(c, 'close_with_penalty', (_row, body) => {
  const b = body as Partial<CloseBody>;
  const out: Partial<EdRow> = {};
  if (typeof b.closure_notes === 'string') out.closure_notes = b.closure_notes;
  return out;
}));

app.post('/:id/escalate', async (c) => transition(c, 'escalate'));

app.post('/:id/close-escalated', async (c) => transition(c, 'close_escalated', (_row, body) => {
  const b = body as Partial<CloseBody>;
  const out: Partial<EdRow> = {};
  if (typeof b.closure_notes === 'string') out.closure_notes = b.closure_notes;
  return out;
}));

app.post('/:id/mark-false-alarm', async (c) => transition(c, 'mark_false_alarm', (_row, body) => {
  const b = body as Partial<CloseBody>;
  const out: Partial<EdRow> = {};
  if (typeof b.closure_notes === 'string') out.closure_notes = b.closure_notes;
  return out;
}));

app.post('/:id/close-false-alarm', async (c) => transition(c, 'close_false_alarm', (_row, body) => {
  const b = body as Partial<CloseBody>;
  const out: Partial<EdRow> = {};
  if (typeof b.closure_notes === 'string') out.closure_notes = b.closure_notes;
  return out;
}));

export async function edCommitmentSlaSweep(env: HonoEnv['Bindings']): Promise<{ scanned: number; breached: number }> {
  const now = new Date();
  const nowIso = now.toISOString();
  const rs = await env.DB.prepare(
    `SELECT * FROM oe_ed_commitments
     WHERE chain_status NOT IN ('closed','false_alarm')
       AND sla_deadline_at IS NOT NULL
       AND datetime(sla_deadline_at) < datetime(?)
       AND (last_sla_breach_at IS NULL OR datetime(last_sla_breach_at) < datetime(sla_deadline_at))`,
  ).bind(nowIso).all<EdRow>();

  const rows = rs.results || [];
  let breached = 0;
  for (const row of rows) {
    await env.DB.prepare(
      `UPDATE oe_ed_commitments
       SET last_sla_breach_at = ?, escalation_level = escalation_level + 1, updated_at = ?
       WHERE id = ?`,
    ).bind(nowIso, nowIso, row.id).run();

    const evtId = `ed_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
    await env.DB.prepare(
      'INSERT INTO oe_ed_commitment_events (id, commitment_id, event_type, from_status, to_status, actor_id, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).bind(
      evtId,
      row.id,
      'sla_breached',
      row.chain_status,
      row.chain_status,
      'system',
      `Auto-breach: ${row.chain_status} past SLA (tier ${row.commitment_type})`,
      JSON.stringify({ sla_deadline_at: row.sla_deadline_at }),
      nowIso,
    ).run();

    if (slaBreachCrossesIntoRegulator(row.commitment_type)) {
      await fireCascade({
        event: 'ed_commitment.sla_breached',
        actor_id: 'system',
        entity_type: 'ed_commitment',
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
