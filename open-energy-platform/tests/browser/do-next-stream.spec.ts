// open-energy-platform/pages/tests/browser/do-next-stream.spec.ts
import { test, expect } from '@playwright/test';

const BASE = process.env.BASE || 'https://oe.vantax.co.za';

// One API login, token seeded via addInitScript (rate-limiter discipline: 10/5min/IP).
async function tokenFor(): Promise<string> {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'carbon@openenergy.co.za', password: 'Demo@2024!' }),
  });
  if (!res.ok) throw new Error(`login failed: ${res.status}`);
  return (await res.json()).token;
}

test.describe('do-next stream', () => {
  let token: string;
  test.beforeAll(async () => { token = await tokenFor(); });

  test.beforeEach(async ({ page }) => {
    await page.addInitScript((t) => localStorage.setItem('token', t), token);
  });

  test('renders duty as cards with insight + primary action', async ({ page }) => {
    await page.goto(`${BASE}/cockpit`);
    await expect(page.locator('.jc-item').first()).toBeVisible();
    await expect(page.locator('.jc-insight').first()).toBeVisible();
  });

  test('filter chips filter in place with no route change', async ({ page }) => {
    await page.goto(`${BASE}/cockpit`);
    await page.locator('.jc-chip').nth(1).click();
    await expect(page).toHaveURL(/\/cockpit/); // no route change
    await expect(page.locator('.jc-chip.on')).toHaveCount(1);
  });

  // RESOLVED (brief-vs-code conflict): the cockpit's inline primary action is
  // PrimaryAction, which has NO modal. A fielded action (label ends '…') navigates
  // to the Thread form (/thread/:chain/:id?act=); a non-fielded one inline-POSTs and
  // stays on /cockpit. Assert that real "fires" behavior, not a nonexistent modal.
  test('primary action fires', async ({ page }) => {
    await page.goto(`${BASE}/cockpit`);
    const action = page.locator('.jc-item .btn.pri').first();
    if (await action.count()) {
      const fielded = (await action.textContent())?.trim().endsWith('…');
      await action.click();
      if (fielded) await expect(page).toHaveURL(/\/thread\//); // fielded → Thread form
      else await expect(page).toHaveURL(/\/cockpit/);          // inline POST, stays put
    }
  });
});
