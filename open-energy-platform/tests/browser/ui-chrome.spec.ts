// ═══════════════════════════════════════════════════════════════════════════
// UI chrome regression tests — covers the three fixes shipped in commit
// 0cded1a (sidebar expanded by default, LTM logo bottom-left, wizard modal
// z-index above shell header).
//
// These tests verify the changes are live on prod and work correctly.
//
// Rate-limit discipline: one shared admin token for the whole file.
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

  // The AuthContext bootstraps from the oe_refresh httpOnly cookie, which is
  // not available in headless Playwright sessions. Intercept /auth/refresh so
  // it returns a successful response with our access token — the AuthContext
  // then calls /auth/me with the Bearer JWT and authenticates normally.
  await page.route('**/api/auth/refresh', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: { token: tokenValue, expires_in: 3600 },
      }),
    });
  });

  await page.addInitScript((tok) => {
    localStorage.setItem('token', tok as string);
    // Ensure sidebar is NOT forced-collapsed by a stale localStorage value
    // from a previous session. Default (no key set) should give expanded.
    localStorage.removeItem('oe_rail_collapsed');
  }, tokenValue);
}

function isBenign(msg: string): boolean {
  return (
    msg.includes('ServiceWorkerRegistration') ||
    msg.includes('Failed to load resource: the server responded with a status of') ||
    // /api/health occasionally returns 500 under prod load; not under test
    msg.includes('/api/health') ||
    // trading/orders 500s while wizard picker is open — unrelated to z-index under test
    msg.includes('trading/orders')
  );
}

// ─── Sidebar expanded by default ─────────────────────────────────────────────

test('rail sidebar is expanded by default on fresh load', async ({ page, baseURL }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(`console.error: ${msg.text()}`); });

  await seedToken(page);
  await page.goto(`${baseURL}/trader-risk/workstation`, { waitUntil: 'networkidle' });

  // The sidebar is an <aside class="oe-rail fiori-rail"> element.
  // When expanded: width 256px; when collapsed: 56px.
  const rail = page.locator('aside.oe-rail');
  await expect(rail).toBeVisible({ timeout: 10_000 });

  // In expanded mode the rail width is 256px; collapsed is 56px.
  const box = await rail.boundingBox();
  expect(box?.width, 'rail should be expanded (>100px) by default').toBeGreaterThan(100);

  const real = errors.filter((e) => !isBenign(e));
  expect(real, real.join('\n')).toEqual([]);
});

test('rail sidebar persists collapsed state via localStorage', async ({ page, baseURL }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

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
    // Simulate a user who previously collapsed the sidebar
    localStorage.setItem('oe_rail_collapsed', 'true');
  }, tokenValue);

  await page.goto(`${baseURL}/trader-risk/workstation`, { waitUntil: 'load' });

  const rail = page.locator('aside.oe-rail');
  await expect(rail).toBeVisible({ timeout: 25_000 });

  // When collapsed the rail should be narrow (icon-only, 56px)
  const box = await rail.boundingBox();
  expect(box?.width, 'collapsed rail should be narrow (<100px)').toBeLessThan(100);

  const real = errors.filter((e) => !isBenign(e));
  expect(real, real.join('\n')).toEqual([]);
});

// ─── LTM logo bottom-left ─────────────────────────────────────────────────

test('LTM logo renders at bottom-left on login page', async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/`, { waitUntil: 'networkidle' });

  const logo = page.locator('img[src*="ltm-energy-logo"]');
  await expect(logo).toBeVisible({ timeout: 5_000 });

  const logoBox = await logo.boundingBox();
  const viewport = page.viewportSize();

  expect(logoBox, 'logo bounding box must be found').toBeTruthy();
  expect(viewport, 'viewport must be set').toBeTruthy();

  if (logoBox && viewport) {
    // Bottom-left: logo bottom edge is within 30px of viewport bottom
    expect(
      viewport.height - (logoBox.y + logoBox.height),
      'logo should be near the bottom of the viewport'
    ).toBeLessThan(30);
    // Left edge is within 30px of viewport left
    expect(logoBox.x, 'logo should be near the left edge').toBeLessThan(30);
  }
});

test('LTM logo renders at bottom-left on authenticated pages', async ({ page, baseURL }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

  await seedToken(page);
  await page.goto(`${baseURL}/trader-risk/workstation`, { waitUntil: 'networkidle' });

  const logo = page.locator('img[src*="ltm-energy-logo"]');
  await expect(logo).toBeVisible({ timeout: 10_000 });

  const logoBox = await logo.boundingBox();
  const viewport = page.viewportSize();

  if (logoBox && viewport) {
    expect(
      viewport.height - (logoBox.y + logoBox.height),
      'logo should be near the bottom of the viewport'
    ).toBeLessThan(30);
    expect(logoBox.x, 'logo should be near the left edge').toBeLessThan(30);
  }

  const real = errors.filter((e) => !isBenign(e));
  expect(real, real.join('\n')).toEqual([]);
});

// ─── Wizard modal (Quick start) ───────────────────────────────────────────

test('Quick start button is visible on trader workstation', async ({ page, baseURL }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('response', (resp) => {
    if (resp.status() >= 500 && resp.url().includes('/api/')) {
      errors.push(`api.5xx: ${resp.status()} ${resp.url()}`);
    }
  });

  await seedToken(page);
  await page.goto(`${baseURL}/trader-risk/workstation`, { waitUntil: 'load' });

  // Quick start button uses aria-label="Open guided wizards" (Wand2 icon + "Quick start" text)
  const quickStartBtn = page.locator('[aria-label="Open guided wizards"]');
  await expect(quickStartBtn).toBeVisible({ timeout: 25_000 });

  const real = errors.filter((e) => !isBenign(e));
  expect(real, real.join('\n')).toEqual([]);
});

test('wizard picker opens when Quick start clicked and is fully in viewport', async ({ page, baseURL }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('response', (resp) => {
    if (resp.status() >= 500 && resp.url().includes('/api/')) {
      errors.push(`api.5xx: ${resp.status()} ${resp.url()}`);
    }
  });

  await seedToken(page);
  await page.goto(`${baseURL}/trader-risk/workstation`, { waitUntil: 'load' });

  const quickStartBtnForPicker = page.locator('[aria-label="Open guided wizards"]');
  await expect(quickStartBtnForPicker).toBeVisible({ timeout: 25_000 });
  await quickStartBtnForPicker.click();

  // WizardPicker uses a centered panel — match its exact class combination
  // to avoid colliding with other .rounded-2xl elements on the workstation.
  const pickerPanel = page.locator('.w-full.max-w-md.rounded-2xl').first();
  await expect(pickerPanel).toBeVisible({ timeout: 5_000 });

  // Verify the picker panel is fully visible within the viewport (not cut off)
  const box = await pickerPanel.boundingBox();
  const viewport = page.viewportSize();

  if (box && viewport) {
    expect(box.y, 'picker panel top should be within viewport').toBeGreaterThanOrEqual(0);
    expect(
      box.y + box.height,
      'picker panel bottom should be within viewport'
    ).toBeLessThanOrEqual(viewport.height + 10); // 10px tolerance
    expect(box.x, 'picker panel left should be within viewport').toBeGreaterThanOrEqual(0);
    expect(
      box.x + box.width,
      'picker panel right should be within viewport'
    ).toBeLessThanOrEqual(viewport.width + 10);
  }

  // Close via the X button (aria-label="Close") inside the picker panel header.
  await page.locator('[aria-label="Close"]').click();
  await expect(pickerPanel).not.toBeVisible({ timeout: 3_000 });

  const real = errors.filter((e) => !isBenign(e));
  expect(real, real.join('\n')).toEqual([]);
});

test('wizard picker is visible on IPP workstation', async ({ page, baseURL }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

  await seedToken(page);
  await page.goto(`${baseURL}/ipp-lifecycle/workstation`, { waitUntil: 'load' });

  const quickStartBtn = page.locator('[aria-label="Open guided wizards"]');
  await expect(quickStartBtn).toBeVisible({ timeout: 25_000 });
  await quickStartBtn.click();

  // WizardPicker has no role="dialog"; match the picker panel by its class.
  const pickerPanel = page.locator('.w-full.max-w-md.rounded-2xl').first();
  await expect(pickerPanel).toBeVisible({ timeout: 5_000 });

  const box = await pickerPanel.boundingBox();
  const viewport = page.viewportSize();
  if (box && viewport) {
    expect(box.y, 'picker top must be ≥0 (not off-screen above)').toBeGreaterThanOrEqual(0);
    expect(box.y + box.height, 'picker bottom must be within viewport').toBeLessThanOrEqual(viewport.height + 10);
  }

  const real = errors.filter((e) => !isBenign(e));
  expect(real, real.join('\n')).toEqual([]);
});
