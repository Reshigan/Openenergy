#!/usr/bin/env node
// Merge per-role month-sim fragments (test-results/month-sim/<role>.json,
// written by each parallel worker) into the single triage artifact
// test-results/month-sim-report.json. Run after the Playwright cohort finishes.
import * as fs from 'fs';
import * as path from 'path';

const ROLES = [
  'admin', 'trader', 'ipp_developer', 'offtaker', 'carbon_fund',
  'lender', 'regulator', 'grid_operator', 'support',
];

const cwd = process.cwd();
const fragDir = path.join(cwd, 'test-results', 'month-sim');
const base = process.env.BASE || 'https://oe.vantax.co.za';

const reports = [];
for (const role of ROLES) {
  const f = path.join(fragDir, `${role}.json`);
  if (!fs.existsSync(f)) continue;
  try { reports.push(JSON.parse(fs.readFileSync(f, 'utf8')).report); }
  catch { /* skip corrupt fragment */ }
}

const ran = new Set(reports.map((r) => r.role));
const missing = ROLES.filter((r) => !ran.has(r));
const sum = (f) => reports.reduce((n, r) => n + f(r), 0);

const totals = {
  roles_run: reports.length,
  roles_missing: missing,
  boards_rendered: reports.filter((r) => r.boardRendered).length,
  actions_fired: sum((r) => r.actionsFired),
  advances: sum((r) => r.advances),
  threads_opened: sum((r) => r.threadsOpened),
  ledgers_scanned: sum((r) => r.ledgersScanned),
  surfaces_opened: sum((r) => r.surfacesOpened),
  atlas_functions: sum((r) => r.atlasFunctions),
  action_rejections: sum((r) => r.actionRejections.length),
  page_errors: sum((r) => r.pageErrors.length),
  api_5xx: sum((r) => r.api5xx.length),
  login_bounces: sum((r) => r.loginBounces.length),
};

const outDir = path.join(cwd, 'test-results');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(
  path.join(outDir, 'month-sim-report.json'),
  JSON.stringify({ generatedAgainst: base, totals, reports }, null, 2),
);

console.log('[month-sim] merged', reports.length, 'role fragments');
console.log('[month-sim] totals', JSON.stringify(totals, null, 2));
for (const r of reports) {
  // HARD mirrors the spec's hard-fail gate: page/console errors + API 5xx.
  // loginBounces are a seeded-token bootstrap artifact (self-healed by remount),
  // reported but NOT a hard failure — kept visible in totals.login_bounces.
  const hard = r.pageErrors.length + r.api5xx.length;
  console.log(
    `  [${r.role}] board=${r.boardRendered} live=${r.liveCases} atlas=${r.atlasFunctions} ` +
    `surfaces=${r.surfacesOpened} ledgers=${r.ledgersScanned} threads=${r.threadsOpened} ` +
    `fired=${r.actionsFired} advanced=${r.advances} rej=${r.actionRejections.length} HARD=${hard}`,
  );
}
