// ═══════════════════════════════════════════════════════════════════════════
// Telemetry Routes — client-side error reporting.
// ═══════════════════════════════════════════════════════════════════════════
// Browsers post unhandled React errors (via ErrorBoundary) and global
// window.onerror / unhandledrejection events here. Rows land in error_log
// with source='client' so operators can correlate frontend crashes with
// backend logs via req_id / participant_id.
//
// Auth is OPTIONAL: the shell may render before the user logs in, and
// crash reports from the /login page are still useful. optionalAuth runs
// globally before this handler, so authenticated callers get tagged;
// anonymous callers get participant_id = null.
// ═══════════════════════════════════════════════════════════════════════════

import { Hono } from 'hono';
import { HonoEnv } from '../utils/types';
import { logger } from '../utils/logger';

const telemetry = new Hono<HonoEnv>();

interface ClientErrorBody {
  route?: string;
  url?: string;
  error_name?: string;
  error_message?: string;
  error_stack?: string;
  user_agent?: string;
  severity?: 'info' | 'warn' | 'error' | 'fatal';
}

// Clamp untrusted user input so a rogue client can't flood our DB.
function clamp(v: unknown, max: number): string | null {
  if (typeof v !== 'string' || v.length === 0) return null;
  return v.length > max ? v.slice(0, max) : v;
}

telemetry.post('/error', async (c) => {
  let body: ClientErrorBody;
  try {
    body = await c.req.json<ClientErrorBody>();
  } catch {
    return c.json({ success: false, error: 'Invalid JSON body' }, 400);
  }

  const reqId = c.get('requestId') as string | undefined;
  const auth = c.get('auth') as { user?: { id?: string }; tenant_id?: string } | undefined;
  const id = `errlog_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  const severity = ['info', 'warn', 'error', 'fatal'].includes(body.severity || '')
    ? body.severity!
    : 'error';

  try {
    await c.env.DB.prepare(
      `INSERT INTO error_log
         (id, req_id, source, severity, route, method, status,
          participant_id, tenant_id, error_name, error_message,
          error_stack, user_agent, ip, url)
       VALUES (?, ?, 'client', ?, ?, NULL, NULL, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        id,
        reqId || null,
        severity,
        clamp(body.route, 500),
        auth?.user?.id || null,
        auth?.tenant_id || null,
        clamp(body.error_name, 200),
        clamp(body.error_message, 2000),
        clamp(body.error_stack, 8000),
        clamp(body.user_agent, 500) || c.req.header('User-Agent') || null,
        c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For') || null,
        clamp(body.url, 1000),
      )
      .run();
  } catch (err) {
    // If the insert itself fails we still want the server log to capture it.
    logger.error('telemetry_insert_failed', {
      req_id: reqId,
      error_message: (err as Error).message,
    });
    return c.json({ success: false, error: 'Failed to record telemetry' }, 500);
  }

  logger.warn('client_error', {
    req_id: reqId,
    participant_id: auth?.user?.id,
    route: body.route,
    error_name: body.error_name,
    error_message: body.error_message,
  });

  return c.json({ success: true, id, req_id: reqId });
});

export default telemetry;
