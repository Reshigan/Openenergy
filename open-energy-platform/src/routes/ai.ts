// ═══════════════════════════════════════════════════════════════════════════
// AI routes — role-aware analysis + bill optimisation + LOI drafting + deep
// reporting per role. All endpoints are auth-gated and delegate to
// `src/utils/ai.ts` which wraps the Cloudflare Workers AI binding and falls
// back to deterministic heuristics when the binding isn't available.
// ═══════════════════════════════════════════════════════════════════════════

import { Hono } from 'hono';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { HonoEnv } from '../utils/types';
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
    mix?: Array<{ project_id: string; share_pct: number; mwh_per_year: number; blended_price: number }>;
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
    if (project.developer_id) {
      try {
        await assertSameTenantParticipant(c, project.developer_id as string);
      } catch {
        continue;
      }
    }

    const aiResult = await ask(c.env, {
      intent: 'offtaker.loi_draft',
      role: user.role,
      prompt: `Draft a Letter of Intent from ${user.name} to ${project.developer_name || 'the IPP'}
for ${item.mwh_per_year.toLocaleString()} MWh/year of ${project.technology} energy
at an indicative blended price of R${item.blended_price}/MWh over ${body.horizon_years ?? 15} years.
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
      item.blended_price,
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
        blended_price: item.blended_price,
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
      `${user.name} has sent a Letter of Intent covering ${Math.round(item.mwh_per_year).toLocaleString()} MWh/year at ~R${item.blended_price}/MWh over ${body.horizon_years ?? 15} years.`,
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

  // Admins can introspect any role; everyone else is locked to their own.
  if (user.role !== 'admin' && user.role !== reportRole) {
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
  env: HonoEnv,
  role: string,
  userId: string,
  period: string,
): Promise<Record<string, unknown>> {
  const since = periodToIso(period);
  const safe = async <T>(p: Promise<T>, fallback: T): Promise<T> => {
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

export default ai;
