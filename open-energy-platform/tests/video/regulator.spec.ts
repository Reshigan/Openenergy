import { test } from '@playwright/test';
import { ensureToken, seedTokenAuth, shot, smoothScroll, moveCursor, clickTabAndSettle, featureTour } from './_helpers';

test.describe.configure({ mode: 'serial' });

let TOKEN: string;

test.beforeAll(async ({ request, baseURL }) => {
  TOKEN = await ensureToken(request, baseURL!, 'regulator');
}, 90_000);

test.beforeEach(async ({ page }) => {
  await seedTokenAuth(page, TOKEN);
});

test('regulator-surveillance-alerts', async ({ page }) => {
  await shot(page, '/regulator-suite/workstation', {
    dwell: 14_000,
    waitFor: '[data-test^="kpi"], table tbody tr',
    interact: async (p) => {
      await clickTabAndSettle(p, /Surveillance|Alerts/i);
      // Glide to the alert table and click the freshest red flag.
      await smoothScroll(p, 260, 1000);
      await moveCursor(p, 880, 460);
      await p.locator('[data-test="alert-row"], table tbody tr').first()
        .click().catch(() => undefined);
      await p.waitForTimeout(1_100);
    },
  });
});

test('regulator-workstation', async ({ page }) => {
  await shot(page, '/regulator-suite/workstation', {
    dwell: 14_000,
    waitFor: '[data-test^="kpi"]',
    interact: async (p) => {
      await smoothScroll(p, 320, 1000);
      await moveCursor(p, 720, 480);
      await p.locator('[data-test^="kpi"], .card').first()
        .hover().catch(() => undefined);
      await p.waitForTimeout(900);
    },
  });
});

test('regulator-surveillance-rules', async ({ page }) => {
  await shot(page, '/regulator-suite/workstation', {
    dwell: 14_000,
    waitFor: '[data-test^="kpi"]',
    interact: async (p) => {
      await clickTabAndSettle(p, /Rules|Surveillance rules/i);
      // Pan down the rules grid then hover a rule chip for the threshold popover.
      await smoothScroll(p, 240, 1000);
      await p.locator('[data-test="rule-row"], table tbody tr, .card').first()
        .hover().catch(() => undefined);
      await p.waitForTimeout(800);
    },
  });
});

test('regulator-investigation-open', async ({ page }) => {
  await shot(page, '/regulator-suite/workstation', {
    dwell: 14_000,
    waitFor: '[data-test^="kpi"]',
    interact: async (p) => {
      await p.getByRole('button', { name: /Open investigation|Investigate/i }).first().click().catch(() => undefined);
      await p.waitForTimeout(1_200);
      // Type a reason into the first text/textarea field of the modal.
      const reason = p.getByLabel(/Reason|Notes|Summary|Description/i).first();
      await reason.click().catch(() => undefined);
      await p.keyboard.type('Spoofing pattern detected on JNB-east node', { delay: 70 });
      await p.waitForTimeout(900);
    },
  });
});

test('regulator-decisions-list', async ({ page }) => {
  await shot(page, '/regulator-suite/workstation', {
    dwell: 14_000,
    waitFor: '[data-test^="kpi"]',
    interact: async (p) => {
      await clickTabAndSettle(p, /Decisions/i);
      // Smooth-scroll the decision register and hover the latest ruling.
      await smoothScroll(p, 300, 1000);
      await p.locator('[data-test="decision-row"], table tbody tr').first()
        .hover().catch(() => undefined);
      await p.waitForTimeout(800);
    },
  });
});

// ─── End-of-role feature tour ─────────────────────────────────────────
// Closes the regulator arc by panning the launch board — the audience
// sees every other surface (surveillance, licences, tariff filings,
// enforcement, NERSA exports, audit chain, market structure analysis).
test('regulator-feature-tour', async ({ page }) => {
  await shot(page, '/launch/regulator', {
    dwell: 14_000,
    waitFor: '[data-test^="kpi"], a[href^="/"]',
    interact: async (p) => {
      await featureTour(p, 'regulator');
    },
  });
});
