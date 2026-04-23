// ═══════════════════════════════════════════════════════════════════════════
// A D1-compatible façade over an in-memory SQLite (better-sqlite3). Unlike
// the pattern-matched MockD1, this one runs the actual SQL so integration
// tests can drive the Hono sub-apps end-to-end.
//
// Lifecycle:
//   const db = createTestDb({ applyMigrations: true });
//   const env = envFor(db);
//   // ... use env.DB in any route handler
//   db.close();
//
// We apply migrations 001..latest in order, skipping any that reference
// features we don't emulate (seed files are optional via the `seed: true`
// flag).
// ═══════════════════════════════════════════════════════════════════════════

import Database from 'better-sqlite3';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface TestDbOptions {
  /** If true, apply migrations/*.sql in lexicographic order. */
  applyMigrations?: boolean;
  /** If true, run the seed migrations (003, 005, 009, 030) — requires applyMigrations. */
  seed?: boolean;
}

export function createTestDb(opts: TestDbOptions = {}): Database.Database {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = OFF'); // match D1 default — many migrations would violate otherwise
  db.pragma('journal_mode = MEMORY');

  if (opts.applyMigrations) {
    const dir = join(__dirname, '..', '..', 'migrations');
    const all = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
    const files = opts.seed
      ? all
      : all.filter((f) => !/_seed\.sql$|_seed_/i.test(f));
    for (const f of files) {
      const sql = readFileSync(join(dir, f), 'utf8');
      try {
        db.exec(sql);
      } catch (err) {
        // Make failure loud so tests fail fast at setup rather than later
        // with a cryptic missing-table error.
        throw new Error(`Migration ${f} failed: ${(err as Error).message}`);
      }
    }
  }
  return db;
}

/** Build a D1-shaped `env` that routes to the better-sqlite3 db. */
export function envFor(db: Database.Database) {
  return {
    DB: d1Facade(db),
    KV: kvStub(),
    R2: r2Stub(),
    JWT_SECRET: 'test-secret',
  } as unknown as Record<string, unknown>;
}

// ───────────────────────────────────────────────────────────────────────────
// D1 façade — implements the subset of the D1 API our routes actually use:
//   prepare(sql).bind(...).run() | .first() | .all()
//   batch() is not implemented (none of the national-scale routes use it)
// ───────────────────────────────────────────────────────────────────────────
function d1Facade(db: Database.Database) {
  return {
    prepare(sql: string) {
      return {
        _bindings: [] as unknown[],
        bind(...args: unknown[]) {
          this._bindings = args;
          return this;
        },
        async run() {
          const stmt = db.prepare(sql);
          const info = stmt.run(...this._bindings);
          return { meta: { changes: info.changes, last_row_id: info.lastInsertRowid } };
        },
        async first<T = Record<string, unknown>>(): Promise<T | null> {
          const stmt = db.prepare(sql);
          return (stmt.get(...this._bindings) as T | undefined) ?? null;
        },
        async all<T = Record<string, unknown>>(): Promise<{ results: T[] }> {
          const stmt = db.prepare(sql);
          return { results: stmt.all(...this._bindings) as T[] };
        },
      };
    },
    batch() {
      throw new Error('batch() is not implemented in the test D1 façade');
    },
  };
}

function kvStub() {
  const store = new Map<string, string>();
  return {
    async get(key: string, type?: 'json') {
      const v = store.get(key);
      if (v == null) return null;
      return type === 'json' ? JSON.parse(v) : v;
    },
    async put(key: string, value: string) {
      store.set(key, value);
    },
    async delete(key: string) {
      store.delete(key);
    },
  };
}

function r2Stub() {
  const store = new Map<string, string>();
  return {
    async get(key: string) {
      const v = store.get(key);
      return v == null ? null : { text: async () => v };
    },
    async put(key: string, value: string) {
      store.set(key, value);
    },
    async delete(key: string) {
      store.delete(key);
    },
  };
}

/** Sign a test JWT that the middleware will accept. */
export async function testJwtFor(
  db: Database.Database,
  participantId: string,
  opts: { email?: string; role?: string; name?: string } = {},
): Promise<string> {
  // Ensure the participant row exists (auth middleware joins on it).
  const existing = db.prepare('SELECT id FROM participants WHERE id = ?').get(participantId);
  if (!existing) {
    db.prepare(
      `INSERT INTO participants (id, email, password_hash, name, role, status, kyc_status, subscription_tier)
       VALUES (?, ?, 'pbkdf2$sha256$100000$c2FsdA==$ZXhwZWN0ZWQ=', ?, ?, 'active', 'approved', 'enterprise')`,
    ).run(participantId, opts.email || `${participantId}@test`, opts.name || participantId, opts.role || 'admin');
  }

  // Import signToken the same way routes do. Test runs in Node; Web Crypto
  // is available via the global crypto namespace in Node ≥ 20.
  const { signToken } = await import('../../src/middleware/auth');
  return signToken(
    {
      sub: participantId,
      email: opts.email || `${participantId}@test`,
      role: (opts.role as 'admin') || 'admin',
      name: opts.name || participantId,
    },
    'test-secret',
    { expiresInSeconds: 3600 },
  );
}

/** Small helper for Hono tests — `await call(app, env, 'GET', '/foo', { token })`. */
export async function call<E extends Record<string, unknown>>(
  app: { fetch: (req: Request, env: E) => Response | Promise<Response> },
  env: E,
  method: string,
  path: string,
  opts: { token?: string; body?: unknown } = {},
): Promise<{ status: number; json: unknown; text: string }> {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (opts.token) headers['authorization'] = `Bearer ${opts.token}`;
  const req = new Request(`http://localhost${path}`, {
    method,
    headers,
    body: opts.body == null ? undefined : JSON.stringify(opts.body),
  });
  const res = await app.fetch(req, env);
  const text = await res.text();
  let json: unknown = null;
  try { json = JSON.parse(text); } catch { /* non-JSON body */ }
  return { status: res.status, json, text };
}
