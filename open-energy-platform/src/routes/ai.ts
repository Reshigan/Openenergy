// ═══════════════════════════════════════════════════════════════════════════
// AI routes — role-aware analysis + bill optimisation + LOI drafting + deep
// reporting per role. All endpoints are auth-gated and delegate to
// `src/utils/ai.ts` which wraps the Cloudflare Workers AI binding and falls
// back to deterministic heuristics when the binding isn't available.
// ═══════════════════════════════════════════════════════════════════════════

import { Hono } from 'hono';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { HonoEnv, AppError } from '../utils/types';
import { ask, AiIntent } from '../utils/ai';
import { extractBillProfile, buildDeterministicMix } from '../utils/offtaker-heuristics';
import { fireCascade } from '../utils/cascade';
import { assertSameTenantParticipant } from '../utils/tenant';

const ai = new Hono<HonoEnv>();
ai.use('*', authMiddleware);

// ──────────────────────────────────────────────────────────────────────────
// POST /ai/ask — Generic role-aware copilot endpoint
// Body: { intent?: AiIntent, prompt: string, context?: object }
// ──────────────────────────────────────────────────────────────────────────
ai.post('/ask', async (c) => {
  const user = getCurrentUser(c);
  const body = (await c.req.json().catch(() => ({}))) as {
    intent?: AiIntent;
    prompt?: string;
    context?: Record<string, unknown>;
    max_tokens?: number;
  };
  if (!body.prompt || typeof body.prompt !== 'string') {
    return c.json({ success: false, error: 'prompt is required' }, 400);
  }
  const result = await ask(c.env, {
    intent: body.intent || 'generic.ask',
    role: user.role,
    prompt: body.prompt,
    context: body.context,
    max_tokens: body.max_tokens,
  });
  return c.json({ success: true, data: result });
});

// ──────────────────────────────────────────────────────────────────────────
// GET /ai/offtaker/bills — List the offtaker's recent uploaded + analysed
// bills so the Bill Upload tab can show history without a separate listing
// endpoint. Returns the latest 20 with parsed ai_result_json.
// ──────────────────────────────────────────────────────────────────────────
ai.get('/offtaker/bills', async (c) => {
  const user = getCurrentUser(c);
  await c.env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS offtaker_bills (
      id TEXT PRIMARY KEY,
      offtaker_id TEXT NOT NULL,
      source TEXT,
      meta_json TEXT,
      ai_result_json TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )`,
  ).run();
  const rows = await c.env.DB.prepare(
    `SELECT id, source, meta_json, ai_result_json, created_at
       FROM offtaker_bills
      WHERE offtaker_id = ?
      ORDER BY created_at DESC
      LIMIT 20`,
  ).bind(user.id).all<{
    id: string;
    source: string | null;
    meta_json: string | null;
    ai_result_json: string | null;
    created_at: string;
  }>();
  const data = (rows.results || []).map((r) => {
    let meta: Record<string, unknown> = {};
    let result: Record<string, unknown> = {};
    try { meta = r.meta_json ? JSON.parse(r.meta_json) : {}; } catch { /* ignore */ }
    try { result = r.ai_result_json ? JSON.parse(r.ai_result_json) : {}; } catch { /* ignore */ }
    return {
      id: r.id,
      source: r.source,
      created_at: r.created_at,
      meta,
      profile: result,
    };
  });
  return c.json({ success: true, data });
});

// ──────────────────────────────────────────────────────────────────────────
// POST /ai/offtaker/bills — Upload a utility bill, return AI-extracted tariff
// profile. Body: { source: 'pdf'|'csv'|'text', content: string, meta?: {} }
// We don't run a PDF parser in the Worker (too heavy) — the client sends
// extracted text; the AI extracts structure. If content is missing we fall
// back to the deterministic heuristic (demo-safe).
// ──────────────────────────────────────────────────────────────────────────
ai.post('/offtaker/bills', async (c) => {
  const user = getCurrentUser(c);
  const body = (await c.req.json().catch(() => ({}))) as {
    source?: string;
    content?: string;
    meta?: Record<string, unknown>;
    annual_kwh?: number;
    avg_tariff?: number;
  };

  // Persist the raw bill upload for audit.
  const billId = crypto.randomUUID();
  await c.env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS offtaker_bills (
      id TEXT PRIMARY KEY,
      offtaker_id TEXT NOT NULL,
      source TEXT,
      meta_json TEXT,
      ai_result_json TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )`,
  ).run();

  const result = await ask(c.env, {
    intent: 'offtaker.bill_analysis',
    role: user.role,
    prompt: `Analyse this electricity bill and return structured JSON with
annual_kwh, peak_pct, standard_pct, offpeak_pct, avg_tariff_zar_per_kwh,
demand_charge_zar_per_kva, and tou_risk ('low'|'medium'|'high').`,
    context: {
      source: body.source || 'text',
      content: (body.content || '').slice(0, 20_000),
      meta: body.meta,
      annual_kwh: body.annual_kwh,
      avg_tariff: body.avg_tariff,
    },
  });

  // Guaranteed structured profile — LLM can (and does) return free-form text.
  // We extract values from the bill content directly and merge AI output over
  // our heuristic so the UI is never blank.
  const heuristic = extractBillProfile(body.content || '', {
    annual_kwh: body.annual_kwh,
    avg_tariff: body.avg_tariff,
  });
  const structured = { ...heuristic, ...(result.structured || {}) };

  await c.env.DB.prepare(
    `INSERT INTO offtaker_bills (id, offtaker_id, source, meta_json, ai_result_json) VALUES (?, ?, ?, ?, ?)`,
  ).bind(
    billId,
    user.id,
    body.source || 'text',
    JSON.stringify(body.meta || {}),
    JSON.stringify(structured),
  ).run();

  return c.json({ success: true, data: { bill_id: billId, ...result, structured } });
});

// ──────────────────────────────────────────────────────────────────────────
// POST /ai/offtaker/optimize — Given the offtaker's most recent bill profile
// (or inline profile), recommend an optimal energy mix across operating,
// under-construction and financial-close projects. Weights: stage, PPA tenor,
// LCoE vs tariff, carbon revenue share, load shape.
// ──────────────────────────────────────────────────────────────────────────
ai.post('/offtaker/optimize', async (c) => {
  const user = getCurrentUser(c);
  const body = (await c.req.json().catch(() => ({}))) as {
    bill_id?: string;
    annual_kwh?: number;
    current_tariff?: number;
    required_mwh?: number;
    horizon_years?: number;
  };

  // Pull the latest bill for this offtaker if not provided.
  let profile: Record<string, unknown> | undefined;
  if (body.bill_id) {
    const row = await c.env.DB.prepare(
      `SELECT ai_result_json FROM offtaker_bills WHERE id = ? AND offtaker_id = ?`,
    ).bind(body.bill_id, user.id).first<{ ai_result_json: string }>();
    if (row?.ai_result_json) {
      try { profile = JSON.parse(row.ai_result_json); } catch { /* ignore */ }
    }
  }
  if (!profile) {
    const row = await c.env.DB.prepare(
      `SELECT ai_result_json FROM offtaker_bills WHERE offtaker_id = ? ORDER BY created_at DESC LIMIT 1`,
    ).bind(user.id).first<{ ai_result_json: string }>();
    if (row?.ai_result_json) {
      try { profile = JSON.parse(row.ai_result_json); } catch { /* ignore */ }
    }
  }

  // Pull the available projects across stages (operating, construction, FC).
  const projects = await c.env.DB.prepare(
    `SELECT id, project_name, technology, capacity_mw, status,
            ppa_price_per_mwh AS ppa_price, ppa_volume_mwh AS ppa_volume,
            ppa_duration_years, developer_id
     FROM ipp_projects
     WHERE status IN ('development','construction','commissioning','commercial_operations')
     ORDER BY CASE status
       WHEN 'commercial_operations' THEN 1
       WHEN 'commissioning' THEN 2
       WHEN 'construction' THEN 3
       WHEN 'development' THEN 4
       ELSE 5 END, capacity_mw DESC
     LIMIT 20`,
  ).all();

  const annualKwh = body.annual_kwh ?? Number(profile?.annual_kwh ?? 1_200_000);
  const requiredMwh = body.required_mwh ?? annualKwh / 1000;
  const currentTariff = body.current_tariff ?? Number(profile?.avg_tariff_zar_per_kwh ?? 2.15);

  const result = await ask(c.env, {
    intent: 'offtaker.mix_recommendation',
    role: user.role,
    prompt: `Recommend an optimal energy mix across these projects to cover
${requiredMwh.toLocaleString()} MWh/year while maximising savings vs the current
R${currentTariff}/kWh tariff. Weight by stage, PPA tenor, LCoE and carbon revenue
sharing. Return JSON: { mix:[{project_id,project_name,share_pct,mwh_per_year,blended_price,rationale}], savings_pct, carbon_tco2e, warnings }.`,
    context: {
      profile,
      required_mwh: requiredMwh,
      current_tariff: currentTariff,
      horizon_years: body.horizon_years ?? 15,
      projects: projects.results || [],
    },
  });

  // Guaranteed structured mix — when the LLM returns prose instead of JSON
  // we compute a deterministic mix from the project list so the UI is never
  // empty. If the LLM does return a valid mix, we prefer that.
  const projectList = (projects.results || []) as Array<Record<string, unknown>>;
  const fallbackMix = buildDeterministicMix(projectList, requiredMwh, currentTariff);
  const aiMix = Array.isArray((result.structured as { mix?: unknown })?.mix)
    ? ((result.structured as { mix?: unknown[] }).mix as unknown[])
    : [];
  const structured =
    aiMix.length > 0
      ? (result.structured as Record<string, unknown>)
      : fallbackMix;

  return c.json({
    success: true,
    data: {
      ...result,
      structured,
      projects: projectList,
    },
  });
});

// ──────────────────────────────────────────────────────────────────────────
// POST /ai/offtaker/loi — Draft a Letter of Intent for a selected mix.
// Persists to `loi_drafts` + fires `contract.created` cascade so the IPP sees
// the LOI in their action queue immediately.
// Body: { mix: [{project_id, share_pct, mwh_per_year, blended_price}], horizon_years, notes }
// ──────────────────────────────────────────────────────────────────────────
ai.post('/offtaker/loi', async (c) => {
  const user = getCurrentUser(c);
  const body = (await c.req.json().catch(() => ({}))) as {
    mix?: Array<{ project_id: string; share_pct: number; mwh_per_year: number; blended_price?: number | null }>;
    horizon_years?: number;
    notes?: string;
  };
  if (!body.mix || !Array.isArray(body.mix) || body.mix.length === 0) {
    return c.json({ success: false, error: 'mix is required' }, 400);
  }

  await c.env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS loi_drafts (
      id TEXT PRIMARY KEY,
      from_participant_id TEXT NOT NULL,
      to_participant_id TEXT,
      project_id TEXT,
      mix_json TEXT NOT NULL,
      body_md TEXT,
      status TEXT DEFAULT 'drafted' CHECK (status IN ('drafted','sent','signed','withdrawn','expired')),
      horizon_years INTEGER,
      annual_mwh REAL,
      blended_price REAL,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )`,
  ).run();

  const drafts: Array<Record<string, unknown>> = [];

  for (const item of body.mix) {
    const project = await c.env.DB.prepare(
      `SELECT p.id, p.project_name, p.technology, p.capacity_mw, p.developer_id,
              part.name AS developer_name, part.email AS developer_email
       FROM ipp_projects p
       LEFT JOIN participants part ON part.id = p.developer_id
       WHERE p.id = ?`,
    ).bind(item.project_id).first() as any;
    if (!project) continue;

    // Tenant isolation: skip projects whose developer is in a different tenant.
    // Admin callers bypass (they can issue LOIs cross-tenant).
    // Only swallow AppError (cross-tenant) — transient DB errors must surface
    // so the caller sees a 500 rather than silently losing projects in the mix.
    if (project.developer_id) {
      try {
        await assertSameTenantParticipant(c, project.developer_id as string);
      } catch (e) {
        if (e instanceof AppError) continue;
        throw e;
      }
    }

    // Price may be withheld (an operating project on a signed PPA surfaces as
    // "contact seller"): draft the LOI with price-to-be-negotiated rather than
    // emitting "R null/MWh".
    const hasPrice = typeof item.blended_price === 'number' && Number.isFinite(item.blended_price);
    const priceClause = hasPrice
      ? `at an indicative blended price of R${item.blended_price}/MWh`
      : 'at a blended price to be negotiated';

    const aiResult = await ask(c.env, {
      intent: 'offtaker.loi_draft',
      role: user.role,
      prompt: `Draft a Letter of Intent from ${user.name} to ${project.developer_name || 'the IPP'}
for ${item.mwh_per_year.toLocaleString()} MWh/year of ${project.technology} energy
${priceClause} over ${body.horizon_years ?? 15} years.
Include conditionality on financial close, non-binding nature, and a 30-day response window.`,
      context: { project, item, notes: body.notes },
      max_tokens: 900,
    });

    const loiId = crypto.randomUUID();
    await c.env.DB.prepare(
      `INSERT INTO loi_drafts (id, from_participant_id, to_participant_id, project_id, mix_json, body_md, status, horizon_years, annual_mwh, blended_price)
       VALUES (?, ?, ?, ?, ?, ?, 'drafted', ?, ?, ?)`,
    ).bind(
      loiId,
      user.id,
      project.developer_id,
      project.id,
      JSON.stringify(item),
      aiResult.text,
      body.horizon_years ?? 15,
      item.mwh_per_year,
      item.blended_price ?? null,
    ).run();

    // Fire a contract.created cascade so the IPP sees this as an action item.
    await fireCascade({
      event: 'contract.created',
      actor_id: user.id,
      entity_type: 'loi_drafts',
      entity_id: loiId,
      data: {
        contract_type: 'LOI',
        project_id: project.id,
        project_name: project.project_name,
        counterparty_id: project.developer_id,
        creator_id: user.id,
        annual_mwh: item.mwh_per_year,
        blended_price: item.blended_price ?? null,
        horizon_years: body.horizon_years ?? 15,
      },
      env: c.env,
    });

    // And enqueue an explicit "Review LOI" action for the IPP.
    await c.env.DB.prepare(
      `INSERT INTO action_queue (id, type, priority, actor_id, assignee_id, entity_type, entity_id, title, description, status)
       VALUES (?, 'loi_review', 'high', ?, ?, 'loi_drafts', ?, ?, ?, 'pending')`,
    ).bind(
      crypto.randomUUID(),
      user.id,
      project.developer_id,
      loiId,
      `LOI received for ${project.project_name}`,
      `${user.name} has sent a Letter of Intent covering ${Math.round(item.mwh_per_year).toLocaleString()} MWh/year ${hasPrice ? `at ~R${item.blended_price}/MWh` : 'at a price to be negotiated'} over ${body.horizon_years ?? 15} years.`,
    ).run();

    drafts.push({ loi_id: loiId, project_id: project.id, project_name: project.project_name, body_md: aiResult.text, fallback: aiResult.fallback });
  }

  return c.json({ success: true, data: { drafts } });
});

// ──────────────────────────────────────────────────────────────────────────
// GET /ai/reports/:role — Deep AI-narrated report scaffolding for one role.
// Collects the participant's most relevant figures and asks the AI for an
// executive summary + risk flags + recommendations. Called by the Reports UI.
// Filters: ?period=30d|90d|12m|ytd  &entity_id=... (optional scope)
// ──────────────────────────────────────────────────────────────────────────
ai.get('/reports/:role', async (c) => {
  const user = getCurrentUser(c);
  const reportRole = c.req.param('role');
  const period = c.req.query('period') || '90d';

  // Admin + support can introspect any role; everyone else is locked to their own.
  // Keep this in sync with the ADMIN_LIKE set in src/routes/reports.ts.
  if (user.role !== 'admin' && user.role !== 'support' && user.role !== reportRole) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const data = await collectRoleReport(c.env, reportRole, user.id, period);

  const intent: AiIntent = INTENT_FOR_ROLE[reportRole] || 'generic.ask';
  const narrative = await ask(c.env, {
    intent,
    role: user.role,
    prompt: `Produce an executive summary report (5-7 short bullets), a risk flag
section (3-5 items), and a recommendations section (3 items) for a ${reportRole}
in South Africa over the last ${period}. Return plain markdown.`,
    context: data,
    max_tokens: 900,
  });

  return c.json({ success: true, data: { period, role: reportRole, kpis: data, narrative } });
});

const INTENT_FOR_ROLE: Record<string, AiIntent> = {
  offtaker: 'offtaker.mix_recommendation',
  ipp_developer: 'ipp.project_simulation',
  carbon_fund: 'carbon.nav_calc',
  lender: 'lender.cashflow_forecast',
  trader: 'trader.order_recommendation',
  regulator: 'regulator.compliance_narrative',
  grid_operator: 'generic.ask',
  admin: 'generic.ask',
};

// ──────────────────────────────────────────────────────────────────────────
// Role-specific KPI collectors. Intentionally defensive: every query is
// wrapped + a sensible default is returned if the table or column is missing,
// so the Reports UI never blank-fails.
// ──────────────────────────────────────────────────────────────────────────
async function collectRoleReport(
  env: HonoEnv['Bindings'],
  role: string,
  userId: string,
  period: string,
): Promise<Record<string, unknown>> {
  const since = periodToIso(period);
  const safe = async <T, F = T>(p: Promise<T>, fallback: F): Promise<T | F> => {
    try { return await p; } catch { return fallback; }
  };

  const common = {
    role,
    period,
    since,
    actions_pending: await safe(
      env.DB.prepare(
        `SELECT COUNT(*) AS c FROM action_queue WHERE assignee_id = ? AND status = 'pending'`,
      ).bind(userId).first<{ c: number }>(),
      { c: 0 },
    ),
  };

  switch (role) {
    case 'admin': {
      const [participants, contracts, trades, invoices] = await Promise.all([
        safe(env.DB.prepare(`SELECT COUNT(*) AS c FROM participants`).first<{ c: number }>(), { c: 0 }),
        safe(env.DB.prepare(`SELECT COUNT(*) AS c FROM contract_documents`).first<{ c: number }>(), { c: 0 }),
        safe(env.DB.prepare(`SELECT COUNT(*) AS c, SUM(matched_volume_mwh * matched_price) AS gmv FROM trade_matches WHERE matched_at > ?`).bind(since).first<{ c: number; gmv: number }>(), { c: 0, gmv: 0 }),
        safe(env.DB.prepare(`SELECT COUNT(*) AS c, SUM(total_amount) AS total FROM invoices WHERE created_at > ?`).bind(since).first<{ c: number; total: number }>(), { c: 0, total: 0 }),
      ]);
      return { ...common, participants, contracts, trades, invoices };
    }

    case 'trader': {
      const orders = await safe(
        env.DB.prepare(
          `SELECT COUNT(*) AS c, SUM(volume_mwh) AS vol FROM trade_orders WHERE participant_id = ? AND created_at > ?`,
        ).bind(userId, since).first<{ c: number; vol: number }>(),
        { c: 0, vol: 0 },
      );
      // trade_matches has no participant_id; JOIN via trade_orders to filter.
      const matches = await safe(
        env.DB.prepare(
          `SELECT COUNT(*) AS c, SUM(tm.matched_volume_mwh * tm.matched_price) AS value
             FROM trade_matches tm
             JOIN trade_orders bo ON tm.buy_order_id = bo.id
             JOIN trade_orders so ON tm.sell_order_id = so.id
            WHERE (bo.participant_id = ? OR so.participant_id = ?)
              AND tm.matched_at > ?`,
        ).bind(userId, userId, since).first<{ c: number; value: number }>(),
        { c: 0, value: 0 },
      );
      return { ...common, orders, matches };
    }

    case 'ipp_developer': {
      const projects = await safe(
        env.DB.prepare(
          `SELECT id, project_name, status, capacity_mw, technology FROM ipp_projects WHERE developer_id = ? ORDER BY updated_at DESC LIMIT 20`,
        ).bind(userId).all(),
        { results: [] },
      );
      const milestones = await safe(
        env.DB.prepare(
          `SELECT m.id, m.milestone_name, m.status, m.target_date, p.project_name
           FROM project_milestones m
           JOIN ipp_projects p ON p.id = m.project_id
           WHERE p.developer_id = ? ORDER BY m.target_date ASC LIMIT 30`,
        ).bind(userId).all(),
        { results: [] },
      );
      return { ...common, projects: projects.results || [], milestones: milestones.results || [] };
    }

    case 'offtaker': {
      const bills = await safe(
        env.DB.prepare(
          `SELECT id, created_at, ai_result_json FROM offtaker_bills WHERE offtaker_id = ? ORDER BY created_at DESC LIMIT 3`,
        ).bind(userId).all(),
        { results: [] },
      );
      const lois = await safe(
        env.DB.prepare(
          `SELECT id, status, annual_mwh, blended_price, created_at FROM loi_drafts WHERE from_participant_id = ? ORDER BY created_at DESC LIMIT 10`,
        ).bind(userId).all(),
        { results: [] },
      );
      const invoices = await safe(
        env.DB.prepare(
          `SELECT COUNT(*) AS c, SUM(total_amount) AS total FROM invoices WHERE to_participant_id = ? AND created_at > ?`,
        ).bind(userId, since).first<{ c: number; total: number }>(),
        { c: 0, total: 0 },
      );
      return { ...common, bills: bills.results || [], lois: lois.results || [], invoices };
    }

    case 'carbon_fund': {
      const retirements = await safe(
        env.DB.prepare(
          `SELECT COUNT(*) AS c, SUM(quantity) AS q FROM carbon_retirements WHERE created_at > ?`,
        ).bind(since).first<{ c: number; q: number }>(),
        { c: 0, q: 0 },
      );
      // carbon_credits is not a migration-managed table; report from the
      // canonical schema: carbon_holdings JOIN carbon_projects for methodology.
      const holdings = await safe(
        env.DB.prepare(
          `SELECT cp.methodology, SUM(ch.quantity) AS q
             FROM carbon_holdings ch
             JOIN carbon_projects cp ON cp.id = ch.project_id
            GROUP BY cp.methodology`,
        ).all(),
        { results: [] },
      );
      return { ...common, retirements, holdings: holdings.results || [] };
    }

    case 'lender': {
      const disbursements = await safe(
        env.DB.prepare(
          `SELECT COUNT(*) AS c, SUM(requested_amount) AS total FROM project_disbursements WHERE created_at > ?`,
        ).bind(since).first<{ c: number; total: number }>(),
        { c: 0, total: 0 },
      );
      const projects = await safe(
        env.DB.prepare(
          `SELECT id, project_name, status, capacity_mw FROM ipp_projects ORDER BY updated_at DESC LIMIT 10`,
        ).all(),
        { results: [] },
      );
      return { ...common, disbursements, projects: projects.results || [] };
    }

    case 'grid_operator': {
      const connections = await safe(
        env.DB.prepare(`SELECT COUNT(*) AS c FROM grid_connections`).first<{ c: number }>(),
        { c: 0 },
      );
      const nominations = await safe(
        env.DB.prepare(
          `SELECT COUNT(*) AS c, SUM(nominated_mwh) AS v FROM ona_nominations WHERE created_at > ?`,
        ).bind(since).first<{ c: number; v: number }>(),
        { c: 0, v: 0 },
      );
      return { ...common, connections, nominations };
    }

    case 'regulator': {
      const audit = await safe(
        env.DB.prepare(
          `SELECT action AS event_type, COUNT(*) AS c FROM audit_logs WHERE created_at > ? GROUP BY action ORDER BY c DESC LIMIT 20`,
        ).bind(since).all(),
        { results: [] },
      );
      return { ...common, audit: audit.results || [] };
    }

    default:
      return common;
  }
}

function periodToIso(period: string): string {
  const now = new Date();
  const d = new Date(now);
  switch (period) {
    case '30d': d.setDate(d.getDate() - 30); break;
    case '90d': d.setDate(d.getDate() - 90); break;
    case '12m': d.setFullYear(d.getFullYear() - 1); break;
    case 'ytd': d.setMonth(0, 1); d.setHours(0, 0, 0, 0); break;
    default: d.setDate(d.getDate() - 90);
  }
  return d.toISOString();
}

// ──────────────────────────────────────────────────────────────────────────
// POST /ai/schedule/explain-criticality — Per-project: explain why each
// critical-path activity drives the finish date. Inline assist for the
// ScheduleTab. Returns a short paragraph + a per-activity reason hint.
// Body: { project_id: string }
// ──────────────────────────────────────────────────────────────────────────
ai.post('/schedule/explain-criticality', async (c) => {
  const body = await c.req.json<{ project_id?: string }>().catch(() => ({} as any));
  if (!body?.project_id) return c.json({ success: false, error: 'project_id required' }, 400);
  const user = getCurrentUser(c);

  const rows = await c.env.DB.prepare(`
    SELECT id, wbs_code, name, duration_days, early_start, early_finish, total_float, is_critical
    FROM project_activities WHERE project_id = ? AND is_critical = 1 AND type != 'summary'
    ORDER BY early_start ASC, sort_order ASC
  `).bind(body.project_id).all();
  const criticals = (rows.results || []) as any[];

  if (!criticals.length) {
    return c.json({ success: true, data: { summary: 'No critical activities found. Recompute the schedule first.', activities: [] } });
  }

  const longestDur = criticals.reduce((m, r) => r.duration_days > m ? r.duration_days : m, 0);
  const summary = `${criticals.length} critical activities form the longest path. Slipping any of them slips commercial operation by the same number of working days. The longest single critical activity is ${longestDur} working days; compressing it is the highest-leverage move.`;

  const reasoned = criticals.map((r) => ({
    id: r.id,
    wbs_code: r.wbs_code,
    name: r.name,
    reason:
      r.duration_days >= longestDur * 0.7
        ? 'Long-duration critical activity — compress or split this to shorten the schedule.'
        : r.total_float === 0
          ? 'Zero-float activity — any delay propagates directly to project finish.'
          : 'On the longest path — guard predecessor handoffs.',
    duration_days: r.duration_days,
    early_start: r.early_start,
    early_finish: r.early_finish,
  }));

  await fireCascade({
    event: 'ai.classification_logged', actor_id: user.id,
    entity_type: 'project', entity_id: body.project_id,
    data: { intent: 'schedule.explain_criticality', n: criticals.length },
    env: c.env,
  }).catch(() => { /* non-fatal */ });

  return c.json({ success: true, data: { summary, activities: reasoned } });
});

// ──────────────────────────────────────────────────────────────────────────
// POST /ai/schedule/forecast-slip — Heuristic slip forecast vs current
// baseline. Reads percent_complete against the planned ratio at status
// date. Returns expected slip in working days + the top-3 worst offenders.
// Body: { project_id: string, status_date?: string }
// ──────────────────────────────────────────────────────────────────────────
ai.post('/schedule/forecast-slip', async (c) => {
  const body = await c.req.json<{ project_id?: string; status_date?: string }>().catch(() => ({} as any));
  if (!body?.project_id) return c.json({ success: false, error: 'project_id required' }, 400);

  const rows = await c.env.DB.prepare(`
    SELECT id, wbs_code, name, duration_days, planned_start, planned_finish,
           early_start, early_finish, percent_complete, is_critical, total_float
    FROM project_activities
    WHERE project_id = ? AND type = 'task'
  `).bind(body.project_id).all();
  const acts = (rows.results || []) as any[];

  const statusDate = body.status_date || new Date().toISOString().slice(0, 10);
  const offenders: any[] = [];
  let totalSlip = 0;

  for (const a of acts) {
    const start = a.planned_start || a.early_start;
    const finish = a.planned_finish || a.early_finish;
    if (!start || !finish) continue;
    if (start > statusDate) continue; // not started yet
    const totalDur = Math.max(1, Number(a.duration_days || 1));
    const sToStatus = Math.max(0, daysBetweenIso(start, statusDate));
    const eToStatus = Math.min(totalDur, sToStatus);
    const expectedPct = eToStatus / totalDur;
    const actualPct = Math.min(1, Math.max(0, Number(a.percent_complete || 0) / 100));
    const gap = expectedPct - actualPct;
    if (gap > 0.05) {
      const slipDays = Math.round(gap * totalDur);
      offenders.push({
        id: a.id, wbs_code: a.wbs_code, name: a.name,
        slip_days: slipDays, is_critical: !!a.is_critical, total_float: a.total_float,
      });
      if (a.is_critical) totalSlip += slipDays;
    }
  }
  offenders.sort((a, b) => b.slip_days - a.slip_days);
  const top3 = offenders.slice(0, 3);

  const summary = totalSlip === 0
    ? 'No critical-path slip detected at this status date.'
    : `Forecast slip of ${totalSlip} working days to commercial operation, concentrated in ${top3.length} activity${top3.length === 1 ? '' : 'ies'}.`;

  return c.json({ success: true, data: { status_date: statusDate, forecast_slip_days: totalSlip, top_offenders: top3, summary } });
});

function daysBetweenIso(a: string, b: string): number {
  const dA = new Date(a + 'T00:00:00Z').getTime();
  const dB = new Date(b + 'T00:00:00Z').getTime();
  return Math.round((dB - dA) / 86400000);
}

// ──────────────────────────────────────────────────────────────────────────
// POST /ai/risk/explain-var — narrate the top drivers of the latest VaR
// number for a portfolio. Reads the latest risk_var_results row +
// per-factor exposure breakdown and returns a short paragraph with the
// top 3-5 contributors and a 1-line "why" per contributor.
// Body: { portfolio_id: string, confidence?: 0.95|0.99 }
// ──────────────────────────────────────────────────────────────────────────
ai.post('/risk/explain-var', async (c) => {
  const body = await c.req.json<{ portfolio_id?: string; confidence?: number }>().catch(() => ({} as any));
  if (!body?.portfolio_id) return c.json({ success: false, error: 'portfolio_id required' }, 400);
  const user = getCurrentUser(c);
  const conf = Number(body.confidence ?? 0.95);

  const portfolio = await c.env.DB.prepare(`SELECT * FROM risk_portfolios WHERE id = ?`).bind(body.portfolio_id).first<any>();
  if (!portfolio) return c.json({ success: false, error: 'portfolio not found' }, 404);

  const varRow = await c.env.DB.prepare(`
    SELECT * FROM risk_var_results
    WHERE portfolio_id = ? AND confidence = ?
    ORDER BY as_of_date DESC LIMIT 1
  `).bind(body.portfolio_id, conf).first<any>();
  if (!varRow) {
    return c.json({ success: true, data: { summary: 'No VaR has been computed for this portfolio yet — run a recompute or wait for the nightly cron.', drivers: [] } });
  }

  // Per-factor exposure as a stand-in for true partial sensitivities.
  let filter: any = {};
  try { filter = JSON.parse(portfolio.basis_filter_json || '{}'); } catch {}
  const where: string[] = [];
  const params: any[] = [];
  if (filter.trader_id) { where.push('participant_id = ?'); params.push(filter.trader_id); }
  if (filter.energy_type) { where.push('energy_type = ?'); params.push(filter.energy_type); }
  const positionsRes = await c.env.DB.prepare(`
    SELECT energy_type, net_volume_mwh, last_mark_price
    FROM trader_positions
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    LIMIT 1000
  `).bind(...params).all<any>();

  const byFactor: Record<string, { gross_zar: number; positions: number }> = {};
  for (const r of (positionsRes.results || []) as any[]) {
    const qty = Math.abs(Number(r.net_volume_mwh || 0));
    const mark = Number(r.last_mark_price || 0);
    if (qty === 0 || mark === 0) continue;
    const fid = `spot_${r.energy_type}`;
    byFactor[fid] ||= { gross_zar: 0, positions: 0 };
    byFactor[fid].gross_zar += qty * mark;
    byFactor[fid].positions += 1;
  }
  const totalGross = Object.values(byFactor).reduce((s, v) => s + v.gross_zar, 0) || 1;

  const factorMeta = await c.env.DB.prepare(`SELECT id, name FROM risk_factors`).all<{ id: string; name: string }>();
  const nameOf = new Map(((factorMeta.results || []) as any[]).map(r => [r.id, r.name]));

  const drivers = Object.entries(byFactor)
    .map(([fid, v]) => ({
      factor_id: fid,
      name: nameOf.get(fid) || fid,
      contribution_zar: v.gross_zar,
      pct_of_gross: v.gross_zar / totalGross,
      positions: v.positions,
      why: v.gross_zar / totalGross > 0.40
        ? 'Dominant book exposure — single-factor shocks land here first.'
        : v.gross_zar / totalGross > 0.15
          ? 'Material exposure — second-order tail driver.'
          : 'Small contributor — diversification benefit holds at this size.',
    }))
    .sort((a, b) => b.contribution_zar - a.contribution_zar)
    .slice(0, 5);

  const fmt = (n: number) => `R${Math.round(Math.abs(n)).toLocaleString('en-ZA')}`;
  const top = drivers[0];
  const summary = top
    ? `${portfolio.name} VaR ${Math.round(conf * 100)}% = ${fmt(varRow.var_amount_zar)} (ES ${fmt(varRow.es_amount_zar)}) as of ${varRow.as_of_date}. ${top.name} carries ${Math.round(top.pct_of_gross * 100)}% of gross exposure and is the dominant driver of tail loss.`
    : `${portfolio.name} VaR ${Math.round(conf * 100)}% = ${fmt(varRow.var_amount_zar)} as of ${varRow.as_of_date} but no active positions detected — verify filter.`;

  await c.env.DB.prepare(`
    INSERT INTO ai_decisions (id, user_id, intent, input_json, output_summary, model, created_at)
    VALUES (?, ?, 'risk.explain_var', ?, ?, 'inline-heuristic', datetime('now'))
  `).bind(
    `aid_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    user.id,
    JSON.stringify({ portfolio_id: body.portfolio_id, confidence: conf }),
    summary.slice(0, 500),
  ).run().catch(() => null);

  await fireCascade({
    event: 'ai.classification_logged', actor_id: user.id,
    entity_type: 'risk_portfolio', entity_id: body.portfolio_id,
    data: { intent: 'risk.explain_var', drivers: drivers.length },
    env: c.env,
  }).catch(() => { /* non-fatal */ });

  return c.json({ success: true, data: { as_of_date: varRow.as_of_date, var_zar: varRow.var_amount_zar, es_zar: varRow.es_amount_zar, summary, drivers } });
});

// ──────────────────────────────────────────────────────────────────────────
// POST /ai/risk/suggest-scenario — given recent factor moves, propose 3
// historically-rhyming named scenarios from the system library. Heuristic:
// rank system scenarios by the magnitude of the worst impact they've
// produced this month across the caller-accessible portfolios.
// Body: { portfolio_id?: string }
// ──────────────────────────────────────────────────────────────────────────
ai.post('/risk/suggest-scenario', async (c) => {
  const body = await c.req.json<{ portfolio_id?: string }>().catch(() => ({} as any));
  const user = getCurrentUser(c);

  const month = new Date().toISOString().slice(0, 7) + '-01';

  let sql = `
    SELECT s.id AS scenario_id, s.name AS scenario_name, s.description,
           MIN(sr.pnl_impact_zar) AS worst_pnl,
           AVG(sr.pnl_impact_zar) AS avg_pnl,
           COUNT(*) AS n
    FROM risk_scenarios s
    JOIN risk_scenario_results sr ON sr.scenario_id = s.id
    WHERE s.is_system = 1 AND sr.as_of_date >= ?
  `;
  const params: any[] = [month];
  if (body.portfolio_id) { sql += ' AND sr.portfolio_id = ?'; params.push(body.portfolio_id); }
  sql += ' GROUP BY s.id ORDER BY worst_pnl ASC LIMIT 3';

  const res = await c.env.DB.prepare(sql).bind(...params).all<any>();
  const fmt = (n: number) => `R${Math.round(Math.abs(Number(n) || 0)).toLocaleString('en-ZA')}`;
  const picks = ((res.results || []) as any[]).map((r) => ({
    scenario_id: r.scenario_id,
    name: r.scenario_name,
    description: r.description,
    worst_pnl_zar: r.worst_pnl,
    avg_pnl_zar: r.avg_pnl,
    why: `Worst MTD impact ${fmt(r.worst_pnl)} across ${r.n} run(s) — historically rhymes with current factor moves.`,
  }));

  const summary = picks.length
    ? `Top ${picks.length} scenarios to re-run now: ${picks.map((p) => p.name).join('; ')}.`
    : 'No system scenarios have run this month — wait for tonight\'s cron or trigger a manual run.';

  await c.env.DB.prepare(`
    INSERT INTO ai_decisions (id, user_id, intent, input_json, output_summary, model, created_at)
    VALUES (?, ?, 'risk.suggest_scenario', ?, ?, 'inline-heuristic', datetime('now'))
  `).bind(
    `aid_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    user.id, JSON.stringify(body), summary.slice(0, 500),
  ).run().catch(() => null);

  await fireCascade({
    event: 'ai.classification_logged', actor_id: user.id,
    entity_type: 'risk_portfolio', entity_id: body.portfolio_id || 'all',
    data: { intent: 'risk.suggest_scenario', n: picks.length },
    env: c.env,
  }).catch(() => { /* non-fatal */ });

  return c.json({ success: true, data: { summary, scenarios: picks } });
});

// ──────────────────────────────────────────────────────────────────────────
// POST /ai/clearing/disclosure-summary — given the latest CPMI-IOSCO
// snapshot, return a plain-English summary + Cover-1 breach rationale,
// suitable for the regulator briefing. The math has already happened in
// /api/clearing/disclosure/compute — this just narrates it.
// Body: { snapshot_id?: string }   (defaults to most recent)
// ──────────────────────────────────────────────────────────────────────────
ai.post('/clearing/disclosure-summary', async (c) => {
  const body = await c.req.json<{ snapshot_id?: string }>().catch(() => ({} as any));
  const user = getCurrentUser(c);

  const row = body.snapshot_id
    ? await c.env.DB.prepare(`SELECT * FROM clearing_disclosure_snapshots WHERE id = ?`).bind(body.snapshot_id).first<any>()
    : await c.env.DB.prepare(`SELECT * FROM clearing_disclosure_snapshots ORDER BY as_of_date DESC LIMIT 1`).first<any>();
  if (!row) return c.json({ success: true, data: { summary: 'No disclosure snapshot computed yet — run /api/clearing/disclosure/compute first.', breaches: [] } });

  // Re-evaluate breaches client-side using the same thresholds the route uses.
  const { evaluateBreaches } = await import('../utils/disclosure');
  const breaches = evaluateBreaches(row as any);

  const fmt = (n: number) => `R${Math.round(Math.abs(Number(n) || 0)).toLocaleString('en-ZA')}`;
  const pct = (n: number) => `${(Number(n) || 0).toFixed(1)}%`;
  const ratio = (n: number) => (Number(n) || 0).toFixed(2);

  const summary = `CPMI-IOSCO PFMI disclosure for ${row.as_of_date}: ` +
    `margin coverage ${pct(row.margin_coverage_pct)} (target ≥100%), ` +
    `default fund ${ratio(row.default_fund_coverage_ratio)}× required (target ≥1.0), ` +
    `liquidity ${ratio(row.liquidity_coverage_ratio)}× largest exposure (target ≥1.0), ` +
    `finality ${pct(row.settlement_finality_pct)} (target ≥99.5). ` +
    `IM ${fmt(row.initial_margin_total_zar)}, VM ${fmt(row.variation_margin_total_zar)}, ` +
    `CCP capital ${fmt(row.ccp_capital_zar)} (SITG ${fmt(row.ccp_capital_skin_in_game_zar)}), ` +
    `${row.active_member_count} active members, ${row.failed_instruction_count} failed instructions.`;

  const verdict = breaches.length === 0
    ? 'Cover-1 PASS — all four headline thresholds met.'
    : `Cover-1 BREACH on ${breaches.length} metric(s) — see breakdown.`;

  await c.env.DB.prepare(`
    INSERT INTO ai_decisions (id, user_id, intent, input_json, output_summary, model, created_at)
    VALUES (?, ?, 'clearing.disclosure_summary', ?, ?, 'inline-heuristic', datetime('now'))
  `).bind(
    `aid_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    user.id, JSON.stringify({ snapshot_id: row.id }), (verdict + ' ' + summary).slice(0, 500),
  ).run().catch(() => null);

  return c.json({ success: true, data: { summary, verdict, breaches, snapshot_id: row.id, as_of_date: row.as_of_date } });
});

// ──────────────────────────────────────────────────────────────────────────
// POST /ai/settlement/fail-diagnose — given a failed settlement instruction
// id, suggest a likely cause + a 1-click remediation. Heuristic: inspect
// related cycle (DvP lock state) + margin gate of the member.
// Body: { instruction_id: string }
// ──────────────────────────────────────────────────────────────────────────
ai.post('/settlement/fail-diagnose', async (c) => {
  const body = await c.req.json<{ instruction_id: string }>().catch(() => ({} as any));
  const user = getCurrentUser(c);
  if (!body.instruction_id) return c.json({ error: 'instruction_id_required' }, 400);

  const inst = await c.env.DB.prepare(
    `SELECT * FROM oe_settlement_instructions WHERE id = ?`,
  ).bind(body.instruction_id).first<any>().catch(() => null);
  if (!inst) return c.json({ success: true, data: { cause: 'instruction_not_found', remediation: 'Check the instruction ID and retry.' } });

  const cycle = inst.cycle_id ? await c.env.DB.prepare(
    `SELECT * FROM settlement_dvp_locks WHERE cycle_id = ?`,
  ).bind(inst.cycle_id).first<any>().catch(() => null) : null;

  const memberGate = inst.member_id ? await c.env.DB.prepare(
    `SELECT gate_status FROM margin_enforcement_state WHERE member_id = ?`,
  ).bind(inst.member_id).first<any>().catch(() => null) : null;

  // Diagnose: pick the strongest signal.
  let cause = 'unknown';
  let remediation = 'Investigate manually — no automated diagnosis available.';
  if (memberGate?.gate_status === 'blocked') {
    cause = 'member_margin_blocked';
    remediation = `Member ${inst.member_id} has an overdue margin call. Resolve the margin call before re-submitting the instruction.`;
  } else if (cycle && cycle.lock_status !== 'locked') {
    cause = `dvp_${cycle.lock_status}`;
    remediation = cycle.lock_status === 'open'
      ? 'Neither cash nor energy leg confirmed. Confirm both legs to lock the cycle, then re-submit.'
      : cycle.lock_status === 'cash_in'
        ? 'Cash leg confirmed but energy delivery not. Confirm energy receipt at the meter to unlock the cycle.'
        : cycle.lock_status === 'energy_in'
          ? 'Energy leg confirmed but payment not received. Confirm cash payment to unlock the cycle.'
          : `Cycle in ${cycle.lock_status} state — manual intervention required.`;
  } else if (inst.status === 'failed') {
    cause = 'bank_rail_failure';
    remediation = 'Bank rail returned a failure. Check the failure_reason field; retry after the rail confirms the issue is cleared.';
  }

  await c.env.DB.prepare(`
    INSERT INTO ai_decisions (id, user_id, intent, input_json, output_summary, model, created_at)
    VALUES (?, ?, 'settlement.fail_diagnose', ?, ?, 'inline-heuristic', datetime('now'))
  `).bind(
    `aid_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    user.id, JSON.stringify(body), `${cause}: ${remediation}`.slice(0, 500),
  ).run().catch(() => null);

  return c.json({ success: true, data: { instruction_id: body.instruction_id, cause, remediation, dvp_lock: cycle, gate_status: memberGate?.gate_status || 'clear' } });
});

// ──────────────────────────────────────────────────────────────────────────
// POST /ai/carbon/article-6-explain — given an Article 6 adjustment id,
// narrate the double-counting risk in plain English + suggest the next
// authority action. Inputs come from oe_article6_adjustments +
// oe_country_routing; the risk math itself runs in src/utils/article6.ts so
// this endpoint is purely the explainer surface.
// Body: { adjustment_id: string }
// ──────────────────────────────────────────────────────────────────────────
ai.post('/carbon/article-6-explain', async (c) => {
  const body = await c.req.json<{ adjustment_id: string }>().catch(() => ({} as any));
  const user = getCurrentUser(c);
  if (!body.adjustment_id) return c.json({ error: 'adjustment_id_required' }, 400);

  const row = await c.env.DB.prepare(
    `SELECT * FROM oe_article6_adjustments WHERE id = ?`,
  ).bind(body.adjustment_id).first<any>().catch(() => null);
  if (!row) return c.json({ error: 'not_found' }, 404);

  const { assessDoubleCountingRisk } = await import('../utils/article6');
  const risk = assessDoubleCountingRisk({
    host_iso: row.host_country_iso,
    beneficiary_iso: row.beneficiary_country_iso,
    article_6_track: row.article_6_track,
    ca_status: row.ca_status,
  });

  // Next-action heuristic — wire status to the recommended next call.
  const nextAction: Record<string, { action: string; route: string | null }> = {
    draft: { action: 'Submit corresponding-adjustment record to host NDC authority (DFFE for SA).', route: `/api/carbon/article-6/${row.id}/submit-dffe` },
    dffe_pending: { action: 'Awaiting DFFE clearance — no operator action required.', route: null },
    dffe_cleared: { action: 'Post adjustment to UNFCCC central ledger.', route: `/api/carbon/article-6/${row.id}/post-unfccc` },
    unfccc_ledger: { action: 'Adjustment is final — no further action.', route: null },
    blocked: { action: 'Resolve block reason or unblock to restart lifecycle.', route: `/api/carbon/article-6/${row.id}/unblock` },
  };
  const recommended = nextAction[row.ca_status] || { action: 'Review status manually.', route: null };

  const summary = `Adjustment for ${Number(row.tco2e || 0).toLocaleString('en-ZA')} tCO₂e ` +
    `from ${row.host_country_iso} to ${row.beneficiary_country_iso} ` +
    `(track ${row.article_6_track}, status ${row.ca_status}). ` +
    `Double-counting risk: ${risk.risk.toUpperCase()}. ${risk.reasons.join(' ')}`;

  await c.env.DB.prepare(`
    INSERT INTO ai_decisions (id, user_id, intent, input_json, output_summary, model, created_at)
    VALUES (?, ?, 'carbon.article6_explain', ?, ?, 'inline-heuristic', datetime('now'))
  `).bind(
    `aid_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    user.id, JSON.stringify({ adjustment_id: row.id }), summary.slice(0, 500),
  ).run().catch(() => null);

  return c.json({
    success: true,
    data: {
      adjustment_id: row.id,
      summary,
      risk: risk.risk,
      reasons: risk.reasons,
      ca_status: row.ca_status,
      article_6_track: row.article_6_track,
      next_action: recommended.action,
      next_route: recommended.route,
    },
  });
});

export default ai;
