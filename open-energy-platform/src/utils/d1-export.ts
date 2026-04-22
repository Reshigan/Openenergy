// ═══════════════════════════════════════════════════════════════════════════
// D1 Export — dump every user table as SQL INSERT statements for backup to R2.
// ═══════════════════════════════════════════════════════════════════════════
// Cloudflare D1 does not currently expose a streaming export binding to
// Workers/Pages Functions (the REST API route `/accounts/:id/d1/database/:uuid/export`
// is the only first-party option and requires the account API token, which
// we do NOT ship to the Worker). Instead we walk `sqlite_master` ourselves
// and emit a portable SQL dump that can be replayed via `wrangler d1 execute`.
//
// Output format (string → gzipped before upload):
//   PRAGMA foreign_keys=OFF;
//   BEGIN TRANSACTION;
//   -- schema (CREATE TABLE ... statements, verbatim from sqlite_master.sql)
//   -- data (INSERT OR REPLACE INTO … VALUES (…);  one per row)
//   COMMIT;
//
// Size guard: each table is dumped with `LIMIT ? OFFSET ?` so we never
// materialise more than `PAGE_SIZE` rows at a time, keeping the Worker
// well under the 128 MB memory limit. The final dump is a single string
// because R2 put() can accept a ReadableStream but the gzip step is
// cheaper on a finished buffer.
// ═══════════════════════════════════════════════════════════════════════════

export interface DumpOptions {
  /** Rows per page when walking a table. 500 is safe on D1's 10MB response cap. */
  pageSize?: number;
  /** If set, only dump these tables (whitelist). Otherwise dump everything. */
  onlyTables?: string[];
}

export interface DumpResult {
  sql: string;
  tables: { name: string; rows: number }[];
  total_rows: number;
  generated_at: string;
}

type TableMeta = { name: string; sql: string };

function escapeSqlLiteral(value: unknown): string {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return 'NULL';
    return String(value);
  }
  if (typeof value === 'boolean') return value ? '1' : '0';
  if (value instanceof ArrayBuffer) {
    const bytes = new Uint8Array(value);
    let hex = '';
    for (const b of bytes) hex += b.toString(16).padStart(2, '0');
    return `X'${hex}'`;
  }
  const str = typeof value === 'string' ? value : JSON.stringify(value);
  return `'${str.replace(/'/g, "''")}'`;
}

async function listTables(db: D1Database): Promise<TableMeta[]> {
  const rows = await db
    .prepare(
      `SELECT name, sql
         FROM sqlite_master
        WHERE type='table'
          AND name NOT LIKE 'sqlite_%'
          AND name NOT LIKE '_cf_%'
          AND name NOT LIKE 'd1_%'
        ORDER BY name`,
    )
    .all<TableMeta>();
  return (rows.results || []).filter((r) => typeof r.sql === 'string' && r.sql.length > 0);
}

async function listIndexes(db: D1Database): Promise<string[]> {
  const rows = await db
    .prepare(
      `SELECT sql
         FROM sqlite_master
        WHERE type='index'
          AND sql IS NOT NULL
          AND name NOT LIKE 'sqlite_%'
          AND name NOT LIKE '_cf_%'
          AND name NOT LIKE 'd1_%'
        ORDER BY name`,
    )
    .all<{ sql: string }>();
  return (rows.results || []).map((r) => r.sql).filter((s) => !!s);
}

async function dumpTable(
  db: D1Database,
  table: string,
  pageSize: number,
  out: string[],
): Promise<number> {
  // Column order comes from PRAGMA table_info so the INSERT matches schema.
  // SQLite treats PRAGMA table_info(name) identifiers the same as other
  // identifier contexts, so quote with doubled " to preserve names that
  // contain spaces, quotes, or other punctuation. The prior stripping of
  // double-quotes produced broken SQL for non-bareword table names, which
  // caused PRAGMA to return zero columns → dumpTable returned 0 → schema
  // was dumped without data (silent data loss in the backup artifact).
  const quotedPragmaTable = `"${table.replace(/"/g, '""')}"`;
  const colsRes = await db
    .prepare(`PRAGMA table_info(${quotedPragmaTable})`)
    .all<{ name: string }>();
  const cols = (colsRes.results || []).map((c) => c.name);
  if (cols.length === 0) return 0;
  const colList = cols.map((c) => `"${c.replace(/"/g, '""')}"`).join(', ');

  let offset = 0;
  let rows = 0;
  // Escape table name in backticks-like double quotes for safety.
  const quoted = `"${table.replace(/"/g, '""')}"`;
  for (;;) {
    const page = await db
      .prepare(`SELECT * FROM ${quoted} LIMIT ? OFFSET ?`)
      .bind(pageSize, offset)
      .all<Record<string, unknown>>();
    const results = page.results || [];
    if (results.length === 0) break;
    for (const row of results) {
      const values = cols.map((c) => escapeSqlLiteral((row as Record<string, unknown>)[c]));
      out.push(`INSERT OR REPLACE INTO ${quoted} (${colList}) VALUES (${values.join(', ')});`);
    }
    rows += results.length;
    if (results.length < pageSize) break;
    offset += pageSize;
  }
  return rows;
}

/**
 * Export every user-defined table from D1 as a replayable SQL script.
 */
export async function dumpDatabase(db: D1Database, options: DumpOptions = {}): Promise<DumpResult> {
  const pageSize = options.pageSize && options.pageSize > 0 ? options.pageSize : 500;
  const allTables = await listTables(db);
  const targets = options.onlyTables
    ? allTables.filter((t) => options.onlyTables!.includes(t.name))
    : allTables;

  const out: string[] = [];
  out.push(`-- Open Energy Platform D1 backup`);
  out.push(`-- generated_at: ${new Date().toISOString()}`);
  out.push(`PRAGMA foreign_keys=OFF;`);
  out.push(`BEGIN TRANSACTION;`);

  // Schema — drop + recreate each table so a restore is idempotent.
  for (const t of targets) {
    out.push(`DROP TABLE IF EXISTS "${t.name.replace(/"/g, '""')}";`);
    out.push(`${t.sql.trim()};`);
  }

  // Indexes — recreate after the tables exist.
  const indexes = await listIndexes(db);
  for (const idx of indexes) {
    out.push(`${idx.trim()};`);
  }

  // Data.
  const summary: { name: string; rows: number }[] = [];
  let total = 0;
  for (const t of targets) {
    const n = await dumpTable(db, t.name, pageSize, out);
    summary.push({ name: t.name, rows: n });
    total += n;
  }

  out.push(`COMMIT;`);
  out.push(`PRAGMA foreign_keys=ON;`);

  return {
    sql: out.join('\n'),
    tables: summary,
    total_rows: total,
    generated_at: new Date().toISOString(),
  };
}

/**
 * gzip a string using CompressionStream (supported in Workers runtime).
 */
export async function gzipString(input: string): Promise<Uint8Array> {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(input);
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'));
  const buf = await new Response(stream).arrayBuffer();
  return new Uint8Array(buf);
}
