// ═══════════════════════════════════════════════════════════════════════════
// Real-time Server-Sent Events — push-channel replacement for UI polling.
//
// Cloudflare Workers supports long-lived streaming Responses. We open a
// ReadableStream, poll the relevant D1 table on a short interval, and emit
// the rows delta since the caller's last cursor. Not true push, but close
// enough at sub-second granularity and safer than WebSockets when the
// caller is behind a proxy that strips Upgrade.
//
// Channels:
//   GET /api/realtime/dispatch-instructions  — caller's pending instructions
//   GET /api/realtime/margin-calls           — caller's open margin calls
//   GET /api/realtime/surveillance-alerts    — regulator only, new alerts
//   GET /api/realtime/action-queue           — caller's action queue
//
// Each stream yields:
//   event: snapshot     → current state (first event)
//   event: delta        → new/changed rows since last tick
//   event: heartbeat    → every 15s keep-alive
//
// Client usage (browser):
//   const src = new EventSource('/api/realtime/margin-calls?token=...')
//   src.addEventListener('delta', e => applyDelta(JSON.parse(e.data)));
// ═══════════════════════════════════════════════════════════════════════════

import { Hono } from 'hono';
import { HonoEnv } from '../utils/types';
import { authMiddleware, getCurrentUser, verifyToken } from '../middleware/auth';

const realtime = new Hono<HonoEnv>();

// Most browsers refuse to set Authorization on EventSource. We accept a
// `?token=` fallback and resolve it via verifyToken(). If the header exists
// it still wins. Either way authMiddleware runs for non-SSE requests.
async function resolveSseUser(c: Parameters<typeof realtime.get>[1] extends (ctx: infer C, ...a: unknown[]) => unknown ? C : never) {
  const headerToken = c.req.header('Authorization')?.replace(/^Bearer /, '');
  const queryToken = c.req.query('token');
  const token = headerToken || queryToken;
  if (!token || !c.env.JWT_SECRET) return null;
  const payload = await verifyToken(token, c.env.JWT_SECRET);
  if (!payload) return null;
  return {
    id: payload.sub,
    email: payload.email,
    role: payload.role,
    name: payload.name,
  };
}

interface ChannelSpec<Row extends Record<string, unknown>> {
  /** Poll the DB for new rows since the given cursor. Returns rows + next cursor. */
  poll(env: HonoEnv['Bindings'], userId: string, role: string, cursor: string | null): Promise<{ rows: Row[]; cursor: string | null }>;
  /** Whether the caller is allowed on this channel. */
  authorised(role: string): boolean;
  /** Polling interval in milliseconds. */
  intervalMs: number;
}

const CHANNELS: Record<string, ChannelSpec<Record<string, unknown>>> = {
  'dispatch-instructions': {
    authorised: () => true,
    intervalMs: 5000,
    async poll(env, userId, role, cursor) {
      const since = cursor || new Date(Date.now() - 60_000).toISOString();
      const where = role === 'grid_operator' || role === 'admin'
        ? 'issued_at > ?'
        : 'participant_id = ? AND issued_at > ?';
      const binds = role === 'grid_operator' || role === 'admin'
        ? [since]
        : [userId, since];
      const rs = await env.DB.prepare(
        `SELECT id, instruction_number, participant_id, instruction_type, status,
                target_mw, effective_from, effective_to, reason, issued_at
           FROM dispatch_instructions WHERE ${where}
          ORDER BY issued_at ASC LIMIT 50`,
      ).bind(...binds).all<Record<string, unknown>>();
      const rows = rs.results || [];
      const last = rows.length ? String(rows[rows.length - 1].issued_at) : cursor;
      return { rows, cursor: last };
    },
  },

  'margin-calls': {
    authorised: () => true,
    intervalMs: 5000,
    async poll(env, userId, role, cursor) {
      const since = cursor || new Date(Date.now() - 60_000).toISOString();
      const where = role === 'admin'
        ? 'as_of > ?'
        : 'participant_id = ? AND as_of > ?';
      const binds = role === 'admin' ? [since] : [userId, since];
      const rs = await env.DB.prepare(
        `SELECT id, participant_id, as_of, exposure_zar, initial_margin_zar,
                posted_collateral_zar, shortfall_zar, due_by, status
           FROM margin_calls WHERE ${where}
          ORDER BY as_of ASC LIMIT 50`,
      ).bind(...binds).all<Record<string, unknown>>();
      const rows = rs.results || [];
      const last = rows.length ? String(rows[rows.length - 1].as_of) : cursor;
      return { rows, cursor: last };
    },
  },

  'surveillance-alerts': {
    authorised: (role) => role === 'regulator' || role === 'admin',
    intervalMs: 10_000,
    async poll(env, _userId, _role, cursor) {
      const since = cursor || new Date(Date.now() - 5 * 60_000).toISOString();
      const rs = await env.DB.prepare(
        `SELECT id, rule_code, participant_id, entity_type, entity_id,
                severity, status, raised_at
           FROM regulator_surveillance_alerts
          WHERE raised_at > ? AND status IN ('open','investigating')
          ORDER BY raised_at ASC LIMIT 50`,
      ).bind(since).all<Record<string, unknown>>();
      const rows = rs.results || [];
      const last = rows.length ? String(rows[rows.length - 1].raised_at) : cursor;
      return { rows, cursor: last };
    },
  },

  'action-queue': {
    authorised: () => true,
    intervalMs: 5000,
    async poll(env, userId, _role, cursor) {
      const since = cursor || new Date(Date.now() - 60_000).toISOString();
      const rs = await env.DB.prepare(
        `SELECT id, type, priority, entity_type, entity_id, title, description,
                status, due_date, created_at
           FROM action_queue
          WHERE assignee_id = ? AND created_at > ? AND status = 'pending'
          ORDER BY created_at ASC LIMIT 50`,
      ).bind(userId, since).all<Record<string, unknown>>();
      const rows = rs.results || [];
      const last = rows.length ? String(rows[rows.length - 1].created_at) : cursor;
      return { rows, cursor: last };
    },
  },
};

realtime.get('/:channel', async (c) => {
  const name = c.req.param('channel');
  const spec = CHANNELS[name];
  if (!spec) return c.json({ success: false, error: `Unknown channel: ${name}` }, 404);

  // Auth: either Authorization header via authMiddleware-style, or ?token=.
  const user = await resolveSseUser(c);
  if (!user) return c.json({ success: false, error: 'Authentication required' }, 401);
  if (!spec.authorised(user.role)) {
    return c.json({ success: false, error: 'Forbidden for this role' }, 403);
  }

  const cursorParam = c.req.query('since') || null;

  // Streaming response. We close after 30 minutes to avoid infinite
  // Workers CPU bills — the client reconnects automatically.
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let cursor: string | null = cursorParam;
      const intervalStart = Date.now();
      const MAX_DURATION_MS = 30 * 60 * 1000;
      const HEARTBEAT_EVERY = 15_000;
      let lastHeartbeat = 0;

      // Initial snapshot.
      const first = await spec.poll(c.env, user.id, user.role, cursor);
      cursor = first.cursor;
      send(controller, encoder, 'snapshot', { rows: first.rows, cursor });

      // Poll loop. Each tick is a new query — small, indexed, bounded at 50 rows.
      while (Date.now() - intervalStart < MAX_DURATION_MS) {
        await new Promise((r) => setTimeout(r, spec.intervalMs));
        try {
          const { rows, cursor: next } = await spec.poll(c.env, user.id, user.role, cursor);
          if (rows.length > 0) {
            cursor = next;
            send(controller, encoder, 'delta', { rows, cursor });
          }
          const now = Date.now();
          if (now - lastHeartbeat >= HEARTBEAT_EVERY) {
            send(controller, encoder, 'heartbeat', { t: new Date().toISOString() });
            lastHeartbeat = now;
          }
        } catch (err) {
          send(controller, encoder, 'error', { message: (err as Error).message });
          break;
        }
      }
      send(controller, encoder, 'close', { reason: 'max_duration' });
      controller.close();
    },
    cancel() {
      // Caller disconnected — nothing to clean up beyond the interval loop,
      // which naturally returns when the controller is closed.
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
});

function send(
  controller: ReadableStreamDefaultController,
  encoder: TextEncoder,
  event: string,
  data: unknown,
): void {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  controller.enqueue(encoder.encode(payload));
}

// List the available channels — useful for the UI to sanity-check before
// opening EventSource and for support diagnostics.
realtime.get('/', authMiddleware, async (c) => {
  const user = getCurrentUser(c);
  return c.json({
    success: true,
    data: Object.entries(CHANNELS).map(([key, spec]) => ({
      channel: key,
      interval_ms: spec.intervalMs,
      authorised: spec.authorised(user.role),
    })),
  });
});

export default realtime;
