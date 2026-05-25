import { test } from '@playwright/test';
import { ensureToken, seedTokenAuth, shot } from './_helpers';

test.describe.configure({ mode: 'serial' });

let TOKEN: string;

test.beforeAll(async ({ request, baseURL }) => {
  TOKEN = await ensureToken(request, baseURL!, 'ipp_developer');
}, 90_000);

test.beforeEach(async ({ page }) => {
  await seedTokenAuth(page, TOKEN);
});

test('ipp-projects-list', async ({ page }) => {
  await shot(page, '/projects', { dwell: 14_000, waitFor: 'h1, h2' });
});

test('ipp-project-detail-financial-model', async ({ page }) => {
  await shot(page, '/projects', {
    dwell: 14_000,
    waitFor: 'h1, h2',
    interact: async (p) => {
      // Open the first project row, then the financial-model tab if present.
      await p.locator('table tbody tr, [data-test="project-row"]').first().click().catch(() => undefined);
      await p.waitForTimeout(800);
      await p.getByRole('tab', { name: /Financial|Model/i }).click().catch(() => undefined);
      await p.waitForTimeout(800);
    },
  });
});

test('ipp-workstation', async ({ page }) => {
  await shot(page, '/ipp/workstation', { dwell: 14_000, waitFor: 'h1, h2' });
});

test('ipp-drawdown-request', async ({ page }) => {
  await shot(page, '/ipp/workstation', {
    dwell: 12_000,
    waitFor: 'h1, h2',
    interact: async (p) => {
      await p.getByRole('button', { name: /Drawdown|Request draw/i }).first().click().catch(() => undefined);
      await p.waitForTimeout(1_200);
    },
  });
});
