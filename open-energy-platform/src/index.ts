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
import { v2TimerSweep, v2NightlySeal } from './routes/v2';
import { runDealSweep } from './routes/deals';
import { processCascadeQueueBatch, fireCascade } from './utils/cascade';

// Cron-utility functions (not route default exports)
import { runSurveillanceScan } from './routes/regulator-suite';
import { executeSettlementRun } from './routes/settlement-automation';
import { executeSettlementRun as executeImbalanceRun } from './routes/imbalance';
import { dispatchAllForwarders } from './routes/siem';
import { computeStationAccruals, backfillStationHistory, recordStationHourly, materializeFinancials } from './routes/esums-accruals';
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
  auditChainHourlyProposeSweep,
} from './routes/audit-chain';
import {
  regulatorExportDailyRefreshSweep,
  regulatorExportMonthlyRollupSweep,
} from './routes/regulator-export';
import {
  reconciliationAttestationMonthlyAuditCommitteePackSweep,
  reconciliationAttestationVarianceRecomputeSweep,
} from './routes/reconciliation-attestation';
import {
  controlEnvironmentAuditNightlyEvidenceCoverageSweep,
  controlEnvironmentAuditAnnualAuditCycleOpenerSweep,
} from './routes/control-environment-audit';
import {
  nttComparisonBatteryNightlyCycleRunner,
  nttComparisonBatteryMonthlyLedgerReconciliation,
} from './routes/ntt-comparison-battery';
import { ippScheduleHealthRecompute } from './routes/ipp-schedule-chain';
import { ippEvmHealthRecompute } from './routes/ipp-evm-chain';
import { ippDocControlIdcMatrixRecompute } from './routes/ipp-document-control-chain';
import { ippRfiAgingRefresh } from './routes/ipp-rfi';
import { ippChangeOrderCumPctRefresh } from './routes/ipp-change-order';
import { stageGateConditionsAgingSweep } from './routes/stage-gate';
import { scadaConnectorCertExpirySweep } from './routes/scada-connector';
import { strateSwiftConnectorReconciliationSweep } from './routes/strate-swift-connector';
import { sapOracleErpConnectorReconciliationSweep } from './routes/sap-oracle-erp-connector';
import { governmentFilingConnectorFilingDeadlineSweep } from './routes/government-filing-connector';
import { anomalyDetectionMlDriftScan } from './routes/anomaly-detection-ml';
import { rulPredictionMlConcordanceMonitor } from './routes/rul-prediction-ml';
import { faultFingerprintMlClassDriftScan } from './routes/fault-fingerprint-ml';
import { pnlAttributionT1EodOpener } from './routes/pnl-attribution-chain';
import { publishChainHeadToR2 } from './utils/audit-chain';
import { runMonthlySubscriptionBilling } from './routes/subscription-billing-chain';
import {
  publishVwapMarks,
  runMarginCallCycle,
  runWatershedAnomalyScan,
  runMaturityRefresh,
  snapshotAllOrderBooks,
  runPfmiDisclosureSweep,
  runTradingRiskMtdDigest,
} from './utils/cron-sweeps';

// Durable Object exports — required for Cloudflare to resolve the
// [[durable_objects.bindings]] class_name references in wrangler.toml.
export { OrderBook } from './do/order-book';

const app = new Hono<HonoEnv>();

// Global middleware
app.use('*', securityHeaders);
app.use('*', corsMiddleware);
app.use('/api/*', rateLimitMiddleware);
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
// Intentionally minimal: no version, no feature flags (info disclosure).
app.get('/api/health', (c) => c.json({ status: 'healthy' }));

// Deep health probe — admin-only; leaks binding topology.
app.get('/api/health/deep', authMiddleware, async (c) => {
  const user = getCurrentUser(c);
  if (user.role !== 'admin') return c.json({ success: false, error: 'admin only' }, 403);
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

// D1 / SQLite constraint violations are bad-input problems, not server faults.
// Surfacing them as a raw 500 is wrong: an unknown FK, a duplicate key, a CHECK
// failure or a missing NOT NULL are all the caller's request being unprocessable.
// Map them to structured 4xx reason codes (L5 discipline) so no create/advance
// ever 500s on shape-valid-but-referentially-bad input. Generic messages only —
// never echo the raw constraint string (it leaks table/column names).
function classifyConstraint(msg: string): { status: 409 | 422; code: string; message: string } | null {
  if (!/constraint failed/i.test(msg || '')) return null;
  if (/FOREIGN KEY/i.test(msg)) return { status: 422, code: 'foreign_key_violation', message: 'A referenced record does not exist.' };
  if (/UNIQUE/i.test(msg)) return { status: 409, code: 'duplicate_record', message: 'A record with these values already exists.' };
  if (/NOT NULL/i.test(msg)) return { status: 422, code: 'missing_required_field', message: 'A required field was not provided.' };
  if (/CHECK/i.test(msg)) return { status: 422, code: 'invalid_field_value', message: 'A field value is not allowed.' };
  return { status: 422, code: 'constraint_violation', message: 'The request violates a data constraint.' };
}

// A malformed or empty request body makes `await c.req.json()` throw a SyntaxError
// (workerd: "Unexpected end of JSON input" / "Unexpected token … is not valid JSON").
// That is the caller's fault, not ours — map to 400 so no create/advance handler
// that omits its own body guard ever 500s on shape-invalid input (L5 discipline).
// Generic message only — never echo the parser's raw position/snippet.
function classifyParseError(err: Error): { status: 400; code: string; message: string } | null {
  if ((err?.name || '') !== 'SyntaxError') return null;
  if (!/JSON|Unexpected (end|token|non-whitespace)/i.test(err?.message || '')) return null;
  return { status: 400, code: 'invalid_json', message: 'Request body must be valid JSON.' };
}

app.onError((err, c) => {
  const reqId = (c.get('requestId') as string | undefined) ||
    `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  const auth = c.get('auth') as { user?: { id?: string }; tenant_id?: string } | undefined;
  const appErr = err instanceof AppError ? err : null;
  // Order: parse errors (400) take precedence over constraint heuristics (409/422).
  const classified = appErr ? null : (classifyParseError(err as Error) ?? classifyConstraint((err as Error).message || ''));
  const status = appErr?.statusCode ?? classified?.status ?? 500;
  const outgoingBody: Record<string, unknown> = appErr
    ? { error: appErr.code, message: appErr.message, req_id: reqId }
    : classified
    ? { success: false, error: classified.code, message: classified.message, req_id: reqId }
    : { error: 'Internal Server Error', message: 'An unexpected error occurred', req_id: reqId };

  const severity = (appErr || classified) && status < 500 ? 'warn' : 'error';
  if (severity === 'error') {
    logger.error('unhandled_error', { req_id: reqId, route: c.req.path, method: c.req.method, participant_id: auth?.user?.id, tenant_id: auth?.tenant_id, error_name: (err as Error).name, error_message: err.message, error_stack: (err as Error).stack });
  } else {
    logger.warn('handled_error', { req_id: reqId, route: c.req.path, method: c.req.method, status, code: appErr?.code ?? classified?.code, participant_id: auth?.user?.id });
  }

  if (status >= 500) try {
    const id = `errlog_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    const write = c.env.DB.prepare(
      `INSERT INTO error_log (id, req_id, source, severity, route, method, status, participant_id, tenant_id, error_name, error_message, error_stack, user_agent, ip, url) VALUES (?, ?, 'server', 'error', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(id, reqId, c.req.path, c.req.method, status, auth?.user?.id || null, auth?.tenant_id || null, (err as Error).name || null, (err.message || '').slice(0, 2000), ((err as Error).stack || '').split('\n').slice(0, 5).join('\n').slice(0, 1000), (c.req.header('User-Agent') || '').slice(0, 500) || null, c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For') || null, c.req.url.slice(0, 1000)).run();
    c.executionCtx?.waitUntil?.(Promise.resolve(write).catch(() => {}));
  } catch { /* swallow — never fail the error handler */ }

  return c.json(outgoingBody, status as 401 | 403 | 404 | 409 | 400 | 422 | 500);
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
      // Cross-role deal engine: expire stale offers + auto-clear timer auctions whose window closed.
      await safe('deal_sweep', () => runDealSweep(env));
      // OrderBook depth snapshots — persist every active shard's book to D1 so the
      // surveillance plane has fresh depth. No-op when ORDER_BOOK binding is absent.
      await safe('orderbook_depth_snapshots', () => snapshotAllOrderBooks(env));
      // v2 event-log engine: fire due SLA / time-bar timers (v2_timers).
      await safe('v2_timer_sweep', () => v2TimerSweep(env));
      break;

    case '0 * * * *':
      // Hourly SolaX → telemetry ingestion. Pull a short trailing window of inverter-
      // cloud history per live station so the telemetry plane (om_telemetry → /pulse,
      // W71 predictive, O&M) and the financial site_accruals plane stay within the hour.
      // backfillStationHistory is idempotent (deterministic ids + ON CONFLICT), so the
      // overlapping window only upserts — re-running never double-counts.
      // ponytail: serial loop over ~10 live stations; parallelise if the fleet grows
      // past a few hundred. 2-day window catches late-arriving SolaX history rows.
      await safe('solax_hourly_ingest', async () => {
        const sinceMs = Date.now() - 2 * 24 * 60 * 60 * 1000;
        const stations = await env.DB.prepare(
          "SELECT id FROM solax_stations WHERE status = 'active' AND manufacturer = 'solax' LIMIT 500",
        ).all<{ id: string }>();
        for (const st of (stations.results || []) as { id: string }[]) {
          try { await backfillStationHistory(st.id, env as never, sinceMs); } catch { /* per-station non-fatal */ }
        }
      });
      // Non-SolaX inverters (Sungrow iSolarCloud, etc.) have no history adapter —
      // record forward from realtime, one hourly point per station, building the
      // ML/O&M + financial series hour-by-hour from the moment they connect.
      await safe('inverter_hourly_record', async () => {
        const stations = await env.DB.prepare(
          "SELECT id FROM solax_stations WHERE status = 'active' AND manufacturer != 'solax' LIMIT 500",
        ).all<{ id: string }>();
        for (const st of (stations.results || []) as { id: string }[]) {
          try { await recordStationHourly(st.id, env as never); } catch { /* per-station non-fatal */ }
        }
      });
      // VWAP mark publish — without this the mark-price plane goes stale ~30 min
      // after the last manual /mark-prices/vwap-run and pre-trade guards halt trading.
      await safe('vwap_mark_publish', () => publishVwapMarks(env));
      break;

    case '5 0 * * *':
      // Nightly metering + ONA rollups, fault engine, metrics rollup, audit reconcile.
      await safe('esums_accruals', async () => {
        const stations = await env.DB.prepare("SELECT id FROM solax_stations WHERE status = 'active' LIMIT 500").all<{ id: string }>();
        for (const st of (stations.results || []) as { id: string }[]) {
          try { await computeStationAccruals(st.id, env as never); } catch { /* per-station failures are non-fatal */ }
        }
        // Rebuild the financial bridges (invoices/credits/holdings) per owner so the
        // nightly refresh keeps them current — and fire esums_financials_materialized,
        // which esums-activation.ts consumes to re-light every counterparty IncomingPanel.
        // Without this the cron only wrote raw accruals; invoices went stale and no
        // cross-role card ever fired on refresh (only on manual upload/materialize).
        const owners = await env.DB.prepare(
          `SELECT DISTINCT participant_id AS pid FROM solax_stations WHERE status = 'active' AND participant_id IS NOT NULL AND participant_id != '' LIMIT 200`,
        ).all<{ pid: string }>();
        for (const o of (owners.results || []) as { pid: string }[]) {
          try {
            const result = await materializeFinancials(o.pid, env as never);
            await fireCascade({
              event: 'esums_financials_materialized', actor_id: 'system',
              entity_type: 'esums_station', entity_id: o.pid,
              data: { participant_id: o.pid, refresh: true, suppress_notifications: true, ...result }, env: env as never,
            }).catch(() => {});
          } catch { /* per-owner failures are non-fatal */ }
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
      // Audit-chain external anchor — publish current chain head to R2 so the
      // tamper-evident chain has an out-of-band anchor point every night.
      await safe('audit_chain_anchor', () => publishChainHeadToR2(env));
      // Purge resolved/abandoned DLQ rows older than 90 days to prevent unbounded growth.
      await safe('cascade_dlq_purge', async () => {
        await env.DB.prepare(
          `DELETE FROM cascade_dlq WHERE status IN ('resolved','abandoned') AND first_seen_at < datetime('now','-90 days')`,
        ).run();
      });
      break;

    case '10 0 * * *':
      // Previous-day PPA settlement run.
      await safe('settlement_run', async () => {
        const runId = `ppa_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
        await executeSettlementRun(env as never, runId, 'ppa_energy', yesterday, yesterday);
      });
      break;

    case '15 0 * * *':
      // W112 IPP WBS & Gantt schedule-health recompute (CPI/SPI/SV/CV + health band).
      await safe('ipp_schedule_health_recompute', () => ippScheduleHealthRecompute(env));
      break;

    case '20 0 * * *':
      // W113 IPP Cost & EVM nightly recompute (CPI/SPI/EAC/TCPI/VAC + contingency/MR + health band).
      await safe('ipp_evm_health_recompute', () => ippEvmHealthRecompute(env));
      break;

    case '25 0 * * *':
      // W114 IPP Document Control IDC matrix recompute (idc_status + completeness + doc_health_band).
      await safe('ipp_doc_control_idc_matrix_recompute', () => ippDocControlIdcMatrixRecompute(env));
      break;

    case '30 0 * * *':
      // Usage snapshot + margin-call cycle.
      await safe('imbalance_run', async () => {
        const imbRunId = `imb_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
        await executeImbalanceRun(env as never, imbRunId, yesterday, today);
      });
      await safe('chain_verify', () => verifyChain(env as never, ''));
      await safe('merkle_roots', () => buildDailyMerkleRoots(env as never, yesterday));
      // Margin-call cycle — escalate overdue oe_margin_calls past their deadline.
      await safe('margin_call_cycle', () => runMarginCallCycle(env));
      // v2 event-log engine: seal the day's events under a merkle root.
      await safe('v2_nightly_seal', () => v2NightlySeal(env));
      break;

    case '35 0 * * *':
      // W116 IPP RFI nightly aging refresh (rfi_age_days + completeness + rfi_health_band).
      await safe('ipp_rfi_aging_refresh', () => ippRfiAgingRefresh(env));
      break;

    case '40 0 * * *':
      // W117 IPP Change Order cumulative_change_value_pct + cap_band + aging refresh.
      await safe('ipp_change_order_cum_pct_refresh', () => ippChangeOrderCumPctRefresh(env));
      break;

    case '45 0 * * *':
      // Watershed anomaly scan + maturity refresh + W118 audit-chain daily reconcile + chain-link verify.
      await safe('watershed_anomaly_scan', () => runWatershedAnomalyScan(env));
      await safe('maturity_refresh', () => runMaturityRefresh(env));
      await safe('audit_chain_daily_reconcile_45', () => auditChainDailyReconcileSweep(env as never));
      await safe('chain_verify_45', () => verifyChain(env as never, ''));
      break;

    case '50 0 * * *':
      // W119 regulator-export-pack LIVE score refresh (completeness/xbrl/esg/controls/integrity + health band + days_to_quarterly_cutoff).
      await safe('regulator_export_daily_refresh_50', () => regulatorExportDailyRefreshSweep(env as never));
      break;

    case '55 0 * * *':
      // W120 reconciliation-attestation LIVE variance recompute (4 scoring indexes + attestation_health_band + days_to_quarterly_attestation).
      await safe('reconciliation_attestation_variance_recompute', () =>
        reconciliationAttestationVarianceRecomputeSweep(env as never));
      break;

    case '58 0 * * *':
      // W121 control-environment-audit nightly evidence-coverage recompute (4 scoring indexes + control_health_band + days_to_quarterly_cutoff + days_to_annual_audit).
      await safe('control_environment_audit_nightly_evidence_coverage_58', () =>
        controlEnvironmentAuditNightlyEvidenceCoverageSweep(env as never));
      break;

    case '5 * * * *':
      // W118 audit-chain hourly block proposal (Phase-B opener).
      await safe('audit_chain_hourly_propose', () => auditChainHourlyProposeSweep(env as never));
      break;

    case '0 3 1 1,4,7,10 *':
      // W118 audit-chain quarterly NERSA/IPPO/SARB export sweep.
      await safe('audit_chain_quarterly_export', () => auditChainQuarterlyExportSweep(env as never));
      break;

    case '0 2 1 * *':
      // Monthly platform invoice run + monthly rollups.
      await safe('subscription_monthly_billing', () => runMonthlySubscriptionBilling(env));
      await safe('regulator_export_monthly_rollup', () => regulatorExportMonthlyRollupSweep(env as never));
      await safe('control_environment_audit_annual_cycle_opener', () =>
        controlEnvironmentAuditAnnualAuditCycleOpenerSweep(env as never));
      await safe('ntt_comparison_battery_monthly_ledger_reconciliation', () =>
        nttComparisonBatteryMonthlyLedgerReconciliation(env as never));
      await safe('audit_chain_quarterly_export_monthly', () => auditChainQuarterlyExportSweep(env as never));
      break;

    case '0 4 1 * *':
      // W119 monthly_return regulator-export-pack rollup (flag closing-month packs as regulator_relevant).
      await safe('regulator_export_monthly_rollup_4', () => regulatorExportMonthlyRollupSweep(env as never));
      break;

    case '0 5 1 * *':
      // W120 monthly audit-committee pack rollup (flag closing-month quarterly+annual attestations regulator_relevant).
      await safe('reconciliation_attestation_monthly_audit_committee_pack_5', () =>
        reconciliationAttestationMonthlyAuditCommitteePackSweep(env as never));
      break;

    case '0 6 1 1 *':
      // W121 annual external-audit cycle opener (raise iso27001_surveillance_audit_due + sox_404_attestation_pending + soc2_type2_period_open per framework).
      await safe('control_environment_audit_annual_cycle_opener_jan', () =>
        controlEnvironmentAuditAnnualAuditCycleOpenerSweep(env as never));
      break;

    case '0 6 * * 1':
      // W131 Stage Gates conditions-aging sweep (Mon; flags regulator_relevant on conditions_set_at >90d).
      await safe('stage_gate_conditions_aging_sweep', () => stageGateConditionsAgingSweep(env));
      break;

    case '0 7 * * 1':
      // W122 SCADA connector weekly cert-expiry sweep (60d / 14d revocation warning).
      await safe('scada_connector_cert_expiry_sweep', () => scadaConnectorCertExpirySweep(env));
      break;

    case '30 1 * * *':
      // W124 STRATE/SWIFT settlement connector reconciliation sweep.
      await safe('strate_swift_reconciliation_sweep', () => strateSwiftConnectorReconciliationSweep(env));
      break;

    case '45 1 * * *':
      // W125 SAP/Oracle ERP connector reconciliation sweep.
      await safe('sap_oracle_erp_reconciliation_sweep', () => sapOracleErpConnectorReconciliationSweep(env));
      break;

    case '0 2 * * *':
      // W126 CIPC/SARS/NERSA government-filing connector statutory filing-deadline sweep.
      await safe('government_filing_deadline_sweep', () => governmentFilingConnectorFilingDeadlineSweep(env));
      break;

    case '30 2 * * *':
      // W127 Anomaly-Detection ML Model drift scan (PSI + KS + recon-error p99 + lift drift).
      await safe('anomaly_detection_ml_drift_scan', () => anomalyDetectionMlDriftScan(env));
      break;

    case '0 3 * * *':
      // W128 RUL Prediction ML Model concordance monitor (Harrell C + AUC + Brier + Schoenfeld PH).
      await safe('rul_prediction_ml_concordance_monitor', () => rulPredictionMlConcordanceMonitor(env));
      break;

    case '30 3 * * *':
      // W129 Fault-Fingerprint Multi-Class ML Model class-drift scan.
      await safe('fault_fingerprint_ml_class_drift_scan', () => faultFingerprintMlClassDriftScan(env));
      break;

    case '15 4 * * *':
      // W130 NTT Comparison Battery NIGHTLY CYCLE RUNNER.
      await safe('ntt_comparison_battery_nightly_cycle_runner_4', () =>
        nttComparisonBatteryNightlyCycleRunner(env as never));
      break;

    case '0 1 1 * *':
      // W130 NTT Comparison Battery CUMULATIVE SAVINGS LEDGER RECONCILIATION (monthly).
      await safe('ntt_comparison_battery_monthly_ledger_reconciliation_1', () =>
        nttComparisonBatteryMonthlyLedgerReconciliation(env as never));
      break;

    case '0 15 * * 5':
      // Friday trading-risk MTD digest.
      await safe('trading_risk_mtd_digest', () => runTradingRiskMtdDigest(env));
      break;

    case '0 6 1 * *':
      // Day 1 of month CPMI-IOSCO PFMI disclosure sweep.
      await safe('pfmi_disclosure_sweep', () => runPfmiDisclosureSweep(env));
      break;

    case '0 18 * * *':
      // W111 P&L attribution T+1 EOD opener.
      await safe('pnl_attribution_t1_eod_opener', () => pnlAttributionT1EodOpener(env));
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
