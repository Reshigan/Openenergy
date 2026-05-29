// ═══════════════════════════════════════════════════════════════════════════
// Wave 67 — Grid Code Compliance Monitoring & Non-Conformance chain (P6)
//
// Mounted at /api/grid-code-compliance/chain.
//
// The System Operator / Transmission System Operator (NTCSA) monitors each
// connected facility's ongoing TECHNICAL conformance with the SA Grid Code (the
// Network Code + the Grid Connection Code for Renewable Power Plants) and the
// NRS 048-2/4 power-quality limits, and manages a non-conformance through a formal
// remediation lifecycle. See src/utils/grid-code-compliance-spec.ts for the full
// state-machine, tiering and reportability rationale.
//
//   monitoring → non_conformance_raised → under_assessment
//     → corrective_action_required → cap_submitted → cap_approved
//     → remediation_in_progress → compliance_retest → compliant_closed
//   CAP revise loop:  cap_submitted → (reject_cap) → corrective_action_required
//   restriction:      {under_assessment, remediation_in_progress, compliance_retest}
//                       → operating_restriction → (begin_remediation) → remediation_in_progress
//   disconnection:    {corrective_action_required, operating_restriction} → disconnection_issued
//   withdrawn:        {non_conformance_raised, under_assessment} → withdrawn
//
// Split write: the SO/TSO (operator) drives the machinery; the connected FACILITY
// submits the corrective-action plan and performs the remediation. isFacilityAction
// routes each POST to the right write-role set; actor_party records which side acted.
//
// Reportability (the W67 signature, DISCONNECTION-driven): escalate_disconnection
// crosses for EVERY tier; impose_restriction + SLA breaches cross for the large
// tiers (serious + critical).
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
  isFacilityAction,
  tierForNonConformance,
  SLA_MINUTES,
  type ComplianceStatus,
  type ComplianceAction,
  type ComplianceTier,
  type BreachClass,
} from '../utils/grid-code-compliance-spec';

// All nine personas may read the compliance register.
const READ_ROLES = new Set([
  'admin',
  'grid_operator', 'regulator', 'ipp_developer', 'carbon_fund', 'offtaker', 'lender', 'trader', 'support',
]);

// Split write: the SO/TSO desk drives the machinery; the connected facility (an
// IPP developer) submits the CAP and performs remediation.
const OPERATOR_WRITE_ROLES = new Set(['admin', 'support', 'grid_operator']);
const FACILITY_WRITE_ROLES = new Set(['admin', 'ipp_developer']);

const app = new Hono<HonoEnv>();
app.use('*', authMiddleware);

interface ComplianceRow {
  id: string;
  case_number: string;
  source_event: string | null;
  source_entity_type: string | null;
  source_entity_id: string | null;
  source_wave: string | null;
  facility_id: string;
  facility_name: string;
  connection_point: string | null;
  network_area: 'transmission' | 'distribution' | null;
  licence_ref: string | null;
  technology: string | null;
  capacity_mw: number | null;
  breach_class: BreachClass;
  code_reference: string | null;
  parameter: string | null;
  measured_value: number | null;
  limit_value: number | null;
  severity_tier: ComplianceTier;
  operator_party_id: string | null;
  operator_party_name: string | null;
  facility_party_id: string | null;
  facility_party_name: string | null;
  nc_ref: string | null;
  assessment_ref: string | null;
  cap_ref: string | null;
  retest_ref: string | null;
  restriction_ref: string | null;
  disconnection_ref: string | null;
  raise_basis: string | null;
  assessment_basis: string | null;
  corrective_action_basis: string | null;
  cap_basis: string | null;
  approval_basis: string | null;
  remediation_basis: string | null;
  retest_basis: string | null;
  restriction_basis: string | null;
  disconnection_basis: string | null;
  reason_code: string | null;
  compliance_summary: string | null;
  chain_status: ComplianceStatus;
  monitoring_started_at: string;
  non_conformance_raised_at: string | null;
  under_assessment_at: string | null;
  corrective_action_required_at: string | null;
  cap_submitted_at: string | null;
  cap_approved_at: string | null;
  remediation_started_at: string | null;
  compliance_retest_at: string | null;
  operating_restriction_at: string | null;
  compliant_closed_at: string | null;
  disconnection_issued_at: string | null;
  withdrawn_at: string | null;
  remediation_round: number;
  sla_deadline_at: string | null;
  last_sla_breach_at: string | null;
  is_reportable: number;
  escalation_level: number;
  created_by: string;
  created_at: string;
  updated_at: string;
}

interface ComplianceEventRow {
  id: string;
  compliance_id: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  actor_id: string | null;
  actor_party: string | null;
  notes: string | null;
  payload: string | null;
  created_at: string;
}

const TIMESTAMP_COLUMN: Record<ComplianceStatus, keyof ComplianceRow | null> = {
  monitoring:                 null,
  non_conformance_raised:     'non_conformance_raised_at',
  under_assessment:           'under_assessment_at',
  corrective_action_required: 'corrective_action_required_at',
  cap_submitted:              'cap_submitted_at',
  cap_approved:               'cap_approved_at',
  remediation_in_progress:    'remediation_started_at',
  compliance_retest:          'compliance_retest_at',
  operating_restriction:      'operating_restriction_at',
  compliant_closed:           'compliant_closed_at',
  disconnection_issued:       'disconnection_issued_at',
  withdrawn:                  'withdrawn_at',
};

function decorate(row: ComplianceRow, now: Date) {
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
    is_reportable: !!row.is_reportable,
    breach_crosses_regulator: slaBreachCrossesIntoRegulator(tier),
  };
}

// reject_cap lands back in corrective_action_required → shares that event.
function eventTypeFor(action: ComplianceAction): string {
  switch (action) {
    case 'raise_non_conformance':     return 'grid_code_compliance.non_conformance_raised';
    case 'begin_assessment':          return 'grid_code_compliance.under_assessment';
    case 'require_corrective_action': return 'grid_code_compliance.corrective_action_required';
    case 'submit_cap':                return 'grid_code_compliance.cap_submitted';
    case 'approve_cap':               return 'grid_code_compliance.cap_approved';
    case 'reject_cap':                return 'grid_code_compliance.corrective_action_required';
    case 'begin_remediation':         return 'grid_code_compliance.remediation_in_progress';
    case 'initiate_retest':           return 'grid_code_compliance.compliance_retest';
    case 'confirm_compliance':        return 'grid_code_compliance.compliant_closed';
    case 'impose_restriction':        return 'grid_code_compliance.operating_restriction';
    case 'escalate_disconnection':    return 'grid_code_compliance.disconnection_issued';
    case 'withdraw':                  return 'grid_code_compliance.withdrawn';
  }
}

app.get('/', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const severity_tier = c.req.query('severity_tier');
  const breach_class  = c.req.query('breach_class');
  const network_area  = c.req.query('network_area');
  const status        = c.req.query('status');
  const breached      = c.req.query('breached');
  const reportable    = c.req.query('reportable');

  let sql = 'SELECT * FROM oe_grid_code_compliance WHERE 1=1';
  const binds: unknown[] = [];
  if (severity_tier) { sql += ' AND severity_tier = ?'; binds.push(severity_tier); }
  if (breach_class)  { sql += ' AND breach_class = ?';  binds.push(breach_class); }
  if (network_area)  { sql += ' AND network_area = ?';  binds.push(network_area); }
  if (status)        { sql += ' AND chain_status = ?';  binds.push(status); }

  sql += ' ORDER BY datetime(monitoring_started_at) DESC LIMIT 500';

  const rs = await c.env.DB.prepare(sql).bind(...binds).all<ComplianceRow>();
  const now = new Date();
  let items = (rs.results || []).map((r) => decorate(r, now));
  if (breached === 'true')   items = items.filter((r) => r.sla_breached);
  if (reportable === 'true') items = items.filter((r) => r.is_reportable);

  const by_status: Record<string, number> = {};
  const by_tier: Record<string, number> = {};
  const by_breach_class: Record<string, number> = {};
  const by_network_area: Record<string, number> = {};
  for (const i of items) {
    by_status[i.chain_status] = (by_status[i.chain_status] || 0) + 1;
    by_tier[i.severity_tier] = (by_tier[i.severity_tier] || 0) + 1;
    by_breach_class[i.breach_class] = (by_breach_class[i.breach_class] || 0) + 1;
    if (i.network_area) by_network_area[i.network_area] = (by_network_area[i.network_area] || 0) + 1;
  }

  const monitoring_count   = items.filter((i) => i.chain_status === 'monitoring').length;
  const open_count         = items.filter((i) => !i.is_terminal).length;
  const restricted_count   = items.filter((i) => i.chain_status === 'operating_restriction').length;
  const disconnected_count = items.filter((i) => i.chain_status === 'disconnection_issued').length;
  const closed_count       = items.filter((i) => i.chain_status === 'compliant_closed').length;
  const withdrawn_count    = items.filter((i) => i.chain_status === 'withdrawn').length;
  const breached_count     = items.filter((i) => i.sla_breached && !i.is_terminal).length;
  const reportable_total   = items.filter((i) => i.is_reportable).length;
  const large_open         = items.filter((i) =>
    !i.is_terminal && (i.severity_tier === 'serious' || i.severity_tier === 'critical')).length;
  const total_capacity_mw  = items.reduce((sum, i) => sum + (i.capacity_mw || 0), 0);

  return c.json({
    success: true,
    data: {
      items,
      total: items.length,
      by_status,
      by_tier,
      by_breach_class,
      by_network_area,
      monitoring_count,
      open_count,
      restricted_count,
      disconnected_count,
      closed_count,
      withdrawn_count,
      breached: breached_count,
      reportable_total,
      large_open,
      total_capacity_mw,
    },
  });
});

app.get('/:id', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const id = c.req.param('id')!;
  const row = await c.env.DB.prepare('SELECT * FROM oe_grid_code_compliance WHERE id = ?').bind(id).first<ComplianceRow>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const ev = await c.env.DB.prepare(
    'SELECT * FROM oe_grid_code_compliance_events WHERE compliance_id = ? ORDER BY datetime(created_at) ASC',
  ).bind(id).all<ComplianceEventRow>();

  return c.json({
    success: true,
    data: {
      case: decorate(row, new Date()),
      events: ev.results || [],
    },
  });
});

interface RaiseBody {
  raise_basis?: string;
  nc_ref?: string;
  parameter?: string;
  measured_value?: number;
  limit_value?: number;
  capacity_mw?: number;
  breach_class?: BreachClass;
  code_reference?: string;
  notes?: string;
}
interface AssessBody {
  assessment_basis?: string;
  assessment_ref?: string;
  notes?: string;
}
interface RequireBody {
  corrective_action_basis?: string;
  reason_code?: string;
  notes?: string;
}
interface CapBody {
  cap_basis?: string;
  cap_ref?: string;
  notes?: string;
}
interface ApproveBody {
  approval_basis?: string;
  notes?: string;
}
interface RejectBody {
  corrective_action_basis?: string;
  reason_code?: string;
  notes?: string;
}
interface RemediationBody {
  remediation_basis?: string;
  notes?: string;
}
interface RetestBody {
  retest_basis?: string;
  retest_ref?: string;
  notes?: string;
}
interface ConfirmBody {
  retest_basis?: string;
  compliance_summary?: string;
  notes?: string;
}
interface RestrictionBody {
  restriction_basis?: string;
  restriction_ref?: string;
  reason_code?: string;
  notes?: string;
}
interface DisconnectionBody {
  disconnection_basis?: string;
  disconnection_ref?: string;
  reason_code?: string;
  notes?: string;
}
interface WithdrawBody {
  reason_code?: string;
  compliance_summary?: string;
  notes?: string;
}

async function transition(
  c: Context<HonoEnv>,
  action: ComplianceAction,
  bodyHandler?: (row: ComplianceRow, body: Record<string, unknown>) => Partial<ComplianceRow>,
) {
  const user = getCurrentUser(c);
  const writeRoles = isFacilityAction(action) ? FACILITY_WRITE_ROLES : OPERATOR_WRITE_ROLES;
  if (!user || !writeRoles.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const id = c.req.param('id')!;
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const notes = typeof body.notes === 'string' ? body.notes : null;

  const row = await c.env.DB.prepare('SELECT * FROM oe_grid_code_compliance WHERE id = ?').bind(id).first<ComplianceRow>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const to = nextStatus(row.chain_status, action);
  if (!to) {
    return c.json({
      success: false,
      error: `Invalid transition: ${row.chain_status} → ${action}`,
    }, 422);
  }

  const overrides = bodyHandler ? bodyHandler(row, body) : {};
  // Tier can be re-derived when the raise restates the non-compliant capacity or
  // breach class; otherwise the row's recorded severity stands.
  const effectiveCapacity = (overrides.capacity_mw ?? row.capacity_mw);
  const effectiveBreach = (overrides.breach_class ?? row.breach_class) as BreachClass;
  let effectiveTier: ComplianceTier = row.severity_tier;
  if (overrides.capacity_mw != null || overrides.breach_class != null) {
    effectiveTier = tierForNonConformance(effectiveCapacity || 0, effectiveBreach);
    overrides.severity_tier = effectiveTier;
  }

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
    `UPDATE oe_grid_code_compliance SET ${setClauses.join(', ')} WHERE id = ?`,
  ).bind(...setBinds).run();

  const evtId = `gcc_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
  await c.env.DB.prepare(
    'INSERT INTO oe_grid_code_compliance_events (id, compliance_id, event_type, from_status, to_status, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
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
    entity_type: 'grid_code_compliance',
    entity_id: id,
    data: {
      ...row,
      ...overrides,
      severity_tier: effectiveTier,
      chain_status: to,
      from_status: row.chain_status,
      action,
      crosses_into_regulator: crosses,
    },
    env: c.env,
  });

  const refreshed = await c.env.DB.prepare('SELECT * FROM oe_grid_code_compliance WHERE id = ?').bind(id).first<ComplianceRow>();
  return c.json({ success: true, data: { case: refreshed ? decorate(refreshed, now) : null } });
}

app.post('/:id/raise-non-conformance', async (c) => transition(c, 'raise_non_conformance', (_row, body) => {
  const b = body as Partial<RaiseBody>;
  const out: Partial<ComplianceRow> = {};
  if (typeof b.raise_basis === 'string')     out.raise_basis = b.raise_basis;
  if (typeof b.nc_ref === 'string')          out.nc_ref = b.nc_ref;
  if (typeof b.parameter === 'string')       out.parameter = b.parameter;
  if (typeof b.measured_value === 'number')  out.measured_value = b.measured_value;
  if (typeof b.limit_value === 'number')     out.limit_value = b.limit_value;
  if (typeof b.code_reference === 'string')  out.code_reference = b.code_reference;
  if (typeof b.capacity_mw === 'number')     out.capacity_mw = b.capacity_mw;
  if (typeof b.breach_class === 'string')    out.breach_class = b.breach_class as BreachClass;
  return out;
}));

app.post('/:id/begin-assessment', async (c) => transition(c, 'begin_assessment', (_row, body) => {
  const b = body as Partial<AssessBody>;
  const out: Partial<ComplianceRow> = {};
  if (typeof b.assessment_basis === 'string') out.assessment_basis = b.assessment_basis;
  if (typeof b.assessment_ref === 'string')   out.assessment_ref = b.assessment_ref;
  return out;
}));

app.post('/:id/require-corrective-action', async (c) => transition(c, 'require_corrective_action', (_row, body) => {
  const b = body as Partial<RequireBody>;
  const out: Partial<ComplianceRow> = {};
  if (typeof b.corrective_action_basis === 'string') out.corrective_action_basis = b.corrective_action_basis;
  if (typeof b.reason_code === 'string')             out.reason_code = b.reason_code;
  return out;
}));

app.post('/:id/submit-cap', async (c) => transition(c, 'submit_cap', (_row, body) => {
  const b = body as Partial<CapBody>;
  const out: Partial<ComplianceRow> = {};
  if (typeof b.cap_basis === 'string') out.cap_basis = b.cap_basis;
  if (typeof b.cap_ref === 'string')   out.cap_ref = b.cap_ref;
  return out;
}));

app.post('/:id/approve-cap', async (c) => transition(c, 'approve_cap', (_row, body) => {
  const b = body as Partial<ApproveBody>;
  const out: Partial<ComplianceRow> = {};
  if (typeof b.approval_basis === 'string') out.approval_basis = b.approval_basis;
  return out;
}));

app.post('/:id/reject-cap', async (c) => transition(c, 'reject_cap', (row, body) => {
  const b = body as Partial<RejectBody>;
  const out: Partial<ComplianceRow> = { remediation_round: (row.remediation_round || 0) + 1 };
  if (typeof b.corrective_action_basis === 'string') out.corrective_action_basis = b.corrective_action_basis;
  if (typeof b.reason_code === 'string')             out.reason_code = b.reason_code;
  return out;
}));

app.post('/:id/begin-remediation', async (c) => transition(c, 'begin_remediation', (_row, body) => {
  const b = body as Partial<RemediationBody>;
  const out: Partial<ComplianceRow> = {};
  if (typeof b.remediation_basis === 'string') out.remediation_basis = b.remediation_basis;
  return out;
}));

app.post('/:id/initiate-retest', async (c) => transition(c, 'initiate_retest', (_row, body) => {
  const b = body as Partial<RetestBody>;
  const out: Partial<ComplianceRow> = {};
  if (typeof b.retest_basis === 'string') out.retest_basis = b.retest_basis;
  if (typeof b.retest_ref === 'string')   out.retest_ref = b.retest_ref;
  return out;
}));

app.post('/:id/confirm-compliance', async (c) => transition(c, 'confirm_compliance', (_row, body) => {
  const b = body as Partial<ConfirmBody>;
  const out: Partial<ComplianceRow> = {};
  if (typeof b.retest_basis === 'string')       out.retest_basis = b.retest_basis;
  if (typeof b.compliance_summary === 'string') out.compliance_summary = b.compliance_summary;
  return out;
}));

app.post('/:id/impose-restriction', async (c) => transition(c, 'impose_restriction', (_row, body) => {
  const b = body as Partial<RestrictionBody>;
  const out: Partial<ComplianceRow> = { escalation_level: 1 };
  if (typeof b.restriction_basis === 'string') out.restriction_basis = b.restriction_basis;
  if (typeof b.restriction_ref === 'string')   out.restriction_ref = b.restriction_ref;
  if (typeof b.reason_code === 'string')       out.reason_code = b.reason_code;
  return out;
}));

app.post('/:id/escalate-disconnection', async (c) => transition(c, 'escalate_disconnection', (_row, body) => {
  const b = body as Partial<DisconnectionBody>;
  const out: Partial<ComplianceRow> = { escalation_level: 2 };
  if (typeof b.disconnection_basis === 'string') out.disconnection_basis = b.disconnection_basis;
  if (typeof b.disconnection_ref === 'string')   out.disconnection_ref = b.disconnection_ref;
  if (typeof b.reason_code === 'string')         out.reason_code = b.reason_code;
  return out;
}));

app.post('/:id/withdraw', async (c) => transition(c, 'withdraw', (_row, body) => {
  const b = body as Partial<WithdrawBody>;
  const out: Partial<ComplianceRow> = {};
  if (typeof b.reason_code === 'string')         out.reason_code = b.reason_code;
  if (typeof b.compliance_summary === 'string')  out.compliance_summary = b.compliance_summary;
  return out;
}));

// SLA sweep: record an SLA breach on any non-terminal case past its deadline,
// crossing to the regulator for the large tiers (serious + critical).
export async function gridCodeComplianceSlaSweep(env: HonoEnv['Bindings']): Promise<{ scanned: number; breached: number }> {
  const now = new Date();
  const nowIso = now.toISOString();

  const rs = await env.DB.prepare(
    `SELECT * FROM oe_grid_code_compliance
     WHERE chain_status NOT IN ('compliant_closed','disconnection_issued','withdrawn')
       AND sla_deadline_at IS NOT NULL
       AND datetime(sla_deadline_at) < datetime(?)
       AND (last_sla_breach_at IS NULL OR datetime(last_sla_breach_at) < datetime(sla_deadline_at))`,
  ).bind(nowIso).all<ComplianceRow>();

  const rows = rs.results || [];
  let breached = 0;
  for (const row of rows) {
    await env.DB.prepare(
      `UPDATE oe_grid_code_compliance
       SET last_sla_breach_at = ?, escalation_level = escalation_level + 1, updated_at = ?
       WHERE id = ?`,
    ).bind(nowIso, nowIso, row.id).run();

    const evtId = `gcc_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
    await env.DB.prepare(
      'INSERT INTO oe_grid_code_compliance_events (id, compliance_id, event_type, from_status, to_status, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).bind(
      evtId,
      row.id,
      'grid_code_compliance.sla_breached',
      row.chain_status,
      row.chain_status,
      'system',
      'system',
      `Auto-breach: ${row.chain_status} past SLA (tier ${row.severity_tier})`,
      JSON.stringify({ sla_deadline_at: row.sla_deadline_at }),
      nowIso,
    ).run();

    if (slaBreachCrossesIntoRegulator(row.severity_tier)) {
      await fireCascade({
        event: 'grid_code_compliance.sla_breached',
        actor_id: 'system',
        entity_type: 'grid_code_compliance',
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
