// Robust ground-truth audit: for every MERIDIAN_CHAINS block, find every route
// advance-verb (a .post/.put '/:id/<verb>' whose handler body calls the chain's
// transition helper with a string-literal action) and diff against the verbs the
// registry actually exposes via actions[]. Handles BOTH transition conventions:
//   A) transition(c, '<action>', ...)            — action is 2nd arg
//   B) transition(c, id, '<action>', '<to>', ROLES, ...) — action is 3rd arg
// plus captures the per-verb roles argument (file-level WRITE_ROLES OR a per-verb
// *_WRITE_ROLES / inline role list) so generated hints get the correct lane roles.
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(process.cwd());
const REG = fs.readFileSync(path.join(ROOT, 'src/utils/chain-registry-meridian.ts'), 'utf8');
const MOUNT = fs.readFileSync(path.join(ROOT, 'src/routes/mount-routes.ts'), 'utf8');

// ---- mount-routes: prefix -> route file (default, default+named, pure-named) ----
const importMap = {};
for (const m of MOUNT.matchAll(/import\s+(\w+)\s*(?:,\s*\{[^}]*\})?\s*from\s+'(\.\/[^']+)'/g)) importMap[m[1]] = m[2];
for (const m of MOUNT.matchAll(/import\s*\{([^}]*)\}\s*from\s+'(\.\/[^']+)'/g)) {
  for (const part of m[1].split(',')) {
    const am = part.trim().match(/(\w+)\s+as\s+(\w+)/) || part.trim().match(/^(\w+)$/);
    if (am) importMap[am[am.length - 1]] = m[2];
  }
}
const prefixToFile = {};
for (const m of MOUNT.matchAll(/app\.route\(\s*'([^']+)'\s*,\s*(\w+)\s*\)/g)) {
  const f = importMap[m[2]];
  if (f) prefixToFile[m[1]] = path.join(ROOT, 'src/routes', f.replace(/^\.\//, '') + '.ts');
}

// ---- registry blocks ----
const idxs = [];
for (const m of REG.matchAll(/\n {4}key:\s*'([a-z0-9_]+)',/g)) idxs.push({ key: m[1], start: m.index });
const blocks = idxs.map((x, i) => ({ key: x.key, text: REG.slice(x.start, i + 1 < idxs.length ? idxs[i + 1].start : REG.length) }));

// ---- resolve a role-set identifier (or inline list) to role strings ----
function resolveRoles(file, txt, token) {
  if (!token) return null;
  // inline: new Set([...]) or [...]
  const inline = token.match(/\[([^\]]*)\]/);
  if (inline) return [...inline[1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1]);
  // identifier: const TOKEN = new Set([...]) / = [...]
  const idm = token.match(/^[A-Za-z_]\w*$/);
  if (idm) {
    const def = txt.match(new RegExp(`(?:const|let)\\s+${token}\\s*=\\s*(?:new Set(?:<[^>]*>)?\\()?\\s*\\[([^\\]]*)\\]`));
    if (def) return [...def[1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1]);
  }
  return null;
}

// ---- route handler verbs (both conventions) + per-verb roles + fields ----
function routeInfo(file, specActions) {
  if (!file || !fs.existsSync(file)) return null;
  const txt = fs.readFileSync(file, 'utf8');
  // index every route-method declaration to bound handler bodies
  const decls = [...txt.matchAll(/\.(?:post|put|get|delete|patch)\(\s*'([^']*)'/g)]
    .map((m) => ({ idx: m.index, route: m[1] }));
  const verbs = {}; // kebab verb -> { action, roles, fields:[{key,js}] }
  for (let i = 0; i < decls.length; i++) {
    const mm = decls[i].route.match(/^\/:id\/([a-z0-9-]+)$/);
    if (!mm) continue;
    const verb = mm[1];
    const bodyStart = decls[i].idx;
    const bodyEnd = i + 1 < decls.length ? decls[i + 1].idx : txt.length;
    const seg = txt.slice(bodyStart, bodyEnd);
    // find a transition/advance/applyAdvance(...) call and capture its full arg list.
    // Convention A: transition(c, '<action>', ...)  B: transition(c, id, '<action>', ...)
    // C: advance(status, '<action>')  D: applyAdvance(c, user, { action: '<action>', ... })
    const tm = seg.match(/\b(?:applyAdvance|advance|transition)\s*\(([\s\S]*?)\)\s*;/);
    let action = null, rolesToken = null;
    if (tm) {
      const args = tm[1];
      const quoted = [...args.matchAll(/'([a-z0-9_]+)'/g)].map((x) => x[1]);
      // action = first quoted token that is a known spec action (robust to arg position)
      action = quoted.find((q) => specActions && specActions.has(q)) || quoted.find((q) => q !== 'id') || null;
      // roles arg = identifier matching *_ROLES or *_WRITE_ROLES, or inline Set/array
      const rm = args.match(/([A-Z][A-Z0-9_]*ROLES)/) || args.match(/(new Set\([^)]*\)|\[[^\]]*\])/);
      if (rm) rolesToken = rm[1];
    }
    // fields from typeof guards + destructure (whole handler body)
    const fields = []; const seen = new Set();
    for (const m of seg.matchAll(/typeof\s+(?:b|body)\.(\w+)\s*===\s*'(\w+)'/g)) {
      if (!seen.has(m[1])) { seen.add(m[1]); fields.push({ key: m[1], js: m[2] }); }
    }
    for (const m of seg.matchAll(/(?:body|b)\.(\w+)/g)) {
      if (!seen.has(m[1]) && m[1] !== 'json') { seen.add(m[1]); fields.push({ key: m[1], js: 'string' }); }
    }
    verbs[verb] = { action, roles: resolveRoles(file, txt, rolesToken), fields };
  }
  // file-level WRITE_ROLES fallback
  const wr = txt.match(/WRITE_ROLES\s*=\s*new Set(?:<[^>]*>)?\(\s*\[([^\]]*)\]/);
  const fileRoles = wr ? [...wr[1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1]) : null;
  return { verbs, fileRoles };
}

// ---- spec TRANSITIONS action set (try every plausible spec filename) ----
function specActions(prefix, key) {
  const cands = new Set([
    key.replace(/_/g, '-'),
    key.replace(/_chain$/, '').replace(/_/g, '-'),
    key.replace(/_/g, '-') + '-chain',
    key.replace(/_chain$/, '').replace(/_/g, '-') + '-chain',
  ]);
  const tail = prefix.replace(/^\/api\//, '').replace(/\/chain$/, '').split('/').pop();
  if (tail) { cands.add(tail); cands.add(tail.replace(/s$/, '')); cands.add(tail + '-chain'); cands.add(tail.replace(/s$/, '') + '-chain'); }
  for (const base of cands) {
    const f = path.join(ROOT, 'src/utils', `${base}-spec.ts`);
    if (fs.existsSync(f)) {
      const tm = fs.readFileSync(f, 'utf8').match(/export const TRANSITIONS[^{]*\{([\s\S]*?)\n\}/);
      if (tm) {
        const acts = new Set();
        // nested form: state: { action: 'to', ... }  OR  flat form: action: { from, to }
        for (const a of tm[1].matchAll(/([a-z0-9_]+)\s*:\s*'[a-z0-9_]+'/g)) acts.add(a[1]);
        for (const a of tm[1].matchAll(/^\s*([a-z0-9_]+)\s*:\s*\{/gm)) acts.add(a[1]);
        if (acts.size) return { file: `${base}-spec.ts`, actions: acts };
      }
    }
  }
  return { file: null, actions: null };
}

const report = [];
for (const b of blocks) {
  const paths = [...b.text.matchAll(/\bpath:\s*['"]([^'"]+)['"]/g)].map((m) => m[1]);
  const exposed = new Set();
  let prefix = null;
  for (const p of paths) {
    const i = p.indexOf('/:id/');
    if (i > 0) { exposed.add(p.slice(i + 5).split('/')[0]); if (!prefix) prefix = p.slice(0, i); }
  }
  if (!prefix) { report.push({ key: b.key, note: 'no-path-hints' }); continue; }
  const file = prefixToFile[prefix];
  const spec = specActions(prefix, b.key);
  const info = routeInfo(file, spec.actions);
  if (!info) { report.push({ key: b.key, prefix, note: 'route-file-not-found', file }); continue; }
  // advance verbs = route verbs that call transition() with a real action,
  // filtered to spec actions when the spec was found
  let advance = Object.keys(info.verbs).filter((v) => info.verbs[v].action);
  if (spec.actions) advance = advance.filter((v) => spec.actions.has(info.verbs[v].action));
  const missing = advance.filter((v) => !exposed.has(v));
  report.push({
    key: b.key, prefix, routeFile: file ? path.basename(file) : null, specFile: spec.file,
    fileRoles: info.fileRoles, exposedCount: exposed.size, advanceCount: advance.length,
    missing, verbDetail: Object.fromEntries(missing.map((v) => [v, info.verbs[v]])),
  });
}

const gaps = report.filter((r) => r.missing && r.missing.length).sort((a, b) => b.missing.length - a.missing.length);
const problems = report.filter((r) => r.note);
fs.writeFileSync('/tmp/audit-gaps.json', JSON.stringify({
  totalChains: report.length, gapChains: gaps.length,
  totalMissingVerbs: gaps.reduce((s, r) => s + r.missing.length, 0),
  problems, gaps,
}, null, 2));
console.log(JSON.stringify({
  totalChains: report.length, gapChains: gaps.length,
  totalMissingVerbs: gaps.reduce((s, r) => s + r.missing.length, 0),
  problemCount: problems.length,
  gapSummary: gaps.map((g) => `${g.key} (+${g.missing.length}): ${g.missing.join(',')}`),
}, null, 2));
