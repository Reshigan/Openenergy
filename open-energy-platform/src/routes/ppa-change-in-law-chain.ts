// ═══════════════════════════════════════════════════════════════════════════
// Wave 78 — PPA Change-in-Law / Qualifying-Change cost pass-through & relief (P6)
//
// Mounted at /api/ppa-change-in-law/chain.
//
// Every PPA allocates the risk of a CHANGE IN LAW between the parties. When a
// statute, tax or regulation changes after financial close — a new carbon-tax
// rate, a NERSA Grid Code amendment, an environmental-licensing condition, an
// import duty on panels — the affected party tests it against the PPA's
// "Qualifying Change in Law" definition and, if it qualifies, seeks relief: a
// tariff adjustment, a lump-sum, or a term extension. A contested claim goes to
// arbitration. See src/utils/ppa-change-in-law-spec.ts for the full state
// machine, INVERTED quantum tiering and reportability rationale.
//
//   event_logged → eligibility_review → impact_assessment → claim_submitted
//     → counterparty_review → negotiation → determination_pending
//     → relief_granted → implemented                        (negotiated path)
//   ineligible:   eligibility_review → rejected
//   dispute-out:  counterparty_review → rejected
//   no-relief:    determination_pending → rejected
//   arbitration:  {counterparty_review, negotiation} → in_arbitration
//                   → relief_granted (award_relief) | rejected (award_no_relief)
//   withdraw:     any pre-relief operative state → withdrawn
//
// Single write {admin, offtaker} — the offtaker's contract-management desk
// drives every step; actor_party records the contractual function (claimant /
// counterparty / arbitrator) per step for audit texture, not the JWT role.
//
// Reportability (the W78 signature): refer_to_arbitration crosses for EVERY tier
// (a contested change-in-law claim is always reportable); issue_determination /
// award_relief cross for the material+ tiers when the change is GOVERNMENTAL in
// origin; SLA breaches cross for major + critical only.
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
  tierForQuantumZarM,
  isLargeTier,
  SLA_MINUTES,
  type ChangeInLawStatus,
  type ChangeInLawAction,
  type ChangeInLawTier,
  type ChangeType,
} from '../utils/ppa-change-in-law-spec';

// All nine personas may read the change-in-law register.
const READ_ROLES = new Set([
  'admin',
  'offtaker', 'lender', 'regulator', 'grid_operator', 'ipp_developer', 'carbon_fund', 'trader', 'support',
]);

// Single write: the offtaker contract desk operates the chain.
const WRITE_ROLES = new Set(['admin', 'offtaker']);

const app = new Hono<HonoEnv>();
app.use('*', authMiddleware);

interface ChangeInLawRow {
  id: string;
  cil_number: string;
  source_event: string | null;
  source_entity_type: string | null;
  source_entity_id: string | null;
  source_wave: string | null;
  ppa_ref: string | null;
  project_id: string | null;
  contract_ref: string | null;
  generator_name: string;
  offtaker_name: string;
  arbitrator_name: string | null;
  change_type: ChangeType | null;
  change_category: string | null;
  relief_mechanism: string | null;
  currency: string | null;
  claim_quantum_zar_m: number;
  assessed_quantum_zar_m: number | null;
  granted_quantum_zar_m: number | null;
  change_in_law_tier: ChangeInLawTier;
  law_effective_date: string | null;
  notification_date: string | null;
  claim_deadline: string | null;
  determination_due_date: string | null;
  reason_code: string | null;
  eligibility_ref: string | null;
  assessment_ref: string | null;
  claim_ref: string | null;
  negotiation_ref: string | null;
  determination_ref: string | null;
  arbitration_ref: string | null;
  implementation_ref: string | null;
  rejection_ref: string | null;
  withdrawal_ref: string | null;
  event_basis: string | null;
  eligibility_basis: string | null;
  assessment_basis: string | null;
  claim_basis: string | null;
  negotiation_basis: string | null;
  determination_basis: string | null;
  arbitration_basis: string | null;
  implementation_basis: string | null;
  rejection_basis: string | null;
  withdrawal_basis: string | null;
  chain_status: ChangeInLawStatus;
  event_logged_at: string;
  eligibility_review_at: string | null;
  impact_assessment_at: string | null;
  claim_submitted_at: string | null;
  counterparty_review_at: string | null;
  negotiation_at: string | null;
  determination_pending_at: string | null;
  in_arbitration_at: string | null;
  relief_granted_at: string | null;
  implemented_at: string | null;
  rejected_at: string | null;
  withdrawn_at: string | null;
  sla_deadline_at: string | null;
  last_sla_breach_at: string | null;
  is_reportable: number;
  escalation_level: number;
  created_by: string;
  created_at: string;
  updated_at: string;
}

interface ChangeInLawEventRow {
  id: string;
  change_in_law_id: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  actor_id: string | null;
  actor_party: string | null;
  notes: string | null;
  payload: string | null;
  created_at: string;
}

const TIMESTAMP_COLUMN: Record<ChangeInLawStatus, keyof ChangeInLawRow | null> = {
  event_logged:          null,
  eligibility_review:    'eligibility_review_at',
  impact_assessment:     'impact_assessment_at',
  claim_submitted:       'claim_submitted_at',
  counterparty_review:   'counterparty_review_at',
  negotiation:           'negotiation_at',
  determination_pending: 'determination_pending_at',
  in_arbitration:        'in_arbitration_at',
  relief_granted:        'relief_granted_at',
  implemented:           'implemented_at',
  rejected:              'rejected_at',
  withdrawn:             'withdrawn_at',
};

function decorate(row: ChangeInLawRow, now: Date) {
  const tier = row.change_in_law_tier;
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

function eventTypeFor(action: ChangeInLawAction): string {
  switch (action) {
    case 'open_eligibility_review': return 'ppa_change_in_law.eligibility_review';
    case 'confirm_eligible':        return 'ppa_change_in_law.impact_assessment';
    case 'reject_ineligible':       return 'ppa_change_in_law.rejected';
    case 'submit_claim':            return 'ppa_change_in_law.claim_submitted';
    case 'acknowledge_claim':       return 'ppa_change_in_law.counterparty_review';
    case 'enter_negotiation':       return 'ppa_change_in_law.negotiation';
    case 'dispute_claim':           return 'ppa_change_in_law.rejected';
    case 'refer_to_arbitration':    return 'ppa_change_in_law.in_arbitration';
    case 'reach_agreement':         return 'ppa_change_in_law.determination_pending';
    case 'issue_determination':     return 'ppa_change_in_law.relief_granted';
    case 'determine_no_relief':     return 'ppa_change_in_law.rejected';
    case 'award_relief':            return 'ppa_change_in_law.relief_granted';
    case 'award_no_relief':         return 'ppa_change_in_law.rejected';
    case 'implement_relief':        return 'ppa_change_in_law.implemented';
    case 'withdraw_claim':          return 'ppa_change_in_law.withdrawn';
  }
}

app.get('/', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const change_in_law_tier = c.req.query('change_in_law_tier');
  const change_type        = c.req.query('change_type');
  const status             = c.req.query('status');
  const breached           = c.req.query('breached');
  const reportable         = c.req.query('reportable');

  let sql = 'SELECT * FROM oe_ppa_change_in_law WHERE 1=1';
  const binds: unknown[] = [];
  if (change_in_law_tier) { sql += ' AND change_in_law_tier = ?'; binds.push(change_in_law_tier); }
  if (change_type)        { sql += ' AND change_type = ?'; binds.push(change_type); }
  if (status)             { sql += ' AND chain_status = ?'; binds.push(status); }

  sql += ' ORDER BY datetime(event_logged_at) DESC LIMIT 500';

  const rs = await c.env.DB.prepare(sql).bind(...binds).all<ChangeInLawRow>();
  const now = new Date();
  let items = (rs.results || []).map((r) => decorate(r, now));
  if (breached === 'true')   items = items.filter((r) => r.sla_breached);
  if (reportable === 'true') items = items.filter((r) => r.is_reportable);

  const by_status: Record<string, number> = {};
  const by_tier: Record<string, number> = {};
  const by_change_type: Record<string, number> = {};
  for (const i of items) {
    by_status[i.chain_status] = (by_status[i.chain_status] || 0) + 1;
    by_tier[i.change_in_law_tier] = (by_tier[i.change_in_law_tier] || 0) + 1;
    if (i.change_type) by_change_type[i.change_type] = (by_change_type[i.change_type] || 0) + 1;
  }

  const open_count        = items.filter((i) => !i.is_terminal).length;
  const arbitration_count = items.filter((i) => i.chain_status === 'in_arbitration').length;
  const relief_count      = items.filter((i) => i.chain_status === 'relief_granted' || i.chain_status === 'implemented').length;
  const rejected_count    = items.filter((i) => i.chain_status === 'rejected').length;
  const withdrawn_count   = items.filter((i) => i.chain_status === 'withdrawn').length;
  const breached_sla      = items.filter((i) => i.sla_breached && !i.is_terminal).length;
  const reportable_total  = items.filter((i) => i.is_reportable).length;
  const large_open        = items.filter((i) => !i.is_terminal && isLargeTier(i.change_in_law_tier)).length;
  const total_quantum_zar_m   = items.reduce((sum, i) => sum + (i.claim_quantum_zar_m || 0), 0);
  const granted_quantum_zar_m = items.reduce((sum, i) => sum + (i.granted_quantum_zar_m || 0), 0);

  return c.json({
    success: true,
    data: {
      items,
      total: items.length,
      by_status,
      by_tier,
      by_change_type,
      open_count,
      arbitration_count,
      relief_count,
      rejected_count,
      withdrawn_count,
      breached: breached_sla,
      reportable_total,
      large_open,
      total_quantum_zar_m,
      granted_quantum_zar_m,
    },
  });
});

app.get('/:id', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const id = c.req.param('id')!;
  const row = await c.env.DB.prepare('SELECT * FROM oe_ppa_change_in_law WHERE id = ?').bind(id).first<ChangeInLawRow>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const ev = await c.env.DB.prepare(
    'SELECT * FROM oe_ppa_change_in_law_events WHERE change_in_law_id = ? ORDER BY datetime(created_at) ASC',
  ).bind(id).all<ChangeInLawEventRow>();

  return c.json({
    success: true,
    data: {
      case: decorate(row, new Date()),
      events: ev.results || [],
    },
  });
});

interface EligibilityBody {
  eligibility_basis?: string;
  eligibility_ref?: string;
  arbitrator_name?: string;
  notes?: string;
}
interface ConfirmEligibleBody {
  eligibility_basis?: string;
  assessment_basis?: string;
  notes?: string;
}
interface RejectIneligibleBody {
  eligibility_basis?: string;
  rejection_basis?: string;
  rejection_ref?: string;
  reason_code?: string;
  notes?: string;
}
interface AssessBody {
  assessment_basis?: string;
  assessment_ref?: string;
  assessed_quantum_zar_m?: number;
  claim_quantum_zar_m?: number;
  claim_basis?: string;
  claim_ref?: string;
  relief_mechanism?: string;
  notes?: string;
}
interface AcknowledgeBody {
  claim_basis?: string;
  negotiation_basis?: string;
  notes?: string;
}
interface NegotiateBody {
  negotiation_basis?: string;
  negotiation_ref?: string;
  notes?: string;
}
interface DisputeBody {
  negotiation_basis?: string;
  rejection_basis?: string;
  rejection_ref?: string;
  reason_code?: string;
  notes?: string;
}
interface ArbitrationBody {
  arbitration_basis?: string;
  arbitration_ref?: string;
  arbitrator_name?: string;
  reason_code?: string;
  notes?: string;
}
interface AgreementBody {
  negotiation_basis?: string;
  determination_basis?: string;
  relief_mechanism?: string;
  notes?: string;
}
interface DeterminationBody {
  determination_basis?: string;
  determination_ref?: string;
  relief_mechanism?: string;
  granted_quantum_zar_m?: number;
  notes?: string;
}
interface NoReliefBody {
  determination_basis?: string;
  rejection_basis?: string;
  rejection_ref?: string;
  reason_code?: string;
  notes?: string;
}
interface AwardBody {
  arbitration_basis?: string;
  arbitration_ref?: string;
  relief_mechanism?: string;
  granted_quantum_zar_m?: number;
  notes?: string;
}
interface AwardNoReliefBody {
  arbitration_basis?: string;
  rejection_basis?: string;
  rejection_ref?: string;
  reason_code?: string;
  notes?: string;
}
interface ImplementBody {
  implementation_basis?: string;
  implementation_ref?: string;
  notes?: string;
}
interface WithdrawBody {
  withdrawal_basis?: string;
  withdrawal_ref?: string;
  reason_code?: string;
  notes?: string;
}

async function transition(
  c: Context<HonoEnv>,
  action: ChangeInLawAction,
  bodyHandler?: (row: ChangeInLawRow, body: Record<string, unknown>) => Partial<ChangeInLawRow>,
) {
  const user = getCurrentUser(c);
  if (!user || !WRITE_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const id = c.req.param('id')!;
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const notes = typeof body.notes === 'string' ? body.notes : null;

  const row = await c.env.DB.prepare('SELECT * FROM oe_ppa_change_in_law WHERE id = ?').bind(id).first<ChangeInLawRow>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const to = nextStatus(row.chain_status, action);
  if (!to) {
    return c.json({
      success: false,
      error: `Invalid transition: ${row.chain_status} → ${action}`,
    }, 422);
  }

  const overrides = bodyHandler ? bodyHandler(row, body) : {};
  // Tier is re-derived live from the relief quantum (an assessment may restate
  // the claimed cost impact); otherwise the row's recorded tier stands.
  let effectiveTier: ChangeInLawTier = row.change_in_law_tier;
  if (overrides.claim_quantum_zar_m != null) {
    effectiveTier = tierForQuantumZarM(overrides.claim_quantum_zar_m || 0);
    overrides.change_in_law_tier = effectiveTier;
  }
  const effectiveChangeType: ChangeType = (row.change_type ?? 'other_change');

  const tsCol = TIMESTAMP_COLUMN[to];
  const now = new Date();
  const nowIso = now.toISOString();
  const sla = slaDeadlineFor(to, effectiveTier, now);
  const slaIso = sla ? sla.toISOString() : null;

  const crosses = crossesIntoRegulator(action, effectiveTier, effectiveChangeType);
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
    `UPDATE oe_ppa_change_in_law SET ${setClauses.join(', ')} WHERE id = ?`,
  ).bind(...setBinds).run();

  const evtId = `cil_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
  await c.env.DB.prepare(
    'INSERT INTO oe_ppa_change_in_law_events (id, change_in_law_id, event_type, from_status, to_status, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
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
    entity_type: 'ppa_change_in_law',
    entity_id: id,
    data: {
      ...row,
      ...overrides,
      change_in_law_tier: effectiveTier,
      change_type: effectiveChangeType,
      chain_status: to,
      from_status: row.chain_status,
      action,
      crosses_into_regulator: crosses,
    },
    env: c.env,
  });

  const refreshed = await c.env.DB.prepare('SELECT * FROM oe_ppa_change_in_law WHERE id = ?').bind(id).first<ChangeInLawRow>();
  return c.json({ success: true, data: { case: refreshed ? decorate(refreshed, now) : null } });
}

app.post('/:id/open-eligibility-review', async (c) => transition(c, 'open_eligibility_review', (_row, body) => {
  const b = body as Partial<EligibilityBody>;
  const out: Partial<ChangeInLawRow> = {};
  if (typeof b.eligibility_basis === 'string') out.eligibility_basis = b.eligibility_basis;
  if (typeof b.eligibility_ref === 'string')   out.eligibility_ref = b.eligibility_ref;
  if (typeof b.arbitrator_name === 'string')   out.arbitrator_name = b.arbitrator_name;
  return out;
}));

app.post('/:id/confirm-eligible', async (c) => transition(c, 'confirm_eligible', (_row, body) => {
  const b = body as Partial<ConfirmEligibleBody>;
  const out: Partial<ChangeInLawRow> = {};
  if (typeof b.eligibility_basis === 'string') out.eligibility_basis = b.eligibility_basis;
  if (typeof b.assessment_basis === 'string')  out.assessment_basis = b.assessment_basis;
  return out;
}));

app.post('/:id/reject-ineligible', async (c) => transition(c, 'reject_ineligible', (_row, body) => {
  const b = body as Partial<RejectIneligibleBody>;
  const out: Partial<ChangeInLawRow> = {};
  if (typeof b.eligibility_basis === 'string') out.eligibility_basis = b.eligibility_basis;
  if (typeof b.rejection_basis === 'string')   out.rejection_basis = b.rejection_basis;
  if (typeof b.rejection_ref === 'string')     out.rejection_ref = b.rejection_ref;
  if (typeof b.reason_code === 'string')       out.reason_code = b.reason_code;
  return out;
}));

app.post('/:id/submit-claim', async (c) => transition(c, 'submit_claim', (_row, body) => {
  const b = body as Partial<AssessBody>;
  const out: Partial<ChangeInLawRow> = {};
  if (typeof b.assessment_basis === 'string')       out.assessment_basis = b.assessment_basis;
  if (typeof b.assessment_ref === 'string')         out.assessment_ref = b.assessment_ref;
  if (typeof b.assessed_quantum_zar_m === 'number') out.assessed_quantum_zar_m = b.assessed_quantum_zar_m;
  if (typeof b.claim_quantum_zar_m === 'number')    out.claim_quantum_zar_m = b.claim_quantum_zar_m;
  if (typeof b.claim_basis === 'string')            out.claim_basis = b.claim_basis;
  if (typeof b.claim_ref === 'string')              out.claim_ref = b.claim_ref;
  if (typeof b.relief_mechanism === 'string')       out.relief_mechanism = b.relief_mechanism;
  return out;
}));

app.post('/:id/acknowledge-claim', async (c) => transition(c, 'acknowledge_claim', (_row, body) => {
  const b = body as Partial<AcknowledgeBody>;
  const out: Partial<ChangeInLawRow> = {};
  if (typeof b.claim_basis === 'string')       out.claim_basis = b.claim_basis;
  if (typeof b.negotiation_basis === 'string') out.negotiation_basis = b.negotiation_basis;
  return out;
}));

app.post('/:id/enter-negotiation', async (c) => transition(c, 'enter_negotiation', (_row, body) => {
  const b = body as Partial<NegotiateBody>;
  const out: Partial<ChangeInLawRow> = {};
  if (typeof b.negotiation_basis === 'string') out.negotiation_basis = b.negotiation_basis;
  if (typeof b.negotiation_ref === 'string')   out.negotiation_ref = b.negotiation_ref;
  return out;
}));

app.post('/:id/dispute-claim', async (c) => transition(c, 'dispute_claim', (_row, body) => {
  const b = body as Partial<DisputeBody>;
  const out: Partial<ChangeInLawRow> = {};
  if (typeof b.negotiation_basis === 'string') out.negotiation_basis = b.negotiation_basis;
  if (typeof b.rejection_basis === 'string')   out.rejection_basis = b.rejection_basis;
  if (typeof b.rejection_ref === 'string')     out.rejection_ref = b.rejection_ref;
  if (typeof b.reason_code === 'string')       out.reason_code = b.reason_code;
  return out;
}));

app.post('/:id/refer-to-arbitration', async (c) => transition(c, 'refer_to_arbitration', (_row, body) => {
  const b = body as Partial<ArbitrationBody>;
  const out: Partial<ChangeInLawRow> = { escalation_level: 1 };
  if (typeof b.arbitration_basis === 'string') out.arbitration_basis = b.arbitration_basis;
  if (typeof b.arbitration_ref === 'string')   out.arbitration_ref = b.arbitration_ref;
  if (typeof b.arbitrator_name === 'string')   out.arbitrator_name = b.arbitrator_name;
  if (typeof b.reason_code === 'string')       out.reason_code = b.reason_code;
  return out;
}));

app.post('/:id/reach-agreement', async (c) => transition(c, 'reach_agreement', (_row, body) => {
  const b = body as Partial<AgreementBody>;
  const out: Partial<ChangeInLawRow> = {};
  if (typeof b.negotiation_basis === 'string')   out.negotiation_basis = b.negotiation_basis;
  if (typeof b.determination_basis === 'string') out.determination_basis = b.determination_basis;
  if (typeof b.relief_mechanism === 'string')    out.relief_mechanism = b.relief_mechanism;
  return out;
}));

app.post('/:id/issue-determination', async (c) => transition(c, 'issue_determination', (_row, body) => {
  const b = body as Partial<DeterminationBody>;
  const out: Partial<ChangeInLawRow> = {};
  if (typeof b.determination_basis === 'string')   out.determination_basis = b.determination_basis;
  if (typeof b.determination_ref === 'string')     out.determination_ref = b.determination_ref;
  if (typeof b.relief_mechanism === 'string')      out.relief_mechanism = b.relief_mechanism;
  if (typeof b.granted_quantum_zar_m === 'number') out.granted_quantum_zar_m = b.granted_quantum_zar_m;
  return out;
}));

app.post('/:id/determine-no-relief', async (c) => transition(c, 'determine_no_relief', (_row, body) => {
  const b = body as Partial<NoReliefBody>;
  const out: Partial<ChangeInLawRow> = { relief_mechanism: 'no_relief' };
  if (typeof b.determination_basis === 'string') out.determination_basis = b.determination_basis;
  if (typeof b.rejection_basis === 'string')     out.rejection_basis = b.rejection_basis;
  if (typeof b.rejection_ref === 'string')       out.rejection_ref = b.rejection_ref;
  if (typeof b.reason_code === 'string')         out.reason_code = b.reason_code;
  return out;
}));

app.post('/:id/award-relief', async (c) => transition(c, 'award_relief', (_row, body) => {
  const b = body as Partial<AwardBody>;
  const out: Partial<ChangeInLawRow> = {};
  if (typeof b.arbitration_basis === 'string')     out.arbitration_basis = b.arbitration_basis;
  if (typeof b.arbitration_ref === 'string')       out.arbitration_ref = b.arbitration_ref;
  if (typeof b.relief_mechanism === 'string')      out.relief_mechanism = b.relief_mechanism;
  if (typeof b.granted_quantum_zar_m === 'number') out.granted_quantum_zar_m = b.granted_quantum_zar_m;
  return out;
}));

app.post('/:id/award-no-relief', async (c) => transition(c, 'award_no_relief', (_row, body) => {
  const b = body as Partial<AwardNoReliefBody>;
  const out: Partial<ChangeInLawRow> = { relief_mechanism: 'no_relief' };
  if (typeof b.arbitration_basis === 'string') out.arbitration_basis = b.arbitration_basis;
  if (typeof b.rejection_basis === 'string')   out.rejection_basis = b.rejection_basis;
  if (typeof b.rejection_ref === 'string')     out.rejection_ref = b.rejection_ref;
  if (typeof b.reason_code === 'string')       out.reason_code = b.reason_code;
  return out;
}));

app.post('/:id/implement-relief', async (c) => transition(c, 'implement_relief', (_row, body) => {
  const b = body as Partial<ImplementBody>;
  const out: Partial<ChangeInLawRow> = {};
  if (typeof b.implementation_basis === 'string') out.implementation_basis = b.implementation_basis;
  if (typeof b.implementation_ref === 'string')   out.implementation_ref = b.implementation_ref;
  return out;
}));

app.post('/:id/withdraw-claim', async (c) => transition(c, 'withdraw_claim', (_row, body) => {
  const b = body as Partial<WithdrawBody>;
  const out: Partial<ChangeInLawRow> = {};
  if (typeof b.withdrawal_basis === 'string') out.withdrawal_basis = b.withdrawal_basis;
  if (typeof b.withdrawal_ref === 'string')   out.withdrawal_ref = b.withdrawal_ref;
  if (typeof b.reason_code === 'string')      out.reason_code = b.reason_code;
  return out;
}));

// SLA sweep: record an SLA breach on any non-terminal case past its deadline,
// crossing to the regulator for the large tiers (major + critical).
export async function ppaChangeInLawSlaSweep(env: HonoEnv['Bindings']): Promise<{ scanned: number; breached: number }> {
  const now = new Date();
  const nowIso = now.toISOString();

  const rs = await env.DB.prepare(
    `SELECT * FROM oe_ppa_change_in_law
     WHERE chain_status NOT IN ('implemented','rejected','withdrawn')
       AND sla_deadline_at IS NOT NULL
       AND datetime(sla_deadline_at) < datetime(?)
       AND (last_sla_breach_at IS NULL OR datetime(last_sla_breach_at) < datetime(sla_deadline_at))`,
  ).bind(nowIso).all<ChangeInLawRow>();

  const rows = rs.results || [];
  let breached = 0;
  for (const row of rows) {
    await env.DB.prepare(
      `UPDATE oe_ppa_change_in_law
       SET last_sla_breach_at = ?, escalation_level = escalation_level + 1, updated_at = ?
       WHERE id = ?`,
    ).bind(nowIso, nowIso, row.id).run();

    const evtId = `cil_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
    await env.DB.prepare(
      'INSERT INTO oe_ppa_change_in_law_events (id, change_in_law_id, event_type, from_status, to_status, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).bind(
      evtId,
      row.id,
      'ppa_change_in_law.sla_breached',
      row.chain_status,
      row.chain_status,
      'system',
      'counterparty',
      `Auto-breach: ${row.chain_status} past SLA (tier ${row.change_in_law_tier})`,
      JSON.stringify({ sla_deadline_at: row.sla_deadline_at }),
      nowIso,
    ).run();

    if (slaBreachCrossesIntoRegulator(row.change_in_law_tier)) {
      await fireCascade({
        event: 'ppa_change_in_law.sla_breached',
        actor_id: 'system',
        entity_type: 'ppa_change_in_law',
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
