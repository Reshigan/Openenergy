// ═══════════════════════════════════════════════════════════════════════════════
// W226 — VCM Project Development Chain
// Gold Standard GS4GG v3.1 + Verra VCS v4.5 + Article 6.4 ITMO
// Routes: GET /, GET /:id, GET /pdd-sections/:project_id, POST /, POST /:id/action, POST /sla-sweep
// ═══════════════════════════════════════════════════════════════════════════════

import { Hono } from 'hono';
import type { HonoEnv } from '../utils/types';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { fireCascade } from '../utils/cascade';
import type { EventType } from '../utils/cascade';
import {
  VcmProjectStatus, VcmProjectAction, VcmTier,
  deriveVcmSla, VCM_HARD_TERMINALS,
  VCM_VALID_TRANSITIONS, VCM_STATE_TRANSITIONS,
  vcmCrossesIntoRegulator, vcmSlaBreachCrossesIntoRegulator,
} from '../utils/vcm-spec';
import { generatePddSection } from '../utils/vcm-pdd-generator';
import type { PddSectionCode, PddGenerationInput } from '../utils/vcm-pdd-generator';

const app = new Hono<HonoEnv>();
app.use('*', authMiddleware);

const WRITE_ROLES = ['admin', 'carbon_fund', 'ipp_developer', 'support'];

// ─── SLA sweep ────────────────────────────────────────────────────────────────
export async function vcmProjectSlaSweep(env: any) {
  const now = new Date().toISOString();
  const overdue = await (env.DB as D1Database)
    .prepare(`SELECT * FROM oe_vcm_projects
              WHERE sla_breached = 0 AND sla_deadline < ? AND chain_status NOT IN
              ('credits_issued','cancelled')`)
    .bind(now)
    .all<Record<string, unknown>>();

  for (const row of overdue.results ?? []) {
    await (env.DB as D1Database)
      .prepare(`UPDATE oe_vcm_projects SET sla_breached = 1, updated_at = ? WHERE id = ?`)
      .bind(now, row.id).run();

    if (vcmSlaBreachCrossesIntoRegulator(row.vcm_tier as VcmTier)) {
      await (env.DB as D1Database)
        .prepare(`INSERT INTO regulator_inbox (id,entity_type,entity_id,event_type,summary,participant_id,created_at)
                  VALUES (?,?,?,?,?,?,?)`)
        .bind(
          crypto.randomUUID(), 'vcm_project', row.id,
          'vcm_sla_breach',
          `VCM project SLA breached — ${row.vcm_tier} — ${row.project_name ?? 'unknown'}`,
          row.participant_id, now,
        ).run().catch(() => {});
    }

    await fireCascade({
      event: 'vcm_project_sla_breach' as EventType,
      actor_id: 'system', entity_type: 'vcm_project', entity_id: row.id as string,
      data: { vcm_tier: row.vcm_tier, project_name: row.project_name },
      env: env as any,
    }).catch(() => {});
  }
  return { swept: overdue.results?.length ?? 0 };
}

// ─── GET / ────────────────────────────────────────────────────────────────────
app.get('/', async (c) => {
  const user = getCurrentUser(c);
  const isAdmin = ['admin', 'carbon_fund', 'support'].includes(user.role);
  const participantId = c.req.query('participant_id');
  const resolved = isAdmin && participantId ? participantId : user.id;

  const rows = await c.env.DB
    .prepare(`SELECT * FROM oe_vcm_projects WHERE participant_id = ? ORDER BY created_at DESC`)
    .bind(resolved)
    .all<Record<string, unknown>>();

  const all = rows.results ?? [];
  const kpis = {
    total: all.length,
    in_progress: all.filter(r => !['credits_issued', 'cancelled', 'active'].includes(r.chain_status as string)).length,
    registered: all.filter(r => r.chain_status === 'registration' || r.chain_status === 'implementation' || r.chain_status === 'monitoring' || r.chain_status === 'active').length,
    credits_issued: all.filter(r => r.chain_status === 'credits_issued' || r.chain_status === 'active').length,
    sla_breached: all.filter(r => r.sla_breached).length,
  };

  return c.json({ success: true, data: all, kpis });
});

// ─── GET /:id ─────────────────────────────────────────────────────────────────
app.get('/:id', async (c) => {
  const user = getCurrentUser(c);
  const id = c.req.param('id');
  const row = await c.env.DB
    .prepare(`SELECT * FROM oe_vcm_projects WHERE id = ?`)
    .bind(id).first<Record<string, unknown>>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const isAdmin = ['admin', 'carbon_fund', 'support'].includes(user.role);
  if (!isAdmin && row.participant_id !== user.id) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const timeline = await c.env.DB
    .prepare(`SELECT * FROM audit_events WHERE entity_type = 'vcm_project' AND entity_id = ? ORDER BY created_at ASC`)
    .bind(id).all<Record<string, unknown>>();

  const pddSectionsResult = await c.env.DB
    .prepare(`SELECT * FROM oe_vcm_pdd_sections WHERE project_id = ? ORDER BY section_code`)
    .bind(id).all<Record<string, unknown>>();

  return c.json({
    success: true,
    data: { ...row, pdd_sections: pddSectionsResult.results ?? [] },
    timeline: timeline.results ?? [],
  });
});

// ─── GET /pdd-sections/:project_id ───────────────────────────────────────────
app.get('/pdd-sections/:project_id', async (c) => {
  const user = getCurrentUser(c);
  const projectId = c.req.param('project_id');

  const row = await c.env.DB
    .prepare(`SELECT * FROM oe_vcm_projects WHERE id = ?`)
    .bind(projectId).first<Record<string, unknown>>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const isAdmin = ['admin', 'carbon_fund', 'support'].includes(user.role);
  if (!isAdmin && row.participant_id !== user.id) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const sections = await c.env.DB
    .prepare(`SELECT * FROM oe_vcm_pdd_sections WHERE project_id = ? ORDER BY section_code`)
    .bind(projectId).all<Record<string, unknown>>();

  return c.json({ success: true, data: sections.results ?? [] });
});

// ─── POST / ──────────────────────────────────────────────────────────────────
app.post('/', async (c) => {
  const user = getCurrentUser(c);
  if (!WRITE_ROLES.includes(user.role)) return c.json({ success: false, error: 'Forbidden' }, 403);

  const body = await c.req.json<{
    vcm_tier: VcmTier;
    project_name: string;
    methodology: string;
    registry_standard: string;
    technology: string;
    participant_id?: string;
    installed_capacity_kw?: number;
    reipppp_bid_ref?: string;
    nersa_licence_ref?: string;
    dffe_ea_ref?: string;
    sdg_targets?: string;
    additionality_basis?: string;
    reason?: string;
  }>();

  if (!body.vcm_tier || !body.project_name || !body.methodology || !body.registry_standard || !body.technology) {
    return c.json({ success: false, error: 'vcm_tier, project_name, methodology, registry_standard, and technology are required' }, 400);
  }

  const isAdmin = ['admin', 'carbon_fund', 'support'].includes(user.role);
  const participantId = isAdmin && body.participant_id ? body.participant_id : user.id;
  const tier = body.vcm_tier;

  const now = new Date().toISOString();
  const slaDays = deriveVcmSla(tier);
  const slaDeadline = new Date(Date.now() + slaDays * 86400000).toISOString();
  const id = crypto.randomUUID();

  await c.env.DB
    .prepare(`INSERT INTO oe_vcm_projects
      (id, participant_id, vcm_tier, project_name, methodology, registry_standard, technology,
       installed_capacity_kw, reipppp_bid_ref, nersa_licence_ref, dffe_ea_ref,
       sdg_targets, additionality_basis,
       chain_status, sla_deadline, sla_breached, regulator_notified, actor_id, reason, created_at, updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,'conception',?,0,0,?,?,?,?)`)
    .bind(
      id, participantId, tier,
      body.project_name, body.methodology, body.registry_standard, body.technology,
      body.installed_capacity_kw ?? null,
      body.reipppp_bid_ref ?? null, body.nersa_licence_ref ?? null, body.dffe_ea_ref ?? null,
      body.sdg_targets ?? null, body.additionality_basis ?? null,
      slaDeadline, user.id, body.reason ?? null, now, now,
    ).run();

  await fireCascade({
    event: 'vcm_project_created' as EventType,
    actor_id: user.id, entity_type: 'vcm_project', entity_id: id,
    data: { vcm_tier: tier, project_name: body.project_name, methodology: body.methodology },
    env: c.env,
  }).catch(() => {});

  const row = await c.env.DB
    .prepare(`SELECT * FROM oe_vcm_projects WHERE id = ?`)
    .bind(id).first<Record<string, unknown>>();
  return c.json({ success: true, data: row }, 201);
});

// ─── POST /:id/action ─────────────────────────────────────────────────────────
app.post('/:id/action', async (c) => {
  const user = getCurrentUser(c);
  if (!WRITE_ROLES.includes(user.role)) return c.json({ success: false, error: 'Forbidden' }, 403);

  const id = c.req.param('id');
  const body = await c.req.json<{
    action: VcmProjectAction;
    reason?: string;
    vvb_name?: string;
    vvb_accreditation_ref?: string;
    registry_project_id?: string;
    crediting_period_start?: string;
    crediting_period_end?: string;
    verification_ref?: string;
    credits_issued_tco2e?: number;
  }>();
  const { action, reason } = body;

  const row = await c.env.DB
    .prepare(`SELECT * FROM oe_vcm_projects WHERE id = ?`)
    .bind(id).first<Record<string, unknown>>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const isAdmin = ['admin', 'carbon_fund', 'support'].includes(user.role);
  if (!isAdmin && row.participant_id !== user.id) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const currentStatus = row.chain_status as VcmProjectStatus;
  if (VCM_HARD_TERMINALS.has(currentStatus)) {
    return c.json({ success: false, error: `Project in terminal state '${currentStatus}'` }, 422);
  }

  const allowed = VCM_VALID_TRANSITIONS[currentStatus];
  if (!allowed.includes(action)) {
    return c.json({ success: false, error: `Action '${action}' not valid from '${currentStatus}'` }, 422);
  }

  const nextStatus = VCM_STATE_TRANSITIONS[action];
  const now = new Date().toISOString();

  if (row.sla_deadline && (row.sla_deadline as string) < now && !row.sla_breached) {
    await c.env.DB.prepare(`UPDATE oe_vcm_projects SET sla_breached = 1, updated_at = ? WHERE id = ?`)
      .bind(now, id).run();
  }

  const extra: string[] = [];
  const eb: (string | number | null)[] = [];

  if (body.vvb_name) { extra.push('vvb_name = ?'); eb.push(body.vvb_name); }
  if (body.vvb_accreditation_ref) { extra.push('vvb_accreditation_ref = ?'); eb.push(body.vvb_accreditation_ref); }
  if (body.registry_project_id) { extra.push('registry_project_id = ?'); eb.push(body.registry_project_id); }
  if (body.crediting_period_start) { extra.push('crediting_period_start = ?'); eb.push(body.crediting_period_start); }
  if (body.crediting_period_end) { extra.push('crediting_period_end = ?'); eb.push(body.crediting_period_end); }
  if (body.verification_ref) { extra.push('verification_ref = ?'); eb.push(body.verification_ref); }
  if (body.credits_issued_tco2e != null) { extra.push('credits_issued_tco2e = ?'); eb.push(body.credits_issued_tco2e); }

  if (action === 'submit_to_vvb') {
    extra.push('validation_submitted_at = ?');
    eb.push(now);
  }
  if (action === 'complete_validation') {
    extra.push('validation_completed_at = ?');
    eb.push(now);
  }
  if (action === 'register_project') {
    extra.push('registered_at = ?');
    eb.push(now);
  }
  if (action === 'complete_verification') {
    extra.push('verification_completed_at = ?');
    eb.push(now);
  }

  const setClause = ['chain_status = ?', 'actor_id = ?', 'reason = ?', 'updated_at = ?', ...extra].join(', ');
  await c.env.DB
    .prepare(`UPDATE oe_vcm_projects SET ${setClause} WHERE id = ?`)
    .bind(nextStatus, user.id, reason ?? null, now, ...eb, id)
    .run();

  // ─── AI PDD generation (generate_ai_sections) ──────────────────────────────
  if (action === 'generate_ai_sections') {
    try {
      const updatedRow = await c.env.DB
        .prepare(`SELECT * FROM oe_vcm_projects WHERE id = ?`)
        .bind(id).first<Record<string, unknown>>();

      const genInput: PddGenerationInput = {
        projectName: (updatedRow?.project_name as string) ?? (row.project_name as string) ?? 'Unknown Project',
        technology: (updatedRow?.technology as string) ?? (row.technology as string) ?? 'Solar PV',
        installedCapacityKw: (updatedRow?.installed_capacity_kw as number) ?? (row.installed_capacity_kw as number) ?? 0,
        methodology: (updatedRow?.methodology as string) ?? (row.methodology as string) ?? '',
        registryStandard: (updatedRow?.registry_standard as string) ?? (row.registry_standard as string) ?? '',
        locationDescription: (updatedRow?.location_description as string) ?? (row.location_description as string) ?? 'South Africa',
        gpsLat: (updatedRow?.gps_lat as number) ?? (row.gps_lat as number) ?? -28.5,
        gpsLng: (updatedRow?.gps_lng as number) ?? (row.gps_lng as number) ?? 24.7,
        reippppBidRef: (updatedRow?.reipppp_bid_ref as string | null) ?? (row.reipppp_bid_ref as string | null) ?? null,
        nersaLicenceRef: (updatedRow?.nersa_licence_ref as string | null) ?? (row.nersa_licence_ref as string | null) ?? null,
        dffeDggef: (updatedRow?.dffe_dggef_tco2e_per_mwh as number) ?? (row.dffe_dggef_tco2e_per_mwh as number) ?? 0.942,
        creditingPeriodYears: 10,
      };

      const sectionsToGenerate: PddSectionCode[] = [
        'S1_description', 'S3_er_calc', 'S4_monitoring', 'S6_sdg',
      ];

      for (const sectionCode of sectionsToGenerate) {
        try {
          const result = await generatePddSection(sectionCode, genInput, c.env);
          const sectionId = crypto.randomUUID();
          const sectionNow = new Date().toISOString();
          await c.env.DB
            .prepare(`INSERT INTO oe_vcm_pdd_sections
              (id, project_id, section_code, content_md, data_inputs, generated_by, human_reviewed, created_at, updated_at)
              VALUES (?,?,?,?,?,?,0,?,?)`)
            .bind(
              sectionId, id, result.sectionCode,
              result.contentMd,
              JSON.stringify(result.dataInputs),
              'workers_ai',
              sectionNow, sectionNow,
            ).run();
        } catch {
          // Section generation error — continue with remaining sections
        }
      }
    } catch {
      // AI generation block failed — do not fail the whole request
    }
  }

  // ─── Regulator inbox ────────────────────────────────────────────────────────
  if (vcmCrossesIntoRegulator(action, row.vcm_tier as VcmTier)) {
    await c.env.DB
      .prepare(`INSERT INTO regulator_inbox (id,entity_type,entity_id,event_type,summary,participant_id,created_at)
                VALUES (?,?,?,?,?,?,?)`)
      .bind(
        crypto.randomUUID(), 'vcm_project', id,
        `vcm_${action}`,
        `VCM project ${action.replace(/_/g, ' ')} — ${row.vcm_tier} — ${row.project_name ?? id}`,
        row.participant_id, now,
      ).run().catch(() => {});
    await c.env.DB
      .prepare(`UPDATE oe_vcm_projects SET regulator_notified = 1, updated_at = ? WHERE id = ?`)
      .bind(now, id).run();
  }

  await fireCascade({
    event: `vcm_project_${action}` as EventType,
    actor_id: user.id, entity_type: 'vcm_project', entity_id: id,
    data: { action, from_status: currentStatus, to_status: nextStatus, vcm_tier: row.vcm_tier },
    env: c.env,
  }).catch(() => {});

  const updated = await c.env.DB
    .prepare(`SELECT * FROM oe_vcm_projects WHERE id = ?`)
    .bind(id).first<Record<string, unknown>>();
  return c.json({ success: true, data: updated });
});

// ─── POST /sla-sweep ──────────────────────────────────────────────────────────
app.post('/sla-sweep', async (c) => {
  const user = getCurrentUser(c);
  if (!['admin', 'support'].includes(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const result = await vcmProjectSlaSweep(c.env);
  return c.json({ success: true, data: result });
});

export default app;
