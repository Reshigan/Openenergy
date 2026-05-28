// ═══════════════════════════════════════════════════════════════════════════
// Wave 40 — Regulator Compliance Inspection & Enforcement chain
//
// Mounted at /api/compliance-inspection/chain.
//
// NERSA's PROACTIVE, own-initiative enforcement arm (ERA 2006 §10 monitoring +
// §34/§35 enforcement powers). The regulator schedules a compliance inspection
// of a licensee (routine / complaint / incident / thematic), conducts it,
// drafts and issues findings, may issue a compliance directive requiring
// remediation, verifies the remediation, and closes the matter — or escalates
// to a financial penalty / sanction with a statutory appeal route to the NERSA
// Tribunal.
//
// This is the ACTIVE ENFORCEMENT complement to the reactive W31 disposition
// (intake/triage of incoming complaints + cross-wave escalations) and the
// periodic W33 licence-renewal (licence lifecycle). Disposition routes what
// comes IN; this chain is what the regulator initiates OUT.
//
// Forward path:
//   inspection_scheduled → inspection_in_progress → findings_drafted
//     → findings_issued → directive_issued → remediation_underway
//     → remediation_verified → compliant_closed
//
// Clean short-circuit: inspection_in_progress|findings_drafted → compliant_closed
// Enforcement branch:   findings_issued|directive_issued|remediation_underway
//                         → penalty_imposed → enforcement_closed
// Appeal branch:        penalty_imposed|directive_issued → appealed → enforcement_closed
// Early withdraw:       scheduled|in_progress|findings_drafted → withdrawn
//
// Tiers (contravention severity): critical / serious / minor.
//
// URGENT SLA — the more severe the contravention, the TIGHTER every window.
// Reportability:
//   - lodge_appeal crosses for EVERY tier (Tribunal docket — universal)
//   - impose_penalty crosses for critical + serious (Council enforcement oversight)
//   - sla_breached crosses for critical + serious
//
// Two-party split write: the regulator officer drives the inspection +
// enforcement machinery; the respondent licensee begins remediation and lodges
// any appeal. actor_party (officer / respondent) derived from the action.
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
  isRespondentAction,
  partyForAction,
  SLA_MINUTES,
  type ComplianceInspectionStatus,
  type ComplianceInspectionAction,
  type ComplianceInspectionTier,
} from '../utils/compliance-inspection-spec';

const READ_ROLES = new Set([
  'admin', 'support',
  'regulator',
  'ipp_developer', 'grid_operator', 'offtaker', 'lender', 'trader', 'carbon_fund',
]);

// Two-party split write. The regulator officer drives the inspection +
// enforcement machinery; the respondent licensee begins remediation and lodges
// any appeal. A licensee can hold any of the operating roles, so the respondent
// write-set spans every licensee-side role.
const OFFICER_WRITE_ROLES    = new Set(['admin', 'support', 'regulator']);
const RESPONDENT_WRITE_ROLES = new Set([
  'admin', 'support',
  'ipp_developer', 'grid_operator', 'offtaker', 'lender', 'trader', 'carbon_fund',
]);

const app = new Hono<HonoEnv>();
app.use('*', authMiddleware);

interface InspectionRow {
  id: string;
  inspection_number: string;
  source_event: string | null;
  source_entity_type: string | null;
  source_entity_id: string | null;
  source_wave: string | null;
  officer_party_id: string;
  officer_party_name: string;
  respondent_party_id: string;
  respondent_party_name: string;
  licence_ref: string | null;
  facility_name: string;
  inspection_trigger: string | null;
  contravention_tier: ComplianceInspectionTier;
  licence_condition_ref: string | null;
  penalty_amount_zar: number | null;
  daily_penalty_zar: number | null;
  remediation_cost_zar: number | null;
  findings_ref: string | null;
  directive_ref: string | null;
  penalty_ref: string | null;
  appeal_ref: string | null;
  tribunal_ref: string | null;
  inspection_basis: string | null;
  findings_basis: string | null;
  directive_basis: string | null;
  remediation_basis: string | null;
  penalty_basis: string | null;
  appeal_basis: string | null;
  reason_code: string | null;
  rod_notes: string | null;
  chain_status: ComplianceInspectionStatus;
  inspection_scheduled_at: string;
  inspection_in_progress_at: string | null;
  findings_drafted_at: string | null;
  findings_issued_at: string | null;
  directive_issued_at: string | null;
  remediation_underway_at: string | null;
  remediation_verified_at: string | null;
  penalty_imposed_at: string | null;
  appealed_at: string | null;
  compliant_closed_at: string | null;
  enforcement_closed_at: string | null;
  withdrawn_at: string | null;
  is_reportable: number;
  sla_deadline_at: string | null;
  last_sla_breach_at: string | null;
  escalation_level: number;
  created_by: string;
  created_at: string;
  updated_at: string;
}

interface InspectionEventRow {
  id: string;
  inspection_id: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  actor_id: string | null;
  actor_party: string | null;
  notes: string | null;
  payload: string | null;
  created_at: string;
}

const TIMESTAMP_COLUMN: Record<ComplianceInspectionStatus, keyof InspectionRow | null> = {
  inspection_scheduled:   null,
  inspection_in_progress: 'inspection_in_progress_at',
  findings_drafted:       'findings_drafted_at',
  findings_issued:        'findings_issued_at',
  directive_issued:       'directive_issued_at',
  remediation_underway:   'remediation_underway_at',
  remediation_verified:   'remediation_verified_at',
  penalty_imposed:        'penalty_imposed_at',
  appealed:               'appealed_at',
  compliant_closed:       'compliant_closed_at',
  enforcement_closed:     'enforcement_closed_at',
  withdrawn:              'withdrawn_at',
};

const ENFORCEMENT_PATH = new Set<ComplianceInspectionStatus>(['penalty_imposed', 'appealed', 'enforcement_closed']);

function decorate(row: InspectionRow, now: Date) {
  const tier = row.contravention_tier;
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
    in_enforcement: ENFORCEMENT_PATH.has(status),
    breach_crosses_regulator: slaBreachCrossesIntoRegulator(tier),
  };
}

function eventTypeFor(action: ComplianceInspectionAction): string {
  switch (action) {
    case 'begin_inspection':   return 'compliance_inspection.inspection_in_progress';
    case 'draft_findings':     return 'compliance_inspection.findings_drafted';
    case 'close_no_findings':  return 'compliance_inspection.compliant_closed';
    case 'issue_findings':     return 'compliance_inspection.findings_issued';
    case 'issue_directive':    return 'compliance_inspection.directive_issued';
    case 'begin_remediation':  return 'compliance_inspection.remediation_underway';
    case 'verify_remediation': return 'compliance_inspection.remediation_verified';
    case 'close_compliant':    return 'compliance_inspection.compliant_closed';
    case 'impose_penalty':     return 'compliance_inspection.penalty_imposed';
    case 'lodge_appeal':       return 'compliance_inspection.appealed';
    case 'resolve_appeal':     return 'compliance_inspection.enforcement_closed';
    case 'close_enforcement':  return 'compliance_inspection.enforcement_closed';
    case 'withdraw':           return 'compliance_inspection.withdrawn';
  }
}

app.get('/', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const contravention_tier  = c.req.query('contravention_tier');
  const status              = c.req.query('status');
  const breached            = c.req.query('breached');
  const respondent_party_id = c.req.query('respondent_party_id');
  const reportable          = c.req.query('reportable');

  let sql = 'SELECT * FROM oe_compliance_inspections WHERE 1=1';
  const binds: unknown[] = [];
  if (contravention_tier)  { sql += ' AND contravention_tier = ?';  binds.push(contravention_tier); }
  if (status)              { sql += ' AND chain_status = ?';        binds.push(status); }
  if (respondent_party_id) { sql += ' AND respondent_party_id = ?'; binds.push(respondent_party_id); }

  sql += ' ORDER BY datetime(inspection_scheduled_at) DESC LIMIT 500';

  const rs = await c.env.DB.prepare(sql).bind(...binds).all<InspectionRow>();
  const now = new Date();
  let items = (rs.results || []).map((r) => decorate(r, now));
  if (breached === 'true')   items = items.filter((r) => r.sla_breached);
  if (reportable === 'true') items = items.filter((r) => r.is_reportable);

  const by_status: Record<string, number> = {};
  const by_tier: Record<string, number> = {};
  for (const i of items) {
    by_status[i.chain_status] = (by_status[i.chain_status] || 0) + 1;
    by_tier[i.contravention_tier] = (by_tier[i.contravention_tier] || 0) + 1;
  }

  const open_count             = items.filter((i) => !i.is_terminal).length;
  const compliant_closed_count = items.filter((i) => i.chain_status === 'compliant_closed').length;
  const enforcement_closed_count = items.filter((i) => i.chain_status === 'enforcement_closed').length;
  const withdrawn_count        = items.filter((i) => i.chain_status === 'withdrawn').length;
  const in_enforcement_count   = items.filter((i) => i.in_enforcement && !i.is_terminal).length;
  const appealed_count         = items.filter((i) => i.chain_status === 'appealed').length;
  const breached_count         = items.filter((i) => i.sla_breached && !i.is_terminal).length;
  const reportable_total       = items.filter((i) => i.is_reportable).length;
  const critical_open          = items.filter((i) => !i.is_terminal && i.contravention_tier === 'critical').length;
  const total_penalty          = items.reduce((sum, i) => sum + (i.penalty_amount_zar || 0), 0);
  const total_remediation      = items.reduce((sum, i) => sum + (i.remediation_cost_zar || 0), 0);

  return c.json({
    success: true,
    data: {
      items,
      total: items.length,
      by_status,
      by_tier,
      open_count,
      compliant_closed_count,
      enforcement_closed_count,
      withdrawn_count,
      in_enforcement_count,
      appealed_count,
      breached: breached_count,
      reportable_total,
      critical_open,
      total_penalty,
      total_remediation,
    },
  });
});

app.get('/:id', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const id = c.req.param('id')!;
  const row = await c.env.DB.prepare('SELECT * FROM oe_compliance_inspections WHERE id = ?').bind(id).first<InspectionRow>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const ev = await c.env.DB.prepare(
    'SELECT * FROM oe_compliance_inspections_events WHERE inspection_id = ? ORDER BY datetime(created_at) ASC',
  ).bind(id).all<InspectionEventRow>();

  return c.json({
    success: true,
    data: {
      case: decorate(row, new Date()),
      events: ev.results || [],
    },
  });
});

interface FindingsBody {
  findings_ref?: string;
  findings_basis?: string;
  notes?: string;
}

interface DirectiveBody {
  directive_ref?: string;
  directive_basis?: string;
  notes?: string;
}

interface RemediationBody {
  remediation_basis?: string;
  remediation_cost_zar?: number;
  notes?: string;
}

interface PenaltyBody {
  penalty_ref?: string;
  penalty_basis?: string;
  penalty_amount_zar?: number;
  daily_penalty_zar?: number;
  reason_code?: string;
  notes?: string;
}

interface AppealBody {
  appeal_ref?: string;
  appeal_basis?: string;
  notes?: string;
}

interface ResolveBody {
  tribunal_ref?: string;
  reason_code?: string;
  rod_notes?: string;
  notes?: string;
}

interface CloseBody {
  reason_code?: string;
  rod_notes?: string;
  notes?: string;
}

interface InspectionBody {
  inspection_basis?: string;
  notes?: string;
}

async function transition(
  c: Context<HonoEnv>,
  action: ComplianceInspectionAction,
  bodyHandler?: (row: InspectionRow, body: Record<string, unknown>) => Partial<InspectionRow>,
) {
  const user = getCurrentUser(c);
  const allowed = isRespondentAction(action) ? RESPONDENT_WRITE_ROLES : OFFICER_WRITE_ROLES;
  if (!user || !allowed.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const id = c.req.param('id')!;
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const notes = typeof body.notes === 'string' ? body.notes : null;

  const row = await c.env.DB.prepare('SELECT * FROM oe_compliance_inspections WHERE id = ?').bind(id).first<InspectionRow>();
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
  const sla = slaDeadlineFor(to, row.contravention_tier, now);
  const slaIso = sla ? sla.toISOString() : null;

  const crosses = crossesIntoRegulator(action, row.contravention_tier);
  const overrides = bodyHandler ? bodyHandler(row, body) : {};
  // A penalty or appeal that crosses into the regulator marks the case reportable.
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
    `UPDATE oe_compliance_inspections SET ${setClauses.join(', ')} WHERE id = ?`,
  ).bind(...setBinds).run();

  const evtId = `cinsp_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
  await c.env.DB.prepare(
    'INSERT INTO oe_compliance_inspections_events (id, inspection_id, event_type, from_status, to_status, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
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
    entity_type: 'compliance_inspection',
    entity_id: id,
    data: {
      ...row,
      ...overrides,
      chain_status: to,
      from_status: row.chain_status,
      action,
      crosses_into_regulator: crosses,
    },
    env: c.env,
  });

  const refreshed = await c.env.DB.prepare('SELECT * FROM oe_compliance_inspections WHERE id = ?').bind(id).first<InspectionRow>();
  return c.json({ success: true, data: { case: refreshed ? decorate(refreshed, now) : null } });
}

app.post('/:id/begin-inspection', async (c) => transition(c, 'begin_inspection', (_row, body) => {
  const b = body as Partial<InspectionBody>;
  const out: Partial<InspectionRow> = {};
  if (typeof b.inspection_basis === 'string') out.inspection_basis = b.inspection_basis;
  return out;
}));

app.post('/:id/draft-findings', async (c) => transition(c, 'draft_findings', (_row, body) => {
  const b = body as Partial<FindingsBody>;
  const out: Partial<InspectionRow> = {};
  if (typeof b.findings_ref === 'string')   out.findings_ref = b.findings_ref;
  if (typeof b.findings_basis === 'string') out.findings_basis = b.findings_basis;
  return out;
}));

app.post('/:id/close-no-findings', async (c) => transition(c, 'close_no_findings', (_row, body) => {
  const b = body as Partial<CloseBody>;
  const out: Partial<InspectionRow> = {};
  if (typeof b.reason_code === 'string') out.reason_code = b.reason_code;
  if (typeof b.rod_notes === 'string')   out.rod_notes = b.rod_notes;
  return out;
}));

app.post('/:id/issue-findings', async (c) => transition(c, 'issue_findings', (_row, body) => {
  const b = body as Partial<FindingsBody>;
  const out: Partial<InspectionRow> = {};
  if (typeof b.findings_ref === 'string')   out.findings_ref = b.findings_ref;
  if (typeof b.findings_basis === 'string') out.findings_basis = b.findings_basis;
  return out;
}));

app.post('/:id/issue-directive', async (c) => transition(c, 'issue_directive', (_row, body) => {
  const b = body as Partial<DirectiveBody>;
  const out: Partial<InspectionRow> = {};
  if (typeof b.directive_ref === 'string')   out.directive_ref = b.directive_ref;
  if (typeof b.directive_basis === 'string') out.directive_basis = b.directive_basis;
  return out;
}));

app.post('/:id/begin-remediation', async (c) => transition(c, 'begin_remediation', (_row, body) => {
  const b = body as Partial<RemediationBody>;
  const out: Partial<InspectionRow> = {};
  if (typeof b.remediation_basis === 'string')    out.remediation_basis = b.remediation_basis;
  if (typeof b.remediation_cost_zar === 'number') out.remediation_cost_zar = b.remediation_cost_zar;
  return out;
}));

app.post('/:id/verify-remediation', async (c) => transition(c, 'verify_remediation', (_row, body) => {
  const b = body as Partial<RemediationBody>;
  const out: Partial<InspectionRow> = {};
  if (typeof b.remediation_basis === 'string') out.remediation_basis = b.remediation_basis;
  return out;
}));

app.post('/:id/close-compliant', async (c) => transition(c, 'close_compliant', (_row, body) => {
  const b = body as Partial<CloseBody>;
  const out: Partial<InspectionRow> = {};
  if (typeof b.reason_code === 'string') out.reason_code = b.reason_code;
  if (typeof b.rod_notes === 'string')   out.rod_notes = b.rod_notes;
  return out;
}));

app.post('/:id/impose-penalty', async (c) => transition(c, 'impose_penalty', (_row, body) => {
  const b = body as Partial<PenaltyBody>;
  const out: Partial<InspectionRow> = { escalation_level: 1 };
  if (typeof b.penalty_ref === 'string')        out.penalty_ref = b.penalty_ref;
  if (typeof b.penalty_basis === 'string')      out.penalty_basis = b.penalty_basis;
  if (typeof b.penalty_amount_zar === 'number') out.penalty_amount_zar = b.penalty_amount_zar;
  if (typeof b.daily_penalty_zar === 'number')  out.daily_penalty_zar = b.daily_penalty_zar;
  if (typeof b.reason_code === 'string')        out.reason_code = b.reason_code;
  return out;
}));

app.post('/:id/lodge-appeal', async (c) => transition(c, 'lodge_appeal', (_row, body) => {
  const b = body as Partial<AppealBody>;
  const out: Partial<InspectionRow> = {};
  if (typeof b.appeal_ref === 'string')   out.appeal_ref = b.appeal_ref;
  if (typeof b.appeal_basis === 'string') out.appeal_basis = b.appeal_basis;
  return out;
}));

app.post('/:id/resolve-appeal', async (c) => transition(c, 'resolve_appeal', (_row, body) => {
  const b = body as Partial<ResolveBody>;
  const out: Partial<InspectionRow> = {};
  if (typeof b.tribunal_ref === 'string') out.tribunal_ref = b.tribunal_ref;
  if (typeof b.reason_code === 'string')  out.reason_code = b.reason_code;
  if (typeof b.rod_notes === 'string')    out.rod_notes = b.rod_notes;
  return out;
}));

app.post('/:id/close-enforcement', async (c) => transition(c, 'close_enforcement', (_row, body) => {
  const b = body as Partial<CloseBody>;
  const out: Partial<InspectionRow> = {};
  if (typeof b.reason_code === 'string') out.reason_code = b.reason_code;
  if (typeof b.rod_notes === 'string')   out.rod_notes = b.rod_notes;
  return out;
}));

app.post('/:id/withdraw', async (c) => transition(c, 'withdraw', (_row, body) => {
  const b = body as Partial<CloseBody>;
  const out: Partial<InspectionRow> = {};
  if (typeof b.reason_code === 'string') out.reason_code = b.reason_code;
  if (typeof b.rod_notes === 'string')   out.rod_notes = b.rod_notes;
  return out;
}));

export async function complianceInspectionSlaSweep(env: HonoEnv['Bindings']): Promise<{ scanned: number; breached: number }> {
  const now = new Date();
  const nowIso = now.toISOString();
  const rs = await env.DB.prepare(
    `SELECT * FROM oe_compliance_inspections
     WHERE chain_status NOT IN ('compliant_closed','enforcement_closed','withdrawn')
       AND sla_deadline_at IS NOT NULL
       AND datetime(sla_deadline_at) < datetime(?)
       AND (last_sla_breach_at IS NULL OR datetime(last_sla_breach_at) < datetime(sla_deadline_at))`,
  ).bind(nowIso).all<InspectionRow>();

  const rows = rs.results || [];
  let breached = 0;
  for (const row of rows) {
    await env.DB.prepare(
      `UPDATE oe_compliance_inspections
       SET last_sla_breach_at = ?, escalation_level = escalation_level + 1, updated_at = ?
       WHERE id = ?`,
    ).bind(nowIso, nowIso, row.id).run();

    const evtId = `cinsp_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
    await env.DB.prepare(
      'INSERT INTO oe_compliance_inspections_events (id, inspection_id, event_type, from_status, to_status, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).bind(
      evtId,
      row.id,
      'compliance_inspection.sla_breached',
      row.chain_status,
      row.chain_status,
      'system',
      'system',
      `Auto-breach: ${row.chain_status} past SLA (tier ${row.contravention_tier})`,
      JSON.stringify({ sla_deadline_at: row.sla_deadline_at }),
      nowIso,
    ).run();

    if (slaBreachCrossesIntoRegulator(row.contravention_tier)) {
      await fireCascade({
        event: 'compliance_inspection.sla_breached',
        actor_id: 'system',
        entity_type: 'compliance_inspection',
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
