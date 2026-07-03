// Live capture + a11y scan of the Substation reskin. One API login (rate-limit
// safe), token seeded into localStorage, then screenshot + axe-scan each key
// surface against BASE (defaults to prod oe.vantax.co.za). Screenshots land in
// the scratchpad for visual review; axe violations print to the console.
//   BASE=https://oe.vantax.co.za CAP_ROLE=ipp npx playwright test tests/browser/ease-capture.spec.ts --config=playwright.config.ts
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const BASE = process.env.BASE || 'https://oe.vantax.co.za';
const ROLE = process.env.CAP_ROLE || 'ipp';
const PWD = process.env.DEMO_PASSWORD || 'Demo@2024!';
const OUT = '/private/tmp/claude-501/-Users-reshigan-Openenergy/a33d576c-71e8-45c5-b3d3-afea29b65d66/scratchpad';

let TOKEN = '';
let ME: unknown = null;

test.beforeAll(async ({ request }) => {
  // Reuse the global-setup token (no fresh login → rate-safe).
  TOKEN = process.env[`PLAYWRIGHT_${ROLE.toUpperCase()}_TOKEN`] || '';
  if (!TOKEN) {
    const r = await request.post(`${BASE}/api/auth/login`, {
      data: { email: `${ROLE}@openenergy.co.za`, password: PWD },
    });
    expect(r.ok()).toBeTruthy();
    TOKEN = (await r.json()).data.token;
  }
  // Capture the real /auth/me body (NOT rate-limited) so we can stub it in-page
  // and ProtectedRoute authenticates instantly — no bootstrap race to /login.
  const me = await request.get(`${BASE}/api/auth/me`, { headers: { Authorization: `Bearer ${TOKEN}` } });
  if (me.ok()) ME = await me.json();
});

const SURFACES = [
  { name: 'atlas', path: '/atlas', sel: '.mer.atlas' },
  { name: 'cockpit', path: '/cockpit', sel: '.mer' },
];

test('capture + a11y', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  // AuthContext bootstraps via the httpOnly-cookie /auth/refresh (unavailable
  // headless) — intercept it to hand back the token, then AuthContext's /auth/me
  // (real, Bearer) succeeds and ProtectedRoute renders instead of bouncing to /login.
  await page.route('**/api/auth/refresh', (route) => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ success: true, data: { token: TOKEN, expires_in: 3600 } }),
  }));
  if (ME) {
    await page.route('**/api/auth/me', (route) => route.fulfill({
      status: 200, contentType: 'application/json', body: JSON.stringify(ME),
    }));
  }
  await page.addInitScript((tok) => localStorage.setItem('token', tok as string), TOKEN);

  for (const s of SURFACES) {
    await page.goto(`${BASE}${s.path}`, { waitUntil: 'networkidle' }).catch(() => {});
    await page.waitForTimeout(2500);
    await page.screenshot({ path: `${OUT}/live-${ROLE}-${s.name}.png`, fullPage: false });
    // a11y — WCAG 2 A/AA, on the real rendered surface
    const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze().catch(() => null);
    if (axe) {
      const serious = axe.violations.filter(v => v.impact === 'serious' || v.impact === 'critical');
      console.log(`\n[a11y ${s.name}] ${axe.violations.length} violations (${serious.length} serious/critical)`);
      for (const v of serious.slice(0, 8)) {
        console.log(`  ${v.impact}  ${v.id}: ${v.help} (${v.nodes.length} nodes)`);
      }
    }
  }
  await ctx.close();
});
