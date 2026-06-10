// ═══════════════════════════════════════════════════════════════════════════
// Design Gallery — Playwright smoke for the new /design-gallery route that
// surfaces curated Stitch designs paired with the 047 role workbench tabs.
// ═══════════════════════════════════════════════════════════════════════════

import { test, expect } from '@playwright/test';

let SHARED_ADMIN_TOKEN: string | null = null;

test.beforeAll(() => {
  const tok = process.env.PLAYWRIGHT_ADMIN_TOKEN;
  if (!tok) throw new Error('PLAYWRIGHT_ADMIN_TOKEN not set — global-setup may have failed');
  SHARED_ADMIN_TOKEN = tok;
});

async function seedToken(page: import('@playwright/test').Page) {
  if (!SHARED_ADMIN_TOKEN) throw new Error('shared admin token not initialised');
  const tokenValue = SHARED_ADMIN_TOKEN;
  await page.route('**/api/auth/refresh', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data: { token: tokenValue, expires_in: 3600 } }),
    });
  });
  await page.addInitScript((tok) => {
    localStorage.setItem('token', tok as string);
  }, tokenValue);
}

function isBenign(msg: string): boolean {
  return (
    msg.includes('ServiceWorkerRegistration') ||
    msg.includes('Failed to load resource: the server responded with a status of 404')
  );
}

test('design gallery loads behind auth and renders 16 cards', async ({ page, baseURL }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console.error: ${m.text()}`); });

  await seedToken(page);
  await page.goto(`${baseURL}/design-gallery`, { waitUntil: 'load' });

  await expect(page.getByRole('heading', { name: /design gallery/i })).toBeVisible({ timeout: 25_000 });

  // Filter chips — at minimum the persona buttons plus All.
  const filterChips = page.locator('[role="tab"]');
  await expect(filterChips.first()).toBeVisible();

  // Cards — there are 16 curated designs.
  const cards = page.locator('article');
  await expect(cards).toHaveCount(16);

  // Each card has an image, persona pill, title, and Open route link.
  const firstCard = cards.first();
  await expect(firstCard.locator('img').first()).toBeVisible();
  await expect(firstCard.getByText(/open route/i)).toBeVisible();
  await expect(firstCard.getByText(/full design/i)).toBeVisible();

  const real = errors.filter((e) => !isBenign(e));
  expect(real, real.join('\n')).toEqual([]);
});

test('filtering by persona narrows the card set', async ({ page, baseURL }) => {
  await seedToken(page);
  await page.goto(`${baseURL}/design-gallery`, { waitUntil: 'load' });

  await expect(page.getByRole('heading', { name: /design gallery/i })).toBeVisible({ timeout: 25_000 });

  // Click the "Trader" filter (4 designs in our curated set).
  await page.getByRole('tab', { name: /^Trader/ }).click();

  const cards = page.locator('article');
  await expect(cards).toHaveCount(4);

  // Click "All" to widen back to 16.
  await page.getByRole('tab', { name: /^All/ }).click();
  await expect(cards).toHaveCount(16);
});

test('lh3.googleusercontent.com thumbnails are not blocked by CSP', async ({ page, baseURL }) => {
  await seedToken(page);

  // Watch for CSP violations on the gallery navigation.
  const cspViolations: string[] = [];
  await page.exposeFunction('__recordCspViolation', (uri: string) => { cspViolations.push(uri); });
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (e: any) => {
      // @ts-expect-error — bridge to test scope
      window.__recordCspViolation(e.blockedURI);
    });
  });

  await page.goto(`${baseURL}/design-gallery`, { waitUntil: 'load' });

  await expect(page.getByRole('heading', { name: /design gallery/i })).toBeVisible({ timeout: 25_000 });

  // At least one image element with an lh3 src must be in the DOM.
  const firstThumb = page.locator('article img[src*="lh3.googleusercontent.com"]').first();
  await expect(firstThumb).toBeVisible();
  const src = await firstThumb.getAttribute('src');
  expect(src).toMatch(/^https:\/\/lh3\.googleusercontent\.com\//);

  // No CSP violation against the Google CDN host fired during page load.
  const blockedGoogleThumb = cspViolations.find((u) => u.includes('lh3.googleusercontent.com'));
  expect(blockedGoogleThumb, `CSP blocked: ${blockedGoogleThumb}`).toBeUndefined();
});
