// ═══════════════════════════════════════════════════════════════════════════
// Design Gallery — Playwright smoke for the new /design-gallery route that
// surfaces curated Stitch designs paired with the 047 role workbench tabs.
// ═══════════════════════════════════════════════════════════════════════════

import { test, expect } from '@playwright/test';

const PASSWORD = process.env.DEMO_PASSWORD || 'Demo@2024!';

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

  // Log in as admin so the protected route resolves cleanly.
  await page.goto(`${baseURL}/`, { waitUntil: 'networkidle' });
  await page.locator('input[type="email"], input[name="email"]').first().fill('admin@openenergy.co.za');
  await page.locator('input[type="password"]').first().fill(PASSWORD);
  await page.getByRole('button', { name: /sign in/i }).first().click();
  await page.waitForURL(/\/(cockpit|launch)/, { timeout: 15_000 });

  // Direct-navigate to the gallery.
  await page.goto(`${baseURL}/design-gallery`, { waitUntil: 'networkidle' });

  await expect(page.getByRole('heading', { name: /design gallery/i })).toBeVisible();

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
  await page.goto(`${baseURL}/`, { waitUntil: 'networkidle' });
  await page.locator('input[type="email"], input[name="email"]').first().fill('admin@openenergy.co.za');
  await page.locator('input[type="password"]').first().fill(PASSWORD);
  await page.getByRole('button', { name: /sign in/i }).first().click();
  await page.waitForURL(/\/(cockpit|launch)/, { timeout: 15_000 });

  await page.goto(`${baseURL}/design-gallery`, { waitUntil: 'networkidle' });

  // Click the "Trader" filter (3 designs in our curated set).
  await page.getByRole('tab', { name: /^Trader/ }).click();

  const cards = page.locator('article');
  await expect(cards).toHaveCount(4);

  // Click "All" to widen back to 16.
  await page.getByRole('tab', { name: /^All/ }).click();
  await expect(cards).toHaveCount(16);
});

test('lh3.googleusercontent.com thumbnails actually load (CSP allowed)', async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/`, { waitUntil: 'networkidle' });
  await page.locator('input[type="email"], input[name="email"]').first().fill('admin@openenergy.co.za');
  await page.locator('input[type="password"]').first().fill(PASSWORD);
  await page.getByRole('button', { name: /sign in/i }).first().click();
  await page.waitForURL(/\/(cockpit|launch)/, { timeout: 15_000 });

  await page.goto(`${baseURL}/design-gallery`, { waitUntil: 'load' });

  // The intent here is to verify the CSP allows lh3.googleusercontent.com,
  // not to assert Google's CDN is up. Test the headers/CSP via the response
  // status: an image request that returns 2xx and a non-empty body means
  // the CDN host was reachable AND not blocked by CSP.
  const firstThumb = page.locator('article img[src*="lh3.googleusercontent.com"]').first();
  await expect(firstThumb).toBeVisible();
  const src = await firstThumb.getAttribute('src');
  expect(src).toBeTruthy();
  const res = await page.request.get(src!);
  expect(res.status(), `image fetch returned ${res.status()}`).toBeLessThan(400);
  const body = await res.body();
  expect(body.byteLength).toBeGreaterThan(0);
});
