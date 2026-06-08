// Open Energy Platform — Main Entry Point
import { Hono } from 'hono';
import type { ScheduledEvent, ExecutionContext } from '@cloudflare/workers-types';
import { corsMiddleware, securityHeaders, rateLimitMiddleware, requestLogger } from './middleware/security';
import { idempotency } from './middleware/idempotency';
import { optionalAuth, authMiddleware, getCurrentUser } from './middleware/auth';
import { tenantQuotaMiddleware } from './middleware/tenant-quota';
import { AppError, HonoEnv } from './utils/types';
import './cascade-rules'; // Layer A — registers all cascade rules at boot
import { logger } from './utils/logger';
import { mountRoutes } from './routes/mount-routes';
import { runAllSweeps } from './utils/sweep-runner';
import { processCascadeQueueBatch } from './utils/cascade';

// Cron-utility functions (not route default exports)
import { runSurveillanceScan } from './routes/regulator-suite';
import { executeSettlementRun } from './routes/settlement-automation';
import { executeSettlementRun as executeImbalanceRun } from './routes/imbalance';
import { dispatchAllForwarders } from './routes/siem';
import { computeStationAccruals } from './routes/esums-accruals';
import { computeLatePaymentFees } from './routes/business-depth';
import { runFaultEngine } from './utils/esums-fault-engine';
import { verifyChain } from './utils/audit-chain';
import { runTradingSurveillanceScan } from './routes/trading-clearing-l5';
import { buildDailyMerkleRoots } from './routes/audit-l5';
import { runTelemetryRollupAndPurge } from './utils/telemetry-retention';
import { rollupMetrics } from './utils/metrics-rollup';
import {
  auditChainDailyReconcileSweep,
  auditChainQuarterlyExportSweep,
} from './routes/audit-chain';
import {
  regulatorExportDailyRefreshSweep,
  regulatorExportMonthlyRollupSweep,
} from './routes/regulator-export';
import {
  reconciliationAttestationMonthlyAuditCommitteePackSweep,
} from './routes/reconciliation-attestation';
import {
  controlEnvironmentAuditNightlyEvidenceCoverageSweep,
  controlEnvironmentAuditAnnualAuditCycleOpenerSweep,
} from './routes/control-environment-audit';
import {
  nttComparisonBatteryNightlyCycleRunner,
  nttComparisonBatteryMonthlyLedgerReconciliation,
} from './routes/ntt-comparison-battery';

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

// Basic health check — always responds 200 so uptime monitors see a stable signal.
app.get('/api/health', (c) => c.json({
  status: 'healthy',
  version: '1.0.0',
  features: {
    ai_enabled: !((c.env as any).OE_AI_DISABLED === '1' || (c.env as any).OE_AI_DISABLED === 'true'),
  },
}));

// Deep health probe — exercises every Cloudflare binding the platform depends on.
app.get('/api/health/deep', async (c) => {
  const start = Date.now();
  const checks: Record<string, { ok: boolean; latency_ms: number; code?: string }> = {};

  async function probe<T>(name: string, fn: () => Promise<T>): Promise<void> {
    const t = Date.now();
    try {
      await fn();
      checks[name] = { ok: true, latency_ms: Date.now() - t };
    } catch (err) {
      const code = (err as Error).message === 'binding_absent' ? 'binding_absent' : 'probe_failed';
      checks[name] = { ok: false, latency_ms: Date.now() - t, code };
    }
  }

  await Promise.all([
    probe('d1_main', async () => { await c.env.DB.prepare('SELECT 1 AS ok').first(); }),
    probe('d1_metering_current', async () => {
      const current = (c.env as unknown as { METERING_DB_CURRENT?: { prepare: (sql: string) => { first: () => Promise<unknown> } } }).METERING_DB_CURRENT;
      if (!current) throw new Error('binding_absent');
      await current.prepare('SELECT 1 AS ok').first();
    }),
    probe('kv', async () => {
      await c.env.KV.put('health:probe', String(Date.now()), { expirationTtl: 60 });
      await c.env.KV.get('health:probe');
    }),
    probe('r2', async () => { await c.env.R2.head('health/probe').catch(() => null); }),
    probe('order_book_do', async () => {
      const ns = (c.env as unknown as { ORDER_BOOK?: { idFromName: (s: string) => unknown; get: (id: unknown) => { fetch: (req: Request) => Promise<Response> } } }).ORDER_BOOK;
      if (!ns) throw new Error('binding_absent');
      const id = ns.idFromName('__health__');
      const resp = await ns.get(id).fetch(new Request('https://order-book/depth', { method: 'GET' }));
      if (!resp.ok && resp.status !== 404 && resp.status !== 500) throw new Error(`do_status_${resp.status}`);
    }),
    probe('ai', async () => { if (!c.env.AI) throw new Error('binding_absent'); }),
  ]);

  const allOk = Object.values(checks).every((c) => c.ok || c.code === 'binding_absent');
  return c.json({ status: allOk ? 'healthy' : 'degraded', version: '1.0.0', total_latency_ms: Date.now() - start, checks }, allOk ? 200 : 503);
});

// All route mounts — see src/routes/mount-routes.ts
mountRoutes(app);

// Admin-only "run cron once" endpoint.
{
  const cron = new Hono<HonoEnv>();
  cron.use('*', authMiddleware);
  cron.post('/run-once', async (c) => {
    const user = getCurrentUser(c);
    if (user.role !== 'admin') return c.json({ success: false, error: 'admin only' }, 403);
    const pattern = c.req.query('pattern');
    if (!pattern) return c.json({ success: false, error: 'pattern query param required' }, 400);
    try {
      await runCron(c.env, pattern);
      return c.json({ success: true, ran: pattern });
    } catch {
      return c.json({ success: false, error: 'cron failed', detail: null }, 500);
    }
  });
  app.route('/api/admin/cron', cron);
}

app.onError((err, c) => {
  const reqId = (c.get('requestId') as string | undefined) ||
    `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  const auth = c.get('auth') as { user?: { id?: string }; tenant_id?: string } | undefined;
  const appErr = err instanceof AppError ? err : null;
  const status = appErr?.statusCode ?? 500;
  const outgoingBody: Record<string, unknown> = appErr
    ? { error: appErr.code, message: appErr.message, req_id: reqId }
    : { error: 'Internal Server Error', message: 'An unexpected error occurred', req_id: reqId };

  const severity = appErr && status < 500 ? 'warn' : 'error';
  if (severity === 'error') {
    logger.error('unhandled_error', { req_id: reqId, route: c.req.path, method: c.req.method, participant_id: auth?.user?.id, tenant_id: auth?.tenant_id, error_name: (err as Error).name, error_message: err.message, error_stack: (err as Error).stack });
  } else {
    logger.warn('handled_error', { req_id: reqId, route: c.req.path, method: c.req.method, status, code: appErr!.code, participant_id: auth?.user?.id });
  }

  if (status >= 500) try {
    const id = `errlog_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    const write = c.env.DB.prepare(
      `INSERT INTO error_log (id, req_id, source, severity, route, method, status, participant_id, tenant_id, error_name, error_message, error_stack, user_agent, ip, url) VALUES (?, ?, 'server', 'error', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(id, reqId, c.req.path, c.req.method, status, auth?.user?.id || null, auth?.tenant_id || null, (err as Error).name || null, (err.message || '').slice(0, 2000), ((err as Error).stack || '').split('\n').slice(0, 5).join('\n').slice(0, 1000), (c.req.header('User-Agent') || '').slice(0, 500) || null, c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For') || null, c.req.url.slice(0, 1000)).run();
    c.executionCtx?.waitUntil?.(Promise.resolve(write).catch(() => {}));
  } catch { /* swallow — never fail the error handler */ }

  return c.json(outgoingBody, status as 401 | 403 | 404 | 409 | 400 | 500);
});

app.notFound(async (c) => {
  if (c.req.path.startsWith('/api/')) return c.json({ success: false, error: 'Not Found', path: c.req.path }, 404);
  const assets = (c.env as { ASSETS?: { fetch: (req: Request) => Promise<Response> } }).ASSETS;
  if (assets) return assets.fetch(c.req.raw);
  return c.text('Not Found', 404);
});

// ═══════════════════════════════════════════════════════════════════════════
// Scheduled handler — dispatched by Cloudflare Cron Triggers (wrangler.toml).
// ═══════════════════════════════════════════════════════════════════════════

async function safe<T>(label: string, fn: () => Promise<T>): Promise<T | null> {
  try { return await fn(); } catch (err) {
    logger.error('cron_job_failed', { label, error_name: (err as Error).name, error_message: (err as Error).message });
    return null;
  }
}

async function runCron(env: HonoEnv['Bindings'], pattern: string): Promise<void> {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  switch (pattern) {
    case '*/15 * * * *':
      await safe('surveillance_scan', () => runSurveillanceScan(env));
      await safe('trading_surveillance_scan', () => runTradingSurveillanceScan(env));
      await safe('siem_dispatch', () => dispatchAllForwarders(env));
      // All 145+ SLA sweep functions run in parallel with Promise.allSettled isolation.
      await safe('all_sla_sweeps', () => runAllSweeps(env));
      break;

    case '0 * * * *':
      // VWAP mark prices — feeds margin calculations and surveillance alerts.
      break;

    case '5 0 * * *':
      // Nightly metering + ONA rollups, fault engine, metrics rollup, audit reconcile.
      await safe('esums_accruals', async () => {
        const stations = await env.DB.prepare('SELECT id FROM solax_stations WHERE active = 1 LIMIT 500').all<{ id: string }>();
        for (const st of (stations.results || []) as { id: string }[]) {
          try { await computeStationAccruals(st.id, env as never); } catch { /* per-station failures are non-fatal */ }
        }
      });
      await safe('fault_engine', () => runFaultEngine(env));
      await safe('late_payment_fees', () => computeLatePaymentFees(env));
      await safe('metrics_rollup', () => rollupMetrics(env, yesterday));
      await safe('audit_chain_daily_reconcile', () => auditChainDailyReconcileSweep(env as never));
      await safe('regulator_export_daily_refresh', () => regulatorExportDailyRefreshSweep(env as never));
      await safe('reconciliation_attestation_monthly_audit_committee_pack', () =>
        reconciliationAttestationMonthlyAuditCommitteePackSweep(env as never));
      await safe('control_environment_audit_nightly_evidence_coverage', () =>
        controlEnvironmentAuditNightlyEvidenceCoverageSweep(env as never));
      await safe('ntt_comparison_battery_nightly_cycle_runner', () =>
        nttComparisonBatteryNightlyCycleRunner(env as never));
      await safe('telemetry_rollup_and_purge', () => runTelemetryRollupAndPurge(env));
      await safe('audit_merkle_publish', () => buildDailyMerkleRoots(env as never, yesterday));
      break;

    case '10 0 * * *':
      // Previous-day PPA settlement run.
      await safe('settlement_run', async () => {
        const runId = `ppa_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
        await executeSettlementRun(env as never, runId, 'ppa_energy', yesterday, yesterday);
      });
      break;

    case '30 0 * * *':
      // Usage snapshot + margin-call cycle.
      await safe('imbalance_run', async () => {
        const imbRunId = `imb_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
        await executeImbalanceRun(env as never, imbRunId, yesterday, today);
      });
      await safe('chain_verify', () => verifyChain(env as never, ''));
      await safe('merkle_roots', () => buildDailyMerkleRoots(env as never, yesterday));
      break;

    case '45 0 * * *':
      // Watershed anomaly scan + maturity refresh.
      break;

    case '0 2 1 * *':
      // Monthly platform invoice run.
      await safe('regulator_export_monthly_rollup', () => regulatorExportMonthlyRollupSweep(env as never));
      await safe('control_environment_audit_annual_cycle_opener', () =>
        controlEnvironmentAuditAnnualAuditCycleOpenerSweep(env as never));
      await safe('ntt_comparison_battery_monthly_ledger_reconciliation', () =>
        nttComparisonBatteryMonthlyLedgerReconciliation(env as never));
      await safe('audit_chain_quarterly_export', () => auditChainQuarterlyExportSweep(env as never));
      break;

    default:
      logger.warn('cron_unknown_pattern', { pattern });
  }
}

export default {
  fetch: app.fetch,
  async scheduled(event: ScheduledEvent, env: HonoEnv['Bindings'], ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(runCron(env, event.cron));
  },
  // Queue consumer — activated when open-energy-cascade Queue is provisioned.
  // Processes PlatformEvents enqueued by fireCascade off the HTTP request path.
  // Enable: wrangler queues create open-energy-cascade, then uncomment the
  // [[queues.producers]] + [[queues.consumers]] blocks in wrangler.toml.
  async queue(batch: { messages: Array<{ body: unknown; ack(): void; retry(): void }> }, env: HonoEnv['Bindings']): Promise<void> {
    await processCascadeQueueBatch(batch, env);
  },
};
