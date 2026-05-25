// ═══════════════════════════════════════════════════════════════════════════
// Phase 1 — UI audit walker.
//
// Logs in as each persona, walks their core surfaces, and writes a
// full-page screenshot to docs/video/audit-shots/<persona>/<route>.png.
//
// Two purposes:
//   1. UX consistency review — does every screen on camera look professional?
//   2. Brand-match-to-deck — is the navy/emerald/Inter visual language
//      consistent with Consolidated_Energy_Cockpit_Corporate_2.pdf?
//
// One login per persona (9 logins total) cached for the walk — well inside
// the 10 / 5 min sensitive-route rate-limit budget.
// ═══════════════════════════════════════════════════════════════════════════

import { test, expect } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const PASSWORD = process.env.DEMO_PASSWORD || 'Demo@2024!';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(HERE, '../../../docs/video/audit-shots');

// Persona → routes matrix.
// Each route is [path, slug]. Slug is the filename.
type Persona = {
  email: string;
  role: string;        // backend role value (drives /launch/:role)
  label: string;       // human-readable
  routes: [string, string][];
};

const PERSONAS: Persona[] = [
  {
    email: 'admin@openenergy.co.za', role: 'admin', label: 'platform-admin',
    routes: [
      ['/launch/admin', 'launch'],
      ['/admin-platform/workstation', 'workstation'],
      ['/admin-platform/tenants', 'tenants-list'],
      ['/admin/monitoring', 'monitoring'],
      ['/admin/platform-console', 'platform-console'],
    ],
  },
  {
    email: 'trader@openenergy.co.za', role: 'trader', label: 'trader',
    routes: [
      ['/launch/trader', 'launch'],
      ['/trader-risk/workstation', 'workstation'],
      ['/trader-risk', 'trader-risk-suite'],
      ['/trading', 'trading'],
      ['/settlement', 'settlement'],
    ],
  },
  {
    email: 'ipp@openenergy.co.za', role: 'ipp_developer', label: 'ipp-developer',
    routes: [
      ['/launch/ipp_developer', 'launch'],
      ['/ipp-lifecycle/workstation', 'workstation'],
      ['/projects', 'projects-list'],
      ['/pipeline', 'pipeline'],
      ['/esums', 'esums'],
    ],
  },
  {
    email: 'offtaker@openenergy.co.za', role: 'offtaker', label: 'offtaker',
    routes: [
      ['/launch/offtaker', 'launch'],
      ['/offtaker-suite/workstation', 'workstation'],
      ['/contracts', 'contracts-list'],
      ['/esg', 'esg'],
      ['/marketplace', 'marketplace'],
    ],
  },
  {
    email: 'lender@openenergy.co.za', role: 'lender', label: 'lender',
    routes: [
      ['/launch/lender', 'launch'],
      ['/lender-suite', 'lender-suite'],
      ['/lender-suite/audit', 'lender-audit'],
      ['/funds', 'funds'],
    ],
  },
  {
    email: 'carbon@openenergy.co.za', role: 'carbon_fund', label: 'carbon-fund',
    routes: [
      ['/launch/carbon_fund', 'launch'],
      ['/carbon-registry/workstation', 'workstation'],
      ['/carbon', 'carbon-portfolio'],
    ],
  },
  {
    email: 'regulator@openenergy.co.za', role: 'regulator', label: 'regulator',
    routes: [
      ['/launch/regulator', 'launch'],
      ['/regulator-suite/workstation', 'workstation'],
      ['/regulator-suite', 'regulator-suite'],
    ],
  },
  {
    email: 'grid@openenergy.co.za', role: 'grid_operator', label: 'grid-operator',
    routes: [
      ['/launch/grid_operator', 'launch'],
      ['/grid-operator/workstation', 'workstation'],
      ['/grid', 'grid-overview'],
    ],
  },
  {
    email: 'support@openenergy.co.za', role: 'support', label: 'support',
    routes: [
      ['/launch/support', 'launch'],
      ['/support/workstation', 'workstation'],
      ['/support', 'support-overview'],
    ],
  },
];

// Cross-cutting routes worth screenshotting as admin (cross-tenant visibility).
const CROSS_CUTTING: [string, string][] = [
  ['/design-gallery', 'design-gallery'],
  ['/marketplace', 'marketplace'],
  ['/intelligence', 'intelligence'],
  ['/popia', 'popia'],
  ['/briefing', 'briefing'],
  ['/audit', 'public-audit'],
  ['/status', 'public-status'],
  ['/legal', 'public-legal'],
];

const TOKENS = new Map<string, string>();

test.beforeAll(async ({ request, baseURL }) => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  for (const p of PERSONAS) {
    if (TOKENS.has(p.email)) continue;
    try {
      const r = await request.post(`${baseURL}/api/auth/login`, {
        data: { email: p.email, password: PASSWORD },
        failOnStatusCode: false,
        timeout: 45_000,
      });
      if (!r.ok()) {
        console.warn(`[audit] login failed for ${p.email}: HTTP ${r.status()}`);
        continue;
      }
      const tok = (await r.json())?.data?.token;
      if (tok) TOKENS.set(p.email, tok);
    } catch (e) {
      console.warn(`[audit] login error for ${p.email}: ${e instanceof Error ? e.message : e}`);
    }
    // Inter-login pacing — keeps us comfortably within the 10/5min/IP rate
    // limit even if the prod auth worker is cold and slow.
    await new Promise((r) => setTimeout(r, 800));
  }
  console.log(`[audit] obtained ${TOKENS.size}/${PERSONAS.length} tokens`);
}, 600_000);

async function seedToken(page: import('@playwright/test').Page, email: string) {
  const tok = TOKENS.get(email);
  if (!tok) throw new Error(`no token for ${email}`);
  await page.addInitScript((t) => {
    localStorage.setItem('token', t as string);
  }, tok);
}

for (const persona of PERSONAS) {
  for (const [route, slug] of persona.routes) {
    test(`audit [${persona.label}] ${slug} (${route})`, async ({ page, baseURL }) => {
      test.skip(!TOKENS.has(persona.email), `no token for ${persona.email}`);
      const dir = path.join(OUT_DIR, persona.label);
      fs.mkdirSync(dir, { recursive: true });

      await seedToken(page, persona.email);
      const errs: string[] = [];
      page.on('response', (resp) => {
        const s = resp.status();
        if (s >= 500 && resp.url().includes('/api/')) {
          errs.push(`api.5xx: ${s} ${resp.url()}`);
        }
      });

      await page.goto(`${baseURL}${route}`, { waitUntil: 'networkidle' });
      // Tiny settle delay so charts/data hydrate before the shot.
      await page.waitForTimeout(1500);
      const file = path.join(dir, `${slug}.png`);
      await page.screenshot({ path: file, fullPage: true });

      // Soft assertions — never fail the audit on per-page issues;
      // we want to see EVERY screen, errors and all. Log to stdout instead.
      if (errs.length) {
        console.warn(`[audit][${persona.label}/${slug}] 5xx noise:\n  ${errs.join('\n  ')}`);
      }
      expect(fs.existsSync(file)).toBe(true);
    });
  }
}

// Cross-cutting walk — admin token.
for (const [route, slug] of CROSS_CUTTING) {
  test(`audit [cross-cutting] ${slug} (${route})`, async ({ page, baseURL }) => {
    test.skip(!TOKENS.has('admin@openenergy.co.za'), 'no admin token');
    const dir = path.join(OUT_DIR, '_cross-cutting');
    fs.mkdirSync(dir, { recursive: true });

    await seedToken(page, 'admin@openenergy.co.za');
    await page.goto(`${baseURL}${route}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(dir, `${slug}.png`), fullPage: true });
  });
}

// Login screen — for cold-open visual.
test('audit [public] login', async ({ page, baseURL }) => {
  const dir = path.join(OUT_DIR, '_public');
  fs.mkdirSync(dir, { recursive: true });
  await page.goto(`${baseURL}/login`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(dir, 'login.png'), fullPage: true });
});
