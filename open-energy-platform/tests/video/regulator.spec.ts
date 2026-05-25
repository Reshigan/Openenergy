import { test } from '@playwright/test';
import { ensureToken, seedTokenAuth, shot } from './_helpers';

test.describe.configure({ mode: 'serial' });

let TOKEN: string;

test.beforeAll(async ({ request, baseURL }) => {
  TOKEN = await ensureToken(request, baseURL!, 'regulator');
}, 90_000);

test.beforeEach(async ({ page }) => {
  await seedTokenAuth(page, TOKEN);
});

test('regulator-surveillance-alerts', async ({ page }) => {
  await shot(page, '/admin', {
    dwell: 14_000,
    waitFor: 'h1, h2',
    interact: async (p) => {
      await p.getByRole('tab', { name: /Surveillance|Alerts/i }).click().catch(() => undefined);
      await p.waitForTimeout(800);
    },
  });
});

test('regulator-workstation', async ({ page }) => {
  await shot(page, '/regulator/workstation', { dwell: 14_000, waitFor: 'h1, h2' });
});

test('regulator-surveillance-rules', async ({ page }) => {
  await shot(page, '/regulator/workstation', {
    dwell: 12_000,
    waitFor: 'h1, h2',
    interact: async (p) => {
      await p.getByRole('tab', { name: /Rules|Surveillance rules/i }).click().catch(() => undefined);
      await p.waitForTimeout(800);
    },
  });
});

test('regulator-investigation-open', async ({ page }) => {
  await shot(page, '/regulator/workstation', {
    dwell: 12_000,
    waitFor: 'h1, h2',
    interact: async (p) => {
      await p.getByRole('button', { name: /Open investigation|Investigate/i }).first().click().catch(() => undefined);
      await p.waitForTimeout(1_200);
    },
  });
});

test('regulator-decisions-list', async ({ page }) => {
  await shot(page, '/regulator/workstation', {
    dwell: 12_000,
    waitFor: 'h1, h2',
    interact: async (p) => {
      await p.getByRole('tab', { name: /Decisions/i }).click().catch(() => undefined);
      await p.waitForTimeout(800);
    },
  });
});
