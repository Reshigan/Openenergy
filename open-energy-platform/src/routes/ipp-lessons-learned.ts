// Wave 135 - IPP Lessons Learned Register
// PMBOK 7 / ISO 21502:2022 §12.6 dissemination tracking.
// INVERTED SLA: critical_impact 720h (30d) MOST time; low_impact 168h (7d) LEAST time.
// SIGNATURE: disseminate_finding EVERY tier when lesson_type='safety' OR prevents_fatality=1.

import { Hono } from 'hono';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { HonoEnv } from '../utils/types';
import { fireCascade } from '../utils/cascade';
import {
  nextStatus,
  isHardTerminal,
  SLA_HOURS,
  slaDeadlineFor,
  slaHoursRemaining,
  crossesIntoRegulator,
  slaBreachCrossesIntoRegulator,
  eventTypeFor,
  statusTsCol,
  type LessonStatus,
  type LessonAction,
  type ImpactTier,
} from '../utils/ipp-lessons-learned-spec';
import { badEnum } from '../utils/validation';

const READ_ROLES = new Set([
  'admin', 'trader', 'ipp_developer', 'offtaker', 'grid_operator',
  'regulator', 'lender', 'support', 'carbon_fund',
]);
const WRITE_ROLES = new Set(['admin', 'ipp_developer']);

interface LessonRow {
  id: string;
  project_id: string;
  project_name: string | null;
  lesson_title: string;
  chain_status: LessonStatus;
  lesson_type: string | null;
  lesson_category: string | null;
  lesson_phase: string | null;
  impact_tier: ImpactTier | null;
  rca_method: string | null;
  description: string;
  root_cause: string | null;
  impact_summary: string | null;
  recommendation: string | null;
  review_notes: string | null;
  dissemination_audience: string | null;
  application_project_ref: string | null;
  application_notes: string | null;
  cost_impact_zar: number | null;
  schedule_impact_days: number | null;
  issue_ref: string | null;
  risk_ref: string | null;
  rfi_ref: string | null;
  hse_incident_ref: string | null;
  change_order_ref: string | null;
  floor_safety_critical: number;
  floor_regulatory_change: number;
  floor_contractual_impact: number;
  floor_design_change: number;
  floor_portfolio_impact: number;
  prevents_fatality: number;
  sla_target_hours: number | null;
  sla_deadline_at: string | null;
  sla_breached: number;
  sla_breach_count: number;
  is_reportable: number;
  regulator_ref: string | null;
  captured_at: string | null;
  categorized_at: string | null;
  root_cause_analyzed_at: string | null;
  impact_assessed_at: string | null;
  recommendation_drafted_at: string | null;
  peer_reviewed_at: string | null;
  approved_at: string | null;
  disseminated_at: string | null;
  applied_at: string | null;
  archived_at: string | null;
  rejected_at: string | null;
  deferred_at: string | null;
  duplicate_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

function decorateLiveFields(row: LessonRow, now: Date) {
  const stateAt = (row as any)[statusTsCol(row.chain_status)] as string | null;
  const timeInState = stateAt
    ? Math.round((now.getTime() - new Date(stateAt).getTime()) / 3600000)
    : null;
  return {
    ...row,
    time_in_state_hours_live: timeInState,
    sla_remaining_hours_live: slaHoursRemaining(row.sla_deadline_at, now),
    is_signature_lesson_live: !!(row.lesson_type === 'safety' || row.prevents_fatality),
  };
}

const app = new Hono<HonoEnv>();
app.use('*', authMiddleware);

// ─── GET /api/ipp-lessons-learned ────────────────────────────────────────────
app.get('/', async (c) => {
  const user = getCurrentUser(c);
  if (!READ_ROLES.has(user.role)) return c.json({ error: 'Forbidden' }, 403);

  const rows = await c.env.DB.prepare(
    'SELECT * FROM oe_ipp_lessons_learned ORDER BY created_at DESC'
  ).all<LessonRow>();

  const now = new Date();
  const data = (rows.results ?? []).map(r => decorateLiveFields(r, now));

  const dashboard = {
    lessons: {
      total_count:       data.length,
      safety_count:      data.filter(r => r.lesson_type === 'safety').length,
      applied_count:     data.filter(r => r.chain_status === 'applied').length,
      archived_count:    data.filter(r => r.chain_status === 'archived').length,
      sla_breached_count:data.filter(r => r.sla_breached).length,
      critical_count:    data.filter(r => r.impact_tier === 'critical_impact').length,
      positive_count:    data.filter(r => r.lesson_type === 'positive').length,
    },
  };

  return c.json({ data, dashboard });
});

// ─── GET /api/ipp-lessons-learned/:id ────────────────────────────────────────
app.get('/:id', async (c) => {
  const user = getCurrentUser(c);
  if (!READ_ROLES.has(user.role)) return c.json({ error: 'Forbidden' }, 403);

  const row = await c.env.DB.prepare(
    'SELECT * FROM oe_ipp_lessons_learned WHERE id = ?'
  ).bind(c.req.param('id')).first<LessonRow>();

  if (!row) return c.json({ error: 'Not found' }, 404);

  const events = await c.env.DB.prepare(
    'SELECT * FROM oe_ipp_lesson_events WHERE lesson_id = ? ORDER BY created_at ASC'
  ).bind(row.id).all();

  return c.json({
    data: {
      lesson: decorateLiveFields(row, new Date()),
      events: events.results ?? [],
    },
  });
});

// ─── POST /api/ipp-lessons-learned ───────────────────────────────────────────
app.post('/', async (c) => {
  const user = getCurrentUser(c);
  if (!WRITE_ROLES.has(user.role)) return c.json({ error: 'Forbidden' }, 403);

  const body = (await c.req.json().catch(() => ({}))) as {
    project_id?: string;
    project_name?: string;
    lesson_title?: string;
    lesson_type?: string;
    lesson_category?: string;
    lesson_phase?: string;
    impact_tier?: ImpactTier;
    rca_method?: string;
    description?: string;
    root_cause?: string;
    impact_summary?: string;
    recommendation?: string;
    cost_impact_zar?: number;
    schedule_impact_days?: number;
    issue_ref?: string;
    risk_ref?: string;
    rfi_ref?: string;
    hse_incident_ref?: string;
    change_order_ref?: string;
    floor_safety_critical?: number;
    floor_regulatory_change?: number;
    floor_contractual_impact?: number;
    floor_design_change?: number;
    floor_portfolio_impact?: number;
    prevents_fatality?: number;
    [k: string]: unknown;
  };

  if (!body.lesson_title || !body.project_id || !body.lesson_type || !body.impact_tier) {
    return c.json({ error: 'lesson_title, project_id, lesson_type, and impact_tier required' }, 400);
  }
  const impactTierErr = badEnum('impact_tier', body.impact_tier, ['critical_impact', 'high_impact', 'medium_impact', 'low_impact']);
  if (impactTierErr) return c.json({ error: impactTierErr }, 400);

  const tier = body.impact_tier as ImpactTier;
  const now = new Date();
  const slaHrs = SLA_HOURS[tier];
  const slaDeadline = slaDeadlineFor(tier, now);

  const countRow = await c.env.DB.prepare(
    'SELECT COUNT(*) as cnt FROM oe_ipp_lessons_learned'
  ).first<{ cnt: number }>();
  const cnt = countRow?.cnt ?? 0;
  const id = `lrn-${String(cnt + 1).padStart(3, '0')}`;

  await c.env.DB.prepare(`
    INSERT INTO oe_ipp_lessons_learned (
      id, project_id, project_name, lesson_title, chain_status,
      lesson_type, lesson_category, lesson_phase, impact_tier, rca_method,
      description, root_cause, impact_summary, recommendation,
      cost_impact_zar, schedule_impact_days,
      issue_ref, risk_ref, rfi_ref, hse_incident_ref, change_order_ref,
      floor_safety_critical, floor_regulatory_change, floor_contractual_impact,
      floor_design_change, floor_portfolio_impact,
      prevents_fatality, sla_target_hours, sla_deadline_at,
      sla_breached, sla_breach_count, is_reportable,
      captured_at, created_by, created_at, updated_at
    ) VALUES (
      ?, ?, ?, ?, 'captured',
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?, ?,
      0, 0, 0,
      ?, ?, ?, ?
    )
  `).bind(
    id, body.project_id, body.project_name ?? null, body.lesson_title,
    body.lesson_type, body.lesson_category ?? null, body.lesson_phase ?? null, tier, body.rca_method ?? 'none',
    body.description ?? '', body.root_cause ?? null, body.impact_summary ?? null, body.recommendation ?? null,
    body.cost_impact_zar ?? null, body.schedule_impact_days ?? null,
    body.issue_ref ?? null, body.risk_ref ?? null, body.rfi_ref ?? null, body.hse_incident_ref ?? null, body.change_order_ref ?? null,
    Number(body.floor_safety_critical ?? 0), Number(body.floor_regulatory_change ?? 0),
    Number(body.floor_contractual_impact ?? 0), Number(body.floor_design_change ?? 0),
    Number(body.floor_portfolio_impact ?? 0),
    Number(body.prevents_fatality ?? 0), slaHrs, slaDeadline.toISOString(),
    now.toISOString(), user.id, now.toISOString(), now.toISOString(),
  ).run();

  const created = await c.env.DB.prepare(
    'SELECT * FROM oe_ipp_lessons_learned WHERE id = ?'
  ).bind(id).first<LessonRow>();

  await fireCascade({
    event: 'ipp_lessons_learned.categorize_lesson',
    actor_id: user.id,
    entity_type: 'ipp_lessons_learned',
    entity_id: id,
    data: {
      action: 'create',
      lesson_type: body.lesson_type,
      impact_tier: tier,
      lesson_category: body.lesson_category,
    },
    env: c.env,
  });

  return c.json({ data: decorateLiveFields(created!, new Date()) }, 201);
});

// ─── POST /api/ipp-lessons-learned/:id/:action ────────────────────────────────
app.post('/:id/:action', async (c) => {
  const user = getCurrentUser(c);
  if (!WRITE_ROLES.has(user.role)) return c.json({ error: 'Forbidden' }, 403);

  const { id, action } = c.req.param();
  const body = (await c.req.json().catch(() => ({}))) as {
    notes?: string;
    reason_code?: string;
    dissemination_audience?: string;
    application_notes?: string;
    application_project_ref?: string;
    review_notes?: string;
    [k: string]: unknown;
  };

  const row = await c.env.DB.prepare(
    'SELECT * FROM oe_ipp_lessons_learned WHERE id = ?'
  ).bind(id).first<LessonRow>();

  if (!row) return c.json({ error: 'Not found' }, 404);
  if (isHardTerminal(row.chain_status)) {
    return c.json({ error: `Lesson is in terminal state: ${row.chain_status}` }, 409);
  }

  const lessonAction = action as LessonAction;
  const toStatus = nextStatus(row.chain_status, lessonAction);
  if (toStatus === null) {
    return c.json({ error: `Action '${action}' not allowed from '${row.chain_status}'` }, 422);
  }

  const now = new Date();

  const regulatorCrossed = crossesIntoRegulator(lessonAction, {
    lesson_type: row.lesson_type ?? undefined,
    prevents_fatality: row.prevents_fatality,
  });

  const updates: string[] = ['chain_status = ?', 'updated_at = ?'];
  const vals: unknown[] = [toStatus, now.toISOString()];

  // Record state timestamp
  const tsCol = statusTsCol(toStatus);
  updates.push(`${tsCol} = ?`);
  vals.push(now.toISOString());

  if (regulatorCrossed) {
    updates.push('is_reportable = 1');
    if (!row.regulator_ref) {
      const ref = `W135-LRN-${row.lesson_type?.toUpperCase() ?? 'GEN'}-${now.getFullYear()}-${id.replace('lrn-', '').toUpperCase()}`;
      updates.push('regulator_ref = ?');
      vals.push(ref);
    }
  }

  if (body.dissemination_audience) {
    updates.push('dissemination_audience = ?');
    vals.push(body.dissemination_audience);
  }
  if (body.application_notes) {
    updates.push('application_notes = ?');
    vals.push(body.application_notes);
  }
  if (body.application_project_ref) {
    updates.push('application_project_ref = ?');
    vals.push(body.application_project_ref);
  }
  if (body.review_notes) {
    updates.push('review_notes = ?');
    vals.push(body.review_notes);
  }

  vals.push(id);
  await c.env.DB.prepare(
    `UPDATE oe_ipp_lessons_learned SET ${updates.join(', ')} WHERE id = ?`
  ).bind(...vals).run();

  // Write event row
  const eventId = `levt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const eventType = eventTypeFor(lessonAction);
  await c.env.DB.prepare(`
    INSERT INTO oe_ipp_lesson_events
      (id, lesson_id, action, from_status, to_status, actor_id, actor_role, notes, regulator_crossed, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    eventId, id, lessonAction,
    row.chain_status, toStatus,
    user.id, user.role,
    body.notes ?? body.reason_code ?? null,
    regulatorCrossed ? 1 : 0,
    now.toISOString(),
  ).run();

  await fireCascade({
    event: eventType as any,
    actor_id: user.id,
    entity_type: 'ipp_lessons_learned',
    entity_id: id,
    data: {
      action: lessonAction,
      from_status: row.chain_status,
      to_status: toStatus,
      impact_tier: row.impact_tier,
      lesson_type: row.lesson_type,
      lesson_category: row.lesson_category,
      prevents_fatality: row.prevents_fatality,
      regulator_crossed: regulatorCrossed,
      is_reportable: regulatorCrossed,
      ...(body.reason_code ? { reason_code: body.reason_code } : {}),
    },
    env: c.env,
  });

  const updated = await c.env.DB.prepare(
    'SELECT * FROM oe_ipp_lessons_learned WHERE id = ?'
  ).bind(id).first<LessonRow>();

  return c.json({ data: decorateLiveFields(updated!, new Date()) });
});

export default app;

// ─── Cron: SLA sweep (runs in */15 shared slot) ───────────────────────────────
export async function ippLessonsLearnedSlaSweep(env: HonoEnv['Bindings']): Promise<{ swept: number; crossed: number }> {
  const now = new Date();
  const openRows = await env.DB.prepare(`
    SELECT * FROM oe_ipp_lessons_learned
    WHERE sla_breached = 0
      AND sla_deadline_at IS NOT NULL
      AND chain_status NOT IN ('archived', 'rejected', 'duplicate')
  `).all<LessonRow>();

  let swept = 0;
  let crossed = 0;

  for (const row of (openRows.results ?? [])) {
    if (!row.sla_deadline_at) continue;
    if (new Date(row.sla_deadline_at) <= now) {
      swept++;
      const tier = (row.impact_tier ?? 'low_impact') as ImpactTier;
      const reg = slaBreachCrossesIntoRegulator(tier, {
        floor_safety_critical: row.floor_safety_critical,
        lesson_type: row.lesson_type ?? undefined,
      });
      if (reg) crossed++;

      await env.DB.prepare(`
        UPDATE oe_ipp_lessons_learned
        SET sla_breached = 1,
            sla_breach_count = sla_breach_count + 1,
            ${reg ? 'is_reportable = 1,' : ''}
            updated_at = ?
        WHERE id = ?
      `).bind(now.toISOString(), row.id).run();

      await fireCascade({
        event: 'ipp_lessons_learned.defer_lesson' as any,
        actor_id: 'cron',
        entity_type: 'ipp_lessons_learned',
        entity_id: row.id,
        data: {
          action: 'sla_breached',
          impact_tier: row.impact_tier,
          lesson_type: row.lesson_type,
          floor_safety_critical: row.floor_safety_critical,
          regulator_crossed: reg,
        },
        env,
      });
    }
  }

  return { swept, crossed };
}
