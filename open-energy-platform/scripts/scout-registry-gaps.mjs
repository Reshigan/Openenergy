// Deterministic scout: for every MERIDIAN_CHAINS block, diff the server's advance
// verbs (route POST /:id/<verb> that call transition() AND appear in spec TRANSITIONS)
// against the verbs the registry actually exposes via actions[]. Output the complete
// missing-verb inventory so we can close the whole long tail in one pass.
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(process.cwd());
const REG = fs.readFileSync(path.join(ROOT, 'src/utils/chain-registry-meridian.ts'), 'utf8');
const MOUNT = fs.readFileSync(path.join(ROOT, 'src/routes/mount-routes.ts'), 'utf8');

// 1. mount-routes: module ident -> file, and prefix -> module ident
const importMap = {}; // ident -> './file'
for (const m of MOUNT.matchAll(/import\s+(\w+)\s*(?:,\s*\{[^}]*\})?\s*from\s+'(\.\/[^']+)'/g)) {
  importMap[m[1]] = m[2];
}
// also named imports: import X, { a as b } from '...'
for (const m of MOUNT.matchAll(/import\s+\w+\s*,\s*\{([^}]*)\}\s*from\s+'(\.\/[^']+)'/g)) {
  for (const part of m[1].split(',')) {
    const am = part.trim().match(/(\w+)\s+as\s+(\w+)/) || part.trim().match(/^(\w+)$/);
    if (am) importMap[am[am.length - 1]] = m[2];
  }
}
// pure-named imports: import { a, b as c } from '...'
for (const m of MOUNT.matchAll(/import\s*\{([^}]*)\}\s*from\s+'(\.\/[^']+)'/g)) {
  for (const part of m[1].split(',')) {
    const am = part.trim().match(/(\w+)\s+as\s+(\w+)/) || part.trim().match(/^(\w+)$/);
    if (am) importMap[am[am.length - 1]] = m[2];
  }
}
const prefixToFile = {}; // '/api/...' -> absolute route file path
for (const m of MOUNT.matchAll(/app\.route\(\s*'([^']+)'\s*,\s*(\w+)\s*\)/g)) {
  const file = importMap[m[2]];
  if (file) prefixToFile[m[1]] = path.join(ROOT, 'src/routes', file.replace(/^\.\//, '') + '.ts');
}

// 2. split registry into chain blocks by `key: '...'`
const keyRe = /\n {4}key:\s*'([a-z0-9_]+)',/g;
const blocks = [];
let km;
const idxs = [];
while ((km = keyRe.exec(REG)) !== null) idxs.push({ key: km[1], start: km.index });
for (let i = 0; i < idxs.length; i++) {
  const start = idxs[i].start;
  const end = i + 1 < idxs.length ? idxs[i + 1].start : REG.length;
  blocks.push({ key: idxs[i].key, text: REG.slice(start, end) });
}

// helper: extract spec TRANSITIONS action keys (snake) from a spec file
function specActions(prefix, key) {
  // try common spec file names derived from key and prefix tail
  const candidates = new Set();
  candidates.add(key.replace(/_/g, '-'));
  candidates.add(key.replace(/_chain$/, '').replace(/_/g, '-'));
  const tail = prefix.replace(/^\/api\//, '').replace(/\/chain$/, '').split('/').pop();
  if (tail) candidates.add(tail);
  for (const base of candidates) {
    const f = path.join(ROOT, 'src/utils', `${base}-spec.ts`);
    if (fs.existsSync(f)) {
      const txt = fs.readFileSync(f, 'utf8');
      const tm = txt.match(/export const TRANSITIONS[^{]*\{([\s\S]*?)\n\}/);
      if (tm) {
        const acts = new Set();
        for (const a of tm[1].matchAll(/^\s*([a-z0-9_]+)\s*:\s*\{/gm)) acts.add(a[1]);
        if (acts.size) return { file: `${base}-spec.ts`, actions: acts };
      }
    }
  }
  return { file: null, actions: null };
}

// helper: route file verbs that call transition(), + WRITE_ROLES
function routeInfo(file) {
  if (!file || !fs.existsSync(file)) return { verbs: null, writeRoles: null };
  const txt = fs.readFileSync(file, 'utf8');
  const verbs = new Map(); // kebab verb -> snake action
  // single & multi-line: app.post('/:id/<verb>' ... transition(c, '<action>'
  for (const m of txt.matchAll(/\.(?:post|put)\(\s*'\/:id\/([a-z0-9-]+)'[\s\S]{0,160}?transition\(\s*c\s*,\s*'([a-z0-9_]+)'/g)) {
    verbs.set(m[1], m[2]);
  }
  let writeRoles = null;
  const wr = txt.match(/WRITE_ROLES\s*=\s*new Set(?:<[^>]*>)?\(\s*\[([^\]]*)\]/);
  if (wr) writeRoles = [...wr[1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1]);
  return { verbs, writeRoles };
}

const report = [];
for (const b of blocks) {
  // exposed verbs = last path segment of every hint path that targets /:id/<verb>
  // (path is the ground-truth endpoint; action: may be snake or kebab, single or double quoted)
  const paths = [...b.text.matchAll(/\bpath:\s*['"]([^'"]+)['"]/g)].map((m) => m[1]);
  const exposed = new Set();
  for (const p of paths) {
    const i = p.indexOf('/:id/');
    if (i > 0) exposed.add(p.slice(i + 5).split('/')[0]);
  }
  // derive prefix (before /:id/) from any hint path
  let prefix = null;
  for (const p of paths) {
    const i = p.indexOf('/:id/');
    if (i > 0) { prefix = p.slice(0, i); break; }
  }
  if (!prefix) { report.push({ key: b.key, note: 'no-path-hints', exposed: [...exposed] }); continue; }
  const file = prefixToFile[prefix];
  const { verbs, writeRoles } = routeInfo(file);
  const spec = specActions(prefix, b.key);
  if (!verbs) { report.push({ key: b.key, prefix, note: 'route-file-not-found', file, exposed: [...exposed] }); continue; }
  // advance verbs = route verbs whose snake action is in spec TRANSITIONS (if spec found)
  let advanceVerbs = [...verbs.keys()];
  if (spec.actions) advanceVerbs = advanceVerbs.filter((v) => spec.actions.has(verbs.get(v)));
  const missing = advanceVerbs.filter((v) => !exposed.has(v));
  report.push({
    key: b.key, prefix, routeFile: file ? path.basename(file) : null,
    specFile: spec.file, writeRoles,
    exposedCount: exposed.size, advanceCount: advanceVerbs.length,
    missing,
  });
}

const gaps = report.filter((r) => r.missing && r.missing.length);
gaps.sort((a, b) => b.missing.length - a.missing.length);
const problems = report.filter((r) => r.note);
console.log(JSON.stringify({
  totalChains: report.length,
  gapChains: gaps.length,
  totalMissingVerbs: gaps.reduce((s, r) => s + r.missing.length, 0),
  problems,
  gaps,
}, null, 2));
