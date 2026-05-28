// ═══════════════════════════════════════════════════════════════════════════
// Wave 60 — Trader Algorithmic / DEA Trading-System Certification & Kill-Switch
// Governance chain (route).
//
// Mounted at /api/algo-cert/chain.
//
// 12-state P6 lifecycle for every automated / DEA trading SYSTEM the desk wants
// to run. Financial Markets Act 19 of 2012 + FSCA Conduct Standards for
// automated trading + JSE algorithmic-trading / DEA rules + the MiFID II RTS 6
// analogue. The PRE-DEPLOYMENT GOVERNANCE GATE upstream of every other Trader
// chain (W9 quote, W29 positions, W36 execution, W44 reporting) and watched by
// W52 surveillance once live.
//
// Two-party split write — the trading FIRM owns the system-lifecycle endpoints
// (submit_certification, deploy, resubmit, decommission) and may always hit the
// emergency kill-switch; the exchange/certification AUTHORITY owns the gating
// machinery (review, conformance, controls validation, certify, recertify,
// reinstate, remediation, reject). actor_party records the post-event function.
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
  isReportable,
  partyForAction,
  isFirmAction,
  isAuthorityAction,
  SLA_MINUTES,
  type AlgoCertStatus,
  type AlgoCertAction,
  type AlgoTier,
} from '../utils/algo-cert-spec';

const READ_ROLES = new Set([
  'admin', 'support',
  'trader',
  'regulator',
]);

// The trading FIRM (the desk) drives the system-lifecycle endpoints.
const FIRM_ROLES = new Set(['trader', 'admin']);
// The exchange / certification AUTHORITY drives the gating machinery.
const AUTHORITY_ROLES = new Set(['admin', 'regulator']);
// Any write role may hit the emergency kill-switch on a live system.
const WRITE_ROLES = new Set([...FIRM_ROLES, ...AUTHORITY_ROLES]);

const app = new Hono<HonoEnv>();
app.use('*', authMiddleware);

interface AlgoCertRow {
  id: string;
  case_number: string;
  source_event: string | null;
  source_entity_type: string | null;
  source_entity_id: string | null;
  source_wave: string | null;
  firm_party_id: string;
  firm_party_name: string;
  authority_party_id: string;
  authority_party_name: string;
  system_code: string | null;
  system_name: string;
  system_type: string;
  strategy_class: string | null;
  asset_classes: string | null;
  venue: string | null;
  dea_provider: string | null;
  software_version: string | null;
  authorised_notional_zar_m: number;
  max_order_value_zar: number | null;
  max_message_rate_per_sec: number | null;
  algo_tier: AlgoTier;
  kill_switch_present: number;
  price_collars_present: number;
  throttles_present: number;
  max_order_size_present: number;
  conformance_test_passed: number;
  controls_validated: number;
  registration_ref: string | null;
  documentation_ref: string | null;
  conformance_ref: string | null;
  controls_ref: string | null;
  certification_ref: string | null;
  deployment_ref: string | null;
  recertification_ref: string | null;
  kill_switch_ref: string | null;
  remediation_ref: string | null;
  rejection_ref: string | null;
  decommission_ref: string | null;
  regulator_ref: string | null;
  documentation_basis: string | null;
  conformance_basis: string | null;
  controls_basis: string | null;
  certification_basis: string | null;
  recertification_basis: string | null;
  kill_switch_basis: string | null;
  remediation_basis: string | null;
  rejection_basis: string | null;
  reason_code: string | null;
  notes: string | null;
  recertification_round: number;
  remediation_round: number;
  suspension_round: number;
  chain_status: AlgoCertStatus;
  registration_submitted_at: string;
  documentation_review_at: string | null;
  conformance_testing_at: string | null;
  risk_controls_validation_at: string | null;
  certification_review_at: string | null;
  certified_at: string | null;
  deployed_at: string | null;
  recertification_review_at: string | null;
  suspended_at: string | null;
  remediation_required_at: string | null;
  rejected_at: string | null;
  decommissioned_at: string | null;
  is_reportable: number;
  sla_deadline_at: string | null;
  last_sla_breach_at: string | null;
  escalation_level: number;
  created_by: string;
  created_at: string;
  updated_at: string;
}

interface AlgoCertEventRow {
  id: string;
  cert_id: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  actor_id: string | null;
  actor_party: string | null;
  notes: string | null;
  payload: string | null;
  created_at: string;
}

const TIMESTAMP_COLUMN: Record<AlgoCertStatus, keyof AlgoCertRow | null> = {
  registration_submitted:   null,
  documentation_review:     'documentation_review_at',
  conformance_testing:      'conformance_testing_at',
  risk_controls_validation: 'risk_controls_validation_at',
  certification_review:     'certification_review_at',
  certified:                'certified_at',
  deployed:                 'deployed_at',
  recertification_review:   'recertification_review_at',
  suspended:                'suspended_at',
  remediation_required:     'remediation_required_at',
  rejected:                 'rejected_at',
  decommissioned:           'decommissioned_at',
};

function decorate(row: AlgoCertRow, now: Date) {
  const tier = row.algo_tier;
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
    is_reportable_tier: isReportable(tier),
    breach_crosses_regulator: slaBreachCrossesIntoRegulator(tier),
  };
}

function eventTypeFor(action: AlgoCertAction): string {
  switch (action) {
    case 'begin_review':             return 'algo_certification.documentation_review';
    case 'start_conformance':        return 'algo_certification.conformance_testing';
    case 'validate_controls':        return 'algo_certification.risk_controls_validation';
    case 'submit_certification':     return 'algo_certification.certification_review';
    case 'grant_certification':      return 'algo_certification.certified';
    case 'deploy':                   return 'algo_certification.deployed';
    case 'trigger_recertification':  return 'algo_certification.recertification_review';
    case 'complete_recertification': return 'algo_certification.deployed';
    case 'invoke_kill_switch':       return 'algo_certification.suspended';
    case 'reinstate':                return 'algo_certification.deployed';
    case 'require_remediation':      return 'algo_certification.remediation_required';
    case 'resubmit':                 return 'algo_certification.documentation_review';
    case 'reject_certification':     return 'algo_certification.rejected';
    case 'decommission':             return 'algo_certification.decommissioned';
  }
}

app.get('/', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const algo_tier     = c.req.query('algo_tier');
  const status        = c.req.query('status');
  const breached      = c.req.query('breached');
  const firm_party_id = c.req.query('firm_party_id');
  const system_type   = c.req.query('system_type');

  let sql = 'SELECT * FROM oe_algo_certifications WHERE 1=1';
  const binds: unknown[] = [];
  if (algo_tier)     { sql += ' AND algo_tier = ?';     binds.push(algo_tier); }
  if (status)        { sql += ' AND chain_status = ?';  binds.push(status); }
  if (firm_party_id) { sql += ' AND firm_party_id = ?'; binds.push(firm_party_id); }
  if (system_type)   { sql += ' AND system_type = ?';   binds.push(system_type); }

  sql += ' ORDER BY datetime(registration_submitted_at) DESC LIMIT 500';

  const rs = await c.env.DB.prepare(sql).bind(...binds).all<AlgoCertRow>();
  const now = new Date();
  let items = (rs.results || []).map((r) => decorate(r, now));
  if (breached === 'true') items = items.filter((r) => r.sla_breached);

  const by_status: Record<string, number> = {};
  const by_tier: Record<string, number> = {};
  const by_system_type: Record<string, number> = {};
  for (const i of items) {
    by_status[i.chain_status]     = (by_status[i.chain_status] || 0) + 1;
    by_tier[i.algo_tier]          = (by_tier[i.algo_tier] || 0) + 1;
    by_system_type[i.system_type] = (by_system_type[i.system_type] || 0) + 1;
  }

  const open_count        = items.filter((i) => !i.is_terminal).length;
  const certified_count   = items.filter((i) => i.chain_status === 'certified').length;
  const deployed_count    = items.filter((i) => i.chain_status === 'deployed').length;
  const suspended_count   = items.filter((i) => i.chain_status === 'suspended').length;
  const in_review         = items.filter((i) => ['documentation_review', 'conformance_testing', 'risk_controls_validation', 'certification_review', 'recertification_review'].includes(i.chain_status)).length;
  const breached_count    = items.filter((i) => i.sla_breached && !i.is_terminal).length;
  const reportable_total  = items.filter((i) => i.is_reportable_tier).length;
  const high_tier_open    = items.filter((i) => !i.is_terminal && (i.algo_tier === 'high_impact' || i.algo_tier === 'systemic')).length;
  const total_authorised_notional_zar_m = items.reduce((sum, i) => sum + (i.authorised_notional_zar_m || 0), 0);
  const deployed_notional_zar_m = items.filter((i) => i.chain_status === 'deployed').reduce((sum, i) => sum + (i.authorised_notional_zar_m || 0), 0);

  return c.json({
    success: true,
    data: {
      items,
      total: items.length,
      by_status,
      by_tier,
      by_system_type,
      open_count,
      certified_count,
      deployed_count,
      suspended_count,
      in_review,
      breached: breached_count,
      reportable_total,
      high_tier_open,
      total_authorised_notional_zar_m,
      deployed_notional_zar_m,
    },
  });
});

app.get('/:id', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const id = c.req.param('id')!;
  const row = await c.env.DB.prepare('SELECT * FROM oe_algo_certifications WHERE id = ?').bind(id).first<AlgoCertRow>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const ev = await c.env.DB.prepare(
    'SELECT * FROM oe_algo_certifications_events WHERE cert_id = ? ORDER BY datetime(created_at) ASC',
  ).bind(id).all<AlgoCertEventRow>();

  return c.json({
    success: true,
    data: {
      case: decorate(row, new Date()),
      events: ev.results || [],
    },
  });
});

// Per-action write gate: firm-gated actions require a firm role; authority-gated
// actions require an authority role; the emergency kill-switch is allowed by any
// write role (either party may halt a live system).
function roleAllows(action: AlgoCertAction, role: string): boolean {
  if (isFirmAction(action)) return FIRM_ROLES.has(role);
  if (isAuthorityAction(action)) return AUTHORITY_ROLES.has(role);
  return WRITE_ROLES.has(role); // invoke_kill_switch
}

async function transition(
  c: Context<HonoEnv>,
  action: AlgoCertAction,
  bodyHandler?: (row: AlgoCertRow, body: Record<string, unknown>) => Partial<AlgoCertRow>,
) {
  const user = getCurrentUser(c);
  if (!user || !roleAllows(action, user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const id = c.req.param('id')!;
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const notes = typeof body.notes === 'string' ? body.notes : null;

  const row = await c.env.DB.prepare('SELECT * FROM oe_algo_certifications WHERE id = ?').bind(id).first<AlgoCertRow>();
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
  const overrides = bodyHandler ? bodyHandler(row, body) : {};
  const tier = row.algo_tier; // tier fixed at registration by authorised notional
  const sla = slaDeadlineFor(to, tier, now);
  const slaIso = sla ? sla.toISOString() : null;

  const setClauses: string[] = ['chain_status = ?', 'updated_at = ?', 'sla_deadline_at = ?'];
  const setBinds: unknown[] = [to, nowIso, slaIso];
  if (tsCol) {
    setClauses.push(`${tsCol} = ?`);
    setBinds.push(nowIso);
  }
  if (isReportable(tier)) {
    setClauses.push('is_reportable = ?');
    setBinds.push(1);
  }
  for (const [k, v] of Object.entries(overrides)) {
    setClauses.push(`${k} = ?`);
    setBinds.push(v);
  }
  setBinds.push(id);

  await c.env.DB.prepare(
    `UPDATE oe_algo_certifications SET ${setClauses.join(', ')} WHERE id = ?`,
  ).bind(...setBinds).run();

  const evtId = `aco_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
  await c.env.DB.prepare(
    'INSERT INTO oe_algo_certifications_events (id, cert_id, event_type, from_status, to_status, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
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
    entity_type: 'algo_certification',
    entity_id: id,
    data: {
      ...row,
      ...overrides,
      chain_status: to,
      from_status: row.chain_status,
      crosses_into_regulator: crossesIntoRegulator(action, tier),
    },
    env: c.env,
  });

  const refreshed = await c.env.DB.prepare('SELECT * FROM oe_algo_certifications WHERE id = ?').bind(id).first<AlgoCertRow>();
  return c.json({ success: true, data: { case: refreshed ? decorate(refreshed, now) : null } });
}

app.post('/:id/begin-review', async (c) => transition(c, 'begin_review', (_row, body) => {
  const out: Partial<AlgoCertRow> = {};
  if (typeof body.documentation_ref === 'string')   out.documentation_ref = body.documentation_ref;
  if (typeof body.documentation_basis === 'string') out.documentation_basis = body.documentation_basis;
  return out;
}));

app.post('/:id/start-conformance', async (c) => transition(c, 'start_conformance', (_row, body) => {
  const out: Partial<AlgoCertRow> = {};
  if (typeof body.conformance_ref === 'string')   out.conformance_ref = body.conformance_ref;
  if (typeof body.conformance_basis === 'string') out.conformance_basis = body.conformance_basis;
  return out;
}));

app.post('/:id/validate-controls', async (c) => transition(c, 'validate_controls', (_row, body) => {
  const out: Partial<AlgoCertRow> = {};
  if (typeof body.controls_ref === 'string')   out.controls_ref = body.controls_ref;
  if (typeof body.controls_basis === 'string') out.controls_basis = body.controls_basis;
  out.conformance_test_passed = 1;
  out.controls_validated = 1;
  return out;
}));

app.post('/:id/submit-certification', async (c) => transition(c, 'submit_certification', (_row, body) => {
  const out: Partial<AlgoCertRow> = {};
  if (typeof body.certification_ref === 'string')   out.certification_ref = body.certification_ref;
  if (typeof body.certification_basis === 'string') out.certification_basis = body.certification_basis;
  return out;
}));

app.post('/:id/grant-certification', async (c) => transition(c, 'grant_certification', (_row, body) => {
  const out: Partial<AlgoCertRow> = {};
  if (typeof body.certification_ref === 'string')   out.certification_ref = body.certification_ref;
  if (typeof body.certification_basis === 'string') out.certification_basis = body.certification_basis;
  return out;
}));

app.post('/:id/deploy', async (c) => transition(c, 'deploy', (_row, body) => {
  const out: Partial<AlgoCertRow> = {};
  if (typeof body.deployment_ref === 'string') out.deployment_ref = body.deployment_ref;
  return out;
}));

app.post('/:id/trigger-recertification', async (c) => transition(c, 'trigger_recertification', (row, body) => {
  const out: Partial<AlgoCertRow> = {};
  if (typeof body.recertification_ref === 'string')   out.recertification_ref = body.recertification_ref;
  if (typeof body.recertification_basis === 'string') out.recertification_basis = body.recertification_basis;
  if (typeof body.reason_code === 'string')           out.reason_code = body.reason_code;
  out.recertification_round = (row.recertification_round || 0) + 1;
  return out;
}));

app.post('/:id/complete-recertification', async (c) => transition(c, 'complete_recertification', (_row, body) => {
  const out: Partial<AlgoCertRow> = {};
  if (typeof body.recertification_basis === 'string') out.recertification_basis = body.recertification_basis;
  return out;
}));

app.post('/:id/invoke-kill-switch', async (c) => transition(c, 'invoke_kill_switch', (row, body) => {
  const out: Partial<AlgoCertRow> = {};
  if (typeof body.kill_switch_ref === 'string')   out.kill_switch_ref = body.kill_switch_ref;
  if (typeof body.kill_switch_basis === 'string') out.kill_switch_basis = body.kill_switch_basis;
  if (typeof body.reason_code === 'string')       out.reason_code = body.reason_code;
  out.suspension_round = (row.suspension_round || 0) + 1;
  return out;
}));

app.post('/:id/reinstate', async (c) => transition(c, 'reinstate', (_row, body) => {
  const out: Partial<AlgoCertRow> = {};
  if (typeof body.reason_code === 'string') out.reason_code = body.reason_code;
  return out;
}));

app.post('/:id/require-remediation', async (c) => transition(c, 'require_remediation', (row, body) => {
  const out: Partial<AlgoCertRow> = {};
  if (typeof body.remediation_ref === 'string')   out.remediation_ref = body.remediation_ref;
  if (typeof body.remediation_basis === 'string') out.remediation_basis = body.remediation_basis;
  if (typeof body.reason_code === 'string')       out.reason_code = body.reason_code;
  out.remediation_round = (row.remediation_round || 0) + 1;
  return out;
}));

app.post('/:id/resubmit', async (c) => transition(c, 'resubmit', (_row, body) => {
  const out: Partial<AlgoCertRow> = {};
  if (typeof body.documentation_ref === 'string')   out.documentation_ref = body.documentation_ref;
  if (typeof body.documentation_basis === 'string') out.documentation_basis = body.documentation_basis;
  return out;
}));

app.post('/:id/reject-certification', async (c) => transition(c, 'reject_certification', (_row, body) => {
  const out: Partial<AlgoCertRow> = {};
  if (typeof body.rejection_ref === 'string')   out.rejection_ref = body.rejection_ref;
  if (typeof body.rejection_basis === 'string') out.rejection_basis = body.rejection_basis;
  if (typeof body.reason_code === 'string')     out.reason_code = body.reason_code;
  if (typeof body.regulator_ref === 'string')   out.regulator_ref = body.regulator_ref;
  return out;
}));

app.post('/:id/decommission', async (c) => transition(c, 'decommission', (_row, body) => {
  const out: Partial<AlgoCertRow> = {};
  if (typeof body.decommission_ref === 'string') out.decommission_ref = body.decommission_ref;
  if (typeof body.reason_code === 'string')      out.reason_code = body.reason_code;
  return out;
}));

export async function algoCertSlaSweep(env: HonoEnv['Bindings']): Promise<{ scanned: number; breached: number }> {
  const now = new Date();
  const nowIso = now.toISOString();
  const rs = await env.DB.prepare(
    `SELECT * FROM oe_algo_certifications
     WHERE chain_status NOT IN ('rejected','decommissioned','deployed')
       AND sla_deadline_at IS NOT NULL
       AND datetime(sla_deadline_at) < datetime(?)
       AND (last_sla_breach_at IS NULL OR datetime(last_sla_breach_at) < datetime(sla_deadline_at))`,
  ).bind(nowIso).all<AlgoCertRow>();

  const rows = rs.results || [];
  let breached = 0;
  for (const row of rows) {
    await env.DB.prepare(
      `UPDATE oe_algo_certifications
       SET last_sla_breach_at = ?, escalation_level = escalation_level + 1, updated_at = ?
       WHERE id = ?`,
    ).bind(nowIso, nowIso, row.id).run();

    const evtId = `aco_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
    await env.DB.prepare(
      'INSERT INTO oe_algo_certifications_events (id, cert_id, event_type, from_status, to_status, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).bind(
      evtId,
      row.id,
      'algo_certification.sla_breached',
      row.chain_status,
      row.chain_status,
      'system',
      'system',
      `Auto-breach: ${row.chain_status} past certification SLA (tier ${row.algo_tier})`,
      JSON.stringify({ sla_deadline_at: row.sla_deadline_at }),
      nowIso,
    ).run();

    // A missed certification/review deadline on a large/systemic automated system
    // is itself a supervisory concern (high tiers only).
    if (slaBreachCrossesIntoRegulator(row.algo_tier)) {
      await fireCascade({
        event: 'algo_certification.sla_breached',
        actor_id: 'system',
        entity_type: 'algo_certification',
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
