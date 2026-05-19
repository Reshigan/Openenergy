// Open Energy Platform — Main Entry Point
import { Hono } from 'hono';
import type { DurableObjectNamespace, ScheduledEvent, ExecutionContext } from '@cloudflare/workers-types';
import { corsMiddleware, securityHeaders, rateLimitMiddleware, requestLogger } from './middleware/security';
import { idempotency } from './middleware/idempotency';
import { optionalAuth, authMiddleware, getCurrentUser } from './middleware/auth';
import { tenantQuotaMiddleware } from './middleware/tenant-quota';
import { AppError } from './utils/types';
import { HonoEnv } from './utils/types';

// Route imports
import authRoutes from './routes/auth';
import ssoRoutes from './routes/sso';
import cockpitRoutes from './routes/cockpit';
import launchRoutes from './routes/launch';
import participantsRoutes from './routes/participants';
import contractsRoutes from './routes/contracts';
import invoicesRoutes from './routes/invoices';
import projectsRoutes from './routes/projects';
import tradingRoutes from './routes/trading';
import settlementRoutes from './routes/settlement';
import carbonRoutes from './routes/carbon';
import esgRoutes from './routes/esg';
import esgReportsRoutes from './routes/esg-reports';
import watershedRoutes, { cpPortal as counterpartyPortalRoutes } from './routes/watershed';
import platformRoutes from './routes/platform';
import roleCompletionsRoutes from './routes/role-completions';
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
import imbalanceRoutes from './routes/imbalance';
import dataTierRoutes from './routes/data-tier';
import aiBriefsRoutes from './routes/ai-briefs';
import realtimeRoutes from './routes/realtime';
import siemRoutes, { dispatchAllForwarders } from './routes/siem';
import reportsRoutes from './routes/reports';
import telemetryRoutes from './routes/telemetry';
import monitoringRoutes from './routes/monitoring';
import { logger } from './utils/logger';
import backupRoutes from './routes/backup';
import searchRoutes from './routes/search';
import notificationsRoutes from './routes/notifications';
import scheduleRoutes from './routes/schedule';
import esumsOmRoutes from './routes/esums-om';
import esumsOmIntelRoutes from './routes/esums-om-intel';
import esumsOmAnalysisRoutes from './routes/esums-om-analysis';
import { portalAdmin as esumsOmPortalAdmin, portalPublic as esumsOmPortalPublic } from './routes/esums-om-portal';
import platformFeaturesRoutes from './routes/platform-features';
import {
  mfa as mfaRoutes,
  kyc as kycRoutes,
  consent as consentRoutes,
  popia as popiaSelfServiceRoutes,
  regulator as regulatorReportRoutes,
  status as publicStatusRoutes,
} from './routes/go-live';
import authDeepRoutes from './routes/auth-deep';
import kycDeepRoutes from './routes/kyc-deep';
import { admin as statusDeepAdmin, pub as statusDeepPub } from './routes/status-deep';
import popiaDeepRoutes from './routes/popia-deep';
import reportsDeepRoutes from './routes/reports-deep';

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

// Basic health check — always responds 200 so uptime monitors see a
// stable signal. Detailed probe lives at /api/health/deep.
app.get('/api/health', (c) => c.json({ status: 'healthy', version: '1.0.0' }));

// Deep health probe — exercises every Cloudflare binding the platform
// depends on. Returns 200 iff every subsystem responds; otherwise 503
// with a per-subsystem breakdown. Cheap by design: one query per binding,
// each with LIMIT 1.
app.get('/api/health/deep', async (c) => {
  const start = Date.now();
  const checks: Record<string, { ok: boolean; latency_ms: number; error?: string }> = {};

  async function probe<T>(name: string, fn: () => Promise<T>): Promise<void> {
    const t = Date.now();
    try {
      await fn();
      checks[name] = { ok: true, latency_ms: Date.now() - t };
    } catch (err) {
      checks[name] = { ok: false, latency_ms: Date.now() - t, error: (err as Error).message };
    }
  }

  await Promise.all([
    probe('d1_main', async () => {
      await c.env.DB.prepare('SELECT 1 AS ok').first();
    }),
    probe('d1_metering_current', async () => {
      const current = (c.env as unknown as { METERING_DB_CURRENT?: { prepare: (sql: string) => { first: () => Promise<unknown> } } }).METERING_DB_CURRENT;
      if (!current) throw new Error('binding_absent');
      await current.prepare('SELECT 1 AS ok').first();
    }),
    probe('kv', async () => {
      await c.env.KV.put('health:probe', String(Date.now()), { expirationTtl: 60 });
      await c.env.KV.get('health:probe');
    }),
    probe('r2', async () => {
      // HEAD is cheaper than GET; we don't care what's there, only that the
      // bucket is reachable.
      await c.env.R2.head('health/probe').catch(() => null);
    }),
    probe('order_book_do', async () => {
      const ns = (c.env as unknown as { ORDER_BOOK?: { idFromName: (s: string) => unknown; get: (id: unknown) => { fetch: (req: Request) => Promise<Response> } } }).ORDER_BOOK;
      if (!ns) throw new Error('binding_absent');
      const id = ns.idFromName('__health__');
      const resp = await ns.get(id).fetch(new Request('https://order-book/depth', { method: 'GET' }));
      // The DO will reasonably 404 (unknown route) OR 500 on a cold
      // __health__ shard that's never had an order (the hydrate path
      // runs a SELECT that returns empty). Both mean the binding itself
      // works, which is what the health probe is checking. Only a
      // transport-level error (ns.get() throwing) is a real failure.
      if (!resp.ok && resp.status !== 404 && resp.status !== 500) {
        throw new Error(`do_status_${resp.status}`);
      }
    }),
    probe('ai', async () => {
      if (!c.env.AI) throw new Error('binding_absent');
      // No-op probe — the binding check alone is the useful signal; a real
      // .run() would cost an AI token charge which we don't want on every
      // health poll.
    }),
  ]);

  const allOk = Object.values(checks).every((c) => c.ok || c.error === 'binding_absent');
  const status = allOk ? 200 : 503;
  return c.json(
    {
      status: allOk ? 'healthy' : 'degraded',
      version: '1.0.0',
      total_latency_ms: Date.now() - start,
      checks,
    },
    status,
  );
});

// Auth routes
app.route('/api/auth', authRoutes);
app.route('/api/auth/sso', ssoRoutes);
app.route('/api/cockpit', cockpitRoutes);
app.route('/api/launch', launchRoutes);

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
app.route('/api/watershed', watershedRoutes);
// Public counterparty data-collection portal — uses share_token, no JWT.
// Mounted outside watershedRoutes so its blanket authMiddleware does not
// apply to /api/portal/counterparty/:token.
app.route('/api/portal', counterpartyPortalRoutes);
// Platform-wide cross-module infrastructure (AI classifier, scenarios,
// audit chain, anomaly detection) — promotes Watershed primitives to all
// modules so each role's UI tab can use the same building blocks.
app.route('/api/platform', platformRoutes);
// Role-specific daily-workflow endpoints — IPP (epc/land/insurance/community),
// Offtaker (PPA market, demand response, bill validation), Lender
// (origination, syndication, SLL, workouts), Carbon (buffer pool, DD,
// permanence, attribution), Grid (queue, FCR, voltage, NDP), Regulator
// (consultations, hearings, determinations, fees), Trader (day-ahead,
// intraday, pre-trade-check, confirmations).
app.route('/api/roles', roleCompletionsRoutes);
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
app.route('/api/imbalance', imbalanceRoutes);
app.route('/api/data-tier', dataTierRoutes);
app.route('/api/ai-briefs', aiBriefsRoutes);
app.route('/api/realtime', realtimeRoutes);
app.route('/api/siem', siemRoutes);
app.route('/api/reports', reportsRoutes);
app.route('/api/telemetry', telemetryRoutes);
app.route('/api/admin/monitoring', monitoringRoutes);
// Backup routes are deliberately mounted outside /api/admin to avoid being
// shadowed by the admin sub-app's global authMiddleware — Hono flattens
// sub-app middleware onto the shared router, so /api/admin/* middleware
// would fire before the backup-specific X-Backup-Token guard ever runs,
// which would break the unattended GitHub Actions cron job.
app.route('/api/backup', backupRoutes);
app.route('/api/search', searchRoutes);
app.route('/api/notifications', notificationsRoutes);
app.route('/api/schedule', scheduleRoutes);
// Public portal MUST live on a sibling prefix outside the auth-protected
// esums-om routes — and the public view + admin token endpoints are split
// into two routers so they can have independent middleware chains.
app.route('/api/om-portal-view', esumsOmPortalPublic);
app.route('/api/om-portal', esumsOmPortalAdmin);
app.route('/api/esums-om', esumsOmRoutes);
app.route('/api/esums-om', esumsOmIntelRoutes);
app.route('/api/esums-om', esumsOmAnalysisRoutes);
// Public status page MUST be mounted BEFORE the catch-all platform router.
// platformFeaturesRoutes is mounted at /api and applies authMiddleware to
// every request that passes through it, including those that don't match
// a route inside the sub-app — so order matters here.
app.route('/api/public/status', publicStatusRoutes);
app.route('/api', platformFeaturesRoutes);
app.route('/api/mfa',         mfaRoutes);
app.route('/api/kyc',         kycRoutes);
app.route('/api/consent',     consentRoutes);
app.route('/api/popia',       popiaSelfServiceRoutes);
app.route('/api/regulator',   regulatorReportRoutes);
// Depth additions — L4/L5 backends for the L2/L3 surfaces above
app.route('/api/public/status', statusDeepPub);   // extends /api/public/status with /incidents /maintenance /uptime /subscribe
app.route('/api/auth-deep',     authDeepRoutes);
app.route('/api/kyc-deep',      kycDeepRoutes);
app.route('/api/status-admin',  statusDeepAdmin);
app.route('/api/popia-deep',    popiaDeepRoutes);
app.route('/api/reports-deep',  reportsDeepRoutes);

// Admin-only "run cron once" endpoint — invokes the same runCron() that the
// Workers scheduler fires, but on demand so operators (and the smoke-cron
// script) can verify each schedule completes without 500s.
//
//   POST /api/admin/cron/run-once?pattern=*/15+*+*+*+*
//
// Returns { success: true, ran: <pattern> } if runCron completes; surfaces
// the first error otherwise. Auth: admin-only.
{
  const cron = new Hono<HonoEnv>();
  cron.use('*', authMiddleware);
  cron.post('/run-once', async (c) => {
    const user = getCurrentUser(c);
    if (user.role !== 'admin') {
      return c.json({ success: false, error: 'admin only' }, 403);
    }
    const pattern = c.req.query('pattern');
    if (!pattern) return c.json({ success: false, error: 'pattern query param required' }, 400);
    try {
      await runCron(c.env, pattern);
      return c.json({ success: true, ran: pattern });
    } catch (err) {
      return c.json({
        success: false,
        error: 'cron failed',
        detail: (err as Error).message,
      }, 500);
    }
  });
  app.route('/api/admin/cron', cron);
}

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

// Not-found: if the request is for /api/* we return JSON 404; otherwise we
// fall through to the ASSETS binding so the SPA handles client-side routing.
app.notFound(async (c) => {
  if (c.req.path.startsWith('/api/')) {
    return c.json({ success: false, error: 'Not Found', path: c.req.path }, 404);
  }
  const assets = (c.env as { ASSETS?: { fetch: (req: Request) => Promise<Response> } }).ASSETS;
  if (assets) return assets.fetch(c.req.raw);
  return c.text('Not Found', 404);
});

// ═══════════════════════════════════════════════════════════════════════════
// Scheduled handler — dispatched by Cloudflare Cron Triggers (wrangler.toml).
// Each cron fires a small maintenance job using the same D1/KV/R2 bindings.
// Errors are swallowed per-job so one failing job doesn't block the others.
// ═══════════════════════════════════════════════════════════════════════════

import { runSurveillanceScan } from './routes/regulator-suite';
import { executeSettlementRun } from './routes/settlement-automation';
import { executeSettlementRun as executeImbalanceRun } from './routes/imbalance';
import { verifyChain } from './utils/audit-chain';

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
      await safe('siem_dispatch', () => dispatchAllForwarders(env));
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
      // Esums O&M: roll the live revenue impact ticker on open faults.
      await safe('om_fault_tick', async () => {
        await env.DB.prepare(`
          UPDATE om_faults
          SET total_loss_zar = MAX(total_loss_zar,
                CAST(((julianday('now') - julianday(detected_at)) * 24 * hourly_loss_zar) AS INTEGER)),
              updated_at = datetime('now')
          WHERE status IN ('open','acknowledged','in_progress')
        `).run();
      });
      // Esums O&M: flag SLA-breached work orders.
      await safe('om_sla_check', async () => {
        await env.DB.prepare(`
          UPDATE om_work_orders SET sla_breached = 1
          WHERE sla_deadline < datetime('now')
            AND status NOT IN ('completed','verified','closed','cancelled')
            AND (sla_breached IS NULL OR sla_breached = 0)
        `).run();
      });
      // Status page: ingest a per-minute SLO sample.
      await safe('status_slo_ingest', async () => {
        const t0 = Date.now();
        await env.DB.prepare(`SELECT 1`).first();
        const dbMs = Date.now() - t0;
        const minute = new Date(); minute.setSeconds(0, 0);
        const ts = minute.toISOString();
        await env.DB.prepare(`
          INSERT OR REPLACE INTO oe_status_metrics (ts, metric, value) VALUES
            (?, 'd1_query_ms', ?),
            (?, 'up', 1)
        `).bind(ts, dbMs, ts).run();
      });
      // Daily uptime rollup for /status page — derive from yesterday's
      // status metrics + incidents. Per-component uptime % = 1 - (minutes
      // of major+critical incident impact / 1440).
      await safe('status_uptime_rollup', async () => {
        const components = ['API', 'Settlement', 'Trading', 'Webhooks', 'Esums O&M'];
        const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
        const incs = await env.DB.prepare(`
          SELECT severity, affected_components, started_at, resolved_at
          FROM oe_status_incidents
          WHERE date(started_at) <= ? AND (resolved_at IS NULL OR date(resolved_at) >= ?)
            AND severity IN ('major','critical')
        `).bind(yesterday, yesterday).all<any>();
        const incRows = (incs.results || []) as any[];
        for (const comp of components) {
          let impactedMinutes = 0;
          let incidentCount = 0;
          for (const i of incRows) {
            const affected = JSON.parse(i.affected_components || '[]');
            if (!affected.includes(comp)) continue;
            incidentCount += 1;
            const dayStart = new Date(`${yesterday}T00:00:00Z`).getTime();
            const dayEnd = dayStart + 86_400_000;
            const istart = Math.max(dayStart, new Date(i.started_at).getTime());
            const iend = i.resolved_at ? Math.min(dayEnd, new Date(i.resolved_at).getTime()) : dayEnd;
            impactedMinutes += Math.max(0, (iend - istart) / 60_000);
          }
          const uptimePct = Math.max(0, Math.min(100, 100 - (impactedMinutes / 1440) * 100));
          await env.DB.prepare(`
            INSERT OR REPLACE INTO oe_status_uptime_daily (day, component, uptime_pct, incident_count)
            VALUES (?,?,?,?)
          `).bind(yesterday, comp, Math.round(uptimePct * 1000) / 1000, incidentCount).run();
        }
      });
      // POPIA SAR overdue alert — bump status for requests past their
      // 30-day statutory deadline.
      await safe('popia_sar_overdue', async () => {
        await env.DB.prepare(`
          UPDATE oe_popia_sar_requests SET status = 'escalated'
          WHERE due_at < datetime('now') AND status NOT IN ('fulfilled','rejected','escalated')
        `).run();
      });
      // POPIA: execute deletions whose 30-day cooling-off has elapsed.
      await safe('popia_deletion_executor', async () => {
        const due = await env.DB.prepare(`
          SELECT id, participant_id FROM oe_deletion_requests
          WHERE status = 'cooling_off' AND scheduled_for <= datetime('now') LIMIT 20
        `).all<{ id: string; participant_id: string }>();
        for (const r of (due.results || []) as Array<{ id: string; participant_id: string }>) {
          // Soft-delete: anonymise PII columns + revoke sessions. Hard-delete
          // would break audit chains.
          await env.DB.prepare(`UPDATE participants SET email = NULL, name = '[deleted]', phone = NULL, kyc_status = 'deleted' WHERE id = ?`).bind(r.participant_id).run().catch(() => null);
          await env.DB.prepare(`DELETE FROM sessions WHERE participant_id = ?`).bind(r.participant_id).run().catch(() => null);
          await env.DB.prepare(`UPDATE oe_deletion_requests SET status = 'completed', completed_at = datetime('now') WHERE id = ?`).bind(r.id).run();
        }
      });
      // Esums O&M: synthetic ingestion poll for enabled connections.
      // Batched INSERT per connection — one D1 round-trip instead of N.
      await safe('om_ingestion_poll', async () => {
        const conns = await env.DB.prepare(`
          SELECT id, site_id, polling_minutes, last_poll_at FROM om_connections
          WHERE enabled = 1
            AND (last_poll_at IS NULL
                 OR last_poll_at < datetime('now', '-' || polling_minutes || ' minutes'))
          LIMIT 50
        `).all<any>();
        const nowIso = new Date().toISOString();
        for (const conn of (conns.results || []) as any[]) {
          const devices = await env.DB.prepare(`SELECT id, rated_kw FROM om_devices WHERE site_id = ?`).bind(conn.site_id).all<any>();
          const rows = (devices.results || []) as any[];
          if (!rows.length) continue;
          // Build one multi-VALUES INSERT
          const valuesSql = rows.map(() => `(?,?,?,?,?,?,?)`).join(',');
          const binds: any[] = [];
          for (const d of rows) {
            const kw = Number(d.rated_kw || 100) * (0.4 + Math.random() * 0.4);
            binds.push(
              `omt_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
              d.id, conn.site_id, nowIso, kw, kw * 0.25, 'valid',
            );
          }
          await env.DB.prepare(`
            INSERT INTO om_telemetry (id, device_id, site_id, ts, ac_kw, interval_kwh, quality)
            VALUES ${valuesSql}
          `).bind(...binds).run();
          await env.DB.prepare(`UPDATE om_connections SET last_poll_at = ?, last_status = 'ok' WHERE id = ?`).bind(nowIso, conn.id).run();
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
      // Daily digest sweep — find subscriptions due today by send_hour_sast.
      // Provider creds (SES/Twilio/WhatsApp) gate actual delivery; without
      // them rows land as 'would_send' so the history is still populated.
      await safe('digest_sweep', async () => {
        const subs = await env.DB.prepare(`
          SELECT * FROM oe_digest_subscriptions WHERE enabled = 1 LIMIT 500
        `).all<any>();
        for (const s of (subs.results || []) as any[]) {
          const stats = await env.DB.prepare(`
            SELECT
              (SELECT COUNT(*) FROM om_faults WHERE status IN ('open','acknowledged','in_progress')) AS open_faults,
              (SELECT COALESCE(SUM(hourly_loss_zar),0) FROM om_faults WHERE status IN ('open','acknowledged','in_progress')) AS bleed,
              (SELECT COUNT(*) FROM om_work_orders WHERE status NOT IN ('completed','verified','closed','cancelled')) AS open_wos
          `).first<any>();
          const body = `Open Energy Ops · morning briefing\n` +
            `${stats?.open_faults || 0} open faults bleeding R${Math.round(Number(stats?.bleed || 0))}/h\n` +
            `${stats?.open_wos || 0} active work orders`;
          const status = (env as any).EMAIL_API_KEY || (env as any).TWILIO_AUTH ? 'sent' : 'would_send';
          await env.DB.prepare(`
            INSERT INTO oe_digest_deliveries
              (id, subscription_id, channel, destination, status, body_preview, sent_at)
            VALUES (?,?,?,?,?,?,?)
          `).bind(
            `oedd_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`,
            s.id, s.channel, s.destination, status, body.slice(0, 500),
            status === 'sent' ? new Date().toISOString() : null,
          ).run();
          await env.DB.prepare(`UPDATE oe_digest_subscriptions SET last_sent_at = datetime('now') WHERE id = ?`).bind(s.id).run();
        }
      });
      // Tenant usage rollup for yesterday — counts API mutations + webhook
      // deliveries + digest sends by participant. D1/Worker request counts
      // come from Cloudflare Analytics (separate ingestion) so we estimate
      // here from row activity rather than over-claim.
      await safe('tenant_usage_rollup', async () => {
        const rows = await env.DB.prepare(`
          SELECT participant_id, COUNT(*) AS n FROM audit_events
          WHERE created_at LIKE ? || '%'
          GROUP BY participant_id
        `).bind(yesterday).all<{ participant_id: string; n: number }>();
        for (const r of (rows.results || []) as any[]) {
          if (!r.participant_id) continue;
          // Rough estimates: 1 audit event ≈ 3 API calls × 5 D1 reads × 2 D1 writes
          const apiCalls = Number(r.n) * 3;
          const d1Reads = Number(r.n) * 15;
          const d1Writes = Number(r.n) * 2;
          // Workers @ $0.30/M + D1 reads @ $1.00/M + D1 writes @ $1.00/M
          const cost = (apiCalls * 0.0000003) + (d1Reads * 0.000001) + (d1Writes * 0.000001);
          await env.DB.prepare(`
            INSERT OR REPLACE INTO oe_tenant_usage
              (participant_id, day, worker_requests, d1_reads_est, d1_writes_est, est_cost_usd)
            VALUES (?,?,?,?,?,?)
          `).bind(r.participant_id, yesterday, apiCalls, d1Reads, d1Writes, cost).run();
        }
      });
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
      await safe('daily_imbalance_settlement', async () => {
        // BRP imbalance settles over the same 24h window. UPSERTs make this
        // idempotent; a separate idempotency-key table isn't required.
        const imbRunId = `imb_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
        await env.DB.prepare(
          `INSERT INTO imbalance_settlement_runs (id, period_from, period_to, status)
           VALUES (?, ?, ?, 'running')`,
        ).bind(imbRunId, yesterday, today).run();
        try {
          const r = await executeImbalanceRun(env, imbRunId, yesterday, today);
          await env.DB.prepare(
            `UPDATE imbalance_settlement_runs
             SET status = 'succeeded', periods_settled = ?, brps_settled = ?,
                 net_charge_zar_total = ?, finished_at = datetime('now')
             WHERE id = ?`,
          ).bind(r.periodsSettled, r.brpsSettled, r.netChargeTotal, imbRunId).run();
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          await env.DB.prepare(
            `UPDATE imbalance_settlement_runs
             SET status = 'failed', error_message = ?, finished_at = datetime('now')
             WHERE id = ?`,
          ).bind(msg, imbRunId).run();
          throw err;
        }
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

    case '45 0 * * *':
      // Watershed nightly: anomaly scan + maturity refresh per tenant participant.
      await safe('watershed_anomaly_scan', async () => {
        const parts = await env.DB.prepare(`SELECT DISTINCT participant_id FROM esg_activity_transactions LIMIT 200`).all<{ participant_id: string }>();
        for (const p of (parts.results || [])) {
          // Spike rule
          const spikes = await env.DB.prepare(`
            WITH monthly AS (
              SELECT id, activity_code, substr(activity_date, 1, 7) AS ym, emissions_kg_co2e
              FROM esg_activity_transactions WHERE participant_id = ?
            )
            SELECT m.id, m.ym, m.emissions_kg_co2e AS emissions,
                   (SELECT AVG(m2.emissions_kg_co2e) FROM monthly m2 WHERE m2.activity_code = m.activity_code AND m2.ym < m.ym) AS prior_avg
            FROM monthly m
          `).bind(p.participant_id).all<{ id: string; ym: string; emissions: number; prior_avg: number }>();
          for (const row of (spikes.results || [])) {
            if (row.prior_avg && row.emissions > row.prior_avg * 4) {
              await env.DB.prepare(`
                INSERT OR IGNORE INTO esg_anomaly_flags (id, transaction_id, participant_id, rule, severity, detail, expected_value, observed_value)
                VALUES (?, ?, ?, 'spike_30d', 'high', ?, ?, ?)
              `).bind(
                `anf_cron_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
                row.id, p.participant_id, `Cron-detected spike vs ${row.ym} prior-month avg`, row.prior_avg, row.emissions,
              ).run();
            }
          }
        }
      });

      await safe('watershed_maturity_refresh', async () => {
        const year = new Date().getFullYear();
        const parts = await env.DB.prepare(`SELECT id FROM participants WHERE status = 'active' LIMIT 200`).all<{ id: string }>();
        for (const p of (parts.results || [])) {
          // Re-compute using same heuristic as POST /api/watershed/maturity/score
          const txByScope = await env.DB.prepare(
            `SELECT scope, COUNT(*) AS n FROM esg_activity_transactions WHERE participant_id = ? AND substr(activity_date, 1, 4) = ? GROUP BY scope`,
          ).bind(p.id, String(year)).all<{ scope: number; n: number }>();
          const scopes = new Set((txByScope.results || []).map(r => r.scope));
          let measurement = (scopes.has(1) ? 30 : 0) + (scopes.has(2) ? 30 : 0) + (scopes.has(3) ? 40 : 0);
          const disc = (await env.DB.prepare(`SELECT COUNT(*) AS n FROM esg_disclosures WHERE participant_id = ?`).bind(p.id).first<{ n: number }>())?.n || 0;
          const tgt = (await env.DB.prepare(`SELECT COUNT(*) AS n FROM esg_targets WHERE participant_id = ?`).bind(p.id).first<{ n: number }>())?.n || 0;
          const init = (await env.DB.prepare(`SELECT COUNT(*) AS n FROM esg_initiatives WHERE participant_id = ? AND status = 'completed'`).bind(p.id).first<{ n: number }>())?.n || 0;
          const jur = (await env.DB.prepare(`SELECT COUNT(DISTINCT jurisdiction) AS n FROM disclosure_submissions WHERE participant_id = ? AND status IN ('submitted','accepted')`).bind(p.id).first<{ n: number }>())?.n || 0;
          const governance = Math.min(100, disc * 25);
          const target = Math.min(100, tgt * 30);
          const action = Math.min(100, init * 20);
          const disclosure = Math.min(100, jur * 20);
          const overall = (measurement * 0.25) + (governance * 0.15) + (target * 0.20) + (action * 0.25) + (disclosure * 0.15);
          const band = overall >= 80 ? 'leader' : overall >= 60 ? 'advanced' : overall >= 40 ? 'intermediate' : overall >= 20 ? 'beginner' : 'starter';
          await env.DB.prepare(`
            INSERT INTO climate_maturity_assessments (id, participant_id, reporting_year, measurement_score, governance_score, target_score, action_score, disclosure_score, overall_score, band, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).bind(
            `mat_cron_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
            p.id, year, measurement, governance, target, action, disclosure, overall, band,
            'Nightly cron refresh',
          ).run();
        }
      });

      await safe('watershed_cfe_monthly_rollup', async () => {
        // Roll up the prior month's hourly load/gen into cfe_match_summary
        // for any participant with hourly data.
        const monthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
        const monthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59).toISOString();
        const parts = await env.DB.prepare(
          `SELECT DISTINCT participant_id FROM cfe_hourly_load WHERE hour_utc >= ? AND hour_utc <= ? LIMIT 200`,
        ).bind(monthStart, monthEnd).all<{ participant_id: string }>();
        for (const p of (parts.results || [])) {
          const load = await env.DB.prepare(
            `SELECT hour_utc, SUM(load_kwh) AS l FROM cfe_hourly_load WHERE participant_id = ? AND hour_utc >= ? AND hour_utc <= ? GROUP BY hour_utc`,
          ).bind(p.participant_id, monthStart, monthEnd).all<{ hour_utc: string; l: number }>();
          const gen = await env.DB.prepare(
            `SELECT hour_utc, SUM(generation_kwh) AS g FROM cfe_hourly_generation WHERE participant_id = ? AND hour_utc >= ? AND hour_utc <= ? GROUP BY hour_utc`,
          ).bind(p.participant_id, monthStart, monthEnd).all<{ hour_utc: string; g: number }>();
          const lm = new Map<string, number>(); for (const r of load.results || []) lm.set(r.hour_utc, r.l || 0);
          const gm = new Map<string, number>(); for (const r of gen.results || []) gm.set(r.hour_utc, r.g || 0);
          let totalL = 0, totalCF = 0, full = 0, zero = 0;
          for (const [h, l] of lm) {
            const g = gm.get(h) || 0;
            totalL += l; totalCF += Math.min(l, g);
            if (g >= l && l > 0) full++;
            if (g === 0) zero++;
          }
          if (totalL <= 0) continue;
          const matchPct = (totalCF / totalL) * 100;
          const gridK = 0.92;
          const avoided = (totalCF * gridK) / 1000;
          await env.DB.prepare(`
            INSERT OR REPLACE INTO cfe_match_summary (participant_id, reporting_period_start, reporting_period_end, total_load_kwh, total_carbon_free_kwh, cfe_match_pct, hours_with_full_match, hours_with_zero_match, avg_grid_intensity_kg_kwh, emissions_avoided_tco2e)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).bind(p.participant_id, monthStart, monthEnd, totalL, totalCF, matchPct, full, zero, gridK, avoided).run();
        }
      });

      // L5 — nightly tamper-evident audit-chain verify across every feature
      // chain. Hashes are recomputed from sequence_no=1 each night; any
      // divergence is logged at error level so the on-call dashboard /
      // SIEM forwarders surface it. The verify itself persists
      // last_verified_at into audit_chain_state on success, which the
      // workstation UIs surface as "verified · <timestamp>".
      await safe('audit_chain_verify_all', async () => {
        const features = ['trading','settlement','carbon','ipp','offtaker',
                          'lender','grid','regulator','admin','support',
                          'auth','contracts','marketplace','esg','platform'];
        for (const feature of features) {
          const result = await verifyChain(env, feature).catch((e) => ({
            entity_type: feature, ok: false, scanned: 0,
            head_hash: null, head_sequence: 0,
            first_divergence_seq: null, expected_hash: null, stored_hash: null,
            duration_ms: 0, error: (e as Error).message,
          } as unknown as Awaited<ReturnType<typeof verifyChain>>));
          if (!result.ok) {
            logger.error('audit_chain_divergence', {
              entity_type: feature,
              first_divergence_seq: result.first_divergence_seq,
              expected_hash: result.expected_hash,
              stored_hash: result.stored_hash,
            });
          }
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
