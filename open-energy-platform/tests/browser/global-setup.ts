// Playwright global setup — logs in as admin ONCE and stores the token in
// process.env.PLAYWRIGHT_ADMIN_TOKEN. All spec files read from this env var
// instead of each calling /api/auth/login independently, which would exhaust
// the 10-per-5-min rate-limit budget well before the 19-spec suite completes.

import { request as pwRequest } from '@playwright/test';

const PASSWORD = process.env.DEMO_PASSWORD || 'Demo@2024!';
const BASE_URL = process.env.BASE || 'https://oe.vantax.co.za';

export default async function globalSetup(): Promise<void> {
  // Best-effort: try to get a real admin token to store in PLAYWRIGHT_ADMIN_TOKEN.
  // If login fails (rate-limited, server not ready, wrong creds), we swallow the
  // error and let individual test specs fall back to fake tokens — auth routes are
  // mocked via page.route() anyway, so tests stay green without real tokens.
  const ctx = await pwRequest.newContext({ baseURL: BASE_URL });
  try {
    const r = await ctx.post('/api/auth/login', {
      data: { email: 'admin@openenergy.co.za', password: PASSWORD },
      failOnStatusCode: false,
    });
    if (r.ok()) {
      const tok = (await r.json())?.data?.token;
      if (tok) process.env.PLAYWRIGHT_ADMIN_TOKEN = tok;
    }
    // Non-ok responses (rate-limit, 404, 500) are silently ignored.
    // Tests will use fake per-role tokens instead.
  } catch {
    // Network error or server not up — tests proceed with fake tokens.
  } finally {
    await ctx.dispose();
  }
}
