// Go-live static defect sweep. horizon.ts builds SQL from static MERIDIAN_CHAINS
// literals (table/statusCol/deadlineCol/refCol/titleCol/counterpartyCol/quantumCol);
// a wrong identifier 500s that role's whole Horizon board. Each action.path must
// resolve to a mounted route or the button is dead (404/405). CI (vitest) does not
// exercise every registry path against the live schema, so these are silent.
//
// Deterministic exact-match: builds a table→columns index from migrations/ and a
// mounted-prefix set from mount-routes.ts, then checks every chain + action against
// them. Emits JSON candidate defects grouped by type for downstream adversarial
// verification. Read-only; ground truth from the static literal + on-disk schema.
import { MERIDIAN_CHAINS } from '../src/utils/chain-registry-meridian.ts';
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(import.meta.dirname, '..');
const MIG_DIR = path.join(ROOT, 'migrations');

// ---- 1. table -> Set<column> index from every migration ----
const tableCols = new Map<string, Set<string>>();
const unq = (s: string) => s.replace(/^[`"']|[`"']$/g, '');
const ensure = (t: string) => tableCols.get(t) ?? tableCols.set(t, new Set()).get(t)!;

// split a CREATE TABLE body on top-level commas (respect nested parens)
function splitDefs(body: string): string[] {
  const out: string[] = [];
  let depth = 0, cur = '';
  for (const ch of body) {
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    if (ch === ',' && depth === 0) { out.push(cur); cur = ''; }
    else cur += ch;
  }
  if (cur.trim()) out.push(cur);
  return out;
}
const CONSTRAINT = /^(PRIMARY|FOREIGN|UNIQUE|CHECK|CONSTRAINT|KEY|INDEX)\b/i;

// SQL comments contain commas/parens (e.g. `-- drawn + outstanding (ZAR)`) that
// corrupt the depth scanner and comma splitter; strip them before parsing.
const stripComments = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/--[^\n]*/g, '');

for (const f of fs.readdirSync(MIG_DIR).filter((f) => f.endsWith('.sql'))) {
  const sql = stripComments(fs.readFileSync(path.join(MIG_DIR, f), 'utf8'));
  // CREATE TABLE [IF NOT EXISTS] name ( ...balanced... )
  const re = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([`"]?\w+[`"]?)\s*\(/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(sql))) {
    const tbl = unq(m[1]);
    // capture balanced parens body starting at m.index + m[0].length - 1 (the '(')
    let i = re.lastIndex - 1, depth = 0, start = i;
    for (; i < sql.length; i++) {
      if (sql[i] === '(') depth++;
      else if (sql[i] === ')') { depth--; if (depth === 0) break; }
    }
    const body = sql.slice(start + 1, i);
    const cols = ensure(tbl);
    for (const def of splitDefs(body)) {
      const t = def.trim();
      if (!t || CONSTRAINT.test(t)) continue;
      const name = unq(t.split(/\s+/)[0]);
      if (name) cols.add(name);
    }
  }
  // ALTER TABLE name ADD [COLUMN] col
  const alter = /ALTER\s+TABLE\s+([`"]?\w+[`"]?)\s+ADD\s+(?:COLUMN\s+)?([`"]?\w+[`"]?)/gi;
  while ((m = alter.exec(sql))) ensure(unq(m[1])).add(unq(m[2]));
}

// ---- 2. mounted prefixes from mount-routes.ts ----
const mountSrc = fs.readFileSync(path.join(ROOT, 'src/routes/mount-routes.ts'), 'utf8');
const prefixes: string[] = [];
const pre = /app\.route\(\s*['"`]([^'"`]+)['"`]/g;
let pm: RegExpExecArray | null;
while ((pm = pre.exec(mountSrc))) prefixes.push(pm[1]);
const prefixSet = new Set(prefixes);
const isMounted = (p: string) =>
  [...prefixSet].some((pre) => p === pre || p.startsWith(pre + '/'));

// ---- 3. check every chain ----
type Defect = { kind: string; chain: string; wave: number; detail: string };
const defects: Defect[] = [];
const COL_FIELDS = ['statusCol', 'deadlineCol', 'refCol', 'titleCol', 'counterpartyCol', 'quantumCol'] as const;

for (const c of MERIDIAN_CHAINS as any[]) {
  const cols = tableCols.get(c.table);
  if (!cols) {
    defects.push({ kind: 'MISSING_TABLE', chain: c.key, wave: c.wave, detail: `table ${c.table} not found in migrations` });
  } else {
    for (const field of COL_FIELDS) {
      const col = c[field];
      if (col && !cols.has(col)) {
        defects.push({ kind: 'MISSING_COLUMN', chain: c.key, wave: c.wave, detail: `${field}=${col} not on ${c.table}` });
      }
    }
  }
  if (c.eventsTable && !tableCols.has(c.eventsTable)) {
    defects.push({ kind: 'MISSING_EVENTS_TABLE', chain: c.key, wave: c.wave, detail: `eventsTable ${c.eventsTable} not found` });
  }
  for (const a of c.actions || []) {
    if (a.path && !isMounted(a.path)) {
      defects.push({ kind: 'UNMOUNTED_PATH', chain: c.key, wave: c.wave, detail: `${a.action} -> ${a.path}` });
    }
  }
}

// ---- 4. report ----
const byKind = new Map<string, Defect[]>();
for (const d of defects) (byKind.get(d.kind) ?? byKind.set(d.kind, []).get(d.kind)!).push(d);
console.error(`\n=== registry schema/route sweep — ${defects.length} candidate defects across ${MERIDIAN_CHAINS.length} chains ===`);
console.error(`tables indexed: ${tableCols.size} · mounted prefixes: ${prefixSet.size}\n`);
for (const [kind, list] of [...byKind].sort((a, b) => b[1].length - a[1].length)) {
  console.error(`  ${kind}: ${list.length}`);
}
console.log(JSON.stringify(defects, null, 2));
