// Deterministic generator: for every gap verb the scout found, synthesize a
// type-safe ChainActionHint literal and splice it into the chain's actions[]
// array, just before the closing ']'. Fields + types are extracted from the
// route handler's `typeof b.<key> === '<type>'` guards (all optional → empty
// POST still advances; fields are for UX). Pure static literals only.
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(process.cwd());
const REG_PATH = path.join(ROOT, 'src/utils/chain-registry-meridian.ts');
let REG = fs.readFileSync(REG_PATH, 'utf8');
const MOUNT = fs.readFileSync(path.join(ROOT, 'src/routes/mount-routes.ts'), 'utf8');
const DRY = process.argv.includes('--dry');

// ---- mount-routes: prefix -> route file (same as scout) ----
const importMap = {};
for (const m of MOUNT.matchAll(/import\s+(\w+)\s*(?:,\s*\{[^}]*\})?\s*from\s+'(\.\/[^']+)'/g)) importMap[m[1]] = m[2];
// pure-named imports: import { a, b as c } from './x'
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
function blocksOf(reg) {
  const idxs = [];
  for (const m of reg.matchAll(/\n {4}key:\s*'([a-z0-9_]+)',/g)) idxs.push({ key: m[1], start: m.index });
  return idxs.map((x, i) => ({ key: x.key, start: x.start, end: i + 1 < idxs.length ? idxs[i + 1].start : reg.length }));
}

// ---- spec TRANSITIONS: action -> to-state ----
function specMap(prefix, key) {
  const cands = new Set([key.replace(/_/g, '-'), key.replace(/_chain$/, '').replace(/_/g, '-')]);
  const tail = prefix.replace(/^\/api\//, '').replace(/\/chain$/, '').split('/').pop();
  if (tail) cands.add(tail);
  for (const base of cands) {
    const f = path.join(ROOT, 'src/utils', `${base}-spec.ts`);
    if (fs.existsSync(f)) {
      const tm = fs.readFileSync(f, 'utf8').match(/export const TRANSITIONS[^{]*\{([\s\S]*?)\n\}/);
      if (tm) {
        const map = {};
        for (const a of tm[1].matchAll(/^\s*([a-z0-9_]+)\s*:\s*\{[^}]*?to:\s*'([a-z0-9_]+)'/gm)) map[a[1]] = a[2];
        if (Object.keys(map).length) return map;
      }
    }
  }
  return {};
}

// ---- route handlers: verb -> {action, fields[]} ----
function routeHandlers(file) {
  const txt = fs.readFileSync(file, 'utf8');
  const out = {}; // kebab verb -> { action, fields:[{key,type}] }
  const re = /\.(?:post|put)\(\s*'\/:id\/([a-z0-9-]+)'[\s\S]{0,80}?transition\(\s*c\s*,\s*'([a-z0-9_]+)'/g;
  const hits = [...txt.matchAll(re)];
  for (let i = 0; i < hits.length; i++) {
    const verb = hits[i][1], action = hits[i][2];
    const bodyStart = hits[i].index;
    const bodyEnd = i + 1 < hits.length ? hits[i + 1].index : Math.min(txt.length, bodyStart + 2000);
    const seg = txt.slice(bodyStart, bodyEnd);
    const fields = [];
    const seen = new Set();
    for (const m of seg.matchAll(/typeof\s+(?:b|body)\.(\w+)\s*===\s*'(\w+)'/g)) {
      if (!seen.has(m[1])) { seen.add(m[1]); fields.push({ key: m[1], js: m[2] }); }
    }
    // destructured untyped keys: const { a, b } = body
    for (const m of seg.matchAll(/const\s*\{([^}]*)\}\s*=\s*body/g)) {
      for (const part of m[1].split(',')) {
        const k = part.trim().split(':')[0].trim();
        if (/^\w+$/.test(k) && !seen.has(k)) { seen.add(k); fields.push({ key: k, js: 'string' }); }
      }
    }
    out[verb] = { action, fields };
  }
  return out;
}

// ---- helpers ----
const titleCase = (verb) => verb.split('-').map((w, i) => i === 0 ? w[0].toUpperCase() + w.slice(1) : w).join(' ');
function toneFor(verb) {
  if (/(reject|cancel|withdraw|void|decline|terminate|downgrade|dismiss|revoke|refuse|write-off|writeoff|abandon|forfeit|fail|impose-restriction|suspend|escalate-to-arbitration|skip|disqualify)/.test(verb)) return 'oxide';
  if (/(archive|expire|auto-|^flag-|-overdue|close-false|mark-false|park|withdraw-instruction)/.test(verb)) return 'ghost';
  if (/(approve|confirm|complete|settle|grant|^issue-|activate|^release|^pass$|publish|^close$|resolve|reinstate|mark-recover|mark-complet|award-relief|reach-agreement|verify|certify|accept)/.test(verb)) return 'primary';
  return null;
}
function fieldType(key, js) {
  if (js === 'number') return 'number';
  if (js === 'boolean') return 'boolean';
  if (/(_at|_date|deadline|_on)$/.test(key) || /^date/.test(key)) return 'date';
  if (/(narrative|reason|notes?|summary|justification|description|comment|finding|rationale|detail|remark|memo)/.test(key)) return 'evidence';
  return 'string';
}
function fieldLabel(key) {
  return key.replace(/_zar$/, ' (ZAR)').replace(/_pct$/, ' (%)').replace(/_mw$/, ' (MW)').replace(/_mwh$/, ' (MWh)').replace(/_days$/, ' (days)')
    .replace(/_/g, ' ').replace(/\b\w/, (c) => c.toUpperCase()).trim();
}
function renderHint(h) {
  const parts = [`action: ${JSON.stringify(h.action)}`, `label: ${JSON.stringify(h.label)}`];
  if (h.tone) parts.push(`tone: ${JSON.stringify(h.tone)}`);
  parts.push(`path: ${JSON.stringify(h.path)}`, `method: 'POST'`, `roles: [${h.roles.map((r) => `'${r}'`).join(', ')}]`,
    `cascadeHint: ${JSON.stringify(h.cascadeHint)}`);
  if (h.fields.length) {
    const fs2 = h.fields.map((f) => `{ key: ${JSON.stringify(f.key)}, label: ${JSON.stringify(f.label)}, type: '${f.type}' }`).join(', ');
    parts.push(`fields: [${fs2}]`);
  }
  return `{ ${parts.join(', ')} }`;
}

// find the actions:[ ... ] closing ] index within a block (bracket-matched)
function actionsArrayClose(text, blockStart, blockEnd) {
  const seg = REG.slice(blockStart, blockEnd);
  const am = seg.match(/\n\s*actions:\s*\[/);
  if (!am) return -1;
  let i = blockStart + am.index + am[0].length; // just after the '['
  let depth = 1;
  while (i < blockEnd && depth > 0) {
    const ch = REG[i];
    if (ch === '[') depth++;
    else if (ch === ']') depth--;
    if (depth === 0) return i; // index of the closing ']'
    i++;
  }
  return -1;
}

// ---- main ----
const scout = JSON.parse(fs.readFileSync('/tmp/scout-gaps.json', 'utf8'));
const edits = []; // {key, insertAt, text}
let totalHints = 0;
const summary = [];
for (const g of scout.gaps) {
  const file = prefixToFile[g.prefix];
  if (!file || !fs.existsSync(file)) { summary.push(`SKIP ${g.key} (no route)`); continue; }
  const handlers = routeHandlers(file);
  const spec = specMap(g.prefix, g.key);
  const hints = [];
  for (const verb of g.missing) {
    const h = handlers[verb];
    if (!h) { summary.push(`  WARN ${g.key}: verb ${verb} not in route`); continue; }
    const fields = h.fields.map((f) => ({ key: f.key, label: fieldLabel(f.key), type: fieldType(f.key, f.js) }));
    const to = spec[h.action];
    hints.push({
      action: verb, label: titleCase(verb), tone: toneFor(verb),
      path: `${g.prefix}/:id/${verb}`, roles: g.writeRoles || ['admin'],
      cascadeHint: to ? `Advances the ${g.key.replace(/_/g, ' ')} chain to ${to.replace(/_/g, ' ')}.` : `Records the ${titleCase(verb).toLowerCase()} action.`,
      fields,
    });
  }
  if (!hints.length) continue;
  const blk = blocksOf(REG).find((b) => b.key === g.key);
  const close = actionsArrayClose(REG, blk.start, blk.end);
  if (close < 0) { summary.push(`SKIP ${g.key} (no actions[] close)`); continue; }
  // need a comma if last non-ws before ] is '}' (last element, no trailing comma)
  let j = close - 1;
  while (j > 0 && /\s/.test(REG[j])) j--;
  const needComma = REG[j] === '}';
  const text = (needComma ? ',' : '') + '\n      ' + hints.map(renderHint).join(',\n      ') + '\n    ';
  edits.push({ key: g.key, insertAt: close, text });
  totalHints += hints.length;
  summary.push(`${g.key}: +${hints.length} hints`);
}

// apply edits high-offset-first so earlier indices stay valid
edits.sort((a, b) => b.insertAt - a.insertAt);
for (const e of edits) REG = REG.slice(0, e.insertAt) + e.text + REG.slice(e.insertAt);

console.log(summary.join('\n'));
console.log(`\nTOTAL: ${totalHints} hints across ${edits.length} chains`);
if (!DRY) { fs.writeFileSync(REG_PATH, REG); console.log('WROTE ' + REG_PATH); }
else console.log('(dry run — not written)');
