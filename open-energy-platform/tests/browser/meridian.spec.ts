// ═══════════════════════════════════════════════════════════════════════════
// Meridian browser smoke — Horizon board at /horizon.
//
// Read-only: we assert the board chrome (bucket header, lanes-or-empty),
// the duty stream aside and the MERIDIAN wordmark render for the lender
// persona. We do NOT fire duty-stream actions — chain-write coverage lives
// in the per-wave unit suites.
//
// Zero logins in this file: globalSetup already authenticated all 9 demo
// roles and stashed tokens in PLAYWRIGHT_{ROLE}_TOKEN env vars. Reusing
// PLAYWRIGHT_LENDER_TOKEN keeps us inside the 10 / 5 min sensitive-route
// rate-limit budget (same pattern as workstations.spec.ts).
// ═══════════════════════════════════════════════════════════════════════════

import { test, expect } from '@playwright/test';

let SHARED_LENDER_TOKEN: string | null = null;

test.beforeAll(() => {
  const tok = process.env.PLAYWRIGHT_LENDER_TOKEN;
  if (!tok) throw new Error('PLAYWRIGHT_LENDER_TOKEN not set — global-setup may have failed');
  SHARED_LENDER_TOKEN = tok;
});

async function seedToken(page: import('@playwright/test').Page) {
  if (!SHARED_LENDER_TOKEN) throw new Error('shared lender token not initialised');
  const tokenValue = SHARED_LENDER_TOKEN;

  // AuthContext bootstraps via httpOnly cookie refresh which isn't available
  // in headless Playwright. Intercept /auth/refresh to return a valid access
  // token; AuthContext then calls /auth/me with the Bearer JWT and succeeds.
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
  }, tokenValue);
}

function isBenign(msg: string): boolean {
  // Same noise filter as workstations.spec.ts: the generic non-2xx
  // console.error has no URL (real 5xx is caught via the response listener),
  // and ServiceWorker / cdnfonts 404s are pre-existing prod noise.
  return (
    msg.includes('ServiceWorkerRegistration') ||
    msg.includes('Failed to load resource: the server responded with a status of') ||
    msg.includes('notifications/unread-count') ||
    msg.includes('ERR_CONNECTION_CLOSED')
  );
}

test.describe('Meridian Horizon', () => {
  test('lender horizon renders board + duty stream', async ({ page, baseURL }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    page.on('console', (msg) => { if (msg.type() === 'error') errors.push(`console.error: ${msg.text()}`); });
    // Response-level 5xx capture — gives us the URL, which the generic
    // "Failed to load resource" console-error message hides.
    page.on('response', (resp) => {
      const s = resp.status();
      if (s >= 500 && resp.url().includes('/api/')) {
        errors.push(`api.5xx: ${s} ${resp.url()}`);
      }
    });

    await seedToken(page);
    await page.goto(`${baseURL}/horizon`, { waitUntil: 'load' });

    // Lazy bundle + "Computing horizon…" loading state precede the board.
    // 25s gives React time to download the chunk and resolve /api/horizon/lender.
    await expect(page.locator('.mer.horizon')).toBeVisible({ timeout: 25_000 });

    // Header chrome.
    await expect(page.locator('.wordmark')).toHaveText('MERIDIAN');

    // Board: section[aria-label="Live cases by time to consequence"] with the
    // six-bucket header row; first bucket is BREACHED.
    const board = page.getByRole('region', { name: 'Live cases by time to consequence' });
    await expect(board).toBeVisible();
    await expect(board.locator('.board-head')).toContainText('BREACHED');

    // Lanes are data-dependent: local D1 may have zero lender chain rows.
    // Either at least one lane row renders, or the explicit empty state does.
    const laneOrEmpty = board.locator('.lane-row, .board-empty');
    await expect(laneOrEmpty.first()).toBeVisible();

    // Duty stream: aside[aria-label="Duty stream"] with its ranked header.
    const duty = page.getByRole('complementary', { name: 'Duty stream' });
    await expect(duty).toBeVisible();
    await expect(duty.locator('.duty-head h2')).toHaveText('DUTY STREAM');

    const real = errors.filter((e) => !isBenign(e));
    expect(real, real.join('\n')).toEqual([]);
  });
});
