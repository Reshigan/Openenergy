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
      {
        // W124 Phase-C wave 3 — STRATE / SWIFT settlement connector.
        key: 'strate-swift-connectors',
        title: 'Settlement rails (W124)',
        description: 'Phase-C wave 3. MONEY-IN/MONEY-OUT financial settlement spine: STRATE (SA CSD T+3/T+1) + SWIFT MT/MX (ISO 20022 pacs/camt/pain) + SARB SAMOS RTGS + SADC RTGS + commercial bank EFT/ACH. 12-state forward + 4 branch chain, INVERTED SLA hours (domestic_eft 168 / multi_bank_eft 240 / strate_csd 360 / samos_rtgs 480 / swift_global 720). FLOOR-AT-SAMOS-RTGS ≥1 / FLOOR-AT-SWIFT-GLOBAL ≥3 of 5 flags. SIGNATURE: revoke_credential crosses SARB ExCon + FIC Act + Basel III + CPMI-IOSCO PFMI Principle 9 EVERY tier. mTLS-gated PUBLIC peer endpoint via x-mtls-cert-fingerprint.',
        href: '/trader-risk/workstation?tab=strate-swift-connectors',
        cta_label: 'Open settlement rails',
        icon: 'account_balance',
      },
      {
        // W125 Phase-C wave 4 — SAP / Oracle ERP connector.
        key: 'sap-oracle-erp-connectors',
        title: 'ERP connectors (W125)',
        description: 'Phase-C wave 4. Period-close GL spine to enterprise ERP back-office: SAP S/4HANA OData + IDoc FIDCC1/FIDCC2 + Oracle Fusion/EBS SOAP + Workday + Sage 300 + Dynamics 365 + NetSuite + Epicor + IFS. 12-state forward + 4 branch chain, INVERTED SLA hours (single_module 168 / multi_module 240 / multi_company_code 360 / multi_entity_consolidation 480 / multi_country 720). FLOOR-AT-ENTERPRISE-WIDE ≥1 / FLOOR-AT-MULTI-COUNTRY ≥3 of 5 flags (SOX 404 / IFRS consol. / Transfer pricing / SARS critical / CIPC gate). SIGNATURE: revoke_credential crosses SOX 404 + IFRS 15/9/16/17 + SARS e-Filing + CIPC + SOC 1 Type II + ISO 27001 + PCAOB AS 5 EVERY tier. mTLS-gated PUBLIC peer endpoint via x-mtls-cert-fingerprint. Shares settlement audit namespace with W124.',
        href: '/trader-risk/workstation?tab=sap-oracle-erp-connectors',
        cta_label: 'Open ERP connectors',
        icon: 'account_tree',
      },
      {
        // W126 Phase-C wave 5 of 5 - FINAL Phase-C connector wave.
        // CIPC / SARS / NERSA government filing APIs connector.
        key: 'government-filing-connectors',
        title: 'Filing connectors (W126)',
        description: 'Phase-C wave 5 of 5 (FINAL Phase-C connector). Statutory filing spine to SA government APIs: CIPC Annual Return XML + SARS e-Filing (IT14 / VAT201 / EMP201 / IRP5) + NERSA quarterly returns + DMRE compliance + DFFE GHG + PAIA + SARB FX + FIC STR + FSCA conduct + Treasury MFMA + municipal. 12-state forward + 4 branch chain, INVERTED SLA hours (single_entity 168 / multi_entity 240 / multi_jurisdiction 360 / systemic_critical 480 / national_statutory 720). FLOOR-AT-MULTI-JURISDICTION (>=1) / FLOOR-AT-SYSTEMIC-CRITICAL (>=3) on 5 flags (Companies Act lateness penalty / SARS admin penalty / NERSA levy arrears / DFFE GHG threshold / PAIA SAR open). SIGNATURE: revoke_credential crosses EVERY tier; activate_failover crosses multi_jurisdiction+systemic_critical; disconnect EVERY tier when Companies Act OR SARS admin penalty active. mTLS-gated PUBLIC peer endpoint via x-mtls-cert-fingerprint. Opens the new regulator audit namespace. Cron 0 2 * * * daily filing-deadline sweep.',
        href: '/trader-risk/workstation?tab=government-filing-connectors',
        cta_label: 'Open filing connectors',
        icon: 'gavel',
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
      {
        key: 'wbs_schedule',
        title: 'WBS & Gantt schedule',
        description: 'AACE 27R-03 + PMBOK 7 P6 schedule chain: baseline → execution → variance → rebaseline → recovery, with CPI/SPI/SV/CV live, critical-path float, and tier-aware regulator crossings on late finish.',
        href: '/ipp-lifecycle/workstation?tab=wbs_schedule',
        cta_label: 'Open WBS schedule',
        icon: 'view_timeline',
      },
      {
        key: 'cost_evm',
        title: 'Cost & EVM',
        description: 'PMBOK 7 + AACE RP-67R-11 + ANSI EIA-748-D 14-state cost-control chain: BAC → committed → incurred → measured → variance → reforecast → CR → publish → reconcile → close, with CPI/SPI/EAC/ETC/TCPI/VAC live, contingency/MR remaining, and SIGNATURE regulator crossings on MR draw + cancel every tier.',
        href: '/ipp-lifecycle/workstation?tab=cost-evm',
        cta_label: 'Open Cost & EVM',
        icon: 'payments',
      },
      {
        key: 'document_control',
        title: 'Document control',
        description: 'ISO 19650 + IEC 61355 + REIPPPP Schedule 2 + FIDIC Silver §6 12-state drawing-register chain: draft → indexed → IDC → transmittal → review → approval → IFC → as-built → archive, with URGENT SLA (safety-critical 24h), 5-bridge architecture (W112/W113/W19/W20/W18), FLOOR-AT-SAFETY-CRITICAL flag overlay, and SIGNATURE reject-every-tier on safety-critical or IFC-blocking documents.',
        href: '/ipp-lifecycle/workstation?tab=document-control',
        cta_label: 'Open document control',
        icon: 'description',
      },
      {
        key: 'submittals',
        title: 'Submittals & transmittals',
        description: 'CSI 01 33 00 (stamps A/B/C/D/E) + ISO 19650-2 §5.7 + FIDIC Silver §6 + NEC4 §54 + REIPPPP Sch 4 + DMRE 12-state submittal chain: contractor drafted → assembled → submitted → screening → assigned → under review → coordination → response → stamped → resub loop / close-out → archive, with URGENT SLA (critical_safety 24h / shop_drawing 168h / material_approval 240h / O&M 480h), FLOOR-AT-CRITICAL-SAFETY on 5 flags (long-lead / CCP / witness / lender covenant / dispute), 6-bridge architecture (W114/W112/W113/W19/W23/W20), and SIGNATURE stamp-E-reject-every-tier on critical_safety or commissioning_critical packages.',
        href: '/ipp-lifecycle/workstation?tab=submittals',
        cta_label: 'Open submittals',
        icon: 'rule_folder',
      },
      {
        key: 'rfis',
        title: 'RFI lifecycle',
        description: 'CSI 01 31 19 + ISO 19650-2 §5.7 + FIDIC Silver §1.3 + AIA G716 + NEC4 §61 + REIPPPP technical-coord 12-state RFI chain: question drafted → submitted → triage → assigned → research → response drafted → cross-discipline review → answer returned → clarification loop / close-out → archive, with URGENT SLA (emergency_safety 4h / construction_blocking 24h / coordination 72h / clarification 168h), FLOOR-AT-EMERGENCY-SAFETY on 5 contextual flags (safety hazard / construction stoppage / contractor claim / dispute basis / regulatory inquiry), 6-bridge architecture (W114/W115/W112/W113/W19/W20), W117 change-order auto-link on construction_blocking + emergency_safety, and SIGNATURE escalate-every-tier on safety_hazard_identified or regulatory_inquiry_triggered (W116 SAFETY-RFI-ESCALATE hard line).',
        href: '/ipp-lifecycle/workstation?tab=rfis',
        cta_label: 'Open RFIs',
        icon: 'question_answer',
      },
      {
        key: 'change-orders',
        title: 'Change orders & variations',
        description: 'FIDIC §13 + NEC4 §60-65 + AIA G701/G714 + CSI 01 26 00 + REIPPPP variations + DMRE EPC change-control 12-state P6 CR chain: change proposed → impact assessed → cost quoted → owner review → negotiated → approved → issued for execution → scheduled → executing → executed → closed out → archived (HARD terminal), with INVERTED SLA polarity (minor 168h / material 336h / major 720h / transformational 1080h on owner_review), FLOOR-AT-MAJOR on 5 contextual flags (scope_baseline_change / regulatory_re_consent_required / schedule_impact_critical_path / lender_consent_required / safety_design_change), 7-bridge architecture (W116/W115/W114/W112/W113/W19/W20), 4-step authority ladder (PM → engineer → owner_rep → IPP_CEO) and SIGNATURE SCOPE-BASELINE-CHANGE-APPROVE crossing regulator EVERY tier when scope_baseline_change OR regulatory_re_consent_required (W117 hard line). reject crosses regulator EVERY tier when cumulative CR pct ≥ 15% (REIPPPP cumulative cap). 12th and TARGET-CLOSING Phase-A IPP-pure chain.',
        href: '/ipp-lifecycle/workstation?tab=change-orders',
        cta_label: 'Open change orders',
        icon: 'edit_note',
      },
      {
        // W131 Phase-E wave 1 — Stage Gates DG0–DG4 governance chain.
        key: 'stage-gates',
        title: 'Stage gates (W131)',
        description: 'PMBOK 7 + Equator Principles IV + NERSA ERA 4/2006 + REIPPPP 5-gate DG0–DG4 governance chain on oe_stage_gates: DG0 Concept → DG1 Feasibility → DG2 FEED/FID-prep → DG3 Sanction (FID) → DG4 COD/Operations. 12-state forward + 4 branch chain (gate_proposed → evidence_compiled → ie_reviewed → lender_reviewed → board_briefing_circulated → cab_held → conditions_set → decision_recorded → conditions_satisfied → gate_passed → notified_downstream → archived + gate_deferred / gate_withdrawn / gate_rejected / gate_conditional_pass). INVERTED SLA polarity (low_capex 168h → equator_cat_a 2160h — larger/more E&S-sensitive gates get MORE diligence time). 5 FLOOR flags lift to high_capex ≥1 / mega_capex ≥3 (equator_cat_a / fid_committed / nersa_notifiable / debt_sized / shareholder_consent_required). SIGNATURE: reject_gate crosses regulator EVERY tier — project termination is universally reportable to NERSA + DMRE (REIPPPP bid death IS the reportable event). DG4 record_decision crosses EVERY tier; DG0/DG3 cross medium+. 4-step authority ladder (project_manager → ie_assessor → cfo → board_chair). 5 bridges (w19_procurement_ref / w20_cod_ref / w21_drawdown_ref / w113_evm_ref / w118_block_ref MANDATORY). LIVE 4-field decoration at fetch (time_in_state_hours_live / sla_remaining_hours_live / conditions_aging_days_live / equator_category_live). Bidirectional W20 bridge: DG4 outcome blocks COD activation. Monday 08:00 SAST conditions-aging cron (Equator IV monitoring requirement). JOINS existing ipp audit namespace.',
        href: '/ipp-lifecycle/workstation?tab=stage-gates',
        cta_label: 'Open stage gates',
        icon: 'account_tree',
      },
      {
        // W133 Phase-E wave 3 — IPP Risk Register & Treatment Chain.
        key: 'risk-register',
        title: 'Risk register (W133)',
        description: 'PMBOK 7 Risk Management (11.1-11.7) + ISO 31000:2018 + IEC 31010:2019 + REIPPPP Schedule 2 + Equator Principles IV on oe_ipp_risks: 11-state forward path (identified → assessed → quantified → response_planned → owner_assigned → monitoring → triggered → responding → outcome_recorded → closed → archived) + 4 branch states (escalated / deferred / cancelled / overdue_flagged). INVERTED SLA polarity (low_impact 168h LOOSEST → catastrophic 2160h MOST treatment time — higher impact = more thorough response planning needed). W133 SIGNATURE: escalate_risk EVERY tier when safety AND (critical_impact|catastrophic) — OHSA s24 critical risk materialisation universally reportable. flag_triggered catastrophic EVERY tier (universal hard line — catastrophic event materialisation always crosses regulator). close_risk EVERY tier when is_nersa_notifiable. Critical/catastrophic safety/regulatory SLA breaches cross regulator. 3-step authority (risk_owner → risk_manager → risk_director). 5 floor flags (floor_board_notify / floor_ep4_action_required / floor_lender_notifiable / floor_nersa_notifiable / floor_insurance_applicable). Risk score P×I matrix 1–25 with deriveTierFromScore (≥20 catastrophic / ≥15 critical / ≥9 high / ≥4 medium / low). 5 bridge refs (issue_ref W132 / stage_gate_ref W131 / procurement_ref W19 / hse_incident_ref W25 / w118_block_ref MANDATORY at outcome_recorded). SLA sweep in shared */15 cron slot. JOINS existing ipp audit namespace. Beats Oracle Primavera Risk Analysis / Active Risk Manager ARM / Safran Risk / Accenture Risk Management.',
        href: '/ipp-lifecycle/workstation?tab=risk-register',
        cta_label: 'Open risk register',
        icon: 'warning',
      },
      {
        // W134 Phase-E wave 4 — IPP Stakeholder Register & Engagement Tracking.
        key: 'stakeholder-register',
        title: 'Stakeholder register (W134)',
        description: 'PMBOK 7 Section 13 + ISO 21500:2021 stakeholder management + REIPPPP Section 4 community participation + IFC Performance Standard 1 (PS1) + Equator Principles IV on oe_ipp_stakeholders: 12-state engagement lifecycle (identified → analyzed → classified → engagement_planned → active_engagement → responsive → supportive → champion + resistant / disengaged / escalated / archived). P×I×U engagement matrix (Power × Interest × Urgency, max 125) with automatic tier derivation (strategic_ally / key_player / keep_satisfied / keep_informed / monitor). URGENT SLA polarity (strategic_ally 24h TIGHTEST → monitor 720h). W134 SIGNATURE: escalate_engagement EVERY tier — any stakeholder escalation is universally reportable (REIPPPP S4 + IFC PS1 failure to manage community stakeholders always material). flag_resistant EVERY tier when power_score >= 4 (high-power resistant stakeholder = community-participation risk always reportable). NERSA-required strategic_ally/key_player SLA breach crosses regulator. 5 floor flags (floor_ep4_required / floor_board_notify / floor_legal_risk / floor_nersa_required / floor_lender_required). 5 bridge refs (stage_gate_ref W131 / issue_ref W132 / risk_ref W133 / ed_commitment_ref W27 / hse_incident_ref W25). SLA sweep in shared */15 cron slot. JOINS existing ipp audit namespace. Beats Engage + Darzin + Boora + Synergi + Quorum + Stakeholder Map Pro + Borealis CSR.',
        href: '/ipp-lifecycle/workstation?tab=stakeholder-register',
        cta_label: 'Open stakeholder register',
        icon: 'groups',
      },
      {
        // W135 Phase-E wave 5 — IPP Lessons Learned Register.
        key: 'lessons-learned',
        title: 'Lessons learned (W135)',
        description: 'PMBOK 7 / ISO 21502:2022 §12.6 dissemination tracking on oe_ipp_lessons_learned: 13-state P6 chain (captured → categorized → root_cause_analyzed → impact_assessed → recommendation_drafted → peer_reviewed → approved → disseminated → applied → archived + rejected / deferred / duplicate). INVERTED SLA polarity (critical_impact 720h MOST time → low_impact 168h LEAST time — more-impact lessons get MORE time for thorough RCA). W135 SIGNATURE: disseminate_finding EVERY tier when lesson_type=\'safety\' OR prevents_fatality=1 — failure to apply a known safety lesson creates OHSA liability. SLA breach crosses when floor_safety_critical AND (critical_impact|high_impact). 5 impact tiers: critical_impact / high_impact / medium_impact / low_impact. 6 RCA methods (five_whys / fishbone / fmea / fault_tree / timeline_analysis / none). 12 lesson categories (technical / schedule / cost / safety / procurement / stakeholder / regulatory / environmental / quality / risk / financial / contractual). 7 project phases (development → decommissioning). 5 floor flags (floor_safety_critical / floor_regulatory_change / floor_contractual_impact / floor_design_change / floor_portfolio_impact). 5 cross-references (issue_ref W132 / risk_ref W133 / rfi_ref W116 / hse_incident_ref W25 / change_order_ref W117). Quantified cost + schedule impact fields. SLA sweep in shared */15 cron slot. JOINS existing ipp audit namespace. Beats Oracle Primavera Unifier (unstructured document storage) + MS Project (no learning registry).',
        href: '/ipp-lifecycle/workstation?tab=lessons-learned',
        cta_label: 'Open lessons learned',
        icon: 'school',
      },
      {
        // W137 Phase-E wave 7 — IPP Method Statement (SWMS) Management.
        key: 'method-statements',
        title: 'Method statements (W137)',
        description: 'OHSA Construction Regulations 2014 Reg.7 + Equator Principles EP4 + REIPPPP site safety requirements on oe_ipp_method_statements: 12-state P6 chain (drafted → reviewed → risk_assessed → approved → toolbox_briefed → active → work_completed → closed → archived + rejected / superseded / suspended branches). URGENT SLA polarity (high_risk 24h TIGHTEST → routine 336h loosest — life-safety work approved fastest). W137 SIGNATURE: approve_ms crosses regulator EVERY tier when is_critical_lift OR is_confined_space OR is_live_electrical (hazardous work planning always reportable to DOL/OHSA). suspend_work crosses when floor_regulatory_notification. SLA breach crosses when high_risk AND any critical safety flag. 4 risk tiers: high_risk / medium_risk / low_risk / routine. 10 work types: civil / structural / electrical / mechanical / instrumentation / scaffolding / demolition / excavation / commissioning / general. 5 safety flags: critical_lift (>80% SWL or >10t) / confined_space / live_electrical / hot_work / working_at_height. 5 floor flags: PTW required (W64 link) / IE review required / regulatory notification / lender notification / third-party inspection. 5 cross-references (ptw_ref W64 / ncr_ref W136 / hse_incident_ref W25 / work_order_ref W16 / risk_ref W133). SLA sweep in shared */15 cron slot. JOINS existing ipp audit namespace. Beats Procore Safety (static PDF workflow, no P6 state machine).',
        href: '/ipp-lifecycle/workstation?tab=method-statements',
        cta_label: 'Open method statements',
        icon: 'checklist_rtl',
      },
      {
        // W138 Phase-E wave 8 — IPP Environmental Monitoring Log.
        key: 'mir',
        title: 'Material inspections (W139)',
        description: 'ISO 9001:2015 §8.6 + REIPPPP quality specifications + Equator Principles EP4 technical standards + IE oversight on oe_ipp_mirs: 12-state P6 chain (delivery_notified → delivered → initial_inspection → detailed_inspection → [test_sampling → results_pending →] approved / conditional_approval → incorporated; reject branch → rejected_on_site / quarantined → returned_to_supplier). URGENT SLA polarity (critical_structural 24h TIGHTEST → general 168h loosest — load-bearing materials inspected fastest). W139 SIGNATURE: reject_material EVERY tier when floor_ie_witnessed (IE witnessed rejection always reportable); quarantine_material EVERY tier when floor_critical_safety; approve_conditional crosses when floor_lender_hold_point. SLA breach crosses when critical_structural + ie_witnessed OR nersa_material + critical_structural|electrical_mechanical. 4 material tiers: critical_structural / electrical_mechanical / civil / general. 10 material categories: structural_steel / concrete / electrical_cable / transformer / inverter / solar_panel / civil_materials / mechanical / instruments / general. 5 floor flags: IE witnessed / lender hold point / NERSA material / critical safety / manufacturer warranty at risk. 5 inspection checks: dimensional / quantity / documentation / visual + lab testing path with lab_name/lab_sample_ref/test_passed. 4 cross-references (ncr_ref W136 / submittal_ref W116 / rfi_ref / change_order_ref). SLA sweep in shared */15 cron slot. JOINS existing ipp audit namespace. Beats Procore Materials (inventory-only, no P6 lifecycle, no IE witness gate, no lender rejection crossing).',
        href: '/ipp-lifecycle/workstation?tab=mir',
        cta_label: 'Open MIR register',
        icon: 'inventory',
      },
      {
        key: 'env-monitoring',
        title: 'Environmental monitoring (W138)',
        description: 'NEMA s30 + DFFE EIA conditions + ISO 14001:2015 + REIPPPP environmental compliance requirements on oe_ipp_env_monitoring: 12-state P6 chain (scheduled → sampling → sample_submitted → results_received → compliance_assessed → report_drafted → report_submitted → closed + exceedance_flagged / corrective_action / under_investigation branch + cancelled). URGENT SLA polarity (critical 24h TIGHTEST → baseline 720h loosest — near-receptor air quality exceedances need fastest turnaround). W138 SIGNATURE: flag_exceedance crosses regulator EVERY tier when is_near_sensitive_receptor OR floor_eia_condition_breach OR floor_nema_s30_notification; submit_report crosses when floor_dffe_report_required. SLA breach crosses when critical + near_sensitive_receptor OR floor_eia_condition_breach (any tier). 4 monitoring tiers: critical / regular / routine / baseline. 10 monitoring categories: air_quality / water_quality / noise / dust / waste / land / biodiversity / stormwater / groundwater / visual. 5 floor flags: NEMA s30 notification / DFFE report required / public notice required / lender report required / EIA condition breach. 4 cross-references (ncr_ref W136 / hse_incident_ref W25 / ms_ref W137 / stage_gate_ref W131). Parameter vs permit-limit measurement tracking with exceedance magnitude and percentage. SLA sweep in shared */15 cron slot. JOINS existing ipp audit namespace. Beats Intelex / Cority generic EMS (static checklists, no P6 state machine, no regulator crossings).',
        href: '/ipp-lifecycle/workstation?tab=env-monitoring',
        cta_label: 'Open env. monitoring',
        icon: 'eco',
      },
      {
        // W136 Phase-E wave 6 — IPP Non-Conformance Report (NCR) Management.
        key: 'ncr-management',
        title: 'Non-conformance reports (W136)',
        description: 'ISO 9001:2015 §8.7 + Equator Principles IV QA + REIPPPP quality requirements on oe_ipp_ncrs: 12-state P6 chain (raised → acknowledged → under_investigation → disposition_proposed → disposition_reviewed → rework_in_progress → reinspection → corrective_action_planned → closed + accepted_as_is / rejected_escalated / voided). URGENT SLA polarity (safety_critical 24h TIGHTEST → cosmetic 720h loosest — safety failures must be resolved fastest). W136 SIGNATURE: reject_escalate EVERY tier (IE rejection always reportable); accept_as_is crosses when floor_ie_notification_required OR floor_nersa_reportable. SLA breach crosses when floor_safety_stop_work (always) or floor_hold_point_triggered AND (safety_critical|structural). 5 severity tiers: safety_critical / structural / functional / minor / cosmetic. 8 NCR categories: workmanship / materials / design / documentation / safety / environmental / commissioning / testing. 5 dispositions: accept_as_is / rework / repair / replace / scrap. 7 disciplines: civil / structural / electrical / mechanical / instrumentation / hvac / process. 5 floor flags: IE notification required / lender consent required / NERSA reportable / hold point triggered / safety stop-work. 4 cross-references (itp_ref / issue_ref W132 / rfi_ref W116 / hse_incident_ref W25). SLA sweep in shared */15 cron slot. JOINS existing ipp audit namespace. Beats Procore NCR module (shallow workflow, no P6 state machine) + Oracle Aconex Quality (generic workflow, no REIPPPP-specific disposition logic).',
        href: '/ipp-lifecycle/workstation?tab=ncr',
        cta_label: 'Open NCR register',
        icon: 'assignment_late',
      },
      {
        // W132 Phase-E wave 2 — IPP Issues Log & Resolution Chain.
        key: 'issues-log',
        title: 'Issues log (W132)',
        description: 'PMBOK 7 issue register + ISO 21500:2021 + OHSA s24 + ERA s35 on oe_ipp_issues: 12-state forward path (raised → triaged → assigned → acknowledged → in_progress → blocked → under_review → resolved → verified → evidence_filed → closed → archived) + 4 branch states (escalated / deferred / cancelled / overdue_flagged). URGENT SLA polarity (P1 critical 24h TIGHTEST → P5 informational 720h). W132 SIGNATURE: escalate_to_regulator crosses regulator EVERY tier when category = safety OR regulatory (OHSA s24 + ERA s35 notifiable event always reportable). close EVERY tier when is_nersa_notifiable. P1+P2 safety/regulatory SLA breaches cross regulator. 3-step authority ladder (project_coordinator → project_manager → project_director). 5 context flags (is_safety / is_regulatory / is_commercial / is_lender_notifiable / is_nersa_notifiable). 5 bridge refs (rfi_ref W116 / change_order_ref W117 / stage_gate_ref W131 / hse_incident_ref W25 / w118_block_ref MANDATORY at evidence_filed). SLA sweep in shared */15 cron slot. JOINS existing ipp audit namespace. Beats Procore Observations + Oracle Primavera Unifier Issue Tracking + Autodesk Construction Cloud + InEight Issue Manager + PlanGrid Punch List.',
        href: '/ipp-lifecycle/workstation?tab=issues-log',
        cta_label: 'Open issues log',
        icon: 'report_problem',
      },
      {
        // W122 Phase-C opener — first external-system connector chain.
        key: 'scada-connectors',
        title: 'SCADA / IEC 61850 connectors (W122)',
        description: 'Phase-C opener. Real-time bidirectional bridge between the platform and IPP plant SCADA via IEC 61850 MMS/GOOSE/SV + 60870-5-104 + DNP3 + Modbus + IEEE C37.118 + OPC UA. 12-state forward + 4 branch chain (connector_proposed → endpoints_discovered → tls_configured → handshake_completed → telemetry_streaming → quality_validated → alarms_subscribed → control_commands_authorized → live_operations → reconciliation_active → archived; branches disconnected/revoked/suspended/failover_active), INVERTED SLA hours (pilot 168 / small 240 / medium 360 / large 480 / national 720), FLOOR-AT-LARGE ≥1 / FLOOR-AT-NATIONAL ≥3 of 5 contextual flags (peak demand / black-start / cross-border / NERSA C-3 / N-1 critical). SIGNATURE: revoke crosses NERSA + SARB BA 700 + SOC EVERY tier (W122 SCADA-CONNECTOR-REVOKE hard line). mTLS-gated PUBLIC peer endpoint for SCADA counterparties. Beats Triangle MicroWorks SCADA Data Gateway + Kalkitech SYNC 4000 + NovaTech Orion LX + SEL RTAC + OSIsoft PI + AVEVA System Platform.',
        href: '/ipp-lifecycle/workstation?tab=scada-connectors',
        cta_label: 'Open SCADA connectors',
        icon: 'cable',
      },
      {
        // W123 Phase-C wave 2 — MQTT / OPC UA edge-device + IIoT broker chain.
        key: 'mqtt-opcua-connectors',
        title: 'MQTT / OPC UA connectors (W123)',
        description: 'Phase-C wave 2. Edge-device / IIoT broker bridge complementing W122 substation-grade SCADA. MQTT v5 / MQTT-SN / OPC UA 1.05 / OPC UA Pub/Sub / Sparkplug B / IEC 61400-25 / IEEE 2030.5 CSIP / SunSpec Modbus across PV-industry / energy / battery / inverter / wind companion specs. 11-state forward + 4 branch chain (connector_proposed → broker_provisioned → topics_mapped → tls_mutual_configured → client_registered → publishing_active → subscription_validated → companion_spec_bound → live_streaming → reconciliation_active → archived; branches disconnected/credential_revoked/suspended/failover_active), INVERTED SLA hours (edge 168 / small 240 / medium 360 / large 480 / national 720), FLOOR-AT-LARGE-FLEET ≥1 / FLOOR-AT-NATIONAL-IOT-BACKBONE ≥3 of 5 flags (critical safety payload / cross-border IoT / Sparkplug B / IEEE 2030.5 CSIP inverter control / aggregated DR > 50 MW). SIGNATURE: revoke_credential crosses NERSA Grid Code C-3 + IEC 62443 + POPIA s19 + SARB BA 700 EVERY tier (W123 MQTT-OPCUA-REVOKE hard line). mTLS-gated PUBLIC peer endpoint via x-mtls-cert-fingerprint header. Beats AWS IoT Core + Azure IoT Hub + HiveMQ Enterprise + EMQX + VerneMQ + Kepware KEPServerEX + Matrikon OPC UA Server + Prosys + Unified Automation + Cogent DataHub.',
        href: '/ipp-lifecycle/workstation?tab=mqtt-opcua-connectors',
        cta_label: 'Open MQTT/OPC-UA connectors',
        icon: 'router',
      },
      {
        // W127 Phase-D wave 1 of 4 — FIRST Phase-D wave — Anomaly-Detection ML Model.
        key: 'anomaly-detection-ml',
        title: 'Anomaly ML (W127)',
        description: 'FIRST Phase-D ML governance wave (W127-W130). IPP-developer-side view into anomaly-detection ML model lifecycle on oe_anomaly_detection_ml: 7 model families (isolation_forest / lstm_autoencoder / variational_autoencoder / transformer_anomaly / gradient_boosted_residual / one_class_svm / ensemble_stacking) over 10 asset classes (inverter / battery_cell / pcs / transformer / pv_module / wind_turbine / scada_gateway / meter / weather_station / iiot_gateway). 12-state forward + 4 branch chain (model_proposed → dataset_bound → features_engineered → train_test_split → model_trained → backtest_validated → calibrated → shadow_deployed → live_ab_active → champion_promoted → retrained → archived + drift_detected / rolled_back / recalled / failover_to_baseline). INVERTED SLA at model_proposed (single_asset 24h / small_fleet 96h / large_fleet 240h / multi_jurisdiction_fleet 480h / fleet_systemic 720h). 5 FLOOR flags lift to large_fleet ≥1 / fleet_systemic ≥3 (safety_critical_inference / regulator_reportable_drift / nerc_cip_audit_in_scope / sox_ml_governance_required / iso_42001_ai_management_required). SIGNATURE: rollback_model crosses regulator EVERY tier (W127-ML-ROLLBACK first Phase-D hard line); recall_model EVERY when safety_critical_inference; detect_drift HEAVY tiers when regulator_reportable_drift; activate_failover top-heavy only. INTERNAL ML governance (no mTLS). 5 bridges (W71 prognostics + W12 commissioning + W118 audit MANDATORY + W126 government filing when regulator_reportable_drift + W74 NERSA levy when iso_42001). NEW ml audit namespace (4th after platform/grid/settlement/regulator). ISO 42001 + NIST AI RMF + EU AI Act + ISO 27001 + SOC 2 Type II + NERC CIP-013 alignment. Beats DataRobot MLOps + Aporia + Fiddler + Arize AI + Datadog Model Monitoring + Evidently AI + WhyLabs.',
        href: '/ipp-lifecycle/workstation?tab=anomaly-detection-ml',
        cta_label: 'Open anomaly ML',
        icon: 'psychology',
      },
      {
        // W128 Phase-D wave 2 of 4 — SECOND Phase-D wave — RUL Prediction ML Model.
        key: 'rul-prediction-ml',
        title: 'RUL ML (W128)',
        description: 'SECOND Phase-D ML governance wave (W127-W130). IPP-developer-side view into survival/Cox PH ML model lifecycle on oe_rul_prediction_ml REPLACING the W71 OLS-style degradation slope: 6 model families (cox_ph / aft / deepsurv / rsf / xgb_surv / baseline_ols) over 10 asset classes (wind_turbine / pv_inverter / battery_storage / transformer / transmission_line / substation / hydrogen_electrolyser / grid_scada / smart_meter / generic). 12-state forward + 4 branch chain (model_proposed → survival_dataset_bound → features_engineered → train_test_split → model_trained → backtest_validated → calibrated → shadow_deployed → live_ab_active → champion_promoted → retrained → archived + drift_detected / rolled_back / recalled / failover_to_ols). INVERTED SLA at model_proposed (single_asset 24h / small_fleet 120h / large_fleet 360h / multi_jurisdiction_fleet 600h / fleet_systemic 720h). LONGER survival_dataset_bound (48-720h) + shadow_deployed (72-1080h) than W127 - survival models need censored-event maturation. 5 FLOOR flags lift to large_fleet ≥1 / fleet_systemic ≥3 (safety_critical_rul / regulator_reportable_rul_quantile / nerc_cip_audit_in_scope / sox_ml_governance_required / iso_42001_ai_management_required). SIGNATURE: rollback_model crosses regulator EVERY tier (W128-RUL-ROLLBACK second Phase-D hard line); recall_model EVERY when safety_critical_rul; detect_drift HEAVY tiers when regulator_reportable_rul_quantile OR (PH-assumption-violated AND fleet_systemic); activate_failover_to_ols multi_jurisdiction + fleet_systemic. UNIQUE: promote_champion crosses regulator at fleet_systemic when iso_42001 (replacing OLS at systemic scale is itself a governance event). INTERNAL ML governance (no mTLS). 5 bridges (W71 prognostics MANDATORY NOT NULL + W21 lender drawdown + W77 reserve account + W63 warranty recovery + W118 audit MANDATORY). JOINS W127 ml audit namespace. KM-lift-vs-OLS monotonic-replacement proof. ISO 42001 + NIST AI RMF + EU AI Act + ISO 27001 + SOC 2 Type II + NERC CIP-013 alignment. Beats AspenTech Mtell RUL + GE APM survival + Uptake Fusion + Augury RUL + C3.ai reliability + SparkCognition + Petuum + DataRPM.',
        href: '/ipp-lifecycle/workstation?tab=rul-prediction-ml',
        cta_label: 'Open RUL ML',
        icon: 'query_stats',
      },
      {
        // W129 Phase-D wave 3 of 4 — THIRD Phase-D wave — Fault-Fingerprint Multi-Class ML.
        key: 'fault-fingerprint-ml',
        title: 'Fault ML (W129)',
        description: 'THIRD Phase-D ML governance wave (W127-W130). IPP-developer-side view into multi-class fault classifier lifecycle on oe_fault_fingerprint_ml REPLACING the W71 12-mode physics-rule fault fingerprinting: 7 model families (xgboost / random_forest / gradient_boosting / cnn_1d / lightgbm / catboost / baseline_physics) over 10 asset classes (wind_turbine / pv_inverter / battery_storage / transformer / transmission_line / substation / hydrogen_electrolyser / grid_scada / smart_meter / generic) against 12 inherited W71 fault modes (bearing_wear / blade_imbalance / gearbox_fault / inverter_igbt_fault / cell_imbalance / dc_arc_fault / transformer_winding / insulation_breakdown / scada_comms_loss / cooling_failure / overheating / unknown). 12-state forward + 4 branch chain (model_proposed → labeled_dataset_bound → class_imbalance_resolved → features_engineered → train_test_split → multiclass_model_trained → confusion_matrix_validated → calibrated → shadow_deployed → live_ab_active → champion_promoted → retrained → archived + class_drift_detected / rolled_back / recalled / failover_to_physics_baseline + add_novel_class RE-ENTRY). INVERTED SLA at model_proposed (single_asset 36h / small_fleet 120h / large_fleet 300h / multi_jurisdiction_fleet 600h / fleet_systemic 900h - LONGER than W128 because multi-class confusion-matrix stabilisation + per-class calibration need more shadow time on imbalanced classes). MIN-30-SAMPLES-PER-CLASS stratified split floor (NIST AI RMF MEASURE). 5 FLOOR flags lift to large_fleet ≥1 / fleet_systemic ≥3 (safety_critical_fault_class / regulator_reportable_misclass / nerc_cip_audit_in_scope / sox_ml_governance_required / iso_42001_required). SIGNATURE: rollback_model crosses regulator EVERY tier (W129-FFML-ROLLBACK THIRD Phase-D hard line, joins W127+W128); recall_model EVERY when safety_critical_fault_class; detect_class_drift HEAVY tiers when regulator_reportable_misclass; failover_to_physics_baseline top-heavy. W129-UNIQUE: add_novel_class crosses regulator at fleet_systemic ONLY (adding a previously-unseen fault mode at fleet-wide scale is EU-AI-Act-reportable model-scope expansion - Art 14 product-class change). INTERNAL ML governance (no mTLS). 5 bridges (W71 prognostics MANDATORY NOT NULL 12-mode physics baseline reconciliation + W15 warranty claim + W41 ITIL problem mgmt + W63 warranty recovery + W118 audit MANDATORY). JOINS W127 ml audit namespace. Macro-F1 + micro-F1 + weighted recall + top-3 acc + log loss + ROC AUC macro + class-PSI + confusion-matrix density + calibration Brier + reconciliation-with-W71-physics-pct monotonic-replacement proof. Crons */15 * * * * SLA sweep + 30 3 * * * daily class-drift scan + 0 7 * * 1 weekly model-card expiry sweep. ISO 42001 + NIST AI RMF + EU AI Act + ISO 27001 + SOC 2 Type II + NERC CIP-013 alignment. Beats AspenTech Mtell pattern-recognition + GE APM fault classification + Uptake Fusion fault library + Augury machine diagnostics + C3.ai fault-mode classifier + SparkCognition SparkPredict fault-typing + Petuum + DataRPM classification stacks.',
        href: '/ipp-lifecycle/workstation?tab=fault-fingerprint-ml',
        cta_label: 'Open fault ML',
        icon: 'pattern',
      },
      {
        // W130 Phase-D wave 4 of 4 — FOURTH (FINAL) Phase-D wave — NTT Comparison Battery. CLOSES PHASE D.
        key: 'ntt-comparison-battery',
        title: 'NTT comparison (W130)',
        description: 'FOURTH (FINAL) Phase-D ML governance wave (W127-W130) — CLOSES PHASE D. IPP-developer-side view into the continuous live comparison-battery aggregator on oe_ntt_comparison_battery stitching W127 (anomaly LSTM-AE) + W128 (RUL Cox PH survival) + W129 (fault-fingerprint multi-class) against an emulated NTT IoT/O&M baseline. Each row = one COMPARISON CYCLE (nightly). Streams revenue-weighted, statistically-significance-gated, tamper-evident "savings-vs-NTT-30%" KPI into the Esums dashboard hero. 12-state forward + 4 branch chain (cycle_proposed → baselines_synced → predictions_emitted → ground_truth_observed → metrics_computed → statistical_test_passed → savings_quantified → cycle_published → board_published → archived + drift_detected / rolled_back / recalled_certification / failover_to_prior_cycle). INVERTED SLA at cycle_proposed (single_asset 12h / small_fleet 48h / large_fleet 120h / multi_jurisdiction_fleet 240h / fleet_systemic 480h — TIGHTER than W127-W129 because cycles run NIGHTLY). 5 FLOOR flags lift to large_fleet ≥1 / fleet_systemic ≥3 (sustained_below_target / regulator_reportable_diversion / nerc_cip_audit_in_scope / sox_ml_governance_required / iso_42001_required). SIGNATURE: recall_certification crosses regulator EVERY tier (W130-NCB-RECALL FOURTH Phase-D hard line, joins W127+W128+W129 rollback); rollback_cycle EVERY when sustained_below_target ≥4 consecutive cycles (NTT contract reneg trigger). 5 bridges (W127 anomaly + W128 RUL + W129 fault + W71 prognostics control variable + W118 audit MANDATORY). JOINS W127 ml audit namespace. savings_vs_ntt_pct_live + cumulative_savings_zar_live + paired_t p-value + revenue-weighted Brier + monotonic-replacement proof. Crons */15 SLA sweep + 15 4 * * * NIGHTLY CYCLE RUNNER + 0 7 * * 1 weekly model-card expiry + 0 1 1 * * monthly cumulative-savings-ledger reconciliation (catches drift before Q+1 SARB MA s.38 notifiable). ISO 42001 + NIST AI RMF + EU AI Act + ISO 27001 + SOC 2 Type II + NERC CIP-013. Beats NTT Data IoT + NTT O&M stack on revenue-weighted savings-vs-NTT-30% sustained-cycle proof.',
        href: '/ipp-lifecycle/workstation?tab=ntt-comparison-battery',
        cta_label: 'Open NTT comparison',
        icon: 'compare_arrows',
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
      primary_cta: { label: 'Open offtaker workstation', href: '/offtaker-suite/workstation' },
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
      {
        // W124 Phase-C wave 3 — STRATE / SWIFT settlement connector.
        key: 'strate-swift-connectors',
        title: 'Settlement rails (W124)',
        description: 'Phase-C wave 3. MONEY-IN/MONEY-OUT financial settlement spine for outgoing PPA invoice payment: STRATE (SA CSD) + SWIFT MT/MX (ISO 20022 pacs/camt/pain) + SARB SAMOS RTGS + commercial bank EFT/ACH. 12-state forward + 4 branch chain, INVERTED SLA hours (domestic_eft 168 / multi_bank_eft 240 / strate_csd 360 / samos_rtgs 480 / swift_global 720). FLOOR-AT-SAMOS-RTGS ≥1 / FLOOR-AT-SWIFT-GLOBAL ≥3 of 5 flags. SIGNATURE: revoke_credential crosses SARB ExCon + FIC Act + Basel III + CPMI-IOSCO PFMI P9 EVERY tier. mTLS-gated PUBLIC peer endpoint via x-mtls-cert-fingerprint.',
        href: '/offtaker-suite/workstation?tab=strate-swift-connectors',
        cta_label: 'Open settlement rails',
        icon: 'account_balance',
      },
      {
        // W125 Phase-C wave 4 — SAP / Oracle ERP connector.
        key: 'sap-oracle-erp-connectors',
        title: 'ERP connectors (W125)',
        description: 'Phase-C wave 4. Period-close GL spine for accounts-payable PPA invoice posting back into corporate ERP: SAP S/4HANA OData + IDoc FIDCC1/FIDCC2 + Oracle Fusion/EBS SOAP + Workday + Sage 300 + Dynamics 365 + NetSuite + Epicor + IFS. 12-state forward + 4 branch chain, INVERTED SLA hours (single_module 168 / multi_module 240 / multi_company_code 360 / multi_entity_consolidation 480 / multi_country 720). FLOOR-AT-ENTERPRISE-WIDE ≥1 / FLOOR-AT-MULTI-COUNTRY ≥3 of 5 flags (SOX 404 / IFRS consol. / Transfer pricing / SARS critical / CIPC gate). SIGNATURE: revoke_credential crosses SOX 404 + IFRS 15/9/16/17 + SARS e-Filing + CIPC + SOC 1 Type II + ISO 27001 + PCAOB AS 5 EVERY tier. mTLS-gated PUBLIC peer endpoint via x-mtls-cert-fingerprint. Shares settlement audit namespace with W124.',
        href: '/offtaker-suite/workstation?tab=sap-oracle-erp-connectors',
        cta_label: 'Open ERP connectors',
        icon: 'account_tree',
      },
      {
        // W126 Phase-C wave 5 of 5 - FINAL Phase-C connector wave.
        // CIPC / SARS / NERSA government filing APIs connector.
        key: 'government-filing-connectors',
        title: 'Filing connectors (W126)',
        description: 'Phase-C wave 5 of 5 (FINAL Phase-C connector). Statutory filing spine for corporate offtaker statutory reporting: CIPC Annual Return XML + SARS e-Filing (IT14 / VAT201 / EMP201 / IRP5) + NERSA quarterly returns + DMRE compliance + DFFE GHG (Scope 1/2/3) + PAIA + SARB FX + FIC STR + FSCA conduct + Treasury MFMA + municipal. 12-state forward + 4 branch chain, INVERTED SLA hours (single_entity 168 / multi_entity 240 / multi_jurisdiction 360 / systemic_critical 480 / national_statutory 720). FLOOR-AT-MULTI-JURISDICTION (>=1) / FLOOR-AT-SYSTEMIC-CRITICAL (>=3) on 5 flags. SIGNATURE: revoke_credential crosses EVERY tier; activate_failover multi_jurisdiction+systemic_critical; disconnect EVERY tier when Companies Act lateness OR SARS admin penalty active. mTLS-gated PUBLIC peer endpoint via x-mtls-cert-fingerprint. Cron 0 2 * * * daily filing-deadline sweep.',
        href: '/offtaker-suite/workstation?tab=government-filing-connectors',
        cta_label: 'Open filing connectors',
        icon: 'gavel',
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
      primary_cta: { label: 'Open lender workstation', href: '/lender-suite/workstation' },
    },
    kpis: [
      { key: 'facilities', label: 'Facilities', value: facilities, tone: 'good', href: '/lender-suite/workstation' },
      { key: 'covenants', label: 'Covenants monitored', value: covenants, tone: 'neutral', href: '/lender-suite/workstation' },
      { key: 'covenants_breached', label: 'Breached covenants', value: breached, tone: breached > 0 ? 'bad' : 'good', href: '/lender-suite/workstation?tab=covenant_cert' },
      { key: 'actions_open', label: 'Open workout actions', value: actionsN, tone: actionsN > 0 ? 'warn' : 'good', href: '/lender-suite?tab=actions' },
      { key: 'disbursements_pending', label: 'Pending disbursements', value: pending, tone: pending > 0 ? 'warn' : 'good', href: '/funds' },
      ...(await auditKpisFor(c.env, 'lender', '/lender-suite/audit'))
    ],
    workflows: [
      { key: 'origination', title: 'Loan origination', description: 'Term sheets, credit memo, syndication.', href: '/lender-suite', cta_label: 'Open suite', icon: 'savings' },
      { key: 'covenants', title: 'Covenant monitoring', description: 'DSCR, leverage, debt-service tests + AI cure-pathway advisor.', href: '/lender-suite', cta_label: 'Open covenants', icon: 'monitoring', metric: { label: 'breached', value: breached, tone: breached > 0 ? 'bad' : 'good' } },
      { key: 'actions', title: 'Workout queue', description: 'Cure plans, waivers, accelerations — one screen for every breach.', href: '/lender-suite?tab=actions', cta_label: 'Open queue', icon: 'gavel', metric: { label: 'open', value: actionsN, tone: actionsN > 0 ? 'warn' : 'good' } },
      { key: 'draws', title: 'Disbursement requests', description: 'Approve / reject / partial drawdowns.', href: '/funds', cta_label: 'Open draws', icon: 'request_quote', metric: { label: 'pending', value: pending, tone: pending > 0 ? 'warn' : 'good' } },
      // W124 Phase-C wave 3 — STRATE / SWIFT settlement connector.
      { key: 'strate_swift_connectors', title: 'Settlement rails (W124)', description: 'Phase-C wave 3. MONEY-IN/MONEY-OUT financial settlement spine for drawdown disbursement + repayment receipt: STRATE (SA CSD) + SWIFT MT/MX (ISO 20022 pacs/camt/pain) + SARB SAMOS RTGS + commercial bank EFT/ACH. 12-state forward + 4 branch chain, INVERTED SLA hours (domestic_eft 168 / multi_bank_eft 240 / strate_csd 360 / samos_rtgs 480 / swift_global 720). FLOOR-AT-SAMOS-RTGS ≥1 / FLOOR-AT-SWIFT-GLOBAL ≥3 of 5 flags. SIGNATURE: revoke_credential crosses SARB ExCon + FIC Act + Basel III + CPMI-IOSCO PFMI P9 EVERY tier. mTLS-gated PUBLIC peer endpoint via x-mtls-cert-fingerprint.', href: '/lender-suite/workstation?tab=strate-swift-connectors', cta_label: 'Open settlement rails', icon: 'account_balance' },
      // W125 Phase-C wave 4 — SAP / Oracle ERP connector.
      { key: 'sap_oracle_erp_connectors', title: 'ERP connectors (W125)', description: 'Phase-C wave 4. Period-close GL spine for loan accounting (interest accrual, fee posting, drawdown GL entries, repayment receipt postings) into corporate ERP: SAP S/4HANA OData + IDoc FIDCC1/FIDCC2 + Oracle Fusion/EBS SOAP + Workday + Sage 300 + Dynamics 365 + NetSuite + Epicor + IFS. 12-state forward + 4 branch chain, INVERTED SLA hours (single_module 168 / multi_module 240 / multi_company_code 360 / multi_entity_consolidation 480 / multi_country 720). FLOOR-AT-ENTERPRISE-WIDE ≥1 / FLOOR-AT-MULTI-COUNTRY ≥3 of 5 flags (SOX 404 / IFRS consol. / Transfer pricing / SARS critical / CIPC gate). SIGNATURE: revoke_credential crosses SOX 404 + IFRS 15/9/16/17 + SARS e-Filing + CIPC + SOC 1 Type II + ISO 27001 + PCAOB AS 5 EVERY tier. mTLS-gated PUBLIC peer endpoint via x-mtls-cert-fingerprint. Shares settlement audit namespace with W124.', href: '/lender-suite/workstation?tab=sap-oracle-erp-connectors', cta_label: 'Open ERP connectors', icon: 'account_tree' },
      // W126 Phase-C wave 5 of 5 - FINAL Phase-C connector wave - CIPC / SARS / NERSA government filing APIs.
      { key: 'government_filing_connectors', title: 'Filing connectors (W126)', description: 'Phase-C wave 5 of 5 (FINAL Phase-C connector). Statutory filing spine for lender corporate-treasury statutory reporting: CIPC Annual Return XML + SARS e-Filing (IT14 / VAT201 / EMP201 / IRP5) + NERSA quarterly returns + DMRE compliance + DFFE GHG + PAIA + SARB FX (large-exposure reporting + cross-border) + FIC STR + FSCA conduct + Treasury MFMA + municipal. 12-state forward + 4 branch chain, INVERTED SLA hours (single_entity 168 / multi_entity 240 / multi_jurisdiction 360 / systemic_critical 480 / national_statutory 720). FLOOR-AT-MULTI-JURISDICTION (>=1) / FLOOR-AT-SYSTEMIC-CRITICAL (>=3) on 5 flags (Companies Act lateness / SARS admin penalty / NERSA levy arrears / DFFE GHG threshold / PAIA SAR open). SIGNATURE: revoke_credential crosses EVERY tier; activate_failover multi_jurisdiction+systemic_critical; disconnect EVERY tier when Companies Act lateness OR SARS admin penalty active. mTLS-gated PUBLIC peer endpoint via x-mtls-cert-fingerprint. Cron 0 2 * * * daily filing-deadline sweep.', href: '/lender-suite/workstation?tab=government-filing-connectors', cta_label: 'Open filing connectors', icon: 'gavel' },
      // W131 Phase-E wave 1 — Stage Gates (READ only: DG2/DG3 visibility for lender IE-review + lender_review steps)
      { key: 'stage-gates', title: 'Stage gates (W131)', description: 'READ view into IPP project stage-gate progression: DG2 FEED/FID-prep IE review + lender review steps visible here. Lender-side input gate (lender_review action gated on lender role). INVERTED SLA — equator_cat_a gates get 2160h (90d) diligence. Drawdown ref (w21_drawdown_ref) links DG3 Sanction approval directly to Lender drawdown chain (W21). 5 floor flags visible: equator_cat_a / fid_committed / nersa_notifiable / debt_sized / shareholder_consent_required. SIGNATURE: reject_gate crosses regulator EVERY tier.', href: '/lender-suite/workstation?tab=stage-gates', cta_label: 'Open stage gates', icon: 'account_tree' },
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
      primary_cta: { label: 'Open grid operations workstation', href: '/grid-operator/workstation' },
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
      // W122 Phase-C opener — external-system protocol bridge tab.
      { key: 'scada_connectors', title: 'SCADA / IEC 61850 connectors (W122)', description: 'Real-time IEC 61850 MMS/GOOSE/SV + 60870-5-104 + DNP3 + Modbus + IEEE C37.118 + OPC UA bridge to substation SCADA. INVERTED SLA, mTLS-gated peer endpoint, revoke crosses NERSA + SARB BA 700.', href: '/grid-operator/workstation?tab=scada-connectors', cta_label: 'Open SCADA connectors', icon: 'cable' },
      // W123 Phase-C wave 2 — MQTT / OPC UA edge-device + IIoT broker.
      { key: 'mqtt_opcua_connectors', title: 'MQTT / OPC UA connectors (W123)', description: 'Edge-device + IIoT broker bridge: MQTT v5 / MQTT-SN / OPC UA 1.05 / Pub/Sub / Sparkplug B / IEC 61400-25 / IEEE 2030.5 CSIP / SunSpec Modbus. INVERTED SLA, mTLS-gated peer endpoint via x-mtls-cert-fingerprint, revoke_credential crosses NERSA Grid Code C-3 + IEC 62443 + POPIA s19 + SARB BA 700 EVERY tier.', href: '/grid-operator/workstation?tab=mqtt-opcua-connectors', cta_label: 'Open MQTT/OPC-UA connectors', icon: 'router' },
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
      // Wave 119 — Certified Regulator Export Packs (Phase-B wave 2).
      // Regulator-side read into the same chain admins prepare against. The
      // tab name 'regulator-exports' matches the AdminWorkstationPage hook
      // and is filtered for the regulator persona to show only inbound packs
      // (lodged/acknowledged/rejected — i.e. packs we have visibility on).
      { key: 'incoming_exports', title: 'Incoming regulator exports', description: 'XBRL/iXBRL packs lodged via mTLS by licensees. Acknowledge or reject within the statutory clock.', href: '/regulator-suite/workstation?tab=regulator-exports', cta_label: 'Open inbox', icon: 'inbox' },
      // W126 Phase-C wave 5 of 5 - FINAL Phase-C connector wave - CIPC / SARS / NERSA government filing APIs.
      { key: 'government_filing_connectors', title: 'Filing connectors (W126)', description: 'Phase-C wave 5 of 5 (FINAL Phase-C connector). Regulator-side oversight into licensee statutory filing connectors: CIPC Annual Return XML + SARS e-Filing (IT14 / VAT201 / EMP201 / IRP5) + NERSA quarterly returns + DMRE compliance + DFFE GHG + PAIA + SARB FX + FIC STR + FSCA conduct + Treasury MFMA + municipal. 12-state forward + 4 branch chain, INVERTED SLA hours (single_entity 168 / multi_entity 240 / multi_jurisdiction 360 / systemic_critical 480 / national_statutory 720). FLOOR-AT-MULTI-JURISDICTION (>=1) / FLOOR-AT-SYSTEMIC-CRITICAL (>=3) on 5 flags (Companies Act lateness penalty / SARS admin penalty / NERSA levy arrears / DFFE GHG threshold / PAIA SAR open). SIGNATURE: revoke_credential crosses EVERY tier; activate_failover multi_jurisdiction+systemic_critical; disconnect EVERY tier when Companies Act lateness OR SARS admin penalty active. mTLS-gated PUBLIC peer endpoint via x-mtls-cert-fingerprint. NEW regulator audit namespace (W126 opens it). Cron 0 2 * * * daily filing-deadline sweep. CLOSES Phase C.', href: '/regulator-suite/workstation?tab=government-filing-connectors', cta_label: 'Open filing connectors', icon: 'gavel' },
      // W131 Phase-E wave 1 — Stage Gates (READ only: DG0/DG4 NERSA-notifiable crossings visible to regulator)
      { key: 'stage-gates', title: 'Stage gates (W131)', description: 'READ view into IPP stage-gate regulator crossings: DG0 concept + DG3 FID/Sanction (medium+ capex) + DG4 COD (every tier) + reject_gate (every tier, W131 SIGNATURE) all flow into regulator inbox. NERSA ERA s8-11 gate notifications. INVERTED SLA monitoring: equator_cat_a gates carry 90d window visible here. SLA breaches on high+ capex gates are also regulator-relevant. regulator_ref and regulator_crossed_at fields linkable to W31 disposition chain.', href: '/regulator-suite/workstation?tab=stage-gates', cta_label: 'Open stage gates', icon: 'account_tree' },
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
      // Wave 118 — Hash-Chain Audit Trees & Tamper-Evident Ledger. Phase-B
      // opener / FIRST L5 hardening wave. Public Merkle-proof verify endpoint
      // available at /api/audit-chain/verify/:block_height (no auth).
      { key: 'audit_chain', title: 'Tamper-evident audit chain', description: 'Cross-chain Merkle tree, hash-chained block ledger, NERSA/IPPO/SARB quarterly attestation.', href: '/admin-platform/workstation?tab=audit-chain', cta_label: 'Open audit chain', icon: 'verified' },
      // Wave 119 — Certified Regulator Export Packs (Phase-B wave 2). 12-state
      // XBRL+iXBRL+ESG-narrative chain lodged via mTLS to 10 regulators.
      { key: 'regulator_exports', title: 'Regulator export packs', description: 'Certified XBRL/iXBRL packs lodged via mTLS to NERSA, IPPO, SARB, DMRE, FSCA, DFFE, DTI, JSE, SARS, CIPC.', href: '/admin-platform/workstation?tab=regulator-exports', cta_label: 'Open export packs', icon: 'description' },
      // Wave 120 — Reconciliation Attestation (Phase-B wave 3). 12-state ICFR
      // attestation chain reconciling SAP S/4HANA, Oracle, SAGE 300, Workday,
      // STRATE, SWIFT MT940, NERSA/IPPO/DMRE inboxes, bank statements against
      // W118 audit blocks. CFO + audit-committee + external-auditor sign-offs.
      { key: 'reconciliation_attestation', title: 'Reconciliation attestation', description: 'L5 ICFR attestation chain reconciling SAP S/4HANA, Oracle, SAGE, STRATE, SWIFT, regulator inboxes against W118 audit blocks. CFO + audit-committee + external-auditor sign-offs.', href: '/admin-platform/workstation?tab=reconciliation-attestation', cta_label: 'Open attestations', icon: 'fact_check' },
      { key: 'reports', title: 'Revenue & reports', description: 'Settled revenue, churn, MRR, regulatory reports.', href: '/reports', cta_label: 'Open reports', icon: 'report' },
      { key: 'support', title: 'Support escalations', description: 'Tickets, breaches, cross-tenant search.', href: '/support', cta_label: 'Open support', icon: 'help' },
      // W124 Phase-C wave 3 — STRATE / SWIFT settlement connector.
      { key: 'strate_swift_connectors', title: 'Settlement rails (W124)', description: 'Phase-C wave 3. MONEY-IN/MONEY-OUT financial settlement spine: STRATE (SA CSD T+3/T+1) + SWIFT MT/MX (ISO 20022 pacs/camt/pain) + SARB SAMOS RTGS + SADC RTGS + commercial bank EFT/ACH. 12-state forward + 4 branch chain (proposed → bic_validated → bank_handshake → iso20022_schemas → messaging_session → test_messages → reconciliation_bound → live_settlement → cycle_reconciled → archived + suspended/resumed/credential_revoked/failover_active/disconnected), INVERTED SLA hours (domestic_eft 168 / multi_bank_eft 240 / strate_csd 360 / samos_rtgs 480 / swift_global 720). FLOOR-AT-SAMOS-RTGS ≥1 / FLOOR-AT-SWIFT-GLOBAL ≥3 of 5 flags. SIGNATURE: revoke_credential crosses SARB ExCon + FIC Act + Basel III LCR/NSFR + CPMI-IOSCO PFMI Principle 9 EVERY tier. mTLS-gated PUBLIC peer endpoint via x-mtls-cert-fingerprint. NEW settlement namespace.', href: '/admin-platform/workstation?tab=strate-swift-connectors', cta_label: 'Open settlement rails', icon: 'account_balance' },
      // W125 Phase-C wave 4 — SAP / Oracle ERP connector.
      { key: 'sap_oracle_erp_connectors', title: 'ERP connectors (W125)', description: 'Phase-C wave 4. Period-close GL spine to enterprise ERP back-office (SAP S/4HANA OData + IDoc FIDCC1/FIDCC2 + Oracle Fusion/EBS SOAP + Workday + Sage 300 + Dynamics 365 + NetSuite + Epicor + IFS). 12-state forward + 4 branch chain (proposed → endpoint_validated → cost_center_mapped → coa_bound → schemas_registered → idoc_or_bapi_session → test_postings → reconciliation_bound → live_postings → period_close_reconciled → archived + suspended/resumed/credential_revoked/failover_active/disconnected), INVERTED SLA hours (single_module 168 / multi_module 240 / multi_company_code 360 / multi_entity_consolidation 480 / multi_country 720). FLOOR-AT-ENTERPRISE-WIDE ≥1 / FLOOR-AT-MULTI-COUNTRY ≥3 of 5 flags (SOX 404 / IFRS 10/12 consolidation / Transfer pricing / SARS critical / CIPC AFS gate). SIGNATURE: revoke_credential crosses SOX 404 + IFRS 15/9/16/17 + SARS e-Filing + CIPC + SOC 1 Type II + ISO 27001 + PCAOB AS 5 EVERY tier. mTLS-gated PUBLIC peer endpoint via x-mtls-cert-fingerprint. Shares settlement audit namespace with W124. Cron 45 1 * * * nightly reconciliation sweep.', href: '/admin-platform/workstation?tab=sap-oracle-erp-connectors', cta_label: 'Open ERP connectors', icon: 'account_tree' },
      // W126 Phase-C wave 5 of 5 - FINAL Phase-C connector wave - CIPC / SARS / NERSA government filing APIs.
      { key: 'government_filing_connectors', title: 'Filing connectors (W126)', description: 'Phase-C wave 5 of 5 (FINAL Phase-C connector). Statutory filing spine to SA government APIs: CIPC Annual Return XML + SARS e-Filing (IT14 / VAT201 / EMP201 / IRP5) + NERSA quarterly returns + DMRE compliance + DFFE GHG + PAIA + SARB FX + FIC STR + FSCA conduct + Treasury MFMA + municipal. 12-state forward + 4 branch chain (proposed → filing_authority_validated → tax_registration_bound → filing_template_mapped → schemas_loaded → e_filing_session_established → test_submission_validated → reconciliation_period_bound → live_filing_active → filing_acknowledged → archived + suspended / disconnected / credential_revoked / failover_active), INVERTED SLA hours (single_entity 168 / multi_entity 240 / multi_jurisdiction 360 / systemic_critical 480 / national_statutory 720). FLOOR-AT-MULTI-JURISDICTION (>=1) / FLOOR-AT-SYSTEMIC-CRITICAL (>=3) on 5 flags (Companies Act lateness penalty / SARS admin penalty / NERSA levy arrears / DFFE GHG threshold / PAIA SAR open). SIGNATURE: revoke_credential crosses EVERY tier; activate_failover multi_jurisdiction+systemic_critical; disconnect EVERY tier when Companies Act lateness OR SARS admin penalty active; acknowledge_filing systemic_critical only; sla_breached multi_jurisdiction+systemic_critical. mTLS-gated PUBLIC peer endpoint via x-mtls-cert-fingerprint. Opens new regulator audit namespace. Crons */15 * * * * SLA sweep + 0 2 * * * daily filing-deadline sweep + 0 7 * * 1 weekly cert-expiry scan. CLOSES Phase C.', href: '/admin-platform/workstation?tab=government-filing-connectors', cta_label: 'Open filing connectors', icon: 'gavel' },
      // W127 Phase-D wave 1 of 4 - FIRST Phase-D wave - Anomaly-Detection ML Model. ML governance brain replacing the W71 heuristic prognostics ensemble.
      { key: 'anomaly_detection_ml', title: 'Anomaly ML (W127)', description: 'FIRST Phase-D ML governance wave (W127-W130). Anomaly-detection ML model lifecycle on oe_anomaly_detection_ml: 7 model families (isolation_forest / lstm_autoencoder / variational_autoencoder / transformer_anomaly / gradient_boosted_residual / one_class_svm / ensemble_stacking) over 10 asset classes (inverter / battery_cell / pcs / transformer / pv_module / wind_turbine / scada_gateway / meter / weather_station / iiot_gateway). 12-state forward + 4 branch chain (model_proposed → dataset_bound → features_engineered → train_test_split → model_trained → backtest_validated → calibrated → shadow_deployed → live_ab_active → champion_promoted → retrained → archived + drift_detected / rolled_back / recalled / failover_to_baseline). INVERTED SLA hours at model_proposed (single_asset 24 / small_fleet 96 / large_fleet 240 / multi_jurisdiction_fleet 480 / fleet_systemic 720). FLOOR-AT-LARGE-FLEET ≥1 / FLOOR-AT-FLEET-SYSTEMIC ≥3 on 5 flags (safety_critical_inference / regulator_reportable_drift / nerc_cip_audit_in_scope / sox_ml_governance_required / iso_42001_ai_management_required). SIGNATURE: rollback_model crosses regulator EVERY tier (W127-ML-ROLLBACK first Phase-D hard line); recall_model EVERY tier when safety_critical_inference; detect_drift HEAVY tiers when regulator_reportable_drift; activate_failover top-heavy only. INTERNAL ML governance chain (no mTLS, no public peer endpoint). 5 bridges to W71 prognostics + W12 site commissioning + W118 audit (MANDATORY) + W126 government filing (when regulator_reportable_drift) + W74 NERSA levy (when iso_42001). Opens NEW ml audit namespace (4th). Crons */15 * * * * SLA sweep + 30 2 * * * daily drift scan + 0 7 * * 1 weekly model-card expiry sweep. ISO 42001 + NIST AI RMF + EU AI Act + ISO 27001 + SOC 2 Type II + NERC CIP-013 alignment.', href: '/admin-platform/workstation?tab=anomaly-detection-ml', cta_label: 'Open anomaly ML', icon: 'psychology' },
      // W128 Phase-D wave 2 of 4 - SECOND Phase-D wave - RUL Prediction ML Model. Survival/Cox PH brain REPLACING the W71 OLS-style degradation slope.
      { key: 'rul_prediction_ml', title: 'RUL ML (W128)', description: 'SECOND Phase-D ML governance wave (W127-W130). Survival/Cox PH ML model lifecycle on oe_rul_prediction_ml REPLACING the W71 OLS-style degradation slope: 6 model families (cox_ph / aft / deepsurv / rsf / xgb_surv / baseline_ols) over 10 asset classes (wind_turbine / pv_inverter / battery_storage / transformer / transmission_line / substation / hydrogen_electrolyser / grid_scada / smart_meter / generic). 12-state forward + 4 branch chain (model_proposed → survival_dataset_bound → features_engineered → train_test_split → model_trained → backtest_validated → calibrated → shadow_deployed → live_ab_active → champion_promoted → retrained → archived + drift_detected / rolled_back / recalled / failover_to_ols). INVERTED SLA hours at model_proposed (single_asset 24 / small_fleet 120 / large_fleet 360 / multi_jurisdiction_fleet 600 / fleet_systemic 720). LONGER survival_dataset_bound (48-720h) + shadow_deployed (72-1080h) than W127 - survival models need censored-event maturation. FLOOR-AT-LARGE-FLEET ≥1 / FLOOR-AT-FLEET-SYSTEMIC ≥3 on 5 flags (safety_critical_rul / regulator_reportable_rul_quantile / nerc_cip_audit_in_scope / sox_ml_governance_required / iso_42001_ai_management_required). SIGNATURE: rollback_model crosses regulator EVERY tier (W128-RUL-ROLLBACK SECOND Phase-D hard line); recall_model EVERY tier when safety_critical_rul; detect_drift HEAVY tiers when regulator_reportable_rul_quantile OR (PH-assumption-violated AND fleet_systemic); activate_failover_to_ols multi_jurisdiction + fleet_systemic. UNIQUE: promote_champion crosses at fleet_systemic when iso_42001 (replacing OLS at systemic scale is a governance event). INTERNAL ML governance chain (no mTLS, no public peer endpoint). 5 bridges (W71 prognostics MANDATORY NOT NULL + W21 lender drawdown + W77 reserve account + W63 warranty recovery + W118 audit MANDATORY). JOINS W127 ml audit namespace. Harrell C + time-dependent AUC + Brier + Schoenfeld PH p-value + KM-lift-vs-OLS monotonic-replacement proof. Crons */15 * * * * SLA sweep + 0 3 * * * daily concordance monitor + 0 7 * * 1 weekly model-card expiry sweep. ISO 42001 + NIST AI RMF + EU AI Act + ISO 27001 + SOC 2 Type II + NERC CIP-013. Beats AspenTech Mtell + GE APM survival + Uptake Fusion + Augury + C3.ai reliability + SparkCognition + Petuum + DataRPM.', href: '/admin-platform/workstation?tab=rul-prediction-ml', cta_label: 'Open RUL ML', icon: 'query_stats' },
      // W129 Phase-D wave 3 of 4 - THIRD Phase-D wave - Fault-Fingerprint Multi-Class ML. XGBoost/RF/GB/CNN-1D/LightGBM/CatBoost classifier replacing W71 12-mode physics rules.
      { key: 'fault_fingerprint_ml', title: 'Fault ML (W129)', description: 'THIRD Phase-D ML governance wave (W127-W130). Multi-class fault classifier lifecycle on oe_fault_fingerprint_ml REPLACING the W71 12-mode physics-rule fault fingerprinting: 7 model families (xgboost / random_forest / gradient_boosting / cnn_1d / lightgbm / catboost / baseline_physics) over 10 asset classes against 12 inherited W71 fault modes (bearing_wear / blade_imbalance / gearbox_fault / inverter_igbt_fault / cell_imbalance / dc_arc_fault / transformer_winding / insulation_breakdown / scada_comms_loss / cooling_failure / overheating / unknown). 12-state forward + 4 branch chain (model_proposed → labeled_dataset_bound → class_imbalance_resolved → features_engineered → train_test_split → multiclass_model_trained → confusion_matrix_validated → calibrated → shadow_deployed → live_ab_active → champion_promoted → retrained → archived + class_drift_detected / rolled_back / recalled / failover_to_physics_baseline + add_novel_class RE-ENTRY). INVERTED SLA hours at model_proposed (single_asset 36 / small_fleet 120 / large_fleet 300 / multi_jurisdiction_fleet 600 / fleet_systemic 900 - LONGER than W128 for multi-class confusion-matrix stabilisation + per-class calibration). MIN-30-SAMPLES-PER-CLASS stratified split floor (NIST AI RMF MEASURE). FLOOR-AT-LARGE-FLEET ≥1 / FLOOR-AT-FLEET-SYSTEMIC ≥3 on 5 flags (safety_critical_fault_class / regulator_reportable_misclass / nerc_cip_audit_in_scope / sox_ml_governance_required / iso_42001_required). SIGNATURE: rollback_model crosses regulator EVERY tier (W129-FFML-ROLLBACK THIRD Phase-D hard line, joins W127+W128); recall_model EVERY tier when safety_critical_fault_class; detect_class_drift HEAVY tiers when regulator_reportable_misclass; failover_to_physics_baseline multi_jurisdiction + fleet_systemic. W129-UNIQUE: add_novel_class crosses regulator at fleet_systemic ONLY (EU AI Act Art 14 product-class change). INTERNAL ML governance chain (no mTLS, no public peer endpoint). 5 bridges (W71 prognostics MANDATORY NOT NULL 12-mode physics baseline reconciliation + W15 warranty claim + W41 ITIL problem mgmt + W63 warranty recovery + W118 audit MANDATORY). JOINS W127 ml audit namespace. Macro-F1 + micro-F1 + weighted recall + top-3 acc + log loss + ROC AUC macro + class-PSI + confusion-matrix density + calibration Brier + reconciliation-with-W71-physics-pct monotonic-replacement proof. Crons */15 * * * * SLA sweep + 30 3 * * * daily class-drift scan + 0 7 * * 1 weekly model-card expiry sweep. ISO 42001 + NIST AI RMF + EU AI Act + ISO 27001 + SOC 2 Type II + NERC CIP-013. Beats AspenTech Mtell pattern-recognition + GE APM fault classification + Uptake Fusion fault library + Augury machine diagnostics + C3.ai fault-mode classifier + SparkCognition SparkPredict + Petuum + DataRPM classification stacks.', href: '/admin-platform/workstation?tab=fault-fingerprint-ml', cta_label: 'Open fault ML', icon: 'pattern' },
      // W130 Phase-D wave 4 of 4 - FOURTH (FINAL) Phase-D wave - NTT Comparison Battery. CLOSES PHASE D.
      { key: 'ntt_comparison_battery', title: 'NTT comparison (W130)', description: 'FOURTH (FINAL) Phase-D ML governance wave (W127-W130) - CLOSES PHASE D. Continuous live comparison-battery aggregator on oe_ntt_comparison_battery stitching W127 (anomaly LSTM-AE) + W128 (RUL Cox PH survival) + W129 (fault-fingerprint multi-class) against an emulated NTT IoT/O&M baseline. Each row = one COMPARISON CYCLE (nightly). Produces revenue-weighted, statistically-significance-gated, tamper-evident savings-vs-NTT-30% KPI streaming into Esums dashboard hero. 12-state forward + 4 branch chain (cycle_proposed -> baselines_synced -> predictions_emitted -> ground_truth_observed -> metrics_computed -> statistical_test_passed -> savings_quantified -> cycle_published -> board_published -> archived + drift_detected / rolled_back / recalled_certification / failover_to_prior_cycle). INVERTED SLA hours at cycle_proposed (single_asset 12 / small_fleet 48 / large_fleet 120 / multi_jurisdiction_fleet 240 / fleet_systemic 480 - TIGHTER than W127-W129 because cycles run NIGHTLY). FLOOR-AT-LARGE-FLEET >=1 / FLOOR-AT-FLEET-SYSTEMIC >=3 on 5 flags (sustained_below_target / regulator_reportable_diversion / nerc_cip_audit_in_scope / sox_ml_governance_required / iso_42001_required). SIGNATURE: recall_certification crosses regulator EVERY tier (W130-NCB-RECALL FOURTH Phase-D hard line); rollback_cycle EVERY when sustained_below_target >=4 consecutive cycles (NTT contract reneg trigger). INTERNAL ML governance chain (no mTLS). 5 bridges (W127 anomaly + W128 RUL + W129 fault + W71 prognostics control variable + W118 audit MANDATORY at publish_audit). JOINS W127 ml audit namespace. savings_vs_ntt_pct_live + cumulative_savings_zar_live + paired_t p-value + revenue-weighted Brier + monotonic-replacement proof. Crons */15 SLA sweep + 15 4 * * * NIGHTLY CYCLE RUNNER + 0 7 * * 1 weekly model-card expiry + 0 1 1 * * monthly cumulative-savings-ledger reconciliation (catches drift before Q+1 SARB MA s.38 notifiable). ISO 42001 + NIST AI RMF + EU AI Act + ISO 27001 + SOC 2 Type II + NERC CIP-013. Beats NTT Data IoT + NTT O&M stack on revenue-weighted savings-vs-NTT-30% sustained-cycle proof.', href: '/admin-platform/workstation?tab=ntt-comparison-battery', cta_label: 'Open NTT comparison', icon: 'compare_arrows' },
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
      // W123 Phase-C wave 2 — MQTT / OPC UA edge-device + IIoT broker chain.
      { key: 'mqtt_opcua_connectors', title: 'MQTT / OPC UA connectors (W123)', description: 'Edge-device / IIoT broker bridge: MQTT v5 / OPC UA 1.05 / Pub/Sub / Sparkplug B / IEC 61400-25 / IEEE 2030.5 CSIP / SunSpec Modbus across PV / energy / battery / inverter / wind. INVERTED SLA, mTLS-gated peer endpoint, revoke_credential crosses NERSA + IEC 62443 + POPIA s19 + SARB BA 700 EVERY tier.', href: '/support/workstation?tab=mqtt-opcua-connectors', cta_label: 'Open MQTT/OPC-UA connectors', icon: 'router' },
      // W127 Phase-D wave 1 of 4 - FIRST Phase-D wave - Anomaly-Detection ML Model. Support-side ML governance brain.
      { key: 'anomaly_detection_ml', title: 'Anomaly ML (W127)', description: 'FIRST Phase-D ML governance wave (W127-W130). Support-side view into anomaly-detection ML model lifecycle on oe_anomaly_detection_ml: 7 model families (isolation_forest / lstm_autoencoder / variational_autoencoder / transformer_anomaly / gradient_boosted_residual / one_class_svm / ensemble_stacking) over 10 asset classes (inverter / battery_cell / pcs / transformer / pv_module / wind_turbine / scada_gateway / meter / weather_station / iiot_gateway). 12-state forward + 4 branch chain. INVERTED SLA at model_proposed (single_asset 24h → fleet_systemic 720h). 5 FLOOR flags lift to large_fleet ≥1 / fleet_systemic ≥3. SIGNATURE: rollback_model crosses regulator EVERY tier (W127-ML-ROLLBACK first Phase-D hard line); recall_model EVERY when safety_critical_inference; detect_drift HEAVY tiers when regulator_reportable_drift; activate_failover top-heavy only. INTERNAL governance chain (no mTLS). 5 bridges (W71 prognostics + W12 commissioning + W118 audit MANDATORY + W126 government filing when regulator_reportable_drift + W74 NERSA levy when iso_42001). NEW ml audit namespace (4th). ISO 42001 + NIST AI RMF + EU AI Act + ISO 27001 + SOC 2 Type II + NERC CIP-013.', href: '/support/workstation?tab=anomaly-detection-ml', cta_label: 'Open anomaly ML', icon: 'psychology' },
      // W128 Phase-D wave 2 of 4 - SECOND Phase-D wave - RUL Prediction ML Model. Support-side survival/Cox PH brain replacing W71 OLS.
      { key: 'rul_prediction_ml', title: 'RUL ML (W128)', description: 'SECOND Phase-D ML governance wave (W127-W130). Support-side view into survival/Cox PH ML model lifecycle on oe_rul_prediction_ml REPLACING the W71 OLS-style degradation slope: 6 model families (cox_ph / aft / deepsurv / rsf / xgb_surv / baseline_ols) over 10 asset classes (wind_turbine / pv_inverter / battery_storage / transformer / transmission_line / substation / hydrogen_electrolyser / grid_scada / smart_meter / generic). 12-state forward + 4 branch chain. INVERTED SLA at model_proposed (single_asset 24h → fleet_systemic 720h). LONGER survival_dataset_bound (48-720h) + shadow_deployed (72-1080h) than W127. 5 FLOOR flags lift to large_fleet ≥1 / fleet_systemic ≥3 (safety_critical_rul / regulator_reportable_rul_quantile / nerc_cip_audit_in_scope / sox_ml_governance_required / iso_42001_ai_management_required). SIGNATURE: rollback_model crosses regulator EVERY tier (W128-RUL-ROLLBACK SECOND Phase-D hard line); recall_model EVERY when safety_critical_rul; detect_drift HEAVY tiers when regulator_reportable_rul_quantile OR PH-violated AND fleet_systemic; activate_failover_to_ols multi_jurisdiction + fleet_systemic. UNIQUE: promote_champion crosses at fleet_systemic when iso_42001. INTERNAL governance chain (no mTLS). 5 bridges (W71 prognostics MANDATORY NOT NULL + W21 lender drawdown + W77 reserve account + W63 warranty recovery + W118 audit MANDATORY). JOINS W127 ml audit namespace. Harrell C + td-AUC + Brier + Schoenfeld PH p-value + KM-lift-vs-OLS. ISO 42001 + NIST AI RMF + EU AI Act + ISO 27001 + SOC 2 Type II + NERC CIP-013.', href: '/support/workstation?tab=rul-prediction-ml', cta_label: 'Open RUL ML', icon: 'query_stats' },
      // W129 Phase-D wave 3 of 4 - THIRD Phase-D wave - Fault-Fingerprint Multi-Class ML. Support-side multi-class classifier brain replacing W71 12-mode physics rules.
      { key: 'fault_fingerprint_ml', title: 'Fault ML (W129)', description: 'THIRD Phase-D ML governance wave (W127-W130). Support-side view into multi-class fault classifier lifecycle on oe_fault_fingerprint_ml REPLACING the W71 12-mode physics-rule fault fingerprinting: 7 model families (xgboost / random_forest / gradient_boosting / cnn_1d / lightgbm / catboost / baseline_physics) over 10 asset classes against 12 inherited W71 fault modes. 12-state forward + 4 branch chain (model_proposed → labeled_dataset_bound → class_imbalance_resolved → features_engineered → train_test_split → multiclass_model_trained → confusion_matrix_validated → calibrated → shadow_deployed → live_ab_active → champion_promoted → retrained → archived + class_drift_detected / rolled_back / recalled / failover_to_physics_baseline + add_novel_class RE-ENTRY). INVERTED SLA at model_proposed (single_asset 36h → fleet_systemic 900h - LONGER than W128 for multi-class confusion-matrix stabilisation). MIN-30-SAMPLES-PER-CLASS stratified split floor. 5 FLOOR flags lift to large_fleet ≥1 / fleet_systemic ≥3 (safety_critical_fault_class / regulator_reportable_misclass / nerc_cip_audit_in_scope / sox_ml_governance_required / iso_42001_required). SIGNATURE: rollback_model crosses regulator EVERY tier (W129-FFML-ROLLBACK THIRD Phase-D hard line, joins W127+W128); recall_model EVERY when safety_critical_fault_class; detect_class_drift HEAVY tiers when regulator_reportable_misclass; failover_to_physics_baseline multi_jurisdiction + fleet_systemic. W129-UNIQUE: add_novel_class crosses regulator at fleet_systemic ONLY (EU AI Act Art 14 product-class change). INTERNAL governance chain (no mTLS). 5 bridges (W71 prognostics MANDATORY NOT NULL 12-mode physics baseline + W15 warranty claim + W41 ITIL problem mgmt + W63 warranty recovery + W118 audit MANDATORY). JOINS W127 ml audit namespace. Macro-F1 + micro-F1 + weighted recall + top-3 acc + class-PSI + reconciliation-with-W71-physics-pct monotonic-replacement proof. ISO 42001 + NIST AI RMF + EU AI Act + ISO 27001 + SOC 2 Type II + NERC CIP-013.', href: '/support/workstation?tab=fault-fingerprint-ml', cta_label: 'Open fault ML', icon: 'pattern' },
      // W130 Phase-D wave 4 of 4 - FOURTH (FINAL) Phase-D wave - NTT Comparison Battery. Support-side aggregator view. CLOSES PHASE D.
      { key: 'ntt_comparison_battery', title: 'NTT comparison (W130)', description: 'FOURTH (FINAL) Phase-D ML governance wave (W127-W130) - CLOSES PHASE D. Support-side view into the continuous live comparison-battery aggregator on oe_ntt_comparison_battery stitching W127 (anomaly LSTM-AE) + W128 (RUL Cox PH survival) + W129 (fault-fingerprint multi-class) against an emulated NTT IoT/O&M baseline. Each row = one COMPARISON CYCLE (nightly). Produces revenue-weighted, statistically-significance-gated, tamper-evident savings-vs-NTT-30% KPI streaming into Esums dashboard hero. 12-state forward + 4 branch chain (cycle_proposed -> baselines_synced -> predictions_emitted -> ground_truth_observed -> metrics_computed -> statistical_test_passed -> savings_quantified -> cycle_published -> board_published -> archived + drift_detected / rolled_back / recalled_certification / failover_to_prior_cycle). INVERTED SLA at cycle_proposed (single_asset 12h -> fleet_systemic 480h - TIGHTER than W127-W129 because cycles run NIGHTLY). 5 FLOOR flags lift to large_fleet >=1 / fleet_systemic >=3 (sustained_below_target / regulator_reportable_diversion / nerc_cip_audit_in_scope / sox_ml_governance_required / iso_42001_required). SIGNATURE: recall_certification crosses regulator EVERY tier (W130-NCB-RECALL FOURTH Phase-D hard line); rollback_cycle EVERY when sustained_below_target >=4 consecutive cycles. INTERNAL governance chain (no mTLS). 5 bridges (W127 anomaly + W128 RUL + W129 fault + W71 prognostics control variable + W118 audit MANDATORY). JOINS W127 ml audit namespace. savings_vs_ntt_pct_live + cumulative_savings_zar_live + paired_t p-value + revenue-weighted Brier + monotonic-replacement proof. Crons */15 SLA + 15 4 nightly cycle runner + 0 7 Mon weekly model-card expiry + 0 1 1st-of-month monthly cumulative-savings-ledger reconciliation. ISO 42001 + NIST AI RMF + EU AI Act + ISO 27001 + SOC 2 Type II + NERC CIP-013. Beats NTT Data IoT + NTT O&M stack.', href: '/support/workstation?tab=ntt-comparison-battery', cta_label: 'Open NTT comparison', icon: 'compare_arrows' },
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
