// Pipeline Routes — deal pipeline for originators / BDMs.
// Schema lives in migrations/002_domain.sql (pipeline_deals).
import { Hono } from 'hono';
import { HonoEnv } from '../utils/types';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { fireCascade } from '../utils/cascade';

const pipeline = new Hono<HonoEnv>();
pipeline.use('*', authMiddleware);

const STAGES = ['identification', 'qualification', 'proposal', 'negotiation', 'contracting', 'closed'] as const;
type Stage = (typeof STAGES)[number];
const STATUSES = ['active', 'won', 'lost', 'cancelled'] as const;
type DealStatus = (typeof STATUSES)[number];

// GET /pipeline — deals visible to caller (admin sees all; otherwise as
// creator or client). Supports ?stage= and ?status= filters.
pipeline.get('/', async (c) => {
  const user = getCurrentUser(c);
  const stage = c.req.query('stage');
  const status = c.req.query('status');
  const filters: string[] = [];
  const bindings: unknown[] = [];
  if (user.role !== 'admin' && user.role !== 'regulator') {
    filters.push('(d.created_by = ? OR d.client_participant_id = ?)');
    bindings.push(user.id, user.id);
  }
  if (stage && (STAGES as readonly string[]).includes(stage)) {
    filters.push('d.stage = ?');
    bindings.push(stage);
  }
  if (status && (STATUSES as readonly string[]).includes(status)) {
    filters.push('d.status = ?');
    bindings.push(status);
  }
  const whereClause = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
  const deals = await c.env.DB.prepare(`
    SELECT d.*, cp.name AS client_name, creator.name AS owner_name
    FROM pipeline_deals d
    LEFT JOIN participants cp ON d.client_participant_id = cp.id
    LEFT JOIN participants creator ON d.created_by = creator.id
    ${whereClause}
    ORDER BY d.updated_at DESC, d.created_at DESC
    LIMIT 200
  `).bind(...bindings).all();
  return c.json({ success: true, data: deals.results || [] });
});

// GET /pipeline/summary — KPI rollup by stage + weighted forecast.
pipeline.get('/summary', async (c) => {
  const user = getCurrentUser(c);
  const scope = user.role === 'admin' || user.role === 'regulator' ? '' : 'AND (d.created_by = ? OR d.client_participant_id = ?)';
  const bindings = user.role === 'admin' || user.role === 'regulator' ? [] : [user.id, user.id];

  const rows = (await c.env.DB.prepare(`
    SELECT d.stage, d.status, COUNT(*) AS c, COALESCE(SUM(d.estimated_value), 0) AS value,
           COALESCE(AVG(d.probability_percentage), 0) AS avg_prob
    FROM pipeline_deals d WHERE 1=1 ${scope}
    GROUP BY d.stage, d.status
  `).bind(...bindings).all()).results || [];

  const byStage: Record<string, { count: number; value_zar: number; weighted_zar: number }> = {};
  let totalActive = 0;
  let totalWeighted = 0;
  let closedWon = 0;
  let closedLost = 0;
  for (const raw of rows) {
    const r = raw as { stage: string; status: string; c: number; value: number; avg_prob: number };
    if (!byStage[r.stage]) byStage[r.stage] = { count: 0, value_zar: 0, weighted_zar: 0 };
    byStage[r.stage].count += Number(r.c);
    byStage[r.stage].value_zar += Number(r.value || 0);
    if (r.status === 'active') {
      const weighted = Number(r.value || 0) * (Number(r.avg_prob || 0) / 100);
      byStage[r.stage].weighted_zar += weighted;
      totalActive += Number(r.value || 0);
      totalWeighted += weighted;
    }
    if (r.status === 'won') closedWon += Number(r.value || 0);
    if (r.status === 'lost') closedLost += Number(r.value || 0);
  }
  return c.json({
    success: true,
    data: {
      by_stage: byStage,
      active_value_zar: totalActive,
      weighted_forecast_zar: Math.round(totalWeighted * 100) / 100,
      closed_won_zar: closedWon,
      closed_lost_zar: closedLost,
    },
  });
});

// GET /pipeline/:id — single deal.
pipeline.get('/:id', async (c) => {
  const user = getCurrentUser(c);
  const id = c.req.param('id');
  const deal = await c.env.DB.prepare(`
    SELECT d.*, cp.name AS client_name, creator.name AS owner_name
    FROM pipeline_deals d
    LEFT JOIN participants cp ON d.client_participant_id = cp.id
    LEFT JOIN participants creator ON d.created_by = creator.id
    WHERE d.id = ?
  `).bind(id).first() as { created_by?: string; client_participant_id?: string } | null;
  if (!deal) return c.json({ success: false, error: 'Deal not found' }, 404);
  if (user.role !== 'admin' && user.role !== 'regulator' && deal.created_by !== user.id && deal.client_participant_id !== user.id) {
    return c.json({ success: false, error: 'Not authorized' }, 403);
  }
  return c.json({ success: true, data: deal });
});

// POST /pipeline/deals — create a new deal.
pipeline.post('/deals', async (c) => {
  const user = getCurrentUser(c);
  const body = await c.req.json().catch(() => ({} as Record<string, unknown>));
  const { deal_name, client_participant_id, deal_type, estimated_value, probability_percentage, stage, submission_deadline } = body as {
    deal_name?: string;
    client_participant_id?: string;
    deal_type?: string;
    estimated_value?: number;
    probability_percentage?: number;
    stage?: string;
    submission_deadline?: string;
  };
  if (!deal_name || !client_participant_id) {
    return c.json({ success: false, error: 'deal_name and client_participant_id are required' }, 400);
  }
  const effectiveStage: Stage = (STAGES as readonly string[]).includes(stage || '')
    ? (stage as Stage)
    : 'identification';
  const id = 'pd_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 6);
  const now = new Date().toISOString();
  await c.env.DB.prepare(`
    INSERT INTO pipeline_deals (id, deal_name, client_participant_id, deal_type, estimated_value, probability_percentage, stage, status, submission_deadline, created_by, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?)
  `).bind(
    id,
    deal_name,
    client_participant_id,
    deal_type || null,
    Number(estimated_value) > 0 ? Number(estimated_value) : null,
    Math.max(0, Math.min(100, Number(probability_percentage || 25))),
    effectiveStage,
    submission_deadline || null,
    user.id,
    now,
    now,
  ).run();

  await fireCascade({
    event: 'pipeline.created',
    actor_id: user.id,
    entity_type: 'pipeline_deals',
    entity_id: id,
    data: { deal_name, client_participant_id, stage: effectiveStage, estimated_value },
    env: c.env,
  });

  return c.json({ success: true, data: { id, stage: effectiveStage, status: 'active' } }, 201);
});

// PUT /pipeline/deals/:id — patch deal fields (owner or admin).
pipeline.put('/deals/:id', async (c) => {
  const user = getCurrentUser(c);
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => ({} as Record<string, unknown>));

  const existing = (await c.env.DB.prepare('SELECT created_by, stage FROM pipeline_deals WHERE id = ?').bind(id).first()) as { created_by: string; stage: string } | null;
  if (!existing) return c.json({ success: false, error: 'Deal not found' }, 404);
  if (existing.created_by !== user.id && user.role !== 'admin') {
    return c.json({ success: false, error: 'Not authorized' }, 403);
  }

  const { deal_name, estimated_value, probability_percentage, deal_type, submission_deadline } = body as Record<string, unknown>;
  await c.env.DB.prepare(`
    UPDATE pipeline_deals SET
      deal_name = COALESCE(?, deal_name),
      estimated_value = COALESCE(?, estimated_value),
      probability_percentage = COALESCE(?, probability_percentage),
      deal_type = COALESCE(?, deal_type),
      submission_deadline = COALESCE(?, submission_deadline),
      updated_at = ?
    WHERE id = ?
  `).bind(
    typeof deal_name === 'string' ? deal_name : null,
    typeof estimated_value === 'number' ? estimated_value : null,
    typeof probability_percentage === 'number' ? Math.max(0, Math.min(100, probability_percentage)) : null,
    typeof deal_type === 'string' ? deal_type : null,
    typeof submission_deadline === 'string' ? submission_deadline : null,
    new Date().toISOString(),
    id,
  ).run();
  const deal = await c.env.DB.prepare('SELECT * FROM pipeline_deals WHERE id = ?').bind(id).first();
  return c.json({ success: true, data: deal });
});

// PUT /pipeline/deals/:id/stage — transition stage. Closing a deal also
// requires a status ('won' | 'lost' | 'cancelled').
pipeline.put('/deals/:id/stage', async (c) => {
  const user = getCurrentUser(c);
  const id = c.req.param('id');
  const { stage, status, contract_value } = await c.req.json().catch(() => ({} as Record<string, unknown>));

  if (!stage || !(STAGES as readonly string[]).includes(stage as string)) {
    return c.json({ success: false, error: `stage must be one of ${STAGES.join(',')}` }, 400);
  }

  const existing = (await c.env.DB.prepare('SELECT created_by, stage, status FROM pipeline_deals WHERE id = ?').bind(id).first()) as { created_by: string; stage: string; status: string } | null;
  if (!existing) return c.json({ success: false, error: 'Deal not found' }, 404);
  if (existing.created_by !== user.id && user.role !== 'admin') {
    return c.json({ success: false, error: 'Not authorized' }, 403);
  }

  let nextStatus: DealStatus = (existing.status as DealStatus) || 'active';
  if (stage === 'closed') {
    if (!status || !['won', 'lost', 'cancelled'].includes(status as string)) {
      return c.json({ success: false, error: 'closing a deal requires status=won|lost|cancelled' }, 400);
    }
    nextStatus = status as DealStatus;
  }

  const now = new Date().toISOString();
  const awardDate = stage === 'closed' && nextStatus === 'won' ? now : null;
  await c.env.DB.prepare(`
    UPDATE pipeline_deals SET stage = ?, status = ?, award_date = COALESCE(?, award_date), contract_value = COALESCE(?, contract_value), updated_at = ? WHERE id = ?
  `).bind(stage, nextStatus, awardDate, typeof contract_value === 'number' ? contract_value : null, now, id).run();

  await fireCascade({
    event: nextStatus === 'won' ? 'pipeline.won' : nextStatus === 'lost' ? 'pipeline.lost' : 'pipeline.stage_changed',
    actor_id: user.id,
    entity_type: 'pipeline_deals',
    entity_id: id,
    data: { stage, status: nextStatus, contract_value: typeof contract_value === 'number' ? contract_value : undefined },
    env: c.env,
  });

  return c.json({ success: true, data: { id, stage, status: nextStatus } });
});

// DELETE /pipeline/deals/:id — owner or admin only.
pipeline.delete('/deals/:id', async (c) => {
  const user = getCurrentUser(c);
  const id = c.req.param('id');
  const existing = (await c.env.DB.prepare('SELECT created_by FROM pipeline_deals WHERE id = ?').bind(id).first()) as { created_by: string } | null;
  if (!existing) return c.json({ success: false, error: 'Deal not found' }, 404);
  if (existing.created_by !== user.id && user.role !== 'admin') {
    return c.json({ success: false, error: 'Not authorized' }, 403);
  }
  await c.env.DB.prepare('DELETE FROM pipeline_deals WHERE id = ?').bind(id).run();
  return c.json({ success: true });
});

export default pipeline;
