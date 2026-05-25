import { test } from '@playwright/test';
import { ensureToken, seedTokenAuth, shot } from './_helpers';

test.describe.configure({ mode: 'serial' });

let TOKEN: string;

test.beforeAll(async ({ request, baseURL }) => {
  TOKEN = await ensureToken(request, baseURL!, 'offtaker');
}, 90_000);

test.beforeEach(async ({ page }) => {
  await seedTokenAuth(page, TOKEN);
});

test('offtaker-workstation', async ({ page }) => {
  await shot(page, '/offtaker/workstation', { dwell: 14_000, waitFor: 'h1, h2' });
});

test('offtaker-procurement-rfp', async ({ page }) => {
  await shot(page, '/procurement', {
    dwell: 14_000,
    waitFor: 'h1, h2',
    interact: async (p) => {
      await p.locator('table tbody tr, [data-test="rfp-row"]').first().click().catch(() => undefined);
      await p.waitForTimeout(800);
    },
  });
});
