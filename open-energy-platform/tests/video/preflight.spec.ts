// ════════════════════════════════════════════════════════════════════════
// Preflight — loads every URL we record in the 17-minute film and reports
// red-flag findings:
//
//   • console errors (page.on('pageerror') + page.on('console') level=error)
//   • API 4xx/5xx
//   • Visible "Failed to load" / "Something went wrong" / "Unable to" /
//     "Try again" text
//   • Empty hero strip (no h1 + no KPI tile visible)
//
// Excluded from the recording suite via playwright.config.video.ts
// `testIgnore`. Run standalone:
//   BASE=http://localhost:8787 npx playwright test \
//     --config=playwright.config.video.ts tests/video/preflight.spec.ts
// ════════════════════════════════════════════════════════════════════════

import { test, expect, type Page } from '@playwright/test';
import { ensureToken, seedTokenAuth, type Role } from './_helpers';

test.describe.configure({ mode: 'serial' });

type Probe = { role: Role; url: string };

// One probe per unique recorded URL. Role chosen to match the spec file
// that recorded that URL (see trader.spec.ts, ipp.spec.ts etc.).
const PROBES: Probe[] = [
  { role: 'admin',         url: '/launch/admin' },
  { role: 'admin',         url: '/admin' },
  { role: 'admin',         url: '/settlement' },
  { role: 'trader',        url: '/launch/trader' },
  { role: 'trader',        url: '/trading' },
  { role: 'trader',        url: '/trader-risk/workstation' },
  { role: 'ipp_developer', url: '/projects' },
  { role: 'ipp_developer', url: '/ipp-lifecycle/workstation' },
  { role: 'ipp_developer', url: '/esums' },
  { role: 'ipp_developer', url: '/esums/sites/omsite_jbg_solar1' },
  { role: 'offtaker',      url: '/offtaker-suite/workstation' },
  { role: 'offtaker',      url: '/procurement' },
  { role: 'lender',        url: '/launch/lender' },
  { role: 'lender',        url: '/lender-suite' },
  { role: 'lender',        url: '/funds' },
  { role: 'carbon_fund',   url: '/carbon' },
  { role: 'regulator',     url: '/regulator-suite/workstation' },
  { role: 'grid_operator', url: '/grid' },
  { role: 'grid_operator', url: '/grid-operator/workstation' },
  // Public surfaces — any token works; we use admin's.
  { role: 'admin',         url: '/status' },
  { role: 'admin',         url: '/audit' },
  { role: 'admin',         url: '/legal' },
];

const TOKENS: Partial<Record<Role, string>> = {};

test.beforeAll(async ({ request, baseURL }) => {
  const roles: Role[] = Array.from(new Set(PROBES.map((p) => p.role)));
  for (const r of roles) {
    TOKENS[r] = await ensureToken(request, baseURL!, r);
    // Inter-login pacing so the 10/5min/IP limiter doesn't bite.
    await new Promise((res) => setTimeout(res, 800));
  }
}, 180_000);

const ERROR_TEXT_RX =
  /(Failed to (load|fetch)|Something went wrong|Unable to (load|fetch|connect)|Try again|Error\s*:\s*|HTTP\s+(4\d\d|5\d\d)|stack trace|TypeError|ReferenceError)/i;

async function probe(page: Page, baseURL: string, p: Probe): Promise<string[]> {
  const findings: string[] = [];
  const consoleErrs: string[] = [];
  const pageErrs: string[] = [];
  const api4xx: string[] = [];
  const api5xx: string[] = [];

  page.on('pageerror', (err) => {
    pageErrs.push(err.message.slice(0, 160));
  });
  const asset404: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const t = msg.text();
      // Filter framework noise. Also skip the generic "Failed to load resource"
      // line — we capture the real URL via page.on('response') below.
      if (/favicon|Download the React DevTools|Tailwind|fetchPriority|Failed to load resource/.test(t)) return;
      consoleErrs.push(t.slice(0, 200));
    }
  });
  page.on('response', (resp) => {
    const u = resp.url();
    const s = resp.status();
    if (u.includes('/api/')) {
      if (s >= 500) api5xx.push(`${s} ${u.split('/api/')[1]}`);
      else if (s >= 400) api4xx.push(`${s} ${u.split('/api/')[1]}`);
    } else if (s === 404) {
      // Suppress noise from third-party CDN fonts that are mirrored locally
      // anyway (Metropolis is bundled in pages/public/fonts) — these are
      // browser-side fetches the CSS fires before falling back to local. They
      // never show in the video.
      if (/fonts\.cdnfonts\.com|fonts\.googleapis\.com|fonts\.gstatic\.com|\.woff2?$|\.png$|favicon/.test(u)) return;
      const path = u.startsWith(baseURL) ? u.slice(baseURL.length) : u;
      asset404.push(path);
    }
  });

  await seedTokenAuth(page, TOKENS[p.role]!);
  const resp = await page.goto(`${baseURL}${p.url}`, { waitUntil: 'domcontentloaded' });
  if (resp && resp.status() >= 400) {
    findings.push(`HTTP ${resp.status()} on goto`);
  }
  await page.waitForLoadState('networkidle', { timeout: 12_000 }).catch(() => undefined);
  await page.waitForTimeout(1500);

  // Final URL — catches catch-all → /launch redirects.
  const finalPath = new URL(page.url()).pathname;
  if (finalPath !== p.url && !finalPath.startsWith(p.url) && !p.url.startsWith(finalPath)) {
    findings.push(`redirected to ${finalPath}`);
  }

  // Visible error markers.
  const bodyText = await page.locator('body').innerText().catch(() => '');
  const m = bodyText.match(ERROR_TEXT_RX);
  if (m) findings.push(`visible: "${m[0]}"`);

  // Hero strip / KPI presence — empty page is a finding.
  const heroCount = await page.locator('h1, h2, [data-test^="kpi"], [data-test="launch-board"]').count();
  if (heroCount === 0) findings.push('no h1/h2/kpi rendered');

  if (consoleErrs.length) findings.push(`console.error x${consoleErrs.length}: ${consoleErrs[0]}`);
  if (pageErrs.length) findings.push(`pageerror x${pageErrs.length}: ${pageErrs[0]}`);
  if (api5xx.length) findings.push(`api 5xx x${api5xx.length}: ${api5xx.slice(0, 3).join(' | ')}`);
  if (api4xx.length) findings.push(`api 4xx x${api4xx.length}: ${api4xx.slice(0, 3).join(' | ')}`);
  if (asset404.length) {
    // De-dupe (same asset often requested twice on hot reload).
    const uniq = Array.from(new Set(asset404));
    findings.push(`asset 404 x${uniq.length}: ${uniq.slice(0, 3).join(' | ')}`);
  }

  // Inter-probe pacing — global rateLimitMiddleware caps at 100/min/IP across
  // ALL API requests, and a single page load makes ~6-10 API calls. With 22
  // probes that pushes us over the cap. Sleep 4s between probes so we stay
  // comfortably under.
  await page.waitForTimeout(4_000);

  return findings;
}

for (const p of PROBES) {
  test(`preflight ${p.role} ${p.url}`, async ({ page, baseURL }) => {
    test.skip(!TOKENS[p.role], `no token for ${p.role}`);
    const findings = await probe(page, baseURL!, p);
    if (findings.length) {
      console.log(`✗ ${p.role.padEnd(14)} ${p.url}`);
      for (const f of findings) console.log(`    ${f}`);
    } else {
      console.log(`✓ ${p.role.padEnd(14)} ${p.url}`);
    }
    // Soft: never fail the suite. We want to see the full report.
    expect(true).toBe(true);
  });
}
