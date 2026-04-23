// Open Energy Platform — Main Entry Point
import { Hono } from 'hono';
import type { DurableObjectNamespace, ScheduledEvent, ExecutionContext } from '@cloudflare/workers-types';
import { corsMiddleware, securityHeaders, rateLimitMiddleware, requestLogger } from './middleware/security';
import { idempotency } from './middleware/idempotency';
import { optionalAuth } from './middleware/auth';
import { tenantQuotaMiddleware } from './middleware/tenant-quota';
import { AppError } from './utils/types';
import { HonoEnv } from './utils/types';

// Route imports
import authRoutes from './routes/auth';
import ssoRoutes from './routes/sso';
import cockpitRoutes from './routes/cockpit';
import participantsRoutes from './routes/participants';
import contractsRoutes from './routes/contracts';
import invoicesRoutes from './routes/invoices';
import projectsRoutes from './routes/projects';
import tradingRoutes from './routes/trading';
import settlementRoutes from './routes/settlement';
import carbonRoutes from './routes/carbon';
import esgRoutes from './routes/esg';
import esgReportsRoutes from './routes/esg-reports';
import gridRoutes from './routes/grid';
import procurementRoutes from './routes/procurement';
import dealroomRoutes from './routes/dealroom';
import modulesRoutes from './routes/modules';
import popiaRoutes from './routes/popia';
import intelligenceRoutes from './routes/intelligence';
import briefingRoutes from './routes/briefing';
import meteringRoutes from './routes/metering';
import onaRoutes from './routes/ona';
import pipelineRoutes from './routes/pipeline';
import vaultRoutes from './routes/vault';
import threadsRoutes from './routes/threads';
import marketplaceRoutes from './routes/marketplace';
import adminRoutes from './routes/admin';
import supportRoutes from './routes/support';
import aiRoutes from './routes/ai';
import loiRoutes from './routes/lois';
import offtakerRoutes from './routes/offtaker';
import funderRoutes from './routes/funder';
import regulatorRoutes from './routes/regulator';
import regulatorSuiteRoutes from './routes/regulator-suite';
import gridOperatorRoutes from './routes/grid-operator';
import traderRiskRoutes from './routes/trader-risk';
import lenderSuiteRoutes from './routes/lender-suite';
import ippLifecycleRoutes from './routes/ipp-lifecycle';
import offtakerSuiteRoutes from './routes/offtaker-suite';
import carbonRegistryRoutes from './routes/carbon-registry';
import adminPlatformRoutes from './routes/admin-platform';
import settlementAutoRoutes from './routes/settlement-automation';
import dataTierRoutes from './routes/data-tier';
import aiBriefsRoutes from './routes/ai-briefs';
import realtimeRoutes from './routes/realtime';
import reportsRoutes from './routes/reports';
import telemetryRoutes from './routes/telemetry';
import monitoringRoutes from './routes/monitoring';
import { logger } from './utils/logger';
import backupRoutes from './routes/backup';

// Durable Object exports — required for Cloudflare to resolve the
// [[durable_objects.bindings]] class_name references in wrangler.toml.
export { OrderBook } from './do/order-book';

const app = new Hono<HonoEnv>();

// Global middleware
app.use('*', securityHeaders);
app.use('*', corsMiddleware);
app.use('*', rateLimitMiddleware);
app.use('*', requestLogger);
// optionalAuth runs BEFORE idempotency so the idempotency middleware can
// scope stored keys by authenticated participant (c.get('auth')?.user),
// not fall back to 'anon' and collide across callers. optionalAuth is
// non-failing (anonymous requests still pass through) so this is safe to
// attach globally.
app.use('*', optionalAuth);
// Idempotency (no-op unless caller sends Idempotency-Key; see migration 013)
app.use('*', idempotency);
// Tenant-scoped quotas — runs after optionalAuth so we know the tenant, and
// after idempotency so replays skip the counter. No-op when no tenant rule
// is configured (falls open).
app.use('/api/*', tenantQuotaMiddleware);

// Health check
app.get('/api/health', (c) => c.json({ status: 'healthy', version: '1.0.0' }));

// Auth routes
app.route('/api/auth', authRoutes);
app.route('/api/auth/sso', ssoRoutes);
app.route('/api/cockpit', cockpitRoutes);

// Protected routes
app.route('/api/participants', participantsRoutes);
app.route('/api/contracts', contractsRoutes);
app.route('/api/invoices', invoicesRoutes);
app.route('/api/projects', projectsRoutes);
app.route('/api/trading', tradingRoutes);
app.route('/api/settlement', settlementRoutes);
app.route('/api/carbon', carbonRoutes);
app.route('/api/esg', esgRoutes);
app.route('/api/esg-reports', esgReportsRoutes);
app.route('/api/grid', gridRoutes);
app.route('/api/procurement', procurementRoutes);
app.route('/api/dealroom', dealroomRoutes);
app.route('/api/modules', modulesRoutes);
app.route('/api/popia', popiaRoutes);
app.route('/api/intelligence', intelligenceRoutes);
app.route('/api/briefing', briefingRoutes);
app.route('/api/metering', meteringRoutes);
app.route('/api/ona', onaRoutes);
app.route('/api/pipeline', pipelineRoutes);
app.route('/api/vault', vaultRoutes);
app.route('/api/threads', threadsRoutes);
app.route('/api/marketplace', marketplaceRoutes);
app.route('/api/admin', adminRoutes);
app.route('/api/support', supportRoutes);
app.route('/api/ai', aiRoutes);
app.route('/api/lois', loiRoutes);
app.route('/api/offtaker', offtakerRoutes);
app.route('/api/funder', funderRoutes);
app.route('/api/regulator', regulatorRoutes);
app.route('/api/regulator', regulatorSuiteRoutes);
app.route('/api/grid-operator', gridOperatorRoutes);
app.route('/api/trader-risk', traderRiskRoutes);
app.route('/api/lender', lenderSuiteRoutes);
app.route('/api/ipp', ippLifecycleRoutes);
app.route('/api/offtaker-suite', offtakerSuiteRoutes);
app.route('/api/carbon-registry', carbonRegistryRoutes);
app.route('/api/admin-platform', adminPlatformRoutes);
app.route('/api/settlement-auto', settlementAutoRoutes);
app.route('/api/data-tier', dataTierRoutes);
app.route('/api/ai-briefs', aiBriefsRoutes);
app.route('/api/realtime', realtimeRoutes);
app.route('/api/reports', reportsRoutes);
app.route('/api/telemetry', telemetryRoutes);
app.route('/api/admin/monitoring', monitoringRoutes);
// Backup routes are deliberately mounted outside /api/admin to avoid being
// shadowed by the admin sub-app's global authMiddleware — Hono flattens
// sub-app middleware onto the shared router, so /api/admin/* middleware
// would fire before the backup-specific X-Backup-Token guard ever runs,
// which would break the unattended GitHub Actions cron job.
app.route('/api/backup', backupRoutes);

// Static assets (SPA shell, JS, CSS, images) are served by Cloudflare Pages directly.
// This Worker / Pages Function only handles API routes under /api/*.

// Error handling — emit a structured log + persist to error_log so the
// /admin/monitoring console can surface the crash to operators. Response
// includes req_id so users / support can correlate back to the log line.
app.onError((err, c) => {
  const reqId = (c.get('requestId') as string | undefined) ||
    `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  const auth = c.get('auth') as { user?: { id?: string }; tenant_id?: string } | undefined;

  // AppError carries an intended statusCode — surface it instead of a
  // blanket 500. Auth failures stay 401, forbidden stays 403, validation
  // stays 400, etc. Only genuine unhandled errors (plain Error) collapse
  // to 500. We still write to error_log for ALL non-2xx for observability.
  const appErr = err instanceof AppError ? err : null;
  const status = appErr?.statusCode ?? 500;
  const outgoingBody: Record<string, unknown> = appErr
    ? { error: appErr.code, message: appErr.message, req_id: reqId }
    : { error: 'Internal Server Error', message: err.message, req_id: reqId };

  // Only log unexpected errors at error-level; log AppError at warn-level
  // so the alerting pipeline doesn't page operators for a user typo.
  const severity = appErr && status < 500 ? 'warn' : 'error';
  if (severity === 'error') {
    logger.error('unhandled_error', {
      req_id: reqId,
      route: c.req.path,
      method: c.req.method,
      participant_id: auth?.user?.id,
      tenant_id: auth?.tenant_id,
      error_name: (err as Error).name,
      error_message: err.message,
      error_stack: (err as Error).stack,
    });
  } else {
    logger.warn('handled_error', {
      req_id: reqId,
      route: c.req.path,
      method: c.req.method,
      status,
      code: appErr!.code,
      participant_id: auth?.user?.id,
    });
  }

  // Best-effort DB write only for 5xx — never mask the original error and
  // don't flood error_log with expected 401/403/404 from bots.
  if (status >= 500) try {
    const id = `errlog_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    const write = c.env.DB.prepare(
      `INSERT INTO error_log
         (id, req_id, source, severity, route, method, status,
          participant_id, tenant_id, error_name, error_message,
          error_stack, user_agent, ip, url)
       VALUES (?, ?, 'server', 'error', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        id,
        reqId,
        c.req.path,
        c.req.method,
        status,
        auth?.user?.id || null,
        auth?.tenant_id || null,
        (err as Error).name || null,
        (err.message || '').slice(0, 2000),
        ((err as Error).stack || '').slice(0, 8000),
        (c.req.header('User-Agent') || '').slice(0, 500) || null,
        c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For') || null,
        c.req.url.slice(0, 1000),
      )
      .run();
    c.executionCtx?.waitUntil?.(Promise.resolve(write).catch(() => {}));
  } catch {
    /* swallow — never fail the error handler */
  }

  return c.json(outgoingBody, status as 401 | 403 | 404 | 409 | 400 | 500);
});

app.notFound((c) => {
  return c.text('Not Found', 404);
});

// ═══════════════════════════════════════════════════════════════════════════
// Scheduled handler — dispatched by Cloudflare Cron Triggers (wrangler.toml).
// Each cron fires a small maintenance job using the same D1/KV/R2 bindings.
// Errors are swallowed per-job so one failing job doesn't block the others.
// ═══════════════════════════════════════════════════════════════════════════

import { runSurveillanceScan } from './routes/regulator-suite';
import { executeSettlementRun } from './routes/settlement-automation';

async function safe<T>(label: string, fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch (err) {
    logger.error('cron_job_failed', {
      label,
      error_name: (err as Error).name,
      error_message: (err as Error).message,
    });
    return null;
  }
}

async function runCron(env: HonoEnv['Bindings'], pattern: string): Promise<void> {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const month = now.toISOString().slice(0, 7);

  switch (pattern) {
    case '*/15 * * * *':
      await safe('surveillance_scan', () => runSurveillanceScan(env));
      // Order-book depth snapshot — hit every shard that had a fill in the last hour.
      await safe('depth_snapshot', async () => {
        const shards = await env.DB.prepare(
          `SELECT DISTINCT shard_key FROM trade_fills WHERE executed_at >= datetime('now','-1 hour')`,
        ).all<{ shard_key: string }>();
        for (const s of shards.results || []) {
          const doNs = (env as unknown as { ORDER_BOOK?: DurableObjectNamespace }).ORDER_BOOK;
          if (!doNs) break;
          const id = doNs.idFromName(s.shard_key);
          await doNs.get(id).fetch('https://order-book/snapshot', { method: 'POST' });
        }
      });
      break;

    case '0 * * * *':
      await safe('mark_price_vwap', async () => {
        // Trigger the same logic as POST /api/trader-risk/mark-prices/vwap-run.
        const types = await env.DB.prepare(
          `SELECT DISTINCT b.energy_type AS et, b.delivery_date AS dd
             FROM trade_fills f JOIN trade_orders b ON b.id = f.order_id
            WHERE f.executed_at LIKE ? || '%'`,
        ).bind(today).all<{ et: string; dd: string | null }>();
        for (const t of types.results || []) {
          const stat = await env.DB.prepare(
            `SELECT SUM(f.volume_mwh * f.price) AS gross, SUM(f.volume_mwh) AS vol
               FROM trade_fills f JOIN trade_orders b ON b.id = f.order_id
              WHERE b.energy_type = ? AND (b.delivery_date = ? OR (b.delivery_date IS NULL AND ? IS NULL))
                AND f.executed_at LIKE ? || '%'`,
          ).bind(t.et, t.dd, t.dd, today).first<{ gross: number; vol: number }>();
          if (!stat?.vol) continue;
          const vwap = stat.gross / stat.vol;
          await env.DB.prepare(
            `INSERT OR REPLACE INTO mark_prices (id, energy_type, delivery_date, mark_date, mark_price_zar_mwh, source)
             VALUES (?, ?, ?, ?, ?, 'vwap')`,
          ).bind(
            `mp_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
            t.et, t.dd, today, vwap,
          ).run();
        }
      });
      break;

    case '5 0 * * *':
      // Metering + ONA rollups for yesterday; prepare audit archive table
      // (actual archive upload runs on demand to stay under CPU limits).
      await safe('metering_daily_rollup', async () => {
        const rs = await env.DB.prepare(
          `SELECT connection_id,
                  SUM(export_kwh) AS exp_kwh,
                  SUM(import_kwh) AS imp_kwh,
                  MAX(peak_demand_kw) AS pk,
                  AVG(power_factor) AS pf,
                  COUNT(*) AS n,
                  SUM(CASE WHEN validated = 1 THEN 1 ELSE 0 END) AS v
             FROM metering_readings
            WHERE reading_date LIKE ? || '%'
            GROUP BY connection_id`,
        ).bind(yesterday).all<{
          connection_id: string; exp_kwh: number; imp_kwh: number;
          pk: number | null; pf: number | null; n: number; v: number;
        }>();
        for (const r of rs.results || []) {
          const id = `mrd_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
          await env.DB.prepare(
            `INSERT INTO metering_readings_daily
               (id, connection_id, reading_day, month_bucket, total_export_kwh, total_import_kwh,
                max_peak_demand_kw, avg_power_factor, reading_count, validated_count, last_updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
             ON CONFLICT(connection_id, reading_day) DO UPDATE SET
               total_export_kwh = excluded.total_export_kwh,
               total_import_kwh = excluded.total_import_kwh,
               max_peak_demand_kw = excluded.max_peak_demand_kw,
               avg_power_factor = excluded.avg_power_factor,
               reading_count = excluded.reading_count,
               validated_count = excluded.validated_count,
               last_updated_at = datetime('now')`,
          ).bind(
            id, r.connection_id, yesterday, yesterday.slice(0, 7),
            r.exp_kwh, r.imp_kwh, r.pk, r.pf, r.n, r.v,
          ).run();
        }
      });

      await safe('ona_daily_rollup', async () => {
        const rs = await env.DB.prepare(
          `SELECT site_id,
                  MAX(CASE WHEN forecast_type = 'day_ahead' THEN generation_mwh END) AS da,
                  MAX(CASE WHEN forecast_type = 'intra_day' THEN generation_mwh END) AS id,
                  MAX(CASE WHEN forecast_type = 'weekly'    THEN generation_mwh END) AS wk
             FROM ona_forecasts
            WHERE forecast_date = ?
            GROUP BY site_id`,
        ).bind(yesterday).all<{ site_id: string; da: number | null; id: number | null; wk: number | null }>();
        for (const r of rs.results || []) {
          const actual = (await env.DB.prepare(
            `SELECT COALESCE(SUM(actual_mwh), 0) AS v FROM ona_nominations
              WHERE site_id = ? AND nomination_date = ?`,
          ).bind(r.site_id, yesterday).first<{ v: number }>())?.v || 0;
          const variance = r.da ? ((actual - r.da) / r.da) * 100 : null;
          await env.DB.prepare(
            `INSERT INTO ona_forecast_summary
               (id, site_id, forecast_day, day_ahead_mwh, intra_day_mwh, weekly_mwh, actual_mwh, variance_pct, last_updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
             ON CONFLICT(site_id, forecast_day) DO UPDATE SET
               day_ahead_mwh = excluded.day_ahead_mwh,
               intra_day_mwh = excluded.intra_day_mwh,
               weekly_mwh = excluded.weekly_mwh,
               actual_mwh = excluded.actual_mwh,
               variance_pct = excluded.variance_pct,
               last_updated_at = datetime('now')`,
          ).bind(
            `ofs_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
            r.site_id, yesterday, r.da, r.id, r.wk, actual, variance,
          ).run();
        }
      });
      break;

    case '10 0 * * *':
      await safe('daily_settlement', async () => {
        const runId = `sr_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
        const idempotencyKey = `ppa_energy:${yesterday}:${yesterday}`;
        const existing = await env.DB.prepare(
          `SELECT id FROM settlement_runs WHERE idempotency_key = ?`,
        ).bind(idempotencyKey).first();
        if (existing) return;
        await env.DB.prepare(
          `INSERT INTO settlement_runs (id, run_type, period_start, period_end, status, idempotency_key)
           VALUES (?, 'ppa_energy', ?, ?, 'running', ?)`,
        ).bind(runId, yesterday, yesterday, idempotencyKey).run();
        await executeSettlementRun(env, runId, 'ppa_energy', yesterday, yesterday);
      });
      break;

    case '30 0 * * *':
      await safe('usage_snapshot', async () => {
        const rs = await env.DB.prepare(
          `SELECT t.id AS tid,
                  COUNT(p.id) AS n,
                  SUM(CASE WHEN p.status = 'active' THEN 1 ELSE 0 END) AS a
             FROM tenants t
             LEFT JOIN participants p ON p.tenant_id = t.id
            GROUP BY t.id`,
        ).all<{ tid: string; n: number; a: number }>();
        for (const r of rs.results || []) {
          await env.DB.prepare(
            `INSERT OR REPLACE INTO tenant_usage_snapshots
               (id, tenant_id, snapshot_date, participant_count, active_participant_count, seat_count, api_calls_count, storage_bytes)
             VALUES (?, ?, ?, ?, ?, ?, 0, 0)`,
          ).bind(
            `tus_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
            r.tid, today, r.n, r.a, r.a,
          ).run();
        }
      });

      await safe('margin_call_run', async () => {
        const rs = await env.DB.prepare(
          `SELECT p.id AS pid,
                  COALESCE(SUM(o.remaining_volume_mwh * COALESCE(m.mark_price_zar_mwh, o.price, 0)), 0) AS exposure
             FROM participants p
             LEFT JOIN trade_orders o ON o.participant_id = p.id AND o.status IN ('open','partially_filled')
             LEFT JOIN mark_prices m
               ON m.energy_type = o.energy_type
              AND (m.delivery_date = o.delivery_date OR (m.delivery_date IS NULL AND o.delivery_date IS NULL))
            GROUP BY p.id`,
        ).all<{ pid: string; exposure: number }>();
        for (const row of rs.results || []) {
          if (row.exposure <= 0) continue;
          const im = Math.abs(row.exposure) * 0.10;
          const posted = (await env.DB.prepare(
            `SELECT COALESCE(SUM(balance_zar), 0) AS b FROM collateral_accounts WHERE participant_id = ? AND status = 'active'`,
          ).bind(row.pid).first<{ b: number }>())?.b || 0;
          const shortfall = Math.max(0, im - posted);
          if (shortfall <= 0) continue;
          const dueBy = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
          await env.DB.prepare(
            `INSERT INTO margin_calls (id, participant_id, as_of, exposure_zar, initial_margin_zar, variation_margin_zar, posted_collateral_zar, shortfall_zar, due_by, status)
             VALUES (?, ?, datetime('now'), ?, ?, 0, ?, ?, ?, 'issued')`,
          ).bind(
            `mc_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
            row.pid, row.exposure, im, posted, shortfall, dueBy,
          ).run();
        }
      });
      break;

    case '0 2 1 * *':
      await safe('platform_invoice_run', async () => {
        const periodStart = month + '-01';
        const periodEnd = today;
        const subs = await env.DB.prepare(
          `SELECT s.id AS sid, s.tenant_id, s.amount_zar
             FROM tenant_subscriptions s
            WHERE s.status IN ('active','trialing')
              AND s.period_start <= ? AND s.period_end >= ?`,
        ).bind(periodEnd, periodStart).all<{ sid: string; tenant_id: string; amount_zar: number }>();
        for (const s of subs.results || []) {
          if (s.amount_zar <= 0) continue;
          const vat = s.amount_zar * 0.15;
          const total = s.amount_zar + vat;
          const id = `tinv_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
          const invNum = `OE-${now.getFullYear()}-${id.slice(-8).toUpperCase()}`;
          await env.DB.prepare(
            `INSERT INTO tenant_invoices
               (id, tenant_id, subscription_id, invoice_number, period_start, period_end,
                line_items_json, subtotal_zar, vat_rate, vat_zar, total_zar, status, issued_at, due_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0.15, ?, ?, 'issued', datetime('now'), date('now','+30 days'))`,
          ).bind(
            id, s.tenant_id, s.sid, invNum, periodStart, periodEnd,
            JSON.stringify([{ description: 'Platform subscription', amount_zar: s.amount_zar }]),
            s.amount_zar, vat, total,
          ).run();
        }
      });
      break;

    default:
      // Unknown cron pattern — log so operators notice wrangler.toml drift.
      logger.warn('cron_unknown_pattern', { pattern });
  }
}

export default {
  fetch: app.fetch,
  async scheduled(event: ScheduledEvent, env: HonoEnv['Bindings'], ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(runCron(env, event.cron));
  },
};
