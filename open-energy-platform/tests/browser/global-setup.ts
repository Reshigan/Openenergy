// Playwright global setup — logs in as all 9 demo roles once and stores tokens
// in process.env.PLAYWRIGHT_{ROLE}_TOKEN. Specs read these env vars instead of
// calling /api/auth/login independently, which would exhaust the 10/5min/IP
// rate limit well before the full suite completes.
//
// 9 logins < 10/5min limit — safe in a single sequential pass.

import { request as pwRequest } from '@playwright/test';

const PASSWORD = process.env.DEMO_PASSWORD || 'Demo@2024!';
const BASE_URL = process.env.BASE || 'https://oe.vantax.co.za';

const ROLES: Array<{ email: string; envKey: string }> = [
  { email: 'admin@openenergy.co.za',     envKey: 'PLAYWRIGHT_ADMIN_TOKEN' },
  { email: 'trader@openenergy.co.za',    envKey: 'PLAYWRIGHT_TRADER_TOKEN' },
  { email: 'ipp@openenergy.co.za',       envKey: 'PLAYWRIGHT_IPP_TOKEN' },
  { email: 'offtaker@openenergy.co.za',  envKey: 'PLAYWRIGHT_OFFTAKER_TOKEN' },
  { email: 'carbon@openenergy.co.za',    envKey: 'PLAYWRIGHT_CARBON_TOKEN' },
  { email: 'lender@openenergy.co.za',    envKey: 'PLAYWRIGHT_LENDER_TOKEN' },
  { email: 'regulator@openenergy.co.za', envKey: 'PLAYWRIGHT_REGULATOR_TOKEN' },
  { email: 'grid@openenergy.co.za',      envKey: 'PLAYWRIGHT_GRID_TOKEN' },
  { email: 'support@openenergy.co.za',   envKey: 'PLAYWRIGHT_SUPPORT_TOKEN' },
];

export default async function globalSetup(): Promise<void> {
  const ctx = await pwRequest.newContext({ baseURL: BASE_URL });
  try {
    for (const { email, envKey } of ROLES) {
      try {
        const r = await ctx.post('/api/auth/login', {
          data: { email, password: PASSWORD },
          failOnStatusCode: false,
        });
        if (r.ok()) {
          const tok = (await r.json())?.data?.token;
          if (tok) process.env[envKey] = tok;
        }
        // Non-ok (rate-limit, 500) — spec falls back to fake token for that role.
      } catch {
        // Network error — spec falls back to fake token for that role.
      }
    }
  } finally {
    await ctx.dispose();
  }
}
