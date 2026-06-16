// cec-consolidation.spec.ts — proves the single-chrome cutover.
//
// After repointing Layout → MeridianFrame and deleting AppShell, EVERY authed
// route must wear one chrome: the CEC header strip (`header .wordmark` === "CEC")
// inside `.mer.mer-frame`. Routes that were previously legacy `<Layout>`/AppShell
// pages are the interesting cases — they must now render under CEC with no crash
// and no leftover sidebar chrome.
import { test, expect, Page } from '@playwright/test';

let SHARED_ADMIN_TOKEN: string | null = null;

test.beforeAll(() => {
  const tok = process.env.PLAYWRIGHT_ADMIN_TOKEN;
  if (!tok) throw new Error('PLAYWRIGHT_ADMIN_TOKEN not set — global-setup may have failed');
  SHARED_ADMIN_TOKEN = tok;
});

async function seedAuth(page: Page) {
  if (!SHARED_ADMIN_TOKEN) throw new Error('shared admin token not initialised');
  const tokenValue = SHARED_ADMIN_TOKEN;
  // AuthContext bootstraps via the httpOnly oe_refresh cookie, absent in headless
  // Playwright. Intercept /auth/refresh to hand back a valid access token; the
  // context then calls /auth/me with the Bearer JWT and hydrates the real user.
  await page.route('**/api/auth/refresh', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data: { token: tokenValue, expires_in: 3600 } }),
    }),
  );
  await page.addInitScript((tok) => {
    localStorage.setItem('token', tok as string);
  }, tokenValue);
}

// Routes that used to render the legacy <Layout>/AppShell chrome.
const PREVIOUSLY_LEGACY = [
  '/settings',
  '/marketplace',
  '/esg',
  '/reports',
  '/intelligence',
  '/procurement',
  '/pipeline',
  '/notifications',
  '/support',
];

for (const path of PREVIOUSLY_LEGACY) {
  test(`${path} renders under single CEC chrome`, async ({ page }) => {
    await seedAuth(page);
    const hard5xx: string[] = [];
    page.on('response', (r) => {
      if (r.status() >= 500 && r.url().includes('/api/')) hard5xx.push(`${r.status()} ${r.url()}`);
    });
    const crashes: string[] = [];
    page.on('pageerror', (e) => crashes.push(String(e)));

    await page.goto(path, { waitUntil: 'domcontentloaded' });

    // CEC chrome present.
    const frame = page.locator('.mer.mer-frame');
    await expect(frame).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('header .wordmark')).toHaveText('CEC');

    // No legacy "MERIDIAN" wordmark anywhere.
    await expect(page.locator('text=MERIDIAN')).toHaveCount(0);

    expect(crashes, `page errors on ${path}`).toEqual([]);
    expect(hard5xx, `5xx on ${path}`).toEqual([]);
  });
}
