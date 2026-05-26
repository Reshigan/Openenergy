import { test } from '@playwright/test';
import { ensureToken, seedTokenAuth, shot, smoothScroll, moveCursor, clickTabAndSettle, featureTour } from './_helpers';

test.describe.configure({ mode: 'serial' });

let TOKEN: string;

test.beforeAll(async ({ request, baseURL }) => {
  TOKEN = await ensureToken(request, baseURL!, 'grid_operator');
}, 90_000);

test.beforeEach(async ({ page }) => {
  await seedTokenAuth(page, TOKEN);
});

test('grid-frequency-chart-live', async ({ page }) => {
  await shot(page, '/grid', {
    dwell: 16_000,
    waitFor: '[data-test^="kpi"], canvas, svg',
    interact: async (p) => {
      // Glide the cursor along the frequency trace so the tooltip
      // surfaces a live 49.98/50.01 Hz value.
      await smoothScroll(p, 220, 900);
      await moveCursor(p, 600, 480);
      await p.locator('canvas, svg, [data-test="freq-chart"]').first()
        .hover({ position: { x: 200, y: 80 } }).catch(() => undefined);
      await p.waitForTimeout(800);
      await moveCursor(p, 1100, 480);
      await p.waitForTimeout(800);
    },
  });
});

test('grid-congestion-map', async ({ page }) => {
  await shot(page, '/grid', {
    dwell: 14_000,
    waitFor: '[data-test^="kpi"], canvas, svg',
    interact: async (p) => {
      await clickTabAndSettle(p, /Congestion|Map/i);
      // Hover a congested zone polygon and then click to open its panel.
      await smoothScroll(p, 200, 900);
      const zone = p.locator('[data-test="zone-polygon"], svg path, .zone').first();
      await zone.hover().catch(() => undefined);
      await p.waitForTimeout(700);
      await zone.click().catch(() => undefined);
      await p.waitForTimeout(1_100);
    },
  });
});

test('grid-operator-workstation', async ({ page }) => {
  await shot(page, '/grid-operator/workstation', {
    dwell: 14_000,
    waitFor: '[data-test^="kpi"]',
    interact: async (p) => {
      await smoothScroll(p, 300, 1000);
      await moveCursor(p, 800, 480);
      await p.locator('[data-test^="kpi"], .card').first()
        .hover().catch(() => undefined);
      await p.waitForTimeout(900);
    },
  });
});

test('grid-frequency-live', async ({ page }) => {
  await shot(page, '/grid-operator/workstation', {
    dwell: 14_000,
    waitFor: '[data-test^="kpi"]',
    interact: async (p) => {
      await clickTabAndSettle(p, /Frequency|Live/i);
      // Glide along the live frequency chart so the data-point tooltip fires.
      await smoothScroll(p, 200, 900);
      await p.locator('canvas, svg, [data-test="freq-chart"]').first()
        .hover({ position: { x: 320, y: 120 } }).catch(() => undefined);
      await p.waitForTimeout(800);
    },
  });
});

test('grid-curtailment-event', async ({ page }) => {
  await shot(page, '/grid-operator/workstation', {
    dwell: 14_000,
    waitFor: '[data-test^="kpi"]',
    interact: async (p) => {
      await clickTabAndSettle(p, /Curtailment/i);
      // Drill into the freshest curtailment event so the cause-chain pane
      // (renewable headroom → reserve margin → instruction) paints.
      await smoothScroll(p, 260, 1000);
      await p.locator('[data-test="curtailment-row"], table tbody tr').first()
        .click().catch(() => undefined);
      await p.waitForTimeout(1_200);
    },
  });
});

// ─── End-of-role feature tour ─────────────────────────────────────────
// Closes the grid-operator arc by panning the launch board — frequency,
// congestion, curtailment, redispatch, reserve margin, ancillary
// services, outage planning, system operator audit chain.
test('grid-feature-tour', async ({ page }) => {
  await shot(page, '/launch/grid_operator', {
    dwell: 14_000,
    waitFor: '[data-test^="kpi"], a[href^="/"]',
    interact: async (p) => {
      await featureTour(p, 'grid_operator');
    },
  });
});
