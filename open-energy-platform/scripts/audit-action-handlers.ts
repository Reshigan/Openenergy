// Dead-button sweep. The schema sweep confirmed every action.path's PREFIX is
// mounted; this confirms the action's SUB-route (`/:id/<action-kebab>`) resolves to
// a real handler in the mounted module. A mounted prefix with no matching handler
// still 404s the specific button. Deterministic: maps each mounted prefix to its
// module file, extracts that module's route registrations, and checks every action
// path against them. Read-only; ground truth from the static literal + route source.
import { MERIDIAN_CHAINS } from '../src/utils/chain-registry-meridian.ts';
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(import.meta.dirname, '..');
const ROUTES = path.join(ROOT, 'src/routes');
const mountSrc = fs.readFileSync(path.join(ROUTES, 'mount-routes.ts'), 'utf8');

// ---- 1. import ident -> relative module path ----
// Covers BOTH default (`import X from './y'`) and named (`import { X, Y } from './y'`)
// imports — mount-routes.ts uses both, and missing the named form silently drops a
// prefix from prefixToFile, so matchPrefix falls back to the `/api` catch-all and
// misattributes every sub-route to platform-features.ts.
const imports = new Map<string, string>();
for (const m of mountSrc.matchAll(/import\s+(\w+)\s+from\s+['"]\.\/([^'"]+)['"]/g)) {
  imports.set(m[1], m[2]);
}
for (const m of mountSrc.matchAll(/import\s+\{([^}]+)\}\s+from\s+['"]\.\/([^'"]+)['"]/g)) {
  const rel = m[2];
  for (const raw of m[1].split(',')) {
    const id = raw.trim().split(/\s+as\s+/).pop()!.trim();
    if (id) imports.set(id, rel);
  }
}
// ---- 2. mounted prefix -> module file ----
const prefixToFile = new Map<string, string>();
for (const m of mountSrc.matchAll(/app\.route\(\s*['"`]([^'"`]+)['"`]\s*,\s*(\w+)\s*\)/g)) {
  const [, prefix, ident] = m;
  const rel = imports.get(ident);
  if (!rel) continue;
  const cand = [path.join(ROUTES, rel + '.ts'), path.join(ROUTES, rel, 'index.ts')];
  const file = cand.find((f) => fs.existsSync(f));
  if (file) prefixToFile.set(prefix, file);
}

// ---- 3. per module: set of registered sub-paths + whether it nests routers ----
const moduleRoutes = new Map<string, { paths: Set<string>; nested: boolean }>();
function routesFor(file: string) {
  let r = moduleRoutes.get(file);
  if (r) return r;
  const src = fs.readFileSync(file, 'utf8');
  const paths = new Set<string>();
  for (const m of src.matchAll(/\.(get|post|put|patch|delete)\(\s*['"`]([^'"`]+)['"`]/g)) {
    paths.add(m[2]);
  }
  const nested = /\.route\(\s*['"`]/.test(src);
  r = { paths, nested };
  moduleRoutes.set(file, r);
  return r;
}

// Hono-style route match: a registered pattern matches the action sub-path when
// they have equal segment count and each pattern segment is either a `:param`
// wildcard, a `*` catch-all, or an exact literal match. This is how `/:id/:action`
// dispatchers (verb travels in the path param) actually resolve at runtime — an
// exact-string compare misses them and reports false dead buttons.
function honoMatch(pattern: string, sub: string): boolean {
  const ps = pattern.split('/').filter(Boolean);
  const ss = sub.split('/').filter(Boolean);
  if (ps.includes('*')) {
    // catch-all matches the rest; require literal prefix up to the `*`
    const star = ps.indexOf('*');
    if (ss.length < star) return false;
    for (let i = 0; i < star; i++) if (!ps[i].startsWith(':') && ps[i] !== ss[i]) return false;
    return true;
  }
  if (ps.length !== ss.length) return false;
  for (let i = 0; i < ps.length; i++) {
    if (ps[i].startsWith(':')) continue; // param wildcard
    if (ps[i] !== ss[i]) return false;
  }
  return true;
}
const handlerResolves = (paths: Set<string>, sub: string): boolean =>
  paths.has(sub) || [...paths].some((p) => honoMatch(p, sub));

// longest mounted prefix that the action path lives under
function matchPrefix(p: string): string | null {
  let best: string | null = null;
  for (const pre of prefixToFile.keys()) {
    if ((p === pre || p.startsWith(pre + '/')) && (!best || pre.length > best.length)) best = pre;
  }
  return best;
}

type Defect = { kind: string; chain: string; wave: number; detail: string };
const defects: Defect[] = [];
let checked = 0;

for (const c of MERIDIAN_CHAINS as any[]) {
  for (const a of c.actions || []) {
    if (!a.path) continue;
    checked++;
    const pre = matchPrefix(a.path);
    if (!pre) { defects.push({ kind: 'NO_PREFIX', chain: c.key, wave: c.wave, detail: `${a.action} -> ${a.path}` }); continue; }
    const file = prefixToFile.get(pre)!;
    const sub = a.path.slice(pre.length) || '/';
    const { paths, nested } = routesFor(file);
    if (handlerResolves(paths, sub)) continue;    // exact or param-route handler found ✓
    if (nested) { defects.push({ kind: 'NESTED_UNRESOLVED', chain: c.key, wave: c.wave, detail: `${a.action} sub=${sub} in ${path.basename(file)} (module nests routers)` }); continue; }
    defects.push({ kind: 'MISSING_HANDLER', chain: c.key, wave: c.wave, detail: `${a.action} sub=${sub} not registered in ${path.basename(file)}` });
  }
}

const byKind = new Map<string, Defect[]>();
for (const d of defects) (byKind.get(d.kind) ?? byKind.set(d.kind, []).get(d.kind)!).push(d);
console.error(`\n=== action-handler sweep — ${checked} action paths checked, ${defects.length} unresolved ===`);
console.error(`prefixes mapped to files: ${prefixToFile.size}\n`);
for (const [kind, list] of [...byKind].sort((a, b) => b[1].length - a[1].length)) console.error(`  ${kind}: ${list.length}`);
console.log(JSON.stringify(defects, null, 2));
