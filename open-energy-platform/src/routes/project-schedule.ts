// ═══════════════════════════════════════════════════════════════════════════
// Project Schedule Routes — P6-grade WBS + CPM + Resources + Leveling + Baselines
//
// Mounted at /api/projects/:projectId/schedule (see src/index.ts).
//
// Responsibilities:
//   • CRUD for activities (WBS rows), dependencies, calendars + exceptions,
//     resources, assignments, baselines.
//   • Compute endpoints: recompute (forward+backward CPM pass), critical path,
//     look-ahead window, over-allocations report, resource leveling.
//   • Cascade events for every mutation (project.schedule.*).
//   • KV-cached CPM snapshot, invalidated on every write.
//   • Optimistic concurrency via `project_schedule_state.version`.
// ═══════════════════════════════════════════════════════════════════════════

import { Hono } from 'hono';
import { HonoEnv } from '../utils/types';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { fireCascade } from '../utils/cascade';
import { invalidate, cached, shouldBypass } from '../utils/kv-cache';
import {
  Calendar, DEFAULT_CALENDAR,
} from '../utils/calendars';
import { runCpm, CpmActivity, CpmDep, LinkType, ConstraintType, ActivityType } from '../utils/cpm';
import { runLeveling, LevelingActivity, LevelingAssignment, LevelingResource } from '../utils/leveling';

const projectSchedule = new Hono<HonoEnv>();
projectSchedule.use('*', authMiddleware);

// ── Helpers ──────────────────────────────────────────────────────────────

const now = () => new Date().toISOString();
const newId = () => crypto.randomUUID();
const cacheKey = (projectId: string) => `schedule:cpm:${projectId}`;

async function ensureProjectAccess(c: any, projectId: string): Promise<{ ok: boolean }> {
  const user = getCurrentUser(c);
  const row = await c.env.DB.prepare(`
    SELECT id FROM ipp_projects
    WHERE id = ? AND (developer_id = ? OR ? IN ('admin','support','regulator','lender','grid_operator'))
  `).bind(projectId, user.id, user.role).first();
  return { ok: !!row };
}

async function bumpVersion(env: any, projectId: string): Promise<number> {
  const row = await env.DB.prepare(`
    SELECT version FROM project_schedule_state WHERE project_id = ?
  `).bind(projectId).first() as { version: number } | null;
  if (row) {
    const v = (row.version || 0) + 1;
    await env.DB.prepare(`
      UPDATE project_schedule_state SET version = ? WHERE project_id = ?
    `).bind(v, projectId).run();
    return v;
  }
  await env.DB.prepare(`
    INSERT INTO project_schedule_state (project_id, version) VALUES (?, 1)
  `).bind(projectId).run();
  return 1;
}

async function loadCalendars(env: any, projectId: string): Promise<{
  cals: Record<string, Calendar>;
  defaultId: string;
}> {
  const cals = await env.DB.prepare(`
    SELECT id, workdays, is_default FROM project_calendars WHERE project_id = ?
  `).bind(projectId).all();
  const exceptions = await env.DB.prepare(`
    SELECT calendar_id, exception_date, hours FROM calendar_exceptions
    WHERE calendar_id IN (SELECT id FROM project_calendars WHERE project_id = ?)
  `).bind(projectId).all();

  const out: Record<string, Calendar> = {};
  let defaultId = 'std';
  const calRows = (cals.results || []) as any[];
  if (calRows.length === 0) {
    out['std'] = DEFAULT_CALENDAR;
  } else {
    for (const r of calRows) {
      const ex: Record<string, number> = {};
      for (const e of ((exceptions.results || []) as any[])) {
        if (e.calendar_id === r.id) ex[e.exception_date] = Number(e.hours);
      }
      out[r.id] = {
        id: r.id,
        workdays: JSON.parse(r.workdays),
        exceptions: ex,
      };
      if (r.is_default) defaultId = r.id;
    }
    if (!out[defaultId]) defaultId = calRows[0].id;
  }
  return { cals: out, defaultId };
}

async function loadActivities(env: any, projectId: string): Promise<any[]> {
  const r = await env.DB.prepare(`
    SELECT * FROM project_activities WHERE project_id = ? ORDER BY sort_order ASC
  `).bind(projectId).all();
  return (r.results || []) as any[];
}

async function loadDeps(env: any, projectId: string): Promise<any[]> {
  const r = await env.DB.prepare(`
    SELECT * FROM activity_dependencies WHERE project_id = ?
  `).bind(projectId).all();
  return (r.results || []) as any[];
}

// ── Activities CRUD ─────────────────────────────────────────────────────

projectSchedule.get('/:projectId/activities', async (c) => {
  const projectId = c.req.param('projectId');
  const access = await ensureProjectAccess(c, projectId);
  if (!access.ok) return c.json({ success: false, error: 'Project not found' }, 404);
  const rows = await loadActivities(c.env, projectId);
  return c.json({ success: true, data: rows });
});

projectSchedule.post('/:projectId/activities', async (c) => {
  const projectId = c.req.param('projectId');
  const access = await ensureProjectAccess(c, projectId);
  if (!access.ok) return c.json({ success: false, error: 'Project not found' }, 404);
  const user = getCurrentUser(c);
  const body = await c.req.json<any>();
  if (!body?.wbs_code || !body?.name || !body?.type) {
    return c.json({ success: false, error: 'wbs_code, name, type required' }, 400);
  }
  if (!['summary', 'task', 'milestone'].includes(body.type)) {
    return c.json({ success: false, error: 'invalid type' }, 400);
  }
  const id = body.id || newId();
  const t = now();
  await c.env.DB.prepare(`
    INSERT INTO project_activities (
      id, project_id, parent_id, wbs_code, sort_order, name, type,
      duration_days, planned_start, planned_finish,
      constraint_type, constraint_date, calendar_id, notes,
      version, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
  `).bind(
    id, projectId, body.parent_id ?? null, body.wbs_code, body.sort_order ?? 0,
    body.name, body.type,
    body.type === 'milestone' ? 0 : Number(body.duration_days || 0),
    body.planned_start ?? null, body.planned_finish ?? null,
    body.constraint_type ?? null, body.constraint_date ?? null,
    body.calendar_id ?? null, body.notes ?? null, t, t,
  ).run();

  await bumpVersion(c.env, projectId);
  await invalidate(c.env, cacheKey(projectId));
  await fireCascade({
    event: 'project.schedule.activity.created',
    actor_id: user.id, entity_type: 'project_activity', entity_id: id,
    data: { project_id: projectId, wbs_code: body.wbs_code, type: body.type },
    env: c.env,
  });
  return c.json({ success: true, data: { id } });
});

projectSchedule.put('/:projectId/activities/:id', async (c) => {
  const projectId = c.req.param('projectId');
  const id = c.req.param('id');
  const access = await ensureProjectAccess(c, projectId);
  if (!access.ok) return c.json({ success: false, error: 'Project not found' }, 404);
  const user = getCurrentUser(c);
  const body = await c.req.json<any>();

  const existing = await c.env.DB.prepare(`
    SELECT id, version, type FROM project_activities WHERE id = ? AND project_id = ?
  `).bind(id, projectId).first<{ id: string; version: number; type: string }>();
  if (!existing) return c.json({ success: false, error: 'Activity not found' }, 404);

  // Optimistic concurrency: if `version` provided, must match.
  if (body.version !== undefined && Number(body.version) !== Number(existing.version)) {
    return c.json({ success: false, error: 'version conflict', current_version: existing.version }, 409);
  }

  const fields: string[] = [];
  const params: any[] = [];
  const allowed = [
    'parent_id', 'wbs_code', 'sort_order', 'name', 'type', 'duration_days',
    'planned_start', 'planned_finish', 'constraint_type', 'constraint_date',
    'calendar_id', 'notes', 'percent_complete', 'actual_start', 'actual_finish',
  ];
  for (const f of allowed) {
    if (body[f] !== undefined) {
      fields.push(`${f} = ?`);
      params.push(body[f]);
    }
  }
  if (!fields.length) return c.json({ success: false, error: 'no fields' }, 400);
  fields.push('updated_at = ?'); params.push(now());
  fields.push('version = version + 1');
  params.push(id, projectId);

  await c.env.DB.prepare(`
    UPDATE project_activities SET ${fields.join(', ')} WHERE id = ? AND project_id = ?
  `).bind(...params).run();

  await bumpVersion(c.env, projectId);
  await invalidate(c.env, cacheKey(projectId));
  await fireCascade({
    event: 'project.schedule.activity.updated',
    actor_id: user.id, entity_type: 'project_activity', entity_id: id,
    data: { project_id: projectId, fields: Object.keys(body) },
    env: c.env,
  });
  return c.json({ success: true });
});

projectSchedule.delete('/:projectId/activities/:id', async (c) => {
  const projectId = c.req.param('projectId');
  const id = c.req.param('id');
  const access = await ensureProjectAccess(c, projectId);
  if (!access.ok) return c.json({ success: false, error: 'Project not found' }, 404);
  const user = getCurrentUser(c);

  // Cascade delete: deps mentioning this activity + assignments + the activity row.
  await c.env.DB.batch([
    c.env.DB.prepare(`DELETE FROM activity_dependencies WHERE predecessor_id = ? OR successor_id = ?`).bind(id, id),
    c.env.DB.prepare(`DELETE FROM resource_assignments WHERE activity_id = ?`).bind(id),
    c.env.DB.prepare(`DELETE FROM project_activities WHERE id = ? AND project_id = ?`).bind(id, projectId),
  ]);

  await bumpVersion(c.env, projectId);
  await invalidate(c.env, cacheKey(projectId));
  await fireCascade({
    event: 'project.schedule.activity.deleted',
    actor_id: user.id, entity_type: 'project_activity', entity_id: id,
    data: { project_id: projectId },
    env: c.env,
  });
  return c.json({ success: true });
});

// ── Dependencies CRUD ───────────────────────────────────────────────────

projectSchedule.get('/:projectId/dependencies', async (c) => {
  const projectId = c.req.param('projectId');
  const access = await ensureProjectAccess(c, projectId);
  if (!access.ok) return c.json({ success: false, error: 'Project not found' }, 404);
  const rows = await loadDeps(c.env, projectId);
  return c.json({ success: true, data: rows });
});

projectSchedule.post('/:projectId/dependencies', async (c) => {
  const projectId = c.req.param('projectId');
  const access = await ensureProjectAccess(c, projectId);
  if (!access.ok) return c.json({ success: false, error: 'Project not found' }, 404);
  const user = getCurrentUser(c);
  const body = await c.req.json<any>();
  if (!body?.predecessor_id || !body?.successor_id || !body?.link_type) {
    return c.json({ success: false, error: 'predecessor_id, successor_id, link_type required' }, 400);
  }
  if (!['FS', 'SS', 'FF', 'SF'].includes(body.link_type)) {
    return c.json({ success: false, error: 'invalid link_type' }, 400);
  }
  if (body.predecessor_id === body.successor_id) {
    return c.json({ success: false, error: 'self-loop' }, 400);
  }

  // Cycle check: simulate including this new edge against current graph.
  const activities = await loadActivities(c.env, projectId);
  const deps = await loadDeps(c.env, projectId);
  const tentativeDeps: CpmDep[] = [
    ...deps.map(d => ({ predecessor_id: d.predecessor_id, successor_id: d.successor_id, link_type: d.link_type, lag_days: d.lag_days })),
    { predecessor_id: body.predecessor_id, successor_id: body.successor_id, link_type: body.link_type, lag_days: Number(body.lag_days || 0) },
  ];
  const cpmActs: CpmActivity[] = activities
    .filter(a => a.type !== 'summary')
    .map(a => ({
      id: a.id, parent_id: a.parent_id, type: a.type, duration_days: a.duration_days,
      calendar_id: a.calendar_id, constraint_type: a.constraint_type, constraint_date: a.constraint_date,
    }));
  const { cals, defaultId } = await loadCalendars(c.env, projectId);
  const trial = runCpm(cpmActs, tentativeDeps, cals, defaultId, '2026-01-01');
  if (trial.cycle && trial.cycle.length) {
    return c.json({ success: false, error: 'would create cycle', cycle: trial.cycle }, 400);
  }

  const id = newId();
  await c.env.DB.prepare(`
    INSERT INTO activity_dependencies (id, project_id, predecessor_id, successor_id, link_type, lag_days, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(id, projectId, body.predecessor_id, body.successor_id, body.link_type, Number(body.lag_days || 0), now()).run();

  await bumpVersion(c.env, projectId);
  await invalidate(c.env, cacheKey(projectId));
  await fireCascade({
    event: 'project.schedule.dependency.created',
    actor_id: user.id, entity_type: 'activity_dependency', entity_id: id,
    data: { project_id: projectId, link_type: body.link_type },
    env: c.env,
  });
  return c.json({ success: true, data: { id } });
});

projectSchedule.delete('/:projectId/dependencies/:id', async (c) => {
  const projectId = c.req.param('projectId');
  const id = c.req.param('id');
  const access = await ensureProjectAccess(c, projectId);
  if (!access.ok) return c.json({ success: false, error: 'Project not found' }, 404);
  const user = getCurrentUser(c);
  await c.env.DB.prepare(`DELETE FROM activity_dependencies WHERE id = ? AND project_id = ?`).bind(id, projectId).run();
  await bumpVersion(c.env, projectId);
  await invalidate(c.env, cacheKey(projectId));
  await fireCascade({
    event: 'project.schedule.dependency.deleted',
    actor_id: user.id, entity_type: 'activity_dependency', entity_id: id,
    data: { project_id: projectId }, env: c.env,
  });
  return c.json({ success: true });
});

// ── Calendars + exceptions ──────────────────────────────────────────────

projectSchedule.get('/:projectId/calendars', async (c) => {
  const projectId = c.req.param('projectId');
  const access = await ensureProjectAccess(c, projectId);
  if (!access.ok) return c.json({ success: false, error: 'Project not found' }, 404);
  const cals = await c.env.DB.prepare(`SELECT * FROM project_calendars WHERE project_id = ?`).bind(projectId).all();
  const ex = await c.env.DB.prepare(`
    SELECT * FROM calendar_exceptions WHERE calendar_id IN (SELECT id FROM project_calendars WHERE project_id = ?)
  `).bind(projectId).all();
  return c.json({ success: true, data: { calendars: cals.results || [], exceptions: ex.results || [] } });
});

projectSchedule.post('/:projectId/calendars', async (c) => {
  const projectId = c.req.param('projectId');
  const access = await ensureProjectAccess(c, projectId);
  if (!access.ok) return c.json({ success: false, error: 'Project not found' }, 404);
  const user = getCurrentUser(c);
  const body = await c.req.json<any>();
  if (!body?.name || !body?.workdays) {
    return c.json({ success: false, error: 'name, workdays required' }, 400);
  }
  const id = body.id || newId();
  await c.env.DB.prepare(`
    INSERT INTO project_calendars (id, project_id, name, is_default, workdays, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(id, projectId, body.name, body.is_default ? 1 : 0, JSON.stringify(body.workdays), now()).run();

  if (body.is_default) {
    await c.env.DB.prepare(`UPDATE project_calendars SET is_default = 0 WHERE project_id = ? AND id != ?`).bind(projectId, id).run();
  }
  await invalidate(c.env, cacheKey(projectId));
  await fireCascade({
    event: 'project.schedule.calendar.updated', actor_id: user.id,
    entity_type: 'project_calendar', entity_id: id,
    data: { project_id: projectId }, env: c.env,
  });
  return c.json({ success: true, data: { id } });
});

projectSchedule.post('/:projectId/calendars/:calendarId/exceptions', async (c) => {
  const projectId = c.req.param('projectId');
  const calendarId = c.req.param('calendarId');
  const access = await ensureProjectAccess(c, projectId);
  if (!access.ok) return c.json({ success: false, error: 'Project not found' }, 404);
  const body = await c.req.json<any>();
  if (!body?.exception_date || body?.hours === undefined) {
    return c.json({ success: false, error: 'exception_date, hours required' }, 400);
  }
  const id = newId();
  await c.env.DB.prepare(`
    INSERT OR REPLACE INTO calendar_exceptions (id, calendar_id, exception_date, hours, reason)
    VALUES (?, ?, ?, ?, ?)
  `).bind(id, calendarId, body.exception_date, Number(body.hours), body.reason ?? null).run();
  await invalidate(c.env, cacheKey(projectId));
  return c.json({ success: true, data: { id } });
});

// ── Resources + assignments ─────────────────────────────────────────────

projectSchedule.get('/:projectId/resources', async (c) => {
  const projectId = c.req.param('projectId');
  const access = await ensureProjectAccess(c, projectId);
  if (!access.ok) return c.json({ success: false, error: 'Project not found' }, 404);
  const resources = await c.env.DB.prepare(`SELECT * FROM project_resources WHERE project_id = ?`).bind(projectId).all();
  const assigns = await c.env.DB.prepare(`
    SELECT a.*, act.project_id FROM resource_assignments a
    INNER JOIN project_activities act ON act.id = a.activity_id
    WHERE act.project_id = ?
  `).bind(projectId).all();
  return c.json({ success: true, data: { resources: resources.results || [], assignments: assigns.results || [] } });
});

projectSchedule.post('/:projectId/resources', async (c) => {
  const projectId = c.req.param('projectId');
  const access = await ensureProjectAccess(c, projectId);
  if (!access.ok) return c.json({ success: false, error: 'Project not found' }, 404);
  const user = getCurrentUser(c);
  const body = await c.req.json<any>();
  if (!body?.name || !body?.resource_type) {
    return c.json({ success: false, error: 'name, resource_type required' }, 400);
  }
  const id = body.id || newId();
  await c.env.DB.prepare(`
    INSERT INTO project_resources (id, project_id, name, resource_type, unit, max_units, rate_per_unit, calendar_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id, projectId, body.name, body.resource_type, body.unit ?? null,
    Number(body.max_units ?? 1), body.rate_per_unit !== undefined ? Number(body.rate_per_unit) : null,
    body.calendar_id ?? null, now(),
  ).run();
  await invalidate(c.env, cacheKey(projectId));
  await fireCascade({
    event: 'project.schedule.resource.updated', actor_id: user.id,
    entity_type: 'project_resource', entity_id: id,
    data: { project_id: projectId }, env: c.env,
  });
  return c.json({ success: true, data: { id } });
});

projectSchedule.post('/:projectId/assignments', async (c) => {
  const projectId = c.req.param('projectId');
  const access = await ensureProjectAccess(c, projectId);
  if (!access.ok) return c.json({ success: false, error: 'Project not found' }, 404);
  const user = getCurrentUser(c);
  const body = await c.req.json<any>();
  if (!body?.activity_id || !body?.resource_id) {
    return c.json({ success: false, error: 'activity_id, resource_id required' }, 400);
  }
  const id = newId();
  await c.env.DB.prepare(`
    INSERT OR REPLACE INTO resource_assignments (id, activity_id, resource_id, units)
    VALUES (?, ?, ?, ?)
  `).bind(id, body.activity_id, body.resource_id, Number(body.units ?? 1)).run();
  await invalidate(c.env, cacheKey(projectId));
  await fireCascade({
    event: 'project.schedule.assignment.updated', actor_id: user.id,
    entity_type: 'resource_assignment', entity_id: id,
    data: { project_id: projectId, activity_id: body.activity_id }, env: c.env,
  });
  return c.json({ success: true, data: { id } });
});

projectSchedule.delete('/:projectId/assignments/:id', async (c) => {
  const projectId = c.req.param('projectId');
  const id = c.req.param('id');
  const access = await ensureProjectAccess(c, projectId);
  if (!access.ok) return c.json({ success: false, error: 'Project not found' }, 404);
  await c.env.DB.prepare(`DELETE FROM resource_assignments WHERE id = ?`).bind(id).run();
  await invalidate(c.env, cacheKey(projectId));
  return c.json({ success: true });
});

// ── Recompute (forward+backward CPM pass) ───────────────────────────────

async function computeAndStore(env: any, projectId: string): Promise<any> {
  const activities = await loadActivities(env, projectId);
  const deps = await loadDeps(env, projectId);
  const { cals, defaultId } = await loadCalendars(env, projectId);
  const projectStartRow = await env.DB.prepare(`SELECT status_date FROM project_schedule_state WHERE project_id = ?`).bind(projectId).first() as { status_date: string } | null;
  const projectStart = projectStartRow?.status_date || activities.reduce((m, a) => {
    const ps = a.planned_start;
    if (!ps) return m;
    return !m || ps < m ? ps : m;
  }, '' as string) || new Date().toISOString().slice(0, 10);

  const cpmActs: CpmActivity[] = activities.map(a => ({
    id: a.id, parent_id: a.parent_id, type: a.type as ActivityType,
    duration_days: a.duration_days,
    calendar_id: a.calendar_id,
    constraint_type: a.constraint_type as ConstraintType | null,
    constraint_date: a.constraint_date,
  }));
  const cpmDeps: CpmDep[] = deps.map(d => ({
    predecessor_id: d.predecessor_id, successor_id: d.successor_id,
    link_type: d.link_type as LinkType, lag_days: d.lag_days,
  }));

  const run = runCpm(cpmActs, cpmDeps, cals, defaultId, projectStart);

  if (run.cycle) {
    await env.DB.prepare(`
      INSERT INTO project_schedule_state (project_id, has_cycles, last_computed_at) VALUES (?, 1, ?)
      ON CONFLICT(project_id) DO UPDATE SET has_cycles = 1, last_computed_at = excluded.last_computed_at
    `).bind(projectId, now()).run();
    return { cycle: run.cycle };
  }

  // Persist per-activity ES/EF/LS/LF/floats/is_critical.
  const stmts = [];
  for (const id in run.results) {
    const r = run.results[id];
    stmts.push(env.DB.prepare(`
      UPDATE project_activities
      SET early_start = ?, early_finish = ?, late_start = ?, late_finish = ?,
          total_float = ?, free_float = ?, is_critical = ?,
          planned_start = COALESCE(planned_start, ?),
          planned_finish = COALESCE(planned_finish, ?),
          updated_at = ?
      WHERE id = ?
    `).bind(
      r.early_start, r.early_finish, r.late_start, r.late_finish,
      r.total_float, r.free_float, r.is_critical ? 1 : 0,
      r.early_start, r.early_finish, now(), id,
    ));
  }
  if (stmts.length) await env.DB.batch(stmts);

  await env.DB.prepare(`
    INSERT INTO project_schedule_state (project_id, version, status_date, last_computed_at, total_duration_days, start_date, finish_date, has_cycles)
    VALUES (?, 1, ?, ?, ?, ?, ?, 0)
    ON CONFLICT(project_id) DO UPDATE SET
      version = version + 1,
      last_computed_at = excluded.last_computed_at,
      total_duration_days = excluded.total_duration_days,
      start_date = excluded.start_date,
      finish_date = excluded.finish_date,
      has_cycles = 0
  `).bind(projectId, projectStart, now(), run.total_duration_days, run.start_date, run.finish_date).run();

  return run;
}

projectSchedule.post('/:projectId/recompute', async (c) => {
  const projectId = c.req.param('projectId');
  const access = await ensureProjectAccess(c, projectId);
  if (!access.ok) return c.json({ success: false, error: 'Project not found' }, 404);
  const user = getCurrentUser(c);
  const result = await computeAndStore(c.env, projectId);
  await invalidate(c.env, cacheKey(projectId));
  await fireCascade({
    event: 'project.schedule.recomputed', actor_id: user.id,
    entity_type: 'project', entity_id: projectId,
    data: { has_cycles: !!result.cycle, total_duration_days: result.total_duration_days },
    env: c.env,
  });
  if (result.cycle) {
    return c.json({ success: false, error: 'cycle detected', cycle: result.cycle }, 400);
  }
  return c.json({ success: true, data: result });
});

projectSchedule.get('/:projectId/critical-path', async (c) => {
  const projectId = c.req.param('projectId');
  const access = await ensureProjectAccess(c, projectId);
  if (!access.ok) return c.json({ success: false, error: 'Project not found' }, 404);
  const bypass = shouldBypass(c.req.raw);
  const result = await cached(c.env, cacheKey(projectId), 300, async () => {
    return computeAndStore(c.env, projectId);
  }, { bypass });
  return c.json({ success: true, data: result });
});

projectSchedule.get('/:projectId/look-ahead', async (c) => {
  const projectId = c.req.param('projectId');
  const access = await ensureProjectAccess(c, projectId);
  if (!access.ok) return c.json({ success: false, error: 'Project not found' }, 404);
  const days = Math.min(Math.max(parseInt(c.req.query('days') || '21'), 1), 90);
  const today = new Date().toISOString().slice(0, 10);
  const end = new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
  const rows = await c.env.DB.prepare(`
    SELECT id, wbs_code, name, type, planned_start, planned_finish,
           early_start, early_finish, total_float, is_critical,
           percent_complete
    FROM project_activities
    WHERE project_id = ?
      AND COALESCE(planned_start, early_start, '') BETWEEN ? AND ?
    ORDER BY COALESCE(planned_start, early_start), sort_order
  `).bind(projectId, today, end).all();
  return c.json({ success: true, data: rows.results || [] });
});

projectSchedule.get('/:projectId/over-allocations', async (c) => {
  const projectId = c.req.param('projectId');
  const access = await ensureProjectAccess(c, projectId);
  if (!access.ok) return c.json({ success: false, error: 'Project not found' }, 404);

  const activities = await loadActivities(c.env, projectId);
  const deps = await loadDeps(c.env, projectId); void deps;
  const resourceRows = await c.env.DB.prepare(`SELECT * FROM project_resources WHERE project_id = ?`).bind(projectId).all();
  const assignRows = await c.env.DB.prepare(`
    SELECT a.* FROM resource_assignments a
    INNER JOIN project_activities act ON act.id = a.activity_id
    WHERE act.project_id = ?
  `).bind(projectId).all();
  const { cals, defaultId } = await loadCalendars(c.env, projectId);

  const resources = (resourceRows.results || []) as any[];
  const assignments = (assignRows.results || []) as any[];

  // Per-day per-resource usage = sum of (units) over activities active on that day.
  const usage: Record<string, Record<string, number>> = {};
  for (const r of resources) usage[r.id] = {};

  for (const a of activities) {
    if (a.type === 'summary') continue;
    const start = a.planned_start || a.early_start;
    const finish = a.planned_finish || a.early_finish;
    if (!start || !finish) continue;
    const acts = assignments.filter(x => x.activity_id === a.id);
    if (!acts.length) continue;
    // Walk working days from start..finish inclusive.
    let d = start;
    const cal = cals[a.calendar_id || defaultId] || cals[defaultId];
    while (d <= finish) {
      const wd = (new Date(d + 'T12:00:00Z')).getUTCDay();
      const dayKey = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][wd];
      const dayHours = (cal.exceptions[d] !== undefined) ? cal.exceptions[d] : (cal.workdays as any)[dayKey];
      if (dayHours > 0) {
        for (const asg of acts) {
          usage[asg.resource_id] = usage[asg.resource_id] || {};
          usage[asg.resource_id][d] = (usage[asg.resource_id][d] || 0) + Number(asg.units || 1);
        }
      }
      // walk to next day
      const next = new Date(d + 'T12:00:00Z');
      next.setUTCDate(next.getUTCDate() + 1);
      d = next.toISOString().slice(0, 10);
    }
  }

  const overAllocs: Array<{ resource_id: string; resource_name: string; date: string; used: number; max: number }> = [];
  for (const r of resources) {
    for (const date in usage[r.id] || {}) {
      const used = usage[r.id][date];
      if (used > r.max_units + 1e-9) {
        overAllocs.push({ resource_id: r.id, resource_name: r.name, date, used, max: r.max_units });
      }
    }
  }
  overAllocs.sort((a, b) => a.date.localeCompare(b.date));
  return c.json({ success: true, data: overAllocs });
});

// ── Leveling ────────────────────────────────────────────────────────────

projectSchedule.post('/:projectId/level', async (c) => {
  const projectId = c.req.param('projectId');
  const access = await ensureProjectAccess(c, projectId);
  if (!access.ok) return c.json({ success: false, error: 'Project not found' }, 404);
  const user = getCurrentUser(c);
  const body = await c.req.json<any>().catch(() => ({}));
  const mode: 'resource-limited' | 'time-limited' = body?.mode === 'time-limited' ? 'time-limited' : 'resource-limited';

  // Need ES/LF first → recompute CPM if not already current.
  await computeAndStore(c.env, projectId);
  const activities = await loadActivities(c.env, projectId);
  const resourceRows = await c.env.DB.prepare(`SELECT * FROM project_resources WHERE project_id = ?`).bind(projectId).all();
  const assignRows = await c.env.DB.prepare(`
    SELECT a.* FROM resource_assignments a
    INNER JOIN project_activities act ON act.id = a.activity_id
    WHERE act.project_id = ?
  `).bind(projectId).all();
  const { cals, defaultId } = await loadCalendars(c.env, projectId);

  const levelActs: LevelingActivity[] = activities
    .filter(a => a.type !== 'summary')
    .map(a => ({
      id: a.id, duration_days: a.duration_days,
      total_float: Number(a.total_float || 0),
      early_start: a.early_start || a.planned_start || '',
      late_finish: a.late_finish || undefined,
    }))
    .filter(a => !!a.early_start);
  const levelAssigns: LevelingAssignment[] = (assignRows.results || []).map((a: any) => ({
    activity_id: a.activity_id, resource_id: a.resource_id, units: Number(a.units || 1),
  }));
  const levelRes: LevelingResource[] = (resourceRows.results || []).map((r: any) => ({
    id: r.id, max_units: Number(r.max_units || 1), calendar_id: r.calendar_id,
  }));

  const projectStart = activities.reduce((m, a) => {
    const ps = a.early_start || a.planned_start;
    return ps && (!m || ps < m) ? ps : m;
  }, '' as string) || new Date().toISOString().slice(0, 10);

  const result = runLeveling({
    activities: levelActs,
    assignments: levelAssigns,
    resources: levelRes,
    calendars: cals,
    defaultCalendarId: defaultId,
    projectStart,
    mode,
  });

  // Persist planned_start / planned_finish from leveling.
  const stmts = [];
  for (const u of result.updated) {
    stmts.push(c.env.DB.prepare(`
      UPDATE project_activities SET planned_start = ?, planned_finish = ?, updated_at = ? WHERE id = ?
    `).bind(u.planned_start, u.planned_finish, now(), u.id));
  }
  if (stmts.length) await c.env.DB.batch(stmts);

  await bumpVersion(c.env, projectId);
  await invalidate(c.env, cacheKey(projectId));
  await fireCascade({
    event: 'project.schedule.leveled', actor_id: user.id,
    entity_type: 'project', entity_id: projectId,
    data: { project_id: projectId, mode, unresolved: result.unresolved.length },
    env: c.env,
  });
  return c.json({ success: true, data: result });
});

// ── Baselines ───────────────────────────────────────────────────────────

projectSchedule.get('/:projectId/baselines', async (c) => {
  const projectId = c.req.param('projectId');
  const access = await ensureProjectAccess(c, projectId);
  if (!access.ok) return c.json({ success: false, error: 'Project not found' }, 404);
  const rows = await c.env.DB.prepare(`
    SELECT * FROM project_baselines WHERE project_id = ? ORDER BY saved_at DESC
  `).bind(projectId).all();
  return c.json({ success: true, data: rows.results || [] });
});

projectSchedule.post('/:projectId/baselines', async (c) => {
  const projectId = c.req.param('projectId');
  const access = await ensureProjectAccess(c, projectId);
  if (!access.ok) return c.json({ success: false, error: 'Project not found' }, 404);
  const user = getCurrentUser(c);
  const body = await c.req.json<any>();
  if (!body?.name) return c.json({ success: false, error: 'name required' }, 400);

  const baselineId = newId();
  const activities = await loadActivities(c.env, projectId);

  // Idempotent: replace existing baseline with same name.
  await c.env.DB.prepare(`
    DELETE FROM baseline_activities WHERE baseline_id IN (SELECT id FROM project_baselines WHERE project_id = ? AND name = ?)
  `).bind(projectId, body.name).run();
  await c.env.DB.prepare(`
    DELETE FROM project_baselines WHERE project_id = ? AND name = ?
  `).bind(projectId, body.name).run();

  const stmts: any[] = [
    c.env.DB.prepare(`
      INSERT INTO project_baselines (id, project_id, name, is_current, saved_by, saved_at, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(baselineId, projectId, body.name, body.is_current ? 1 : 0, user.id, now(), body.notes ?? null),
  ];
  if (body.is_current) {
    stmts.push(c.env.DB.prepare(`UPDATE project_baselines SET is_current = 0 WHERE project_id = ? AND id != ?`).bind(projectId, baselineId));
  }
  for (const a of activities) {
    stmts.push(c.env.DB.prepare(`
      INSERT INTO baseline_activities (baseline_id, activity_id, planned_start, planned_finish, duration_days)
      VALUES (?, ?, ?, ?, ?)
    `).bind(baselineId, a.id, a.planned_start, a.planned_finish, a.duration_days));
  }
  await c.env.DB.batch(stmts);

  await fireCascade({
    event: 'project.schedule.baseline.saved', actor_id: user.id,
    entity_type: 'project_baseline', entity_id: baselineId,
    data: { project_id: projectId, name: body.name }, env: c.env,
  });
  return c.json({ success: true, data: { id: baselineId } });
});

projectSchedule.get('/:projectId/baselines/:id/variance', async (c) => {
  const projectId = c.req.param('projectId');
  const baselineId = c.req.param('id');
  const access = await ensureProjectAccess(c, projectId);
  if (!access.ok) return c.json({ success: false, error: 'Project not found' }, 404);

  const rows = await c.env.DB.prepare(`
    SELECT a.id, a.wbs_code, a.name, a.type,
           a.planned_start AS current_start, a.planned_finish AS current_finish, a.duration_days AS current_duration,
           b.planned_start AS baseline_start, b.planned_finish AS baseline_finish, b.duration_days AS baseline_duration
    FROM project_activities a
    LEFT JOIN baseline_activities b ON b.activity_id = a.id AND b.baseline_id = ?
    WHERE a.project_id = ?
    ORDER BY a.sort_order
  `).bind(baselineId, projectId).all();
  return c.json({ success: true, data: rows.results || [] });
});

// ── State endpoint ──────────────────────────────────────────────────────

projectSchedule.get('/:projectId/state', async (c) => {
  const projectId = c.req.param('projectId');
  const access = await ensureProjectAccess(c, projectId);
  if (!access.ok) return c.json({ success: false, error: 'Project not found' }, 404);
  const row = await c.env.DB.prepare(`SELECT * FROM project_schedule_state WHERE project_id = ?`).bind(projectId).first();
  return c.json({ success: true, data: row || { project_id: projectId, version: 0 } });
});

export default projectSchedule;
