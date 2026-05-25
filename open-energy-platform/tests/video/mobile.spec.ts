// ════════════════════════════════════════════════════════════════════════
// Mobile-PWA recording shots. Captures the SPA at iPhone-14-class
// viewport (390x844) so Act 5.4 of the film can show what the installed
// PWA looks like on a field technician's phone.
//
// Per-test `page.setViewportSize` overrides the global 1920x1080 video
// config — Playwright keeps recording at 1920x1080 letterboxing the
// mobile frame, but for the composite step we crop centered to 390x844.
// (render-master.sh handles the crop via ffmpeg `crop=` filter for any
// shot key starting with `mobile-pwa-`.)
//
// Three shots map 1:1 to the script cue map:
//   mobile-pwa-launch         → trader launch board in mobile chrome
//   mobile-pwa-workorder      → Esums site detail (technician's view)
//   mobile-pwa-trade-confirm  → trader place-order modal
// ════════════════════════════════════════════════════════════════════════

import { test } from '@playwright/test';
import { ensureToken, seedTokenAuth, shot, smoothScroll } from './_helpers';

test.describe.configure({ mode: 'serial' });

const MOBILE_VIEWPORT = { width: 390, height: 844 };

let TRADER_TOKEN: string;
let ESUMS_TOKEN: string;

test.beforeAll(async ({ request, baseURL }) => {
  TRADER_TOKEN = await ensureToken(request, baseURL!, 'trader');
  // Esums O&M screens are reachable by ipp_developer / admin; trader can also
  // open them via the cross-role launch nav, but we use ipp here for realism.
  ESUMS_TOKEN = await ensureToken(request, baseURL!, 'ipp_developer');
}, 90_000);

test('mobile-pwa-launch', async ({ page }) => {
  await page.setViewportSize(MOBILE_VIEWPORT);
  await seedTokenAuth(page, TRADER_TOKEN);
  await shot(page, '/launch/trader', {
    dwell: 12_000,
    waitFor: '[data-test="launch-board"], [data-test^="kpi"]',
    interact: async (p) => {
      // Mobile launchpad: smooth-scroll the tile column so the audience
      // sees there's more below the fold, then ease back up.
      await smoothScroll(p, 360, 1100);
      await p.waitForTimeout(500);
      await smoothScroll(p, 0, 800);
    },
  });
});

test('mobile-pwa-workorder', async ({ page }) => {
  await page.setViewportSize(MOBILE_VIEWPORT);
  await seedTokenAuth(page, ESUMS_TOKEN);
  // Johannesburg Roof Solar 1 — the headline demo site (4 devices, 3 open
  // faults, 2 work orders). Same site we lean on in V/O Beat 5.2.
  await shot(page, '/esums/sites/omsite_jbg_solar1', {
    dwell: 14_000,
    waitFor: 'main, h1',
    interact: async (p) => {
      // Smooth-scroll down to the open work-orders block, then tap the top card.
      await smoothScroll(p, 320, 1100);
      await p.waitForTimeout(400);
      await p.locator('[data-test="work-order-card"], a[href*="work-order"], .card')
        .first().click().catch(() => undefined);
      await p.waitForTimeout(1_200);
    },
  });
});

test('mobile-pwa-trade-confirm', async ({ page }) => {
  await page.setViewportSize(MOBILE_VIEWPORT);
  await seedTokenAuth(page, TRADER_TOKEN);
  await shot(page, '/trading', {
    dwell: 12_000,
    waitFor: 'main, h1',
    interact: async (p) => {
      await p.getByRole('button', { name: /Place order|New order|Order/i }).first()
        .click().catch(() => undefined);
      await p.waitForTimeout(1_200);
      // Type a 25 MWh ticket — at mobile width the field is the only
      // numeric input on screen so this lands reliably.
      const qty = p.getByLabel(/Quantity|MWh|Volume/i).first();
      await qty.click().catch(() => undefined);
      await p.keyboard.type('25', { delay: 70 });
      await p.waitForTimeout(900);
    },
  });
});
