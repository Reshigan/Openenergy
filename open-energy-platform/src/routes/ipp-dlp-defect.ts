// W145 — IPP DLP Defects Register
// JBCC 6.2 Cl.19/32 + NEC4 Cl.43 + NHBRC + REIPPPP QMP
import { Hono } from 'hono';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { fireCascade } from '../utils/cascade';
import { HonoEnv } from '../utils/types';
import {
  nextStatus,
  crossesIntoRegulator,
  slaBreachCrossesIntoRegulator,
  slaDeadlineFor,
  statusTsCol,
  isReportable,
  HARD_TERMINALS,
  SLA_HOURS,
  type DlpDefectStatus,
  type DlpDefectAction,
  type SeverityClass,
  type DlpCrossArgs,
} from '../utils/ipp-dlp-defect-spec';

const app = new Hono<HonoEnv>();
app.use('*', authMiddleware);

const WRITE_ROLES = new Set(['admin', 'ipp_developer']);

// ─── GET / ───────────────────────────────────────────────────────────────────
app.get('/', async (c) => {
  const env = c.env;
  const user = getCurrentUser(c);
  const { status, project_id, severity_class, period } = c.req.query();

  let sinceDate = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);
  const now = new Date();
  switch (period) {
    case 'today': sinceDate = new Date().toISOString().slice(0, 10); break;
    case 'week':  sinceDate = new Date(now.getTime() - 7 * 86400000).toISOString().slice(0, 10); break;
    case 'month': break;
    case 'ytd':   sinceDate = `${now.getFullYear()}-01-01`; break;
    case '1y':    sinceDate = new Date(now.getTime() - 365 * 86400000).toISOString().slice(0, 10); break;
    case 'all':   sinceDate = '2000-01-01'; break;
  }

  let q = `SELECT * FROM oe_ipp_dlp_defects WHERE identified_at >= ?`;
  const params: unknown[] = [sinceDate];

  if (status)         { q += ` AND status = ?`;         params.push(status); }
  if (project_id)     { q += ` AND project_id = ?`;     params.push(project_id); }
  if (severity_class) { q += ` AND severity_class = ?`; params.push(severity_class); }

  if (user.role !== 'admin' && user.role !== 'regulator') {
    q += ` AND participant_id = ?`; params.push(user.id);
  }

  q += ` ORDER BY identified_at DESC, defect_ref ASC LIMIT 200`;

  const rows = await env.DB.prepare(q).bind(...params).all<Record<string, unknown>>();
  const items: Record<string, unknown>[] = rows.results ?? [];

  const total = items.length;
  const open_count = items.filter(r => !HARD_TERMINALS.includes(r.status as DlpDefectStatus)).length;
  const critical_count = items.filter(r => r.severity_class === 'critical').length;
  const escalated_count = items.filter(r => r.status === 'escalated_to_ncr').length;
  const disputed_count = items.filter(r => r.status === 'disputed').length;
  const late_count = items.filter(r => r.is_sla_breached === 1).length;
  const reportable_total = items.filter(r => r.is_reportable === 1).length;
  const closed_count = items.filter(r => r.status === 'closed').length;
  const safety_count = items.filter(r => r.is_safety_related === 1).length;

  return c.json({ data: { items, total, open_count, critical_count, escalated_count,
    disputed_count, late_count, reportable_total, closed_count, safety_count } });
});

// ─── GET /:id ─────────────────────────────────────────────────────────────────
app.get('/:id', async (c) => {
  const env = c.env;
  const user = getCurrentUser(c);
  const row = await env.DB
    .prepare(`SELECT * FROM oe_ipp_dlp_defects WHERE id = ?`)
    .bind(c.req.param('id'))
    .first<Record<string, unknown>>();
  if (!row) return c.json({ error: 'Not found' }, 404);
  if (user.role !== 'admin' && user.role !== 'regulator' && row.participant_id !== user.id)
    return c.json({ error: 'Forbidden' }, 403);
  return c.json({ data: row });
});

// ─── POST / ──────────────────────────────────────────────────────────────────
app.post('/', async (c) => {
  const env = c.env;
  const user = getCurrentUser(c);
  if (!WRITE_ROLES.has(user.role)) return c.json({ error: 'Forbidden' }, 403);

  const body = await c.req.json<Record<string, unknown>>();
  const { project_id, project_name, severity_class, defect_type, description,
    location_description, work_package, responsible_contractor, defect_ref,
    identified_by, ie_inspector, contractor_rep,
    is_safety_related, is_structural, is_hold_point,
    ncr_ref, ei_ref, si_ref, dlp_end_date } = body;

  if (!project_id || !severity_class || !description)
    return c.json({ error: 'project_id, severity_class, description required' }, 400);

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const slaHours = SLA_HOURS[severity_class as SeverityClass] ?? 168;
  const slaDeadline = slaDeadlineFor(severity_class as SeverityClass, now);

  const crossArgs: DlpCrossArgs = {
    severity_class: severity_class as SeverityClass,
    is_safety_related: !!is_safety_related,
    is_structural: !!is_structural,
    is_hold_point: !!is_hold_point,
  };

  await env.DB
    .prepare(`INSERT INTO oe_ipp_dlp_defects
      (id, project_id, project_name, participant_id, defect_ref, status,
       severity_class, defect_type, description, location_description,
       work_package, responsible_contractor,
       is_safety_related, is_structural, is_hold_point,
       identified_at, identified_by, ie_inspector, contractor_rep,
       ncr_ref, ei_ref, si_ref, dlp_end_date,
       sla_hours, sla_deadline, is_sla_breached, is_reportable,
       created_at, updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,?,?,?)`)
    .bind(id, project_id, project_name ?? null, user.id, defect_ref ?? null,
      'identified', severity_class, defect_type ?? null, description,
      location_description ?? null, work_package ?? null, responsible_contractor ?? null,
      is_safety_related ? 1 : 0, is_structural ? 1 : 0, is_hold_point ? 1 : 0,
      now, identified_by ?? null, ie_inspector ?? null, contractor_rep ?? null,
      ncr_ref ?? null, ei_ref ?? null, si_ref ?? null, dlp_end_date ?? null,
      slaHours, slaDeadline,
      isReportable('identified', crossArgs) ? 1 : 0,
      now, now)
    .run();

  return c.json({ data: { id } }, 201);
});

// ─── PUT /:id/action ──────────────────────────────────────────────────────────
app.put('/:id/action', async (c) => {
  const env = c.env;
  const user = getCurrentUser(c);
  if (!WRITE_ROLES.has(user.role)) return c.json({ error: 'Forbidden' }, 403);

  const id = c.req.param('id');
  const body = await c.req.json<{
    action: DlpDefectAction;
    notes?: string;
    extension_days?: number;
    ncr_ref?: string;
    regulator_ref?: string;
  }>();
  const { action, notes, extension_days, ncr_ref, regulator_ref } = body;

  const row = await env.DB
    .prepare(`SELECT * FROM oe_ipp_dlp_defects WHERE id = ?`)
    .bind(id)
    .first<Record<string, unknown>>();
  if (!row) return c.json({ error: 'Not found' }, 404);
  if (user.role !== 'admin' && row.participant_id !== user.id)
    return c.json({ error: 'Forbidden' }, 403);

  const currentStatus = row.status as DlpDefectStatus;
  const newStatus = nextStatus(currentStatus, action);
  if (newStatus === null && action !== 'request_extension' && action !== 'grant_extension' && action !== 'flag_sla_breach')
    return c.json({ error: `Action ${action} not valid in state ${currentStatus}` }, 422);

  const resolvedStatus = newStatus ?? currentStatus;
  const now = new Date().toISOString();
  const tsCol = statusTsCol(resolvedStatus);

  const args: DlpCrossArgs = {
    severity_class: row.severity_class as SeverityClass,
    is_safety_related: row.is_safety_related === 1,
    is_structural: row.is_structural === 1,
    is_hold_point: row.is_hold_point === 1,
  };

  const crosses = crossesIntoRegulator(action, args);
  const resolvedRegRef = regulator_ref ?? (crosses ? `W145-DFR-${action.toUpperCase()}-${now.slice(0, 10).replace(/-/g, '')}` : null);
  const updatedReportable = isReportable(resolvedStatus, args);

  let slaDeadlineUpdate = '';
  if (action === 'grant_extension' && extension_days) {
    const oldDeadline = new Date(row.sla_deadline as string);
    oldDeadline.setDate(oldDeadline.getDate() + Number(extension_days));
    slaDeadlineUpdate = `, sla_deadline = '${oldDeadline.toISOString()}'`;
  }

  const resolvedNcrRef = ncr_ref ?? (row.ncr_ref as string | null);

  await env.DB
    .prepare(`UPDATE oe_ipp_dlp_defects SET
      status = ?, ${tsCol} = ?, updated_at = ?,
      is_reportable = ?, regulator_ref = ?,
      ncr_ref = ?${slaDeadlineUpdate}
      WHERE id = ?`)
    .bind(resolvedStatus, now, now,
      updatedReportable ? 1 : 0,
      resolvedRegRef ?? row.regulator_ref ?? null,
      resolvedNcrRef,
      id)
    .run();

  await fireCascade({
    event: `ipp_dlp.${action}` as never,
    actor_id: user.id,
    entity_type: 'dlp_defect',
    entity_id: id,
    data: { action, from: currentStatus, to: resolvedStatus, notes, crosses, regulator_ref: resolvedRegRef },
    env: env as never,
  });

  return c.json({ data: { id, status: resolvedStatus, crosses, regulator_ref: resolvedRegRef } });
});

// ─── Cron SLA sweep ───────────────────────────────────────────────────────────
export async function ippDlpDefectSlaSweep(env: HonoEnv['Bindings']): Promise<{
  late_flagged: number; missed: number;
}> {
  const now = new Date().toISOString();
  const openRows = await env.DB
    .prepare(`SELECT * FROM oe_ipp_dlp_defects
       WHERE status NOT IN ('closed','escalated_to_ncr','waived','cancelled') AND is_sla_breached = 0`)
    .all<Record<string, unknown>>();

  let late_flagged = 0;

  for (const row of openRows.results ?? []) {
    const deadline = new Date(row.sla_deadline as string);
    if (deadline < new Date()) {
      const args: DlpCrossArgs = {
        severity_class: row.severity_class as SeverityClass,
        is_safety_related: row.is_safety_related === 1,
        is_structural: row.is_structural === 1,
        is_hold_point: row.is_hold_point === 1,
      };
      const crosses = slaBreachCrossesIntoRegulator(args);
      const regRef = crosses
        ? `W145-DFR-SLA-${now.slice(0, 10).replace(/-/g, '')}`
        : (row.regulator_ref as string | null);

      await env.DB
        .prepare(`UPDATE oe_ipp_dlp_defects SET
           is_sla_breached = 1, updated_at = ?, regulator_ref = COALESCE(?, regulator_ref)
           WHERE id = ?`)
        .bind(now, regRef, row.id)
        .run();

      await fireCascade({
        event: 'ipp_dlp.flag_sla_breach' as never,
        actor_id: 'cron',
        entity_type: 'dlp_defect',
        entity_id: row.id as string,
        data: { crosses, severity_class: row.severity_class },
        env: env as never,
      });
      late_flagged++;
    }
  }

  return { late_flagged, missed: 0 };
}

export default app;
