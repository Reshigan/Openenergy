// Convention-B hint generator. The original gen-registry-hints.mjs only parsed
// Convention-A `transition(c, '<action>', ...)` handlers, so the 8 chains whose
// route uses a local wrapper `transition(c, id, '<action>', '<to>', ...)` got
// ZERO hints. This generator consumes /tmp/audit-gaps.json (produced by the
// robust audit-registry-gaps.mjs, which captures both conventions + per-verb
// roles) and splices the missing ChainActionHint literals into each chain's
// actions[] array. Pure static literals only — every identifier is a code
// literal; request input never touches a table/column name.
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(process.cwd());
const REG_PATH = path.join(ROOT, 'src/utils/chain-registry-meridian.ts');
let REG = fs.readFileSync(REG_PATH, 'utf8');
const DRY = process.argv.includes('--dry');
const audit = JSON.parse(fs.readFileSync('/tmp/audit-gaps.json', 'utf8'));

// drawdown is the ONE chain whose fileRoles capture is wrong (its first
// `*WRITE_ROLES = new Set` is IPP_WRITE_ROLES, an IPP lane on a lender chain).
// Roles are resolved per-action from ACTION_ACTOR in drawdown-chain.ts.
const DRAWDOWN_IPP    = ['admin', 'support', 'ipp', 'ipp_developer', 'wind'];
const DRAWDOWN_LENDER = ['admin', 'support', 'lender'];
const DRAWDOWN_ROLES = {
  'submit-documents': DRAWDOWN_IPP, resume: DRAWDOWN_IPP, cancel: DRAWDOWN_IPP,
  'begin-ie-review': DRAWDOWN_LENDER, 'pass-to-cp': DRAWDOWN_LENDER,
  query: DRAWDOWN_LENDER, fund: DRAWDOWN_LENDER, close: DRAWDOWN_LENDER,
};

function rolesFor(g, verb, detail) {
  if (detail.roles && detail.roles.length) return detail.roles;       // planned_outage (per-verb)
  if (g.key === 'drawdown' && DRAWDOWN_ROLES[verb]) return DRAWDOWN_ROLES[verb];
  if (g.fileRoles && g.fileRoles.length) return g.fileRoles;          // single WRITE_ROLES chains
  return ['admin'];
}

// ---- spec TRANSITIONS: action -> to-state (nested OR flat form) ----
function specMap(specFile) {
  if (!specFile) return {};
  const f = path.join(ROOT, 'src/utils', specFile);
  if (!fs.existsSync(f)) return {};
  const tm = fs.readFileSync(f, 'utf8').match(/export const TRANSITIONS[^{]*\{([\s\S]*?)\n\}/);
  if (!tm) return {};
  const map = {};
  // nested: state: { action: 'to', ... }
  for (const a of tm[1].matchAll(/([a-z0-9_]+)\s*:\s*'([a-z0-9_]+)'/g)) if (!map[a[1]]) map[a[1]] = a[2];
  // flat: action: { from: '...', to: 'X' }
  for (const a of tm[1].matchAll(/^\s*([a-z0-9_]+)\s*:\s*\{[^}]*?to:\s*'([a-z0-9_]+)'/gm)) map[a[1]] = a[2];
  return map;
}

// ---- helpers (mirror gen-registry-hints.mjs) ----
const titleCase = (verb) => verb.split('-').map((w, i) => i === 0 ? w[0].toUpperCase() + w.slice(1) : w).join(' ');
function toneFor(verb) {
  if (/(reject|cancel|withdraw|void|decline|terminate|downgrade|dismiss|revoke|refuse|write-off|writeoff|abandon|forfeit|fail|suspend|skip|disqualify|dispute)/.test(verb)) return 'oxide';
  if (/(archive|expire|auto-|^flag-|-overdue|park)/.test(verb)) return 'ghost';
  if (/(approve|confirm|complete|settle|grant|^issue-|activate|^release|^pass|publish|^close$|resolve|reinstate|verify|certify|accept|mark-restored|mark-adjusted|commence|fund|resume|notify|mobilize|test)/.test(verb)) return 'primary';
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
    .replace(/_ref$/, ' reference').replace(/_/g, ' ').replace(/\b\w/, (c) => c.toUpperCase()).trim();
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

// ---- registry blocks + bracket-matched actions[] close ----
function blocksOf(reg) {
  const idxs = [];
  for (const m of reg.matchAll(/\n {4}key:\s*'([a-z0-9_]+)',/g)) idxs.push({ key: m[1], start: m.index });
  return idxs.map((x, i) => ({ key: x.key, start: x.start, end: i + 1 < idxs.length ? idxs[i + 1].start : reg.length }));
}
function actionsArrayClose(blockStart, blockEnd) {
  const seg = REG.slice(blockStart, blockEnd);
  const am = seg.match(/\n\s*actions:\s*\[/);
  if (!am) return -1;
  let i = blockStart + am.index + am[0].length, depth = 1;
  while (i < blockEnd && depth > 0) {
    const ch = REG[i];
    if (ch === '[') depth++;
    else if (ch === ']') { depth--; if (depth === 0) return i; }
    i++;
  }
  return -1;
}

// ---- main ----
const edits = [];
let totalHints = 0;
const summary = [];
for (const g of audit.gaps) {
  const toState = specMap(g.specFile);
  const hints = [];
  for (const verb of g.missing) {
    const d = g.verbDetail[verb];
    if (!d || !d.action) { summary.push(`  WARN ${g.key}: verb ${verb} has no action`); continue; }
    const roles = rolesFor(g, verb, d);
    const fields = (d.fields || []).filter((f) => f.key !== 'notes').map((f) => ({ key: f.key, label: fieldLabel(f.key), type: fieldType(f.key, f.js) }));
    const to = toState[d.action];
    hints.push({
      action: verb, label: titleCase(verb), tone: toneFor(verb),
      path: `${g.prefix}/:id/${verb}`, roles,
      cascadeHint: to ? `Advances the ${g.key.replace(/_/g, ' ')} chain to ${to.replace(/_/g, ' ')}.` : `Records the ${titleCase(verb).toLowerCase()} action.`,
      fields,
    });
  }
  if (!hints.length) { summary.push(`SKIP ${g.key} (no hints)`); continue; }
  const blk = blocksOf(REG).find((b) => b.key === g.key);
  if (!blk) { summary.push(`SKIP ${g.key} (block not found)`); continue; }
  const close = actionsArrayClose(blk.start, blk.end);
  if (close < 0) { summary.push(`SKIP ${g.key} (no actions[] close)`); continue; }
  let j = close - 1;
  while (j > 0 && /\s/.test(REG[j])) j--;
  const needComma = REG[j] === '}';
  const text = (needComma ? ',' : '') + '\n      ' + hints.map(renderHint).join(',\n      ') + '\n    ';
  edits.push({ key: g.key, insertAt: close, text });
  totalHints += hints.length;
  summary.push(`${g.key}: +${hints.length} hints  (roles sample: ${JSON.stringify(rolesFor(g, g.missing[0], g.verbDetail[g.missing[0]]))})`);
}

edits.sort((a, b) => b.insertAt - a.insertAt);
for (const e of edits) REG = REG.slice(0, e.insertAt) + e.text + REG.slice(e.insertAt);

console.log(summary.join('\n'));
console.log(`\nTOTAL: ${totalHints} hints across ${edits.length} chains`);
if (!DRY) { fs.writeFileSync(REG_PATH, REG); console.log('WROTE ' + REG_PATH); }
else console.log('(dry run — not written)');
