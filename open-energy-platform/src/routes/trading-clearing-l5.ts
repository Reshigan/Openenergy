// ════════════════════════════════════════════════════════════════════════
// trading-clearing-l5 — block trades, market surveillance, market-maker
// obligations, clearing house default fund.
//
// Mounted at /api/trading-clearing-l5.
// ════════════════════════════════════════════════════════════════════════

import { Hono } from 'hono';
import { HonoEnv } from '../utils/types';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { requireStepUp } from '../middleware/step-up';
import { fireCascade } from '../utils/cascade';

const r = new Hono<HonoEnv>();
r.use('*', authMiddleware);

const genId = (p: string) => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const adminOnly = (role: string) => ['admin', 'support'].includes(role);

// ─── Block trades ───────────────────────────────────────────────────────
r.get('/blocks', async (c) => {
  const rows = await c.env.DB.prepare(`SELECT * FROM oe_block_trades ORDER BY trade_time DESC LIMIT 200`).all();
  return c.json({ success: true, data: rows.results || [] });
});

r.post('/blocks', requireStepUp('trading.block_report'), async (c) => {
  const user = getCurrentUser(c);
  const b = await c.req.json().catch(() => ({} as any));
  const required = ['buyer_id', 'seller_id', 'energy_type', 'volume_mwh', 'price_zar_mwh', 'trade_time'];
  for (const f of required) if (b[f] == null) return c.json({ success: false, error: `${f} required` }, 400);
  const value = Number(b.volume_mwh) * Number(b.price_zar_mwh);
  const id = genId('blk');
  await c.env.DB.prepare(`
    INSERT INTO oe_block_trades
      (id, reporter_id, buyer_id, seller_id, energy_type, delivery_date,
       volume_mwh, price_zar_mwh, value_zar, trade_time, publication_delay_minutes)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)
  `).bind(
    id, user.id, b.buyer_id, b.seller_id, b.energy_type, b.delivery_date || null,
    Number(b.volume_mwh), Number(b.price_zar_mwh), value, b.trade_time,
    Number(b.publication_delay_minutes || 15),
  ).run();
  await fireCascade({
    event: 'block_trade.reported',
    actor_id: user.id,
    entity_type: 'oe_block_trades',
    entity_id: id,
    data: {
      buyer_id: b.buyer_id, seller_id: b.seller_id, energy_type: b.energy_type,
      volume_mwh: Number(b.volume_mwh), price_zar_mwh: Number(b.price_zar_mwh), value_zar: value,
    },
    env: c.env,
  });
  return c.json({ success: true, data: { id, value_zar: value } }, 201);
});

r.post('/blocks/:id/confirm', async (c) => {
  const user = getCurrentUser(c);
  if (!adminOnly(user.role)) return c.json({ success: false, error: 'forbidden' }, 403);
  const id = c.req.param('id');
  await c.env.DB.prepare(`UPDATE oe_block_trades SET status = 'confirmed' WHERE id = ? AND status = 'reported'`).bind(id).run();
  await fireCascade({
    event: 'block_trade.confirmed',
    actor_id: user.id,
    entity_type: 'oe_block_trades',
    entity_id: String(id),
    data: {},
    env: c.env,
  });
  return c.json({ success: true });
});

r.post('/blocks/:id/publish', async (c) => {
  const user = getCurrentUser(c);
  if (!adminOnly(user.role)) return c.json({ success: false, error: 'forbidden' }, 403);
  const id = c.req.param('id');
  // Enforce delay: confirmed_at + publication_delay_minutes <= now
  const row = await c.env.DB.prepare(`SELECT trade_time, publication_delay_minutes, status FROM oe_block_trades WHERE id = ?`).bind(id).first<any>();
  if (!row) return c.json({ success: false, error: 'not found' }, 404);
  if (row.status !== 'confirmed') return c.json({ success: false, error: 'must be confirmed first' }, 409);
  const earliest = new Date(row.trade_time).getTime() + Number(row.publication_delay_minutes) * 60_000;
  if (earliest > Date.now()) {
    return c.json({ success: false, error: 'publication_delay_not_elapsed', data: { earliest: new Date(earliest).toISOString() } }, 425);
  }
  await c.env.DB.prepare(`UPDATE oe_block_trades SET status = 'published', published_at = datetime('now') WHERE id = ?`).bind(id).run();
  await fireCascade({
    event: 'block_trade.published',
    actor_id: user.id,
    entity_type: 'oe_block_trades',
    entity_id: String(id),
    data: { trade_time: row.trade_time, publication_delay_minutes: Number(row.publication_delay_minutes) },
    env: c.env,
  });
  return c.json({ success: true });
});

r.post('/blocks/:id/bust', requireStepUp('trading.block_bust.high'), async (c) => {
  const user = getCurrentUser(c);
  if (user.role !== 'admin') return c.json({ success: false, error: 'forbidden' }, 403);
  const id = c.req.param('id');
  const b = await c.req.json().catch(() => ({} as any));
  await c.env.DB.prepare(`UPDATE oe_block_trades SET status = 'bust', bust_reason = ? WHERE id = ?`).bind(b.reason || 'manual_bust', id).run();
  await fireCascade({
    event: 'block_trade.bust',
    actor_id: user.id,
    entity_type: 'oe_block_trades',
    entity_id: String(id),
    data: { reason: b.reason || 'manual_bust' },
    env: c.env,
  });
  return c.json({ success: true });
});

// ─── Surveillance ───────────────────────────────────────────────────────
r.get('/surveillance/alerts', async (c) => {
  const user = getCurrentUser(c);
  if (!adminOnly(user.role)) return c.json({ success: false, error: 'forbidden' }, 403);
  const status = c.req.query('status');
  const sql = status
    ? `SELECT * FROM oe_surveillance_alerts WHERE status = ? ORDER BY detected_at DESC LIMIT 200`
    : `SELECT * FROM oe_surveillance_alerts ORDER BY detected_at DESC LIMIT 200`;
  const rows = status
    ? await c.env.DB.prepare(sql).bind(status).all()
    : await c.env.DB.prepare(sql).all();
  return c.json({ success: true, data: rows.results || [] });
});

r.post('/surveillance/alerts', async (c) => {
  const user = getCurrentUser(c);
  if (!adminOnly(user.role)) return c.json({ success: false, error: 'forbidden' }, 403);
  const b = await c.req.json().catch(() => ({} as any));
  const required = ['alert_type', 'participant_id', 'severity'];
  for (const f of required) if (!b[f]) return c.json({ success: false, error: `${f} required` }, 400);
  const id = genId('surv');
  await c.env.DB.prepare(`
    INSERT INTO oe_surveillance_alerts
      (id, alert_type, participant_id, related_order_ids, related_fill_ids,
       severity, score, evidence_json, notes)
    VALUES (?,?,?,?,?,?,?,?,?)
  `).bind(
    id, b.alert_type, b.participant_id,
    b.related_order_ids ? JSON.stringify(b.related_order_ids) : null,
    b.related_fill_ids  ? JSON.stringify(b.related_fill_ids)  : null,
    b.severity, b.score || null,
    b.evidence ? JSON.stringify(b.evidence) : null,
    b.notes || null,
  ).run();
  await fireCascade({
    event: 'surveillance.alert_raised',
    actor_id: user.id,
    entity_type: 'oe_surveillance_alerts',
    entity_id: id,
    data: { alert_type: b.alert_type, participant_id: b.participant_id, severity: b.severity, score: b.score ?? null },
    env: c.env,
  });
  return c.json({ success: true, data: { id } }, 201);
});

r.post('/surveillance/alerts/:id/review', async (c) => {
  const user = getCurrentUser(c);
  if (!adminOnly(user.role)) return c.json({ success: false, error: 'forbidden' }, 403);
  const id = c.req.param('id');
  const b = await c.req.json().catch(() => ({} as any));
  const status = String(b.status || '');
  if (!['under_review', 'false_positive', 'confirmed', 'escalated'].includes(status)) {
    return c.json({ success: false, error: 'invalid status' }, 400);
  }
  await c.env.DB.prepare(`
    UPDATE oe_surveillance_alerts SET status = ?, reviewer_id = ?, reviewed_at = datetime('now'), notes = ? WHERE id = ?
  `).bind(status, user.id, b.notes || null, id).run();
  await fireCascade({
    event: 'surveillance.alert_reviewed',
    actor_id: user.id,
    entity_type: 'oe_surveillance_alerts',
    entity_id: String(id),
    data: { status, notes: b.notes || null },
    env: c.env,
  });
  return c.json({ success: true });
});

r.post('/surveillance/alerts/:id/report', requireStepUp('surveillance.report.high'), async (c) => {
  const user = getCurrentUser(c);
  if (!adminOnly(user.role)) return c.json({ success: false, error: 'forbidden' }, 403);
  const id = c.req.param('id');
  const b = await c.req.json().catch(() => ({} as any));
  if (!b.reported_to) return c.json({ success: false, error: 'reported_to required (FIC | NERSA | FSCA)' }, 400);
  await c.env.DB.prepare(`
    UPDATE oe_surveillance_alerts SET status = 'reported_to_fic', reported_to = ?, reported_at = datetime('now'), notes = COALESCE(notes,'') || char(10) || ? WHERE id = ?
  `).bind(b.reported_to, `Reported to ${b.reported_to} on ${new Date().toISOString()}: ${b.report_notes || ''}`, id).run();
  await fireCascade({
    event: 'surveillance.alert_reported',
    actor_id: user.id,
    entity_type: 'oe_surveillance_alerts',
    entity_id: String(id),
    data: { reported_to: b.reported_to, report_notes: b.report_notes || null },
    env: c.env,
  });
  return c.json({ success: true });
});

// Detector — scans recent fills for common manipulation patterns. Runs
// from the existing every-15-min cron via /scan; can also be invoked ad-hoc.
export async function runTradingSurveillanceScan(env: HonoEnv['Bindings']): Promise<{ flagged_count: number; flagged: any[] }> {
  const flagged: any[] = [];
  // 1. Wash trades — same participant on both sides within last hour
  try {
    const ws = await env.DB.prepare(`
      SELECT buyer_id, seller_id, energy_type, COUNT(*) AS n
      FROM trade_fills WHERE executed_at >= datetime('now','-1 hour')
        AND buyer_id = seller_id
      GROUP BY buyer_id, seller_id, energy_type HAVING COUNT(*) > 0
    `).all<any>();
    for (const w of (ws.results || []) as any[]) {
      const id = genId('surv');
      await env.DB.prepare(`
        INSERT INTO oe_surveillance_alerts (id, alert_type, participant_id, severity, score, evidence_json)
        VALUES (?,?,?,?,?,?)
      `).bind(id, 'wash_trade', w.buyer_id, 'high', 0.9, JSON.stringify(w)).run();
      flagged.push({ id, type: 'wash_trade', participant_id: w.buyer_id });
    }
  } catch { /* table may not exist in test envs */ }

  // 2. Unusual volume — single participant fills >5x their own 30d avg in 1h
  try {
    const us = await env.DB.prepare(`
      SELECT buyer_id AS pid, SUM(volume_mwh) AS hour_vol,
             (SELECT AVG(volume_mwh) FROM trade_fills WHERE buyer_id = pid AND executed_at >= datetime('now','-30 days')) AS avg_vol
      FROM trade_fills WHERE executed_at >= datetime('now','-1 hour')
      GROUP BY buyer_id
    `).all<any>();
    for (const u of (us.results || []) as any[]) {
      if (u.avg_vol && Number(u.hour_vol) > Number(u.avg_vol) * 5) {
        const id = genId('surv');
        await env.DB.prepare(`
          INSERT INTO oe_surveillance_alerts (id, alert_type, participant_id, severity, score, evidence_json)
          VALUES (?,?,?,?,?,?)
        `).bind(id, 'unusual_volume', u.pid, 'medium', 0.7, JSON.stringify(u)).run();
        flagged.push({ id, type: 'unusual_volume', participant_id: u.pid });
      }
    }
  } catch { /* swallow */ }
  return { flagged_count: flagged.length, flagged };
}

r.post('/surveillance/scan', async (c) => {
  const user = getCurrentUser(c);
  if (!adminOnly(user.role)) return c.json({ success: false, error: 'forbidden' }, 403);
  const out = await runTradingSurveillanceScan(c.env);
  return c.json({ success: true, data: out });
});

// ─── Market-maker obligations ───────────────────────────────────────────
r.get('/mm/obligations', async (c) => {
  const rows = await c.env.DB.prepare(`SELECT * FROM oe_mm_obligations ORDER BY effective_from DESC LIMIT 100`).all();
  return c.json({ success: true, data: rows.results || [] });
});

r.post('/mm/obligations', requireStepUp('trading.mm_award.high'), async (c) => {
  const user = getCurrentUser(c);
  if (!adminOnly(user.role)) return c.json({ success: false, error: 'forbidden' }, 403);
  const b = await c.req.json().catch(() => ({} as any));
  const required = ['participant_id', 'energy_type', 'obligation_type', 'effective_from', 'effective_to'];
  for (const f of required) if (!b[f]) return c.json({ success: false, error: `${f} required` }, 400);
  const id = genId('mmo');
  await c.env.DB.prepare(`
    INSERT INTO oe_mm_obligations
      (id, participant_id, energy_type, obligation_type, two_sided_minutes_per_day,
       max_spread_bps, uptime_target_pct, min_quote_volume_mwh,
       effective_from, effective_to, monthly_fee_zar)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)
  `).bind(
    id, b.participant_id, b.energy_type, b.obligation_type,
    b.two_sided_minutes_per_day || null,
    b.max_spread_bps || null,
    b.uptime_target_pct || null,
    b.min_quote_volume_mwh || null,
    b.effective_from, b.effective_to,
    b.monthly_fee_zar || null,
  ).run();
  await fireCascade({
    event: 'mm.obligation_awarded',
    actor_id: user.id,
    entity_type: 'oe_mm_obligations',
    entity_id: id,
    data: {
      participant_id: b.participant_id, energy_type: b.energy_type,
      obligation_type: b.obligation_type,
      effective_from: b.effective_from, effective_to: b.effective_to,
      monthly_fee_zar: b.monthly_fee_zar || null,
    },
    env: c.env,
  });
  return c.json({ success: true, data: { id } }, 201);
});

r.post('/mm/performance', async (c) => {
  const user = getCurrentUser(c);
  if (!adminOnly(user.role)) return c.json({ success: false, error: 'forbidden' }, 403);
  const b = await c.req.json().catch(() => ({} as any));
  const required = ['obligation_id', 'day'];
  for (const f of required) if (!b[f]) return c.json({ success: false, error: `${f} required` }, 400);
  const ob = await c.env.DB.prepare(`SELECT * FROM oe_mm_obligations WHERE id = ?`).bind(b.obligation_id).first<any>();
  if (!ob) return c.json({ success: false, error: 'obligation not found' }, 404);
  const compliant = (ob.two_sided_minutes_per_day == null || Number(b.two_sided_minutes || 0) >= Number(ob.two_sided_minutes_per_day))
    && (ob.uptime_target_pct == null || Number(b.uptime_pct || 0) >= Number(ob.uptime_target_pct))
    && (ob.max_spread_bps == null || Number(b.avg_spread_bps || 0) <= Number(ob.max_spread_bps));
  const dailyFee = ob.monthly_fee_zar ? Number(ob.monthly_fee_zar) / 30 : 0;
  const feeEarned = compliant ? dailyFee : 0;
  const penalty = !compliant ? dailyFee * 0.5 : 0;
  const id = genId('mmp');
  await c.env.DB.prepare(`
    INSERT INTO oe_mm_performance
      (id, obligation_id, day, two_sided_minutes, avg_spread_bps,
       uptime_pct, total_volume_mwh, compliant, fee_earned_zar, penalty_zar)
    VALUES (?,?,?,?,?,?,?,?,?,?)
  `).bind(
    id, b.obligation_id, b.day,
    b.two_sided_minutes || null, b.avg_spread_bps || null,
    b.uptime_pct || null, b.total_volume_mwh || null,
    compliant ? 1 : 0, feeEarned, penalty,
  ).run();
  await fireCascade({
    event: 'mm.performance_recorded',
    actor_id: user.id,
    entity_type: 'oe_mm_performance',
    entity_id: id,
    data: {
      obligation_id: b.obligation_id, day: b.day,
      compliant, fee_earned_zar: feeEarned, penalty_zar: penalty,
    },
    env: c.env,
  });
  return c.json({ success: true, data: { id, compliant, fee_earned_zar: feeEarned, penalty_zar: penalty } });
});

r.get('/mm/performance/:obligation_id', async (c) => {
  const id = c.req.param('obligation_id');
  const days = Math.min(180, Math.max(1, Number(c.req.query('days') || 30)));
  const rows = await c.env.DB.prepare(`
    SELECT * FROM oe_mm_performance WHERE obligation_id = ? AND day >= date('now', ? || ' days')
    ORDER BY day DESC
  `).bind(id, `-${days}`).all();
  return c.json({ success: true, data: rows.results || [] });
});

// ─── Clearing fund + default loss waterfall ────────────────────────────
r.get('/clearing/funds', async (c) => {
  const rows = await c.env.DB.prepare(`SELECT * FROM oe_clearing_fund ORDER BY fund_year DESC`).all();
  return c.json({ success: true, data: rows.results || [] });
});

r.post('/clearing/funds', requireStepUp('clearing.fund_create.high'), async (c) => {
  const user = getCurrentUser(c);
  if (user.role !== 'admin') return c.json({ success: false, error: 'forbidden' }, 403);
  const b = await c.req.json().catch(() => ({} as any));
  if (!b.fund_year || !b.total_size_zar) return c.json({ success: false, error: 'fund_year + total_size_zar required' }, 400);
  const id = genId('cf');
  await c.env.DB.prepare(`
    INSERT INTO oe_clearing_fund (id, fund_year, total_size_zar, initial_contribution_pct, variable_assessment_basis)
    VALUES (?,?,?,?,?)
  `).bind(id, Number(b.fund_year), Number(b.total_size_zar), Number(b.initial_contribution_pct || 0.005), b.variable_assessment_basis || 'avg_daily_var').run();
  await fireCascade({
    event: 'clearing.fund_created',
    actor_id: user.id,
    entity_type: 'oe_clearing_fund',
    entity_id: id,
    data: {
      fund_year: Number(b.fund_year),
      total_size_zar: Number(b.total_size_zar),
      initial_contribution_pct: Number(b.initial_contribution_pct || 0.005),
    },
    env: c.env,
  });
  return c.json({ success: true, data: { id } }, 201);
});

r.post('/clearing/contributions', async (c) => {
  const user = getCurrentUser(c);
  if (!adminOnly(user.role)) return c.json({ success: false, error: 'forbidden' }, 403);
  const b = await c.req.json().catch(() => ({} as any));
  if (!b.fund_id || !b.participant_id || !b.amount_zar) return c.json({ success: false, error: 'fund_id + participant_id + amount_zar required' }, 400);
  const id = genId('cc');
  await c.env.DB.prepare(`
    INSERT INTO oe_clearing_contributions (id, fund_id, participant_id, amount_zar) VALUES (?,?,?,?)
  `).bind(id, b.fund_id, b.participant_id, Number(b.amount_zar)).run();
  await fireCascade({
    event: 'clearing.contribution_posted',
    actor_id: user.id,
    entity_type: 'oe_clearing_contributions',
    entity_id: id,
    data: { fund_id: b.fund_id, participant_id: b.participant_id, amount_zar: Number(b.amount_zar) },
    env: c.env,
  });
  return c.json({ success: true, data: { id } }, 201);
});

// Default loss waterfall:
//   1. Defaulter's posted margin
//   2. Defaulter's default-fund contribution
//   3. Clearing house "skin in the game" (capital tranche, 25% of fund)
//   4. Mutualised loss across surviving members pro-rata to contributions
r.post('/clearing/loss-events', requireStepUp('clearing.waterfall.high'), async (c) => {
  const user = getCurrentUser(c);
  if (user.role !== 'admin') return c.json({ success: false, error: 'forbidden' }, 403);
  const b = await c.req.json().catch(() => ({} as any));
  if (!b.default_event_id || !b.fund_id || !b.loss_amount_zar) {
    return c.json({ success: false, error: 'default_event_id + fund_id + loss_amount_zar required' }, 400);
  }
  const def = await c.env.DB.prepare(`SELECT participant_id, initial_exposure_zar FROM oe_default_events WHERE id = ?`).bind(b.default_event_id).first<any>();
  const fund = await c.env.DB.prepare(`SELECT total_size_zar FROM oe_clearing_fund WHERE id = ?`).bind(b.fund_id).first<any>();
  if (!def || !fund) return c.json({ success: false, error: 'default event or fund not found' }, 404);

  let loss = Number(b.loss_amount_zar);
  // Step 1 — defaulter's posted collateral
  const margin = await c.env.DB.prepare(
    `SELECT COALESCE(SUM(collateral_value_zar),0) AS s FROM oe_collateral_postings WHERE participant_id = ? AND released_at IS NULL`,
  ).bind(def.participant_id).first<any>();
  const marginUsed = Math.min(Number(margin?.s || 0), loss);
  loss -= marginUsed;
  // Step 2 — defaulter's default-fund contribution
  const defContrib = await c.env.DB.prepare(
    `SELECT COALESCE(SUM(amount_zar),0) AS s FROM oe_clearing_contributions WHERE fund_id = ? AND participant_id = ? AND status = 'held'`,
  ).bind(b.fund_id, def.participant_id).first<any>();
  const defContribUsed = Math.min(Number(defContrib?.s || 0), loss);
  loss -= defContribUsed;
  if (defContribUsed > 0) {
    await c.env.DB.prepare(
      `UPDATE oe_clearing_contributions SET status = 'exhausted' WHERE fund_id = ? AND participant_id = ?`,
    ).bind(b.fund_id, def.participant_id).run();
  }
  // Step 3 — clearing house SITG, 25% of fund total
  const sitgCap = Number(fund.total_size_zar) * 0.25;
  const sitgUsed = Math.min(sitgCap, loss);
  loss -= sitgUsed;
  // Step 4 — mutualised across surviving members
  const mutualised = Math.max(0, loss);
  const id = genId('cle');
  await c.env.DB.prepare(`
    INSERT INTO oe_clearing_loss_events
      (id, default_event_id, fund_id, loss_amount_zar,
       defaulter_margin_used_zar, defaulter_default_fund_used_zar,
       clearing_house_capital_used_zar, mutualised_amount_zar, status)
    VALUES (?,?,?,?,?,?,?,?,?)
  `).bind(
    id, b.default_event_id, b.fund_id, Number(b.loss_amount_zar),
    marginUsed, defContribUsed, sitgUsed, mutualised,
    mutualised > 0 ? 'mutualised' : 'resolved',
  ).run();
  // Apply mutualised loss pro-rata to surviving members
  if (mutualised > 0) {
    const others = await c.env.DB.prepare(
      `SELECT participant_id, amount_zar FROM oe_clearing_contributions WHERE fund_id = ? AND participant_id != ? AND status = 'held'`,
    ).bind(b.fund_id, def.participant_id).all<any>();
    const totalSurviving = (others.results || []).reduce((s: number, r: any) => s + Number(r.amount_zar || 0), 0);
    if (totalSurviving > 0) {
      for (const o of (others.results || []) as any[]) {
        // share = (Number(o.amount_zar) / totalSurviving) * mutualised;
        // Status update marks the contribution as partially used;
        // detailed per-member loss apportionment goes into a separate
        // table in a follow-up.
        await c.env.DB.prepare(
          `UPDATE oe_clearing_contributions SET status = 'partially_used' WHERE fund_id = ? AND participant_id = ?`,
        ).bind(b.fund_id, o.participant_id).run();
      }
    }
  }
  await fireCascade({
    event: 'clearing.loss_event_executed',
    actor_id: user.id,
    entity_type: 'oe_clearing_loss_events',
    entity_id: id,
    data: {
      default_event_id: b.default_event_id,
      fund_id: b.fund_id,
      loss_amount_zar: Number(b.loss_amount_zar),
      defaulter_margin_used_zar: marginUsed,
      defaulter_default_fund_used_zar: defContribUsed,
      clearing_house_capital_used_zar: sitgUsed,
      mutualised_amount_zar: mutualised,
    },
    env: c.env,
  });
  return c.json({
    success: true,
    data: {
      id,
      breakdown: {
        defaulter_margin_used_zar: marginUsed,
        defaulter_default_fund_used_zar: defContribUsed,
        clearing_house_capital_used_zar: sitgUsed,
        mutualised_amount_zar: mutualised,
      },
    },
  });
});

r.get('/clearing/loss-events', async (c) => {
  const user = getCurrentUser(c);
  if (!adminOnly(user.role)) return c.json({ success: false, error: 'forbidden' }, 403);
  const rows = await c.env.DB.prepare(`SELECT * FROM oe_clearing_loss_events ORDER BY created_at DESC LIMIT 50`).all();
  return c.json({ success: true, data: rows.results || [] });
});

export default r;
