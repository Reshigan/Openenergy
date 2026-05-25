import { test } from '@playwright/test';
import { ensureToken, seedTokenAuth, shot } from './_helpers';

test.describe.configure({ mode: 'serial' });

let TOKEN: string;

test.beforeAll(async ({ request, baseURL }) => {
  TOKEN = await ensureToken(request, baseURL!, 'admin');
}, 90_000);

test.beforeEach(async ({ page }) => {
  await seedTokenAuth(page, TOKEN);
});

test('launch-admin-overview', async ({ page }) => {
  await shot(page, '/launch/admin', { dwell: 14_000, waitFor: 'h1, [data-test="launch-board"]' });
});

test('settlement-cleared-trades', async ({ page }) => {
  await shot(page, '/settlement', { dwell: 12_000, waitFor: 'h1, h2' });
});

test('admin-platform-stats', async ({ page }) => {
  await shot(page, '/admin', { dwell: 12_000, waitFor: 'h1, h2' });
});

test('audit-chain-summary', async ({ page }) => {
  // The admin-side audit summary lives in the admin console. Public audit
  // page is captured in public.spec.ts.
  await shot(page, '/admin', {
    dwell: 12_000,
    waitFor: 'h1, h2',
    interact: async (p) => {
      await p.getByRole('link', { name: /Audit/i }).click().catch(() => undefined);
      await p.getByRole('tab', { name: /Audit/i }).click().catch(() => undefined);
      await p.waitForTimeout(800);
    },
  });
});
