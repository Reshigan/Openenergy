// ═══════════════════════════════════════════════════════════════════════════
// Wave 55 — OEM-Support Firmware / Security-Patch & Vulnerability Remediation
// chain.
//
// Mounted at /api/security-remediation/chain.
//
// The fourth member of the ITIL service-management family on the support profile:
//   - W14 support-ticket    : restore service for ONE incident (incident mgmt).
//   - W41 problem-management : root-cause of recurring incidents (problem mgmt).
//   - W47 change-enablement  : authorise / schedule / deploy a CHANGE.
//   - W55 security-remediation: drive an OEM/CERT vulnerability or firmware
//                               advisory through a remediation campaign across the
//                               affected deployed-asset fleet (THIS chain —
//                               information-security / vulnerability mgmt).
// Distinct from W47: change-enablement AUTHORISES a proposed change; this chain is
// the security-driven remediation of a KNOWN vulnerability — triage by CVSS, scope
// the affected fleet of OT configuration items, authorise and stage the patch
// rollout, verify it, and close it — OR accept the residual risk, OR back the
// patch out if it induces a regression.
//
// Forward path:
//   advisory_received → triaged → impact_assessment → fleet_scoped →
//     remediation_approved → rollout_in_progress → verification → resolved
//   mitigation/containment: impact_assessment → mitigation_applied → fleet_scoped
//   emergency fast-path:    triaged → remediation_approved (emergency_authorize)
//   not-affected exit:      triaged → not_affected
//   risk acceptance:        impact_assessment|mitigation_applied|fleet_scoped → risk_accepted
//   backout:                rollout_in_progress|verification → rolled_back
//
// CVSS severity tiers: critical / high / medium / low / informational. URGENT SLA
// (the higher the severity, the tighter every active window). The analyst assigns
// the CVSS base score at triage; the severity_tier is re-derived live from it.
//
// Write model — SINGLE-PARTY {admin, support} (same as W41 / W47). No access
// split; actor_party records the security function (security_analyst /
// security_authority / remediation_engineer) for audit attribution only.
//
// Reportability (the W55 signature): accept_risk crosses for critical + high
// (formally accepting an UNPATCHED serious vulnerability on regulated OT is a
// reportable security-posture exception); roll_back crosses for critical + high
// (remediation-induced failure on regulated equipment); sla_breached crosses for
// critical only.
// ═══════════════════════════════════════════════════════════════════════════

import { Hono, Context } from 'hono';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { HonoEnv } from '../utils/types';
import { fireCascade } from '../utils/cascade';
import {
  nextStatus,
  isTerminal,
  slaDeadlineFor,
  tierForCvss,
  crossesIntoRegulator,
  slaBreachCrossesIntoRegulator,
  partyForAction,
  SLA_MINUTES,
  type RemediationStatus,
  type RemediationAction,
  type RemediationTier,
} from '../utils/security-remediation-spec';

const READ_ROLES = new Set([
  'admin', 'support',
  'regulator',
  'ipp_developer', 'grid_operator', 'offtaker', 'lender', 'trader', 'carbon_fund',
]);

// SINGLE-PARTY write — the support / security-management function owns the whole
// record. There is no access split (contrast the two-party chains).
const WRITE_ROLES = new Set(['admin', 'support']);

const app = new Hono<HonoEnv>();
app.use('*', authMiddleware);

interface RemediationRow {
  id: string;
  remediation_number: string;
  source_event: string | null;
  source_entity_type: string | null;
  source_entity_id: string | null;
  source_wave: string | null;
  advisory_ref: string | null;
  advisory_source: string | null;
  cve_id: string | null;
  cvss_score: number | null;
  cvss_vector: string | null;
  severity_tier: RemediationTier;
  oem_vendor: string | null;
  product_family: string | null;
  ci_type: string | null;
  affected_versions: string | null;
  fixed_version: string | null;
  patch_package_ref: string | null;
  backout_plan_ref: string | null;
  affected_ci_count: number;
  patched_ci_count: number;
  sites_affected: number;
  fleet_scope: string | null;
  project_id: string | null;
  project_name: string | null;
  sector: string | null;
  mitigation_type: string | null;
  compensating_control: string | null;
  residual_risk_basis: string | null;
  triage_ref: string | null;
  assessment_ref: string | null;
  mitigation_ref: string | null;
  approval_ref: string | null;
  rollout_ref: string | null;
  verification_ref: string | null;
  resolution_ref: string | null;
  risk_acceptance_ref: string | null;
  backout_ref: string | null;
  regulator_ref: string | null;
  triage_basis: string | null;
  assessment_basis: string | null;
  mitigation_basis: string | null;
  approval_basis: string | null;
  rollout_basis: string | null;
  verification_basis: string | null;
  resolution_basis: string | null;
  risk_acceptance_basis: string | null;
  backout_basis: string | null;
  reason_code: string | null;
  decision_notes: string | null;
  notes: string | null;
  chain_status: RemediationStatus;
  advisory_received_at: string;
  triaged_at: string | null;
  impact_assessment_at: string | null;
  mitigation_applied_at: string | null;
  fleet_scoped_at: string | null;
  remediation_approved_at: string | null;
  rollout_in_progress_at: string | null;
  verification_at: string | null;
  resolved_at: string | null;
  not_affected_at: string | null;
  risk_accepted_at: string | null;
  rolled_back_at: string | null;
  is_reportable: number;
  sla_deadline_at: string | null;
  last_sla_breach_at: string | null;
  escalation_level: number;
  created_by: string;
  created_at: string;
  updated_at: string;
}

interface RemediationEventRow {
  id: string;
  remediation_id: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  actor_id: string | null;
  actor_party: string | null;
  notes: string | null;
  payload: string | null;
  created_at: string;
}

const TIMESTAMP_COLUMN: Record<RemediationStatus, keyof RemediationRow | null> = {
  advisory_received:    null,
  triaged:              'triaged_at',
  impact_assessment:    'impact_assessment_at',
  mitigation_applied:   'mitigation_applied_at',
  fleet_scoped:         'fleet_scoped_at',
  remediation_approved: 'remediation_approved_at',
  rollout_in_progress:  'rollout_in_progress_at',
  verification:         'verification_at',
  resolved:             'resolved_at',
  not_affected:         'not_affected_at',
  risk_accepted:        'risk_accepted_at',
  rolled_back:          'rolled_back_at',
};

function decorate(row: RemediationRow, now: Date) {
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

// emergency_authorize and approve_remediation both land in 'remediation_approved',
// so they share the 'security_remediation.remediation_approved' event name; the
// inbox case gates on the tier, not the event.
function eventTypeFor(action: RemediationAction): string {
  switch (action) {
    case 'triage':              return 'security_remediation.triaged';
    case 'assess_impact':       return 'security_remediation.impact_assessment';
    case 'apply_mitigation':    return 'security_remediation.mitigation_applied';
    case 'mark_not_affected':   return 'security_remediation.not_affected';
    case 'emergency_authorize': return 'security_remediation.remediation_approved';
    case 'scope_fleet':         return 'security_remediation.fleet_scoped';
    case 'approve_remediation': return 'security_remediation.remediation_approved';
    case 'begin_rollout':       return 'security_remediation.rollout_in_progress';
    case 'complete_rollout':    return 'security_remediation.verification';
    case 'verify':              return 'security_remediation.resolved';
    case 'accept_risk':         return 'security_remediation.risk_accepted';
    case 'roll_back':           return 'security_remediation.rolled_back';
  }
}

app.get('/', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const severity_tier = c.req.query('severity_tier');
  const status        = c.req.query('status');
  const breached      = c.req.query('breached');
  const oem_vendor    = c.req.query('oem_vendor');
  const reportable    = c.req.query('reportable');

  let sql = 'SELECT * FROM oe_security_remediations WHERE 1=1';
  const binds: unknown[] = [];
  if (severity_tier) { sql += ' AND severity_tier = ?'; binds.push(severity_tier); }
  if (status)        { sql += ' AND chain_status = ?'; binds.push(status); }
  if (oem_vendor)    { sql += ' AND oem_vendor = ?'; binds.push(oem_vendor); }

  sql += ' ORDER BY datetime(advisory_received_at) DESC LIMIT 500';

  const rs = await c.env.DB.prepare(sql).bind(...binds).all<RemediationRow>();
  const now = new Date();
  let items = (rs.results || []).map((r) => decorate(r, now));
  if (breached === 'true')   items = items.filter((r) => r.sla_breached);
  if (reportable === 'true') items = items.filter((r) => r.is_reportable);

  const by_status: Record<string, number> = {};
  const by_tier: Record<string, number> = {};
  for (const i of items) {
    by_status[i.chain_status] = (by_status[i.chain_status] || 0) + 1;
    by_tier[i.severity_tier] = (by_tier[i.severity_tier] || 0) + 1;
  }

  const open_count            = items.filter((i) => !i.is_terminal).length;
  const resolved_count        = items.filter((i) => i.chain_status === 'resolved').length;
  const not_affected_count    = items.filter((i) => i.chain_status === 'not_affected').length;
  const risk_accepted_count   = items.filter((i) => i.chain_status === 'risk_accepted').length;
  const rolled_back_count     = items.filter((i) => i.chain_status === 'rolled_back').length;
  const in_rollout_count      = items.filter((i) => i.chain_status === 'rollout_in_progress').length;
  const awaiting_approval_count = items.filter((i) => i.chain_status === 'fleet_scoped').length;
  const mitigated_count       = items.filter((i) => i.chain_status === 'mitigation_applied').length;
  const breached_count        = items.filter((i) => i.sla_breached && !i.is_terminal).length;
  const reportable_total      = items.filter((i) => i.is_reportable).length;
  const critical_open         = items.filter((i) => !i.is_terminal && i.severity_tier === 'critical').length;
  const total_affected_ci     = items.reduce((sum, i) => sum + (i.affected_ci_count || 0), 0);
  const total_patched_ci      = items.reduce((sum, i) => sum + (i.patched_ci_count || 0), 0);

  return c.json({
    success: true,
    data: {
      items,
      total: items.length,
      by_status,
      by_tier,
      open_count,
      resolved_count,
      not_affected_count,
      risk_accepted_count,
      rolled_back_count,
      in_rollout_count,
      awaiting_approval_count,
      mitigated_count,
      breached: breached_count,
      reportable_total,
      critical_open,
      total_affected_ci,
      total_patched_ci,
    },
  });
});

app.get('/:id', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const id = c.req.param('id')!;
  const row = await c.env.DB.prepare('SELECT * FROM oe_security_remediations WHERE id = ?').bind(id).first<RemediationRow>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const ev = await c.env.DB.prepare(
    'SELECT * FROM oe_security_remediations_events WHERE remediation_id = ? ORDER BY datetime(created_at) ASC',
  ).bind(id).all<RemediationEventRow>();

  return c.json({
    success: true,
    data: {
      case: decorate(row, new Date()),
      events: ev.results || [],
    },
  });
});

interface TriageBody {
  triage_basis?: string;
  cvss_score?: number;
  cvss_vector?: string;
  cve_id?: string;
  advisory_source?: string;
  ci_type?: string;
  reason_code?: string;
  notes?: string;
}
interface AssessBody {
  assessment_basis?: string;
  affected_ci_count?: number;
  sites_affected?: number;
  fleet_scope?: string;
  notes?: string;
}
interface MitigationBody {
  mitigation_basis?: string;
  mitigation_type?: string;
  compensating_control?: string;
  notes?: string;
}
interface NotAffectedBody {
  reason_code?: string;
  decision_notes?: string;
  notes?: string;
}
interface EmergencyBody {
  approval_basis?: string;
  patch_package_ref?: string;
  backout_plan_ref?: string;
  regulator_ref?: string;
  notes?: string;
}
interface ScopeBody {
  fleet_scope?: string;
  affected_ci_count?: number;
  sites_affected?: number;
  notes?: string;
}
interface ApproveBody {
  approval_basis?: string;
  patch_package_ref?: string;
  backout_plan_ref?: string;
  fixed_version?: string;
  notes?: string;
}
interface RolloutBody {
  rollout_basis?: string;
  patch_package_ref?: string;
  patched_ci_count?: number;
  notes?: string;
}
interface VerifyBody {
  verification_basis?: string;
  resolution_basis?: string;
  patched_ci_count?: number;
  notes?: string;
}
interface RiskAcceptBody {
  residual_risk_basis?: string;
  risk_acceptance_basis?: string;
  compensating_control?: string;
  regulator_ref?: string;
  reason_code?: string;
  notes?: string;
}
interface RollBackBody {
  backout_basis?: string;
  backout_ref?: string;
  reason_code?: string;
  regulator_ref?: string;
  notes?: string;
}

async function transition(
  c: Context<HonoEnv>,
  action: RemediationAction,
  bodyHandler?: (row: RemediationRow, body: Record<string, unknown>) => Partial<RemediationRow>,
) {
  const user = getCurrentUser(c);
  if (!user || !WRITE_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const id = c.req.param('id')!;
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const notes = typeof body.notes === 'string' ? body.notes : null;

  const row = await c.env.DB.prepare('SELECT * FROM oe_security_remediations WHERE id = ?').bind(id).first<RemediationRow>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const to = nextStatus(row.chain_status, action);
  if (!to) {
    return c.json({
      success: false,
      error: `Invalid transition: ${row.chain_status} → ${action}`,
    }, 422);
  }

  const overrides = bodyHandler ? bodyHandler(row, body) : {};
  // The tier may have been re-derived (triage assigns the CVSS score); the SLA
  // window and regulator crossings must track the CURRENT tier.
  const tier = (overrides.severity_tier as RemediationTier | undefined) ?? row.severity_tier;

  const tsCol = TIMESTAMP_COLUMN[to];
  const now = new Date();
  const nowIso = now.toISOString();
  const sla = slaDeadlineFor(to, tier, now);
  const slaIso = sla ? sla.toISOString() : null;

  const crosses = crossesIntoRegulator(action, tier);
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
    `UPDATE oe_security_remediations SET ${setClauses.join(', ')} WHERE id = ?`,
  ).bind(...setBinds).run();

  const evtId = `srm_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
  await c.env.DB.prepare(
    'INSERT INTO oe_security_remediations_events (id, remediation_id, event_type, from_status, to_status, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
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
    entity_type: 'security_remediation',
    entity_id: id,
    data: {
      ...row,
      ...overrides,
      severity_tier: tier,
      chain_status: to,
      from_status: row.chain_status,
      action,
      crosses_into_regulator: crosses,
    },
    env: c.env,
  });

  const refreshed = await c.env.DB.prepare('SELECT * FROM oe_security_remediations WHERE id = ?').bind(id).first<RemediationRow>();
  return c.json({ success: true, data: { case: refreshed ? decorate(refreshed, now) : null } });
}

app.post('/:id/triage', async (c) => transition(c, 'triage', (_row, body) => {
  const b = body as Partial<TriageBody>;
  const out: Partial<RemediationRow> = {};
  if (typeof b.triage_basis === 'string')    out.triage_basis = b.triage_basis;
  if (typeof b.cvss_vector === 'string')     out.cvss_vector = b.cvss_vector;
  if (typeof b.cve_id === 'string')          out.cve_id = b.cve_id;
  if (typeof b.advisory_source === 'string') out.advisory_source = b.advisory_source;
  if (typeof b.ci_type === 'string')         out.ci_type = b.ci_type;
  if (typeof b.reason_code === 'string')     out.reason_code = b.reason_code;
  // The analyst assigns the CVSS base score at triage; re-derive the tier live.
  if (typeof b.cvss_score === 'number') {
    out.cvss_score = b.cvss_score;
    out.severity_tier = tierForCvss(b.cvss_score);
  }
  return out;
}));

app.post('/:id/assess-impact', async (c) => transition(c, 'assess_impact', (_row, body) => {
  const b = body as Partial<AssessBody>;
  const out: Partial<RemediationRow> = {};
  if (typeof b.assessment_basis === 'string')  out.assessment_basis = b.assessment_basis;
  if (typeof b.affected_ci_count === 'number') out.affected_ci_count = b.affected_ci_count;
  if (typeof b.sites_affected === 'number')    out.sites_affected = b.sites_affected;
  if (typeof b.fleet_scope === 'string')       out.fleet_scope = b.fleet_scope;
  return out;
}));

app.post('/:id/apply-mitigation', async (c) => transition(c, 'apply_mitigation', (_row, body) => {
  const b = body as Partial<MitigationBody>;
  const out: Partial<RemediationRow> = {};
  if (typeof b.mitigation_basis === 'string')      out.mitigation_basis = b.mitigation_basis;
  if (typeof b.mitigation_type === 'string')       out.mitigation_type = b.mitigation_type;
  if (typeof b.compensating_control === 'string')  out.compensating_control = b.compensating_control;
  return out;
}));

app.post('/:id/mark-not-affected', async (c) => transition(c, 'mark_not_affected', (_row, body) => {
  const b = body as Partial<NotAffectedBody>;
  const out: Partial<RemediationRow> = {};
  if (typeof b.reason_code === 'string')     out.reason_code = b.reason_code;
  if (typeof b.decision_notes === 'string')  out.decision_notes = b.decision_notes;
  return out;
}));

app.post('/:id/emergency-authorize', async (c) => transition(c, 'emergency_authorize', (_row, body) => {
  const b = body as Partial<EmergencyBody>;
  const out: Partial<RemediationRow> = {};
  if (typeof b.approval_basis === 'string')     out.approval_basis = b.approval_basis;
  if (typeof b.patch_package_ref === 'string')  out.patch_package_ref = b.patch_package_ref;
  if (typeof b.backout_plan_ref === 'string')   out.backout_plan_ref = b.backout_plan_ref;
  if (typeof b.regulator_ref === 'string')      out.regulator_ref = b.regulator_ref;
  return out;
}));

app.post('/:id/scope-fleet', async (c) => transition(c, 'scope_fleet', (_row, body) => {
  const b = body as Partial<ScopeBody>;
  const out: Partial<RemediationRow> = {};
  if (typeof b.fleet_scope === 'string')       out.fleet_scope = b.fleet_scope;
  if (typeof b.affected_ci_count === 'number') out.affected_ci_count = b.affected_ci_count;
  if (typeof b.sites_affected === 'number')    out.sites_affected = b.sites_affected;
  return out;
}));

app.post('/:id/approve-remediation', async (c) => transition(c, 'approve_remediation', (_row, body) => {
  const b = body as Partial<ApproveBody>;
  const out: Partial<RemediationRow> = {};
  if (typeof b.approval_basis === 'string')     out.approval_basis = b.approval_basis;
  if (typeof b.patch_package_ref === 'string')  out.patch_package_ref = b.patch_package_ref;
  if (typeof b.backout_plan_ref === 'string')   out.backout_plan_ref = b.backout_plan_ref;
  if (typeof b.fixed_version === 'string')      out.fixed_version = b.fixed_version;
  return out;
}));

app.post('/:id/begin-rollout', async (c) => transition(c, 'begin_rollout', (_row, body) => {
  const b = body as Partial<RolloutBody>;
  const out: Partial<RemediationRow> = {};
  if (typeof b.rollout_basis === 'string')      out.rollout_basis = b.rollout_basis;
  if (typeof b.patch_package_ref === 'string')  out.patch_package_ref = b.patch_package_ref;
  if (typeof b.patched_ci_count === 'number')   out.patched_ci_count = b.patched_ci_count;
  return out;
}));

app.post('/:id/complete-rollout', async (c) => transition(c, 'complete_rollout', (_row, body) => {
  const b = body as Partial<RolloutBody>;
  const out: Partial<RemediationRow> = {};
  if (typeof b.rollout_basis === 'string')    out.rollout_basis = b.rollout_basis;
  if (typeof b.patched_ci_count === 'number') out.patched_ci_count = b.patched_ci_count;
  return out;
}));

app.post('/:id/verify', async (c) => transition(c, 'verify', (_row, body) => {
  const b = body as Partial<VerifyBody>;
  const out: Partial<RemediationRow> = {};
  if (typeof b.verification_basis === 'string') out.verification_basis = b.verification_basis;
  if (typeof b.resolution_basis === 'string')   out.resolution_basis = b.resolution_basis;
  if (typeof b.patched_ci_count === 'number')   out.patched_ci_count = b.patched_ci_count;
  return out;
}));

app.post('/:id/accept-risk', async (c) => transition(c, 'accept_risk', (_row, body) => {
  const b = body as Partial<RiskAcceptBody>;
  const out: Partial<RemediationRow> = {};
  if (typeof b.residual_risk_basis === 'string')   out.residual_risk_basis = b.residual_risk_basis;
  if (typeof b.risk_acceptance_basis === 'string') out.risk_acceptance_basis = b.risk_acceptance_basis;
  if (typeof b.compensating_control === 'string')  out.compensating_control = b.compensating_control;
  if (typeof b.regulator_ref === 'string')         out.regulator_ref = b.regulator_ref;
  if (typeof b.reason_code === 'string')           out.reason_code = b.reason_code;
  return out;
}));

app.post('/:id/roll-back', async (c) => transition(c, 'roll_back', (_row, body) => {
  const b = body as Partial<RollBackBody>;
  const out: Partial<RemediationRow> = { escalation_level: 1 };
  if (typeof b.backout_basis === 'string')   out.backout_basis = b.backout_basis;
  if (typeof b.backout_ref === 'string')     out.backout_ref = b.backout_ref;
  if (typeof b.reason_code === 'string')     out.reason_code = b.reason_code;
  if (typeof b.regulator_ref === 'string')   out.regulator_ref = b.regulator_ref;
  return out;
}));

export async function securityRemediationSlaSweep(env: HonoEnv['Bindings']): Promise<{ scanned: number; breached: number }> {
  const now = new Date();
  const nowIso = now.toISOString();
  const rs = await env.DB.prepare(
    `SELECT * FROM oe_security_remediations
     WHERE chain_status NOT IN ('resolved','not_affected','risk_accepted','rolled_back')
       AND sla_deadline_at IS NOT NULL
       AND datetime(sla_deadline_at) < datetime(?)
       AND (last_sla_breach_at IS NULL OR datetime(last_sla_breach_at) < datetime(sla_deadline_at))`,
  ).bind(nowIso).all<RemediationRow>();

  const rows = rs.results || [];
  let breached = 0;
  for (const row of rows) {
    await env.DB.prepare(
      `UPDATE oe_security_remediations
       SET last_sla_breach_at = ?, escalation_level = escalation_level + 1, updated_at = ?
       WHERE id = ?`,
    ).bind(nowIso, nowIso, row.id).run();

    const evtId = `srm_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
    await env.DB.prepare(
      'INSERT INTO oe_security_remediations_events (id, remediation_id, event_type, from_status, to_status, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).bind(
      evtId,
      row.id,
      'security_remediation.sla_breached',
      row.chain_status,
      row.chain_status,
      'system',
      'system',
      `Auto-breach: ${row.chain_status} past SLA (severity ${row.severity_tier})`,
      JSON.stringify({ sla_deadline_at: row.sla_deadline_at }),
      nowIso,
    ).run();

    if (slaBreachCrossesIntoRegulator(row.severity_tier)) {
      await fireCascade({
        event: 'security_remediation.sla_breached',
        actor_id: 'system',
        entity_type: 'security_remediation',
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
