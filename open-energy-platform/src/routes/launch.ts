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
// Per-role builders. Each returns a fully-shaped LaunchPayload.
// Queries are one-shot compound SELECTs against indexed columns.
// ───────────────────────────────────────────────────────────────────────

async function buildTraderBoard(c: any, user: any): Promise<LaunchPayload> {
  const r = await c.env.DB.prepare(`
    SELECT
      (SELECT COUNT(*) FROM trade_orders
        WHERE participant_id = ? AND status IN ('open','partial'))             AS open_orders,
      (SELECT COUNT(*) FROM trade_matches
        WHERE (buyer_id = ? OR seller_id = ?)
          AND matched_at >= datetime('now','-1 day'))                          AS fills_24h,
      (SELECT COALESCE(SUM(matched_volume_mwh * matched_price_zar), 0)
        FROM trade_matches
        WHERE (buyer_id = ? OR seller_id = ?)
          AND matched_at >= datetime('now','-1 day'))                          AS notional_24h,
      (SELECT COUNT(*) FROM trade_rejections
        WHERE participant_id = ?
          AND created_at >= datetime('now','-1 day'))                          AS rejections_24h
  `)
    .bind(user.id, user.id, user.id, user.id, user.id, user.id)
    .first()
    .catch(() => ({}));

  const marginRow = await c.env.DB.prepare(
    `SELECT COALESCE(SUM(amount_zar), 0) AS m FROM margin_reservations
      WHERE participant_id = ? AND status = 'reserved'`,
  )
    .bind(user.id)
    .first()
    .catch(() => ({ m: 0 } as any));

  const rejections = Number(r?.rejections_24h || 0);
  const openOrders = Number(r?.open_orders || 0);
  const fills24h = Number(r?.fills_24h || 0);
  const notional = Math.round(Number(r?.notional_24h || 0));
  const margin = Math.round(Number(marginRow?.m || 0));

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
    ],
    ai_suggestions: await buildTraderAiSuggestions(c, user, { openOrders, rejections }),
  };
}

async function buildTraderAiSuggestions(
  c: any,
  user: any,
  ctx: { openOrders: number; rejections: number },
): Promise<AiSuggestion[]> {
  const out: AiSuggestion[] = [];

  // Suggestion 1: if the trader has recent rejections, point at the most
  // common rejection code in the last 24h. The trader can click through.
  if (ctx.rejections >= 3) {
    const top = await c.env.DB.prepare(
      `SELECT reason_code, COUNT(*) AS c FROM trade_rejections
        WHERE participant_id = ? AND created_at >= datetime('now','-1 day')
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
  // 4 hours, suggest the trader review or expire it.
  const stale = await c.env.DB.prepare(
    `SELECT id, side, volume_mwh, price_zar, posted_at FROM trade_orders
      WHERE participant_id = ? AND status IN ('open','partial')
        AND posted_at <= datetime('now','-4 hours')
      ORDER BY posted_at ASC LIMIT 1`,
  )
    .bind(user.id)
    .first()
    .catch(() => null as any);
  if (stale) {
    out.push({
      key: `stale_order_${stale.id}`,
      title: `Stale ${stale.side} order on the book`,
      why: `Posted ${stale.posted_at} and still unfilled. Spread may have moved — re-price or cancel before margin churns.`,
      confidence: 0.66,
      accept: { label: 'Open order', href: `/trading?tab=orders&focus=${stale.id}` },
      dismiss: { label: 'Leave it' },
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
      (SELECT COUNT(*) FROM ipp_projects WHERE developer_id = ? AND status = 'operational')  AS projects_operational,
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
        key: 'om',
        title: 'O&M and generation',
        description: 'Asset telemetry from ASOBA Cloud, OODA alerts, fault tickets, OEM warranty register.',
        href: '/om',
        cta_label: 'Open O&M',
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
        WHERE raised_by = ? AND status = 'open')                              AS open_disputes
  `)
    .bind(user.id, user.id, user.id, user.id)
    .first()
    .catch(() => ({}));

  const overdue = await c.env.DB.prepare(
    `SELECT COUNT(*) AS c FROM invoices
       WHERE to_participant_id = ? AND status = 'overdue'`,
  )
    .bind(user.id)
    .first()
    .catch(() => null as any);

  const ppas = Number(r?.active_ppas || 0);
  const toPay = Number(r?.invoices_to_pay || 0);
  const toPayZar = Math.round(Number(r?.invoices_to_pay_zar || 0));
  const disputes = Number(r?.open_disputes || 0);
  const overdueN = Number(overdue?.c || 0);

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
    ],
    ai_suggestions: overdueN > 0
      ? [
          {
            key: 'overdue_dunning',
            title: `${overdueN} overdue invoice${overdueN === 1 ? '' : 's'} risk dunning fees`,
            why: 'Late payment fees typically accrue from day +7. Pay or dispute before dunning kicks in.',
            confidence: 0.92,
            accept: { label: 'Review overdue', href: '/settlement?direction=incoming&status=overdue' },
            dismiss: { label: 'Dismiss' },
          },
        ]
      : [],
  };
}

async function buildLenderBoard(c: any, user: any): Promise<LaunchPayload> {
  const r = await c.env.DB.prepare(`
    SELECT
      (SELECT COUNT(*) FROM loans WHERE lender_id = ?)                                 AS loans_total,
      (SELECT COUNT(*) FROM loans WHERE lender_id = ? AND status = 'active')           AS loans_active,
      (SELECT COUNT(*) FROM loan_covenants lc INNER JOIN loans l ON l.id = lc.loan_id
        WHERE l.lender_id = ? AND lc.status = 'breached')                              AS covenants_breached,
      (SELECT COUNT(*) FROM disbursement_requests dr INNER JOIN loans l ON l.id = dr.loan_id
        WHERE l.lender_id = ? AND dr.status = 'pending')                               AS disbursements_pending
  `)
    .bind(user.id, user.id, user.id, user.id)
    .first()
    .catch(() => ({}));

  const total = Number(r?.loans_total || 0);
  const active = Number(r?.loans_active || 0);
  const breached = Number(r?.covenants_breached || 0);
  const pending = Number(r?.disbursements_pending || 0);

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
      { key: 'loans_active', label: 'Active loans', value: active, tone: 'good', href: '/funds' },
      { key: 'covenants_breached', label: 'Breached covenants', value: breached, tone: breached > 0 ? 'bad' : 'good', href: '/lender-suite' },
      { key: 'disbursements_pending', label: 'Pending disbursements', value: pending, tone: pending > 0 ? 'warn' : 'good', href: '/funds' },
      { key: 'loans_total', label: 'Total loans', value: total, tone: 'neutral', href: '/funds' },
    ],
    workflows: [
      { key: 'origination', title: 'Loan origination', description: 'Term sheets, credit memo, syndication.', href: '/lender-suite', cta_label: 'Open suite', icon: 'savings' },
      { key: 'covenants', title: 'Covenant monitoring', description: 'DSCR, leverage, debt service tests.', href: '/lender-suite', cta_label: 'Open covenants', icon: 'monitoring', metric: { label: 'breached', value: breached, tone: breached > 0 ? 'bad' : 'good' } },
      { key: 'draws', title: 'Disbursement requests', description: 'Approve / reject / partial drawdowns.', href: '/funds', cta_label: 'Open draws', icon: 'request_quote', metric: { label: 'pending', value: pending, tone: pending > 0 ? 'warn' : 'good' } },
    ],
    ai_suggestions: breached > 0
      ? [
          {
            key: 'covenant_breach',
            title: `${breached} covenant${breached === 1 ? '' : 's'} in breach`,
            why: 'Workout window opens once a breach is recorded. Review and decide cure / waiver / acceleration within 30 days.',
            confidence: 0.95,
            accept: { label: 'Open covenant workout', href: '/lender-suite' },
            dismiss: { label: 'Dismiss' },
          },
        ]
      : [],
  };
}

async function buildGridOperatorBoard(c: any, user: any): Promise<LaunchPayload> {
  const r = await c.env.DB.prepare(`
    SELECT
      (SELECT COUNT(*) FROM connection_queue WHERE status = 'pending')                 AS connection_pending,
      (SELECT COUNT(*) FROM imbalance_events
        WHERE created_at >= datetime('now','-1 day'))                                   AS imbalance_24h,
      (SELECT COUNT(*) FROM ipp_projects WHERE status = 'operational')                  AS operational_plants
  `)
    .first()
    .catch(() => ({}));

  const connections = Number(r?.connection_pending || 0);
  const imb = Number(r?.imbalance_24h || 0);
  const plants = Number(r?.operational_plants || 0);

  return {
    role: 'grid_operator',
    user: { id: user.id, name: user.name, email: user.email },
    hero: {
      eyebrow: `Grid operations · ${todayStr()}`,
      title: `${greeting()}, ${firstName(user.name)}`,
      subtitle: `${plants} operating plant${plants === 1 ? '' : 's'} · ${connections} connection request${connections === 1 ? '' : 's'} pending · ${imb} imbalance event${imb === 1 ? '' : 's'} in 24h.`,
      primary_cta: { label: 'Open grid operations', href: '/grid' },
    },
    kpis: [
      { key: 'connection_pending', label: 'Connection queue', value: connections, tone: connections > 0 ? 'warn' : 'good', href: '/grid-operator' },
      { key: 'imbalance_24h', label: 'Imbalance events 24h', value: imb, tone: imb > 0 ? 'warn' : 'good', href: '/grid' },
      { key: 'operational_plants', label: 'Operating plants', value: plants, tone: 'good', href: '/grid' },
    ],
    workflows: [
      { key: 'grid', title: 'Live grid', description: 'Frequency, wheeling, demand response.', href: '/grid', cta_label: 'Open grid', icon: 'bolt' },
      { key: 'connections', title: 'Connection queue', description: 'Grid connection applications, EIA gates.', href: '/grid-operator', cta_label: 'Open queue', icon: 'cable', metric: { label: 'pending', value: connections, tone: connections > 0 ? 'warn' : 'good' } },
      { key: 'imbalance', title: 'Imbalance settlement', description: 'Imbalance events, settlement runs.', href: '/settlement', cta_label: 'Open settlement', icon: 'balance' },
    ],
    ai_suggestions: [],
  };
}

async function buildRegulatorBoard(c: any, user: any): Promise<LaunchPayload> {
  const r = await c.env.DB.prepare(`
    SELECT
      (SELECT COUNT(*) FROM participants WHERE kyc_status = 'pending')                  AS licences_pending,
      (SELECT COUNT(*) FROM settlement_disputes WHERE status IN ('open','under_review')) AS market_disputes,
      (SELECT COUNT(*) FROM ipp_projects)                                                AS projects_total
  `)
    .first()
    .catch(() => ({}));

  const lic = Number(r?.licences_pending || 0);
  const disp = Number(r?.market_disputes || 0);
  const projects = Number(r?.projects_total || 0);

  return {
    role: 'regulator',
    user: { id: user.id, name: user.name, email: user.email },
    hero: {
      eyebrow: `Market oversight · ${todayStr()}`,
      title: `${greeting()}, ${firstName(user.name)}`,
      subtitle: `${lic} licence application${lic === 1 ? '' : 's'} pending · ${disp} active market dispute${disp === 1 ? '' : 's'} · ${projects} project${projects === 1 ? '' : 's'} on register.`,
      primary_cta: { label: 'Open oversight console', href: '/regulator-suite' },
    },
    kpis: [
      { key: 'licences_pending', label: 'Licences pending', value: lic, tone: lic > 0 ? 'warn' : 'good', href: '/regulator-suite' },
      { key: 'market_disputes', label: 'Market disputes', value: disp, tone: disp > 0 ? 'warn' : 'good', href: '/regulator-suite' },
      { key: 'projects_total', label: 'Projects on register', value: projects, tone: 'neutral', href: '/regulator-suite' },
    ],
    workflows: [
      { key: 'oversight', title: 'Oversight console', description: 'Licences, submissions, investigations, determinations.', href: '/regulator-suite', cta_label: 'Open console', icon: 'gavel' },
      { key: 'consultations', title: 'Public consultations', description: 'Open consultations, written submissions, responses.', href: '/regulator-suite', cta_label: 'Open consultations', icon: 'forum' },
      { key: 'intelligence', title: 'Market intelligence', description: 'Pricing, volume, concentration, abuse signals.', href: '/intelligence', cta_label: 'Open intelligence', icon: 'insights' },
    ],
    ai_suggestions: [],
  };
}

async function buildCarbonFundBoard(c: any, user: any): Promise<LaunchPayload> {
  const r = await c.env.DB.prepare(`
    SELECT
      (SELECT COUNT(*) FROM carbon_holdings WHERE participant_id = ?)                    AS holdings,
      (SELECT COUNT(*) FROM carbon_retirements WHERE participant_id = ?)                 AS retirements,
      (SELECT COUNT(*) FROM cdr_projects WHERE developer_id = ?)                         AS cdr_projects
  `)
    .bind(user.id, user.id, user.id)
    .first()
    .catch(() => ({}));

  const holdings = Number(r?.holdings || 0);
  const retirements = Number(r?.retirements || 0);
  const cdr = Number(r?.cdr_projects || 0);

  return {
    role: 'carbon_fund',
    user: { id: user.id, name: user.name, email: user.email },
    hero: {
      eyebrow: `Carbon fund · ${todayStr()}`,
      title: `${greeting()}, ${firstName(user.name)}`,
      subtitle: `${holdings} active holding${holdings === 1 ? '' : 's'} · ${retirements} certificate${retirements === 1 ? '' : 's'} issued · ${cdr} CDR project${cdr === 1 ? '' : 's'}.`,
      primary_cta: { label: 'Open carbon registry', href: '/carbon-registry' },
    },
    kpis: [
      { key: 'holdings', label: 'Active holdings', value: holdings, tone: 'good', href: '/carbon' },
      { key: 'retirements', label: 'Retirements issued', value: retirements, tone: 'good', href: '/carbon-registry' },
      { key: 'cdr_projects', label: 'CDR projects', value: cdr, tone: 'neutral', href: '/carbon-registry' },
    ],
    workflows: [
      { key: 'carbon', title: 'Carbon book', description: 'Holdings, vintages, transfers.', href: '/carbon', cta_label: 'Open carbon', icon: 'eco' },
      { key: 'registry', title: 'Registry & retirements', description: 'CDR projects, retirements, certificate issuance.', href: '/carbon-registry', cta_label: 'Open registry', icon: 'verified' },
      { key: 'marketplace', title: 'Marketplace', description: 'Buy / sell credits, spot + options.', href: '/marketplace', cta_label: 'Open marketplace', icon: 'storefront' },
    ],
    ai_suggestions: [],
  };
}

async function buildAdminBoard(c: any, user: any): Promise<LaunchPayload> {
  const r = await c.env.DB.prepare(`
    SELECT
      (SELECT COUNT(*) FROM participants)                                                AS users_total,
      (SELECT COUNT(*) FROM participants WHERE kyc_status = 'pending')                   AS kyc_pending,
      (SELECT COUNT(*) FROM contract_documents WHERE phase = 'active')                   AS contracts_active,
      (SELECT COALESCE(SUM(total_amount), 0) FROM invoices WHERE status = 'paid')        AS revenue_paid
  `)
    .first()
    .catch(() => ({}));

  const users = Number(r?.users_total || 0);
  const kyc = Number(r?.kyc_pending || 0);
  const contracts = Number(r?.contracts_active || 0);
  const revenue = Math.round(Number(r?.revenue_paid || 0));

  return {
    role: 'admin',
    user: { id: user.id, name: user.name, email: user.email },
    hero: {
      eyebrow: `Platform admin · ${todayStr()}`,
      title: `${greeting()}, ${firstName(user.name)}`,
      subtitle: `${users} user${users === 1 ? '' : 's'} · ${kyc} KYC pending · ${contracts} active contract${contracts === 1 ? '' : 's'} · revenue R${revenue.toLocaleString()} settled.`,
      primary_cta: { label: 'Open admin console', href: '/admin' },
    },
    kpis: [
      { key: 'users_total', label: 'Users', value: users, tone: 'neutral', href: '/admin-platform' },
      { key: 'kyc_pending', label: 'KYC pending', value: kyc, tone: kyc > 0 ? 'warn' : 'good', href: '/admin-platform' },
      { key: 'contracts_active', label: 'Active contracts', value: contracts, tone: 'good', href: '/contracts' },
      { key: 'revenue_paid', label: 'Settled revenue (ZAR)', value: revenue, tone: 'good', href: '/reports' },
    ],
    workflows: [
      { key: 'platform', title: 'Tenants & users', description: 'Tenants, billing, user accounts, roles.', href: '/admin-platform', cta_label: 'Open platform', icon: 'manage_accounts' },
      { key: 'monitoring', title: 'System health', description: 'Cron jobs, DLQ, cascade health, audit.', href: '/admin/monitoring', cta_label: 'Open monitoring', icon: 'monitor_heart' },
      { key: 'support', title: 'Support escalations', description: 'Tickets, breaches, cross-tenant search.', href: '/support', cta_label: 'Open support', icon: 'support_agent' },
    ],
    ai_suggestions: [],
  };
}

async function buildSupportBoard(c: any, user: any): Promise<LaunchPayload> {
  const r = await c.env.DB.prepare(`
    SELECT
      (SELECT COUNT(*) FROM action_queue WHERE assignee_id = ? AND status = 'pending')   AS my_queue,
      (SELECT COUNT(*) FROM participants WHERE kyc_status = 'pending')                   AS kyc_pending
  `)
    .bind(user.id)
    .first()
    .catch(() => ({}));

  const queue = Number(r?.my_queue || 0);
  const kyc = Number(r?.kyc_pending || 0);

  return {
    role: 'support',
    user: { id: user.id, name: user.name, email: user.email },
    hero: {
      eyebrow: `Support · ${todayStr()}`,
      title: `${greeting()}, ${firstName(user.name)}`,
      subtitle: `${queue} item${queue === 1 ? '' : 's'} in your queue.`,
      primary_cta: { label: 'Open support console', href: '/support' },
    },
    kpis: [
      { key: 'my_queue', label: 'My queue', value: queue, tone: queue > 0 ? 'warn' : 'good', href: '/support' },
      { key: 'kyc_pending', label: 'Onboarding queue', value: kyc, tone: kyc > 0 ? 'neutral' : 'good', href: '/admin-platform' },
    ],
    workflows: [
      { key: 'support', title: 'Support console', description: 'Tickets, escalations, cross-tenant search.', href: '/support', cta_label: 'Open support', icon: 'support_agent' },
      { key: 'monitoring', title: 'System health', description: 'Watch cron, DLQ, cascade health alongside the team.', href: '/admin/monitoring', cta_label: 'Open monitoring', icon: 'monitor_heart' },
    ],
    ai_suggestions: [],
  };
}

export default launch;
