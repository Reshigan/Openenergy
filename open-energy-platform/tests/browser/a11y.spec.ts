// ═══════════════════════════════════════════════════════════════════════════
// Accessibility audit — runs axe-core against the public pages.
//
// POPIA Section 24 (right to information in accessible form) means we have
// a legal obligation to keep the SPA broadly accessible. WCAG 2.2 AA is the
// common interpretation. We assert no axe-core violations of `wcag22aa`
// severity on the unauthenticated routes.
//
// Authenticated pages can be audited too, but they require a stable login
// flow inside the test and consume rate-limit budget. Public pages are the
// highest-traffic surface and the test that catches the most regressions.
// ═══════════════════════════════════════════════════════════════════════════

import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const PUBLIC_ROUTES = [
  { path: '/',                 name: 'login page (SPA shell)' },
  { path: '/forgot-password',  name: 'forgot password' },
  { path: '/login',            name: 'login alias' },
];

for (const route of PUBLIC_ROUTES) {
  test(`a11y: ${route.name} — no serious/critical WCAG 2.2 AA violations`, async ({ page, baseURL }) => {
    await page.goto(`${baseURL}${route.path}`, { waitUntil: 'networkidle' });

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze();

    // Block on serious + critical; warn-only on minor/moderate (those tend
    // to need design judgement rather than code fixes).
    const blocking = results.violations.filter(
      (v) => v.impact === 'serious' || v.impact === 'critical',
    );

    if (blocking.length > 0) {
      const summary = blocking.map((v) => {
        const nodes = v.nodes.slice(0, 3).map((n) => `      • ${n.target.join(', ')}`).join('\n');
        return `  [${v.impact}] ${v.id}: ${v.help}\n    ${v.helpUrl}\n${nodes}`;
      }).join('\n\n');
      throw new Error(`Found ${blocking.length} blocking a11y violation(s):\n${summary}`);
    }

    expect(blocking.length).toBe(0);
  });
}

test('a11y: every form input on the login page has an associated label', async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/`, { waitUntil: 'networkidle' });

  // Native pattern — each <input> should have either a wrapping label, an
  // id matched by <label for>, or an aria-label. axe checks this but we
  // add an explicit count assertion for the login form specifically since
  // it's the most-visited public form.
  const inputs = page.locator('form input:not([type="hidden"])');
  const count = await inputs.count();
  expect(count).toBeGreaterThan(0);

  for (let i = 0; i < count; i++) {
    const input = inputs.nth(i);
    const id = await input.getAttribute('id');
    const ariaLabel = await input.getAttribute('aria-label');
    const ariaLabelledBy = await input.getAttribute('aria-labelledby');
    const hasLabel = id ? (await page.locator(`label[for="${id}"]`).count()) > 0 : false;
    expect(
      hasLabel || !!ariaLabel || !!ariaLabelledBy,
      `Input #${i} (id="${id ?? ''}") has no accessible label`,
    ).toBe(true);
  }
});
