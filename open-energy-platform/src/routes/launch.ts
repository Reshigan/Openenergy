// ════════════════════════════════════════════════════════════════════════
// Launch Board — per-role landing page payload
//
// Each role gets a distinct home screen. Instead of every user landing on
// the generic /cockpit, the SPA now routes to /launch/:role, and this
// endpoint returns a role-shaped payload: hero copy + role-specific KPIs +
// primary workflows + inline AI suggestions tuned to that role's day.
//
// One endpoint, three blocks of data:
//   hero            — role-aware greeting + primary CTA
//   kpis            — 4–6 live counters/aggregates relevant to this role
//   workflows       — the 3–5 things this role does most
//   ai_suggestions  — inline assists (per [[feedback-ai-subtle-active]] —
//                     no AI tab, just "why + 1-click accept"). Surfaced
//                     on the launch board; each suggestion is audit-logged
//                     via ai_decisions (mirrors trader rejection-explainer
//                     pattern in src/utils/ai-audit.ts).
//
// Auth: a non-admin user can only fetch their own role's board. Admin can
// fetch any role's board (for support / debug).
//
// All KPI queries are one-shot indexed aggregates — never N+1, never a
// table scan. Cache the assembled payload in KV for 30s per (user_id,role)
// to keep dashboard refreshes cheap, with `?fresh=1` to bust.
// ════════════════════════════════════════════════════════════════════════

import { Hono } from 'hono';
import { authMiddleware } from '../middleware/auth';
import type { HonoEnv } from '../utils/types';

const launch = new Hono<HonoEnv>();

type Tone = 'good' | 'warn' | 'bad' | 'neutral';

type Kpi = {
  key: string;
  label: string;
  value: number | string;
  unit?: string;
  trend?: 'up' | 'down' | 'flat';
  trend_value?: string;
  tone?: Tone;
  href?: string;
  footer?: string;
};

type Workflow = {
  key: string;
  title: string;
  description: string;
  href: string;
  cta_label: string;
  icon?: string;
  metric?: { label: string; value: string | number; tone?: Tone };
};

type AiSuggestion = {
  key: string;
  title: string;
  why: string;
  confidence?: number;
  accept?: { label: string; href?: string; action?: string };
  dismiss?: { label: string };
};

type LaunchPayload = {
  role: string;
  user: { id: string; name?: string; email: string };
  hero: {
    eyebrow: string;
    title: string;
    subtitle: string;
    primary_cta?: { label: string; href: string };
  };
  kpis: Kpi[];
  workflows: Workflow[];
  ai_suggestions: AiSuggestion[];
};

const KNOWN_ROLES: Record<string, true> = {
  trader: true,
  ipp_developer: true,
  offtaker: true,
  lender: true,
  grid_operator: true,
  regulator: true,
  carbon_fund: true,
  admin: true,
  support: true,
};

const greeting = () => {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
};

const todayStr = () =>
  new Date().toLocaleDateString('en-ZA', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

const firstName = (name?: string) => (name || '').split(' ')[0] || 'there';

launch.get('/:role/kpis', authMiddleware, async (c) => {
  const auth = c.get('auth');
  if (!auth?.user) return c.json({ success: false, error: 'Unauthorized' }, 401);
  const role = c.req.param('role') || '';
  if (!KNOWN_ROLES[role]) return c.json({ success: false, error: 'Unknown role' }, 404);

  // A user can only fetch their own role's board. Admin + support can
  // fetch any role (admin for full-access ops; support for assisted
  // walkthroughs). Anyone else asking for someone else's role → 403.
  if (auth.user.role !== role && auth.user.role !== 'admin' && auth.user.role !== 'support') {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const fresh = c.req.query('fresh') === '1';
  const cacheKey = `launch:${auth.user.id}:${role}`;
  if (!fresh) {
    try {
      const cached = await c.env.KV.get(cacheKey, 'json');
      if (cached) return c.json({ success: true, data: cached, cached: true });
    } catch {
      /* KV unavailable — proceed without cache */
    }
  }

  try {
    let payload: LaunchPayload;
    switch (role) {
      case 'trader':
        payload = await buildTraderBoard(c, auth.user);
        break;
      case 'ipp_developer':
        payload = await buildIppDeveloperBoard(c, auth.user);
        break;
      case 'offtaker':
        payload = await buildOfftakerBoard(c, auth.user);
        break;
      case 'lender':
        payload = await buildLenderBoard(c, auth.user);
        break;
      case 'grid_operator':
        payload = await buildGridOperatorBoard(c, auth.user);
        break;
      case 'regulator':
        payload = await buildRegulatorBoard(c, auth.user);
        break;
      case 'carbon_fund':
        payload = await buildCarbonFundBoard(c, auth.user);
        break;
      case 'admin':
        payload = await buildAdminBoard(c, auth.user);
        break;
      case 'support':
        payload = await buildSupportBoard(c, auth.user);
        break;
      default:
        return c.json({ success: false, error: 'Unsupported role' }, 400);
    }

    c.executionCtx?.waitUntil?.(
      c.env.KV.put(cacheKey, JSON.stringify(payload), { expirationTtl: 30 }).catch(() => {}),
    );
    return c.json({ success: true, data: payload });
  } catch (err) {
    console.error('Launch board error:', err);
    return c.json({ success: false, error: 'Failed to build launch board', details: String(err) }, 500);
  }
});

// POST /:role/ai/:suggestion_key/accept — record that the user accepted
// an inline suggestion. The suggestion key is opaque (each builder picks
// keys it understands); we just log the click for audit + future ML.
launch.post('/:role/ai/:key/accept', authMiddleware, async (c) => {
  const auth = c.get('auth');
  if (!auth?.user) return c.json({ success: false, error: 'Unauthorized' }, 401);
  const role = c.req.param('role');
  const key = c.req.param('key');
  const body = await c.req.json().catch(() => ({}));
  await c.env.DB.prepare(
    `INSERT OR IGNORE INTO ai_decisions
      (id, participant_id, surface, decision_key, accepted_at, payload_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      crypto.randomUUID(),
      auth.user.id,
      `launch_${role}`,
      key,
      new Date().toISOString(),
      JSON.stringify(body || {}),
      new Date().toISOString(),
    )
    .run()
    .catch(() => {
      /* ai_decisions table may not exist on older deploy; surface elsewhere */
    });
  return c.json({ success: true });
});

// ───────────────────────────────────────────────────────────────────────
// L5 audit KPIs — chain head + open breaks per feature chain. Spread into
// each role's KPI list so users see "Chain length 1 234 · 0 open breaks"
// without leaving the launch board.
// ───────────────────────────────────────────────────────────────────────
async function auditKpisFor(
  env: any,
  entity_type: string,
  workstationHref: string,
): Promise<Kpi[]> {
  let head_sequence = 0;
  let last_verified_at: string | null = null;
  let open_breaks = 0;
  try {
    const head = await env.DB.prepare(
      `SELECT head_sequence, last_verified_at FROM audit_chain_state WHERE entity_type = ?`,
    ).bind(entity_type).first() as { head_sequence: number; last_verified_at: string | null } | null;
    if (head) {
      head_sequence = Number(head.head_sequence || 0);
      last_verified_at = head.last_verified_at;
    }
  } catch { /* table may not exist on local dev */ }
  try {
    const breaks = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM audit_recon_breaks b
         INNER JOIN audit_recon_runs r ON r.id = b.run_id
        WHERE r.entity_type = ? AND (b.resolution IS NULL OR b.resolution = 'open' OR b.resolution = 'investigating')`,
    ).bind(entity_type).first() as { n: number } | null;
    open_breaks = Number(breaks?.n || 0);
  } catch { /* */ }
  const kpis: Kpi[] = [];
  if (head_sequence > 0) {
    kpis.push({
      key: 'audit_chain_length',
      label: 'Audit chain length',
      value: head_sequence,
      tone: last_verified_at ? 'good' : 'neutral',
      href: workstationHref,
      footer: last_verified_at ? 'verified' : 'pending verify',
    });
  }
  if (open_breaks > 0) {
    kpis.push({
      key: 'audit_open_breaks',
      label: 'Open recon breaks',
      value: open_breaks,
      tone: 'warn',
      href: workstationHref,
    });
  }
  return kpis;
}

// ───────────────────────────────────────────────────────────────────────
// Per-role builders. Each returns a fully-shaped LaunchPayload.
// Queries are one-shot compound SELECTs against indexed columns.
// ───────────────────────────────────────────────────────────────────────

async function buildTraderBoard(c: any, user: any): Promise<LaunchPayload> {
  const r = await c.env.DB.prepare(`
    SELECT
      (SELECT COUNT(*) FROM trade_orders
        WHERE participant_id = ? AND status IN ('open','partial'))             AS open_orders,
      (SELECT COUNT(*) FROM trade_fills
        WHERE participant_id = ?
          AND executed_at >= datetime('now','-1 day'))                          AS fills_24h,
      (SELECT COALESCE(SUM(gross_zar), 0)
        FROM trade_fills
        WHERE participant_id = ?
          AND executed_at >= datetime('now','-1 day'))                          AS notional_24h,
      (SELECT COUNT(*) FROM trade_order_rejections
        WHERE participant_id = ?
          AND attempted_at >= datetime('now','-1 day'))                        AS rejections_24h
  `)
    .bind(user.id, user.id, user.id, user.id)
    .first()
    .catch(() => ({}));

  const marginRow = await c.env.DB.prepare(
    `SELECT COALESCE(SUM(amount_zar), 0) AS m FROM margin_reservations
      WHERE participant_id = ? AND status = 'reserved'`,
  )
    .bind(user.id)
    .first()
    .catch(() => ({ m: 0 } as any));

  // L4 trader surfaces — open trade exceptions filed against this trader's
  // fills, plus 24h fees ledger sum. Both wrapped in .catch so older
  // deploys without migration 054 keep working.
  const exceptionsOpen = await c.env.DB.prepare(
    `SELECT COUNT(*) AS c FROM trade_exceptions e
       INNER JOIN trade_matches m ON m.id = e.match_id
       INNER JOIN trade_orders bo ON bo.id = m.buy_order_id
       INNER JOIN trade_orders so ON so.id = m.sell_order_id
      WHERE e.status IN ('open','investigating')
        AND (bo.participant_id = ? OR so.participant_id = ?)`,
  )
    .bind(user.id, user.id)
    .first()
    .catch(() => null as any);

  const fees24hRow = await c.env.DB.prepare(
    `SELECT COALESCE(SUM(amount_zar), 0) AS s FROM trade_fees
      WHERE participant_id = ?
        AND calculated_at >= datetime('now','-1 day')`,
  )
    .bind(user.id)
    .first()
    .catch(() => null as any);

  const allocPendingRow = await c.env.DB.prepare(
    `SELECT COUNT(*) AS c FROM trade_matches m
       INNER JOIN trade_orders o ON (o.id = m.buy_order_id OR o.id = m.sell_order_id)
      WHERE o.participant_id = ?
        AND NOT EXISTS (SELECT 1 FROM trade_allocations a WHERE a.match_id = m.id AND a.order_id = o.id)
        AND m.matched_at >= datetime('now','-30 days')`,
  )
    .bind(user.id)
    .first()
    .catch(() => null as any);

  const rejections = Number((r as any)?.rejections_24h || 0);
  const openOrders = Number((r as any)?.open_orders || 0);
  const fills24h = Number((r as any)?.fills_24h || 0);
  const notional = Math.round(Number((r as any)?.notional_24h || 0));
  const margin = Math.round(Number((marginRow as any)?.m || 0));
  const exceptionsN = Number((exceptionsOpen as any)?.c || 0);
  const fees24h = Math.round(Number((fees24hRow as any)?.s || 0));
  const allocPending = Number((allocPendingRow as any)?.c || 0);

  return {
    role: 'trader',
    user: { id: user.id, name: user.name, email: user.email },
    hero: {
      eyebrow: `Trading desk · ${todayStr()}`,
      title: `${greeting()}, ${firstName(user.name)}`,
      subtitle:
        openOrders > 0
          ? `${openOrders} open order${openOrders === 1 ? '' : 's'} live; ${fills24h} fill${fills24h === 1 ? '' : 's'} in the last 24h.`
          : `No open orders. ${fills24h} fill${fills24h === 1 ? '' : 's'} settled in the last 24h.`,
      primary_cta: { label: 'Open trading terminal', href: '/trading' },
    },
    kpis: [
      { key: 'open_orders', label: 'Open orders', value: openOrders, tone: 'neutral', href: '/trading?tab=orders' },
      { key: 'fills_24h', label: '24h fills', value: fills24h, tone: 'good', href: '/trading?tab=blotter' },
      { key: 'notional_24h', label: '24h notional', value: notional, unit: 'ZAR', tone: 'neutral' },
      {
        key: 'rejections_24h',
        label: '24h rejections',
        value: rejections,
        tone: rejections > 0 ? 'warn' : 'good',
        href: '/trading?tab=rejections',
        footer: rejections > 3 ? 'investigate' : undefined,
      },
      { key: 'margin_reserved', label: 'Margin reserved', value: margin, unit: 'ZAR', tone: 'neutral', href: '/trader-risk' },
      {
        key: 'exceptions_open',
        label: 'Open exceptions',
        value: exceptionsN,
        tone: exceptionsN > 0 ? 'warn' : 'good',
        href: '/trading?tab=exceptions',
      },
      ...(fees24h > 0
        ? ([{
            key: 'fees_24h',
            label: '24h fees',
            value: fees24h,
            unit: 'ZAR',
            tone: 'neutral' as Tone,
            href: '/trading?tab=fees',
          }] as Kpi[])
        : []),
      ...(allocPending > 0
        ? ([{
            key: 'allocations_pending',
            label: 'Unallocated fills',
            value: allocPending,
            tone: 'warn' as Tone,
            href: '/trading?tab=allocations',
            footer: '30 days',
          }] as Kpi[])
        : []),
      ...(await auditKpisFor(c.env, 'trading', '/trader-risk/workstation?tab=audit'))
    ],
    workflows: [
      {
        key: 'terminal',
        title: 'Place an order',
        description: 'Live order book, pre-trade risk gating, AI size suggest, advanced order types.',
        href: '/trading?tab=terminal',
        cta_label: 'Open terminal',
        icon: 'trending_up',
      },
      {
        key: 'orders',
        title: 'Amend / cancel open orders',
        description: 'Adjust price or volume; see priority impact before confirming.',
        href: '/trading?tab=orders',
        cta_label: 'Manage orders',
        icon: 'edit_note',
        metric: { label: 'open', value: openOrders, tone: openOrders > 0 ? 'neutral' : 'good' },
      },
      {
        key: 'risk',
        title: 'Position & margin',
        description: 'Live positions, P&L, credit utilisation, mark prices.',
        href: '/trader-risk',
        cta_label: 'Open risk',
        icon: 'shield',
        metric: { label: 'margin', value: `R${margin.toLocaleString()}`, tone: 'neutral' },
      },
      {
        key: 'rejections',
        title: 'Review rejections',
        description: 'Every blocked order with the rule it tripped and AI-suggested remediation.',
        href: '/trading?tab=rejections',
        cta_label: 'Open rejections',
        icon: 'block',
        metric: { label: '24h', value: rejections, tone: rejections > 0 ? 'warn' : 'good' },
      },
      {
        key: 'workstation',
        title: 'Trader workstation',
        description: 'One-page view of open orders, rejections, post-trade exceptions, and margin calls — with state-machine actions.',
        href: '/trader-risk/workstation',
        cta_label: 'Open workstation',
        icon: 'desktop_windows',
      },
    ],
    ai_suggestions: await buildTraderAiSuggestions(c, user, { openOrders, rejections, exceptionsN, allocPending }),
  };
}

async function buildTraderAiSuggestions(
  c: any,
  user: any,
  ctx: { openOrders: number; rejections: number; exceptionsN: number; allocPending: number },
): Promise<AiSuggestion[]> {
  const out: AiSuggestion[] = [];

  // Suggestion 1: if the trader has recent rejections, point at the most
  // common rejection code in the last 24h. The trader can click through.
  if (ctx.rejections >= 3) {
    const top = await c.env.DB.prepare(
      `SELECT reason_code, COUNT(*) AS c FROM trade_order_rejections
        WHERE participant_id = ? AND attempted_at >= datetime('now','-1 day')
        GROUP BY reason_code ORDER BY c DESC LIMIT 1`,
    )
      .bind(user.id)
      .first()
      .catch(() => null as any);
    if (top?.reason_code) {
      out.push({
        key: `recurring_rejection_${top.reason_code}`,
        title: `Recurring rejection: ${top.reason_code.replaceAll('_', ' ').toLowerCase()}`,
        why: `Hit ${top.c}× in the last 24h. Review the rule and adjust your order template before the next batch.`,
        confidence: 0.82,
        accept: { label: 'Open rejection log', href: `/trading?tab=rejections&code=${top.reason_code}` },
        dismiss: { label: 'Dismiss' },
      });
    }
  }

  // Suggestion 2: stale open orders. If any open order is older than
  // 4 hours, suggest the trader review or expire it. With migration 054
  // landed, the order's detail view can call POST /trading/orders/:id/
  // amend-suggest for a deterministic re-price / split suggestion.
  const stale = await c.env.DB.prepare(
    `SELECT id, side, volume_mwh, price_min, price_max, posted_at FROM trade_orders
      WHERE participant_id = ? AND status IN ('open','partial')
        AND posted_at <= datetime('now','-4 hours')
      ORDER BY posted_at ASC LIMIT 1`,
  )
    .bind(user.id)
    .first()
    .catch(() => null as any);
  if (stale) {
    out.push({
      key: `stale_order_${(stale as any).id}`,
      title: `Stale ${(stale as any).side} order on the book`,
      why: `Posted ${(stale as any).posted_at} and still unfilled. Open the order to see an AI-suggested re-price or split before margin churns.`,
      confidence: 0.66,
      accept: { label: 'Open order with amend-suggest', href: `/trading?tab=orders&focus=${(stale as any).id}&amend=1` },
      dismiss: { label: 'Leave it' },
    });
  }

  // Suggestion 3 (L4): unallocated fills. Once trades fill, attribute
  // them to internal lots so risk + reporting reflect reality.
  if (ctx.allocPending > 0) {
    out.push({
      key: 'allocations_pending',
      title: `${ctx.allocPending} fill${ctx.allocPending === 1 ? '' : 's'} need allocation`,
      why: 'Fills sitting unallocated for 30+ days break the risk + reporting view. Attribute them to the desk / fund / lot they belong to.',
      confidence: 0.85,
      accept: { label: 'Open allocations', href: '/trading?tab=allocations' },
      dismiss: { label: 'Dismiss' },
    });
  }

  // Suggestion 4 (L4): open trade exceptions. Recurring exception types
  // suggest a systemic issue (data feed, off-market venue) worth
  // investigating rather than handling each one.
  if (ctx.exceptionsN > 0) {
    out.push({
      key: 'exceptions_open',
      title: `${ctx.exceptionsN} trade exception${ctx.exceptionsN === 1 ? '' : 's'} need triage`,
      why: 'Open trade exceptions tie up risk capital and delay clean reporting. Resolve or escalate within 24h to keep the book accurate.',
      confidence: 0.78,
      accept: { label: 'Open exceptions', href: '/trading?tab=exceptions' },
      dismiss: { label: 'Dismiss' },
    });
  }

  // Suggestion 3 (always): suggest a quick scan of margin utilisation.
  // Lightweight: only fires if margin > 60% of a credit limit.
  const credit = await c.env.DB.prepare(
    `SELECT COALESCE(MAX(limit_amount_zar), 0) AS lim FROM credit_limits
       WHERE participant_id = ?`,
  )
    .bind(user.id)
    .first()
    .catch(() => null as any);
  if (credit?.lim) {
    const marginRow = await c.env.DB.prepare(
      `SELECT COALESCE(SUM(amount_zar), 0) AS m FROM margin_reservations
         WHERE participant_id = ? AND status = 'reserved'`,
    )
      .bind(user.id)
      .first()
      .catch(() => ({ m: 0 } as any));
    const m = Number(marginRow?.m || 0);
    if (credit.lim > 0 && m / credit.lim > 0.6) {
      out.push({
        key: 'margin_high_utilisation',
        title: 'Margin utilisation above 60%',
        why: `R${Math.round(m).toLocaleString()} reserved against a R${Math.round(credit.lim).toLocaleString()} limit. Close or trim a position before adding new exposure.`,
        confidence: 0.9,
        accept: { label: 'Open positions', href: '/trader-risk' },
        dismiss: { label: 'OK' },
      });
    }
  }

  return out;
}

async function buildIppDeveloperBoard(c: any, user: any): Promise<LaunchPayload> {
  // Real IPP pipeline KPIs: project counts by phase, generation 24h,
  // open invoices issued by this developer, EPC milestones due within
  // 14 days, environmental authorisations expiring within 90 days.
  const r = await c.env.DB.prepare(`
    SELECT
      (SELECT COUNT(*) FROM ipp_projects WHERE developer_id = ?)                          AS projects_total,
      (SELECT COUNT(*) FROM ipp_projects WHERE developer_id = ? AND status = 'development')  AS projects_development,
      (SELECT COUNT(*) FROM ipp_projects WHERE developer_id = ? AND status = 'construction') AS projects_construction,
      (SELECT COUNT(*) FROM ipp_projects WHERE developer_id = ?
        AND status IN ('operational','commercial_operations','commissioning'))                 AS projects_operational,
      (SELECT COUNT(*) FROM invoices
        WHERE from_participant_id = ? AND status IN ('issued','partial','overdue'))       AS invoices_outstanding,
      (SELECT COALESCE(SUM(total_amount), 0) FROM invoices
        WHERE from_participant_id = ? AND status IN ('issued','partial','overdue'))       AS invoices_outstanding_zar
  `)
    .bind(user.id, user.id, user.id, user.id, user.id, user.id)
    .first()
    .catch(() => ({}));

  const milestonesDue = await c.env.DB.prepare(`
    SELECT COUNT(*) AS c FROM ipp_epc_milestones m
      INNER JOIN ipp_epc_contracts e ON e.id = m.epc_contract_id
      INNER JOIN ipp_projects p ON p.id = e.project_id
      WHERE p.developer_id = ?
        AND m.target_date <= date('now','+14 days')
        AND COALESCE(m.completed_at, '') = ''
  `)
    .bind(user.id)
    .first()
    .catch(() => null as any);

  const envExpiring = await c.env.DB.prepare(`
    SELECT COUNT(*) AS c FROM ipp_environmental_authorisations a
      INNER JOIN ipp_projects p ON p.id = a.project_id
      WHERE p.developer_id = ?
        AND a.expiry_date IS NOT NULL
        AND date(a.expiry_date) <= date('now','+90 days')
  `)
    .bind(user.id)
    .first()
    .catch(() => null as any);

  const total = Number(r?.projects_total || 0);
  const dev = Number(r?.projects_development || 0);
  const constr = Number(r?.projects_construction || 0);
  const ops = Number(r?.projects_operational || 0);
  const invoicesOut = Number(r?.invoices_outstanding || 0);
  const invoicesZar = Math.round(Number(r?.invoices_outstanding_zar || 0));
  const milestones = Number(milestonesDue?.c || 0);
  const envSoon = Number(envExpiring?.c || 0);

  return {
    role: 'ipp_developer',
    user: { id: user.id, name: user.name, email: user.email },
    hero: {
      eyebrow: `IPP developer · ${todayStr()}`,
      title: `${greeting()}, ${firstName(user.name)}`,
      subtitle:
        total > 0
          ? `${total} project${total === 1 ? '' : 's'}: ${dev} in development, ${constr} under construction, ${ops} operating.`
          : 'No projects yet. Start with site screening or import an existing project file.',
      primary_cta: total > 0
        ? { label: 'Open project pipeline', href: '/projects' }
        : { label: 'Start a new project', href: '/projects?new=1' },
    },
    kpis: [
      { key: 'projects_total', label: 'Projects', value: total, tone: 'neutral', href: '/projects' },
      { key: 'projects_development', label: 'In development', value: dev, tone: 'neutral', href: '/projects?phase=development' },
      { key: 'projects_construction', label: 'Under construction', value: constr, tone: 'neutral', href: '/projects?phase=construction' },
      { key: 'projects_operational', label: 'Operating', value: ops, tone: 'good', href: '/projects?phase=operational' },
      {
        key: 'milestones_due',
        label: 'EPC milestones due ≤14d',
        value: milestones,
        tone: milestones > 0 ? 'warn' : 'good',
        href: '/ipp-lifecycle',
      },
      {
        key: 'env_expiring',
        label: 'Env. permits ≤90d',
        value: envSoon,
        tone: envSoon > 0 ? 'warn' : 'good',
        href: '/ipp-lifecycle',
      },
      {
        key: 'invoices_outstanding',
        label: 'Invoices outstanding',
        value: invoicesOut,
        unit: invoicesZar > 0 ? `(R${invoicesZar.toLocaleString()})` : undefined,
        tone: invoicesOut > 0 ? 'warn' : 'good',
        href: '/settlement?direction=outgoing',
      },
      ...(await auditKpisFor(c.env, 'ipp', '/ipp-lifecycle/workstation?tab=audit'))
    ],
    workflows: [
      {
        key: 'pipeline',
        title: 'Project pipeline',
        description: 'Every project end-to-end: origination → development → financing → construction → commissioning → operation → decommission.',
        href: '/projects',
        cta_label: 'Open pipeline',
        icon: 'account_tree',
        metric: { label: 'projects', value: total, tone: 'neutral' },
      },
      {
        key: 'lifecycle',
        title: 'Lifecycle workbench',
        description: 'EPC contracts, environmental authorisations, water-use, heritage, financing, commissioning, refinancing.',
        href: '/ipp-lifecycle',
        cta_label: 'Open lifecycle',
        icon: 'timeline',
      },
      {
        key: 'esums',
        title: 'Esums — operations and generation',
        description: 'Site telemetry, deterministic fault detection, work orders, OEM warranty register.',
        href: '/esums',
        cta_label: 'Open Esums',
        icon: 'build',
      },
      {
        key: 'settlement',
        title: 'Outgoing invoices',
        description: 'Invoices you issue to offtakers; confirmations + dispute queue.',
        href: '/settlement?direction=outgoing',
        cta_label: 'Open settlement',
        icon: 'receipt_long',
        metric: { label: 'open', value: invoicesOut, tone: invoicesOut > 0 ? 'warn' : 'good' },
      },
      {
        key: 'workstation',
        title: 'IPP workstation',
        description: 'Projects, milestones, insurance expirations, community engagement — one workbench with satisfy / file-claim / log-engagement.',
        href: '/ipp-lifecycle/workstation',
        cta_label: 'Open workstation',
        icon: 'desktop_windows',
      },
    ],
    ai_suggestions: await buildIppDeveloperAiSuggestions(c, user, { milestones, envSoon, invoicesOut }),
  };
}

async function buildIppDeveloperAiSuggestions(
  _c: any,
  _user: any,
  ctx: { milestones: number; envSoon: number; invoicesOut: number },
): Promise<AiSuggestion[]> {
  const out: AiSuggestion[] = [];
  if (ctx.envSoon > 0) {
    out.push({
      key: 'env_expiring',
      title: `${ctx.envSoon} environmental permit${ctx.envSoon === 1 ? '' : 's'} expiring within 90 days`,
      why: 'NEMA s.24 and water-use renewals typically take 60–120 days. Start renewal now to avoid construction or operational pause.',
      confidence: 0.9,
      accept: { label: 'Open lifecycle workbench', href: '/ipp-lifecycle' },
      dismiss: { label: 'Later' },
    });
  }
  if (ctx.milestones > 0) {
    out.push({
      key: 'milestones_due',
      title: `${ctx.milestones} EPC milestone${ctx.milestones === 1 ? '' : 's'} due in the next 14 days`,
      why: 'Liquidated damages typically apply within 14 days of delay. Confirm contractor status now.',
      confidence: 0.85,
      accept: { label: 'Open EPC contracts', href: '/ipp-lifecycle' },
      dismiss: { label: 'Dismiss' },
    });
  }
  if (ctx.invoicesOut > 3) {
    out.push({
      key: 'invoices_outstanding_chase',
      title: `${ctx.invoicesOut} outstanding invoices need follow-up`,
      why: 'Cashflow risk above 3 open invoices. Send confirmations to offtakers; flag overdue ones for dunning.',
      confidence: 0.78,
      accept: { label: 'Open outgoing settlement', href: '/settlement?direction=outgoing' },
      dismiss: { label: 'Dismiss' },
    });
  }
  return out;
}

async function buildOfftakerBoard(c: any, user: any): Promise<LaunchPayload> {
  const r = await c.env.DB.prepare(`
    SELECT
      (SELECT COUNT(*) FROM contract_documents
        WHERE counterparty_id = ? AND phase = 'active')                        AS active_ppas,
      (SELECT COUNT(*) FROM invoices
        WHERE to_participant_id = ? AND status IN ('issued','partial','overdue')) AS invoices_to_pay,
      (SELECT COALESCE(SUM(total_amount), 0) FROM invoices
        WHERE to_participant_id = ? AND status IN ('issued','partial','overdue')) AS invoices_to_pay_zar,
      (SELECT COUNT(*) FROM settlement_disputes
        WHERE filed_by = ? AND status = 'open')                               AS open_disputes
  `)
    .bind(user.id, user.id, user.id, user.id)
    .first()
    .catch(() => ({}));

  // L4 surfaces — open settlement breaks on invoices the offtaker pays,
  // confirmations awaiting their acknowledgement, accrued fees they owe.
  // All three queries hedge with .catch(()=>{}) so older deploys without
  // migrations 052/053 quietly fall back to zero counts.
  const breaks = await c.env.DB.prepare(
    `SELECT COUNT(*) AS c FROM settlement_breaks b
       INNER JOIN invoices i ON i.id = b.invoice_id
      WHERE i.to_participant_id = ? AND b.status IN ('open','investigating')`,
  )
    .bind(user.id)
    .first()
    .catch(() => null as any);

  const pendingAck = await c.env.DB.prepare(
    `SELECT COUNT(*) AS c FROM invoices
       WHERE to_participant_id = ? AND confirmation_status = 'issuer_confirmed'`,
  )
    .bind(user.id)
    .first()
    .catch(() => null as any);

  const feeBurden = await c.env.DB.prepare(
    `SELECT COALESCE(SUM(f.amount_zar), 0) AS s FROM settlement_fees f
       INNER JOIN invoices i ON i.id = f.invoice_id
      WHERE i.to_participant_id = ?`,
  )
    .bind(user.id)
    .first()
    .catch(() => null as any);

  const overdue = await c.env.DB.prepare(
    `SELECT COUNT(*) AS c FROM invoices
       WHERE to_participant_id = ? AND status = 'overdue'`,
  )
    .bind(user.id)
    .first()
    .catch(() => null as any);

  const ppas = Number((r as any)?.active_ppas || 0);
  const toPay = Number((r as any)?.invoices_to_pay || 0);
  const toPayZar = Math.round(Number((r as any)?.invoices_to_pay_zar || 0));
  const disputes = Number((r as any)?.open_disputes || 0);
  const overdueN = Number((overdue as any)?.c || 0);
  const breaksN = Number((breaks as any)?.c || 0);
  const pendingAckN = Number((pendingAck as any)?.c || 0);
  const feesZar = Math.round(Number((feeBurden as any)?.s || 0));

  return {
    role: 'offtaker',
    user: { id: user.id, name: user.name, email: user.email },
    hero: {
      eyebrow: `Energy procurement · ${todayStr()}`,
      title: `${greeting()}, ${firstName(user.name)}`,
      subtitle: `${ppas} active PPA${ppas === 1 ? '' : 's'} · ${toPay} invoice${toPay === 1 ? '' : 's'} to pay (R${toPayZar.toLocaleString()}).`,
      primary_cta: { label: 'Open procurement hub', href: '/procurement' },
    },
    kpis: [
      { key: 'active_ppas', label: 'Active PPAs', value: ppas, tone: 'good', href: '/contracts' },
      {
        key: 'invoices_to_pay',
        label: 'Invoices to pay',
        value: toPay,
        unit: toPayZar > 0 ? `(R${toPayZar.toLocaleString()})` : undefined,
        tone: toPay > 0 ? 'warn' : 'good',
        href: '/settlement?direction=incoming',
      },
      {
        key: 'overdue',
        label: 'Overdue',
        value: overdueN,
        tone: overdueN > 0 ? 'bad' : 'good',
        href: '/settlement?direction=incoming&status=overdue',
      },
      {
        key: 'open_disputes',
        label: 'Open disputes',
        value: disputes,
        tone: disputes > 0 ? 'warn' : 'good',
        href: '/settlement?tab=disputes',
      },
      {
        key: 'settlement_breaks',
        label: 'Open breaks',
        value: breaksN,
        tone: breaksN > 0 ? 'warn' : 'good',
        href: '/settlement?tab=breaks',
      },
      {
        key: 'pending_ack',
        label: 'Awaiting your acknowledgement',
        value: pendingAckN,
        tone: pendingAckN > 0 ? 'warn' : 'good',
        href: '/settlement?direction=incoming&filter=needs_ack',
      },
      ...(feesZar > 0
        ? ([{
            key: 'fees_owed',
            label: 'Fees accrued',
            value: feesZar,
            unit: 'ZAR',
            tone: 'warn' as Tone,
            href: '/settlement?direction=incoming',
            footer: 'late + dunning',
          }] as Kpi[])
        : []),
      ...(await auditKpisFor(c.env, 'offtaker', '/offtaker-suite/workstation?tab=audit'))
    ],
    workflows: [
      {
        key: 'procurement',
        title: 'Run a procurement round',
        description: 'RFP → bids → evaluation → award → LOI, with weighted scoring.',
        href: '/procurement',
        cta_label: 'Open procurement',
        icon: 'shopping_cart',
      },
      {
        key: 'ppa_book',
        title: 'PPA book',
        description: 'Active PPAs, take-or-pay tracking, escalations, renewals.',
        href: '/contracts',
        cta_label: 'Open contracts',
        icon: 'description',
        metric: { label: 'active', value: ppas, tone: 'good' },
      },
      {
        key: 'invoices_in',
        title: 'Pay incoming invoices',
        description: 'Settle, dispute, confirm — with line-item breakdown and AI run-failure explainer.',
        href: '/settlement?direction=incoming',
        cta_label: 'Open settlement',
        icon: 'payments',
        metric: { label: 'to pay', value: toPay, tone: toPay > 0 ? 'warn' : 'good' },
      },
      {
        key: 'workstation',
        title: 'Offtaker workstation',
        description: 'Sites, tariffs, budget-vs-actual, RECs retirement, Scope 2 disclosures — one workbench.',
        href: '/offtaker-suite/workstation',
        cta_label: 'Open workstation',
        icon: 'desktop_windows',
      },
    ],
    ai_suggestions: [
      ...(overdueN > 0
        ? [
            {
              key: 'overdue_dunning',
              title: `${overdueN} overdue invoice${overdueN === 1 ? '' : 's'} risk dunning fees`,
              why: 'Late payment fees typically accrue from day +7 at 2% of outstanding. Pay or dispute before dunning kicks in.',
              confidence: 0.92,
              accept: { label: 'Review overdue', href: '/settlement?direction=incoming&status=overdue' },
              dismiss: { label: 'Dismiss' },
            } as AiSuggestion,
          ]
        : []),
      ...(pendingAckN > 0
        ? [
            {
              key: 'pending_ack',
              title: `${pendingAckN} invoice${pendingAckN === 1 ? '' : 's'} awaiting your acknowledgement`,
              why: 'Issuer has confirmed; payer acknowledgement is needed to close the confirmation loop and trigger fee accrual cleanly.',
              confidence: 0.88,
              accept: { label: 'Open invoices', href: '/settlement?direction=incoming&filter=needs_ack' },
              dismiss: { label: 'Later' },
            } as AiSuggestion,
          ]
        : []),
    ],
  };
}

async function buildLenderBoard(c: any, user: any): Promise<LaunchPayload> {
  // Covenants schema (migration 023) carries `lender_participant_id`,
  // not a separate `loans.lender_id`. Drive every count off covenants
  // + covenant_tests so the lender board reflects actual book state.
  const r = await c.env.DB.prepare(`
    SELECT
      (SELECT COUNT(DISTINCT project_id) FROM covenants
        WHERE lender_participant_id = ?)                                              AS facilities_count,
      (SELECT COUNT(*) FROM covenants
        WHERE lender_participant_id = ?)                                              AS covenants_count,
      (SELECT COUNT(*) FROM covenant_tests t
        INNER JOIN covenants c ON c.id = t.covenant_id
        WHERE c.lender_participant_id = ? AND t.result = 'breach')                    AS covenants_breached,
      (SELECT COUNT(*) FROM disbursement_requests
        WHERE status = 'pending')                                                     AS disbursements_pending
  `)
    .bind(user.id, user.id, user.id)
    .first()
    .catch(() => ({}));

  // L4 open-action queue + recent acceptances of AI advice.
  const openActions = await c.env.DB.prepare(
    `SELECT COUNT(*) AS c FROM lender_covenant_actions
      WHERE lender_participant_id = ? AND status IN ('open','investigating')`,
  )
    .bind(user.id)
    .first()
    .catch(() => null as any);

  const facilities = Number((r as any)?.facilities_count || 0);
  const covenants = Number((r as any)?.covenants_count || 0);
  const breached = Number((r as any)?.covenants_breached || 0);
  const pending = Number((r as any)?.disbursements_pending || 0);
  const actionsN = Number((openActions as any)?.c || 0);
  const total = facilities;
  const active = facilities;

  return {
    role: 'lender',
    user: { id: user.id, name: user.name, email: user.email },
    hero: {
      eyebrow: `Credit portfolio · ${todayStr()}`,
      title: `${greeting()}, ${firstName(user.name)}`,
      subtitle: `${active} active loan${active === 1 ? '' : 's'} of ${total} total · ${breached} covenant${breached === 1 ? '' : 's'} breached.`,
      primary_cta: { label: 'Open lender suite', href: '/lender-suite' },
    },
    kpis: [
      { key: 'facilities', label: 'Facilities', value: facilities, tone: 'good', href: '/lender-suite' },
      { key: 'covenants', label: 'Covenants monitored', value: covenants, tone: 'neutral', href: '/lender-suite' },
      { key: 'covenants_breached', label: 'Breached covenants', value: breached, tone: breached > 0 ? 'bad' : 'good', href: '/lender-suite' },
      { key: 'actions_open', label: 'Open workout actions', value: actionsN, tone: actionsN > 0 ? 'warn' : 'good', href: '/lender-suite?tab=actions' },
      { key: 'disbursements_pending', label: 'Pending disbursements', value: pending, tone: pending > 0 ? 'warn' : 'good', href: '/funds' },
      ...(await auditKpisFor(c.env, 'lender', '/lender-suite/audit'))
    ],
    workflows: [
      { key: 'origination', title: 'Loan origination', description: 'Term sheets, credit memo, syndication.', href: '/lender-suite', cta_label: 'Open suite', icon: 'savings' },
      { key: 'covenants', title: 'Covenant monitoring', description: 'DSCR, leverage, debt-service tests + AI cure-pathway advisor.', href: '/lender-suite', cta_label: 'Open covenants', icon: 'monitoring', metric: { label: 'breached', value: breached, tone: breached > 0 ? 'bad' : 'good' } },
      { key: 'actions', title: 'Workout queue', description: 'Cure plans, waivers, accelerations — one screen for every breach.', href: '/lender-suite?tab=actions', cta_label: 'Open queue', icon: 'gavel', metric: { label: 'open', value: actionsN, tone: actionsN > 0 ? 'warn' : 'good' } },
      { key: 'draws', title: 'Disbursement requests', description: 'Approve / reject / partial drawdowns.', href: '/funds', cta_label: 'Open draws', icon: 'request_quote', metric: { label: 'pending', value: pending, tone: pending > 0 ? 'warn' : 'good' } },
    ],
    ai_suggestions: [
      ...(breached > 0 && actionsN < breached
        ? [
            {
              key: 'covenant_breach_unaddressed',
              title: `${breached - actionsN} breach${breached - actionsN === 1 ? '' : 'es'} have no workout action yet`,
              why: 'Open the breach to get an AI-suggested cure / waiver / acceleration pathway with a confidence score.',
              confidence: 0.9,
              accept: { label: 'Open covenant queue', href: '/lender-suite' },
              dismiss: { label: 'Dismiss' },
            } as AiSuggestion,
          ]
        : []),
      ...(pending > 0
        ? [
            {
              key: 'draws_pending',
              title: `${pending} disbursement request${pending === 1 ? '' : 's'} pending decision`,
              why: 'Pending draws block construction milestones and accrue idle commitment fees.',
              confidence: 0.8,
              accept: { label: 'Open disbursements', href: '/funds' },
              dismiss: { label: 'Dismiss' },
            } as AiSuggestion,
          ]
        : []),
    ],
  };
}

async function buildGridOperatorBoard(c: any, user: any): Promise<LaunchPayload> {
  // L4: drive every count off the actual operator schema (migration 021
  // grid_connection_applications / curtailment_notices / grid_outages,
  // plus dispatch instructions). All counts wrapped in catch() so the
  // board still renders if any table is absent on an older deploy.
  const queueRow = await c.env.DB.prepare(
    `SELECT COUNT(*) AS c FROM grid_connection_applications
       WHERE status NOT IN ('approved','rejected','withdrawn')`,
  ).first().catch(() => null as any);
  const curtailRow = await c.env.DB.prepare(
    `SELECT COUNT(*) AS c FROM curtailment_notices
       WHERE COALESCE(lifted_at, '') = ''`,
  ).first().catch(() => null as any);
  const outagesRow = await c.env.DB.prepare(
    `SELECT COUNT(*) AS c FROM grid_outages
       WHERE COALESCE(restored_at, '') = ''`,
  ).first().catch(() => null as any);
  const dispatchAckRow = await c.env.DB.prepare(
    `SELECT COUNT(*) AS c FROM grid_dispatch_schedules WHERE status = 'published'`,
  ).first().catch(() => null as any);
  const plantsRow = await c.env.DB.prepare(
    `SELECT COUNT(*) AS c FROM ipp_projects
       WHERE status IN ('operational','commercial_operations')`,
  ).first().catch(() => null as any);

  const connections = Number((queueRow as any)?.c || 0);
  const curtailments = Number((curtailRow as any)?.c || 0);
  const outages = Number((outagesRow as any)?.c || 0);
  const dispatch = Number((dispatchAckRow as any)?.c || 0);
  const plants = Number((plantsRow as any)?.c || 0);

  return {
    role: 'grid_operator',
    user: { id: user.id, name: user.name, email: user.email },
    hero: {
      eyebrow: `Grid operations · ${todayStr()}`,
      title: `${greeting()}, ${firstName(user.name)}`,
      subtitle: `${plants} operating plant${plants === 1 ? '' : 's'} · ${connections} application${connections === 1 ? '' : 's'} in queue · ${curtailments} active curtailment${curtailments === 1 ? '' : 's'} · ${outages} ongoing outage${outages === 1 ? '' : 's'}.`,
      primary_cta: { label: 'Open grid operations', href: '/grid-operator' },
    },
    kpis: [
      { key: 'connection_queue', label: 'Connection queue', value: connections, tone: connections > 5 ? 'warn' : connections > 0 ? 'neutral' : 'good', href: '/grid-operator' },
      { key: 'curtailments', label: 'Active curtailments', value: curtailments, tone: curtailments > 0 ? 'warn' : 'good', href: '/grid-operator' },
      { key: 'outages', label: 'Ongoing outages', value: outages, tone: outages > 0 ? 'bad' : 'good', href: '/grid-operator' },
      { key: 'dispatch_active', label: 'Live dispatch schedules', value: dispatch, tone: 'neutral', href: '/grid-operator' },
      { key: 'operational_plants', label: 'Operating plants', value: plants, tone: 'good', href: '/grid' },
      ...(await auditKpisFor(c.env, 'grid', '/grid-operator/workstation?tab=audit'))
    ],
    workflows: [
      { key: 'queue', title: 'Connection queue', description: 'Grid connection applications + EIA gates + advance / reject.', href: '/grid-operator', cta_label: 'Open queue', icon: 'cable', metric: { label: 'pending', value: connections, tone: connections > 0 ? 'warn' : 'good' } },
      { key: 'curtailments', title: 'Active curtailments', description: 'Issue, monitor, lift curtailment notices.', href: '/grid-operator', cta_label: 'Open curtailments', icon: 'bolt', metric: { label: 'active', value: curtailments, tone: curtailments > 0 ? 'warn' : 'good' } },
      { key: 'outages', title: 'Outage management', description: 'Report, update, restore grid outages with incident timeline.', href: '/grid-operator', cta_label: 'Open outages', icon: 'alert', metric: { label: 'ongoing', value: outages, tone: outages > 0 ? 'bad' : 'good' } },
      { key: 'dispatch', title: 'Dispatch + ancillary services', description: 'Publish schedules, issue dispatch instructions, clear ancillary tenders.', href: '/grid-operator', cta_label: 'Open dispatch', icon: 'gauge' },
      { key: 'imbalance', title: 'Imbalance settlement', description: 'Imbalance events, settlement runs.', href: '/settlement', cta_label: 'Open settlement', icon: 'balance' },
    ],
    ai_suggestions: [
      ...(outages > 0
        ? [
            {
              key: 'outage_active',
              title: `${outages} grid outage${outages === 1 ? ' is' : 's are'} ongoing`,
              why: 'Active outages disrupt dispatch and trigger imbalance charges. Confirm ETA + customer comms within the SLA window.',
              confidence: 0.9,
              accept: { label: 'Open outage console', href: '/grid-operator' },
              dismiss: { label: 'Dismiss' },
            } as AiSuggestion,
          ]
        : []),
      ...(connections > 5
        ? [
            {
              key: 'queue_backlog',
              title: `Connection queue at ${connections} applications`,
              why: 'Queue ≥6 typically indicates a substation bottleneck. Triage the oldest applications and surface capacity constraints to the regulator.',
              confidence: 0.78,
              accept: { label: 'Open queue', href: '/grid-operator' },
              dismiss: { label: 'Dismiss' },
            } as AiSuggestion,
          ]
        : []),
    ],
  };
}

async function buildRegulatorBoard(c: any, user: any): Promise<LaunchPayload> {
  // Drive every count off real regulator tables (migration 030+):
  // reg_licence_applications / reg_tariff_applications / regulator_
  // surveillance_alerts / regulator_enforcement_cases / regulator_
  // determinations. Each query wrapped in .catch so absent tables on
  // older deploys quietly fall back to zero.
  const licApps = await c.env.DB.prepare(
    `SELECT COUNT(*) AS c FROM reg_licence_applications
       WHERE status IN ('submitted','under_review','clarification')`,
  ).first().catch(() => null as any);
  const tariffApps = await c.env.DB.prepare(
    `SELECT COUNT(*) AS c FROM reg_tariff_applications
       WHERE status IN ('submitted','under_review','hearing_scheduled')`,
  ).first().catch(() => null as any);
  const alertsOpen = await c.env.DB.prepare(
    `SELECT COUNT(*) AS c FROM regulator_surveillance_alerts
       WHERE status IN ('open','triaged','investigating')`,
  ).first().catch(() => null as any);
  const enforcementOpen = await c.env.DB.prepare(
    `SELECT COUNT(*) AS c FROM regulator_enforcement_cases
       WHERE status IN ('open','investigating','hearing','appealed')`,
  ).first().catch(() => null as any);
  const determinationsRecent = await c.env.DB.prepare(
    `SELECT COUNT(*) AS c FROM regulator_determinations
       WHERE published_at >= datetime('now','-30 days')`,
  ).first().catch(() => null as any);

  const lic = Number((licApps as any)?.c || 0);
  const tar = Number((tariffApps as any)?.c || 0);
  const alerts = Number((alertsOpen as any)?.c || 0);
  const enf = Number((enforcementOpen as any)?.c || 0);
  const det30 = Number((determinationsRecent as any)?.c || 0);

  return {
    role: 'regulator',
    user: { id: user.id, name: user.name, email: user.email },
    hero: {
      eyebrow: `Market oversight · ${todayStr()}`,
      title: `${greeting()}, ${firstName(user.name)}`,
      subtitle: `${lic} licence + ${tar} tariff application${tar === 1 ? '' : 's'} in flight · ${alerts} surveillance alert${alerts === 1 ? '' : 's'} open · ${enf} enforcement case${enf === 1 ? '' : 's'} live.`,
      primary_cta: { label: 'Open oversight console', href: '/regulator-suite' },
    },
    kpis: [
      { key: 'licence_apps', label: 'Licence applications', value: lic, tone: lic > 0 ? 'warn' : 'good', href: '/regulator-suite' },
      { key: 'tariff_apps', label: 'Tariff applications', value: tar, tone: tar > 0 ? 'warn' : 'good', href: '/regulator-suite' },
      { key: 'surveillance_alerts', label: 'Surveillance alerts', value: alerts, tone: alerts > 0 ? 'bad' : 'good', href: '/regulator-suite' },
      { key: 'enforcement_open', label: 'Enforcement cases', value: enf, tone: enf > 0 ? 'warn' : 'good', href: '/regulator-suite' },
      { key: 'determinations_30d', label: 'Determinations 30d', value: det30, tone: 'neutral', href: '/regulator-suite' },
      ...(await auditKpisFor(c.env, 'regulator', '/regulator-suite/workstation?tab=audit'))
    ],
    workflows: [
      { key: 'licences', title: 'Licence applications', description: 'Triage, grant, vary, suspend, revoke; CP audit trail.', href: '/regulator-suite', cta_label: 'Open licences', icon: 'badge', metric: { label: 'in flight', value: lic, tone: lic > 0 ? 'warn' : 'good' } },
      { key: 'tariffs', title: 'Tariff determinations', description: 'Tariff submissions, hearings, determinations register.', href: '/regulator-suite', cta_label: 'Open tariffs', icon: 'scale', metric: { label: 'open', value: tar, tone: tar > 0 ? 'warn' : 'good' } },
      { key: 'surveillance', title: 'Market surveillance', description: 'Trading abuse signals + concentration + abnormal-volume alerts.', href: '/regulator-suite', cta_label: 'Open surveillance', icon: 'shield', metric: { label: 'open', value: alerts, tone: alerts > 0 ? 'bad' : 'good' } },
      { key: 'enforcement', title: 'Enforcement', description: 'Investigations, findings, appeals.', href: '/regulator-suite', cta_label: 'Open enforcement', icon: 'gavel', metric: { label: 'live', value: enf, tone: enf > 0 ? 'warn' : 'good' } },
      { key: 'intelligence', title: 'Market intelligence', description: 'Pricing, volume, concentration views over the whole market.', href: '/intelligence', cta_label: 'Open intelligence', icon: 'insights' },
    ],
    ai_suggestions: [
      ...(alerts >= 3
        ? [
            {
              key: 'surveillance_spike',
              title: `${alerts} surveillance alerts open`,
              why: 'Alert backlog ≥3 may indicate a misbehaving venue or counterparty cluster. Triage the highest-severity bucket first.',
              confidence: 0.82,
              accept: { label: 'Open surveillance', href: '/regulator-suite' },
              dismiss: { label: 'Dismiss' },
            } as AiSuggestion,
          ]
        : []),
      ...(enf > 0
        ? [
            {
              key: 'enforcement_live',
              title: `${enf} enforcement case${enf === 1 ? '' : 's'} live`,
              why: 'Each case has a statutory clock. Open the queue and confirm the next hearing date is set within the SLA.',
              confidence: 0.85,
              accept: { label: 'Open enforcement', href: '/regulator-suite' },
              dismiss: { label: 'Dismiss' },
            } as AiSuggestion,
          ]
        : []),
    ],
  };
}

async function buildCarbonFundBoard(c: any, user: any): Promise<LaunchPayload> {
  // L4: drive counts off carbon_holdings + carbon_retirements +
  // carbon_trades + cdr_projects + cdr_offtakes + carbon_fund_nav. Each
  // query wrapped in .catch so older deploys fall back to zero.
  const holdingsRow = await c.env.DB.prepare(
    `SELECT COUNT(*) AS c, COALESCE(SUM(quantity), 0) AS q
       FROM carbon_holdings WHERE participant_id = ?`,
  ).bind(user.id).first().catch(() => null as any);
  const retirementsRow = await c.env.DB.prepare(
    `SELECT COUNT(*) AS c FROM carbon_retirements WHERE participant_id = ?`,
  ).bind(user.id).first().catch(() => null as any);
  const cdrProjectsRow = await c.env.DB.prepare(
    `SELECT COUNT(*) AS c FROM cdr_projects WHERE developer_id = ?`,
  ).bind(user.id).first().catch(() => null as any);
  const cdrOfftakesRow = await c.env.DB.prepare(
    `SELECT COUNT(*) AS c FROM cdr_offtakes WHERE buyer_participant_id = ?`,
  ).bind(user.id).first().catch(() => null as any);
  const trades30dRow = await c.env.DB.prepare(
    `SELECT COUNT(*) AS c FROM carbon_trades
       WHERE (buyer_id = ? OR seller_id = ?)
         AND traded_at >= datetime('now','-30 days')`,
  ).bind(user.id, user.id).first().catch(() => null as any);
  const navRow = await c.env.DB.prepare(
    `SELECT nav_zar FROM carbon_fund_nav WHERE participant_id = ?
      ORDER BY snapshot_date DESC LIMIT 1`,
  ).bind(user.id).first().catch(() => null as any);

  const holdings = Number((holdingsRow as any)?.c || 0);
  const holdingsQty = Number((holdingsRow as any)?.q || 0);
  const retirements = Number((retirementsRow as any)?.c || 0);
  const cdr = Number((cdrProjectsRow as any)?.c || 0);
  const offtakes = Number((cdrOfftakesRow as any)?.c || 0);
  const trades30 = Number((trades30dRow as any)?.c || 0);
  const navZar = Math.round(Number((navRow as any)?.nav_zar || 0));

  return {
    role: 'carbon_fund',
    user: { id: user.id, name: user.name, email: user.email },
    hero: {
      eyebrow: `Carbon fund · ${todayStr()}`,
      title: `${greeting()}, ${firstName(user.name)}`,
      subtitle: `${holdings} holding${holdings === 1 ? '' : 's'} (~${Math.round(holdingsQty).toLocaleString()} tCO₂e) · ${retirements} retirement${retirements === 1 ? '' : 's'} · ${cdr} CDR project${cdr === 1 ? '' : 's'} on book.`,
      primary_cta: { label: 'Open carbon registry', href: '/carbon-registry' },
    },
    kpis: [
      { key: 'holdings', label: 'Active holdings', value: holdings, tone: 'good', href: '/carbon' },
      { key: 'holdings_qty', label: 'Holdings tCO₂e', value: Math.round(holdingsQty), tone: 'neutral', href: '/carbon' },
      { key: 'retirements', label: 'Retirements issued', value: retirements, tone: 'good', href: '/carbon-registry' },
      { key: 'cdr_projects', label: 'CDR projects', value: cdr, tone: 'neutral', href: '/carbon-registry' },
      { key: 'cdr_offtakes', label: 'CDR offtakes', value: offtakes, tone: 'neutral', href: '/carbon-registry' },
      { key: 'trades_30d', label: '30d trades', value: trades30, tone: 'neutral', href: '/marketplace' },
      ...(navZar > 0
        ? ([{ key: 'nav', label: 'Latest NAV', value: navZar, unit: 'ZAR', tone: 'good' as Tone, href: '/carbon-registry' }] as Kpi[])
        : []),
      ...(await auditKpisFor(c.env, 'carbon', '/carbon-registry/workstation?tab=audit'))
    ],
    workflows: [
      { key: 'carbon', title: 'Carbon book', description: 'Holdings, vintages, transfers — single view of the active book.', href: '/carbon', cta_label: 'Open carbon', icon: 'eco', metric: { label: 'holdings', value: holdings, tone: 'good' } },
      { key: 'registry', title: 'Registry & retirements', description: 'CDR projects, retirements, certificate issuance, registry sync.', href: '/carbon-registry', cta_label: 'Open registry', icon: 'leaf', metric: { label: 'retirements', value: retirements, tone: 'good' } },
      { key: 'marketplace', title: 'Marketplace', description: 'Buy / sell credits, spot + options.', href: '/marketplace', cta_label: 'Open marketplace', icon: 'store', metric: { label: '30d', value: trades30, tone: 'neutral' } },
      { key: 'mrv', title: 'MRV submissions', description: 'Measurement-reporting-verification cadence + assurance.', href: '/carbon-registry', cta_label: 'Open MRV', icon: 'check-circle' },
    ],
    ai_suggestions: [
      ...(cdr > 0 && offtakes < cdr
        ? [
            {
              key: 'cdr_offtake_gap',
              title: `${cdr - offtakes} CDR project${cdr - offtakes === 1 ? '' : 's'} have no offtake`,
              why: 'Unsold CDR pipeline accrues storage + verification cost. Open the offtake desk to match with buyer demand.',
              confidence: 0.78,
              accept: { label: 'Open offtakes', href: '/carbon-registry' },
              dismiss: { label: 'Dismiss' },
            } as AiSuggestion,
          ]
        : []),
      ...(holdings > 0 && retirements === 0
        ? [
            {
              key: 'no_retirements',
              title: 'Holdings on book but no retirements yet',
              why: 'Buyers demand retirement certificates as proof of decarbonisation. Retire eligible vintages to monetise the demand premium.',
              confidence: 0.72,
              accept: { label: 'Open registry', href: '/carbon-registry' },
              dismiss: { label: 'Dismiss' },
            } as AiSuggestion,
          ]
        : []),
    ],
  };
}

async function buildAdminBoard(c: any, user: any): Promise<LaunchPayload> {
  // L4: drive counts off real schemas (participants / contract_documents
  // / invoices / cascade_dlq / cron_health). Cascade DLQ + cron health
  // surface operational issues so the admin sees system-pain as well as
  // commercial-health.
  const r = await c.env.DB.prepare(`
    SELECT
      (SELECT COUNT(*) FROM participants)                                                AS users_total,
      (SELECT COUNT(*) FROM participants WHERE kyc_status = 'pending')                   AS kyc_pending,
      (SELECT COUNT(*) FROM contract_documents WHERE phase = 'active')                   AS contracts_active,
      (SELECT COALESCE(SUM(total_amount), 0) FROM invoices WHERE status = 'paid')        AS revenue_paid
  `)
    .first()
    .catch(() => ({}));

  const cascadeDlqRow = await c.env.DB.prepare(
    `SELECT COUNT(*) AS c FROM cascade_dlq WHERE COALESCE(resolved_at, '') = ''`,
  ).first().catch(() => null as any);
  const settlementDlqRow = await c.env.DB.prepare(
    `SELECT COUNT(*) AS c FROM settlement_dlq WHERE status IN ('open','retrying')`,
  ).first().catch(() => null as any);
  const activeTenantsRow = await c.env.DB.prepare(
    `SELECT COUNT(*) AS c FROM participants WHERE COALESCE(suspended_at, '') = ''`,
  ).first().catch(() => null as any);

  const users = Number((r as any)?.users_total || 0);
  const kyc = Number((r as any)?.kyc_pending || 0);
  const contracts = Number((r as any)?.contracts_active || 0);
  const revenue = Math.round(Number((r as any)?.revenue_paid || 0));
  const cascadeDlq = Number((cascadeDlqRow as any)?.c || 0);
  const settlementDlq = Number((settlementDlqRow as any)?.c || 0);
  const activeTenants = Number((activeTenantsRow as any)?.c || users);

  return {
    role: 'admin',
    user: { id: user.id, name: user.name, email: user.email },
    hero: {
      eyebrow: `Platform admin · ${todayStr()}`,
      title: `${greeting()}, ${firstName(user.name)}`,
      subtitle: `${activeTenants} active user${activeTenants === 1 ? '' : 's'} · ${kyc} KYC pending · ${contracts} active contract${contracts === 1 ? '' : 's'} · revenue R${revenue.toLocaleString()} settled · ${cascadeDlq + settlementDlq} item${(cascadeDlq + settlementDlq) === 1 ? '' : 's'} in DLQ.`,
      primary_cta: { label: 'Open admin console', href: '/admin-platform' },
    },
    kpis: [
      { key: 'users_total', label: 'Users', value: users, tone: 'neutral', href: '/admin-platform' },
      { key: 'tenants_active', label: 'Active tenants', value: activeTenants, tone: 'good', href: '/admin-platform' },
      { key: 'kyc_pending', label: 'KYC pending', value: kyc, tone: kyc > 0 ? 'warn' : 'good', href: '/admin-platform' },
      { key: 'contracts_active', label: 'Active contracts', value: contracts, tone: 'good', href: '/contracts' },
      { key: 'revenue_paid', label: 'Settled revenue', value: revenue, unit: 'ZAR', tone: 'good', href: '/reports' },
      { key: 'cascade_dlq', label: 'Cascade DLQ', value: cascadeDlq, tone: cascadeDlq > 0 ? 'bad' : 'good', href: '/admin/monitoring' },
      { key: 'settlement_dlq', label: 'Settlement DLQ', value: settlementDlq, tone: settlementDlq > 0 ? 'bad' : 'good', href: '/admin/monitoring' },
      ...(await auditKpisFor(c.env, 'admin', '/admin-platform/workstation?tab=platform_audit'))
    ],
    workflows: [
      { key: 'platform', title: 'Tenants & users', description: 'Tenants, billing, user accounts, roles, role overrides.', href: '/admin-platform', cta_label: 'Open platform', icon: 'team', metric: { label: 'active', value: activeTenants, tone: 'good' } },
      { key: 'monitoring', title: 'System health', description: 'Cron jobs, DLQ, cascade health, audit trail.', href: '/admin/monitoring', cta_label: 'Open monitoring', icon: 'gauge', metric: { label: 'DLQ', value: cascadeDlq + settlementDlq, tone: (cascadeDlq + settlementDlq) > 0 ? 'bad' : 'good' } },
      { key: 'reports', title: 'Revenue & reports', description: 'Settled revenue, churn, MRR, regulatory reports.', href: '/reports', cta_label: 'Open reports', icon: 'report' },
      { key: 'support', title: 'Support escalations', description: 'Tickets, breaches, cross-tenant search.', href: '/support', cta_label: 'Open support', icon: 'help' },
    ],
    ai_suggestions: [
      ...(cascadeDlq + settlementDlq > 0
        ? [
            {
              key: 'dlq_drainage',
              title: `${cascadeDlq + settlementDlq} item${(cascadeDlq + settlementDlq) === 1 ? '' : 's'} stuck in DLQ`,
              why: 'Cascade + settlement DLQ items represent failed automation. Drain or escalate before they block downstream consumers.',
              confidence: 0.92,
              accept: { label: 'Open monitoring', href: '/admin/monitoring' },
              dismiss: { label: 'Dismiss' },
            } as AiSuggestion,
          ]
        : []),
      ...(kyc >= 5
        ? [
            {
              key: 'kyc_backlog',
              title: `${kyc} KYC application${kyc === 1 ? '' : 's'} pending`,
              why: 'KYC backlog ≥5 indicates throughput issue. Reassign reviewers or escalate to compliance.',
              confidence: 0.82,
              accept: { label: 'Open KYC queue', href: '/admin-platform' },
              dismiss: { label: 'Dismiss' },
            } as AiSuggestion,
          ]
        : []),
    ],
  };
}

async function buildSupportBoard(c: any, user: any): Promise<LaunchPayload> {
  // Support board surfaces operational state from the customer's
  // perspective: action queue assigned to support, urgent items, cascade
  // DLQ (so the team sees failed automations across all tenants), and
  // KYC pending (since support helps with onboarding).
  const r = await c.env.DB.prepare(`
    SELECT
      (SELECT COUNT(*) FROM action_queue WHERE assignee_id = ? AND status = 'pending')         AS my_queue,
      (SELECT COUNT(*) FROM action_queue WHERE assignee_id = ? AND status = 'pending' AND priority IN ('urgent','high'))  AS my_urgent,
      (SELECT COUNT(*) FROM participants WHERE kyc_status = 'pending')                          AS kyc_pending
  `)
    .bind(user.id, user.id)
    .first()
    .catch(() => ({}));

  const cascadeDlqRow = await c.env.DB.prepare(
    `SELECT COUNT(*) AS c FROM cascade_dlq WHERE COALESCE(resolved_at, '') = ''`,
  ).first().catch(() => null as any);
  const settlementDlqRow = await c.env.DB.prepare(
    `SELECT COUNT(*) AS c FROM settlement_dlq WHERE status IN ('open','retrying')`,
  ).first().catch(() => null as any);
  const recentlyResolvedRow = await c.env.DB.prepare(
    `SELECT COUNT(*) AS c FROM action_queue
       WHERE completed_by = ? AND completed_at >= datetime('now','-7 days')`,
  ).bind(user.id).first().catch(() => null as any);

  const queue = Number((r as any)?.my_queue || 0);
  const urgent = Number((r as any)?.my_urgent || 0);
  const kyc = Number((r as any)?.kyc_pending || 0);
  const cascadeDlq = Number((cascadeDlqRow as any)?.c || 0);
  const settlementDlq = Number((settlementDlqRow as any)?.c || 0);
  const resolved7d = Number((recentlyResolvedRow as any)?.c || 0);

  return {
    role: 'support',
    user: { id: user.id, name: user.name, email: user.email },
    hero: {
      eyebrow: `Support · ${todayStr()}`,
      title: `${greeting()}, ${firstName(user.name)}`,
      subtitle: `${queue} item${queue === 1 ? '' : 's'} in your queue${urgent > 0 ? ` (${urgent} urgent / high)` : ''} · ${resolved7d} resolved in last 7d.`,
      primary_cta: { label: 'Open support console', href: '/support' },
    },
    kpis: [
      { key: 'my_queue', label: 'My queue', value: queue, tone: queue > 0 ? 'warn' : 'good', href: '/support' },
      { key: 'my_urgent', label: 'Urgent / high', value: urgent, tone: urgent > 0 ? 'bad' : 'good', href: '/support?priority=urgent' },
      { key: 'kyc_pending', label: 'Onboarding queue', value: kyc, tone: kyc > 0 ? 'neutral' : 'good', href: '/admin-platform' },
      { key: 'cascade_dlq', label: 'Cascade DLQ', value: cascadeDlq, tone: cascadeDlq > 0 ? 'bad' : 'good', href: '/admin/monitoring' },
      { key: 'settlement_dlq', label: 'Settlement DLQ', value: settlementDlq, tone: settlementDlq > 0 ? 'bad' : 'good', href: '/admin/monitoring' },
      { key: 'resolved_7d', label: 'Resolved 7d', value: resolved7d, tone: 'good', href: '/support' },
      ...(await auditKpisFor(c.env, 'support', '/support/workstation?tab=audit'))
    ],
    workflows: [
      { key: 'support', title: 'Support console', description: 'Tickets, escalations, cross-tenant search, walkthroughs.', href: '/support', cta_label: 'Open support', icon: 'help', metric: { label: 'queue', value: queue, tone: queue > 0 ? 'warn' : 'good' } },
      { key: 'monitoring', title: 'System health', description: 'Watch cron, DLQ, cascade health alongside the team.', href: '/admin/monitoring', cta_label: 'Open monitoring', icon: 'gauge', metric: { label: 'DLQ', value: cascadeDlq + settlementDlq, tone: (cascadeDlq + settlementDlq) > 0 ? 'bad' : 'good' } },
      { key: 'kyc', title: 'KYC onboarding', description: 'Help applicants finish KYC; escalate to compliance when stuck.', href: '/admin-platform', cta_label: 'Open onboarding', icon: 'people', metric: { label: 'pending', value: kyc, tone: kyc > 0 ? 'neutral' : 'good' } },
    ],
    ai_suggestions: [
      ...(urgent > 0
        ? [
            {
              key: 'urgent_in_queue',
              title: `${urgent} urgent item${urgent === 1 ? '' : 's'} in your queue`,
              why: 'Urgent / high-priority tickets have tighter SLAs. Triage these before working low-priority items.',
              confidence: 0.95,
              accept: { label: 'Open urgent queue', href: '/support?priority=urgent' },
              dismiss: { label: 'Dismiss' },
            } as AiSuggestion,
          ]
        : []),
      ...(cascadeDlq + settlementDlq > 0
        ? [
            {
              key: 'dlq_visible',
              title: `${cascadeDlq + settlementDlq} item${(cascadeDlq + settlementDlq) === 1 ? '' : 's'} in DLQ across cascade + settlement`,
              why: 'DLQ items often translate into customer-visible failures. Get ahead of inbound tickets by checking the monitor.',
              confidence: 0.8,
              accept: { label: 'Open monitoring', href: '/admin/monitoring' },
              dismiss: { label: 'Dismiss' },
            } as AiSuggestion,
          ]
        : []),
    ],
  };
}

export default launch;
