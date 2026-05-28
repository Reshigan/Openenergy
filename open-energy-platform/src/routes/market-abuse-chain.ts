// ═══════════════════════════════════════════════════════════════════════════
// Wave 52 — Trader Market Abuse Surveillance & STOR chain (route).
//
// Mounted at /api/market-abuse/chain.
//
// 12-state lifecycle for every surveillance ALERT the exchange's
// market-surveillance function raises against the order/trade flow. Financial
// Markets Act 19 of 2012 Chapter X (ss.78-82 prohibited trading practices) +
// the FSCA market-abuse regime + STOR obligations. The surveillance complement
// to the desk's own chains (W2 VaR, W9 MM compliance, W29 position limits,
// W36 best-execution, W44 trade-reporting): W52 governs whether the conduct
// itself was abusive.
//
// Single-party write — the trader is the SUBJECT of the case and cannot action
// their own surveillance file. WRITE = {admin (surveillance fn), regulator};
// the desk (trader) has READ only. actor_party (surveillance / regulator /
// subject) records the post-event function per step (audit attribution only).
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
  SLA_MINUTES,
  type MarketAbuseStatus,
  type MarketAbuseAction,
  type AbuseTier,
} from '../utils/market-abuse-spec';

const READ_ROLES = new Set([
  'admin', 'support',
  'trader',
  'regulator',
]);

// The trader is the SUBJECT of a surveillance case and cannot action their own
// file. Only the surveillance authority (admin) and the regulator write.
const WRITE_ROLES = new Set(['admin', 'regulator']);

const app = new Hono<HonoEnv>();
app.use('*', authMiddleware);

interface MarketAbuseRow {
  id: string;
  case_number: string;
  source_event: string | null;
  source_entity_type: string | null;
  source_entity_id: string | null;
  source_wave: string | null;
  subject_party_id: string;
  subject_party_name: string;
  surveillance_party_id: string;
  surveillance_party_name: string;
  abuse_tier: AbuseTier;
  typology: string;
  alert_source: string | null;
  instrument: string | null;
  energy_type: string | null;
  product: string | null;
  venue: string | null;
  risk_score: number | null;
  suspect_volume_mwh: number | null;
  suspect_value_zar_m: number | null;
  estimated_benefit_zar: number | null;
  penalty_zar: number | null;
  triage_ref: string | null;
  investigation_ref: string | null;
  evidence_ref: string | null;
  analysis_ref: string | null;
  stor_ref: string | null;
  referral_ref: string | null;
  enforcement_ref: string | null;
  sanction_ref: string | null;
  dispute_ref: string | null;
  regulator_ref: string | null;
  triage_basis: string | null;
  investigation_basis: string | null;
  evidence_basis: string | null;
  analysis_basis: string | null;
  stor_basis: string | null;
  sanction_basis: string | null;
  dispute_basis: string | null;
  reason_code: string | null;
  resolution_notes: string | null;
  notes: string | null;
  dispute_round: number;
  chain_status: MarketAbuseStatus;
  alert_raised_at: string;
  triaged_at: string | null;
  under_investigation_at: string | null;
  evidence_review_at: string | null;
  analysis_complete_at: string | null;
  cleared_at: string | null;
  stor_filed_at: string | null;
  regulator_referred_at: string | null;
  enforcement_action_at: string | null;
  sanctioned_at: string | null;
  disputed_at: string | null;
  dispute_resolved_at: string | null;
  is_reportable: number;
  sla_deadline_at: string | null;
  last_sla_breach_at: string | null;
  escalation_level: number;
  created_by: string;
  created_at: string;
  updated_at: string;
}

interface MarketAbuseEventRow {
  id: string;
  case_id: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  actor_id: string | null;
  actor_party: string | null;
  notes: string | null;
  payload: string | null;
  created_at: string;
}

const TIMESTAMP_COLUMN: Record<MarketAbuseStatus, keyof MarketAbuseRow | null> = {
  alert_raised:        null,
  triaged:             'triaged_at',
  under_investigation: 'under_investigation_at',
  evidence_review:     'evidence_review_at',
  analysis_complete:   'analysis_complete_at',
  cleared:             'cleared_at',
  stor_filed:          'stor_filed_at',
  regulator_referred:  'regulator_referred_at',
  enforcement_action:  'enforcement_action_at',
  sanctioned:          'sanctioned_at',
  disputed:            'disputed_at',
  dispute_resolved:    'dispute_resolved_at',
};

function decorate(row: MarketAbuseRow, now: Date) {
  const tier = row.abuse_tier;
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

function eventTypeFor(action: MarketAbuseAction): string {
  switch (action) {
    case 'triage':               return 'market_abuse.triaged';
    case 'open_investigation':   return 'market_abuse.under_investigation';
    case 'compile_evidence':     return 'market_abuse.evidence_review';
    case 'complete_analysis':    return 'market_abuse.analysis_complete';
    case 'clear':                return 'market_abuse.cleared';
    case 'dismiss':              return 'market_abuse.cleared';
    case 'file_stor':            return 'market_abuse.stor_filed';
    case 'refer_regulator':      return 'market_abuse.regulator_referred';
    case 'commence_enforcement': return 'market_abuse.enforcement_action';
    case 'sanction':             return 'market_abuse.sanctioned';
    case 'raise_dispute':        return 'market_abuse.disputed';
    case 'resolve_dispute':      return 'market_abuse.dispute_resolved';
  }
}

app.get('/', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const abuse_tier       = c.req.query('abuse_tier');
  const status           = c.req.query('status');
  const breached         = c.req.query('breached');
  const subject_party_id = c.req.query('subject_party_id');
  const typology         = c.req.query('typology');

  let sql = 'SELECT * FROM oe_market_abuse_cases WHERE 1=1';
  const binds: unknown[] = [];
  if (abuse_tier)       { sql += ' AND abuse_tier = ?';       binds.push(abuse_tier); }
  if (status)           { sql += ' AND chain_status = ?';     binds.push(status); }
  if (subject_party_id) { sql += ' AND subject_party_id = ?'; binds.push(subject_party_id); }
  if (typology)         { sql += ' AND typology = ?';         binds.push(typology); }

  sql += ' ORDER BY datetime(alert_raised_at) DESC LIMIT 500';

  const rs = await c.env.DB.prepare(sql).bind(...binds).all<MarketAbuseRow>();
  const now = new Date();
  let items = (rs.results || []).map((r) => decorate(r, now));
  if (breached === 'true') items = items.filter((r) => r.sla_breached);

  const by_status: Record<string, number> = {};
  const by_tier: Record<string, number> = {};
  const by_typology: Record<string, number> = {};
  for (const i of items) {
    by_status[i.chain_status]   = (by_status[i.chain_status] || 0) + 1;
    by_tier[i.abuse_tier]       = (by_tier[i.abuse_tier] || 0) + 1;
    by_typology[i.typology]     = (by_typology[i.typology] || 0) + 1;
  }

  const open_count        = items.filter((i) => !i.is_terminal).length;
  const cleared_count     = items.filter((i) => i.chain_status === 'cleared').length;
  const stor_filed_count  = items.filter((i) => i.chain_status === 'stor_filed').length;
  const sanctioned_count  = items.filter((i) => i.chain_status === 'sanctioned').length;
  const disputed_open     = items.filter((i) => i.chain_status === 'disputed').length;
  const investigating     = items.filter((i) => ['under_investigation', 'evidence_review'].includes(i.chain_status)).length;
  const breached_count    = items.filter((i) => i.sla_breached && !i.is_terminal).length;
  const reportable_total  = items.filter((i) => i.is_reportable_tier).length;
  const critical_open     = items.filter((i) => !i.is_terminal && i.abuse_tier === 'critical_abuse').length;
  const total_suspect_value_zar_m = items.reduce((sum, i) => sum + (i.suspect_value_zar_m || 0), 0);
  const total_penalty_zar         = items.reduce((sum, i) => sum + (i.penalty_zar || 0), 0);
  const total_estimated_benefit_zar = items.reduce((sum, i) => sum + (i.estimated_benefit_zar || 0), 0);

  return c.json({
    success: true,
    data: {
      items,
      total: items.length,
      by_status,
      by_tier,
      by_typology,
      open_count,
      cleared_count,
      stor_filed_count,
      sanctioned_count,
      disputed_open,
      investigating,
      breached: breached_count,
      reportable_total,
      critical_open,
      total_suspect_value_zar_m,
      total_penalty_zar,
      total_estimated_benefit_zar,
    },
  });
});

app.get('/:id', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const id = c.req.param('id')!;
  const row = await c.env.DB.prepare('SELECT * FROM oe_market_abuse_cases WHERE id = ?').bind(id).first<MarketAbuseRow>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const ev = await c.env.DB.prepare(
    'SELECT * FROM oe_market_abuse_cases_events WHERE case_id = ? ORDER BY datetime(created_at) ASC',
  ).bind(id).all<MarketAbuseEventRow>();

  return c.json({
    success: true,
    data: {
      case: decorate(row, new Date()),
      events: ev.results || [],
    },
  });
});

interface TriageBody {
  triage_ref?: string;
  triage_basis?: string;
  abuse_tier?: AbuseTier;
  notes?: string;
}

interface InvestigationBody {
  investigation_ref?: string;
  investigation_basis?: string;
  notes?: string;
}

interface EvidenceBody {
  evidence_ref?: string;
  evidence_basis?: string;
  notes?: string;
}

interface AnalysisBody {
  analysis_ref?: string;
  analysis_basis?: string;
  estimated_benefit_zar?: number;
  notes?: string;
}

interface ClearBody {
  reason_code?: string;
  resolution_notes?: string;
  notes?: string;
}

interface StorBody {
  stor_ref?: string;
  stor_basis?: string;
  regulator_ref?: string;
  notes?: string;
}

interface ReferBody {
  referral_ref?: string;
  regulator_ref?: string;
  notes?: string;
}

interface EnforcementBody {
  enforcement_ref?: string;
  notes?: string;
}

interface SanctionBody {
  sanction_ref?: string;
  sanction_basis?: string;
  penalty_zar?: number;
  reason_code?: string;
  notes?: string;
}

interface DisputeBody {
  dispute_ref?: string;
  dispute_basis?: string;
  reason_code?: string;
  notes?: string;
}

interface ResolveDisputeBody {
  resolution_notes?: string;
  reason_code?: string;
  notes?: string;
}

async function transition(
  c: Context<HonoEnv>,
  action: MarketAbuseAction,
  bodyHandler?: (row: MarketAbuseRow, body: Record<string, unknown>) => Partial<MarketAbuseRow>,
) {
  const user = getCurrentUser(c);
  if (!user || !WRITE_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const id = c.req.param('id')!;
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const notes = typeof body.notes === 'string' ? body.notes : null;

  const row = await c.env.DB.prepare('SELECT * FROM oe_market_abuse_cases WHERE id = ?').bind(id).first<MarketAbuseRow>();
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
  const effectiveTier = (overrides.abuse_tier as AbuseTier) ?? row.abuse_tier;
  const sla = slaDeadlineFor(to, effectiveTier, now);
  const slaIso = sla ? sla.toISOString() : null;

  const setClauses: string[] = ['chain_status = ?', 'updated_at = ?', 'sla_deadline_at = ?'];
  const setBinds: unknown[] = [to, nowIso, slaIso];
  if (tsCol) {
    setClauses.push(`${tsCol} = ?`);
    setBinds.push(nowIso);
  }
  if (isReportable(effectiveTier)) {
    setClauses.push('is_reportable = ?');
    setBinds.push(1);
  }
  for (const [k, v] of Object.entries(overrides)) {
    setClauses.push(`${k} = ?`);
    setBinds.push(v);
  }
  setBinds.push(id);

  await c.env.DB.prepare(
    `UPDATE oe_market_abuse_cases SET ${setClauses.join(', ')} WHERE id = ?`,
  ).bind(...setBinds).run();

  const evtId = `mac_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
  await c.env.DB.prepare(
    'INSERT INTO oe_market_abuse_cases_events (id, case_id, event_type, from_status, to_status, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
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
    entity_type: 'market_abuse_case',
    entity_id: id,
    data: {
      ...row,
      ...overrides,
      chain_status: to,
      from_status: row.chain_status,
      crosses_into_regulator: crossesIntoRegulator(action, effectiveTier),
    },
    env: c.env,
  });

  const refreshed = await c.env.DB.prepare('SELECT * FROM oe_market_abuse_cases WHERE id = ?').bind(id).first<MarketAbuseRow>();
  return c.json({ success: true, data: { case: refreshed ? decorate(refreshed, now) : null } });
}

app.post('/:id/triage', async (c) => transition(c, 'triage', (_row, body) => {
  const b = body as Partial<TriageBody>;
  const out: Partial<MarketAbuseRow> = {};
  if (typeof b.triage_ref === 'string')   out.triage_ref = b.triage_ref;
  if (typeof b.triage_basis === 'string') out.triage_basis = b.triage_basis;
  if (typeof b.abuse_tier === 'string')   out.abuse_tier = b.abuse_tier;
  return out;
}));

app.post('/:id/open-investigation', async (c) => transition(c, 'open_investigation', (_row, body) => {
  const b = body as Partial<InvestigationBody>;
  const out: Partial<MarketAbuseRow> = {};
  if (typeof b.investigation_ref === 'string')   out.investigation_ref = b.investigation_ref;
  if (typeof b.investigation_basis === 'string') out.investigation_basis = b.investigation_basis;
  return out;
}));

app.post('/:id/compile-evidence', async (c) => transition(c, 'compile_evidence', (_row, body) => {
  const b = body as Partial<EvidenceBody>;
  const out: Partial<MarketAbuseRow> = {};
  if (typeof b.evidence_ref === 'string')   out.evidence_ref = b.evidence_ref;
  if (typeof b.evidence_basis === 'string') out.evidence_basis = b.evidence_basis;
  return out;
}));

app.post('/:id/complete-analysis', async (c) => transition(c, 'complete_analysis', (_row, body) => {
  const b = body as Partial<AnalysisBody>;
  const out: Partial<MarketAbuseRow> = {};
  if (typeof b.analysis_ref === 'string')          out.analysis_ref = b.analysis_ref;
  if (typeof b.analysis_basis === 'string')        out.analysis_basis = b.analysis_basis;
  if (typeof b.estimated_benefit_zar === 'number') out.estimated_benefit_zar = b.estimated_benefit_zar;
  return out;
}));

app.post('/:id/clear', async (c) => transition(c, 'clear', (_row, body) => {
  const b = body as Partial<ClearBody>;
  const out: Partial<MarketAbuseRow> = {};
  if (typeof b.reason_code === 'string')      out.reason_code = b.reason_code;
  if (typeof b.resolution_notes === 'string') out.resolution_notes = b.resolution_notes;
  return out;
}));

app.post('/:id/dismiss', async (c) => transition(c, 'dismiss', (_row, body) => {
  const b = body as Partial<ClearBody>;
  const out: Partial<MarketAbuseRow> = {};
  if (typeof b.reason_code === 'string')      out.reason_code = b.reason_code;
  if (typeof b.resolution_notes === 'string') out.resolution_notes = b.resolution_notes;
  return out;
}));

app.post('/:id/file-stor', async (c) => transition(c, 'file_stor', (_row, body) => {
  const b = body as Partial<StorBody>;
  const out: Partial<MarketAbuseRow> = {};
  if (typeof b.stor_ref === 'string')       out.stor_ref = b.stor_ref;
  if (typeof b.stor_basis === 'string')     out.stor_basis = b.stor_basis;
  if (typeof b.regulator_ref === 'string')  out.regulator_ref = b.regulator_ref;
  return out;
}));

app.post('/:id/refer-regulator', async (c) => transition(c, 'refer_regulator', (_row, body) => {
  const b = body as Partial<ReferBody>;
  const out: Partial<MarketAbuseRow> = {};
  if (typeof b.referral_ref === 'string')  out.referral_ref = b.referral_ref;
  if (typeof b.regulator_ref === 'string') out.regulator_ref = b.regulator_ref;
  return out;
}));

app.post('/:id/commence-enforcement', async (c) => transition(c, 'commence_enforcement', (_row, body) => {
  const b = body as Partial<EnforcementBody>;
  const out: Partial<MarketAbuseRow> = {};
  if (typeof b.enforcement_ref === 'string') out.enforcement_ref = b.enforcement_ref;
  return out;
}));

app.post('/:id/sanction', async (c) => transition(c, 'sanction', (_row, body) => {
  const b = body as Partial<SanctionBody>;
  const out: Partial<MarketAbuseRow> = {};
  if (typeof b.sanction_ref === 'string')   out.sanction_ref = b.sanction_ref;
  if (typeof b.sanction_basis === 'string') out.sanction_basis = b.sanction_basis;
  if (typeof b.penalty_zar === 'number')    out.penalty_zar = b.penalty_zar;
  if (typeof b.reason_code === 'string')    out.reason_code = b.reason_code;
  return out;
}));

app.post('/:id/raise-dispute', async (c) => transition(c, 'raise_dispute', (row, body) => {
  const b = body as Partial<DisputeBody>;
  const out: Partial<MarketAbuseRow> = {};
  if (typeof b.dispute_ref === 'string')   out.dispute_ref = b.dispute_ref;
  if (typeof b.dispute_basis === 'string') out.dispute_basis = b.dispute_basis;
  if (typeof b.reason_code === 'string')   out.reason_code = b.reason_code;
  out.dispute_round = (row.dispute_round || 0) + 1;
  return out;
}));

app.post('/:id/resolve-dispute', async (c) => transition(c, 'resolve_dispute', (_row, body) => {
  const b = body as Partial<ResolveDisputeBody>;
  const out: Partial<MarketAbuseRow> = {};
  if (typeof b.resolution_notes === 'string') out.resolution_notes = b.resolution_notes;
  if (typeof b.reason_code === 'string')      out.reason_code = b.reason_code;
  return out;
}));

export async function marketAbuseSlaSweep(env: HonoEnv['Bindings']): Promise<{ scanned: number; breached: number }> {
  const now = new Date();
  const nowIso = now.toISOString();
  const rs = await env.DB.prepare(
    `SELECT * FROM oe_market_abuse_cases
     WHERE chain_status NOT IN ('cleared','sanctioned','dispute_resolved')
       AND sla_deadline_at IS NOT NULL
       AND datetime(sla_deadline_at) < datetime(?)
       AND (last_sla_breach_at IS NULL OR datetime(last_sla_breach_at) < datetime(sla_deadline_at))`,
  ).bind(nowIso).all<MarketAbuseRow>();

  const rows = rs.results || [];
  let breached = 0;
  for (const row of rows) {
    await env.DB.prepare(
      `UPDATE oe_market_abuse_cases
       SET last_sla_breach_at = ?, escalation_level = escalation_level + 1, updated_at = ?
       WHERE id = ?`,
    ).bind(nowIso, nowIso, row.id).run();

    const evtId = `mac_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
    await env.DB.prepare(
      'INSERT INTO oe_market_abuse_cases_events (id, case_id, event_type, from_status, to_status, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).bind(
      evtId,
      row.id,
      'market_abuse.sla_breached',
      row.chain_status,
      row.chain_status,
      'system',
      'system',
      `Auto-breach: ${row.chain_status} past surveillance SLA (tier ${row.abuse_tier})`,
      JSON.stringify({ sla_deadline_at: row.sla_deadline_at }),
      nowIso,
    ).run();

    // A missed surveillance deadline on probable/egregious abuse is itself a
    // reportable market-integrity concern (critical tiers only).
    if (slaBreachCrossesIntoRegulator(row.abuse_tier)) {
      await fireCascade({
        event: 'market_abuse.sla_breached',
        actor_id: 'system',
        entity_type: 'market_abuse_case',
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
