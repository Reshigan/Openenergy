import { test } from '@playwright/test';
import { ensureToken, seedTokenAuth, shot } from './_helpers';

test.describe.configure({ mode: 'serial' });

let TOKEN: string;

test.beforeAll(async ({ request, baseURL }) => {
  TOKEN = await ensureToken(request, baseURL!, 'carbon_fund');
}, 90_000);

test.beforeEach(async ({ page }) => {
  await seedTokenAuth(page, TOKEN);
});

test('carbon-portfolio', async ({ page }) => {
  await shot(page, '/carbon', { dwell: 14_000, waitFor: 'h1, h2' });
});

test('carbon-issuance-queue', async ({ page }) => {
  await shot(page, '/carbon', {
    dwell: 12_000,
    waitFor: 'h1, h2',
    interact: async (p) => {
      await p.getByRole('tab', { name: /Issuance|Issue/i }).click().catch(() => undefined);
      await p.waitForTimeout(800);
    },
  });
});
