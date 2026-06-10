// Playwright global setup — logs in as admin ONCE and stores the token in
// process.env.PLAYWRIGHT_ADMIN_TOKEN. All spec files read from this env var
// instead of each calling /api/auth/login independently, which would exhaust
// the 10-per-5-min rate-limit budget well before the 19-spec suite completes.

import { request as pwRequest } from '@playwright/test';

const PASSWORD = process.env.DEMO_PASSWORD || 'Demo@2024!';
const BASE_URL = process.env.BASE || 'https://oe.vantax.co.za';

export default async function globalSetup(): Promise<void> {
  const ctx = await pwRequest.newContext({ baseURL: BASE_URL });
  try {
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt > 0) await new Promise((r) => setTimeout(r, 20_000));
      const r = await ctx.post('/api/auth/login', {
        data: { email: 'admin@openenergy.co.za', password: PASSWORD },
        failOnStatusCode: false,
      });
      if (r.ok()) {
        const tok = (await r.json())?.data?.token;
        if (tok) {
          process.env.PLAYWRIGHT_ADMIN_TOKEN = tok;
          return;
        }
      }
      if (attempt === 2) {
        const body = await r.text().catch(() => '(unreadable)');
        throw new Error(`global admin login failed: HTTP ${r.status()} — ${body.slice(0, 200)}`);
      }
    }
  } finally {
    await ctx.dispose();
  }
}
