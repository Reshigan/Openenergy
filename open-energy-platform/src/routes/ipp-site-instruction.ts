// W144 — IPP Site/Engineer's Instruction Register
// JBCC 6.2 cl.18 + NEC4 PMI + OHSA Const.Regs s.8
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
  type SiteInstructionStatus,
  type SiteInstructionAction,
  type InstructionType,
  type SiCrossArgs,
} from '../utils/ipp-site-instruction-spec';
import { badEnum } from '../utils/validation';

// Migration 387 CHECK(instruction_type IN (...)) — reject before D1 500s (SLA_HOURS `?? 48` masks bad values).
const SI_INSTRUCTION_TYPES = ['safety_directive', 'variation_instruction', 'defect_rectification', 'design_clarification', 'testing_instruction', 'administrative'];

const app = new Hono<HonoEnv>();
app.use('*', authMiddleware);

const WRITE_ROLES = new Set(['admin', 'ipp_developer']);

// ─── GET / ───────────────────────────────────────────────────────────────────
app.get('/', async (c) => {
  const env = c.env;
  const user = getCurrentUser(c);
  const { status, project_id, instruction_type, period } = c.req.query();

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

  let q = `SELECT * FROM oe_ipp_site_instructions WHERE issued_date >= ?`;
  const params: unknown[] = [sinceDate];

  if (status)           { q += ` AND status = ?`;           params.push(status); }
  if (project_id)       { q += ` AND project_id = ?`;       params.push(project_id); }
  if (instruction_type) { q += ` AND instruction_type = ?`; params.push(instruction_type); }

  // Role filter: IPP developer sees own projects only
  if (user.role !== 'admin' && user.role !== 'regulator') {
    q += ` AND participant_id = ?`; params.push(user.id);
  }

  q += ` ORDER BY issued_date DESC, si_ref ASC LIMIT 200`;

  const rows = await env.DB.prepare(q).bind(...params).all<Record<string, unknown>>();
  const items: Record<string, unknown>[] = rows.results ?? [];

  const total = items.length;
  const open_count = items.filter(r => !HARD_TERMINALS.includes(r.status as SiteInstructionStatus)).length;
  const disputed_count = items.filter(r => r.status === 'disputed').length;
  const safety_count = items.filter(r => r.instruction_type === 'safety_directive').length;
  const variation_count = items.filter(r => r.instruction_type === 'variation_instruction').length;
  const late_count = items.filter(r => r.is_sla_breached === 1).length;
  const reportable_total = items.filter(r => r.is_reportable === 1).length;
  const closed_count = items.filter(r => r.status === 'closed').length;
  const superseded_count = items.filter(r => r.status === 'superseded').length;

  return c.json({ data: { items, total, open_count, disputed_count, safety_count,
    variation_count, late_count, reportable_total, closed_count, superseded_count } });
});

// ─── GET /:id ─────────────────────────────────────────────────────────────────
app.get('/:id', async (c) => {
  const env = c.env;
  const user = getCurrentUser(c);
  const row = await env.DB
    .prepare(`SELECT * FROM oe_ipp_site_instructions WHERE id = ?`)
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
  const { project_id, project_name, instruction_type, si_ref,
    issued_date, description, scope_narrative, work_location,
    ie_signatory, contractor_signatory,
    is_safety_directive, is_contract_variation, value_zar,
    ncr_ref, dfr_ref, diary_ref } = body;

  if (!project_id || !instruction_type || !issued_date || !description)
    return c.json({ error: 'project_id, instruction_type, issued_date, description required' }, 400);

  const typeErr = badEnum('instruction_type', instruction_type, SI_INSTRUCTION_TYPES);
  if (typeErr) return c.json({ error: typeErr }, 400);

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const slaHours = SLA_HOURS[instruction_type as InstructionType] ?? 48;
  const slaDeadline = slaDeadlineFor(instruction_type as InstructionType, issued_date as string);

  await env.DB
    .prepare(`INSERT INTO oe_ipp_site_instructions
      (id, project_id, project_name, participant_id, instruction_type, si_ref,
       status, issued_date, description, scope_narrative, work_location,
       ie_signatory, contractor_signatory,
       is_safety_directive, is_contract_variation, value_zar,
       ncr_ref, dfr_ref, diary_ref,
       sla_hours, sla_deadline, is_sla_breached, is_reportable,
       created_at, updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,?,?,?)`)
    .bind(id, project_id, project_name ?? null, user.id, instruction_type, si_ref ?? null,
      'draft', issued_date, description, scope_narrative ?? null, work_location ?? null,
      ie_signatory ?? null, contractor_signatory ?? null,
      is_safety_directive ? 1 : 0, is_contract_variation ? 1 : 0, value_zar ?? null,
      ncr_ref ?? null, dfr_ref ?? null, diary_ref ?? null,
      slaHours, slaDeadline,
      isReportable('draft', {
        instruction_type: instruction_type as InstructionType,
        is_safety_directive: !!is_safety_directive,
        is_contract_variation: !!is_contract_variation,
        value_zar: (value_zar as number | null) ?? null,
      }) ? 1 : 0,
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
    action: SiteInstructionAction;
    notes?: string;
    extension_days?: number;
    superseded_by?: string;
    regulator_ref?: string;
  }>();
  const { action, notes, extension_days, superseded_by, regulator_ref } = body;

  const row = await env.DB
    .prepare(`SELECT * FROM oe_ipp_site_instructions WHERE id = ?`)
    .bind(id)
    .first<Record<string, unknown>>();
  if (!row) return c.json({ error: 'Not found' }, 404);
  if (user.role !== 'admin' && row.participant_id !== user.id)
    return c.json({ error: 'Forbidden' }, 403);

  const currentStatus = row.status as SiteInstructionStatus;
  const newStatus = nextStatus(currentStatus, action);
  if (newStatus === null && action !== 'request_extension' && action !== 'grant_extension' && action !== 'flag_sla_breach')
    return c.json({ error: `Action ${action} not valid in state ${currentStatus}` }, 422);

  const resolvedStatus = newStatus ?? currentStatus;
  const now = new Date().toISOString();
  const tsCol = statusTsCol(resolvedStatus);

  const args: SiCrossArgs = {
    instruction_type: row.instruction_type as InstructionType,
    is_safety_directive: row.is_safety_directive === 1,
    is_contract_variation: row.is_contract_variation === 1,
    value_zar: (row.value_zar as number | null) ?? null,
  };

  const crosses = crossesIntoRegulator(action, args);
  const resolvedRegRef = regulator_ref ?? (crosses ? `W144-SI-${action.toUpperCase()}-${now.slice(0, 10).replace(/-/g, '')}` : null);

  const updatedReportable = isReportable(resolvedStatus, args);

  // Handle extension: extend sla_deadline by extension_days
  let slaDeadlineUpdate = '';
  if (action === 'grant_extension' && extension_days) {
    const oldDeadline = new Date(row.sla_deadline as string);
    oldDeadline.setDate(oldDeadline.getDate() + Number(extension_days));
    slaDeadlineUpdate = `, sla_deadline = '${oldDeadline.toISOString()}'`;
  }

  await env.DB
    .prepare(`UPDATE oe_ipp_site_instructions SET
      status = ?, ${tsCol} = ?, updated_at = ?,
      is_reportable = ?, regulator_ref = ?,
      superseded_by = ?${slaDeadlineUpdate}
      WHERE id = ?`)
    .bind(resolvedStatus, now, now,
      updatedReportable ? 1 : 0,
      resolvedRegRef ?? row.regulator_ref ?? null,
      superseded_by ?? row.superseded_by ?? null,
      id)
    .run();

  await fireCascade({
    event: `ipp_si.${action}` as never,
    actor_id: user.id,
    entity_type: 'site_instruction',
    entity_id: id,
    data: { action, from: currentStatus, to: resolvedStatus, notes, crosses, regulator_ref: resolvedRegRef },
    env: env as never,
  });

  return c.json({ data: { id, status: resolvedStatus, crosses, regulator_ref: resolvedRegRef } });
});

// ─── Cron SLA sweep ───────────────────────────────────────────────────────────
export async function ippSiteInstructionSlaSweep(env: HonoEnv['Bindings']): Promise<{
  late_flagged: number; missed: number;
}> {
  const now = new Date().toISOString();
  const openRows = await env.DB
    .prepare(`SELECT * FROM oe_ipp_site_instructions
       WHERE status NOT IN ('closed','superseded','voided') AND is_sla_breached = 0`)
    .all<Record<string, unknown>>();

  let late_flagged = 0;
  let missed = 0;

  for (const row of openRows.results ?? []) {
    const deadline = new Date(row.sla_deadline as string);
    if (deadline < new Date()) {
      const args: SiCrossArgs = {
        instruction_type: row.instruction_type as InstructionType,
        is_safety_directive: row.is_safety_directive === 1,
        is_contract_variation: row.is_contract_variation === 1,
        value_zar: (row.value_zar as number | null) ?? null,
      };
      const crosses = slaBreachCrossesIntoRegulator(args);
      const regRef = crosses
        ? `W144-SI-SLA-${now.slice(0, 10).replace(/-/g, '')}`
        : (row.regulator_ref as string | null);

      await env.DB
        .prepare(`UPDATE oe_ipp_site_instructions SET
           is_sla_breached = 1, updated_at = ?, regulator_ref = COALESCE(?, regulator_ref)
           WHERE id = ?`)
        .bind(now, regRef, row.id)
        .run();

      await fireCascade({
        event: 'ipp_si.flag_sla_breach' as never,
        actor_id: 'cron',
        entity_type: 'site_instruction',
        entity_id: row.id as string,
        data: { crosses, instruction_type: row.instruction_type },
        env: env as never,
      });
      late_flagged++;
    }
  }

  return { late_flagged, missed };
}

export default app;
