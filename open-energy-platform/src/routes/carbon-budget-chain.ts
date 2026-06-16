// ═══════════════════════════════════════════════════════════════════════════════
// W226 — Carbon Budget Management & Carbon Tax Compliance
// Carbon Tax Act Phase 2 (2026): 15% combustion, 10% fugitive offset allowances
// SARS Carbon Tax Account (CTA) + DFFE COAS + eFiling workflow
// Routes: GET /phase2-calculator, GET /, GET /:id, POST /, POST /:id/action, POST /sla-sweep
// ═══════════════════════════════════════════════════════════════════════════════

import { Hono } from 'hono';
import type { HonoEnv } from '../utils/types';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { fireCascade } from '../utils/cascade';
import type { EventType } from '../utils/cascade';
import { badEnum } from '../utils/validation';
import {
  CbStatus, CbAction, CbTier,
  deriveCbSla, CB_HARD_TERMINALS,
  CB_VALID_TRANSITIONS, CB_STATE_TRANSITIONS,
  cbCrossesIntoRegulator, cbSlaBreachCrossesIntoRegulator,
} from '../utils/carbon-budget-spec';

const app = new Hono<HonoEnv>();

const WRITE_ROLES = ['admin', 'carbon_fund', 'ipp_developer', 'support'];

const CB_TAX_RATE_ZAR = 236; // ZAR/tCO2e — Carbon Tax Act Phase 2 (2026)

// ─── Phase 2 Calculator (public — no auth) ────────────────────────────────────
app.get('/phase2-calculator', async (c) => {
  const combustionStr = c.req.query('scope1_combustion_tco2e');
  if (!combustionStr) {
    return c.json({ success: false, error: 'scope1_combustion_tco2e is required' }, 400);
  }

  const scope1_combustion_tco2e = parseFloat(combustionStr);
  const scope1_fugitive_tco2e = parseFloat(c.req.query('scope1_fugitive_tco2e') ?? '0') || 0;
  const scope2_grid_tco2e = parseFloat(c.req.query('scope2_grid_tco2e') ?? '0') || 0;
  const credits_available_tco2e = parseFloat(c.req.query('credits_available_tco2e') ?? '0') || 0;
  const carbon_tax_rate_zar = parseFloat(c.req.query('carbon_tax_rate_zar') ?? String(CB_TAX_RATE_ZAR)) || CB_TAX_RATE_ZAR;

  if (isNaN(scope1_combustion_tco2e)) {
    return c.json({ success: false, error: 'scope1_combustion_tco2e must be a valid number' }, 400);
  }

  const gross_tco2e = scope1_combustion_tco2e + scope1_fugitive_tco2e + scope2_grid_tco2e;
  const max_combustion_offset_tco2e = scope1_combustion_tco2e * 0.15;
  const max_fugitive_offset_tco2e = scope1_fugitive_tco2e * 0.10;
  const max_total_offset_tco2e = max_combustion_offset_tco2e + max_fugitive_offset_tco2e;
  const credits_to_apply_tco2e = Math.min(credits_available_tco2e, max_total_offset_tco2e);
  const tax_before_offset_zar = gross_tco2e * carbon_tax_rate_zar;
  const tax_after_offset_zar = Math.max(0, gross_tco2e - credits_to_apply_tco2e) * carbon_tax_rate_zar;
  const tax_saving_zar = tax_before_offset_zar - tax_after_offset_zar;

  return c.json({
    success: true,
    data: {
      gross_tco2e,
      max_combustion_offset_tco2e,
      max_fugitive_offset_tco2e,
      max_total_offset_tco2e,
      credits_to_apply_tco2e,
      tax_before_offset_zar,
      tax_after_offset_zar,
      tax_saving_zar,
    },
  });
});

// Apply auth middleware to all remaining routes
app.use('*', authMiddleware);

// ─── SLA sweep ────────────────────────────────────────────────────────────────
export async function carbonBudgetSlaSweep(env: any) {
  const now = new Date().toISOString();
  const overdue = await (env.DB as D1Database)
    .prepare(`SELECT * FROM oe_carbon_budget_registrations
              WHERE sla_breached = 0 AND sla_deadline < ? AND chain_status NOT IN ('final','appeal')`)
    .bind(now)
    .all<Record<string, unknown>>();

  for (const row of overdue.results ?? []) {
    await (env.DB as D1Database)
      .prepare(`UPDATE oe_carbon_budget_registrations SET sla_breached = 1, updated_at = ? WHERE id = ?`)
      .bind(now, row.id).run();

    if (cbSlaBreachCrossesIntoRegulator(row.cb_tier as CbTier)) {
      await (env.DB as D1Database)
        .prepare(`INSERT INTO regulator_inbox (id,entity_type,entity_id,event_type,summary,participant_id,created_at)
                  VALUES (?,?,?,?,?,?,?)`)
        .bind(
          crypto.randomUUID(), 'carbon_budget', row.id,
          'carbon_budget_sla_breach',
          `Carbon budget SLA breached — ${row.cb_tier} — ${(row.facility_name as string) ?? (row.id as string).slice(0, 8)} — sector ${(row.sector as string) ?? '?'} — year ${(row.reporting_year as string) ?? '?'}`,
          row.participant_id, now,
        ).run().catch(() => {});
    }

    await fireCascade({
      event: 'carbon_budget_sla_breach' as EventType,
      actor_id: 'system', entity_type: 'carbon_budget', entity_id: row.id as string,
      data: { cb_tier: row.cb_tier, facility_name: row.facility_name, reporting_year: row.reporting_year },
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
    .prepare(`SELECT * FROM oe_carbon_budget_registrations WHERE participant_id = ? ORDER BY created_at DESC`)
    .bind(resolved)
    .all<Record<string, unknown>>();

  const all = rows.results ?? [];
  const kpis = {
    total: all.length,
    in_progress: all.filter(r => !['final', 'appeal'].includes(r.chain_status as string)).length,
    efiling_ready: all.filter(r => r.chain_status === 'efiling_ready').length,
    submitted: all.filter(r => r.chain_status === 'sars_submitted').length,
    accepted: all.filter(r => r.chain_status === 'accepted').length,
    sla_breached: all.filter(r => r.sla_breached).length,
  };

  return c.json({ success: true, data: all, kpis });
});

// ─── GET /:id ─────────────────────────────────────────────────────────────────
app.get('/:id', async (c) => {
  const user = getCurrentUser(c);
  const id = c.req.param('id');
  const row = await c.env.DB
    .prepare(`SELECT * FROM oe_carbon_budget_registrations WHERE id = ?`)
    .bind(id).first<Record<string, unknown>>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const isAdmin = ['admin', 'carbon_fund', 'support'].includes(user.role);
  if (!isAdmin && row.participant_id !== user.id) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const timeline = await c.env.DB
    .prepare(`SELECT * FROM audit_events WHERE entity_type = 'carbon_budget' AND entity_id = ? ORDER BY created_at ASC`)
    .bind(id).all<Record<string, unknown>>();

  const obligations = await c.env.DB
    .prepare(`SELECT * FROM oe_carbon_budget_obligations WHERE registration_id = ? ORDER BY due_date`)
    .bind(id).all<Record<string, unknown>>();

  return c.json({
    success: true,
    data: row,
    timeline: timeline.results ?? [],
    obligations: obligations.results ?? [],
  });
});

// ─── POST / ──────────────────────────────────────────────────────────────────
app.post('/', async (c) => {
  const user = getCurrentUser(c);
  if (!WRITE_ROLES.includes(user.role)) return c.json({ success: false, error: 'Forbidden' }, 403);

  const body = await c.req.json<{
    cb_tier?: CbTier;
    facility_name?: string;
    sector?: string;
    annual_threshold_tco2e?: number;
    participant_id?: string;
    reporting_year?: number;
    filing_deadline?: string;
    reason?: string;
  }>();

  if (!body.cb_tier) return c.json({ success: false, error: 'cb_tier is required' }, 400);
  if (!body.facility_name) return c.json({ success: false, error: 'facility_name is required' }, 400);
  if (!body.sector) return c.json({ success: false, error: 'sector is required' }, 400);
  if (body.annual_threshold_tco2e == null) return c.json({ success: false, error: 'annual_threshold_tco2e is required' }, 400);

  const cbTierErr = badEnum('cb_tier', body.cb_tier, ['small', 'medium', 'large', 'major']);
  if (cbTierErr) return c.json({ success: false, error: cbTierErr }, 400);

  const sectorErr = badEnum('sector', body.sector, ['electricity', 'mining', 'manufacturing', 'transport', 'construction', 'waste', 'agriculture', 'other']);
  if (sectorErr) return c.json({ success: false, error: sectorErr }, 400);

  const isAdmin = ['admin', 'carbon_fund', 'support'].includes(user.role);
  const participantId = isAdmin && body.participant_id ? body.participant_id : user.id;
  const tier = body.cb_tier;
  const reporting_year = body.reporting_year ?? new Date().getFullYear();

  const now = new Date().toISOString();
  const slaDays = deriveCbSla(tier);
  const slaDeadline = new Date(Date.now() + slaDays * 86400000).toISOString();
  const id = crypto.randomUUID();

  await c.env.DB
    .prepare(`INSERT INTO oe_carbon_budget_registrations
      (id, participant_id, cb_tier, facility_name, sector, annual_threshold_tco2e,
       reporting_year, filing_deadline,
       chain_status, sla_deadline, sla_breached, regulator_notified, actor_id, reason, created_at, updated_at)
      VALUES (?,?,?,?,?,?,?,?,'draft',?,0,0,?,?,?,?)`)
    .bind(
      id, participantId, tier,
      body.facility_name, body.sector, body.annual_threshold_tco2e,
      reporting_year, body.filing_deadline ?? null,
      slaDeadline, user.id, body.reason ?? null, now, now,
    ).run();

  await fireCascade({
    event: 'carbon_budget_created' as EventType,
    actor_id: user.id, entity_type: 'carbon_budget', entity_id: id,
    data: { cb_tier: tier, facility_name: body.facility_name, sector: body.sector, reporting_year },
    env: c.env,
  }).catch(() => {});

  const row = await c.env.DB
    .prepare(`SELECT * FROM oe_carbon_budget_registrations WHERE id = ?`)
    .bind(id).first<Record<string, unknown>>();
  return c.json({ success: true, data: row }, 201);
});

// ─── POST /:id/action ─────────────────────────────────────────────────────────
app.post('/:id/action', async (c) => {
  const user = getCurrentUser(c);
  if (!WRITE_ROLES.includes(user.role)) return c.json({ success: false, error: 'Forbidden' }, 403);

  const id = c.req.param('id');
  const body = await c.req.json<{
    action: CbAction;
    reason?: string;
    scope1_combustion_tco2e?: number;
    scope1_fugitive_tco2e?: number;
    scope1_process_tco2e?: number;
    scope2_grid_tco2e?: number;
    credits_applied_tco2e?: number;
    coas_retirement_refs?: string;
    cbt_account_ref?: string;
  }>();
  const { action, reason } = body;

  const row = await c.env.DB
    .prepare(`SELECT * FROM oe_carbon_budget_registrations WHERE id = ?`)
    .bind(id).first<Record<string, unknown>>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const isAdmin = ['admin', 'carbon_fund', 'support'].includes(user.role);
  if (!isAdmin && row.participant_id !== user.id) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const currentStatus = row.chain_status as CbStatus;
  if (CB_HARD_TERMINALS.has(currentStatus)) {
    return c.json({ success: false, error: `Carbon budget in terminal state '${currentStatus}'` }, 422);
  }

  const allowed = CB_VALID_TRANSITIONS[currentStatus];
  if (!allowed.includes(action)) {
    return c.json({ success: false, error: `Action '${action}' not valid from '${currentStatus}'` }, 422);
  }

  const nextStatus = CB_STATE_TRANSITIONS[action];
  const now = new Date().toISOString();

  if (row.sla_deadline && (row.sla_deadline as string) < now && !row.sla_breached) {
    await c.env.DB.prepare(`UPDATE oe_carbon_budget_registrations SET sla_breached = 1, updated_at = ? WHERE id = ?`)
      .bind(now, id).run();
  }

  const extra: string[] = [];
  const eb: (string | number | null)[] = [];

  // Store scope fields when provided
  if (body.scope1_combustion_tco2e != null) { extra.push('scope1_combustion_tco2e = ?'); eb.push(body.scope1_combustion_tco2e); }
  if (body.scope1_fugitive_tco2e != null) { extra.push('scope1_fugitive_tco2e = ?'); eb.push(body.scope1_fugitive_tco2e); }
  if (body.scope1_process_tco2e != null) { extra.push('scope1_process_tco2e = ?'); eb.push(body.scope1_process_tco2e); }
  if (body.scope2_grid_tco2e != null) { extra.push('scope2_grid_tco2e = ?'); eb.push(body.scope2_grid_tco2e); }
  if (body.credits_applied_tco2e != null) { extra.push('credits_applied_tco2e = ?'); eb.push(body.credits_applied_tco2e); }
  if (body.coas_retirement_refs != null) { extra.push('coas_retirement_refs = ?'); eb.push(body.coas_retirement_refs); }
  if (body.cbt_account_ref != null) { extra.push('cbt_account_ref = ?'); eb.push(body.cbt_account_ref); }

  // Action-specific computed fields
  if (action === 'calculate_scope') {
    const combustion = body.scope1_combustion_tco2e ?? (row.scope1_combustion_tco2e as number) ?? 0;
    const fugitive = body.scope1_fugitive_tco2e ?? (row.scope1_fugitive_tco2e as number) ?? 0;
    const process = body.scope1_process_tco2e ?? (row.scope1_process_tco2e as number) ?? 0;
    const scope2 = body.scope2_grid_tco2e ?? (row.scope2_grid_tco2e as number) ?? 0;
    const total_gross = combustion + fugitive + process + scope2;
    const tax_liability = total_gross * CB_TAX_RATE_ZAR;
    extra.push('total_gross_tco2e = ?', 'tax_liability_zar = ?');
    eb.push(total_gross, tax_liability);
  }

  if (action === 'compute_allowance') {
    const combustion = body.scope1_combustion_tco2e ?? (row.scope1_combustion_tco2e as number) ?? 0;
    const fugitive = body.scope1_fugitive_tco2e ?? (row.scope1_fugitive_tco2e as number) ?? 0;
    const creditsApplied = body.credits_applied_tco2e ?? (row.credits_applied_tco2e as number) ?? 0;
    const totalGross = (row.total_gross_tco2e as number) ?? 0;
    const maxOffsetAllowance = (combustion * 0.15) + (fugitive * 0.10);
    const taxAfterOffset = Math.max(0, (totalGross - creditsApplied)) * CB_TAX_RATE_ZAR;
    extra.push('max_offset_allowance_tco2e = ?', 'tax_after_offset_zar = ?');
    eb.push(maxOffsetAllowance, taxAfterOffset);
  }

  if (action === 'generate_efiling') {
    extra.push('efiling_ready = ?');
    eb.push(1);
  }

  const setClause = ['chain_status = ?', 'actor_id = ?', 'reason = ?', 'updated_at = ?', ...extra].join(', ');
  await c.env.DB
    .prepare(`UPDATE oe_carbon_budget_registrations SET ${setClause} WHERE id = ?`)
    .bind(nextStatus, user.id, reason ?? null, now, ...eb, id)
    .run();

  if (cbCrossesIntoRegulator(action, row.cb_tier as CbTier)) {
    await c.env.DB
      .prepare(`INSERT INTO regulator_inbox (id,entity_type,entity_id,event_type,summary,participant_id,created_at)
                VALUES (?,?,?,?,?,?,?)`)
      .bind(
        crypto.randomUUID(), 'carbon_budget', id,
        `carbon_budget_${action}`,
        `Carbon budget ${action.replace(/_/g, ' ')} — ${row.cb_tier} — ${(row.facility_name as string) ?? (row.id as string).slice(0, 8)} — sector ${(row.sector as string) ?? '?'} — year ${(row.reporting_year as string) ?? '?'}`,
        row.participant_id, now,
      ).run().catch(() => {});
    await c.env.DB
      .prepare(`UPDATE oe_carbon_budget_registrations SET regulator_notified = 1, updated_at = ? WHERE id = ?`)
      .bind(now, id).run();
  }

  await fireCascade({
    event: `carbon_budget_${action}` as EventType,
    actor_id: user.id, entity_type: 'carbon_budget', entity_id: id,
    data: { action, from_status: currentStatus, to_status: nextStatus, cb_tier: row.cb_tier },
    env: c.env,
  }).catch(() => {});

  const updated = await c.env.DB
    .prepare(`SELECT * FROM oe_carbon_budget_registrations WHERE id = ?`)
    .bind(id).first<Record<string, unknown>>();
  return c.json({ success: true, data: updated });
});

// ─── POST /sla-sweep ──────────────────────────────────────────────────────────
app.post('/sla-sweep', async (c) => {
  const user = getCurrentUser(c);
  if (!['admin', 'support'].includes(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const result = await carbonBudgetSlaSweep(c.env);
  return c.json({ success: true, data: result });
});

export default app;
