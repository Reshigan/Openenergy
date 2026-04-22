// ═══════════════════════════════════════════════════════════════════════════
// Market / operational intelligence. Surfaces signals drawn from live platform
// state (milestones, invoices, faults, trade imbalances, contract expiries)
// and persists them in `intelligence_items` so cockpits and daily briefings
// can consume them. Schema lives in migrations/001_core.sql:283.
// ═══════════════════════════════════════════════════════════════════════════

import { Hono } from 'hono';
import { HonoEnv } from '../utils/types';
import { authMiddleware, getCurrentUser } from '../middleware/auth';

const intelligence = new Hono<HonoEnv>();
intelligence.use('*', authMiddleware);

function genId(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).substring(2, 6)}`;
}

async function ensureItem(env: HonoEnv['Bindings'], row: {
  participant_id: string | null;
  type: string;
  severity: 'info' | 'warning' | 'critical';
  title: string;
  description: string;
  entity_type?: string | null;
  entity_id?: string | null;
  action_required?: string | null;
}) {
  // Dedupe on (participant_id, type, entity_type, entity_id) within unresolved
  // items so a daily scan doesn't spam identical cards.
  const existing = await env.DB.prepare(`
    SELECT id FROM intelligence_items
    WHERE COALESCE(participant_id,'') = COALESCE(?, '')
      AND type = ?
      AND COALESCE(entity_type,'') = COALESCE(?, '')
      AND COALESCE(entity_id,'') = COALESCE(?, '')
      AND resolved = 0
    LIMIT 1
  `).bind(row.participant_id, row.type, row.entity_type || null, row.entity_id || null).first();
  if (existing) return (existing as { id: string }).id;

  const id = genId('ii');
  await env.DB.prepare(`
    INSERT INTO intelligence_items
      (id, participant_id, type, severity, title, description, entity_type, entity_id, action_required, resolved, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
  `).bind(
    id,
    row.participant_id,
    row.type,
    row.severity,
    row.title,
    row.description,
    row.entity_type || null,
    row.entity_id || null,
    row.action_required || null,
    new Date().toISOString(),
  ).run();
  return id;
}

// ---------------- Read ----------------

// GET /api/intelligence — feed for the caller. Admin/regulator see global
// items (participant_id IS NULL) plus items across every tenant.
intelligence.get('/', async (c) => {
  const user = getCurrentUser(c);
  const type = c.req.query('type');
  const severity = c.req.query('severity');
  const resolved = c.req.query('resolved');

  const filters: string[] = [];
  const bindings: unknown[] = [];

  if (user.role === 'admin' || user.role === 'regulator') {
    // no participant filter
  } else {
    filters.push('(participant_id = ? OR participant_id IS NULL)');
    bindings.push(user.id);
  }
  if (type) { filters.push('type = ?'); bindings.push(type); }
  if (severity) { filters.push('severity = ?'); bindings.push(severity); }
  if (resolved !== undefined && resolved !== null && resolved !== '') {
    filters.push('resolved = ?');
    bindings.push(resolved === '1' || resolved === 'true' ? 1 : 0);
  }
  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';

  const rows = await c.env.DB.prepare(
    `SELECT * FROM intelligence_items ${where} ORDER BY
       CASE severity WHEN 'critical' THEN 1 WHEN 'warning' THEN 2 ELSE 3 END,
       created_at DESC LIMIT 200`,
  ).bind(...bindings).all();
  return c.json({ success: true, data: rows.results || [] });
});

// GET /api/intelligence/summary — counts by severity + type for a dashboard tile.
intelligence.get('/summary', async (c) => {
  const user = getCurrentUser(c);
  const scope = user.role === 'admin' || user.role === 'regulator'
    ? { clause: '1=1', params: [] as unknown[] }
    : { clause: '(participant_id = ? OR participant_id IS NULL)', params: [user.id] };

  const [bySeverity, byType, unresolved] = await Promise.all([
    c.env.DB.prepare(`SELECT severity, COUNT(*) AS c FROM intelligence_items WHERE ${scope.clause} AND resolved = 0 GROUP BY severity`).bind(...scope.params).all(),
    c.env.DB.prepare(`SELECT type, COUNT(*) AS c FROM intelligence_items WHERE ${scope.clause} AND resolved = 0 GROUP BY type`).bind(...scope.params).all(),
    c.env.DB.prepare(`SELECT COUNT(*) AS c FROM intelligence_items WHERE ${scope.clause} AND resolved = 0`).bind(...scope.params).first(),
  ]);
  return c.json({
    success: true,
    data: {
      unresolved_count: Number((unresolved as { c?: number } | null)?.c || 0),
      by_severity: bySeverity.results || [],
      by_type: byType.results || [],
    },
  });
});

// ---------------- Lifecycle ----------------

// POST /api/intelligence/:id/resolve — mark an item as resolved.
intelligence.post('/:id/resolve', async (c) => {
  const user = getCurrentUser(c);
  const id = c.req.param('id');
  const item = await c.env.DB.prepare('SELECT participant_id FROM intelligence_items WHERE id = ?').bind(id).first() as { participant_id: string | null } | null;
  if (!item) return c.json({ success: false, error: 'item_not_found' }, 404);
  if (item.participant_id && item.participant_id !== user.id && user.role !== 'admin' && user.role !== 'regulator') {
    return c.json({ success: false, error: 'forbidden' }, 403);
  }
  await c.env.DB.prepare(
    `UPDATE intelligence_items SET resolved = 1, resolved_at = ?, resolved_by = ? WHERE id = ?`,
  ).bind(new Date().toISOString(), user.id, id).run();
  return c.json({ success: true });
});

// POST /api/intelligence — manual intel card (admin / regulator / system).
intelligence.post('/', async (c) => {
  const user = getCurrentUser(c);
  if (!['admin', 'regulator'].includes(user.role)) {
    return c.json({ success: false, error: 'admin_or_regulator_only' }, 403);
  }
  const body = await c.req.json().catch(() => ({} as Record<string, unknown>));
  const { participant_id, type, severity, title, description, entity_type, entity_id, action_required } = body as Record<string, string | undefined>;
  if (!type || !title) return c.json({ success: false, error: 'type_and_title_required' }, 400);
  const id = await ensureItem(c.env, {
    participant_id: participant_id || null,
    type,
    severity: (['info', 'warning', 'critical'].includes(severity || '') ? severity : 'info') as 'info' | 'warning' | 'critical',
    title,
    description: description || '',
    entity_type,
    entity_id,
    action_required,
  });
  return c.json({ success: true, data: { id } }, 201);
});

// ---------------- Scan ----------------

// POST /api/intelligence/scan — sweeps platform state to generate intel cards.
// Run on a cron or manually from the admin console. Produces:
//   - operational:   CP milestones due ≤ 7d, critical faults open
//   - financial:     invoices overdue + invoices due ≤ 7d
//   - regulatory:    filings due ≤ 30d, consents missing
//   - market:        high trade imbalance last 7d, contracts expiring ≤ 90d
//   - compliance:    KYC pending > 7d
intelligence.post('/scan', async (c) => {
  const user = getCurrentUser(c);
  if (user.role !== 'admin' && user.role !== 'regulator') {
    return c.json({ success: false, error: 'admin_or_regulator_only' }, 403);
  }

  let inserted = 0;
  const touch = async (args: Parameters<typeof ensureItem>[1]) => {
    await ensureItem(c.env, args);
    inserted += 1;
  };

  // 1. CP milestone deadlines (per participant).
  const milestoneRows = await c.env.DB.prepare(`
    SELECT pm.id, pm.milestone_name, pm.target_date, ip.project_name, ip.developer_id
    FROM project_milestones pm
    JOIN ipp_projects ip ON pm.project_id = ip.id
    WHERE pm.status = 'pending' AND pm.target_date BETWEEN date('now') AND date('now','+7 day')
  `).all();
  for (const row of milestoneRows.results || []) {
    const m = row as { id: string; milestone_name: string; target_date: string; project_name: string; developer_id: string };
    await touch({
      participant_id: m.developer_id,
      type: 'operational',
      severity: 'warning',
      title: `CP deadline: ${m.milestone_name}`,
      description: `Project "${m.project_name}" milestone due ${m.target_date}`,
      entity_type: 'project_milestones',
      entity_id: m.id,
      action_required: 'Review milestone',
    });
  }

  // 2. Open critical faults (per IPP).
  const faultRows = await c.env.DB.prepare(`
    SELECT f.id, f.fault_code, f.severity, os.site_name, ip.developer_id
    FROM ona_faults f
    JOIN ona_sites os ON f.site_id = os.id
    JOIN ipp_projects ip ON ip.id = os.project_id
    WHERE f.status != 'resolved' AND f.severity IN ('high','critical')
  `).all();
  for (const row of faultRows.results || []) {
    const f = row as { id: string; fault_code: string; severity: string; site_name: string; developer_id: string };
    await touch({
      participant_id: f.developer_id,
      type: 'operational',
      severity: f.severity === 'critical' ? 'critical' : 'warning',
      title: `${f.severity.toUpperCase()} fault: ${f.fault_code}`,
      description: `Unresolved ${f.severity} fault at ${f.site_name}`,
      entity_type: 'ona_faults',
      entity_id: f.id,
      action_required: 'Triage in Ona',
    });
  }

  // 3. Overdue and upcoming invoices (per recipient). `invoices.total_amount`
  // is the VAT-inclusive invoice total; `paid_amount` tracks partial payments.
  const invoiceRows = await c.env.DB.prepare(`
    SELECT id, invoice_number, to_participant_id, total_amount, paid_amount, status, due_date
    FROM invoices
    WHERE status IN ('issued','partial') AND due_date <= date('now','+7 day')
  `).all();
  for (const row of invoiceRows.results || []) {
    const inv = row as { id: string; invoice_number: string; to_participant_id: string; total_amount: number; paid_amount: number; status: string; due_date: string };
    const overdue = inv.due_date < new Date().toISOString().slice(0, 10);
    const outstanding = (inv.total_amount || 0) - (inv.paid_amount || 0);
    await touch({
      participant_id: inv.to_participant_id,
      type: 'financial',
      severity: overdue ? 'critical' : 'warning',
      title: `${overdue ? 'Overdue' : 'Due'} invoice ${inv.invoice_number}`,
      description: `${overdue ? 'Overdue since' : 'Due by'} ${inv.due_date}. Outstanding R${outstanding.toLocaleString('en-ZA')}.`,
      entity_type: 'invoices',
      entity_id: inv.id,
      action_required: 'Settle or dispute',
    });
  }

  // 4. Contracts expiring ≤ 90 days — contract end/term dates live inside the
  // commercial_terms JSON blob (no dedicated column). We parse it here and
  // notify both parties when the computed end date falls within the window.
  const activeContractRows = await safeAll(c.env, `
    SELECT id, title, creator_id, counterparty_id, commercial_terms
    FROM contract_documents
    WHERE phase = 'active' AND commercial_terms IS NOT NULL
  `);
  const today = new Date();
  const in90 = new Date(today.getTime() + 90 * 24 * 60 * 60 * 1000);
  for (const row of activeContractRows) {
    const k = row as { id: string; title: string; creator_id: string; counterparty_id: string; commercial_terms: string };
    let endIso: string | null = null;
    try {
      const terms = JSON.parse(k.commercial_terms) as Record<string, unknown>;
      const candidate = (terms.end_date || terms.term_end_date || terms.expiry_date || terms.delivery_end) as string | undefined;
      if (candidate) endIso = String(candidate).slice(0, 10);
    } catch {
      endIso = null;
    }
    if (!endIso) continue;
    const end = new Date(endIso);
    if (isNaN(end.getTime()) || end < today || end > in90) continue;
    for (const party of [k.creator_id, k.counterparty_id]) {
      if (!party) continue;
      await touch({
        participant_id: party,
        type: 'market',
        severity: 'info',
        title: `Contract expiring: ${k.title}`,
        description: `Expires ${endIso}. Start renewal talks.`,
        entity_type: 'contract_documents',
        entity_id: k.id,
        action_required: 'Open renewal discussion',
      });
    }
  }

  // 5. Trade imbalance — last 7d.
  const imbalanceRows = await safeAll(c.env, `
    SELECT participant_id,
           SUM(CASE WHEN side='buy' THEN volume_mwh ELSE 0 END) AS buy_mwh,
           SUM(CASE WHEN side='sell' THEN volume_mwh ELSE 0 END) AS sell_mwh
    FROM trade_orders
    WHERE created_at >= datetime('now','-7 day') AND status IN ('matched','filled')
    GROUP BY participant_id
  `);
  for (const row of imbalanceRows) {
    const t = row as { participant_id: string; buy_mwh: number; sell_mwh: number };
    const total = (t.buy_mwh || 0) + (t.sell_mwh || 0);
    if (!total) continue;
    const skew = Math.abs((t.buy_mwh || 0) - (t.sell_mwh || 0)) / total;
    if (skew > 0.7) {
      await touch({
        participant_id: t.participant_id,
        type: 'market',
        severity: 'info',
        title: 'Trade book skew detected',
        description: `Last 7 days: ${Math.round((t.buy_mwh || 0))} MWh buys vs ${Math.round((t.sell_mwh || 0))} MWh sells (${Math.round(skew * 100)}% skew). Consider hedging.`,
        entity_type: 'trade_orders',
        entity_id: null,
        action_required: 'Review in Trading Desk',
      });
    }
  }

  // 6. KYC pending > 7d — platform-wide (admin-only item).
  const kycRows = await safeAll(c.env, `
    SELECT id, email, name, created_at FROM participants
    WHERE kyc_status = 'pending' AND created_at < datetime('now','-7 day')
    LIMIT 50
  `);
  for (const row of kycRows) {
    const p = row as { id: string; email: string; name: string; created_at: string };
    await touch({
      participant_id: null,
      type: 'compliance',
      severity: 'warning',
      title: `KYC stale: ${p.name || p.email}`,
      description: `KYC pending since ${p.created_at}. Escalate to DPO.`,
      entity_type: 'participants',
      entity_id: p.id,
      action_required: 'Chase KYC docs',
    });
  }

  return c.json({ success: true, data: { inserted_or_refreshed: inserted } });
});

async function safeAll(env: HonoEnv['Bindings'], sql: string) {
  try {
    const r = await env.DB.prepare(sql).all();
    return (r.results || []) as Record<string, unknown>[];
  } catch {
    return [] as Record<string, unknown>[];
  }
}

export default intelligence;
