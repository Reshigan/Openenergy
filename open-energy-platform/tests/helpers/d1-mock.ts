// Minimal in-memory D1Database stub, scoped to the SQL shapes our util
// modules actually execute. We intentionally do NOT implement a SQL parser;
// instead we pattern-match the known queries emitted by src/utils/* and
// src/middleware/* and mutate an in-memory table map accordingly. If a test
// exercises a new query shape, extend the switch below.

type Row = Record<string, unknown>;

export interface MockDBOptions {
  nowIso?: () => string;
}

export class MockD1 {
  public tables: Record<string, Row[]> = {};
  public executed: { sql: string; bindings: unknown[] }[] = [];
  private opts: MockDBOptions;

  constructor(opts: MockDBOptions = {}) {
    this.opts = opts;
  }

  private now(): string {
    return (this.opts.nowIso ? this.opts.nowIso() : new Date().toISOString());
  }

  private table(name: string): Row[] {
    if (!this.tables[name]) this.tables[name] = [];
    return this.tables[name];
  }

  prepare(sql: string) {
    return new MockPreparedStatement(this, sql);
  }

  // Called by prepared statements.
  run(sql: string, bindings: unknown[]): { meta: { changes: number } } {
    this.executed.push({ sql, bindings });
    const trimmed = sql.replace(/\s+/g, ' ').trim();

    // INSERT OR IGNORE INTO advisory_locks
    if (/INSERT OR IGNORE INTO advisory_locks/i.test(trimmed)) {
      const [key, holderId, expiresAt, context] = bindings as [string, string, string, string | null];
      const t = this.table('advisory_locks');
      if (t.find((r) => r.lock_key === key)) return { meta: { changes: 0 } };
      t.push({
        lock_key: key,
        holder_id: holderId,
        acquired_at: this.now(),
        expires_at: expiresAt,
        context,
      });
      return { meta: { changes: 1 } };
    }

    // UPDATE advisory_locks ... WHERE lock_key = ? AND expires_at < datetime('now')
    if (/UPDATE advisory_locks SET holder_id/i.test(trimmed)) {
      const [holderId, expiresAt, context, key] = bindings as [string, string, string | null, string];
      const t = this.table('advisory_locks');
      const existing = t.find((r) => r.lock_key === key);
      if (!existing) return { meta: { changes: 0 } };
      if (new Date(String(existing.expires_at)) >= new Date(this.now())) {
        return { meta: { changes: 0 } };
      }
      existing.holder_id = holderId;
      existing.expires_at = expiresAt;
      existing.context = context;
      existing.acquired_at = this.now();
      return { meta: { changes: 1 } };
    }

    // DELETE FROM advisory_locks WHERE lock_key = ? AND holder_id = ?
    if (/DELETE FROM advisory_locks/i.test(trimmed)) {
      const [key, holderId] = bindings as [string, string];
      const t = this.table('advisory_locks');
      const before = t.length;
      this.tables['advisory_locks'] = t.filter(
        (r) => !(r.lock_key === key && r.holder_id === holderId),
      );
      return { meta: { changes: before - this.tables['advisory_locks'].length } };
    }

    // INSERT INTO sessions
    if (/INSERT INTO sessions/i.test(trimmed)) {
      const [id, participant_id, access_jti, refresh_token_hash, issued_at, expires_at, refresh_expires_at, last_used_at, user_agent, ip] = bindings as string[];
      this.table('sessions').push({
        id, participant_id, access_jti, refresh_token_hash, issued_at, expires_at,
        refresh_expires_at, last_used_at, user_agent, ip, revoked_at: null, revoked_reason: null,
      });
      return { meta: { changes: 1 } };
    }

    // UPDATE sessions SET access_jti = ? (rotate)
    if (/UPDATE sessions\s+SET access_jti/i.test(trimmed)) {
      const [access_jti, refresh_hash, expires_at, refresh_expires_at, last_used_at, id] = bindings as string[];
      const row = this.table('sessions').find((r) => r.id === id);
      if (!row) return { meta: { changes: 0 } };
      row.access_jti = access_jti;
      row.refresh_token_hash = refresh_hash;
      row.expires_at = expires_at;
      row.refresh_expires_at = refresh_expires_at;
      row.last_used_at = last_used_at;
      return { meta: { changes: 1 } };
    }

    // UPDATE sessions SET revoked_at = ?, revoked_reason = ? WHERE refresh_token_hash = ? AND revoked_at IS NULL
    if (/UPDATE sessions SET revoked_at/i.test(trimmed) && /refresh_token_hash/i.test(trimmed)) {
      const [revoked_at, reason, refresh_hash] = bindings as string[];
      const row = this.table('sessions').find(
        (r) => r.refresh_token_hash === refresh_hash && r.revoked_at == null,
      );
      if (!row) return { meta: { changes: 0 } };
      row.revoked_at = revoked_at;
      row.revoked_reason = reason;
      return { meta: { changes: 1 } };
    }

    // UPDATE sessions SET revoked_at = ?, revoked_reason = ? WHERE participant_id = ? AND revoked_at IS NULL
    if (/UPDATE sessions SET revoked_at/i.test(trimmed) && /participant_id/i.test(trimmed)) {
      const [revoked_at, reason, participant_id] = bindings as string[];
      const rows = this.table('sessions').filter((r) => r.participant_id === participant_id && r.revoked_at == null);
      rows.forEach((r) => { r.revoked_at = revoked_at; r.revoked_reason = reason; });
      return { meta: { changes: rows.length } };
    }

    // INSERT INTO password_reset_tokens / email_verification_tokens
    if (/INSERT INTO (password_reset_tokens|email_verification_tokens)/i.test(trimmed)) {
      const m = trimmed.match(/INSERT INTO (password_reset_tokens|email_verification_tokens)/i)!;
      const tbl = m[1];
      if (tbl === 'password_reset_tokens') {
        const [id, participant_id, token_hash, expires_at, requested_ip] = bindings as (string | null)[];
        this.table(tbl).push({ id, participant_id, token_hash, expires_at, requested_ip, used_at: null });
      } else {
        const [id, participant_id, token_hash, expires_at] = bindings as string[];
        this.table(tbl).push({ id, participant_id, token_hash, expires_at, used_at: null });
      }
      return { meta: { changes: 1 } };
    }

    // UPDATE password_reset_tokens / email_verification_tokens SET used_at
    if (/UPDATE (password_reset_tokens|email_verification_tokens) SET used_at/i.test(trimmed)) {
      const m = trimmed.match(/UPDATE (password_reset_tokens|email_verification_tokens)/i)!;
      const tbl = m[1];
      const [used_at, id] = bindings as string[];
      const row = this.table(tbl).find((r) => r.id === id);
      if (!row) return { meta: { changes: 0 } };
      row.used_at = used_at;
      return { meta: { changes: 1 } };
    }

    // INSERT INTO login_attempts
    if (/INSERT INTO login_attempts/i.test(trimmed)) {
      const [id, email, ip, succeeded, reason] = bindings as (string | number | null)[];
      this.table('login_attempts').push({
        id, email, ip, succeeded, reason, attempted_at: this.now(),
      });
      return { meta: { changes: 1 } };
    }

    // INSERT INTO idempotency_keys
    if (/INSERT OR IGNORE INTO idempotency_keys/i.test(trimmed)) {
      const [key, scope, method, path, request_hash, response_status, response_body, expires_at] = bindings as (string | number)[];
      const t = this.table('idempotency_keys');
      if (t.find((r) => r.key === key)) return { meta: { changes: 0 } };
      t.push({ key, scope, method, path, request_hash, response_status, response_body, expires_at });
      return { meta: { changes: 1 } };
    }

    // DELETE FROM idempotency_keys WHERE expires_at < datetime('now')
    if (/DELETE FROM idempotency_keys WHERE expires_at < datetime\('now'\)/i.test(trimmed)) {
      const t = this.table('idempotency_keys');
      const before = t.length;
      this.tables['idempotency_keys'] = t.filter((r) => new Date(String(r.expires_at)) >= new Date(this.now()));
      return { meta: { changes: before - this.tables['idempotency_keys'].length } };
    }

    // INSERT INTO audit_logs
    if (/INSERT INTO audit_logs/i.test(trimmed)) {
      const [id, actor_id, action, entity_type, entity_id, changes_json, created_at] = bindings as (string | null)[];
      this.table('audit_logs').push({
        id, actor_id, action, entity_type, entity_id, changes: changes_json, created_at,
      });
      return { meta: { changes: 1 } };
    }

    // INSERT INTO cascade_dlq
    if (/INSERT INTO cascade_dlq/i.test(trimmed)) {
      const [id, event, entity_type, entity_id, actor_id, payload, stage, error_message, error_stack, attempt_count] = bindings as (string | number | null)[];
      this.table('cascade_dlq').push({
        id, event, entity_type, entity_id, actor_id, payload, stage,
        error_message, error_stack, attempt_count, status: 'pending',
        resolved_at: null, resolved_by: null, resolution_note: null, last_attempt_at: null,
      });
      return { meta: { changes: 1 } };
    }

    // UPDATE cascade_dlq ... resolved / attempt bump
    if (/UPDATE cascade_dlq/i.test(trimmed)) {
      // Last binding is always the id.
      const bs = bindings as (string | null)[];
      const id = bs[bs.length - 1];
      const row = this.table('cascade_dlq').find((r) => r.id === id);
      if (!row) return { meta: { changes: 0 } };
      if (/SET status = 'resolved'/i.test(trimmed)) {
        const [operatorId] = bs as string[];
        row.status = 'resolved';
        row.resolved_at = this.now();
        row.resolved_by = operatorId;
        row.last_attempt_at = this.now();
        row.attempt_count = Number(row.attempt_count) + 1;
        return { meta: { changes: 1 } };
      }
      if (/SET status = \?/i.test(trimmed)) {
        // resolveDlqItem branch
        const [status, operatorId, note] = bs as string[];
        if (row.status !== 'pending') return { meta: { changes: 0 } };
        row.status = status;
        row.resolved_at = this.now();
        row.resolved_by = operatorId;
        row.resolution_note = note;
        return { meta: { changes: 1 } };
      }
      if (/SET last_attempt_at/i.test(trimmed)) {
        const [msg] = bs as string[];
        row.last_attempt_at = this.now();
        row.attempt_count = Number(row.attempt_count) + 1;
        row.error_message = msg;
        return { meta: { changes: 1 } };
      }
    }

    // Fallback: record the query so tests can assert on it even if we don't simulate it.
    return { meta: { changes: 0 } };
  }

  first(sql: string, bindings: unknown[]): Row | null {
    this.executed.push({ sql, bindings });
    const trimmed = sql.replace(/\s+/g, ' ').trim();

    // SELECT id, participant_id, refresh_expires_at, revoked_at FROM sessions WHERE refresh_token_hash = ?
    if (/FROM sessions WHERE refresh_token_hash/i.test(trimmed)) {
      const [hash] = bindings as string[];
      const row = this.table('sessions').find((r) => r.refresh_token_hash === hash);
      if (!row) return null;
      return {
        id: row.id,
        participant_id: row.participant_id,
        refresh_expires_at: row.refresh_expires_at,
        revoked_at: row.revoked_at,
      };
    }

    // SELECT ... FROM password_reset_tokens WHERE token_hash = ?
    if (/FROM password_reset_tokens WHERE token_hash/i.test(trimmed)) {
      const [hash] = bindings as string[];
      const row = this.table('password_reset_tokens').find((r) => r.token_hash === hash);
      return row || null;
    }

    // SELECT ... FROM email_verification_tokens WHERE token_hash = ?
    if (/FROM email_verification_tokens WHERE token_hash/i.test(trimmed)) {
      const [hash] = bindings as string[];
      const row = this.table('email_verification_tokens').find((r) => r.token_hash === hash);
      return row || null;
    }

    // SELECT COUNT(*) AS n, MAX(attempted_at) ... FROM login_attempts WHERE email = ? AND succeeded = 0 AND attempted_at >= ?
    if (/FROM login_attempts WHERE email = \? AND succeeded = 0/i.test(trimmed)) {
      const [email, since] = bindings as string[];
      const rows = this.table('login_attempts').filter(
        (r) =>
          r.email === email &&
          Number(r.succeeded) === 0 &&
          String(r.attempted_at) >= since,
      );
      const last = rows.reduce<string | null>(
        (acc, r) => (acc == null || String(r.attempted_at) > acc ? String(r.attempted_at) : acc),
        null,
      );
      return { n: rows.length, last_failed: last };
    }

    // SELECT ... FROM cascade_dlq WHERE id = ?
    if (/FROM cascade_dlq WHERE id/i.test(trimmed)) {
      const [id] = bindings as string[];
      return this.table('cascade_dlq').find((r) => r.id === id) || null;
    }

    // SELECT request_hash, response_status, response_body, scope FROM idempotency_keys WHERE key = ?
    if (/FROM idempotency_keys WHERE key/i.test(trimmed)) {
      const [key] = bindings as string[];
      const row = this.table('idempotency_keys').find((r) => r.key === key);
      return row || null;
    }

    return null;
  }
}

class MockPreparedStatement {
  constructor(private db: MockD1, private sql: string, private bindings: unknown[] = []) {}

  bind(...args: unknown[]): MockPreparedStatement {
    return new MockPreparedStatement(this.db, this.sql, args);
  }

  async run() {
    return this.db.run(this.sql, this.bindings);
  }

  async first<T = Row>(): Promise<T | null> {
    return (this.db.first(this.sql, this.bindings) as T) || null;
  }

  async all<T = Row>(): Promise<{ results: T[] }> {
    return { results: [] };
  }
}

export function mockEnv(db: MockD1): any {
  return { DB: db };
}
