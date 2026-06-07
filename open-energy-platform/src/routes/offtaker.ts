// ═══════════════════════════════════════════════════════════════════════════
// Offtaker delivery points CRUD (PR-Prod-Role-CRUD).
//
// A delivery point is a metered consumption site for an offtaker. These are
// the anchor for the bill → mix → LOI flow: the offtaker enumerates their
// sites once, then bill uploads and LOIs reference the site by id.
//
// Access model:
//   - Every row is scoped to participant_id. A participant only sees their
//     own rows. admin + support see all.
//   - Only offtaker/admin can mutate; support is intentionally read-only
//     to match the rest of the platform's support policy.
// ═══════════════════════════════════════════════════════════════════════════
import { Hono } from 'hono';
import { HonoEnv } from '../utils/types';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { fireCascade } from '../utils/cascade';
import { buildOfftakerOptions } from '../utils/offtaker-options';

const offtaker = new Hono<HonoEnv>();

offtaker.use('*', authMiddleware);

function canReadAll(role: string): boolean {
  return role === 'admin' || role === 'support';
}

function canWrite(role: string): boolean {
  return role === 'offtaker' || role === 'admin';
}

// ─── GET /offtaker/delivery-points ────────────────────────────────────────
offtaker.get('/delivery-points', async (c) => {
  const user = getCurrentUser(c);
  const status = c.req.query('status');
  const pid = c.req.query('participant_id');

  const where: string[] = [];
  const binds: (string | number)[] = [];
  if (!canReadAll(user.role)) {
    where.push('participant_id = ?');
    binds.push(user.id);
  } else if (pid) {
    where.push('participant_id = ?');
    binds.push(pid);
  }
  if (status) {
    where.push('status = ?');
    binds.push(status);
  }
  const sql = `SELECT * FROM offtaker_delivery_points ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY created_at DESC`;
  const res = await c.env.DB.prepare(sql).bind(...binds).all();
  return c.json({ success: true, data: res.results ?? [] });
});

// ─── GET /offtaker/delivery-points/:id ────────────────────────────────────
offtaker.get('/delivery-points/:id', async (c) => {
  const user = getCurrentUser(c);
  const id = c.req.param('id');
  const row = await c.env.DB
    .prepare('SELECT * FROM offtaker_delivery_points WHERE id = ?')
    .bind(id).first() as Record<string, unknown> | null;
  if (!row) return c.json({ success: false, error: 'Delivery point not found' }, 404);
  if (!canReadAll(user.role) && row.participant_id !== user.id) {
    return c.json({ success: false, error: 'Not authorised' }, 403);
  }
  return c.json({ success: true, data: row });
});

// ─── POST /offtaker/delivery-points ────────────────────────────────────────
offtaker.post('/delivery-points', async (c) => {
  const user = getCurrentUser(c);
  if (!canWrite(user.role)) return c.json({ success: false, error: 'Not authorised' }, 403);
  const body = await c.req.json().catch(() => ({})) as Record<string, unknown>;
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name) return c.json({ success: false, error: 'name is required' }, 400);

  const id = 'dp_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const now = new Date().toISOString();
  await c.env.DB
    .prepare(`
      INSERT INTO offtaker_delivery_points
        (id, participant_id, name, location, meter_id, voltage_kv, nmd_kva,
         annual_kwh, tariff_category, notes, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)
    `)
    .bind(
      id,
      user.id,
      name,
      (body.location as string) || null,
      (body.meter_id as string) || null,
      body.voltage_kv != null ? Number(body.voltage_kv) : null,
      body.nmd_kva != null ? Number(body.nmd_kva) : null,
      body.annual_kwh != null ? Number(body.annual_kwh) : null,
      (body.tariff_category as string) || null,
      (body.notes as string) || null,
      now,
      now,
    )
    .run();

  const row = await c.env.DB
    .prepare('SELECT * FROM offtaker_delivery_points WHERE id = ?')
    .bind(id).first();
  await fireCascade({
    event: 'offtaker.delivery_point_created',
    actor_id: user.id,
    entity_type: 'offtaker_delivery_point',
    entity_id: id,
    data: {
      id, name, participant_id: user.id,
      meter_id: (body.meter_id as string) || null,
      annual_kwh: body.annual_kwh != null ? Number(body.annual_kwh) : null,
    },
    env: c.env,
  });
  return c.json({ success: true, data: row }, 201);
});

// ─── PUT /offtaker/delivery-points/:id ────────────────────────────────────
offtaker.put('/delivery-points/:id', async (c) => {
  const user = getCurrentUser(c);
  if (!canWrite(user.role)) return c.json({ success: false, error: 'Not authorised' }, 403);
  const id = c.req.param('id');
  const existing = await c.env.DB
    .prepare('SELECT participant_id FROM offtaker_delivery_points WHERE id = ?')
    .bind(id).first() as { participant_id?: string } | null;
  if (!existing) return c.json({ success: false, error: 'Delivery point not found' }, 404);
  if (user.role !== 'admin' && existing.participant_id !== user.id) {
    return c.json({ success: false, error: 'Not authorised' }, 403);
  }
  const body = await c.req.json().catch(() => ({})) as Record<string, unknown>;
  const allowed = ['name', 'location', 'meter_id', 'voltage_kv', 'nmd_kva', 'annual_kwh', 'tariff_category', 'notes', 'status'] as const;
  const sets: string[] = [];
  const binds: (string | number | null)[] = [];
  for (const k of allowed) {
    if (k in body) {
      sets.push(`${k} = ?`);
      const v = body[k];
      binds.push(v == null ? null : (typeof v === 'number' ? v : String(v)));
    }
  }
  if (sets.length === 0) return c.json({ success: false, error: 'No valid fields to update' }, 400);
  sets.push('updated_at = ?');
  binds.push(new Date().toISOString());
  binds.push(id);
  await c.env.DB
    .prepare(`UPDATE offtaker_delivery_points SET ${sets.join(', ')} WHERE id = ?`)
    .bind(...binds)
    .run();
  const row = await c.env.DB
    .prepare('SELECT * FROM offtaker_delivery_points WHERE id = ?')
    .bind(id).first();
  await fireCascade({
    event: 'offtaker.delivery_point_updated',
    actor_id: user.id,
    entity_type: 'offtaker_delivery_point',
    entity_id: String(id),
    data: {
      id,
      edited_fields: sets.map((s) => s.split(' = ')[0]).filter((s) => s !== 'updated_at'),
      updated_by: user.id,
    },
    env: c.env,
  });
  return c.json({ success: true, data: row });
});

// ─── DELETE /offtaker/delivery-points/:id ─────────────────────────────────
offtaker.delete('/delivery-points/:id', async (c) => {
  const user = getCurrentUser(c);
  if (!canWrite(user.role)) return c.json({ success: false, error: 'Not authorised' }, 403);
  const id = c.req.param('id');
  const existing = await c.env.DB
    .prepare('SELECT participant_id FROM offtaker_delivery_points WHERE id = ?')
    .bind(id).first() as { participant_id?: string } | null;
  if (!existing) return c.json({ success: false, error: 'Delivery point not found' }, 404);
  if (user.role !== 'admin' && existing.participant_id !== user.id) {
    return c.json({ success: false, error: 'Not authorised' }, 403);
  }
  await c.env.DB.prepare('DELETE FROM offtaker_delivery_points WHERE id = ?').bind(id).run();
  await fireCascade({
    event: 'offtaker.delivery_point_deleted',
    actor_id: user.id,
    entity_type: 'offtaker_delivery_point',
    entity_id: String(id),
    data: { id, deleted_by: user.id },
    env: c.env,
  });
  return c.json({ success: true, data: { id, deleted: true } });
});

// ─── GET /offtaker/options ──────────────────────────────────────────────────
// Procurement options for the calling offtaker: marketplace listings available
// now + upcoming IPP projects, each scored vs the bill profile. Reads the named
// bill (?bill_id=) or the latest one; falls back to demo defaults so the view is
// never blank. Mirrors the bill-profile read in POST /api/ai/offtaker/optimize.
offtaker.get('/options', async (c) => {
  const user = getCurrentUser(c);
  const billId = c.req.query('bill_id');

  let profile: Record<string, unknown> | undefined;
  try {
    if (billId) {
      const row = await c.env.DB.prepare(
        `SELECT ai_result_json FROM offtaker_bills WHERE id = ? AND offtaker_id = ?`,
      ).bind(billId, user.id).first<{ ai_result_json: string }>();
      if (row?.ai_result_json) { try { profile = JSON.parse(row.ai_result_json); } catch { /* ignore */ } }
    }
    if (!profile) {
      const row = await c.env.DB.prepare(
        `SELECT ai_result_json FROM offtaker_bills WHERE offtaker_id = ? ORDER BY created_at DESC LIMIT 1`,
      ).bind(user.id).first<{ ai_result_json: string }>();
      if (row?.ai_result_json) { try { profile = JSON.parse(row.ai_result_json); } catch { /* ignore */ } }
    }
  } catch { /* offtaker_bills may not exist until a first upload — fall to defaults */ }

  const annual_kwh = Number(profile?.annual_kwh ?? 1_200_000);
  const avg_tariff_zar_per_kwh = Number(profile?.avg_tariff_zar_per_kwh ?? 2.15);

  const options = await buildOfftakerOptions(c.env, user.id, { annual_kwh, avg_tariff_zar_per_kwh });
  return c.json({ success: true, data: options });
});

export default offtaker;
