// W155 — IPP Offtake Agreement Variation & Amendment
// ERA §35 + NERSA Licence Amendment Guidelines (2012) + REIPPPP Schedule 5
import { Hono } from 'hono';
import type { HonoEnv } from '../utils/types';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { fireCascade } from '../utils/cascade';
import {
  type PpaVariationStatus, type PpaVariationAction, type VariationTier,
  deriveVariationTier, crossesIntoRegulator, HARD_TERMINALS, VALID_TRANSITIONS, SLA_DAYS,
} from '../utils/ipp-ppa-variation-spec';

const app = new Hono<HonoEnv>();
app.use('*', authMiddleware);
const WRITE_ROLES = ['admin', 'ipp_developer'];

export async function ippPpaVariationSlaSweep(env: HonoEnv['Bindings']): Promise<void> {
  const now = new Date().toISOString();
  const breaches = await env.DB
    .prepare(`SELECT id, tier FROM oe_ipp_ppa_variation
              WHERE sla_due_at IS NOT NULL AND sla_breached = 0
                AND chain_status NOT IN ('ppa_amended','withdrawn','rejected','appeal_determined')
                AND sla_due_at <= ?`)
    .bind(now).all<{ id: string; tier: string }>();
  for (const row of breaches.results ?? []) {
    await env.DB.prepare(`UPDATE oe_ipp_ppa_variation SET sla_breached=1, updated_at=? WHERE id=?`)
      .bind(now, row.id).run();
    await fireCascade({
      event: 'ppavar_evt_.sla_breached' as never,
      actor_id: 'system',
      entity_type: 'ipp_ppavar',
      entity_id: row.id,
      data: { tier: row.tier },
      env,
    });
  }
}

// ── GET / — list with pagination + KPIs ──────────────────────────────────────

app.get('/', async (c) => {
  const user = getCurrentUser(c);
  const { project_id, status, tier, page = '1', per_page = '50' } = c.req.query();
  const offset = (parseInt(page) - 1) * parseInt(per_page);
  const clauses: string[] = [];
  const binds: unknown[] = [];

  if (!['admin', 'support', 'regulator'].includes(user.role)) {
    clauses.push('participant_id = ?');
    binds.push(user.id);
  }
  if (project_id) { clauses.push('project_id = ?'); binds.push(project_id); }
  if (status)     { clauses.push('chain_status = ?'); binds.push(status); }
  if (tier)       { clauses.push('tier = ?'); binds.push(tier); }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';

  const [rows, total, kpis] = await Promise.all([
    c.env.DB.prepare(
      `SELECT * FROM oe_ipp_ppa_variation ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    ).bind(...binds, parseInt(per_page), offset).all<Record<string, unknown>>(),

    c.env.DB.prepare(
      `SELECT COUNT(*) as n FROM oe_ipp_ppa_variation ${where}`,
    ).bind(...binds).first<{ n: number }>(),

    c.env.DB.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN chain_status NOT IN ('ppa_amended','withdrawn','rejected','appeal_determined') THEN 1 ELSE 0 END) as open_count,
        SUM(CASE WHEN chain_status = 'variation_approved' THEN 1 ELSE 0 END) as approved_count,
        SUM(CASE WHEN chain_status = 'rejected' THEN 1 ELSE 0 END) as rejected_count,
        SUM(CASE WHEN chain_status IN ('appeal_filed','appeal_determined') THEN 1 ELSE 0 END) as appeal_count,
        SUM(CASE WHEN sla_breached = 1 THEN 1 ELSE 0 END) as breached_count,
        SUM(CASE WHEN chain_status = 'ppa_amended' THEN 1 ELSE 0 END) as amended_count
      FROM oe_ipp_ppa_variation ${where}
    `).bind(...binds).first<Record<string, unknown>>(),
  ]);

  return c.json({
    success: true,
    data: {
      items: rows.results ?? [],
      pagination: { page: parseInt(page), per_page: parseInt(per_page), total: total?.n ?? 0 },
      kpis,
    },
  });
});

// ── GET /:id — detail + audit trail ──────────────────────────────────────────

app.get('/:id', async (c) => {
  const user = getCurrentUser(c);
  const { id } = c.req.param();
  const row = await c.env.DB
    .prepare('SELECT * FROM oe_ipp_ppa_variation WHERE id = ?')
    .bind(id).first<Record<string, unknown>>();
  if (!row) return c.json({ error: 'Not found' }, 404);
  if (
    !['admin', 'support', 'regulator'].includes(user.role) &&
    row.participant_id !== user.id
  ) return c.json({ error: 'Forbidden' }, 403);

  const audit = await c.env.DB
    .prepare(`SELECT * FROM audit_events WHERE entity_type='ipp_ppavar' AND entity_id=? ORDER BY created_at ASC`)
    .bind(id).all<Record<string, unknown>>();

  return c.json({ success: true, data: { ...row, audit_trail: audit.results ?? [] } });
});

// ── POST / — create new variation application ─────────────────────────────────

app.post('/', async (c) => {
  const user = getCurrentUser(c);
  if (!WRITE_ROLES.includes(user.role)) return c.json({ error: 'Forbidden' }, 403);

  const body = await c.req.json<{
    project_id: string;
    capacity_mw: number;
    variation_type: string;
    description: string;
  }>();

  if (!body.project_id || body.capacity_mw == null || !body.variation_type || !body.description) {
    return c.json({ error: 'project_id, capacity_mw, variation_type, description required' }, 400);
  }

  const tier = deriveVariationTier(body.capacity_mw);
  const now = new Date().toISOString();
  const id = `ppavar_${crypto.randomUUID().replace(/-/g, '').slice(0, 22)}`;
  const slaAt = new Date(Date.now() + SLA_DAYS[tier] * 24 * 3_600_000).toISOString();

  await c.env.DB.prepare(`
    INSERT INTO oe_ipp_ppa_variation
      (id, participant_id, project_id, capacity_mw, tier, variation_type, description,
       chain_status, sla_due_at, sla_breached, created_at, updated_at)
    VALUES (?,?,?,?,?,?,?,'variation_requested',?,0,?,?)
  `).bind(
    id, user.id, body.project_id, body.capacity_mw, tier,
    body.variation_type, body.description, slaAt, now, now,
  ).run();

  await fireCascade({
    event: 'ppavar_evt_.created' as never,
    actor_id: user.id,
    entity_type: 'ipp_ppavar',
    entity_id: id,
    data: { tier, capacity_mw: body.capacity_mw, variation_type: body.variation_type },
    env: c.env,
  });

  return c.json({ success: true, data: { id, tier } }, 201);
});

// ── PUT /:id/action — state-machine transitions ───────────────────────────────

app.put('/:id/action', async (c) => {
  const user = getCurrentUser(c);
  if (!WRITE_ROLES.includes(user.role)) return c.json({ error: 'Forbidden' }, 403);

  const { id } = c.req.param();
  const body = await c.req.json<{
    action: PpaVariationAction | 'flag_sla_breach';
    reason?: string;
    agreement_reference?: string;
  }>();

  const row = await c.env.DB
    .prepare('SELECT * FROM oe_ipp_ppa_variation WHERE id = ?')
    .bind(id).first<Record<string, unknown>>();
  if (!row) return c.json({ error: 'Not found' }, 404);
  if (
    !['admin', 'support'].includes(user.role) &&
    row.participant_id !== user.id
  ) return c.json({ error: 'Forbidden' }, 403);

  const current = row.chain_status as PpaVariationStatus;
  if (HARD_TERMINALS.includes(current)) {
    return c.json({ error: `Status ${current} is terminal` }, 409);
  }

  const ACTION_STATE_MAP: Partial<Record<PpaVariationAction | 'flag_sla_breach', PpaVariationStatus>> = {
    commence_screen:            'regulatory_screen',
    submit_technical:           'technical_review',
    commence_commercial:        'commercial_review',
    open_public_participation:  'public_participation',
    close_public_participation: 'nersa_assessment',
    approve_variation:          'variation_approved',
    amend_ppa:                  'ppa_amended',
    reject_variation:           'rejected',
    file_appeal:                'appeal_filed',
    determine_appeal:           'appeal_determined',
    withdraw:                   'withdrawn',
    flag_sla_breach:            current,
  };

  const nextStatus = ACTION_STATE_MAP[body.action];
  if (!nextStatus) return c.json({ error: `Unknown action: ${body.action}` }, 400);
  if (
    nextStatus !== current &&
    !VALID_TRANSITIONS[current]?.includes(nextStatus)
  ) return c.json({ error: `Cannot transition ${current} → ${nextStatus}` }, 409);

  const now = new Date().toISOString();
  const tier = row.tier as VariationTier;
  const extraCols: Record<string, unknown> = {};

  if (body.action === 'approve_variation') {
    extraCols.variation_approved_at = now;
  }
  if (body.action === 'amend_ppa') {
    extraCols.ppa_amended_at = now;
    if (body.agreement_reference) extraCols.agreement_reference = body.agreement_reference;
  }
  if (body.action === 'reject_variation') {
    extraCols.rejected_at = now;
  }
  if (body.action === 'determine_appeal') {
    extraCols.appeal_determined_at = now;
  }
  if (body.action === 'flag_sla_breach') {
    extraCols.sla_breached = 1;
  }

  const setCols = [
    'chain_status = ?',
    'updated_at = ?',
    ...Object.keys(extraCols).map(k => `${k} = ?`),
  ];
  await c.env.DB
    .prepare(`UPDATE oe_ipp_ppa_variation SET ${setCols.join(', ')} WHERE id = ?`)
    .bind(nextStatus, now, ...Object.values(extraCols), id).run();

  const reportable = body.action !== 'flag_sla_breach'
    ? crossesIntoRegulator(body.action, tier)
    : false;
  await fireCascade({
    event: `ppavar_evt_.${body.action}` as never,
    actor_id: user.id,
    entity_type: 'ipp_ppavar',
    entity_id: id,
    data: { from: current, to: nextStatus, reason: body.reason, tier, is_reportable: reportable },
    env: c.env,
  });

  return c.json({ success: true, data: { id, status: nextStatus, is_reportable: reportable } });
});

export default app;
