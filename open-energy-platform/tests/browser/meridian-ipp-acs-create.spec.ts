// ═══════════════════════════════════════════════════════════════════════════
// Meridian Ledger CREATE smoke — schema-driven "+New" initiation on the
// ipp_acs chain (IPP annual compliance assessment, Wave 188) at
// /ledger/ipp_acs, driven as the IPP developer persona.
//
// WHAT THIS PROVES (the create vertical-slice for the Meridian Ledger):
//   1. LedgerPage renders for ipp_acs against live prod data, then the toolbar
//      initiation button ("New compliance assessment") opens the FieldForm
//      veil dialog (the registry sets a non-null initiation block; the
//      ipp_developer role can view + initiate, so the +New button is present).
//   2. The composer carries the exact registry-driven field schema: the two
//      required fields (#ff-assessment_year, #ff-plant_mw) plus every optional
//      field. We fill every text/number field and leave the async ipp-projects
//      lookup (#ff-project_id) at its default — it is optional.
//   3. Submit fires POST /api/ipp-annual-compliance-assessments and the handler
//      returns 201 with a fresh id at body.data.id (format ipp_acs_<uuid>),
//      then the dialog unmounts (composeOpen -> false closes the veil).
//   4. No 5xx on any /api/ call and no non-benign console / page errors.
//
// WHY THE IPP TOKEN: the POST handler gates on WRITE_ROLES =
// ['admin','ipp_developer'] (src/routes/ipp-annual-compliance-assessments.ts).
// The IPP persona's JWT role is the suffixed form ipp_developer, which is a
// write party, so the create succeeds (201) rather than 403. ipp_developer
// also passes the GET /api/ledger/ipp_acs viewer gate via its lane.
//
// WHY THIS IS PROD-SAFE TO RE-RUN: create mints a fresh UUID per row
// (id = ipp_acs_${crypto.randomUUID()}), so each run inserts a brand-new
// assessment row and never collides with shared prod data. We therefore assert
// on the POST status + the returned id, not on any specific table row. The new
// row lands in chain_status='assessment_triggered' (non-terminal) — no
// irreversible downstream transition is forced by the create itself.
//
// Zero logins in this file: global-setup already authenticated all 9 demo
// roles and stashed tokens in PLAYWRIGHT_{ROLE}_TOKEN env vars. Reusing
// PLAYWRIGHT_IPP_TOKEN once (single-login token reuse) keeps us inside the
// 10 / 5 min sensitive-route rate-limit budget (same pattern as
// meridian-ledger.spec.ts / meridian.spec.ts / workstations.spec.ts).
// ═══════════════════════════════════════════════════════════════════════════

import { test, expect } from '@playwright/test';

let SHARED_IPP_TOKEN: string | null = null;

test.beforeAll(() => {
  const tok = process.env.PLAYWRIGHT_IPP_TOKEN;
  if (!tok) throw new Error('PLAYWRIGHT_IPP_TOKEN not set — global-setup may have failed');
  SHARED_IPP_TOKEN = tok;
});

// Copied verbatim from meridian-ledger.spec.ts (retargeted to the IPP token):
// AuthContext bootstraps via an httpOnly cookie refresh which isn't available
// in headless Playwright. Intercept /auth/refresh to return a valid access
// token; AuthContext then calls /auth/me with the Bearer JWT and succeeds.
async function seedToken(page: import('@playwright/test').Page, token?: string) {
  const tokenValue = token ?? SHARED_IPP_TOKEN;
  if (!tokenValue) throw new Error('shared ipp token not initialised');

  await page.route('**/api/auth/refresh', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: { token: tokenValue, expires_in: 3600 },
      }),
    });
  });

  await page.addInitScript((tok) => {
    localStorage.setItem('token', tok as string);
  }, tokenValue);
}

function isBenign(msg: string): boolean {
  // Same noise filter as meridian.spec.ts / meridian-ledger.spec.ts /
  // workstations.spec.ts.
  return (
    msg.includes('ServiceWorkerRegistration') ||
    msg.includes('Failed to load resource: the server responded with a status of') ||
    msg.includes('notifications/unread-count') ||
    msg.includes('ERR_CONNECTION_CLOSED')
  );
}

// Wire up pageerror / console.error / api-5xx capture on a page (mirrors the
// captureErrors helper in meridian-ledger.spec.ts; response listener gives us
// the URL the generic "Failed to load resource" console message hides).
function captureErrors(p: import('@playwright/test').Page, errors: string[]) {
  p.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  p.on('console', (msg) => { if (msg.type() === 'error') errors.push(`console.error: ${msg.text()}`); });
  p.on('response', (resp) => {
    const s = resp.status();
    if (s >= 500 && resp.url().includes('/api/')) {
      errors.push(`api.5xx: ${s} ${resp.url()}`);
    }
  });
}

test.describe('Meridian Ledger CREATE — ipp_acs', () => {
  test('+New composer creates an assessment (POST 201 + new id) then closes', async ({ page, baseURL }) => {
    const errors: string[] = [];
    captureErrors(page, errors);

    await seedToken(page);
    await page.goto(`${baseURL}/ledger/ipp_acs`, { waitUntil: 'load' });

    // Lazy chunk + "Loading ledger…" precede the board; 25s for the chunk to
    // download and GET /api/ledger/ipp_acs to resolve. Navigating without
    // ?compose=1 and clicking the toolbar button is more deterministic than
    // racing the compose=1 effect against the data fetch.
    await expect(page.locator('.mer.ledger')).toBeVisible({ timeout: 25_000 });

    // The +New toolbar button renders the literal initiation.label.
    const newButton = page.getByRole('button', { name: 'New compliance assessment' });
    await expect(newButton).toBeVisible();
    await newButton.click();

    // The composer is a veil dialog with aria-label = initiation.label.
    const dialog = page.getByRole('dialog', { name: 'New compliance assessment' });
    await expect(dialog).toBeVisible();

    // Schema-driven fields from MERIDIAN_CHAINS['ipp_acs'].initiation.fields.
    // Use the deterministic id locators (#ff-<key>) — getByLabel folds the
    // " *" required marker and the " · MW"/" · kV" unit span into the
    // accessible name, so ids are the unambiguous selector.
    const assessmentYear = dialog.locator('#ff-assessment_year');
    const plantMw = dialog.locator('#ff-plant_mw');
    await expect(assessmentYear).toBeVisible();
    await expect(plantMw).toBeVisible();

    // Required fields (the only two the handler hard-requires; 400 otherwise).
    await assessmentYear.fill('2026');
    await plantMw.fill('150');

    // Optional fields — fill every text/number field in the schema.
    await dialog.locator('#ff-plant_name').fill('Karoo Solar One');
    await dialog.locator('#ff-grid_connection_voltage_kv').fill('132');
    await dialog.locator('#ff-protection_systems_score').fill('92');
    await dialog.locator('#ff-metering_scada_score').fill('88');
    await dialog.locator('#ff-reactive_power_score').fill('90');
    await dialog.locator('#ff-frequency_response_score').fill('85');
    await dialog.locator('#ff-frt_pq_score').fill('87');
    await dialog.locator('#ff-notes').fill('Annual self-assessment FY2026');

    // #ff-project_id is an async ipp-projects lookup and is optional — leave it
    // at the default empty value (it is omitted / sent as '').

    // The submit button text equals initiation.label, identical to the +New
    // toolbar button name — so scope to the dialog AND select the type="submit"
    // button inside form.composer (the toolbar one is type="button").
    const submit = dialog.locator('form.composer button.btn.pri[type="submit"]');
    await expect(submit).toBeEnabled();

    // Assert on the network: the create POST. Filter on method === POST and a
    // path NOT containing '/ledger/lookup' so we don't match the list GET
    // (same path, GET) or the ipp-projects lookup (/api/ledger/lookup/...).
    const createResponse = page.waitForResponse(
      (r) =>
        r.url().includes('/api/ipp-annual-compliance-assessments') &&
        !r.url().includes('/ledger/lookup') &&
        r.request().method() === 'POST',
      { timeout: 25_000 },
    );

    await submit.click();

    const resp = await createResponse;
    // Handler returns c.json({ success:true, data:{ id, capacity_tier } }, 201).
    expect(resp.status()).toBe(201);
    const body = await resp.json();
    expect(body.success).toBe(true);
    expect(typeof body.data.id).toBe('string');
    expect(body.data.id).toMatch(/^ipp_acs_/);

    // On success onSubmit sets composeOpen -> false, unmounting the veil.
    // (On a thrown 4xx/5xx FieldForm shows .act-error WITHOUT closing, so
    // closure proves a real 2xx.)
    await expect(dialog).toBeHidden({ timeout: 15_000 });

    const real = errors.filter((e) => !isBenign(e));
    expect(real, real.join('\n')).toEqual([]);
  });
});
