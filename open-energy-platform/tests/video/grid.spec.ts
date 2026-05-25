import { test } from '@playwright/test';
import { ensureToken, seedTokenAuth, shot } from './_helpers';

test.describe.configure({ mode: 'serial' });

let TOKEN: string;

test.beforeAll(async ({ request, baseURL }) => {
  TOKEN = await ensureToken(request, baseURL!, 'grid_operator');
}, 90_000);

test.beforeEach(async ({ page }) => {
  await seedTokenAuth(page, TOKEN);
});

test('grid-frequency-chart-live', async ({ page }) => {
  await shot(page, '/grid', { dwell: 14_000, waitFor: 'h1, h2' });
});

test('grid-congestion-map', async ({ page }) => {
  await shot(page, '/grid', {
    dwell: 12_000,
    waitFor: 'h1, h2',
    interact: async (p) => {
      await p.getByRole('tab', { name: /Congestion|Map/i }).click().catch(() => undefined);
      await p.waitForTimeout(800);
    },
  });
});

test('grid-operator-workstation', async ({ page }) => {
  await shot(page, '/grid/workstation', { dwell: 14_000, waitFor: 'h1, h2' });
});

test('grid-frequency-live', async ({ page }) => {
  await shot(page, '/grid/workstation', {
    dwell: 12_000,
    waitFor: 'h1, h2',
    interact: async (p) => {
      await p.getByRole('tab', { name: /Frequency|Live/i }).click().catch(() => undefined);
      await p.waitForTimeout(800);
    },
  });
});

test('grid-curtailment-event', async ({ page }) => {
  await shot(page, '/grid/workstation', {
    dwell: 12_000,
    waitFor: 'h1, h2',
    interact: async (p) => {
      await p.getByRole('tab', { name: /Curtailment/i }).click().catch(() => undefined);
      await p.waitForTimeout(800);
    },
  });
});
