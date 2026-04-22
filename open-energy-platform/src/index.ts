// Open Energy Platform — Main Entry Point
import { Hono } from 'hono';
import { corsMiddleware, securityHeaders, rateLimitMiddleware, requestLogger } from './middleware/security';
import { idempotency } from './middleware/idempotency';
import { optionalAuth } from './middleware/auth';
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
import funderRoutes from './routes/funder';
import regulatorRoutes from './routes/regulator';
import reportsRoutes from './routes/reports';
import telemetryRoutes from './routes/telemetry';
import monitoringRoutes from './routes/monitoring';
import { logger } from './utils/logger';

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
app.route('/api/funder', funderRoutes);
app.route('/api/regulator', regulatorRoutes);
app.route('/api/reports', reportsRoutes);
app.route('/api/telemetry', telemetryRoutes);
app.route('/api/admin/monitoring', monitoringRoutes);

// Static assets (SPA shell, JS, CSS, images) are served by Cloudflare Pages directly.
// This Worker / Pages Function only handles API routes under /api/*.

// Error handling — emit a structured log + persist to error_log so the
// /admin/monitoring console can surface the crash to operators. Response
// includes req_id so users / support can correlate back to the log line.
app.onError((err, c) => {
  const reqId = (c.get('requestId') as string | undefined) ||
    `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  const auth = c.get('auth') as { user?: { id?: string }; tenant_id?: string } | undefined;

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

  // Best-effort DB write — never mask the original error.
  try {
    const id = `errlog_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    const write = c.env.DB.prepare(
      `INSERT INTO error_log
         (id, req_id, source, severity, route, method, status,
          participant_id, tenant_id, error_name, error_message,
          error_stack, user_agent, ip, url)
       VALUES (?, ?, 'server', 'error', ?, ?, 500, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        id,
        reqId,
        c.req.path,
        c.req.method,
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

  return c.json(
    { error: 'Internal Server Error', message: err.message, req_id: reqId },
    500,
  );
});

app.notFound((c) => {
  return c.text('Not Found', 404);
});

export default app;
