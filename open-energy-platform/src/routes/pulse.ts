// ═══════════════════════════════════════════════════════════════════════════
// Pulse Route — live platform heartbeat fed by real generation telemetry.
//
// The Horizon header strip needs something that visibly MOVES every minute so
// the board never looks static. Event/cascade tables are demo-only — the live
// cec system has rich om_telemetry but no role_actions/cascade_events — so this
// is deliberately TELEMETRY-fed, not event-fed: it has real data on both envs.
//
// Role-agnostic: every role sees the same national generation heartbeat. The
// numbers are real metered kWh over the trailing window; nothing is fabricated.
// ═══════════════════════════════════════════════════════════════════════════

import { Hono } from 'hono';
import { authMiddleware } from '../middleware/auth';
import type { HonoEnv } from '../utils/types';

const pulse = new Hono<HonoEnv>();
pulse.use('*', authMiddleware);

// GET /pulse — trailing-7d generation heartbeat across all reporting sites.
// 7d not 24h: real telemetry lands in daily Solax batches, so a 24h window can be
// near-empty between pulls; 7 days always carries a substantial, real total.
// ponytail: no server cache; SPA polls ~20s so this is 1 cheap query per viewer.
pulse.get('/', async (c) => {
  const row = await c.env.DB.prepare(`
    SELECT
      (SELECT COALESCE(SUM(interval_kwh), 0) FROM om_telemetry
         WHERE julianday('now') - julianday(ts) <= 7) AS kwh_7d,
      (SELECT COUNT(DISTINCT site_id) FROM om_telemetry
         WHERE julianday('now') - julianday(ts) <= 7) AS sites_reporting,
      (SELECT MAX(ts) FROM om_telemetry) AS latest_ts,
      (SELECT interval_kwh FROM om_telemetry ORDER BY ts DESC LIMIT 1) AS latest_kwh
  `).first<Record<string, number | string>>();

  const top = await c.env.DB.prepare(`
    SELECT s.name AS site, COALESCE(SUM(t.interval_kwh), 0) AS kwh
    FROM om_telemetry t JOIN om_sites s ON s.id = t.site_id
    WHERE julianday('now') - julianday(t.ts) <= 7
    GROUP BY t.site_id ORDER BY kwh DESC LIMIT 1
  `).first<{ site: string; kwh: number }>();

  const r = row || {};
  const kwh = Number(r.kwh_7d) || 0;
  return c.json({
    success: true,
    data: {
      mwh_7d: Math.round((kwh / 1000) * 10) / 10,
      co2_avoided_t: Math.round(kwh / 1000 * 0.94), // SA grid factor ≈ 0.94 tCO2e/MWh
      sites_reporting: Number(r.sites_reporting) || 0,
      latest_ts: r.latest_ts || null,
      latest_kwh: Number(r.latest_kwh) || 0,
      top_site: top?.site || null,
      top_site_mwh: top ? Math.round((Number(top.kwh) / 1000) * 10) / 10 : 0,
    },
  });
});

export default pulse;
