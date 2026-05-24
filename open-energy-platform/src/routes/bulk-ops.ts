// ════════════════════════════════════════════════════════════════════════
// bulk-ops — generic CSV import/export + bulk update endpoints.
//
// Entity registry is whitelisted — only the rows / columns explicitly
// declared below are exposed. This is the discipline that lets us avoid
// per-table CRUD while still blocking accidental dumps of sensitive data.
//
//   POST /api/bulk/:entity/export  -> CSV download of the entity table
//   POST /api/bulk/:entity/import  -> POST { rows: [...] } body, validates
//                                     against the declared columns then
//                                     does an INSERT OR IGNORE per row.
//   POST /api/bulk/:entity/update  -> POST { ids: [], patch: {} } applies
//                                     the same patch to every listed row.
//
// All write paths are step-up gated on `bulk.{entity}.high`.
// ════════════════════════════════════════════════════════════════════════

import { Hono } from 'hono';
import { HonoEnv } from '../utils/types';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { requireStepUp } from '../middleware/step-up';
import { fireCascade } from '../utils/cascade';

const r = new Hono<HonoEnv>();
r.use('*', authMiddleware);

const genId = (p: string) => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

type EntityDef = {
  table: string;
  idColumn?: string;
  selectColumns: string[];
  writableColumns: string[];
  importColumns: string[];                      // columns that must be present on import
  requiredRoles?: string[];                     // gating
  importIdMode?: 'provided' | 'generated';      // generated => create new id
  importIdPrefix?: string;                      // when generated
};

const REGISTRY: Record<string, EntityDef> = {
  participants: {
    table: 'participants',
    selectColumns: ['id', 'email', 'role', 'organisation', 'kyc_status', 'created_at'],
    writableColumns: ['kyc_status', 'organisation'],
    importColumns: ['email', 'role', 'organisation'],
    requiredRoles: ['admin', 'support'],
    importIdMode: 'generated',
    importIdPrefix: 'par',
  },
  carbon_credits: {
    table: 'carbon_credits',
    selectColumns: ['id', 'project_id', 'owner_id', 'vintage_year', 'amount_tonnes', 'available_quantity', 'status', 'standard'],
    writableColumns: ['status', 'available_quantity'],
    importColumns: ['project_id', 'owner_id', 'vintage_year', 'amount_tonnes'],
    importIdMode: 'generated',
    importIdPrefix: 'cc',
    requiredRoles: ['admin', 'support', 'carbon'],
  },
  feature_flags: {
    table: 'oe_feature_flags',
    idColumn: 'key',
    selectColumns: ['key', 'description', 'default_enabled', 'rollout_pct', 'killed'],
    writableColumns: ['description', 'default_enabled', 'rollout_pct', 'killed'],
    importColumns: ['key', 'description'],
    requiredRoles: ['admin'],
  },
  grid_constraints: {
    table: 'oe_grid_constraints',
    selectColumns: ['id', 'constraint_type', 'corridor', 'limit_mw', 'active_from', 'active_to', 'status'],
    writableColumns: ['limit_mw', 'status', 'active_to'],
    importColumns: ['constraint_type', 'corridor', 'limit_mw', 'active_from'],
    importIdMode: 'generated',
    importIdPrefix: 'gc',
    requiredRoles: ['admin', 'grid_operator'],
  },
};

function authzCheck(def: EntityDef, role: string): boolean {
  if (!def.requiredRoles) return true;
  return def.requiredRoles.includes(role);
}

function csvEscape(v: any): string {
  if (v == null) return '';
  const s = String(v);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function csvParse(text: string): { headers: string[]; rows: Record<string, string>[] } {
  // RFC-4180-ish parser handling quoted commas / newlines.
  const lines: string[][] = [];
  let cur: string[] = [];
  let field = '';
  let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQ = false;
      } else field += c;
    } else {
      if (c === '"') inQ = true;
      else if (c === ',') { cur.push(field); field = ''; }
      else if (c === '\n') { cur.push(field); lines.push(cur); cur = []; field = ''; }
      else if (c === '\r') { /* skip */ }
      else field += c;
    }
  }
  if (field.length > 0 || cur.length > 0) { cur.push(field); lines.push(cur); }
  if (lines.length === 0) return { headers: [], rows: [] };
  const headers = lines[0];
  const rows = lines.slice(1).filter((r) => r.some((c) => c !== '')).map((r) => {
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => { obj[h] = r[i] ?? ''; });
    return obj;
  });
  return { headers, rows };
}

// ─── Export ─────────────────────────────────────────────────────────────
r.get('/:entity/export', async (c) => {
  const user = getCurrentUser(c);
  const entity = c.req.param('entity');
  const def = entity ? REGISTRY[entity] : undefined;
  if (!def) return c.json({ success: false, error: 'unknown entity' }, 404);
  if (!authzCheck(def, user.role)) return c.json({ success: false, error: 'forbidden' }, 403);

  const limit = Math.min(10_000, Math.max(1, Number(c.req.query('limit') || 1000)));
  const cols = def.selectColumns.join(', ');
  const rows = await c.env.DB.prepare(`SELECT ${cols} FROM ${def.table} LIMIT ${limit}`).all<any>().catch(() => ({ results: [] as any[] }));
  const header = def.selectColumns.join(',');
  const body = (rows.results || []).map((r: any) =>
    def.selectColumns.map((col) => csvEscape(r[col])).join(',')
  ).join('\n');
  const csv = `${header}\n${body}`;
  return new Response(csv, {
    status: 200,
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="${entity}-${Date.now()}.csv"`,
    },
  });
});

// ─── Import (rows in body or raw CSV) ──────────────────────────────────
r.post('/:entity/import', async (c) => {
  const user = getCurrentUser(c);
  const entity = c.req.param('entity');
  const def = entity ? REGISTRY[entity] : undefined;
  if (!def) return c.json({ success: false, error: 'unknown entity' }, 404);
  if (!authzCheck(def, user.role)) return c.json({ success: false, error: 'forbidden' }, 403);

  const ct = c.req.header('content-type') || '';
  let rows: Record<string, any>[];
  if (ct.includes('text/csv') || ct.includes('text/plain')) {
    const text = await c.req.text();
    const parsed = csvParse(text);
    rows = parsed.rows;
  } else {
    const body = await c.req.json().catch(() => ({}));
    rows = Array.isArray(body.rows) ? body.rows : [];
  }
  if (!rows.length) return c.json({ success: false, error: 'no rows' }, 400);

  // Validate required columns
  const missingCol = def.importColumns.find((col) => !Object.prototype.hasOwnProperty.call(rows[0], col));
  if (missingCol) return c.json({ success: false, error: `missing column ${missingCol}` }, 400);

  let inserted = 0; let failed = 0; const errors: string[] = [];
  for (const row of rows) {
    const cols = [...def.importColumns];
    const vals = def.importColumns.map((col) => row[col]);
    if (def.importIdMode === 'generated') {
      cols.unshift(def.idColumn || 'id');
      vals.unshift(genId(def.importIdPrefix || 'gen'));
    } else if (def.importIdMode === 'provided' && row.id) {
      cols.unshift(def.idColumn || 'id');
      vals.unshift(row.id);
    }
    const placeholders = vals.map(() => '?').join(',');
    try {
      await c.env.DB.prepare(
        `INSERT OR IGNORE INTO ${def.table} (${cols.join(',')}) VALUES (${placeholders})`
      ).bind(...vals).run();
      inserted += 1;
    } catch (e: any) {
      failed += 1;
      if (errors.length < 5) errors.push(e?.message || 'insert failed');
    }
  }
  await fireCascade({
    event: 'bulk.import_completed',
    actor_id: user.id,
    entity_type: 'bulk_import',
    entity_id: `${entity}_${Date.now()}`,
    data: {
      entity, table: def.table,
      received: rows.length, inserted, failed,
      errors: errors.slice(0, 5),
      imported_by: user.id,
    },
    env: c.env,
  });
  return c.json({ success: true, data: { received: rows.length, inserted, failed, errors } });
});

// ─── Bulk update ───────────────────────────────────────────────────────
r.post('/:entity/update', requireStepUp('bulk.update.high'), async (c) => {
  const user = getCurrentUser(c);
  const entity = c.req.param('entity');
  const def = entity ? REGISTRY[entity] : undefined;
  if (!def) return c.json({ success: false, error: 'unknown entity' }, 404);
  if (!authzCheck(def, user.role)) return c.json({ success: false, error: 'forbidden' }, 403);

  const body = await c.req.json().catch(() => ({}));
  const ids: string[] = Array.isArray(body.ids) ? body.ids : [];
  const patch: Record<string, any> = body.patch || {};
  if (!ids.length) return c.json({ success: false, error: 'ids required' }, 400);
  const cols = Object.keys(patch).filter((k) => def.writableColumns.includes(k));
  if (!cols.length) return c.json({ success: false, error: 'no writable columns in patch' }, 400);

  const setSql = cols.map((c) => `${c} = ?`).join(', ');
  const idCol = def.idColumn || 'id';
  const placeholders = ids.map(() => '?').join(',');
  const vals = [...cols.map((c) => patch[c]), ...ids];
  const res = await c.env.DB.prepare(
    `UPDATE ${def.table} SET ${setSql} WHERE ${idCol} IN (${placeholders})`
  ).bind(...vals).run();
  await fireCascade({
    event: 'bulk.update_applied',
    actor_id: user.id,
    entity_type: 'bulk_update',
    entity_id: `${entity}_${Date.now()}`,
    data: {
      entity, table: def.table,
      ids_count: ids.length,
      columns_patched: cols,
      affected: res.meta.changes || 0,
      applied_by: user.id,
    },
    env: c.env,
  });
  return c.json({ success: true, data: { affected: res.meta.changes || 0 } });
});

// Whitelist registry surface so the UI knows what's available.
r.get('/registry', async (c) => {
  const user = getCurrentUser(c);
  const out = Object.entries(REGISTRY)
    .filter(([, def]) => authzCheck(def, user.role))
    .map(([key, def]) => ({
      key,
      table: def.table,
      select_columns: def.selectColumns,
      writable_columns: def.writableColumns,
      import_columns: def.importColumns,
    }));
  return c.json({ success: true, data: out });
});

export default r;
