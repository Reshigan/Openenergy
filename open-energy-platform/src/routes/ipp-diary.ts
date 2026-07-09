// Wave 143 — IPP Daily Construction Diary (Site Diary)
// JBCC 6.2 clause 8.13 + NEC4 clause 25 + CIDB BPG#A1 + OHSA Const.Regs 2014.
// URGENT SLA: critical_delay 12h (tightest) / daily_operational 24h / shutdown_partial 48h / no_work 96h.
// SIGNATURE: miss_diary EVERY tier (JBCC contractual breach);
//            dispute_diary when floor_has_delay_event AND critical_delay;
//            submit_diary when floor_has_safety_incident (OHSA 24h).
// Beats Procore/Viewpoint/Aconex daily-report forms with full P6 dispute-resolution lifecycle.

import { Hono } from 'hono';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { HonoEnv } from '../utils/types';
import { fireCascade } from '../utils/cascade';
import {
  nextStatus,
  isHardTerminal,
  SLA_HOURS,
  crossesIntoRegulator,
  slaDeadlineFor,
  slaHoursRemaining,
  eventTypeFor,
  statusTsCol,
  isReportable,
  type DiaryStatus,
  type DiaryAction,
  type DiaryDayType,
  type DiaryCrossArgs,
} from '../utils/ipp-diary-spec';

const READ_ROLES = new Set([
  'admin', 'trader', 'ipp_developer', 'offtaker', 'grid_operator',
  'regulator', 'lender', 'support', 'carbon_fund', 'epc_contractor',
]);
const WRITE_ROLES = new Set(['admin', 'ipp_developer', 'support']);

interface DiaryRow {
  id: string;
  project_id: string;
  project_name: string | null;
  diary_date: string;
  diary_ref: string | null;
  chain_status: DiaryStatus;
  day_type: DiaryDayType;
  weather_am: string | null;
  weather_pm: string | null;
  temperature_max_c: number | null;
  temperature_min_c: number | null;
  work_stoppages_minutes: number | null;
  workforce_total: number | null;
  workforce_breakdown: string | null;
  plant_equipment: string | null;
  materials_delivered: string | null;
  work_areas_active: string | null;
  progress_narrative: string | null;
  instructions_issued: string | null;
  visitors: string | null;
  safety_observations: string | null;
  delay_description: string | null;
  delay_duration_hours: number | null;
  correction_notes: string | null;
  dispute_reason: string | null;
  resolution_notes: string | null;
  void_reason: string | null;
  contractor_signatory: string | null;
  employer_signatory: string | null;
  ie_reviewer: string | null;
  regulator_ref: string | null;
  risk_ref: string | null;
  ncr_ref: string | null;
  ms_ref: string | null;
  incident_ref: string | null;
  floor_has_delay_event: number;
  floor_has_safety_incident: number;
  floor_has_instruction_issued: number;
  floor_has_weather_stoppage: number;
  sla_target_hours: number | null;
  sla_deadline_at: string | null;
  sla_breached: number;
  sla_breach_count: number;
  is_reportable: number;
  submitted_at: string | null;
  late_submission_at: string | null;
  employer_noted_at: string | null;
  ie_reviewed_at: string | null;
  disputed_at: string | null;
  resolution_pending_at: string | null;
  correction_accepted_at: string | null;
  countersigned_at: string | null;
  archived_at: string | null;
  missed_at: string | null;
  voided_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

const app = new Hono<HonoEnv>();
app.use('*', authMiddleware);

// ─── GET / list ───────────────────────────────────────────────────────────────

app.get('/', async (c) => {
  const user = getCurrentUser(c);
  if (!READ_ROLES.has(user.role)) return c.json({ error: 'Forbidden' }, 403);
  const { project_id, status, day_type, limit = '100', offset = '0' } = c.req.query() as Record<string, string>;

  let where = '1=1';
  const binds: unknown[] = [];
  if (project_id) { where += ' AND project_id = ?'; binds.push(project_id); }
  if (status) { where += ' AND chain_status = ?'; binds.push(status); }
  if (day_type) { where += ' AND day_type = ?'; binds.push(day_type); }

  const [rows, kpiRow] = await Promise.all([
    c.env.DB.prepare(
      `SELECT * FROM oe_ipp_construction_diary WHERE ${where}
       ORDER BY diary_date DESC, created_at DESC LIMIT ? OFFSET ?`
    ).bind(...binds, parseInt(limit, 10), parseInt(offset, 10)).all<DiaryRow>(),
    c.env.DB.prepare(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN chain_status NOT IN ('archived','missed','voided') THEN 1 ELSE 0 END) AS open_count,
         SUM(CASE WHEN chain_status = 'submitted' THEN 1 ELSE 0 END) AS submitted_count,
         SUM(CASE WHEN chain_status = 'late_submission' THEN 1 ELSE 0 END) AS late_count,
         SUM(CASE WHEN chain_status = 'disputed' THEN 1 ELSE 0 END) AS disputed_count,
         SUM(CASE WHEN chain_status = 'missed' THEN 1 ELSE 0 END) AS missed_count,
         SUM(CASE WHEN chain_status = 'archived' THEN 1 ELSE 0 END) AS archived_count,
         SUM(CASE WHEN chain_status = 'voided' THEN 1 ELSE 0 END) AS voided_count,
         SUM(CASE WHEN sla_breached = 1 THEN 1 ELSE 0 END) AS breached,
         SUM(CASE WHEN is_reportable = 1 THEN 1 ELSE 0 END) AS reportable_total,
         SUM(CASE WHEN day_type = 'critical_delay' THEN 1 ELSE 0 END) AS critical_delay_count
       FROM oe_ipp_construction_diary`
    ).first<Record<string, number>>(),
  ]);

  const items = (rows.results ?? []).map(r => ({
    ...r,
    sla_hours_remaining: r.sla_deadline_at ? slaHoursRemaining(r.sla_deadline_at) : null,
    sla_target_hours: r.sla_target_hours ?? SLA_HOURS[r.day_type],
  }));

  return c.json({ data: { items, ...kpiRow } });
});

// ─── GET /:id single ──────────────────────────────────────────────────────────

app.get('/:id', async (c) => {
  const user = getCurrentUser(c);
  if (!READ_ROLES.has(user.role)) return c.json({ error: 'Forbidden' }, 403);
  const row = await c.env.DB.prepare(
    'SELECT * FROM oe_ipp_construction_diary WHERE id = ?'
  ).bind(c.req.param('id')).first<DiaryRow>();
  if (!row) return c.json({ error: 'Not found' }, 404);
  return c.json({ data: { diary: row, sla_hours_remaining: row.sla_deadline_at ? slaHoursRemaining(row.sla_deadline_at) : null } });
});

// ─── POST / create ────────────────────────────────────────────────────────────

app.post('/', async (c) => {
  const user = getCurrentUser(c);
  if (!WRITE_ROLES.has(user.role)) return c.json({ error: 'Forbidden' }, 403);

  const body = (await c.req.json().catch(() => ({}))) as {
    project_id: string;
    diary_date: string;
    diary_ref?: string;
    day_type?: DiaryDayType;
    weather_am?: string;
    weather_pm?: string;
    temperature_max_c?: number;
    temperature_min_c?: number;
    work_stoppages_minutes?: number;
    workforce_total?: number;
    workforce_breakdown?: string;
    plant_equipment?: string;
    materials_delivered?: string;
    work_areas_active?: string;
    progress_narrative?: string;
    instructions_issued?: string;
    visitors?: string;
    safety_observations?: string;
    delay_description?: string;
    delay_duration_hours?: number;
    contractor_signatory?: string;
    risk_ref?: string;
    ncr_ref?: string;
    ms_ref?: string;
    incident_ref?: string;
    floor_has_delay_event?: boolean;
    floor_has_safety_incident?: boolean;
    floor_has_instruction_issued?: boolean;
    floor_has_weather_stoppage?: boolean;
  };

  if (!body.project_id || !body.diary_date) {
    return c.json({ error: 'project_id and diary_date are required' }, 400);
  }

  const day_type: DiaryDayType = body.day_type ?? 'daily_operational';
  const slaHours = SLA_HOURS[day_type];
  const slaDeadline = slaDeadlineFor(body.diary_date, day_type);
  const now = new Date().toISOString();
  const id = `diary-${crypto.randomUUID().slice(0, 8)}`;

  await c.env.DB.prepare(`
    INSERT INTO oe_ipp_construction_diary (
      id, project_id, diary_date, diary_ref, chain_status, day_type,
      weather_am, weather_pm, temperature_max_c, temperature_min_c,
      work_stoppages_minutes, workforce_total, workforce_breakdown,
      plant_equipment, materials_delivered, work_areas_active, progress_narrative,
      instructions_issued, visitors, safety_observations,
      delay_description, delay_duration_hours, contractor_signatory,
      risk_ref, ncr_ref, ms_ref, incident_ref,
      floor_has_delay_event, floor_has_safety_incident,
      floor_has_instruction_issued, floor_has_weather_stoppage,
      sla_target_hours, sla_deadline_at, sla_breached, sla_breach_count,
      is_reportable, created_by, created_at, updated_at
    ) VALUES (
      ?,?,?,?,?,?,
      ?,?,?,?,
      ?,?,?,
      ?,?,?,?,
      ?,?,?,
      ?,?,?,
      ?,?,?,?,
      ?,?,
      ?,?,
      ?,?,?,?,
      ?,?,?,?
    )`)
    .bind(
      id, body.project_id, body.diary_date, body.diary_ref ?? null, 'open', day_type,
      body.weather_am ?? null, body.weather_pm ?? null,
      body.temperature_max_c ?? null, body.temperature_min_c ?? null,
      body.work_stoppages_minutes ?? null, body.workforce_total ?? null,
      body.workforce_breakdown ? JSON.stringify(body.workforce_breakdown) : null,
      body.plant_equipment ?? null, body.materials_delivered ?? null,
      body.work_areas_active ?? null, body.progress_narrative ?? null,
      body.instructions_issued ?? null, body.visitors ?? null,
      body.safety_observations ?? null, body.delay_description ?? null,
      body.delay_duration_hours ?? null, body.contractor_signatory ?? null,
      body.risk_ref ?? null, body.ncr_ref ?? null,
      body.ms_ref ?? null, body.incident_ref ?? null,
      body.floor_has_delay_event ? 1 : 0, body.floor_has_safety_incident ? 1 : 0,
      body.floor_has_instruction_issued ? 1 : 0, body.floor_has_weather_stoppage ? 1 : 0,
      slaHours, slaDeadline, 0, 0,
      0, user.id, now, now,
    ).run();

  const created = await c.env.DB.prepare(
    'SELECT * FROM oe_ipp_construction_diary WHERE id = ?'
  ).bind(id).first<DiaryRow>();

  await fireCascade({
    event: 'ipp_diary.submit_diary',
    actor_id: user.id,
    entity_type: 'ipp_construction_diary',
    entity_id: id,
    data: { project_id: body.project_id, diary_date: body.diary_date, day_type },
    env: c.env,
  });

  return c.json({ data: created }, 201);
});

// ─── POST /:id/:action state machine ─────────────────────────────────────────

app.post('/:id/:action', async (c) => {
  const user = getCurrentUser(c);
  if (!WRITE_ROLES.has(user.role)) return c.json({ error: 'Forbidden' }, 403);

  const { id, action } = c.req.param();
  const body = (await c.req.json().catch(() => ({}))) as {
    weather_am?: string;
    weather_pm?: string;
    progress_narrative?: string;
    instructions_issued?: string;
    safety_observations?: string;
    delay_description?: string;
    delay_duration_hours?: number;
    dispute_reason?: string;
    resolution_notes?: string;
    correction_notes?: string;
    void_reason?: string;
    contractor_signatory?: string;
    employer_signatory?: string;
    ie_reviewer?: string;
    regulator_ref?: string;
    risk_ref?: string;
    ncr_ref?: string;
    ms_ref?: string;
    incident_ref?: string;
    floor_has_delay_event?: boolean;
    floor_has_safety_incident?: boolean;
    floor_has_instruction_issued?: boolean;
    floor_has_weather_stoppage?: boolean;
    reason_code?: string;
    [k: string]: unknown;
  };

  const row = await c.env.DB.prepare(
    'SELECT * FROM oe_ipp_construction_diary WHERE id = ?'
  ).bind(id).first<DiaryRow>();
  if (!row) return c.json({ error: 'Not found' }, 404);
  if (user.role !== 'admin' && user.role !== 'support' && row.created_by !== user.id) {
    return c.json({ error: 'Forbidden' }, 403);
  }
  if (isHardTerminal(row.chain_status)) {
    return c.json({ error: `Diary is in terminal state: ${row.chain_status}` }, 409);
  }

  const diaryAction = action as DiaryAction;
  const toStatus = nextStatus(row.chain_status, diaryAction);
  if (toStatus === null) {
    return c.json({ error: `Action '${action}' not allowed from '${row.chain_status}'` }, 422);
  }

  const now = new Date();

  // Floor flag updates (caller-supplied — never auto-derived)
  const floorDelayEvent = body.floor_has_delay_event !== undefined
    ? (body.floor_has_delay_event ? 1 : 0) : row.floor_has_delay_event;
  const floorSafetyIncident = body.floor_has_safety_incident !== undefined
    ? (body.floor_has_safety_incident ? 1 : 0) : row.floor_has_safety_incident;
  const floorInstructionIssued = body.floor_has_instruction_issued !== undefined
    ? (body.floor_has_instruction_issued ? 1 : 0) : row.floor_has_instruction_issued;
  const floorWeatherStoppage = body.floor_has_weather_stoppage !== undefined
    ? (body.floor_has_weather_stoppage ? 1 : 0) : row.floor_has_weather_stoppage;

  const crossArgs: DiaryCrossArgs = {
    day_type: row.day_type,
    has_delay_event: !!floorDelayEvent,
    has_safety_incident: !!floorSafetyIncident,
  };

  const shouldCross = crossesIntoRegulator(diaryAction, crossArgs);
  const reportable = isReportable(diaryAction, crossArgs);

  // SLA breach tracking
  let slaBreached = row.sla_breached;
  let slaBreachCount = row.sla_breach_count;
  if (diaryAction === 'flag_sla_breach') {
    slaBreached = 1;
    slaBreachCount += 1;
  }

  // Build timestamp column for this status
  const tsCol = statusTsCol(toStatus);
  const tsVal = now.toISOString();

  // Dynamic SET clause for timestamp
  const extraSets = tsCol ? `, ${tsCol} = ?` : '';
  const extraBinds: unknown[] = tsCol ? [tsVal] : [];

  await c.env.DB.prepare(`
    UPDATE oe_ipp_construction_diary SET
      chain_status = ?,
      weather_am = COALESCE(?, weather_am),
      weather_pm = COALESCE(?, weather_pm),
      progress_narrative = COALESCE(?, progress_narrative),
      instructions_issued = COALESCE(?, instructions_issued),
      safety_observations = COALESCE(?, safety_observations),
      delay_description = COALESCE(?, delay_description),
      delay_duration_hours = COALESCE(?, delay_duration_hours),
      dispute_reason = COALESCE(?, dispute_reason),
      resolution_notes = COALESCE(?, resolution_notes),
      correction_notes = COALESCE(?, correction_notes),
      void_reason = COALESCE(?, void_reason),
      contractor_signatory = COALESCE(?, contractor_signatory),
      employer_signatory = COALESCE(?, employer_signatory),
      ie_reviewer = COALESCE(?, ie_reviewer),
      regulator_ref = COALESCE(?, regulator_ref),
      risk_ref = COALESCE(?, risk_ref),
      ncr_ref = COALESCE(?, ncr_ref),
      ms_ref = COALESCE(?, ms_ref),
      incident_ref = COALESCE(?, incident_ref),
      floor_has_delay_event = ?,
      floor_has_safety_incident = ?,
      floor_has_instruction_issued = ?,
      floor_has_weather_stoppage = ?,
      sla_breached = ?,
      sla_breach_count = ?,
      is_reportable = ?
      ${extraSets},
      updated_at = ?
    WHERE id = ?`)
    .bind(
      toStatus,
      body.weather_am ?? null, body.weather_pm ?? null,
      body.progress_narrative ?? null, body.instructions_issued ?? null,
      body.safety_observations ?? null, body.delay_description ?? null,
      body.delay_duration_hours ?? null, body.dispute_reason ?? null,
      body.resolution_notes ?? null, body.correction_notes ?? null,
      body.void_reason ?? null, body.contractor_signatory ?? null,
      body.employer_signatory ?? null, body.ie_reviewer ?? null,
      body.regulator_ref ?? null, body.risk_ref ?? null,
      body.ncr_ref ?? null, body.ms_ref ?? null, body.incident_ref ?? null,
      floorDelayEvent, floorSafetyIncident, floorInstructionIssued, floorWeatherStoppage,
      slaBreached, slaBreachCount, reportable ? 1 : 0,
      ...extraBinds,
      now.toISOString(),
      id,
    ).run();

  if (shouldCross || reportable) {
    const regulatorRef = body.regulator_ref ?? `W143-DIARY-${diaryAction.toUpperCase()}-${now.getFullYear()}-${id.slice(-6).toUpperCase()}`;
    await c.env.DB.prepare(
      `UPDATE oe_ipp_construction_diary SET regulator_ref = ? WHERE id = ? AND regulator_ref IS NULL`
    ).bind(regulatorRef, id).run();
  }

  const updated = await c.env.DB.prepare(
    'SELECT * FROM oe_ipp_construction_diary WHERE id = ?'
  ).bind(id).first<DiaryRow>();

  await fireCascade({
    event: eventTypeFor(diaryAction),
    actor_id: user.id,
    entity_type: 'ipp_construction_diary',
    entity_id: id,
    data: {
      from_status: row.chain_status,
      to_status: toStatus,
      day_type: row.day_type,
      diary_date: row.diary_date,
      crosses_into_regulator: shouldCross,
      is_reportable: reportable,
      floor_has_delay_event: !!floorDelayEvent,
      floor_has_safety_incident: !!floorSafetyIncident,
    },
    env: c.env,
  });

  return c.json({ data: updated });
});

export default app;

// ─── SLA sweep (called by cron) ───────────────────────────────────────────────

export async function ippDiarySlaSweep(
  env: HonoEnv['Bindings'],
): Promise<{ flagged_late: number; flagged_missed: number; sla_breached: number }> {
  const now = new Date().toISOString();
  let flaggedLate = 0, flaggedMissed = 0, slaBreached = 0;

  // Flag open diaries past 24h as late_submission
  const lateRows = await env.DB.prepare(`
    SELECT id, diary_date, day_type, sla_target_hours, project_id
    FROM oe_ipp_construction_diary
    WHERE chain_status = 'open'
      AND datetime(diary_date, '+' || CAST(sla_target_hours AS TEXT) || ' hours') < datetime(?)
      AND datetime(diary_date, '+72 hours') > datetime(?)
  `).bind(now, now).all<{ id: string; diary_date: string; day_type: DiaryDayType; project_id: string }>();

  const lateList = lateRows.results ?? [];
  const lateStmts: D1PreparedStatement[] = lateList.map((r) =>
    env.DB.prepare(
      `UPDATE oe_ipp_construction_diary SET chain_status='late_submission', late_submission_at=?, updated_at=? WHERE id=?`
    ).bind(now, now, r.id));
  for (let i = 0; i < lateStmts.length; i += 100) await env.DB.batch(lateStmts.slice(i, i + 100));
  flaggedLate = lateList.length;
  for (const r of lateList) {
    await fireCascade({
      event: 'ipp_diary.flag_late',
      actor_id: 'cron',
      entity_type: 'ipp_construction_diary',
      entity_id: r.id,
      data: { diary_date: r.diary_date, day_type: r.day_type },
      env,
    });
  }

  // Flag open/late diaries past 72h as missed (SIGNATURE)
  const missedRows = await env.DB.prepare(`
    SELECT id, diary_date, day_type, project_id
    FROM oe_ipp_construction_diary
    WHERE chain_status IN ('open', 'late_submission')
      AND datetime(diary_date, '+72 hours') <= datetime(?)
  `).bind(now).all<{ id: string; diary_date: string; day_type: DiaryDayType; project_id: string }>();

  const missedList = (missedRows.results ?? []).map((r) => ({
    r,
    regulatorRef: `W143-DIARY-MISSED-${new Date().getFullYear()}-${r.id.slice(-6).toUpperCase()}`,
  }));
  const missedStmts: D1PreparedStatement[] = missedList.map(({ r, regulatorRef }) =>
    env.DB.prepare(
      `UPDATE oe_ipp_construction_diary
       SET chain_status='missed', missed_at=?, sla_breached=1, sla_breach_count=sla_breach_count+1,
           is_reportable=1, regulator_ref=COALESCE(regulator_ref,?), updated_at=?
       WHERE id=?`
    ).bind(now, regulatorRef, now, r.id));
  for (let i = 0; i < missedStmts.length; i += 100) await env.DB.batch(missedStmts.slice(i, i + 100));
  flaggedMissed = missedList.length;
  for (const { r, regulatorRef } of missedList) {
    await fireCascade({
      event: 'ipp_diary.miss_diary',
      actor_id: 'cron',
      entity_type: 'ipp_construction_diary',
      entity_id: r.id,
      data: {
        diary_date: r.diary_date, day_type: r.day_type,
        crosses_into_regulator: true, is_reportable: true, regulator_ref: regulatorRef,
      },
      env,
    });
  }

  // SLA breach for non-terminal diaries past their deadline (not yet missed) — set-based, no cascade
  const breachUpd = await env.DB.prepare(`
    UPDATE oe_ipp_construction_diary
    SET sla_breached=1, sla_breach_count=sla_breach_count+1, updated_at=?
    WHERE chain_status NOT IN ('archived','missed','voided')
      AND sla_breached = 0
      AND sla_deadline_at IS NOT NULL
      AND datetime(sla_deadline_at) <= datetime(?)
  `).bind(now, now).run();
  slaBreached = breachUpd.meta?.changes ?? 0;

  return { flagged_late: flaggedLate, flagged_missed: flaggedMissed, sla_breached: slaBreached };
}
