// ═══════════════════════════════════════════════════════════════════════════
// Wave 48 — Carbon Tax Offset Claim & Allowance lifecycle chain (P6)
//
// Mounted at /api/carbon-offset-claim/chain.
//
// The MONETISATION / UTILISATION end of the carbon-credit lifecycle. Where W37
// registers a project, W11 verifies its reductions (MRV), W17 retires the
// resulting credits and W42 protects their permanence, THIS chain governs the
// taxpayer claiming RETIRED, ELIGIBLE credits against their SA carbon-tax
// liability — up to 5% (general) or 10% (Annex-2 mining/petroleum) of gross
// liability per Carbon Tax Act 15 of 2019 §13.
//
//   claim_drafted → eligibility_screening → credits_earmarked → claim_submitted
//     → sars_review → allowance_granted → applied_to_return → reconciled
//   SARS query loop: sars_review → sars_query → (respond) → sars_review
//   rejected:    sars_review → rejected
//   clawed_back: allowance_granted|applied_to_return → clawed_back
//   withdrawn:   any pre-submission state → withdrawn
//
// Tiers (offset VALUE materiality): major_claim ≥R10m / standard_claim R1m–R10m
// / minor_claim <R1m. INVERTED SLA — the larger the claim, the LONGER every
// window (a material offset claim warrants deeper SARS scrutiny).
//
// Single carbon-fund desk write {admin, carbon_fund}. actor_party tags the
// functional party (taxpayer / registry-COAS / sars) for audit attribution.
//
// Reportability: claw_back crosses for EVERY tier; reject_claim crosses for
// material tiers (major + standard); grant_allowance crosses for major_claim;
// sla_breached crosses for material tiers.
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
  SLA_MINUTES,
  type ClaimStatus,
  type ClaimAction,
  type ClaimTier,
} from '../utils/carbon-offset-claim-spec';

const READ_ROLES = new Set([
  'admin',
  'regulator',
  'carbon_fund', 'ipp_developer', 'grid_operator', 'offtaker', 'lender', 'trader', 'support',
]);

// Single carbon-fund desk write — the desk records the whole claim lifecycle.
// actor_party tags the contractual function (taxpayer / registry / sars) per action.
const WRITE_ROLES = new Set(['admin', 'carbon_fund']);

const app = new Hono<HonoEnv>();
app.use('*', authMiddleware);

interface ClaimRow {
  id: string;
  claim_number: string;
  source_event: string | null;
  source_entity_type: string | null;
  source_entity_id: string | null;
  source_wave: string | null;
  taxpayer_party_id: string;
  taxpayer_party_name: string;
  registry_name: string | null;
  sars_office_name: string | null;
  tax_year: number;
  industry_group: 'general' | 'annex_2';
  offset_tier: ClaimTier;
  gross_tax_liability_zar: number | null;
  offset_limit_pct: number | null;
  offset_limit_zar: number | null;
  ct_rate_zar_per_tco2e: number | null;
  credits_claimed_tco2e: number | null;
  offset_value_zar: number | null;
  net_tax_liability_zar: number | null;
  credits_unused_tco2e: number | null;
  coas_reference: string | null;
  retirement_ref: string | null;
  sars_reference: string | null;
  query_ref: string | null;
  allowance_ref: string | null;
  return_ref: string | null;
  assessment_ref: string | null;
  clawback_ref: string | null;
  reversal_ref: string | null;
  eligibility_basis: string | null;
  earmark_basis: string | null;
  submission_basis: string | null;
  review_basis: string | null;
  query_basis: string | null;
  allowance_basis: string | null;
  reconciliation_basis: string | null;
  rejection_basis: string | null;
  clawback_basis: string | null;
  reason_code: string | null;
  claim_summary: string | null;
  chain_status: ClaimStatus;
  claim_drafted_at: string;
  eligibility_screening_at: string | null;
  credits_earmarked_at: string | null;
  claim_submitted_at: string | null;
  sars_review_at: string | null;
  sars_query_at: string | null;
  allowance_granted_at: string | null;
  applied_to_return_at: string | null;
  reconciled_at: string | null;
  rejected_at: string | null;
  clawed_back_at: string | null;
  withdrawn_at: string | null;
  query_round: number;
  sla_deadline_at: string | null;
  last_sla_breach_at: string | null;
  is_reportable: number;
  escalation_level: number;
  created_by: string;
  created_at: string;
  updated_at: string;
}

interface ClaimEventRow {
  id: string;
  claim_id: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  actor_id: string | null;
  actor_party: string | null;
  notes: string | null;
  payload: string | null;
  created_at: string;
}

const TIMESTAMP_COLUMN: Record<ClaimStatus, keyof ClaimRow | null> = {
  claim_drafted:         null,
  eligibility_screening: 'eligibility_screening_at',
  credits_earmarked:     'credits_earmarked_at',
  claim_submitted:       'claim_submitted_at',
  sars_review:           'sars_review_at',
  sars_query:            'sars_query_at',
  allowance_granted:     'allowance_granted_at',
  applied_to_return:     'applied_to_return_at',
  reconciled:            'reconciled_at',
  rejected:              'rejected_at',
  clawed_back:           'clawed_back_at',
  withdrawn:             'withdrawn_at',
};

function decorate(row: ClaimRow, now: Date) {
  const tier = row.offset_tier;
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

// begin_review AND respond_query both land in sars_review → share the event.
function eventTypeFor(action: ClaimAction): string {
  switch (action) {
    case 'screen_eligibility': return 'carbon_offset_claim.eligibility_screening';
    case 'earmark_credits':    return 'carbon_offset_claim.credits_earmarked';
    case 'submit_claim':       return 'carbon_offset_claim.claim_submitted';
    case 'begin_review':       return 'carbon_offset_claim.sars_review';
    case 'raise_query':        return 'carbon_offset_claim.sars_query';
    case 'respond_query':      return 'carbon_offset_claim.sars_review';
    case 'grant_allowance':    return 'carbon_offset_claim.allowance_granted';
    case 'reject_claim':       return 'carbon_offset_claim.rejected';
    case 'apply_to_return':    return 'carbon_offset_claim.applied_to_return';
    case 'reconcile':          return 'carbon_offset_claim.reconciled';
    case 'claw_back':          return 'carbon_offset_claim.clawed_back';
    case 'withdraw':           return 'carbon_offset_claim.withdrawn';
  }
}

app.get('/', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const offset_tier    = c.req.query('offset_tier');
  const industry_group = c.req.query('industry_group');
  const status         = c.req.query('status');
  const breached       = c.req.query('breached');
  const reportable     = c.req.query('reportable');

  let sql = 'SELECT * FROM oe_carbon_offset_claims WHERE 1=1';
  const binds: unknown[] = [];
  if (offset_tier)    { sql += ' AND offset_tier = ?';    binds.push(offset_tier); }
  if (industry_group) { sql += ' AND industry_group = ?'; binds.push(industry_group); }
  if (status)         { sql += ' AND chain_status = ?';   binds.push(status); }

  sql += ' ORDER BY datetime(claim_drafted_at) DESC LIMIT 500';

  const rs = await c.env.DB.prepare(sql).bind(...binds).all<ClaimRow>();
  const now = new Date();
  let items = (rs.results || []).map((r) => decorate(r, now));
  if (breached === 'true')   items = items.filter((r) => r.sla_breached);
  if (reportable === 'true') items = items.filter((r) => r.is_reportable);

  const by_status: Record<string, number> = {};
  const by_tier: Record<string, number> = {};
  const by_industry: Record<string, number> = {};
  for (const i of items) {
    by_status[i.chain_status] = (by_status[i.chain_status] || 0) + 1;
    by_tier[i.offset_tier] = (by_tier[i.offset_tier] || 0) + 1;
    by_industry[i.industry_group] = (by_industry[i.industry_group] || 0) + 1;
  }

  const open_count        = items.filter((i) => !i.is_terminal).length;
  const reconciled_count  = items.filter((i) => i.chain_status === 'reconciled').length;
  const rejected_count    = items.filter((i) => i.chain_status === 'rejected').length;
  const clawed_back_count = items.filter((i) => i.chain_status === 'clawed_back').length;
  const withdrawn_count   = items.filter((i) => i.chain_status === 'withdrawn').length;
  const in_review_count   = items.filter((i) =>
    i.chain_status === 'sars_review' || i.chain_status === 'sars_query').length;
  const granted_count     = items.filter((i) =>
    i.chain_status === 'allowance_granted' || i.chain_status === 'applied_to_return').length;
  const breached_count    = items.filter((i) => i.sla_breached && !i.is_terminal).length;
  const reportable_total  = items.filter((i) => i.is_reportable).length;
  const major_open        = items.filter((i) => !i.is_terminal && i.offset_tier === 'major_claim').length;
  const total_credits_claimed = items.reduce((sum, i) => sum + (i.credits_claimed_tco2e || 0), 0);
  const total_offset_value    = items.reduce((sum, i) => sum + (i.offset_value_zar || 0), 0);
  const total_credits_unused  = items.reduce((sum, i) => sum + (i.credits_unused_tco2e || 0), 0);

  return c.json({
    success: true,
    data: {
      items,
      total: items.length,
      by_status,
      by_tier,
      by_industry,
      open_count,
      reconciled_count,
      rejected_count,
      clawed_back_count,
      withdrawn_count,
      in_review_count,
      granted_count,
      breached: breached_count,
      reportable_total,
      major_open,
      total_credits_claimed,
      total_offset_value,
      total_credits_unused,
    },
  });
});

app.get('/:id', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const id = c.req.param('id')!;
  const row = await c.env.DB.prepare('SELECT * FROM oe_carbon_offset_claims WHERE id = ?').bind(id).first<ClaimRow>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const ev = await c.env.DB.prepare(
    'SELECT * FROM oe_carbon_offset_claims_events WHERE claim_id = ? ORDER BY datetime(created_at) ASC',
  ).bind(id).all<ClaimEventRow>();

  return c.json({
    success: true,
    data: {
      case: decorate(row, new Date()),
      events: ev.results || [],
    },
  });
});

interface ScreenBody {
  eligibility_basis?: string;
  coas_reference?: string;
  notes?: string;
}
interface EarmarkBody {
  earmark_basis?: string;
  credits_claimed_tco2e?: number;
  coas_reference?: string;
  retirement_ref?: string;
  notes?: string;
}
interface SubmitBody {
  submission_basis?: string;
  sars_reference?: string;
  gross_tax_liability_zar?: number;
  offset_limit_pct?: number;
  offset_limit_zar?: number;
  ct_rate_zar_per_tco2e?: number;
  offset_value_zar?: number;
  net_tax_liability_zar?: number;
  credits_unused_tco2e?: number;
  notes?: string;
}
interface ReviewBody {
  review_basis?: string;
  notes?: string;
}
interface QueryBody {
  query_basis?: string;
  query_ref?: string;
  notes?: string;
}
interface RespondBody {
  review_basis?: string;
  notes?: string;
}
interface GrantBody {
  allowance_basis?: string;
  allowance_ref?: string;
  offset_value_zar?: number;
  net_tax_liability_zar?: number;
  notes?: string;
}
interface RejectBody {
  rejection_basis?: string;
  reason_code?: string;
  notes?: string;
}
interface ApplyBody {
  return_ref?: string;
  submission_basis?: string;
  notes?: string;
}
interface ReconcileBody {
  reconciliation_basis?: string;
  assessment_ref?: string;
  notes?: string;
}
interface ClawBackBody {
  clawback_basis?: string;
  clawback_ref?: string;
  reversal_ref?: string;
  reason_code?: string;
  notes?: string;
}
interface WithdrawBody {
  reason_code?: string;
  notes?: string;
}

async function transition(
  c: Context<HonoEnv>,
  action: ClaimAction,
  bodyHandler?: (row: ClaimRow, body: Record<string, unknown>) => Partial<ClaimRow>,
) {
  const user = getCurrentUser(c);
  if (!user || !WRITE_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const id = c.req.param('id')!;
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const notes = typeof body.notes === 'string' ? body.notes : null;

  const row = await c.env.DB.prepare('SELECT * FROM oe_carbon_offset_claims WHERE id = ?').bind(id).first<ClaimRow>();
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
  const sla = slaDeadlineFor(to, row.offset_tier, now);
  const slaIso = sla ? sla.toISOString() : null;

  const crosses = crossesIntoRegulator(action, row.offset_tier);
  const overrides = bodyHandler ? bodyHandler(row, body) : {};
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
    `UPDATE oe_carbon_offset_claims SET ${setClauses.join(', ')} WHERE id = ?`,
  ).bind(...setBinds).run();

  const evtId = `coc_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
  await c.env.DB.prepare(
    'INSERT INTO oe_carbon_offset_claims_events (id, claim_id, event_type, from_status, to_status, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
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
    entity_type: 'carbon_offset_claim',
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

  const refreshed = await c.env.DB.prepare('SELECT * FROM oe_carbon_offset_claims WHERE id = ?').bind(id).first<ClaimRow>();
  return c.json({ success: true, data: { case: refreshed ? decorate(refreshed, now) : null } });
}

app.post('/:id/screen-eligibility', async (c) => transition(c, 'screen_eligibility', (_row, body) => {
  const b = body as Partial<ScreenBody>;
  const out: Partial<ClaimRow> = {};
  if (typeof b.eligibility_basis === 'string') out.eligibility_basis = b.eligibility_basis;
  if (typeof b.coas_reference === 'string')    out.coas_reference = b.coas_reference;
  return out;
}));

app.post('/:id/earmark-credits', async (c) => transition(c, 'earmark_credits', (_row, body) => {
  const b = body as Partial<EarmarkBody>;
  const out: Partial<ClaimRow> = {};
  if (typeof b.earmark_basis === 'string')          out.earmark_basis = b.earmark_basis;
  if (typeof b.credits_claimed_tco2e === 'number')  out.credits_claimed_tco2e = b.credits_claimed_tco2e;
  if (typeof b.coas_reference === 'string')         out.coas_reference = b.coas_reference;
  if (typeof b.retirement_ref === 'string')         out.retirement_ref = b.retirement_ref;
  return out;
}));

app.post('/:id/submit-claim', async (c) => transition(c, 'submit_claim', (_row, body) => {
  const b = body as Partial<SubmitBody>;
  const out: Partial<ClaimRow> = {};
  if (typeof b.submission_basis === 'string')       out.submission_basis = b.submission_basis;
  if (typeof b.sars_reference === 'string')         out.sars_reference = b.sars_reference;
  if (typeof b.gross_tax_liability_zar === 'number') out.gross_tax_liability_zar = b.gross_tax_liability_zar;
  if (typeof b.offset_limit_pct === 'number')       out.offset_limit_pct = b.offset_limit_pct;
  if (typeof b.offset_limit_zar === 'number')       out.offset_limit_zar = b.offset_limit_zar;
  if (typeof b.ct_rate_zar_per_tco2e === 'number')  out.ct_rate_zar_per_tco2e = b.ct_rate_zar_per_tco2e;
  if (typeof b.offset_value_zar === 'number')       out.offset_value_zar = b.offset_value_zar;
  if (typeof b.net_tax_liability_zar === 'number')  out.net_tax_liability_zar = b.net_tax_liability_zar;
  if (typeof b.credits_unused_tco2e === 'number')   out.credits_unused_tco2e = b.credits_unused_tco2e;
  return out;
}));

app.post('/:id/begin-review', async (c) => transition(c, 'begin_review', (_row, body) => {
  const b = body as Partial<ReviewBody>;
  const out: Partial<ClaimRow> = {};
  if (typeof b.review_basis === 'string') out.review_basis = b.review_basis;
  return out;
}));

app.post('/:id/raise-query', async (c) => transition(c, 'raise_query', (row, body) => {
  const b = body as Partial<QueryBody>;
  const out: Partial<ClaimRow> = { query_round: (row.query_round || 0) + 1 };
  if (typeof b.query_basis === 'string') out.query_basis = b.query_basis;
  if (typeof b.query_ref === 'string')   out.query_ref = b.query_ref;
  return out;
}));

app.post('/:id/respond-query', async (c) => transition(c, 'respond_query', (_row, body) => {
  const b = body as Partial<RespondBody>;
  const out: Partial<ClaimRow> = {};
  if (typeof b.review_basis === 'string') out.review_basis = b.review_basis;
  return out;
}));

app.post('/:id/grant-allowance', async (c) => transition(c, 'grant_allowance', (_row, body) => {
  const b = body as Partial<GrantBody>;
  const out: Partial<ClaimRow> = {};
  if (typeof b.allowance_basis === 'string')        out.allowance_basis = b.allowance_basis;
  if (typeof b.allowance_ref === 'string')          out.allowance_ref = b.allowance_ref;
  if (typeof b.offset_value_zar === 'number')       out.offset_value_zar = b.offset_value_zar;
  if (typeof b.net_tax_liability_zar === 'number')  out.net_tax_liability_zar = b.net_tax_liability_zar;
  return out;
}));

app.post('/:id/reject-claim', async (c) => transition(c, 'reject_claim', (_row, body) => {
  const b = body as Partial<RejectBody>;
  const out: Partial<ClaimRow> = {};
  if (typeof b.rejection_basis === 'string') out.rejection_basis = b.rejection_basis;
  if (typeof b.reason_code === 'string')     out.reason_code = b.reason_code;
  return out;
}));

app.post('/:id/apply-to-return', async (c) => transition(c, 'apply_to_return', (_row, body) => {
  const b = body as Partial<ApplyBody>;
  const out: Partial<ClaimRow> = {};
  if (typeof b.return_ref === 'string')       out.return_ref = b.return_ref;
  if (typeof b.submission_basis === 'string') out.submission_basis = b.submission_basis;
  return out;
}));

app.post('/:id/reconcile', async (c) => transition(c, 'reconcile', (_row, body) => {
  const b = body as Partial<ReconcileBody>;
  const out: Partial<ClaimRow> = {};
  if (typeof b.reconciliation_basis === 'string') out.reconciliation_basis = b.reconciliation_basis;
  if (typeof b.assessment_ref === 'string')       out.assessment_ref = b.assessment_ref;
  return out;
}));

app.post('/:id/claw-back', async (c) => transition(c, 'claw_back', (_row, body) => {
  const b = body as Partial<ClawBackBody>;
  const out: Partial<ClaimRow> = { escalation_level: 1 };
  if (typeof b.clawback_basis === 'string') out.clawback_basis = b.clawback_basis;
  if (typeof b.clawback_ref === 'string')   out.clawback_ref = b.clawback_ref;
  if (typeof b.reversal_ref === 'string')   out.reversal_ref = b.reversal_ref;
  if (typeof b.reason_code === 'string')    out.reason_code = b.reason_code;
  return out;
}));

app.post('/:id/withdraw', async (c) => transition(c, 'withdraw', (_row, body) => {
  const b = body as Partial<WithdrawBody>;
  const out: Partial<ClaimRow> = {};
  if (typeof b.reason_code === 'string') out.reason_code = b.reason_code;
  return out;
}));

export async function carbonOffsetClaimSlaSweep(env: HonoEnv['Bindings']): Promise<{ scanned: number; breached: number }> {
  const now = new Date();
  const nowIso = now.toISOString();
  const rs = await env.DB.prepare(
    `SELECT * FROM oe_carbon_offset_claims
     WHERE chain_status NOT IN ('reconciled','rejected','clawed_back','withdrawn')
       AND sla_deadline_at IS NOT NULL
       AND datetime(sla_deadline_at) < datetime(?)
       AND (last_sla_breach_at IS NULL OR datetime(last_sla_breach_at) < datetime(sla_deadline_at))`,
  ).bind(nowIso).all<ClaimRow>();

  const rows = rs.results || [];
  let breached = 0;
  for (const row of rows) {
    await env.DB.prepare(
      `UPDATE oe_carbon_offset_claims
       SET last_sla_breach_at = ?, escalation_level = escalation_level + 1, updated_at = ?
       WHERE id = ?`,
    ).bind(nowIso, nowIso, row.id).run();

    const evtId = `coc_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
    await env.DB.prepare(
      'INSERT INTO oe_carbon_offset_claims_events (id, claim_id, event_type, from_status, to_status, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).bind(
      evtId,
      row.id,
      'carbon_offset_claim.sla_breached',
      row.chain_status,
      row.chain_status,
      'system',
      'system',
      `Auto-breach: ${row.chain_status} past SLA (tier ${row.offset_tier})`,
      JSON.stringify({ sla_deadline_at: row.sla_deadline_at }),
      nowIso,
    ).run();

    if (slaBreachCrossesIntoRegulator(row.offset_tier)) {
      await fireCascade({
        event: 'carbon_offset_claim.sla_breached',
        actor_id: 'system',
        entity_type: 'carbon_offset_claim',
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
