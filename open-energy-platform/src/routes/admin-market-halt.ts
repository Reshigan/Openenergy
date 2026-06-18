// ═══════════════════════════════════════════════════════════════════════════
// Market halt control — mounted at /api/admin/market-halt. Admin/regulator only.
//
// Trading reads halts read-only from KV (src/routes/trading.ts:76):
//   key  'market:halt:<energy_type>'  | fallback 'market:halt:_all'
//   value 'closed' | 'halted_market'  | 'halted_instrument'  (anything else ⇒ open)
// pre-trade-guards.ts rejects orders when the resolved market_state is not 'open'.
// Until now nothing WROTE those keys — a halt could only be set out-of-band. This
// route is the operator control surface: list current halts, set one, lift one.
//
// A halt is the single hardest pre-trade gate (it stops every order on a shard),
// so every set/lift fires a cascade (→ audit chain) and carries a structured
// reason. The state string lives in the primary key (so trading reads it with no
// extra lookup); who/why/when lives in a sibling ':meta' key for this surface.
// ═══════════════════════════════════════════════════════════════════════════
import { Hono } from 'hono';
import { HonoEnv } from '../utils/types';
import { ENERGY_TYPES } from '../utils/types';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { fireCascade } from '../utils/cascade';

const r = new Hono<HonoEnv>();
r.use('*', authMiddleware);

// Regulators (FSCA) and platform admins may halt a market. Nobody else.
function canHalt(role: string): boolean { return role === 'admin' || role === 'regulator'; }

// The three values trading.ts recognises. 'open' is not a halt — lifting a halt
// deletes the key rather than writing 'open'.
const HALT_STATES = ['closed', 'halted_market', 'halted_instrument'] as const;
type HaltState = (typeof HALT_STATES)[number];
const HALT_LABEL: Record<HaltState, string> = {
  closed: 'Closed (session ended)',
  halted_market: 'Market-wide halt',
  halted_instrument: 'Instrument halt',
};

// Scope is an energy_type from the static ENERGY_TYPES list, or '_all' for the
// platform-wide fallback halt. Validated against that allow-list before it ever
// touches a KV key — the scope is interpolated into the key name, so it must not
// come from free request input.
const SCOPES = [...ENERGY_TYPES, '_all'];
const haltKey = (scope: string) => `market:halt:${scope}`;
const metaKey = (scope: string) => `market:halt:${scope}:meta`;

type HaltMeta = { reason?: string; actor_id?: string; set_at?: string };

// Read one scope's own halt key + meta. Returns the raw KV state, NOT the
// effective state — the _all overlay is applied by the caller.
async function readScope(env: HonoEnv['Bindings'], scope: string) {
  const state = (await env.KV?.get(haltKey(scope))) as HaltState | null;
  let meta: HaltMeta = {};
  if (state) {
    try { meta = JSON.parse((await env.KV?.get(metaKey(scope))) || '{}'); } catch { meta = {}; }
  }
  return { state, meta };
}

// ─── List current halts ──────────────────────────────────────────────────────
// One row per scope (every energy type + _all). The effective state of a per-type
// market mirrors EXACTLY what trading.ts:76 resolves: the per-type halt wins, and
// the platform-wide _all halt applies ONLY where the per-type key is absent. So a
// solar row reads halted whenever solar OR _all is set — and a per-type lift does
// not show "open" while _all is still live. `via` says which key the halt comes
// from ('self' = its own key, '_all' = inherited), which the UI uses to point the
// Lift action at the right scope and to surface the platform-wide banner.
// Read-only — any authed user sees whether a market is open, but who/why is
// disclosed only to canHalt() roles, and only they can change a halt.
r.get('/', async (c) => {
  const env = c.env;
  const user = getCurrentUser(c);
  const reveal = canHalt(user.role);

  // Resolve the _all fallback once; it overlays every per-type market.
  const all = await readScope(env, '_all');

  const rows = await Promise.all(
    SCOPES.map(async (scope) => {
      const own = scope === '_all' ? all : await readScope(env, scope);
      // Reader semantics: own key wins; _all applies only when own is absent.
      const inherited = scope !== '_all' && !own.state && !!all.state;
      const state = (inherited ? all.state : own.state) as HaltState | null;
      const meta = inherited ? all.meta : own.meta;
      const via: 'self' | '_all' | null = own.state ? 'self' : (inherited ? '_all' : null);
      return {
        scope,
        scope_label: scope === '_all' ? 'All markets' : scope,
        active: !!state,
        state: state || 'open',
        state_label: state && HALT_STATES.includes(state) ? HALT_LABEL[state] : 'Open',
        via,
        reason: state ? (meta.reason || null) : null,
        set_by: reveal && state ? (meta.actor_id || null) : null,
        set_at: state ? (meta.set_at || null) : null,
      };
    }),
  );
  return c.json({
    success: true,
    data: rows,
    all_halted: !!all.state,
    states: HALT_STATES.map((s) => ({ value: s, label: HALT_LABEL[s] })),
    can_halt: reveal,
  });
});

// ─── Set / change a halt ───────────────────────────────────────────────────────
// Body: { scope, state, reason }. scope must be a known market; state one of the
// three halt values; reason is mandatory (this gate stops trading — no silent halts).
r.post('/', async (c) => {
  const user = getCurrentUser(c);
  if (!canHalt(user.role)) return c.json({ success: false, error: 'Admin or regulator only' }, 403);
  if (!c.env.KV) return c.json({ success: false, error: 'KV unavailable' }, 503);

  const body = await c.req.json().catch(() => ({}));
  const scope = String(body.scope || '').trim();
  const state = String(body.state || '').trim();
  const reason = String(body.reason || '').trim();

  if (!SCOPES.includes(scope)) return c.json({ success: false, error: 'Unknown market scope' }, 400);
  if (!HALT_STATES.includes(state as HaltState)) return c.json({ success: false, error: 'Invalid halt state' }, 400);
  if (reason.length < 3) return c.json({ success: false, error: 'A reason is required to halt a market' }, 400);

  const set_at = new Date().toISOString();
  await c.env.KV.put(haltKey(scope), state);
  await c.env.KV.put(metaKey(scope), JSON.stringify({ reason, actor_id: user.id, set_at }));

  await fireCascade({
    event: 'market.halted',
    actor_id: user.id,
    entity_type: 'market',
    entity_id: scope,
    data: { scope, state, state_label: HALT_LABEL[state as HaltState], reason },
    env: c.env,
  });

  return c.json({ success: true, data: { scope, state, reason, set_by: user.id, set_at } });
});

// ─── Lift a halt ───────────────────────────────────────────────────────────────
// Body: { scope }. Deletes the halt + meta keys → trading reads no value → 'open'.
r.post('/lift', async (c) => {
  const user = getCurrentUser(c);
  if (!canHalt(user.role)) return c.json({ success: false, error: 'Admin or regulator only' }, 403);
  if (!c.env.KV) return c.json({ success: false, error: 'KV unavailable' }, 503);

  const body = await c.req.json().catch(() => ({}));
  const scope = String(body.scope || '').trim();
  if (!SCOPES.includes(scope)) return c.json({ success: false, error: 'Unknown market scope' }, 400);

  const prior = await c.env.KV.get(haltKey(scope));
  if (!prior) return c.json({ success: false, error: 'No active halt on that market' }, 400);

  await c.env.KV.delete(haltKey(scope));
  await c.env.KV.delete(metaKey(scope));

  await fireCascade({
    event: 'market.resumed',
    actor_id: user.id,
    entity_type: 'market',
    entity_id: scope,
    data: { scope, prior_state: prior },
    env: c.env,
  });

  return c.json({ success: true, data: { scope, lifted: true, lifted_by: user.id } });
});

export default r;
