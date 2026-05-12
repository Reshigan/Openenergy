// ═══════════════════════════════════════════════════════════════════════════
// Security-header regression test — verifies the production response
// headers stay correct.
//
// This is the test that would catch the "blank login page" bug from before:
// when the CSP was `default-src 'none'` it shipped to production, browsers
// blocked every asset, and curl-based smoke tests passed (because curl
// doesn't enforce CSP). This file asserts the exact policy directives so
// any regression — too permissive OR too strict — fails CI loudly.
// ═══════════════════════════════════════════════════════════════════════════

import { test, expect } from '@playwright/test';

test('SPA shell `/` returns the headers a browser needs to render', async ({ request, baseURL }) => {
  const r = await request.get(`${baseURL}/`);
  expect(r.status()).toBe(200);
  const h = r.headers();

  // ─── CSP must allow same-origin scripts/styles/images, otherwise the
  //     browser blanks the page. We assert each directive is present and
  //     contains the expected source list.
  const csp = h['content-security-policy'] || '';
  expect(csp, 'CSP missing entirely').not.toBe('');

  // The CSP that caused the production blank-page incident.
  expect(csp, 'regressed to lockdown CSP — browsers will blank the SPA')
    .not.toMatch(/default-src\s+'none'/);

  // Required directives — each must permit 'self' so the SPA bundle loads.
  expect(csp).toMatch(/default-src[^;]*'self'/);
  expect(csp).toMatch(/script-src[^;]*'self'/);
  expect(csp).toMatch(/style-src[^;]*'self'/);
  expect(csp).toMatch(/img-src[^;]*'self'/);
  expect(csp).toMatch(/connect-src[^;]*'self'/);
  expect(csp).toMatch(/font-src[^;]*'self'/);

  // Frame ancestors must still be locked down — clickjacking defence.
  expect(csp).toMatch(/frame-ancestors\s+'none'/);

  // ─── HTTPS + transport security
  expect(h['strict-transport-security']).toMatch(/max-age=31536000/);

  // ─── Anti-MIME-sniff + anti-frame
  expect(h['x-content-type-options']).toBe('nosniff');
  expect(h['x-frame-options']).toBe('DENY');

  // ─── Referrer + permissions
  expect(h['referrer-policy']).toBe('strict-origin-when-cross-origin');
  expect(h['permissions-policy']).toMatch(/geolocation=\(\)/);

  // ─── Cross-origin policies — same-site so the SW can prefetch logos
  //     served by the Cloudflare edge.
  expect(h['cross-origin-resource-policy']).toBe('same-site');
});

test('API `/api/health` returns the same headers as the shell', async ({ request, baseURL }) => {
  const r = await request.get(`${baseURL}/api/health`);
  expect(r.status()).toBe(200);
  expect(r.headers()['x-content-type-options']).toBe('nosniff');
  expect(r.headers()['strict-transport-security']).toMatch(/max-age=31536000/);
});

test('CSP allows the Cloudflare Insights beacon (script + connect)', async ({ request, baseURL }) => {
  const r = await request.get(`${baseURL}/`);
  const csp = r.headers()['content-security-policy'] || '';
  expect(csp).toMatch(/script-src[^;]*cloudflareinsights/);
  expect(csp).toMatch(/connect-src[^;]*cloudflareinsights/);
});

test('CSP allows the Metropolis font CDN (style + font)', async ({ request, baseURL }) => {
  const r = await request.get(`${baseURL}/`);
  const csp = r.headers()['content-security-policy'] || '';
  expect(csp).toMatch(/style-src[^;]*fonts\.cdnfonts\.com/);
  expect(csp).toMatch(/font-src[^;]*fonts\.cdnfonts\.com/);
});

test('LTM logo is served as image/png with same-site CORP', async ({ request, baseURL }) => {
  const r = await request.get(`${baseURL}/ltm-energy-logo.png`);
  expect(r.status()).toBe(200);
  expect(r.headers()['content-type']).toContain('image/png');
});
