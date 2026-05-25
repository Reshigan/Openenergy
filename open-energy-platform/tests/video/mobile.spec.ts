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
import { ensureToken, seedTokenAuth, shot } from './_helpers';

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
  await shot(page, '/launch/trader', { dwell: 10_000, waitFor: 'h1, h2' });
});

test('mobile-pwa-workorder', async ({ page }) => {
  await page.setViewportSize(MOBILE_VIEWPORT);
  await seedTokenAuth(page, ESUMS_TOKEN);
  // Site Bravo (es_site_002) — same site we reference in V/O 5.2.
  await shot(page, '/esums-om/sites/es_site_002', { dwell: 12_000, waitFor: 'h1, h2' });
});

test('mobile-pwa-trade-confirm', async ({ page }) => {
  await page.setViewportSize(MOBILE_VIEWPORT);
  await seedTokenAuth(page, TRADER_TOKEN);
  await shot(page, '/trading', {
    dwell: 10_000,
    waitFor: 'h1, h2',
    interact: async (p) => {
      await p.getByRole('button', { name: /Place order|New order|Order/i }).first().click().catch(() => undefined);
      await p.waitForTimeout(1_200);
    },
  });
});
